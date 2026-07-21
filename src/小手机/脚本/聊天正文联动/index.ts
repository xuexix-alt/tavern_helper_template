// ==================== 聊天正文联动 (ChatSync) ====================
// 手机聊天摘要 → ChatLore 世界书回写
// 500ms 防抖 → 生成摘要 → 写入聊天世界书常驻条目
// 导出到 window.parent.ChatSync

$(() => {
  const DEBOUNCE_MS = 500;
  const MAX_SUMMARY_LENGTH = 800;
  const MAX_MSG_LENGTH = 80;
  const PRIVATE_RECENT_COUNT = 8;
  const GROUP_RECENT_COUNT = 10;

  // 防抖计时器
  const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ==================== 摘要生成 ====================

  async function buildSummary(
    conversationId: string,
  ): Promise<{ entryName: string; summary: string; messageIds: number[] } | null> {
    try {
      const ChatDB = (window.parent as any).ChatDB;
      if (!ChatDB) {
        console.warn('[ChatSync] ChatDB 未初始化');
        return null;
      }

      const conv = await ChatDB.getConversation(conversationId);
      if (!conv) {
        console.warn('[ChatSync] 会话不存在:', conversationId);
        return null;
      }

      const count = conv.type === 'private' ? PRIVATE_RECENT_COUNT : GROUP_RECENT_COUNT;
      const messages = await ChatDB.getRecentMessages(conversationId, count + 20); // 多取一些确保覆盖

      // 过滤出未同步的消息
      const unsynced = messages.filter((m: any) => !m.syncedToLore);
      if (unsynced.length === 0) return null;

      const recent = messages.slice(-count);
      const entryName = conv.type === 'private' ? `[租客微信]${conv.members[0]}` : '[租客微信]群聊记录';

      const summary = recent
        .map((msg: any) => {
          const sender = msg.sender === '<user>' ? '房东' : msg.sender;
          const timeStr = msg.gameTime?.时间 ? `[${msg.gameTime.时间}]` : '';
          const text =
            (msg.content as string).length > MAX_MSG_LENGTH
              ? (msg.content as string).substring(0, MAX_MSG_LENGTH) + '…'
              : msg.content;
          return `${timeStr} ${sender}: ${text}`;
        })
        .join('\n')
        .substring(0, MAX_SUMMARY_LENGTH);

      const messageIds = recent.map((m: any) => m.id).filter(Boolean);

      return { entryName, summary, messageIds };
    } catch (e) {
      console.error('[ChatSync] 构建摘要失败:', e);
      return null;
    }
  }

  // ==================== ChatLore 回写 ====================

  async function syncToChatLore(conversationId: string): Promise<boolean> {
    try {
      const result = await buildSummary(conversationId);
      if (!result) return false;

      const { entryName, summary, messageIds } = result;

      // 方式1：通过 updateWorldbookWith 更新 ChatLore（主路径）
      let success = false;
      try {
        const worldbookName = await (window.parent as any).getOrCreateChatWorldbook('current');
        await (window.parent as any).updateWorldbookWith(
          worldbookName,
          (entries: any[]) => {
            // 查找同名条目
            const existing = entries.find((e: any) => e.name === entryName);
            if (existing) {
              // 更新内容
              return entries.map((e: any) => (e.name === entryName ? { ...e, content: summary, enabled: true } : e));
            } else {
              // 创建新条目
              const newEntry: any = {
                name: entryName,
                enabled: true,
                content: summary,
                strategy: {
                  type: 'constant',
                  keys: [entryName, '微信', '聊天记录'],
                  keys_secondary: { logic: 'and_any', keys: [] },
                  scan_depth: 'same_as_global' as any,
                },
                position: { type: 'at_depth' as any, role: 'system', depth: 4, order: 100 },
                probability: 100,
                recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
                effect: { sticky: null, cooldown: null, delay: null },
              };
              return [...entries, newEntry];
            }
          },
          { render: 'immediate' },
        );
        success = true;
        console.log('[ChatSync] ✅ ChatLore 条目已更新:', entryName);
      } catch (err1) {
        console.warn('[ChatSync] updateWorldbookWith 失败，尝试备用路径:', err1);

        // 方式2：备用 — /createentry 命令
        try {
          if (typeof (window.parent as any).SillyTavern?.executeSlashCommandsWithOptions === 'function') {
            await (window.parent as any).SillyTavern.executeSlashCommandsWithOptions(
              `/createentry file=chatLore key=${entryName} ${summary}`,
            );
            success = true;
            console.log('[ChatSync] ✅ 通过 /createentry 写入 ChatLore');
          }
        } catch (err2) {
          console.warn('[ChatSync] /createentry 也失败:', err2);

          // 方式3：最后回退 — 写聊天变量（但不会自动进入正文）
          try {
            (window.parent as any).updateVariablesWith(
              (vars: any) => {
                const varKey = entryName.replace(/[\[\]]/g, '').replace(/[^\w一-鿿]/g, '_');
                vars[`wechat_${varKey}`] = summary;
                return vars;
              },
              { type: 'chat' },
            );
            console.log('[ChatSync] ⚠️ 已回退到聊天变量（不会自动进入正文）');
          } catch {
            /* 完全失败 */
          }
        }
      }

      // 标记为已同步
      if (success && messageIds.length > 0) {
        try {
          const ChatDB = (window.parent as any).ChatDB;
          if (ChatDB) await ChatDB.markSyncedToLore(messageIds);
        } catch {
          /* 标记失败不影响主流程 */
        }
      }

      return success;
    } catch (e) {
      console.error('[ChatSync] syncToChatLore 失败:', e);
      return false;
    }
  }

  // ==================== 防抖入口 ====================

  function instantSync(conversationId: string): void {
    if (syncTimers.has(conversationId)) {
      clearTimeout(syncTimers.get(conversationId));
    }

    syncTimers.set(
      conversationId,
      setTimeout(async () => {
        syncTimers.delete(conversationId);
        await syncToChatLore(conversationId);
      }, DEBOUNCE_MS),
    );
  }

  // ==================== 手动注入正文 ====================

  async function injectToInput(conversationId: string, topic?: string): Promise<void> {
    try {
      const result = await buildSummary(conversationId);
      if (!result) {
        console.warn('[ChatSync] 无摘要可注入');
        return;
      }

      const topicText = topic ? `关于${topic}` : '';
      const injectText = `你想起刚才在微信上${topicText}的聊天内容：\n${result.summary}`;

      try {
        const $textarea = $('#send_textarea');
        if ($textarea.length > 0) {
          $textarea.val($textarea.val() + '\n' + injectText);
          console.log('[ChatSync] ✅ 摘要已注入到输入框');
        }
      } catch {
        console.warn('[ChatSync] 注入输入框失败');
      }
    } catch (e) {
      console.error('[ChatSync] injectToInput 失败:', e);
    }
  }

  // ==================== 导出到全局 ====================

  const ChatSync = {
    syncToChatLore,
    instantSync,
    injectToInput,
    buildSummary,
  };

  (window.parent as any).ChatSync = ChatSync;

  if (typeof (window as any).initializeGlobal === 'function') {
    (window as any).initializeGlobal('ChatSync', ChatSync);
  }

  console.log('✅ [聊天正文联动] ChatSync 已加载 → window.parent.ChatSync');
});

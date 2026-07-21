// ==================== 聊天APP ====================
// 注册到 PhoneSystem 手机桌面，通过 renderer 契约渲染聊天界面
// 使用 PhoneSystem.registerRenderer() 提供渲染函数，不再自行查找 iframe

import type { VNode } from 'vue';

$(() => {
  let disposed = false;

  // ==================== 聊天界面渲染器 ====================

  function createChatRenderer(h: any, vueRuntime: any) {
    return {
      setup() {
        const store = vueRuntime.reactive({
          conversations: [] as any[],
          activeConvId: null as string | null,
          messages: [] as any[],
          isGenerating: false,
          inputText: '',
          activeConv: null as any,
          showCreateModal: false,
          createMode: null as 'private' | 'group' | null,
          candidateNames: [] as string[],
          selectedNames: [] as string[],
          groupName: '',
          createError: '',
          isLoadingCandidates: false,
        });

        const loadConversations = async () => {
          try {
            const ChatDB = (window.parent as any).ChatDB;
            if (ChatDB) {
              const convs = await ChatDB.getConversations();
              store.conversations.length = 0;
              store.conversations.push(...convs);
            }
          } catch (e) {
            console.warn('[聊天APP] 加载会话失败:', e);
          }
        };

        const loadMessages = async (convId: string) => {
          try {
            const ChatDB = (window.parent as any).ChatDB;
            if (ChatDB) {
              const msgs = await ChatDB.getRecentMessages(convId, 50);
              store.messages.length = 0;
              store.messages.push(...msgs);
            }
          } catch (e) {
            console.warn('[聊天APP] 加载消息失败:', e);
          }
        };

        const openConversation = async (conv: any) => {
          store.activeConvId = conv.id;
          store.activeConv = conv;
          await loadMessages(conv.id);
          scrollChatBottom();
        };

        const goBack = () => {
          store.activeConvId = null;
          store.activeConv = null;
          store.messages.length = 0;
        };

        const scrollChatBottom = () => {
          setTimeout(() => {
            const el = document.getElementById('phone-chat-msgs');
            if (el) el.scrollTop = el.scrollHeight;
          }, 80);
        };

        const sendMessage = async () => {
          const text = store.inputText.trim();
          if (!text || store.isGenerating) return;
          store.inputText = '';
          store.isGenerating = true;

          try {
            const ChatCore = (window.parent as any).ChatCore;
            const ChatDB = (window.parent as any).ChatDB;
            const conv = store.activeConv;
            if (!ChatCore || !ChatDB || !conv) {
              store.isGenerating = false;
              return;
            }

            const userMsg = await ChatDB.addMessage(conv.id, '<user>', text);
            store.messages.push(userMsg);
            scrollChatBottom();

            let replies: any[];
            if (conv.type === 'group') {
              replies = await ChatCore.generateGroupReply(conv.id, text);
            } else {
              replies = await ChatCore.generatePrivateReply(conv.id, text);
            }
            if (replies) {
              for (const r of replies) store.messages.push(r);
            }

            const ChatSync = (window.parent as any).ChatSync;
            if (ChatSync) ChatSync.instantSync(conv.id);
          } catch (e: any) {
            if (e.message !== 'AbortError') {
              store.messages.push({
                sender: '<system>',
                content: '❌ 发送失败: ' + (e.message || '未知'),
                gameTime: null,
                syncedToLore: true,
              });
            }
          } finally {
            store.isGenerating = false;
            scrollChatBottom();
          }
        };

        // ==================== 新建会话相关 ====================

        const openCreateModal = async () => {
          console.log('[聊天APP] ➕ 按钮被点击');
          store.showCreateModal = true;
          store.createMode = null;
          store.selectedNames = [];
          store.groupName = '';
          store.createError = '';
          console.log('[聊天APP] 开始加载候选人物...');
          await loadCandidateNames();
          console.log('[聊天APP] 候选加载完成，showCreateModal =', store.showCreateModal);
        };

        const closeCreateModal = () => {
          store.showCreateModal = false;
          store.createMode = null;
          store.selectedNames = [];
          store.groupName = '';
          store.createError = '';
          store.candidateNames = [];
        };

        const loadCandidateNames = async () => {
          store.isLoadingCandidates = true;
          store.createError = '';
          try {
            // 方法1：尝试从 Mvu 直接读取
            let parsed: any;
            try {
              const Mvu = (window.parent as any).Mvu;
              if (Mvu?.getMvuData) {
                const mvuData = Mvu.getMvuData({ type: 'message', message_id: -1 });
                parsed = mvuData?.stat_data;
              }
            } catch {
              // Mvu 读取失败，尝试宏展开
            }

            // 方法2：如果 MVU 失败，尝试宏展开
            if (!parsed) {
              const macroText = '{{format_message_variable::stat_data}}';
              const expanded = (window.parent as any).substitudeMacros?.(macroText) || '';
              const trimmed = expanded.trim();

              if (!trimmed || trimmed.includes('{{format_message_variable::stat_data}}')) {
                store.createError = '宏未展开：stat_data 不可用';
                store.candidateNames = [];
                return;
              }

              // 移除可能的代码围栏
              let cleaned = trimmed;
              const fenceMatch = cleaned.match(/^\s*```(?:ya?ml|json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
              if (fenceMatch) cleaned = fenceMatch[1];

              // 解析为对象
              try {
                const yaml = await import('yaml');
                parsed = yaml.parse(cleaned);
              } catch {
                store.createError = '解析失败：stat_data 格式错误';
                store.candidateNames = [];
                return;
              }
            }

            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              store.createError = 'stat_data 不是对象';
              store.candidateNames = [];
              return;
            }

            // 过滤候选：只保留有 "姓名" 字段的对象（排除 世界、庇护所 等系统键）
            const names = Object.keys(parsed)
              .filter(key => {
                const value = parsed[key];
                // 必须是对象且有 "姓名" 字段
                return value && typeof value === 'object' && !Array.isArray(value) && value.姓名;
              })
              .map(k => String(k).trim())
              .filter(Boolean);

            // 去重
            const unique = Array.from(new Set(names));

            if (unique.length === 0) {
              store.createError = '未找到可用角色（需要有"姓名"字段）';
              store.candidateNames = [];
              return;
            }

            store.candidateNames = unique;
          } catch (e: any) {
            store.createError = '数据源错误: ' + (e.message || '未知');
            store.candidateNames = [];
          } finally {
            store.isLoadingCandidates = false;
          }
        };

        const toggleNameSelection = (name: string) => {
          const idx = store.selectedNames.indexOf(name);
          if (idx === -1) {
            if (store.createMode === 'private') {
              store.selectedNames = [name];
            } else {
              store.selectedNames.push(name);
            }
          } else {
            store.selectedNames.splice(idx, 1);
          }
        };

        const confirmCreate = async () => {
          store.createError = '';
          const ChatDB = (window.parent as any).ChatDB;
          if (!ChatDB) {
            store.createError = 'ChatDB 未就绪';
            return;
          }

          if (store.createMode === 'private') {
            if (store.selectedNames.length !== 1) {
              store.createError = '请选择一个角色';
              return;
            }

            const name = store.selectedNames[0];
            try {
              // 查重
              const existing = await ChatDB.getConversations();
              const found = existing.find((c: any) => c.type === 'private' && c.members[0] === name);
              if (found) {
                closeCreateModal();
                await openConversation(found);
                return;
              }

              // 创建新会话
              const conv = await ChatDB.createConversation({ type: 'private', members: [name], name });
              await loadConversations();
              closeCreateModal();
              await openConversation(conv);
            } catch (e: any) {
              store.createError = '创建失败: ' + (e.message || '未知');
            }
          } else if (store.createMode === 'group') {
            if (store.selectedNames.length < 2) {
              store.createError = '群聊至少需要两名成员';
              return;
            }

            let finalName = store.groupName.trim();
            if (!finalName) {
              finalName = store.selectedNames.join('、');
            }

            try {
              const conv = await ChatDB.createConversation({
                type: 'group',
                members: store.selectedNames,
                name: finalName,
              });
              await loadConversations();
              closeCreateModal();
              await openConversation(conv);
            } catch (e: any) {
              store.createError = '创建失败: ' + (e.message || '未知');
            }
          }
        };

        vueRuntime.onMounted(() => {
          loadConversations();
        });

        return () => {
          // 新建会话弹窗
          console.log('[聊天APP] render 被调用，showCreateModal =', store.showCreateModal);
          const modalVNode = store.showCreateModal
            ? h(
                'div',
                {
                  style:
                    'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;',
                  onClick: (e: any) => {
                    if (e.target === e.currentTarget) closeCreateModal();
                  },
                },
                [
                  h(
                    'div',
                    {
                      style:
                        'background:#fff;border-radius:12px;width:90%;max-width:280px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,0.3);',
                      onClick: (e: any) => e.stopPropagation(),
                    },
                    [
                      h('div', { style: 'font-size:15px;font-weight:600;margin-bottom:12px;text-align:center;' }, [
                        store.createMode ? (store.createMode === 'private' ? '新建私聊' : '新建群聊') : '选择类型',
                      ]),

                      // 选择类型
                      !store.createMode
                        ? h('div', { style: 'display:flex;flex-direction:column;gap:10px;' }, [
                            h(
                              'button',
                              {
                                onClick: () => {
                                  store.createMode = 'private';
                                },
                                style:
                                  'padding:12px;border-radius:8px;border:none;background:#07c160;color:#fff;font-size:14px;font-weight:600;cursor:pointer;',
                              },
                              '👤 私聊',
                            ),
                            h(
                              'button',
                              {
                                onClick: () => {
                                  store.createMode = 'group';
                                },
                                style:
                                  'padding:12px;border-radius:8px;border:none;background:#07c160;color:#fff;font-size:14px;font-weight:600;cursor:pointer;',
                              },
                              '👥 群聊',
                            ),
                            h(
                              'button',
                              {
                                onClick: closeCreateModal,
                                style:
                                  'padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#666;font-size:13px;cursor:pointer;',
                              },
                              '取消',
                            ),
                          ])
                        : null,

                      // 选择姓名
                      store.createMode
                        ? h('div', [
                            store.isLoadingCandidates
                              ? h(
                                  'div',
                                  { style: 'text-align:center;padding:20px;color:#999;font-size:13px;' },
                                  '加载中...',
                                )
                              : store.candidateNames.length === 0
                                ? h('div', { style: 'padding:12px;color:#f56c6c;font-size:12px;text-align:center;' }, [
                                    store.createError || '无可用角色',
                                  ])
                                : h('div', { style: 'max-height:200px;overflow-y:auto;margin-bottom:10px;' }, [
                                    ...store.candidateNames.map((name: string) =>
                                      h(
                                        'div',
                                        {
                                          key: name,
                                          onClick: () => toggleNameSelection(name),
                                          style: `padding:10px;margin:4px 0;border-radius:6px;cursor:pointer;font-size:13px;background:${store.selectedNames.includes(name) ? '#d4edda' : '#f5f5f5'};border:1px solid ${store.selectedNames.includes(name) ? '#28a745' : '#ddd'};`,
                                        },
                                        [
                                          store.selectedNames.includes(name) ? '✓ ' : '',
                                          name,
                                          store.createMode === 'private' && store.selectedNames.includes(name)
                                            ? ' (已选)'
                                            : '',
                                        ],
                                      ),
                                    ),
                                  ]),

                            // 群聊群名输入
                            store.createMode === 'group'
                              ? h('input', {
                                  value: store.groupName,
                                  onInput: (e: any) => {
                                    store.groupName = e.target.value;
                                  },
                                  placeholder: '群名（可选，默认为成员名）',
                                  style:
                                    'width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;font-size:12px;margin-bottom:10px;box-sizing:border-box;',
                                })
                              : null,

                            store.createError && !store.isLoadingCandidates
                              ? h(
                                  'div',
                                  {
                                    style:
                                      'padding:8px;margin-bottom:8px;background:#ffe0e0;border-radius:6px;font-size:11px;color:#c00;',
                                  },
                                  store.createError,
                                )
                              : null,

                            h('div', { style: 'display:flex;gap:8px;' }, [
                              h(
                                'button',
                                {
                                  onClick: confirmCreate,
                                  disabled:
                                    store.isLoadingCandidates ||
                                    store.selectedNames.length === 0 ||
                                    (store.createMode === 'group' && store.selectedNames.length < 2),
                                  style: `flex:1;padding:10px;border-radius:8px;border:none;background:#07c160;color:#fff;font-size:13px;font-weight:600;cursor:pointer;opacity:${store.isLoadingCandidates || store.selectedNames.length === 0 || (store.createMode === 'group' && store.selectedNames.length < 2) ? 0.5 : 1};`,
                                },
                                '确定',
                              ),
                              h(
                                'button',
                                {
                                  onClick: closeCreateModal,
                                  style:
                                    'flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#666;font-size:13px;cursor:pointer;',
                                },
                                '取消',
                              ),
                            ]),
                          ])
                        : null,
                    ],
                  ),
                ],
              )
            : null;

          // 会话列表视图
          if (!store.activeConvId) {
            return h(
              'div',
              {
                style:
                  'width:100%;height:100%;display:flex;flex-direction:column;background:#ededed;color:#000;font-family:"Microsoft YaHei",sans-serif;overflow:hidden;position:relative;',
              },
              [
                h(
                  'div',
                  {
                    style:
                      'padding:10px 14px;font-size:14px;font-weight:600;color:#333;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ddd;flex-shrink:0;',
                  },
                  [
                    h('span', '💬 聊天'),
                    h('div', { style: 'display:flex;gap:12px;align-items:center;' }, [
                      h(
                        'span',
                        { onClick: openCreateModal, style: 'font-size:18px;color:#07c160;cursor:pointer;' },
                        '＋',
                      ),
                      h(
                        'span',
                        { onClick: loadConversations, style: 'font-size:12px;color:#07c160;cursor:pointer;' },
                        '🔄',
                      ),
                    ]),
                  ],
                ),
                h(
                  'div',
                  { style: 'flex:1;overflow-y:auto;padding:8px;' },
                  store.conversations.length === 0
                    ? [
                        h('div', { style: 'text-align:center;padding:30px 20px;color:#999;' }, [
                          h('div', { style: 'font-size:40px;margin-bottom:10px;' }, '💬'),
                          h('p', { style: 'font-size:13px;margin-bottom:4px;' }, '暂无聊天记录'),
                          h('p', { style: 'font-size:11px;margin-bottom:16px;color:#bbb;' }, '点击右上角 ＋ 新建会话'),
                        ]),
                      ]
                    : store.conversations.map((conv: any) =>
                        h(
                          'div',
                          {
                            key: conv.id,
                            onClick: () => openConversation(conv),
                            style:
                              'display:flex;align-items:center;gap:10px;padding:12px;margin:4px 0;background:#fff;border-radius:8px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.05);',
                          },
                          [
                            h(
                              'div',
                              {
                                style:
                                  'width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#07c160,#00a650);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;flex-shrink:0;',
                              },
                              conv.type === 'group' ? '👥' : '👤',
                            ),
                            h('div', { style: 'flex:1;min-width:0;' }, [
                              h(
                                'div',
                                {
                                  style:
                                    'font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
                                },
                                conv.name || (conv.type === 'private' ? conv.members?.[0] : '群聊'),
                              ),
                              h(
                                'div',
                                { style: 'font-size:11px;color:#999;' },
                                conv.type === 'group' ? (conv.members?.length || 0) + '人' : '私聊',
                              ),
                            ]),
                          ],
                        ),
                      ),
                ),
                modalVNode,
              ],
            );
          }

          // 聊天视图
          const conv = store.activeConv;
          return h(
            'div',
            {
              style:
                'width:100%;height:100%;display:flex;flex-direction:column;background:#ededed;color:#000;font-family:"Microsoft YaHei",sans-serif;overflow:hidden;',
            },
            [
              h(
                'div',
                {
                  style:
                    'padding:8px 12px;background:#f0f0f0;display:flex;align-items:center;gap:8px;border-bottom:1px solid #ddd;flex-shrink:0;',
                },
                [
                  h('span', { onClick: goBack, style: 'cursor:pointer;font-size:16px;' }, '←'),
                  h('span', { style: 'font-weight:600;font-size:14px;' }, conv?.name || conv?.members?.[0] || '聊天'),
                ],
              ),
              h(
                'div',
                {
                  id: 'phone-chat-msgs',
                  style: 'flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px;',
                },
                [
                  ...store.messages.map((msg: any, i: number) => {
                    const isMe = msg.sender === '<user>';
                    const isSys = msg.sender === '<system>';
                    return h(
                      'div',
                      {
                        key: msg.id || i,
                        style: `display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};`,
                      },
                      [
                        !isMe && !isSys
                          ? h(
                              'div',
                              { style: 'font-size:10px;color:#888;margin-bottom:1px;padding:0 4px;' },
                              msg.sender,
                            )
                          : null,
                        h(
                          'div',
                          {
                            style: `max-width:78%;padding:7px 10px;border-radius:8px;font-size:13px;line-height:1.5;word-break:break-word;background:${isMe ? '#95ec69' : isSys ? '#ffe0e0' : '#fff'};color:#000;box-shadow:0 1px 2px rgba(0,0,0,0.04);`,
                          },
                          msg.content,
                        ),
                        msg.gameTime?.时间
                          ? h(
                              'div',
                              { style: 'font-size:9px;color:#bbb;margin-top:1px;padding:0 2px;' },
                              msg.gameTime.时间,
                            )
                          : null,
                      ].filter(Boolean),
                    );
                  }),
                  store.isGenerating
                    ? h(
                        'div',
                        { style: 'text-align:center;color:#999;font-size:12px;padding:8px;' },
                        '⏳ 对方正在输入...',
                      )
                    : null,
                ],
              ),
              h(
                'div',
                {
                  style:
                    'padding:6px 8px;background:#f7f7f7;display:flex;gap:6px;border-top:1px solid #ddd;flex-shrink:0;',
                },
                [
                  h('input', {
                    value: store.inputText,
                    onInput: (e: any) => {
                      store.inputText = e.target.value;
                    },
                    onKeydown: (e: any) => {
                      if (e.key === 'Enter') sendMessage();
                    },
                    placeholder: '输入消息…',
                    style:
                      'flex:1;padding:8px 10px;border-radius:6px;border:1px solid #ddd;font-size:13px;outline:none;min-width:0;',
                  }),
                  h(
                    'button',
                    {
                      onClick: sendMessage,
                      disabled: store.isGenerating || !store.inputText.trim(),
                      style: `padding:8px 14px;border-radius:6px;border:none;background:#07c160;color:#fff;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;opacity:${store.isGenerating || !store.inputText.trim() ? 0.5 : 1};`,
                    },
                    '发送',
                  ),
                ],
              ),
            ],
          );
        };
      },
    };
  }

  // ==================== 注册到 PhoneSystem ====================

  async function registerToPhoneSystem(): Promise<void> {
    // 轮询等待 PhoneSystem 就绪
    const PS: any = await new Promise(resolve => {
      const check = () => {
        if (disposed) return;
        const ps = (window.parent as any).PhoneSystem;
        if (ps) resolve(ps);
        else setTimeout(check, 300);
      };
      check();
    });

    if (disposed) return;

    console.log('[聊天APP] PhoneSystem 已就绪，注册...');

    // 注册 APP 元数据到桌面
    PS.registerApp({
      id: 'chat-app',
      name: '微信',
      icon: '💬',
      color: '#07c160',
      order: 1,
    });

    // 注册 renderer（通过稳定契约渲染）
    PS.registerRenderer('chat-app', ({ container, vue }: any) => {
      if (disposed) return;

      console.log('[聊天APP] renderer 被调用，开始挂载...');

      const app = vue.createApp(createChatRenderer(vue.h, vue));
      app.mount(container);

      console.log('[聊天APP] ✅ 聊天界面已挂载');

      // 返回 cleanup 函数
      return () => {
        try {
          app.unmount();
          console.log('[聊天APP] 已卸载 Vue 实例');
        } catch (e) {
          console.warn('[聊天APP] unmount 失败:', e);
        }
      };
    });

    console.log('[聊天APP] ✅ 已注册 renderer 到 PhoneSystem');
  }

  registerToPhoneSystem();

  // ==================== 脚本卸载清理 ====================
  $(window).on('pagehide', () => {
    disposed = true;
    const PS = (window.parent as any).PhoneSystem;
    if (PS?.unregisterRenderer) {
      PS.unregisterRenderer('chat-app');
      console.log('[聊天APP] 已反注册 renderer');
    }
  });

  console.log('✅ [聊天APP] 已加载，等待 PhoneSystem...');
});

import { buildEdenAnchors, projectEdenToMvu, type EdenContext, type EdenDocument } from './model';
import { loadEdenDocument, refreshEdenEntries, type EdenWorldbookDeps, type SavedEden } from './worldbook';

export const EDEN_MANAGED_FLAG = 'eden.worldbookManaged';
export const EDEN_SAVED_EVENT = 'eden_worldbook_saved';

export function currentEdenChatId(): string {
  return String(SillyTavern.getCurrentChatId() ?? '');
}

export function getEdenHostDeps(): EdenWorldbookDeps {
  return {
    currentChatId: currentEdenChatId,
    boundWorldbook: () => getChatWorldbookName('current'),
    ensureWorldbook: () => getOrCreateChatWorldbook('current'),
    read: name => getWorldbook(name),
    update: (name, updater) => {
      // 脚本和pre位于不同iframe，使用宿主队列避免同一本伊甸文档同时确认覆盖。
      const host = window.top as Window & { __edenWorldbookQueue?: Promise<unknown> };
      const run = () => updateWorldbookWith(name, updater, { render: 'debounced' });
      const result = (host.__edenWorldbookQueue ?? Promise.resolve()).then(run, run);
      host.__edenWorldbookQueue = result.catch(() => undefined);
      return result;
    },
  };
}

export function isEdenWorldbookManaged(): boolean {
  return _.get(getVariables({ type: 'chat' }), EDEN_MANAGED_FLAG, false) === true;
}

export function markEdenWorldbookManaged(chatId: string): void {
  if (currentEdenChatId() !== chatId) throw new Error('当前聊天已切换，已终止伊甸状态同步');
  updateVariablesWith(
    vars => {
      _.set(vars, EDEN_MANAGED_FLAG, true);
      return vars;
    },
    { type: 'chat' },
  );
}

/** 优先读取当前保留楼层；重生删掉旧回复后不会复用被撤销的 latest 缓存。 */
export function readEdenSnapshot(): { context: EdenContext; statData: Record<string, any>; messageId: number | null } {
  const lastId = getLastMessageId();
  if (lastId >= 0) {
    const messages = getChatMessages(`0-${lastId}`, { include_swipes: false }) as ChatMessage[];
    const anchors = buildEdenAnchors(messages);
    for (const message of [...messages].reverse()) {
      const statData = message.data?.stat_data;
      if (!statData || typeof statData !== 'object') continue;
      const rawDay = statData.世界?.末日天数;
      const day = typeof rawDay === 'number' && Number.isFinite(rawDay) ? rawDay : null;
      return {
        context: { day, messageId: lastId, anchors, knownIntel: statData.主线任务?.情报碎片 ?? {} },
        statData,
        messageId: message.message_id,
      };
    }
  }
  return { context: { day: null, messageId: Math.max(0, lastId), anchors: {} }, statData: {}, messageId: null };
}

export function readEdenContext(): EdenContext {
  return readEdenSnapshot().context;
}

export async function loadCurrentEden(): Promise<SavedEden | null> {
  const chatId = currentEdenChatId();
  if (!chatId) return null;
  return loadEdenDocument(chatId, getEdenHostDeps());
}

export async function projectSavedEden(document: EdenDocument, chatId: string): Promise<void> {
  await waitGlobalInitialized('Mvu');
  if (currentEdenChatId() !== chatId) throw new Error('当前聊天已切换，已终止伊甸状态同步');
  const snapshot = readEdenSnapshot();
  if (snapshot.messageId === null) return;
  const data = Mvu.getMvuData({ type: 'message', message_id: snapshot.messageId });
  projectEdenToMvu(document, snapshot.context, data.stat_data);
  await Mvu.replaceMvuData(data, { type: 'message', message_id: snapshot.messageId });
  if (currentEdenChatId() !== chatId) throw new Error('当前聊天已切换，已终止伊甸状态同步');
}

export async function notifyEdenSaved(saved: SavedEden, chatId: string): Promise<void> {
  markEdenWorldbookManaged(chatId);
  await eventEmit(EDEN_SAVED_EVENT, chatId);
  await projectSavedEden(saved.document, chatId);
}

/** 每次生成仅刷新已确认条目，绝不把草稿或旧MVU能力反向写回世界书。 */
export async function prepareEdenGeneration(): Promise<void> {
  const chatId = currentEdenChatId();
  if (!chatId) return;
  const saved = await refreshEdenEntries(chatId, readEdenContext(), getEdenHostDeps());
  if (!saved) {
    if (isEdenWorldbookManaged())
      throw new Error('已启用伊甸世界书模式，但正式设定缺失；请在系统面板重新载入或确认保存');
    return;
  }
  markEdenWorldbookManaged(chatId);
  await projectSavedEden(saved.document, chatId);
}

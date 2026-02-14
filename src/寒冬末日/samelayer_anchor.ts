const ANCHOR_STORAGE_KEY = 'eden:samelayer:anchor_message_id';

function normalizeAnchorCandidate(raw: unknown): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function readContext(): any {
  try {
    return (window as any).SillyTavern?.getContext?.() ?? null;
  } catch {
    return null;
  }
}

function isAssistantMessageLike(value: any): boolean {
  return value?.is_user !== true && value?.is_system !== true;
}

function readAssistantIdsFromContext(): number[] {
  const ctx = readContext();
  if (!Array.isArray(ctx?.chat)) return [];

  const ids: number[] = [];
  for (let i = 0; i < ctx.chat.length; i++) {
    if (isAssistantMessageLike(ctx.chat[i])) ids.push(i);
  }
  return ids;
}

function readAssistantIdsFromDom(): number[] {
  const ids = new Set<number>();
  $('#chat > .mes[is_user="false"][is_system="false"]').each((_idx, el) => {
    const message_id = Number($(el).attr('mesid'));
    if (Number.isFinite(message_id)) ids.add(message_id);
  });
  return [...ids].sort((a, b) => a - b);
}

function readPreferredAnchorId(): number | null {
  try {
    const fromWindow = normalizeAnchorCandidate((window as any).__EDEN_SAMELAYER_ANCHOR_ID);
    if (fromWindow != null) return fromWindow;
  } catch {
    // ignore
  }

  try {
    const fromStorage = normalizeAnchorCandidate(localStorage.getItem(ANCHOR_STORAGE_KEY));
    if (fromStorage != null) return fromStorage;
  } catch {
    // ignore
  }

  return null;
}

export function listAssistantMessageIds(): number[] {
  const byContext = readAssistantIdsFromContext();
  if (byContext.length > 0) return byContext;
  return readAssistantIdsFromDom();
}

export function resolveSameLayerAnchorMessageId(): number | null {
  const ids = listAssistantMessageIds();
  if (ids.length === 0) return null;

  const preferred = readPreferredAnchorId();
  if (preferred != null && ids.includes(preferred)) return preferred;
  // 默认锚点改为“最新助手楼层”，避免与变量重处理的最新楼层语义错位。
  return ids[ids.length - 1] ?? null;
}

export function resolveSameLayerLatestAssistantMessageId(): number | null {
  const ids = listAssistantMessageIds();
  if (ids.length === 0) return null;
  return ids[ids.length - 1] ?? null;
}

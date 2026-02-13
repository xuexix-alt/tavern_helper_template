const ANCHOR_STORAGE_KEY = 'eden:samelayer:anchor_message_id';

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
    const fromWindow = Number((window as any).__EDEN_SAMELAYER_ANCHOR_ID);
    if (Number.isFinite(fromWindow)) return fromWindow;
  } catch {
    // ignore
  }

  try {
    const fromStorage = Number(localStorage.getItem(ANCHOR_STORAGE_KEY));
    if (Number.isFinite(fromStorage)) return fromStorage;
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

  if (ids.includes(0)) return 0;
  return ids[0] ?? null;
}

export function resolveSameLayerLatestAssistantMessageId(): number | null {
  const ids = listAssistantMessageIds();
  if (ids.length === 0) return null;
  return ids[ids.length - 1] ?? null;
}

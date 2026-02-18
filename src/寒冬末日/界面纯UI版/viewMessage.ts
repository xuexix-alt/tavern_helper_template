export type ViewMessageMode = 'latest' | 'history';

export type ViewMessageState = {
  mode: ViewMessageMode;
  message_id: number | null;
  changed_at: number;
  source?: string;
};

export type ResolveViewMessageIdOptions = {
  preferHistory?: boolean;
};

const VIEW_MESSAGE_CHANGED_EVENT = 'eden:view-message:changed';

let viewMessageState: ViewMessageState = {
  mode: 'latest',
  message_id: null,
  changed_at: Date.now(),
  source: 'init',
};

function normalizeMessageId(input: unknown): number | null {
  const id = Number(input);
  if (!Number.isFinite(id)) return null;
  if (id < 0) return null;
  return Math.trunc(id);
}

function emitViewMessageChanged() {
  try {
    window.dispatchEvent(
      new CustomEvent<ViewMessageState>(VIEW_MESSAGE_CHANGED_EVENT, {
        detail: { ...viewMessageState },
      }),
    );
  } catch {
    // ignore
  }
}

export function getViewMessageState(): ViewMessageState {
  return { ...viewMessageState };
}

export function setViewMessageLatest(source = 'ui') {
  viewMessageState = {
    mode: 'latest',
    message_id: null,
    changed_at: Date.now(),
    source,
  };
  emitViewMessageChanged();
}

export function setViewMessageHistory(message_id: number, source = 'ui'): boolean {
  const normalized = normalizeMessageId(message_id);
  if (normalized == null) return false;

  viewMessageState = {
    mode: 'history',
    message_id: normalized,
    changed_at: Date.now(),
    source,
  };
  emitViewMessageChanged();
  return true;
}

export function onViewMessageChanged(listener: (state: ViewMessageState) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<ViewMessageState>;
    listener(custom.detail ?? getViewMessageState());
  };
  window.addEventListener(VIEW_MESSAGE_CHANGED_EVENT, handler as EventListener);
  return () => window.removeEventListener(VIEW_MESSAGE_CHANGED_EVENT, handler as EventListener);
}

function resolveLatestAssistantMessageIdFromContext(): number | null {
  try {
    const ctx = (window as any)?.SillyTavern?.getContext?.();
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    for (let i = chat.length - 1; i >= 0; i -= 1) {
      const msg = chat[i];
      if (!msg || typeof msg !== 'object') continue;
      if ((msg as any).is_user === true) continue;
      if ((msg as any).is_system === true) continue;
      return i;
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveLastMessageIdFallback(): number | null {
  try {
    const lastId = typeof getLastMessageId === 'function' ? Number(getLastMessageId()) : NaN;
    if (Number.isFinite(lastId) && lastId >= 0) return Math.trunc(lastId);
  } catch {
    // ignore
  }
  return null;
}

function resolveCurrentMessageIdFallback(): number | null {
  try {
    const currentId = Number(getCurrentMessageId?.());
    if (Number.isFinite(currentId) && currentId >= 0) return Math.trunc(currentId);
  } catch {
    // ignore
  }
  return null;
}

export function resolveLatestAssistantMessageId(): number | null {
  return resolveLatestAssistantMessageIdFromContext();
}

export function resolveLiveMessageId(): number | null {
  return (
    resolveLatestAssistantMessageIdFromContext() ??
    resolveLastMessageIdFallback() ??
    resolveCurrentMessageIdFallback() ??
    null
  );
}

export function resolveViewMessageId(options: ResolveViewMessageIdOptions = {}): number | null {
  const preferHistory = options.preferHistory !== false;
  if (preferHistory) {
    const state = getViewMessageState();
    const selectedId = normalizeMessageId(state.message_id);
    if (state.mode === 'history' && selectedId != null) return selectedId;
  }
  return resolveLiveMessageId();
}

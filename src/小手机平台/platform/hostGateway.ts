export interface HostContextSnapshot {
  readonly characterName: string;
  readonly chatId: string;
  readonly sessionKey: string;
}

export type HostContextListener = (snapshot: HostContextSnapshot) => void;

export interface PublicHostApi {
  readonly name2: string;
  readonly getCurrentChatId: () => string;
  readonly eventTypes: {
    readonly CHAT_CHANGED: string;
    readonly CHARACTER_PAGE_LOADED: string;
  };
  readonly eventSource: {
    on(event: string, listener: () => void): unknown;
    removeListener(event: string, listener: () => void): unknown;
  };
}

export interface HostGateway {
  getSnapshot(): HostContextSnapshot;
  subscribe(listener: HostContextListener): () => void;
  dispose(): void;
}

function requireNonEmpty(value: unknown, label: 'characterName' | 'chatId'): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Public host ${label} is empty or unavailable`);
  }
  return value.trim();
}

function readSnapshot(host: PublicHostApi): HostContextSnapshot {
  const characterName = requireNonEmpty(host.name2, 'characterName');
  const chatId = requireNonEmpty(host.getCurrentChatId(), 'chatId');
  return Object.freeze({ characterName, chatId, sessionKey: `${characterName}::${chatId}` });
}

function assertPublicHost(host: unknown): asserts host is PublicHostApi {
  if (!host || typeof host !== 'object') throw new Error('SillyTavern public host interface is unavailable');

  const candidate = host as Partial<PublicHostApi>;
  if (
    typeof candidate.name2 !== 'string' ||
    typeof candidate.getCurrentChatId !== 'function' ||
    !candidate.eventTypes ||
    typeof candidate.eventTypes.CHAT_CHANGED !== 'string' ||
    typeof candidate.eventTypes.CHARACTER_PAGE_LOADED !== 'string' ||
    !candidate.eventSource ||
    typeof candidate.eventSource.on !== 'function' ||
    typeof candidate.eventSource.removeListener !== 'function'
  ) {
    throw new Error('SillyTavern public host interface is unavailable or incomplete');
  }
}

export function createHostGateway(host: PublicHostApi): HostGateway {
  assertPublicHost(host);

  let snapshot = readSnapshot(host);
  let disposed = false;
  const listeners = new Set<HostContextListener>();

  const handleHostChange = (): void => {
    if (disposed) return;
    const next = readSnapshot(host);
    if (next.characterName === snapshot.characterName && next.chatId === snapshot.chatId) return;
    snapshot = next;
    for (const listener of [...listeners]) listener(snapshot);
  };

  const events = [host.eventTypes.CHAT_CHANGED, host.eventTypes.CHARACTER_PAGE_LOADED];
  const attachedEvents: string[] = [];
  try {
    for (const event of events) {
      host.eventSource.on(event, handleHostChange);
      attachedEvents.push(event);
    }
  } catch (error) {
    for (const event of attachedEvents) host.eventSource.removeListener(event, handleHostChange);
    throw new Error('Unable to subscribe to SillyTavern public host events', { cause: error });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) throw new Error('HostGateway is disposed');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const event of attachedEvents) host.eventSource.removeListener(event, handleHostChange);
      listeners.clear();
    },
  };
}

interface WindowWithPublicHost {
  readonly top?: {
    readonly SillyTavern?: unknown;
  } | null;
}

export function createTopHostGateway(): HostGateway {
  const root = globalThis as typeof globalThis & { readonly window?: WindowWithPublicHost };
  if (!root.window) throw new Error('window.top public host is unavailable');

  let topWindow: WindowWithPublicHost['top'];
  try {
    topWindow = root.window.top;
  } catch (error) {
    throw new Error('Unable to access window.top public host', { cause: error });
  }
  if (!topWindow) throw new Error('window.top public host is unavailable');

  let host: unknown;
  try {
    host = topWindow.SillyTavern;
  } catch (error) {
    throw new Error('Unable to access SillyTavern public host interface', { cause: error });
  }
  assertPublicHost(host);
  return createHostGateway(host);
}

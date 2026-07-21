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

export interface HostGatewayOptions {
  onError?: (error: unknown) => void;
}

function createSafeErrorReporter(onError?: (error: unknown) => void): (error: unknown) => void {
  return error => {
    if (!onError) return;
    try {
      onError(error);
    } catch {
      // Diagnostics must never break host event delivery or reveal contextual data.
    }
  };
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

export function createHostGateway(host: PublicHostApi, options: HostGatewayOptions = {}): HostGateway {
  assertPublicHost(host);

  let snapshot = readSnapshot(host);
  let active = true;
  const listeners = new Set<HostContextListener>();
  const reportError = createSafeErrorReporter(options.onError);

  const handleHostChange = (): void => {
    if (!active) return;
    let next: HostContextSnapshot;
    try {
      next = readSnapshot(host);
    } catch (error) {
      reportError(error);
      return;
    }
    if (next.characterName === snapshot.characterName && next.chatId === snapshot.chatId) return;
    snapshot = next;
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        reportError(error);
      }
    }
  };

  const events = [host.eventTypes.CHAT_CHANGED, host.eventTypes.CHARACTER_PAGE_LOADED];
  const attachedEvents = new Set<string>();
  const attemptedEvents: string[] = [];
  for (const event of events) {
    attemptedEvents.push(event);
    try {
      host.eventSource.on(event, handleHostChange);
      attachedEvents.add(event);
    } catch (subscriptionError) {
      active = false;
      const errors: unknown[] = [subscriptionError];
      for (const attemptedEvent of [...attemptedEvents].reverse()) {
        try {
          host.eventSource.removeListener(attemptedEvent, handleHostChange);
          attachedEvents.delete(attemptedEvent);
        } catch (cleanupError) {
          errors.push(cleanupError);
        }
      }
      const aggregate = new AggregateError(errors, 'Unable to subscribe to SillyTavern public host events', {
        cause: subscriptionError,
      });
      reportError(aggregate);
      throw aggregate;
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (!active) throw new Error('HostGateway is disposed');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      active = false;
      listeners.clear();
      const errors: unknown[] = [];
      for (const event of [...attachedEvents]) {
        try {
          host.eventSource.removeListener(event, handleHostChange);
          attachedEvents.delete(event);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        const aggregate = new AggregateError(errors, 'Unable to dispose all SillyTavern public host listeners');
        reportError(aggregate);
        throw aggregate;
      }
    },
  };
}

interface WindowWithPublicHost {
  readonly top?: {
    readonly SillyTavern?: unknown;
  } | null;
}

export function createTopHostGateway(options: HostGatewayOptions = {}): HostGateway {
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
    const entrypoint = topWindow.SillyTavern;
    host =
      entrypoint &&
      typeof entrypoint === 'object' &&
      typeof (entrypoint as { readonly getContext?: unknown }).getContext === 'function'
        ? (entrypoint as { readonly getContext: () => unknown }).getContext()
        : entrypoint;
  } catch (error) {
    throw new Error('Unable to access SillyTavern public host interface', { cause: error });
  }
  assertPublicHost(host);
  return createHostGateway(host, options);
}

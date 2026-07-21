export interface PhoneHostAction {
  kind: 'composer.insert';
  text: string;
  sourceKey: string;
  mode: 'replace' | 'append';
}

interface PhoneOwner {
  characterName: string;
  adapterId: string;
  runtimeMajor: number;
}

interface PhoneRuntimeStatus {
  isOpen: boolean;
}

interface PrePhoneRuntimeEventMap {
  unread: [number];
  status: [PhoneRuntimeStatus];
}

export interface PrePhoneRuntime {
  getOwner(): PhoneOwner | null;
  getStatus(): PhoneRuntimeStatus;
  toggle(): Promise<void>;
  getUnreadCount(): number;
  on<K extends keyof PrePhoneRuntimeEventMap>(
    event: K,
    listener: (...args: PrePhoneRuntimeEventMap[K]) => void,
  ): () => void;
  attachHostBridge(bridge: {
    id: 'same-layer-pre';
    submitAction(action: PhoneHostAction): Promise<void> | void;
  }): () => void;
}

export interface PrePhoneComposer {
  value: string;
}

export type PrePhoneAvailability = 'available' | 'offline' | 'unavailable';

export interface PrePhoneBridge {
  getAvailability(): PrePhoneAvailability;
  getUnread(): number;
  subscribe(listener: (unread: number, availability: PrePhoneAvailability) => void): () => void;
  toggle(): Promise<void>;
  submitAction(action: unknown): Promise<void>;
  dispose(): void;
}

const EXPECTED_OWNER = Object.freeze({
  characterName: '\u672b\u4e16\u5bd2\u51ac - \u661f\u7a79\u79e9\u5e8f',
  adapterId: 'winter-apocalypse',
  runtimeMajor: 1,
});

function ownerMatches(owner: PhoneOwner | null): boolean {
  return (
    owner?.characterName === EXPECTED_OWNER.characterName &&
    owner.adapterId === EXPECTED_OWNER.adapterId &&
    owner.runtimeMajor === EXPECTED_OWNER.runtimeMajor
  );
}

function runtimeOwnerMatches(runtime: PrePhoneRuntime): boolean {
  try {
    return ownerMatches(runtime.getOwner());
  } catch {
    return false;
  }
}

export function getTopTavernPhoneRuntime(): PrePhoneRuntime | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return (window.top as (Window & { TavernPhone?: PrePhoneRuntime }) | null)?.TavernPhone;
  } catch {
    return undefined;
  }
}

export function createPrePhoneBridge(options: {
  runtime?: PrePhoneRuntime;
  composer: PrePhoneComposer;
  launcher?: () => { focus(): void; isConnected?: boolean } | null;
}): PrePhoneBridge {
  const { runtime, composer, launcher } = options;
  let availability: PrePhoneAvailability = runtime ? 'unavailable' : 'offline';
  let unread = 0;
  let disposed = false;
  let wasOpen = false;
  const listeners = new Set<(unread: number, availability: PrePhoneAvailability) => void>();
  let stopStatus: (() => void) | null = null;
  let stopUnread: (() => void) | null = null;
  let detachHostBridge: (() => void) | null = null;

  function notify(): void {
    for (const listener of listeners) listener(unread, availability);
  }

  async function submitAction(action: unknown): Promise<void> {
    if (!action || typeof action !== 'object') throw new Error('Phone host action must be an object');
    const candidate = action as Partial<PhoneHostAction> & { kind?: unknown; mode?: unknown };
    if (candidate.kind !== 'composer.insert') throw new Error('Unsupported phone host action kind');
    if (typeof candidate.text !== 'string' || !candidate.text.trim())
      throw new Error('Phone host action text cannot be empty');
    if (typeof candidate.sourceKey !== 'string' || !candidate.sourceKey.trim())
      throw new Error('Phone host action sourceKey cannot be empty');
    if (candidate.mode !== 'replace' && candidate.mode !== 'append')
      throw new Error('Unsupported phone host action mode');

    composer.value =
      candidate.mode === 'append' && composer.value.trim() ? `${composer.value}\n${candidate.text}` : candidate.text;
  }

  function clearRuntimeBinding(): void {
    try {
      stopUnread?.();
    } finally {
      stopUnread = null;
    }
    try {
      detachHostBridge?.();
    } finally {
      detachHostBridge = null;
    }
  }

  function refreshRuntimeBinding(value?: PhoneRuntimeStatus): void {
    if (!runtime || disposed) return;
    const isOpen = Boolean(value?.isOpen);
    const shouldRestoreFocus = wasOpen && !isOpen;

    if (!runtimeOwnerMatches(runtime)) {
      clearRuntimeBinding();
      availability = 'unavailable';
      wasOpen = isOpen;
      notify();
      return;
    }

    if (!detachHostBridge) {
      try {
        unread = Math.max(0, runtime.getUnreadCount());
        detachHostBridge = runtime.attachHostBridge({ id: 'same-layer-pre', submitAction });
        stopUnread = runtime.on('unread', value => {
          if (disposed) return;
          unread = typeof value === 'number' ? Math.max(0, value) : runtime.getUnreadCount();
          notify();
        });
        availability = 'available';
      } catch {
        clearRuntimeBinding();
        availability = 'unavailable';
      }
    } else {
      availability = 'available';
    }

    if (availability === 'available' && shouldRestoreFocus) {
      const target = launcher?.();
      if (target?.isConnected !== false) target?.focus();
    }
    wasOpen = isOpen;
    notify();
  }

  if (runtime) {
    try {
      stopStatus = runtime.on('status', value => refreshRuntimeBinding(value));
      refreshRuntimeBinding(runtime.getStatus());
    } catch {
      clearRuntimeBinding();
      availability = 'unavailable';
    }
  }

  return {
    getAvailability: () => availability,
    getUnread: () => unread,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      listener(unread, availability);
      return () => listeners.delete(listener);
    },
    async toggle() {
      if (disposed || availability !== 'available' || !runtime || !runtimeOwnerMatches(runtime)) return;
      await runtime.toggle();
    },
    submitAction,
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      try {
        stopStatus?.();
      } finally {
        stopStatus = null;
        clearRuntimeBinding();
      }
    },
  };
}

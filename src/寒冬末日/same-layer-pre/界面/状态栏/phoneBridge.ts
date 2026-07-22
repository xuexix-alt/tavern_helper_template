import { PHONE_RUNTIME_INSTALLED_EVENT } from '../../../../小手机平台/core/register';

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
  redetect(): PrePhoneAvailability;
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

export function subscribeTopTavernPhoneRuntimeInstalled(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  try {
    const target = window.top;
    if (!target) return () => undefined;
    target.addEventListener(PHONE_RUNTIME_INSTALLED_EVENT, listener);
    return () => target.removeEventListener(PHONE_RUNTIME_INSTALLED_EVENT, listener);
  } catch {
    return () => undefined;
  }
}

export function createPrePhoneBridge(options: {
  runtime?: PrePhoneRuntime;
  resolveRuntime?: () => PrePhoneRuntime | undefined;
  subscribeRuntimeInstalled?: (listener: () => void) => () => void;
  composer: PrePhoneComposer;
  launcher?: () => { focus(): void; isConnected?: boolean } | null;
}): PrePhoneBridge {
  const { composer, launcher } = options;
  const resolveRuntime = options.resolveRuntime ?? (() => options.runtime);
  const subscribeRuntimeInstalled = options.subscribeRuntimeInstalled ?? subscribeTopTavernPhoneRuntimeInstalled;
  let runtime: PrePhoneRuntime | undefined;
  let availability: PrePhoneAvailability = 'offline';
  let unread = 0;
  let disposed = false;
  let wasOpen = false;
  const listeners = new Set<(unread: number, availability: PrePhoneAvailability) => void>();
  let stopStatus: (() => void) | null = null;
  let stopUnread: (() => void) | null = null;
  let detachHostBridge: (() => void) | null = null;
  let stopRuntimeInstalled: (() => void) | null = null;

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

  function clearAttachedBinding(): void {
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

  function clearRuntimeBinding(): void {
    clearAttachedBinding();
    try {
      stopStatus?.();
    } finally {
      stopStatus = null;
      runtime = undefined;
    }
  }

  function refreshRuntimeBinding(value?: PhoneRuntimeStatus): void {
    if (!runtime || disposed) return;
    const activeRuntime = runtime;
    const isOpen = Boolean(value?.isOpen);
    const shouldRestoreFocus = wasOpen && !isOpen;

    if (!runtimeOwnerMatches(activeRuntime)) {
      clearAttachedBinding();
      availability = 'unavailable';
      wasOpen = isOpen;
      notify();
      return;
    }

    if (!detachHostBridge) {
      try {
        unread = Math.max(0, activeRuntime.getUnreadCount());
        detachHostBridge = activeRuntime.attachHostBridge({ id: 'same-layer-pre', submitAction });
        stopUnread = activeRuntime.on('unread', value => {
          if (disposed || runtime !== activeRuntime) return;
          unread = typeof value === 'number' ? Math.max(0, value) : activeRuntime.getUnreadCount();
          notify();
        });
        availability = 'available';
      } catch {
        clearAttachedBinding();
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

  function redetect(): PrePhoneAvailability {
    if (disposed) return availability;

    let detectedRuntime: PrePhoneRuntime | undefined;
    try {
      detectedRuntime = resolveRuntime();
    } catch {
      detectedRuntime = undefined;
    }

    if (!detectedRuntime) {
      clearRuntimeBinding();
      availability = 'offline';
      unread = 0;
      wasOpen = false;
      notify();
      return availability;
    }

    if (detectedRuntime !== runtime) {
      clearRuntimeBinding();
      runtime = detectedRuntime;
      try {
        stopStatus = runtime.on('status', value => refreshRuntimeBinding(value));
      } catch {
        clearRuntimeBinding();
        availability = 'unavailable';
        notify();
        return availability;
      }
    }

    try {
      refreshRuntimeBinding(runtime.getStatus());
    } catch {
      clearAttachedBinding();
      availability = 'unavailable';
      notify();
    }
    return availability;
  }

  try {
    stopRuntimeInstalled = subscribeRuntimeInstalled(() => redetect());
  } catch {
    stopRuntimeInstalled = null;
  }
  redetect();

  return {
    getAvailability: () => availability,
    getUnread: () => unread,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      listener(unread, availability);
      return () => listeners.delete(listener);
    },
    redetect,
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
        stopRuntimeInstalled?.();
      } finally {
        stopRuntimeInstalled = null;
        clearRuntimeBinding();
      }
    },
  };
}

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
  sessionKey?: string | null;
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
    getStoryMessageId(): number | null;
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

/**
 * \u68c0\u67e5 owner \u662f\u5426\u5339\u914d
 *
 * \u89c4\u5219\uff1a
 * 1. \u5982\u679c adapterId \u660e\u786e\u6807\u8bc6\u4e3a\u5176\u4ed6\u89d2\u8272\u7684\u4e13\u7528\u9002\u914d\u5668\uff0c\u5219\u4e0d\u5339\u914d
 * 2. runtimeMajor \u5fc5\u987b\u517c\u5bb9\uff08\u76ee\u524d\u53ea\u652f\u6301 version 1\uff09
 * 3. \u4e0d\u518d\u5f3a\u5236\u8981\u6c42 characterName \u5b8c\u5168\u5339\u914d\uff0c\u56e0\u4e3a\uff1a
 *    - \u540c\u4e00\u4e2a\u8fd0\u884c\u65f6\u53ef\u80fd\u88ab\u591a\u4e2a\u89d2\u8272\u5171\u4eab
 *    - \u901a\u7528\u9002\u914d\u5668\u5e94\u8be5\u652f\u6301\u4efb\u4f55\u89d2\u8272
 */
function ownerMatches(owner: PhoneOwner | null): boolean {
  if (!owner) return false;

  // \u68c0\u67e5\u7248\u672c\u517c\u5bb9\u6027
  if (owner.runtimeMajor !== 1) return false;

  // \u5982\u679c adapterId \u660e\u786e\u6807\u8bc6\u4e3a\u5176\u4ed6\u7279\u5b9a\u89d2\u8272\u7684\u9002\u914d\u5668\uff0c\u5219\u62d2\u7edd
  // \u4f8b\u5982\uff1a'other-character-adapter', 'specific-story-adapter'
  // \u4f46\u63a5\u53d7\uff1a'winter-apocalypse', 'main-adapter', 'phone-adapter' \u7b49\u901a\u7528\u6216\u5f53\u524d\u89d2\u8272\u7684\u9002\u914d\u5668
  const rejectedAdapterIds = [
    // \u672a\u6765\u5982\u679c\u6709\u5176\u4ed6\u89d2\u8272\u7684\u4e13\u7528\u9002\u914d\u5668\uff0c\u5728\u8fd9\u91cc\u6dfb\u52a0
    // 'other-story-adapter',
  ];

  if (rejectedAdapterIds.includes(owner.adapterId)) return false;

  // \u901a\u8fc7\u6240\u6709\u68c0\u67e5
  return true;
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
  storyMessageId?: () => number | null;
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
  let pendingOpen = false;
  let attachedSessionKey: string | null = null;
  const listeners = new Set<(unread: number, availability: PrePhoneAvailability) => void>();
  let stopStatus: (() => void) | null = null;
  let stopUnread: (() => void) | null = null;
  let detachHostBridge: (() => void) | null = null;
  let stopRuntimeInstalled: (() => void) | null = null;

  function notify(): void {
    for (const listener of listeners) listener(unread, availability);
  }

  function flushPendingOpen(activeRuntime: PrePhoneRuntime): void {
    if (!pendingOpen || disposed || runtime !== activeRuntime || availability !== 'available') return;
    pendingOpen = false;
    queueMicrotask(() => {
      if (disposed || runtime !== activeRuntime || availability !== 'available') return;
      try {
        if (!activeRuntime.getStatus().isOpen) void activeRuntime.toggle().catch(() => undefined);
      } catch {
        // A later click or runtime status event can retry without breaking the Pre UI.
      }
    });
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
      attachedSessionKey = null;
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
    const runtimeSessionKey = value?.sessionKey ?? null;
    const shouldRestoreFocus = wasOpen && !isOpen;

    if (detachHostBridge && attachedSessionKey !== runtimeSessionKey) clearAttachedBinding();

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
        detachHostBridge = activeRuntime.attachHostBridge({
          id: 'same-layer-pre',
          getStoryMessageId: () => options.storyMessageId?.() ?? null,
          submitAction,
        });
        attachedSessionKey = runtimeSessionKey;
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
    flushPendingOpen(activeRuntime);
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
      if (disposed) return;
      if (availability !== 'available' || !runtime || !runtimeOwnerMatches(runtime)) {
        pendingOpen = true;
        redetect();
        return;
      }
      pendingOpen = false;
      await runtime.toggle();
    },
    submitAction,
    dispose() {
      if (disposed) return;
      disposed = true;
      pendingOpen = false;
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

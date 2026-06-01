type ImageIntentSource = 'transcript' | 'gallery';

type RecentIntent = {
  messageId: number;
  source: ImageIntentSource;
  createdAt: number;
};

type CreateImageRecentIntentStoreOptions = {
  now?: () => number;
  ttlMs?: number;
};

const DEFAULT_RECENT_INTENT_TTL_MS = 10 * 60_000;

export function createImageRecentIntentStore(options: CreateImageRecentIntentStoreOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const ttlMs = Math.max(200, Math.trunc(Number(options.ttlMs ?? DEFAULT_RECENT_INTENT_TTL_MS)));
  let intent: RecentIntent | null = null;

  function mark(messageId: number, source: ImageIntentSource) {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;
    intent = {
      messageId: normalizedId,
      source,
      createdAt: now(),
    };
  }

  function read() {
    if (!intent) return null;
    if (now() - intent.createdAt > ttlMs) {
      intent = null;
      return null;
    }
    return intent;
  }

  return {
    mark,
    read,
  };
}

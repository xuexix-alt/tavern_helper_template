import { buildGeneratedImageMarkerId } from './generatedImageMarker.ts';
import { collectChatu8CacheEntries, type Chatu8CacheEntry } from './galleryCache.ts';

export type GeneratedImageSourceRef = {
  messageId: number | null;
  markerId?: string;
  imageId?: string;
  requestId?: string;
  promptToken?: string;
};

export type ResolvedGeneratedImageSource = {
  markerId: string;
  imageId: string;
  requestId?: string;
  promptToken?: string;
  src: string;
  alt: string;
  source: 'stream_demo' | 'extra' | 'cache';
};

function normalizeSwipeId(input: unknown): number {
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function normalizeImageDataToSrc(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `data:image/png;base64,${raw}`;
}

function normalizeKey(value: unknown): string {
  return String(value ?? '').trim();
}

function buildEntryImageId(entry: Record<string, any>): string {
  return (
    normalizeKey(entry?.imageId ?? entry?.image_id) ||
    normalizeKey(entry?.requestId ?? entry?.request_id) ||
    normalizeKey(entry?.promptToken) ||
    normalizeImageDataToSrc(entry?.src ?? entry?.image ?? entry?.imageData)
  );
}

function buildEntryMarkerId(entry: Record<string, any>, messageId: number | null): string {
  return buildGeneratedImageMarkerId({
    messageId: messageId ?? 0,
    markerId: normalizeKey(entry?.markerId),
    imageId: buildEntryImageId(entry),
    requestId: normalizeKey(entry?.requestId ?? entry?.request_id),
    promptToken: normalizeKey(entry?.promptToken),
  });
}

function matchesImageRef(reference: GeneratedImageSourceRef, entry: Record<string, any>): boolean {
  const markerId = normalizeKey(reference.markerId);
  const imageId = normalizeKey(reference.imageId);
  const requestId = normalizeKey(reference.requestId);
  const promptToken = normalizeKey(reference.promptToken);
  const entryMarkerId = buildEntryMarkerId(entry, reference.messageId);
  const entryImageId = buildEntryImageId(entry);
  const entryRequestId = normalizeKey(entry?.requestId ?? entry?.request_id);
  const entryPromptToken = normalizeKey(entry?.promptToken);

  if (markerId && entryMarkerId === markerId) return true;
  if (imageId && entryImageId === imageId) return true;
  if (requestId && entryRequestId === requestId) return true;
  if (promptToken && entryPromptToken === promptToken) return true;
  return false;
}

function normalizeResolvedSource(
  entry: Record<string, any>,
  source: ResolvedGeneratedImageSource['source'],
  messageId: number | null,
): ResolvedGeneratedImageSource | null {
  const src = normalizeImageDataToSrc(entry?.src ?? entry?.image ?? entry?.imageData);
  if (!src) return null;

  const imageId = buildEntryImageId(entry);
  if (!imageId) return null;

  return {
    markerId: buildEntryMarkerId(entry, messageId),
    imageId,
    requestId: normalizeKey(entry?.requestId ?? entry?.request_id) || undefined,
    promptToken: normalizeKey(entry?.promptToken) || undefined,
    src,
    alt: normalizeKey(entry?.alt) || 'generated image',
    source,
  };
}

function normalizeCacheEntry(entry: Chatu8CacheEntry): Record<string, any> {
  return {
    markerId: normalizeKey((entry as any).markerId),
    imageId: normalizeKey(entry.imageId ?? entry.requestId ?? entry.promptToken ?? entry.src),
    requestId: normalizeKey(entry.requestId),
    promptToken: normalizeKey(entry.promptToken),
    src: entry.src,
    alt: entry.alt,
  };
}

export function resolveGeneratedImageSource(
  reference: GeneratedImageSourceRef,
  message: Record<string, any> | null | undefined,
  cacheEntries: Chatu8CacheEntry[] = [],
): ResolvedGeneratedImageSource | null {
  if (!message || typeof message !== 'object') return null;

  const streamDemoEntries = Array.isArray(message?.data?.stream_demo?.generated_images)
    ? message.data.stream_demo.generated_images
    : [];
  const normalizedMessageId =
    Number.isFinite(Number(reference.messageId)) && Number(reference.messageId) >= 0
      ? Math.trunc(Number(reference.messageId))
      : null;
  for (const entry of streamDemoEntries) {
    if (!entry || typeof entry !== 'object') continue;
    if (!matchesImageRef(reference, entry as Record<string, any>)) continue;
    const resolved = normalizeResolvedSource(entry as Record<string, any>, 'stream_demo', normalizedMessageId);
    if (resolved) return resolved;
  }

  const swipeId = normalizeSwipeId(message?.swipe_id);
  const extraImages = message?.extra?.images;
  const swipeEntries =
    Array.isArray(extraImages) && Array.isArray(extraImages[swipeId])
      ? extraImages[swipeId]
      : Array.isArray(extraImages)
        ? extraImages.flatMap((item: unknown) => (Array.isArray(item) ? item : []))
        : [];

  for (const entry of swipeEntries) {
    if (!entry || typeof entry !== 'object') continue;
    if (!matchesImageRef(reference, entry as Record<string, any>)) continue;
    const resolved = normalizeResolvedSource(entry as Record<string, any>, 'extra', normalizedMessageId);
    if (resolved) return resolved;
  }

  for (const entry of cacheEntries) {
    const normalized = normalizeCacheEntry(entry);
    if (!matchesImageRef(reference, normalized)) continue;
    const resolved = normalizeResolvedSource(normalized, 'cache', normalizedMessageId);
    if (resolved) return resolved;
  }

  return null;
}

function listReachableHostWindows(): Array<Window & typeof globalThis> {
  const windows: Array<Window & typeof globalThis> = [];
  const seen = new Set<Window>();
  const push = (candidate: Window | null | undefined) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    windows.push(candidate as Window & typeof globalThis);
  };

  push(window);
  try {
    push(window.parent);
  } catch {
    // ignore
  }
  try {
    push(window.top);
  } catch {
    // ignore
  }

  return windows;
}

function readHostContext(): any {
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const ctx = (hostWindow as any)?.SillyTavern?.getContext?.();
      if (ctx) return ctx;
    } catch {
      // ignore
    }
  }
  return null;
}

function readChatMessageDetail(messageId: number): Record<string, any> | null {
  try {
    const list = getChatMessages(messageId, { hide_state: 'all' }) as Record<string, any>[];
    return Array.isArray(list) ? (list[0] ?? null) : null;
  } catch {
    return null;
  }
}

export function readGeneratedImageSource(reference: GeneratedImageSourceRef): ResolvedGeneratedImageSource | null {
  const messageId = Number(reference.messageId);
  if (!Number.isFinite(messageId) || messageId < 0) return null;

  const normalizedMessageId = Math.trunc(messageId);
  const message = readChatMessageDetail(normalizedMessageId);
  const ctx = readHostContext();
  const cacheEntries = collectChatu8CacheEntries(ctx?.chatMetadata?.['st-chatu8'], normalizedMessageId);
  return resolveGeneratedImageSource(reference, message, cacheEntries);
}

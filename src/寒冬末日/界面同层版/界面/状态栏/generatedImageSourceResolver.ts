import { buildGeneratedImageMarkerId } from './generatedImageMarker.ts';
import { collectPluginNativeCacheArtifacts, type PluginNativeCacheArtifact } from './pluginNativeCacheArtifacts.ts';
import { mergeNativeMesTagsWithExtraEntries, parseNativeMesImageTags } from './pluginNativeMesTag.ts';
import {
  normalizeImageDataToSrc as sharedNormalizeImageDataToSrc,
  readHostContext as sharedReadHostContext,
  readChatMessageDetail as sharedReadChatMessageDetail,
} from './hostBridge.ts';

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
  /** src 可能是 data: / http(s): / / 开头的路径 */
  src: string;
  alt: string;
  source: 'extra' | 'mes_tag' | 'cache';
  messageId?: number | null;
};

function normalizeSwipeId(input: unknown): number {
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function normalizeKey(value: unknown): string {
  return String(value ?? '').trim();
}

function buildEntryImageId(entry: Record<string, any>): string {
  return (
    normalizeKey(entry?.imageId ?? entry?.image_id) ||
    normalizeKey(entry?.requestId ?? entry?.request_id) ||
    normalizeKey(entry?.promptToken) ||
    sharedNormalizeImageDataToSrc(entry?.src ?? entry?.image ?? entry?.imageData)
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
  const src = sharedNormalizeImageDataToSrc(entry?.src ?? entry?.image ?? entry?.imageData);
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

function normalizeCacheEntry(entry: PluginNativeCacheArtifact): Record<string, any> {
  return {
    messageId: entry.messageId,
    markerId: normalizeKey((entry as any).markerId),
    imageId: normalizeKey(entry.imageId ?? entry.requestId ?? entry.promptToken ?? entry.src),
    requestId: normalizeKey(entry.requestId),
    promptToken: normalizeKey(entry.promptToken),
    src: entry.src,
    alt: entry.alt,
    anchorText: normalizeKey(entry.anchorText),
  };
}

export function resolveGeneratedImageSource(
  reference: GeneratedImageSourceRef,
  message: Record<string, any> | null | undefined,
  cacheEntries: PluginNativeCacheArtifact[] = [],
): ResolvedGeneratedImageSource | null {
  if (!message || typeof message !== 'object') return null;

  const normalizedMessageId =
    Number.isFinite(Number(reference.messageId)) && Number(reference.messageId) >= 0
      ? Math.trunc(Number(reference.messageId))
      : null;

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

  const mesTagEntries = mergeNativeMesTagsWithExtraEntries({
    tags: parseNativeMesImageTags({
      messageId: normalizedMessageId ?? 0,
      rawMessage: String(message?.mes ?? message?.message ?? ''),
    }),
    extraImages: swipeEntries,
  });

  for (const entry of mesTagEntries) {
    if (!entry || typeof entry !== 'object') continue;
    if (!matchesImageRef(reference, entry as Record<string, any>)) continue;

    const resolved = normalizeResolvedSource(entry as Record<string, any>, 'mes_tag', normalizedMessageId);
    if (resolved) return resolved;

    const cacheMatch = cacheEntries.find(cacheEntry =>
      matchesImageRef(reference, {
        ...entry,
        ...normalizeCacheEntry(cacheEntry),
      }),
    );
    if (!cacheMatch) continue;

    const fromCache = normalizeResolvedSource(
      {
        ...normalizeCacheEntry(cacheMatch),
        promptToken: normalizeKey((entry as any)?.promptToken) || normalizeKey(cacheMatch.promptToken),
      },
      'cache',
      normalizedMessageId,
    );
    if (fromCache) return fromCache;
  }

  for (const entry of cacheEntries) {
    const normalized = normalizeCacheEntry(entry);
    if (!matchesImageRef(reference, normalized)) continue;
    const resolved = normalizeResolvedSource(normalized, 'cache', normalizedMessageId);
    if (resolved) return resolved;
  }

  return null;
}

export function readGeneratedImageSource(reference: GeneratedImageSourceRef): ResolvedGeneratedImageSource | null {
  const messageId = Number(reference.messageId);
  if (!Number.isFinite(messageId) || messageId < 0) return null;

  const normalizedMessageId = Math.trunc(messageId);
  const message = sharedReadChatMessageDetail(normalizedMessageId);
  const ctx = sharedReadHostContext();
  const cacheEntries = collectPluginNativeCacheArtifacts(ctx?.chatMetadata?.['st-chatu8'], normalizedMessageId);
  return resolveGeneratedImageSource(reference, message, cacheEntries);
}

export async function readGeneratedImageSourceAsync(
  reference: GeneratedImageSourceRef,
): Promise<ResolvedGeneratedImageSource | null> {
  return readGeneratedImageSource(reference);
}

import { buildGeneratedImageMarkerId } from './generatedImageMarker.ts';

/**
 * 图片持久化补丁 (v2 - IndexedDB)
 *
 * 不再将 base64 写入聊天 JSON。
 * - extra.images[swipeId] 只存轻量引用（requestId / promptToken / idb:// src）
 * - 图片实体由 imageStore.ts 存入 IndexedDB
 *
 * @deprecated Native-first runtime已停用该写入路径。此模块仅保留兼容逻辑。
 */

export const LEGACY_IMAGE_PERSISTENCE_PATCH_ENABLED = false;

type GeneratedImageResponsePayload = {
  requestId: string;
  prompt: string;
  promptToken: string;
  imageData: string;
};

type BuildGeneratedImagePersistencePatchInput = {
  message: Record<string, any>;
  response: GeneratedImageResponsePayload;
  anchorText?: string;
};

type DisplayedGeneratedImageInput = {
  imageId?: string;
  markerId?: string;
  src?: string;
  alt?: string;
  promptToken?: string;
  requestId?: string;
  anchorText?: string;
  title?: string;
  characterName?: string;
};

function clone<T>(value: T): T {
  return value == null ? (value as T) : (JSON.parse(JSON.stringify(value)) as T);
}

function normalizeSwipeId(input: unknown): number {
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function parsePromptBodyFromToken(promptToken: string): string {
  const token = String(promptToken ?? '').trim();
  if (!token) return '';
  const match = token.match(/^[^#]+###([\s\S]*?)###$/);
  return String(match?.[1] ?? token).trim();
}

function isBase64Src(src: string): boolean {
  return src.startsWith('data:') || /^[A-Za-z0-9+/=]{100,}/.test(src);
}

export function buildIdbSrc(messageId: number, requestId: string): string {
  if (!LEGACY_IMAGE_PERSISTENCE_PATCH_ENABLED) return '';
  return `idb://${messageId}/${requestId}`;
}

export function isIdbSrc(src: string): boolean {
  return src.startsWith('idb://');
}

export function parseIdbSrc(src: string): { messageId: number; requestId: string } | null {
  const match = src.match(/^idb:\/\/(\d+)\/(.+)$/);
  if (!match) return null;
  return { messageId: Number(match[1]), requestId: match[2] };
}

function sanitizeImageEntry(entry: Record<string, any>) {
  const requestId = String(entry?.requestId ?? entry?.request_id ?? '').trim();
  const messageId = Math.trunc(Number(entry?.messageId ?? entry?.message_id ?? 0));
  let src = String(entry?.src ?? entry?.image ?? entry?.imageData ?? '').trim();
  if (LEGACY_IMAGE_PERSISTENCE_PATCH_ENABLED && isBase64Src(src) && requestId && Number.isFinite(messageId)) {
    src = buildIdbSrc(messageId, requestId);
  }

  const promptToken = String(entry?.promptToken ?? '').trim();
  const prompt = String(entry?.prompt ?? '').trim();
  const tag = String(entry?.tag ?? promptToken ?? prompt).trim();

  return {
    ...entry,
    markerId: String(entry?.markerId ?? '').trim(),
    imageId: String(entry?.imageId ?? entry?.image_id ?? requestId).trim(),
    requestId,
    request_id: requestId,
    promptToken,
    tag,
    regex: String(entry?.regex ?? '').trim(),
    src,
    image: src,
    imageData: src,
    alt: String(entry?.alt ?? 'generated image').trim() || 'generated image',
    title: String(entry?.title ?? '').trim(),
    characterName: String(entry?.characterName ?? '').trim(),
    ...(prompt ? { prompt } : {}),
  };
}

export function buildGeneratedImagePersistencePatch(input: BuildGeneratedImagePersistencePatchInput) {
  const message = input.message ?? {};
  if (!LEGACY_IMAGE_PERSISTENCE_PATCH_ENABLED) {
    return {
      nextData: clone(message.data ?? {}),
      nextExtra: sanitizePluginImageExtra(message.extra ?? {}),
    };
  }
  const messageId = Math.trunc(Number(message.message_id ?? 0));
  const nextData = clone(message.data ?? {});
  const nextExtra = clone(message.extra ?? {});
  const idbSrc = buildIdbSrc(messageId, input.response.requestId);
  const markerId = buildGeneratedImageMarkerId({
    messageId: Number.isFinite(messageId) ? messageId : 0,
    requestId: input.response.requestId,
    promptToken: input.response.promptToken,
    order: 0,
  });
  const anchorText = String(input.anchorText ?? '').trim();

  const swipeId = normalizeSwipeId(message.swipe_id);
  const sanitizedExtra = sanitizePluginImageExtra(nextExtra);
  const existingExtraImages = sanitizedExtra.images;
  const swipeEntries = Array.isArray(existingExtraImages) ? clone(existingExtraImages) : [];
  if (!Array.isArray(swipeEntries[swipeId])) swipeEntries[swipeId] = [];
  const targetSwipeEntries = swipeEntries[swipeId];

  if (
    !targetSwipeEntries.some(
      (item: any) => String(item?.requestId ?? item?.request_id ?? '').trim() === input.response.requestId,
    )
  ) {
    targetSwipeEntries.push({
      markerId,
      imageId: input.response.requestId,
      requestId: input.response.requestId,
      request_id: input.response.requestId,
      promptToken: input.response.promptToken,
      tag: input.response.prompt,
      regex: anchorText,
      src: idbSrc,
      alt: 'generated image',
    });
  }

  const currentEntry = targetSwipeEntries.find(
    (item: any) => String(item?.requestId ?? item?.request_id ?? '').trim() === input.response.requestId,
  );
  if (currentEntry) {
    currentEntry.markerId = String(currentEntry.markerId ?? '').trim() || markerId;
    currentEntry.imageId = String(currentEntry.imageId ?? '').trim() || input.response.requestId;
    currentEntry.requestId = input.response.requestId;
    currentEntry.request_id = input.response.requestId;
    currentEntry.promptToken = String(currentEntry.promptToken ?? '').trim() || input.response.promptToken;
    currentEntry.tag = String(currentEntry.tag ?? '').trim() || input.response.prompt;
    currentEntry.src = idbSrc;
    currentEntry.alt = String(currentEntry.alt ?? 'generated image').trim() || 'generated image';
    if (anchorText) currentEntry.regex = anchorText;
  }

  sanitizedExtra.images = swipeEntries;
  sanitizedExtra.lockedTags = [];

  return { nextData, nextExtra: sanitizedExtra };
}

export function sanitizePluginImageExtra(extra: Record<string, any>) {
  const nextExtra = clone(extra ?? {});
  const rawImages = nextExtra.images;

  if (Array.isArray(rawImages)) {
    nextExtra.images = rawImages.map((group: unknown) => {
      if (!Array.isArray(group)) return group;
      return group.map((entry: any) => sanitizeImageEntry(entry ?? {}));
    });
  }

  nextExtra.lockedTags = [];
  return nextExtra;
}

export function buildPluginImageExtraSanitizePatch(
  messages: Array<Record<string, any>>,
): Array<{ message_id: number; extra: Record<string, unknown> }> {
  const patch: Array<{ message_id: number; extra: Record<string, unknown> }> = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    const messageId = Math.trunc(Number(message?.message_id));
    if (!Number.isFinite(messageId) || messageId < 0) continue;
    const originalExtra = clone(message?.extra ?? {});
    const nextExtra = sanitizePluginImageExtra(originalExtra);
    if (JSON.stringify(originalExtra) === JSON.stringify(nextExtra)) continue;
    patch.push({ message_id: messageId, extra: nextExtra });
  }

  return patch;
}

export function syncDisplayedGeneratedImagesToExtra(
  message: Record<string, any>,
  images: DisplayedGeneratedImageInput[],
) {
  const nextExtra = sanitizePluginImageExtra(message.extra ?? {});
  const swipeId = normalizeSwipeId(message.swipe_id);
  const existingExtraImages = nextExtra.images;
  const swipeEntries = Array.isArray(existingExtraImages) ? clone(existingExtraImages) : [];
  const currentSwipeEntries = Array.isArray(swipeEntries[swipeId]) ? clone(swipeEntries[swipeId]) : [];

  const normalizedImages = (Array.isArray(images) ? images : [])
    .map(image => {
      let src = String(image?.src ?? '').trim();
      const promptToken = String(image?.promptToken ?? '').trim();
      const requestId = String(image?.requestId ?? '').trim();
      const imageId = String(image?.imageId ?? image?.requestId ?? '').trim();
      const markerId = String(image?.markerId ?? '').trim();
      if (!src && !requestId) return null;
      if (LEGACY_IMAGE_PERSISTENCE_PATCH_ENABLED && isBase64Src(src) && requestId) {
        const messageId = Math.trunc(Number(message?.message_id ?? 0));
        src = buildIdbSrc(messageId, requestId);
      }
      if (!src) {
        src =
          LEGACY_IMAGE_PERSISTENCE_PATCH_ENABLED && requestId
            ? buildIdbSrc(Math.trunc(Number(message?.message_id ?? 0)), requestId)
            : '';
      }
      if (!src) return null;
      const prompt = parsePromptBodyFromToken(promptToken);
      return {
        src,
        alt: String(image?.alt ?? 'generated image').trim() || 'generated image',
        markerId,
        promptToken,
        imageId,
        requestId,
        regex: String(image?.anchorText ?? '').trim(),
        tag: prompt,
        title: String(image?.title ?? '').trim(),
        characterName: String(image?.characterName ?? '').trim(),
      };
    })
    .filter(Boolean) as Array<{
    src: string;
    alt: string;
    markerId: string;
    promptToken: string;
    imageId: string;
    requestId: string;
    regex: string;
    tag: string;
    title: string;
    characterName: string;
  }>;

  const nextSwipeEntries = normalizedImages.map((image, index) => {
    const matchedExisting =
      currentSwipeEntries.find(
        (entry: any) => String(entry?.requestId ?? entry?.request_id ?? '').trim() === image.requestId,
      ) ??
      currentSwipeEntries.find((entry: any) => String(entry?.src ?? '').trim() === image.src) ??
      {};
    const { prompt: _prompt, ...existingWithoutPrompt } = matchedExisting as Record<string, any>;

    return {
      ...existingWithoutPrompt,
      markerId:
        image.markerId ||
        String(matchedExisting?.markerId ?? '').trim() ||
        buildGeneratedImageMarkerId({
          messageId: Math.trunc(Number(message?.message_id)),
          imageId: image.imageId,
          requestId: image.requestId,
          promptToken: image.promptToken,
          anchorText: image.regex,
          order: index,
        }),
      imageId: image.imageId,
      requestId: image.requestId,
      request_id: image.requestId,
      promptToken: image.promptToken,
      tag: image.tag,
      regex: image.regex,
      src: image.src,
      image: image.src,
      imageData: image.src,
      alt: image.alt,
      title: image.title,
      characterName: image.characterName,
    };
  });

  swipeEntries[swipeId] = nextSwipeEntries;
  nextExtra.images = swipeEntries;
  nextExtra.lockedTags = [];

  return nextExtra;
}

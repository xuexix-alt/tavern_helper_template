<<<<<<< HEAD
import { buildGeneratedImageMarkerId } from './generatedImageMarker.ts';
=======
/**
 * 图片持久化补丁 (v2 - IndexedDB)
 *
 * 不再将 base64 写入聊天 JSON。
 * - extra.images[swipeId] 只存轻量引用（requestId / promptToken / idb:// src）
 * - 图片实体由 imageStore.ts 存入 IndexedDB
 * - data.stream_demo.generated_images 同样只存引用，不存 base64
 */
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)

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
  imageId?: string;
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

function getNestedValue(target: Record<string, any>, path: string) {
  return path.split('.').reduce<any>((current, key) => (current == null ? undefined : current[key]), target);
}

function setNestedValue(target: Record<string, any>, path: string, value: unknown) {
  const keys = path.split('.');
  let current: Record<string, any> = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function parsePromptBodyFromToken(promptToken: string): string {
  const token = String(promptToken ?? '').trim();
  if (!token) return '';
  const match = token.match(/^[^#]+###([\s\S]*?)###$/);
  return String(match?.[1] ?? token).trim();
}

<<<<<<< HEAD
function sanitizeImageEntry(entry: Record<string, any>) {
  const { prompt: _prompt, ...rest } = entry ?? {};
  const requestId = String(entry?.requestId ?? entry?.request_id ?? '').trim();
  const src = String(entry?.src ?? entry?.image ?? entry?.imageData ?? '').trim();
  const promptToken = String(entry?.promptToken ?? '').trim();
  const prompt = String(entry?.prompt ?? '').trim();
  const tag = String(entry?.tag ?? promptToken ?? prompt).trim();
  const markerId = String(entry?.markerId ?? '').trim();
  const sanitized: Record<string, any> = {
    ...rest,
    markerId,
    promptToken,
    requestId,
    request_id: requestId,
    tag,
    regex: String(entry?.regex ?? '').trim(),
    imageData: String(entry?.imageData ?? src).trim(),
    image: String(entry?.image ?? src).trim(),
    src,
    alt: String(entry?.alt ?? 'generated image').trim() || 'generated image',
  };
  return sanitized;
=======
/** 判断 src 是否为 base64 数据 */
function isBase64Src(src: string): boolean {
  return src.startsWith('data:') || /^[A-Za-z0-9+/=]{100,}/.test(src);
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
}

/** 构建 idb:// 引用 URI，用于标记图片存储在 IndexedDB */
export function buildIdbSrc(messageId: number, requestId: string): string {
  return `idb://${messageId}/${requestId}`;
}

/** 判断 src 是否为 idb:// 引用 */
export function isIdbSrc(src: string): boolean {
  return src.startsWith('idb://');
}

/** 从 idb:// URI 解析 messageId 和 requestId */
export function parseIdbSrc(src: string): { messageId: number; requestId: string } | null {
  const match = src.match(/^idb:\/\/(\d+)\/(.+)$/);
  if (!match) return null;
  return { messageId: Number(match[1]), requestId: match[2] };
}

/**
 * 构建持久化补丁 (v2)
 * - data.stream_demo.generated_images: 只存引用 (idb:// src)
 * - extra.images[swipeId]: 只存引用 (idb:// src)
 * - 不再写入 base64
 */
export function buildGeneratedImagePersistencePatch(input: BuildGeneratedImagePersistencePatchInput) {
  const message = input.message ?? {};
  const messageId = Math.trunc(Number(message.message_id ?? 0));
  const nextData = clone(message.data ?? {});
  const nextExtra = clone(message.extra ?? {});

  const idbSrc = buildIdbSrc(messageId, input.response.requestId);

  // --- stream_demo.generated_images: 轻量引用 ---
  const currentList = getNestedValue(nextData, 'stream_demo.generated_images');
  const nextList = Array.isArray(currentList) ? clone(currentList) : [];
  const messageId = Math.trunc(Number(message.message_id));
  const markerId = buildGeneratedImageMarkerId({
    messageId: Number.isFinite(messageId) ? messageId : 0,
    requestId: input.response.requestId,
    promptToken: input.response.promptToken,
    order: nextList.length,
  });
  const anchorText = String(input.anchorText ?? '').trim();

<<<<<<< HEAD
  const imageEntry = {
    markerId,
    imageId: input.response.requestId,
    promptToken: input.response.promptToken,
    requestId: input.response.requestId,
    anchorText: anchorText || undefined,
    order: nextList.length,
  };

  const existingIndex = nextList.findIndex(item => {
    if (!item || typeof item !== 'object') return false;
    return String((item as any).requestId ?? '').trim() === input.response.requestId;
  });

  if (existingIndex < 0) {
    nextList.push(imageEntry);
  } else if (anchorText) {
    nextList[existingIndex] = {
      ...(nextList[existingIndex] ?? {}),
      anchorText,
      markerId: String((nextList[existingIndex] as any)?.markerId ?? '').trim() || markerId,
      promptToken: String((nextList[existingIndex] as any)?.promptToken ?? '').trim() || input.response.promptToken,
    };
=======
  const hasExisting = nextList.some((item: any) =>
    String(item?.requestId ?? '').trim() === input.response.requestId,
  );
  if (!hasExisting) {
    nextList.push({
      imageId: input.response.requestId,
      src: idbSrc,
      alt: 'generated image',
      requestId: input.response.requestId,
    });
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
  }
  setNestedValue(nextData, 'stream_demo.generated_images', nextList);

  // --- extra.images[swipeId]: 轻量引用 ---
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
<<<<<<< HEAD
      markerId,
      imageId: input.response.requestId,
      requestId: input.response.requestId,
      promptToken: input.response.promptToken,
=======
      imageId: input.response.requestId,
      requestId: input.response.requestId,
      request_id: input.response.requestId,
      prompt: input.response.prompt,
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
      tag: input.response.prompt,
      regex: '',
      src: idbSrc,
      alt: 'generated image',
    });
  }
<<<<<<< HEAD
  const currentEntry = targetSwipeEntries.find(
    (item: any) => String(item?.requestId ?? item?.request_id ?? '').trim() === input.response.requestId,
  );
  if (currentEntry) {
    currentEntry.markerId = String(currentEntry.markerId ?? '').trim() || markerId;
    currentEntry.promptToken = String(currentEntry.promptToken ?? '').trim() || input.response.promptToken;
    currentEntry.tag = String(currentEntry.tag ?? '').trim() || input.response.prompt;
    if (anchorText) currentEntry.regex = anchorText;
=======
  sanitizedExtra.images = swipeEntries;

  // --- lockedTags ---
  const existingLockedTags = Array.isArray(sanitizedExtra.lockedTags) ? clone(sanitizedExtra.lockedTags) : [];
  if (!existingLockedTags.some((item: any) => String(item ?? '').trim() === input.response.prompt.trim())) {
    existingLockedTags.push(input.response.prompt);
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
  }
  sanitizedExtra.images = swipeEntries;
  sanitizedExtra.lockedTags = [];

  return { nextData, nextExtra: sanitizedExtra };
}

/** 清理 extra.images 中的条目格式（保留兼容性，但剥离 base64） */
function sanitizeImageEntry(entry: Record<string, any>) {
  const requestId = String(entry?.requestId ?? entry?.request_id ?? '').trim();
  let src = String(entry?.src ?? entry?.image ?? entry?.imageData ?? '').trim();
  // 如果 src 是 base64 且有 requestId，替换为 idb:// 引用
  if (isBase64Src(src) && requestId) {
    const messageId = Math.trunc(Number(entry?.messageId ?? entry?.message_id ?? 0));
    src = buildIdbSrc(messageId, requestId);
  }
  const prompt = String(entry?.prompt ?? '').trim();
  const tag = String(entry?.tag ?? prompt).trim();
  return {
    ...entry,
    requestId,
    request_id: requestId,
    tag,
    regex: String(entry?.regex ?? '').trim(),
    src,
    alt: String(entry?.alt ?? 'generated image').trim() || 'generated image',
    ...(prompt ? { prompt } : {}),
  };
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

  if (Array.isArray(nextExtra.lockedTags)) {
<<<<<<< HEAD
    nextExtra.lockedTags = [];
=======
    nextExtra.lockedTags = nextExtra.lockedTags.map((item: any) => String(item ?? '').trim());
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
  } else {
    nextExtra.lockedTags = [];
  }

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
<<<<<<< HEAD
      const markerId = String(image?.markerId ?? '').trim();
=======
      if (!src && !requestId) return null;
      // 如果 src 是 base64，替换为 idb 引用
      if (isBase64Src(src) && requestId) {
        const messageId = Math.trunc(Number(message?.message_id ?? 0));
        src = buildIdbSrc(messageId, requestId);
      }
      if (!src) src = requestId ? buildIdbSrc(Math.trunc(Number(message?.message_id ?? 0)), requestId) : '';
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
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
<<<<<<< HEAD
        tag: prompt,
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
  }>;
=======
        title: String(image?.title ?? '').trim(),
        characterName: String(image?.characterName ?? '').trim(),
      };
    })
    .filter(Boolean) as Array<{
      src: string;
      alt: string;
      promptToken: string;
      imageId: string;
      prompt: string;
      requestId: string;
      regex: string;
      title: string;
      characterName: string;
    }>;
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)

  const nextSwipeEntries = normalizedImages.map((image, index) => {
    const matchedExisting =
      currentSwipeEntries.find((entry: any) => String(entry?.requestId ?? entry?.request_id ?? '').trim() === image.requestId) ??
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

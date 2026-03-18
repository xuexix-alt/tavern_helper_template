import { buildGeneratedImageMarkerId } from './generatedImageMarker.ts';

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
}

export function buildGeneratedImagePersistencePatch(input: BuildGeneratedImagePersistencePatchInput) {
  const message = input.message ?? {};
  const nextData = clone(message.data ?? {});
  const nextExtra = clone(message.extra ?? {});
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
      promptToken:
        String((nextList[existingIndex] as any)?.promptToken ?? '').trim() || input.response.promptToken,
    };
  }

  setNestedValue(nextData, 'stream_demo.generated_images', nextList);

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
      promptToken: input.response.promptToken,
      tag: input.response.prompt,
      regex: '',
      imageData: input.response.imageData,
      image: input.response.imageData,
      src: input.response.imageData,
      alt: 'generated image',
    });
  }
  const currentEntry = targetSwipeEntries.find(
    (item: any) => String(item?.requestId ?? item?.request_id ?? '').trim() === input.response.requestId,
  );
  if (currentEntry) {
    currentEntry.markerId = String(currentEntry.markerId ?? '').trim() || markerId;
    currentEntry.promptToken = String(currentEntry.promptToken ?? '').trim() || input.response.promptToken;
    currentEntry.tag = String(currentEntry.tag ?? '').trim() || input.response.prompt;
    if (anchorText) currentEntry.regex = anchorText;
  }
  sanitizedExtra.images = swipeEntries;
  sanitizedExtra.lockedTags = [];

  return {
    nextData,
    nextExtra: sanitizedExtra,
  };
}

export function sanitizePluginImageExtra(extra: Record<string, any>) {
  const nextExtra = clone(extra ?? {});
  const rawImages = nextExtra.images;

  if (Array.isArray(rawImages)) {
    nextExtra.images = rawImages.map(group => {
      if (!Array.isArray(group)) return group;
      return group.map(entry => sanitizeImageEntry(entry ?? {}));
    });
  }

  if (Array.isArray(nextExtra.lockedTags)) {
    nextExtra.lockedTags = [];
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
    patch.push({
      message_id: messageId,
      extra: nextExtra,
    });
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
      const src = String(image?.src ?? '').trim();
      const promptToken = String(image?.promptToken ?? '').trim();
      const requestId = String(image?.requestId ?? '').trim();
      const imageId = String(image?.imageId ?? image?.requestId ?? '').trim();
      const markerId = String(image?.markerId ?? '').trim();
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

  const nextSwipeEntries = normalizedImages.map((image, index) => {
    const matchedExisting =
      currentSwipeEntries.find(
        (entry: any) => String(entry?.requestId ?? entry?.request_id ?? '').trim() === image.requestId,
      ) ??
      currentSwipeEntries.find(
        (entry: any) => String(entry?.src ?? entry?.image ?? entry?.imageData ?? '').trim() === image.src,
      ) ??
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
      imageData: image.src,
      image: image.src,
      src: image.src,
      alt: image.alt,
    };
  });

  swipeEntries[swipeId] = nextSwipeEntries;
  nextExtra.images = swipeEntries;
  nextExtra.lockedTags = [];

  return nextExtra;
}

export type Chatu8CacheEntry = {
  messageId: number | null;
  imageId?: string;
  promptToken: string;
  src: string;
  alt: string;
  requestId?: string;
};

type RawEntryCandidate = {
  key: string;
  value: Record<string, unknown>;
  ancestors: string[];
};

function normalizeImageDataToSrc(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('idb://')) return raw;
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `data:image/png;base64,${raw}`;
}

function collectChatu8PromptTokens(input: string): string[] {
  const text = String(input ?? '');
  const out: string[] = [];
  const regex = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    out.push(match[0]?.trim() ?? '');
  }
  return out;
}

export function buildPromptTokenFromCachePrompt(rawPrompt: unknown): string {
  const prompt = String(rawPrompt ?? '').trim();
  if (!prompt) return '';
  const existing = collectChatu8PromptTokens(prompt)[0];
  if (existing) return existing;
  return `image###${prompt}###`;
}

function isObjectRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

function looksLikeImageEntry(input: Record<string, unknown>): boolean {
  return ['src', 'image', 'imageData', 'path', 'url'].some(key => String(input[key] ?? '').trim().length > 0);
}

function collectRawEntryCandidates(input: unknown, ancestors: string[] = []): RawEntryCandidate[] {
  if (Array.isArray(input)) {
    return input.flatMap((value, index) => collectRawEntryCandidates(value, [...ancestors, String(index)]));
  }

  if (!isObjectRecord(input)) return [];
  if (looksLikeImageEntry(input)) {
    return [
      {
        key: ancestors[ancestors.length - 1] ?? '',
        value: input,
        ancestors,
      },
    ];
  }

  return Object.entries(input).flatMap(([key, value]) => collectRawEntryCandidates(value, [...ancestors, key]));
}

function inferMessageIdFromAncestors(ancestors: string[]): number | null {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const numeric = Number(ancestors[index]);
    if (Number.isFinite(numeric)) return Math.trunc(numeric);
  }
  return null;
}

function sanitizeCacheImageEntry(entry: Record<string, unknown>) {
  const requestId = String((entry as any)?.requestId ?? (entry as any)?.request_id ?? '').trim();
  const src = normalizeImageDataToSrc(
    (entry as any)?.src ??
      (entry as any)?.image ??
      (entry as any)?.imageData ??
      (entry as any)?.path ??
      (entry as any)?.url,
  );
  const promptToken = String((entry as any)?.promptToken ?? '').trim();
  const prompt = String((entry as any)?.prompt ?? '').trim();
  const tag = String((entry as any)?.tag ?? promptToken ?? prompt).trim();

  const sanitized: Record<string, unknown> = {
    ...entry,
    promptToken,
    requestId,
    request_id: requestId,
    tag,
    regex: String((entry as any)?.regex ?? '').trim(),
    src,
    image: String((entry as any)?.image ?? src).trim(),
    imageData: String((entry as any)?.imageData ?? src).trim(),
    alt: String((entry as any)?.alt ?? 'generated image').trim() || 'generated image',
  };

  return sanitized;
}

function sanitizeCacheTree(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(item => sanitizeCacheTree(item));
  if (!isObjectRecord(input)) return input;
  if (looksLikeImageEntry(input)) return sanitizeCacheImageEntry(input);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = sanitizeCacheTree(value);
  }
  return out;
}

export function sanitizeChatu8CacheMeta(chatMeta: unknown): unknown {
  if (!isObjectRecord(chatMeta)) return chatMeta;
  return sanitizeCacheTree(chatMeta);
}

export function collectChatu8CacheEntries(chatMeta: unknown, messageId?: number | null): Chatu8CacheEntry[] {
  if (!chatMeta || typeof chatMeta !== 'object') return [];

  const normalizedMessageId =
    messageId != null && Number.isFinite(Number(messageId)) ? Math.trunc(Number(messageId)) : null;
  const out: Chatu8CacheEntry[] = [];
  const seen = new Set<string>();

  const candidateRoots = [
    (chatMeta as any)?.imageCache,
    (chatMeta as any)?.images,
    (chatMeta as any)?.data?.imageCache,
    (chatMeta as any)?.data?.images,
    (chatMeta as any)?.data?.image_groups,
  ].filter(Boolean);

  for (const root of candidateRoots) {
    for (const { key, value, ancestors } of collectRawEntryCandidates(root)) {
      const rawEntryMessageId = Number((value as any)?.messageId ?? (value as any)?.message_id);
      const entryMessageId = Number.isFinite(rawEntryMessageId)
        ? Math.trunc(rawEntryMessageId)
        : inferMessageIdFromAncestors(ancestors);
      if (normalizedMessageId != null && entryMessageId != null && entryMessageId !== normalizedMessageId) continue;

      const promptToken = buildPromptTokenFromCachePrompt(
        (value as any)?.promptToken ?? (value as any)?.prompt ?? (value as any)?.tag ?? key,
      );
      const src = normalizeImageDataToSrc(
        (value as any)?.src ??
          (value as any)?.image ??
          (value as any)?.imageData ??
          (value as any)?.path ??
          (value as any)?.url,
      );
      if (!promptToken || !src) continue;

      const requestId = String((value as any)?.requestId ?? (value as any)?.request_id ?? '').trim();
      const identity = `${entryMessageId ?? 'none'}::${requestId || 'none'}::${src}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      out.push({
        messageId: entryMessageId,
        imageId:
          String((value as any)?.imageId ?? (value as any)?.image_id ?? '').trim() ||
          requestId ||
          promptToken ||
          undefined,
        promptToken,
        src,
        alt: String((value as any)?.alt ?? 'generated image').trim(),
        requestId: requestId || undefined,
      });
    }
  }

  return out;
}

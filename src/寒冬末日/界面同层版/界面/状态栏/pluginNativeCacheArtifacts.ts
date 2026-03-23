export type PluginNativeCacheArtifact = {
  messageId: number | null;
  imageId?: string;
  promptToken: string;
  src: string;
  alt: string;
  requestId?: string;
  anchorText?: string;
};

type RawEntryCandidate = {
  key: string;
  value: Record<string, unknown>;
  ancestors: string[];
};

function normalizeImageDataToSrc(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('idb://')) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `data:image/png;base64,${raw}`;
}

function collectPromptTokens(input: string): string[] {
  const out: string[] = [];
  const regex = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(String(input ?? '')))) {
    out.push(String(match[0] ?? '').trim());
  }
  return out;
}

function buildPromptToken(rawPrompt: unknown): string {
  const prompt = String(rawPrompt ?? '').trim();
  if (!prompt) return '';
  const existing = collectPromptTokens(prompt)[0];
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
    return [{ key: ancestors[ancestors.length - 1] ?? '', value: input, ancestors }];
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

export function collectPluginNativeCacheArtifacts(
  chatMeta: unknown,
  messageId?: number | null,
): PluginNativeCacheArtifact[] {
  if (!chatMeta || typeof chatMeta !== 'object') return [];

  const normalizedMessageId =
    messageId != null && Number.isFinite(Number(messageId)) ? Math.trunc(Number(messageId)) : null;
  const out: PluginNativeCacheArtifact[] = [];
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

      const promptToken = buildPromptToken(
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
        alt: String((value as any)?.alt ?? 'generated image').trim() || 'generated image',
        requestId: requestId || undefined,
        anchorText: String((value as any)?.regex ?? (value as any)?.anchorText ?? '').trim() || undefined,
      });
    }
  }

  return out;
}

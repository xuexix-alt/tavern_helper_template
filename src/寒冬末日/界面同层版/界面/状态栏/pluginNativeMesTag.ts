export type NativeMesTagEntry = {
  messageId: number;
  order: number;
  promptToken: string;
  rawTag: string;
  anchorText: string;
};

export type NativeMesTagEntryWithHints = NativeMesTagEntry & {
  requestId?: string;
  src?: string;
};

const NATIVE_IMAGE_TAG_RE = /image###([\s\S]*?)###/g;

function normalizeText(input: unknown): string {
  return String(input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPromptTokenFromPromptBody(promptBody: string): string {
  const body = String(promptBody ?? '').trim();
  return body ? `image###${body}###` : '';
}

function extractPromptBodyFromPromptToken(promptToken: string): string {
  const token = String(promptToken ?? '').trim();
  const matched = token.match(/^image###([\s\S]*?)###$/);
  return String(matched?.[1] ?? '').trim();
}

function pickAnchorFromPrefix(prefix: string): string {
  const lines = String(prefix ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => normalizeText(line))
    .filter(Boolean);

  if (lines.length === 0) return '';
  const nearestLine = lines[lines.length - 1] ?? '';
  if (nearestLine.length <= 96) return nearestLine;
  return nearestLine.slice(-96);
}

export function extractNativeMesAnchorText(input: {
  rawMessage: string;
  rawTag?: string;
  promptToken?: string;
  startIndex?: number;
}): string {
  const rawMessage = String(input?.rawMessage ?? '').replace(/\r\n/g, '\n');
  if (!rawMessage) return '';

  const candidateTag = String(input?.rawTag ?? input?.promptToken ?? '').trim();
  let index = Number.isFinite(Number(input?.startIndex)) ? Math.max(0, Math.trunc(Number(input.startIndex))) : -1;

  if (index < 0 && candidateTag) {
    index = rawMessage.indexOf(candidateTag);
  }

  if (index < 0 && input?.promptToken) {
    const promptBody = extractPromptBodyFromPromptToken(String(input.promptToken));
    if (promptBody) {
      index = rawMessage.indexOf(promptBody);
    }
  }

  if (index < 0) return '';

  const prefix = rawMessage.slice(0, index);
  return pickAnchorFromPrefix(prefix);
}

export function parseNativeMesImageTags(input: { messageId: number; rawMessage: string }): NativeMesTagEntry[] {
  const messageId = Math.trunc(Number(input?.messageId));
  const rawMessage = String(input?.rawMessage ?? '').replace(/\r\n/g, '\n');
  if (!Number.isFinite(messageId) || !rawMessage) return [];

  const out: NativeMesTagEntry[] = [];
  let matched: RegExpExecArray | null = NATIVE_IMAGE_TAG_RE.exec(rawMessage);
  while (matched) {
    const rawTag = String(matched[0] ?? '').trim();
    if (rawTag) {
      const promptBody = String(matched[1] ?? '').trim();
      const promptToken = buildPromptTokenFromPromptBody(promptBody) || rawTag;
      out.push({
        messageId,
        order: out.length,
        promptToken,
        rawTag,
        anchorText: extractNativeMesAnchorText({
          rawMessage,
          rawTag,
          promptToken,
          startIndex: matched.index,
        }),
      });
    }
    matched = NATIVE_IMAGE_TAG_RE.exec(rawMessage);
  }

  NATIVE_IMAGE_TAG_RE.lastIndex = 0;
  return out;
}

export function mergeNativeMesTagsWithExtraEntries(input: {
  tags: NativeMesTagEntry[];
  extraImages?: unknown[];
}): NativeMesTagEntryWithHints[] {
  const tags = Array.isArray(input?.tags) ? input.tags : [];
  const extraImages = Array.isArray(input?.extraImages) ? input.extraImages : [];

  const normalizedExtras = extraImages.map((item, index) => {
    const promptToken = String((item as any)?.promptToken ?? (item as any)?.tag ?? '').trim();
    const prompt = String((item as any)?.prompt ?? '').trim();
    const derivedPromptToken = promptToken || buildPromptTokenFromPromptBody(prompt);
    const requestId = String((item as any)?.requestId ?? (item as any)?.id ?? '').trim();
    const src = String((item as any)?.src ?? (item as any)?.image ?? (item as any)?.url ?? '').trim();

    return {
      index,
      promptToken: derivedPromptToken,
      requestId,
      src,
    };
  });

  const used = new Set<number>();

  return tags.map(tag => {
    const promptToken = String(tag?.promptToken ?? '').trim();
    let matched = normalizedExtras.find(item => {
      if (used.has(item.index)) return false;
      return Boolean(promptToken) && item.promptToken === promptToken;
    });

    if (!matched) {
      matched = normalizedExtras.find(item => !used.has(item.index));
    }

    if (matched) used.add(matched.index);

    return {
      ...tag,
      requestId: matched?.requestId || undefined,
      src: matched?.src || undefined,
    };
  });
}

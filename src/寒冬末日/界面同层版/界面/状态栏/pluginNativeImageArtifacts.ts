import {
  mergeNativeMesTagsWithExtraEntries,
  parseNativeMesImageTags,
  type NativeMesTagEntry,
  type NativeMesTagEntryWithHints,
} from './pluginNativeMesTag.ts';

export type NativeFirstArtifactSource = 'host_dom' | 'extra' | 'mes_tag' | 'cache';

export type NativeFirstImageArtifact = {
  source: NativeFirstArtifactSource;
  messageId: number;
  order: number;
  markerId?: string;
  imageId?: string;
  requestId?: string;
  promptToken?: string;
  rawTag?: string;
  anchorText?: string;
  src?: string;
  alt?: string;
};

export type ReadNativeFirstImageArtifactsInput = {
  messageId: number;
  hostDomArtifacts?: unknown[];
  extraImages?: unknown[];
  rawMessage?: string;
  mesTagEntries?: NativeMesTagEntry[] | NativeMesTagEntryWithHints[];
  cacheArtifacts?: unknown[];
};

export type NativeFirstMembershipEntry = {
  source: NativeFirstArtifactSource;
  markerId?: string;
  imageId?: string;
  requestId?: string;
  promptToken?: string;
  anchorText?: string;
};

function normalizeKey(input: unknown): string {
  return String(input ?? '').trim();
}

function normalizeSrc(input: unknown): string {
  const raw = normalizeKey(input);
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `data:image/png;base64,${raw}`;
}

function normalizeMessageId(input: unknown): number {
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function flattenEntries(input: unknown): Record<string, any>[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap(item => {
    if (Array.isArray(item)) {
      return item.filter((entry): entry is Record<string, any> => Boolean(entry) && typeof entry === 'object');
    }
    if (item && typeof item === 'object') {
      return [item as Record<string, any>];
    }
    return [];
  });
}

function buildArtifactFromRecord(input: {
  source: NativeFirstArtifactSource;
  messageId: number;
  order: number;
  record: Record<string, any>;
}): NativeFirstImageArtifact | null {
  const { record } = input;
  const promptToken = normalizeKey(record?.promptToken) || normalizeKey(record?.tag) || normalizeKey(record?.rawTag);
  const requestId = normalizeKey(record?.requestId ?? record?.request_id);
  const markerId = normalizeKey(record?.markerId);
  const imageId =
    normalizeKey(record?.imageId ?? record?.image_id) ||
    requestId ||
    promptToken ||
    normalizeKey(record?.src ?? record?.image ?? record?.imageData);
  const src = normalizeSrc(record?.src ?? record?.image ?? record?.imageData) || undefined;

  if (!imageId && !promptToken && !requestId && !markerId && !src) {
    return null;
  }

  return {
    source: input.source,
    messageId: input.messageId,
    order: input.order,
    markerId: markerId || undefined,
    imageId: imageId || undefined,
    requestId: requestId || undefined,
    promptToken: promptToken || undefined,
    rawTag: normalizeKey(record?.rawTag) || undefined,
    anchorText: normalizeKey(record?.anchorText) || undefined,
    src,
    alt: normalizeKey(record?.alt) || undefined,
  };
}

function dedupeKey(item: NativeFirstImageArtifact): string {
  return (
    normalizeKey(item.markerId) ||
    normalizeKey(item.imageId) ||
    normalizeKey(item.requestId) ||
    normalizeKey(item.promptToken) ||
    normalizeKey(item.rawTag) ||
    normalizeKey(item.src)
  );
}

function mergeWithPriority(
  seed: NativeFirstImageArtifact[],
  candidates: NativeFirstImageArtifact[],
): NativeFirstImageArtifact[] {
  const out = [...seed];
  const seen = new Set<string>();

  for (const item of out) {
    const key = dedupeKey(item);
    if (key) seen.add(key);
  }

  for (const item of candidates) {
    const key = dedupeKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(item);
  }

  return out;
}

function collectHostArtifacts(input: ReadNativeFirstImageArtifactsInput): NativeFirstImageArtifact[] {
  const messageId = normalizeMessageId(input.messageId);
  const hostEntries = flattenEntries(input.hostDomArtifacts);
  return hostEntries
    .map((record, index) =>
      buildArtifactFromRecord({
        source: 'host_dom',
        messageId,
        order: index,
        record,
      }),
    )
    .filter((item): item is NativeFirstImageArtifact => item !== null);
}

function collectExtraArtifacts(input: ReadNativeFirstImageArtifactsInput): NativeFirstImageArtifact[] {
  const messageId = normalizeMessageId(input.messageId);
  const extraEntries = flattenEntries(input.extraImages);
  return extraEntries
    .map((record, index) =>
      buildArtifactFromRecord({
        source: 'extra',
        messageId,
        order: index,
        record,
      }),
    )
    .filter((item): item is NativeFirstImageArtifact => item !== null);
}

function collectMesTagArtifacts(input: ReadNativeFirstImageArtifactsInput): NativeFirstImageArtifact[] {
  const messageId = normalizeMessageId(input.messageId);
  const parsed =
    Array.isArray(input.mesTagEntries) && input.mesTagEntries.length > 0
      ? (input.mesTagEntries as NativeMesTagEntry[])
      : parseNativeMesImageTags({
          messageId,
          rawMessage: String(input.rawMessage ?? ''),
        });

  const merged = mergeNativeMesTagsWithExtraEntries({
    tags: parsed,
    extraImages: flattenEntries(input.extraImages),
  });

  return merged
    .map((record, index) =>
      buildArtifactFromRecord({
        source: 'mes_tag',
        messageId,
        order: index,
        record,
      }),
    )
    .filter((item): item is NativeFirstImageArtifact => item !== null);
}

function collectCacheArtifacts(input: ReadNativeFirstImageArtifactsInput): NativeFirstImageArtifact[] {
  const messageId = normalizeMessageId(input.messageId);
  const entries = flattenEntries(input.cacheArtifacts);
  return entries
    .map((record, index) =>
      buildArtifactFromRecord({
        source: 'cache',
        messageId,
        order: index,
        record,
      }),
    )
    .filter((item): item is NativeFirstImageArtifact => item !== null);
}

export function readNativeFirstImageArtifacts(input: ReadNativeFirstImageArtifactsInput): NativeFirstImageArtifact[] {
  const hostArtifacts = collectHostArtifacts(input);
  const extraArtifacts = collectExtraArtifacts(input);
  const mesTagArtifacts = collectMesTagArtifacts(input);

  let nativeFirst = mergeWithPriority(hostArtifacts, extraArtifacts);
  nativeFirst = mergeWithPriority(nativeFirst, mesTagArtifacts);

  if (nativeFirst.length > 0) {
    return nativeFirst;
  }

  const cacheArtifacts = collectCacheArtifacts(input);
  if (cacheArtifacts.length > 0) {
    return cacheArtifacts;
  }

  return [];
}

export function readNativeFirstPromptTokens(input: ReadNativeFirstImageArtifactsInput): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const artifact of readNativeFirstImageArtifacts(input)) {
    const promptToken = normalizeKey(artifact.promptToken);
    if (!promptToken || seen.has(promptToken)) continue;
    seen.add(promptToken);
    out.push(promptToken);
  }

  return out;
}

export function readNativeFirstMembershipEntries(
  input: ReadNativeFirstImageArtifactsInput,
): NativeFirstMembershipEntry[] {
  const out: NativeFirstMembershipEntry[] = [];

  for (const artifact of readNativeFirstImageArtifacts(input)) {
    const markerId = normalizeKey(artifact.markerId) || undefined;
    const imageId =
      normalizeKey(artifact.imageId) ||
      normalizeKey(artifact.requestId) ||
      normalizeKey(artifact.promptToken) ||
      normalizeKey(artifact.src) ||
      undefined;
    const requestId = normalizeKey(artifact.requestId) || undefined;
    const promptToken = normalizeKey(artifact.promptToken) || undefined;
    const anchorText = normalizeKey(artifact.anchorText) || undefined;

    if (!markerId && !imageId && !requestId && !promptToken) continue;

    out.push({
      source: artifact.source,
      markerId,
      imageId,
      requestId,
      promptToken,
      anchorText,
    });
  }

  return out;
}

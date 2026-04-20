import _ from 'lodash';
import type { GeneratedImageRef } from './types';

export const GALLERY_CATALOG_VERSION = 1;
export const GALLERY_CATALOG_PLUGIN_KEY = 'st-chatu8';
export const GALLERY_CATALOG_METADATA_PATH = 'same_layer.gallery_catalog_v1';
export const GALLERY_CATALOG_FALLBACK_VAR_PATH = 'stream_demo.gallery_catalog_v1';
export const GALLERY_CATALOG_LOCAL_CACHE_KEY_PREFIX = 'st-chatu8.same_layer.gallery_catalog.v1';

export type GalleryCatalogEntry = GeneratedImageRef & {
  firstSeenAt: string;
  lastSeenAt: string;
  readyAt: string;
};

export type GalleryCatalogRecord = {
  version: number;
  chatId: string;
  updatedAt: string;
  entries: GalleryCatalogEntry[];
};

export function buildGalleryCatalogReadDebugPayload(input: {
  chatId: string;
  metadataRecord?: { entries?: unknown[] } | null;
  localRecord?: { entries?: unknown[] } | null;
  fallbackRecord?: { entries?: unknown[] } | null;
  mergedEntries?: unknown[];
}) {
  return {
    chatId: normalizeText(input.chatId),
    metadataCount: Array.isArray(input.metadataRecord?.entries) ? input.metadataRecord.entries.length : 0,
    localCount: Array.isArray(input.localRecord?.entries) ? input.localRecord.entries.length : 0,
    fallbackCount: Array.isArray(input.fallbackRecord?.entries) ? input.fallbackRecord.entries.length : 0,
    mergedCount: Array.isArray(input.mergedEntries) ? input.mergedEntries.length : 0,
  };
}

export function buildGalleryCatalogWriteDebugPayload(input: {
  record: { chatId?: string; entries?: unknown[] } | null | undefined;
  wroteMetadata: boolean;
  wroteFallback: boolean;
}) {
  return {
    chatId: normalizeText(input.record?.chatId),
    entryCount: Array.isArray(input.record?.entries) ? input.record.entries.length : 0,
    wroteMetadata: input.wroteMetadata === true,
    wroteFallback: input.wroteFallback === true,
  };
}

function listReachableHostWindows(): Array<Window & typeof globalThis> {
  const windows: Array<Window & typeof globalThis> = [];
  const seen = new Set<Window>();
  const push = (candidate: Window | null | undefined) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    windows.push(candidate as Window & typeof globalThis);
  };

  if (typeof window === 'undefined') return windows;

  push(window);
  try {
    push(window.parent);
  } catch {
    /* cross-origin */
  }
  try {
    push(window.top);
  } catch {
    /* cross-origin */
  }

  return windows;
}

function readHostContext(): any {
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const ctx = (hostWindow as any)?.SillyTavern?.getContext?.();
      if (ctx) return ctx;
    } catch {
      /* cross-origin */
    }
  }
  return null;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeMessageId(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
}

function normalizeCreatedOrder(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.trunc(numeric);
}

function normalizeTimestamp(value: unknown, fallback = new Date().toISOString()): string {
  const raw = normalizeText(value);
  if (!raw) return fallback;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function isReadySrc(src: string): boolean {
  const normalized = normalizeText(src);
  if (!normalized) return false;
  if (normalized.startsWith('idb://')) return false;
  return true;
}

function resolveCanonicalId(entry: Partial<GeneratedImageRef> | null | undefined): string {
  const messageId = normalizeMessageId(entry?.messageId) ?? 0;
  const markerId = normalizeText(entry?.markerId);
  const imageId = normalizeText(entry?.imageId);
  const requestId = normalizeText(entry?.requestId);
  const promptToken = normalizeText(entry?.promptToken);
  const anchorText = normalizeText(entry?.anchorText);
  const id = normalizeText(entry?.id);
  return (
    markerId ||
    id ||
    imageId ||
    requestId ||
    `${messageId}::${promptToken || anchorText || normalizeCreatedOrder(entry?.createdOrder)}`
  );
}

export function normalizeGalleryCatalogEntry(raw: unknown, now = new Date().toISOString()): GalleryCatalogEntry | null {
  if (!raw || typeof raw !== 'object') return null;

  const entry = raw as Partial<GalleryCatalogEntry>;
  const messageId = normalizeMessageId(entry.messageId);
  const src = normalizeText(entry.src);
  const promptToken = normalizeText(entry.promptToken);
  const canonicalId = resolveCanonicalId(entry);
  if (messageId == null || !canonicalId || !isReadySrc(src)) return null;

  const title = normalizeText(entry.title) || `楼层 #${messageId} 图像`;
  const firstSeenAt = normalizeTimestamp(entry.firstSeenAt, now);
  const readyAt = normalizeTimestamp(entry.readyAt ?? entry.firstSeenAt, firstSeenAt);
  const lastSeenAt = normalizeTimestamp(entry.lastSeenAt ?? entry.readyAt ?? entry.firstSeenAt, now);

  return {
    id: canonicalId,
    messageId,
    markerId: normalizeText(entry.markerId) || undefined,
    imageId: normalizeText(entry.imageId) || undefined,
    promptToken,
    requestId: normalizeText(entry.requestId) || undefined,
    anchorText: normalizeText(entry.anchorText) || undefined,
    title,
    characterName: normalizeText(entry.characterName) || undefined,
    createdOrder: normalizeCreatedOrder(entry.createdOrder),
    src,
    alt: normalizeText(entry.alt) || undefined,
    firstSeenAt,
    lastSeenAt,
    readyAt,
  };
}

function mergeGalleryCatalogEntry(
  existing: GalleryCatalogEntry | null | undefined,
  incoming: GalleryCatalogEntry,
  now = new Date().toISOString(),
): GalleryCatalogEntry {
  if (!existing) {
    return {
      ...incoming,
      firstSeenAt: normalizeTimestamp(incoming.firstSeenAt, now),
      readyAt: normalizeTimestamp(incoming.readyAt, normalizeTimestamp(incoming.firstSeenAt, now)),
      lastSeenAt: normalizeTimestamp(incoming.lastSeenAt, now),
    };
  }

  return {
    ...existing,
    ...incoming,
    id: resolveCanonicalId(incoming) || existing.id,
    messageId: normalizeMessageId(incoming.messageId) ?? existing.messageId,
    markerId: normalizeText(incoming.markerId) || existing.markerId,
    imageId: normalizeText(incoming.imageId) || existing.imageId,
    promptToken: normalizeText(incoming.promptToken) || existing.promptToken,
    requestId: normalizeText(incoming.requestId) || existing.requestId,
    anchorText: normalizeText(incoming.anchorText) || existing.anchorText,
    title: normalizeText(incoming.title) || existing.title,
    characterName: normalizeText(incoming.characterName) || existing.characterName,
    createdOrder: Math.min(normalizeCreatedOrder(existing.createdOrder), normalizeCreatedOrder(incoming.createdOrder)),
    src: normalizeText(incoming.src) || existing.src,
    alt: normalizeText(incoming.alt) || existing.alt,
    firstSeenAt:
      Date.parse(existing.firstSeenAt) <= Date.parse(incoming.firstSeenAt)
        ? existing.firstSeenAt
        : incoming.firstSeenAt,
    readyAt: Date.parse(existing.readyAt) <= Date.parse(incoming.readyAt) ? existing.readyAt : incoming.readyAt,
    lastSeenAt: normalizeTimestamp(incoming.lastSeenAt, now),
  };
}

export function mergeGalleryCatalogEntries(input: {
  persistedEntries?: unknown[];
  liveEntries?: unknown[];
  now?: string;
}): GalleryCatalogEntry[] {
  const now = normalizeTimestamp(input.now);
  const records = new Map<string, GalleryCatalogEntry>();

  const apply = (rawEntry: unknown) => {
    const normalized = normalizeGalleryCatalogEntry(rawEntry, now);
    if (!normalized) return;
    const canonicalId = resolveCanonicalId(normalized);
    const existing = records.get(canonicalId);
    records.set(canonicalId, mergeGalleryCatalogEntry(existing, normalized, now));
  };

  for (const entry of Array.isArray(input.persistedEntries) ? input.persistedEntries : []) {
    apply(entry);
  }
  for (const entry of Array.isArray(input.liveEntries) ? input.liveEntries : []) {
    apply(entry);
  }

  return Array.from(records.values()).sort((left, right) => {
    if (left.messageId !== right.messageId) return right.messageId - left.messageId;
    if (left.createdOrder !== right.createdOrder) return left.createdOrder - right.createdOrder;
    return left.id.localeCompare(right.id);
  });
}

export function normalizeGalleryCatalogRecord(
  raw: unknown,
  fallbackChatId = '',
  now = new Date().toISOString(),
): GalleryCatalogRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<GalleryCatalogRecord>;
  const version = Number(record.version);
  const chatId = normalizeText(record.chatId) || normalizeText(fallbackChatId);
  if ((!Number.isFinite(version) && version !== 0) || !chatId) return null;

  return {
    version: GALLERY_CATALOG_VERSION,
    chatId,
    updatedAt: normalizeTimestamp(record.updatedAt, now),
    entries: mergeGalleryCatalogEntries({
      persistedEntries: Array.isArray(record.entries) ? record.entries : [],
      now,
    }),
  };
}

export function buildGalleryCatalogRecord(input: {
  chatId: string;
  existingRecord?: GalleryCatalogRecord | null;
  liveEntries?: unknown[];
  now?: string;
}): GalleryCatalogRecord {
  const now = normalizeTimestamp(input.now);
  const chatId = normalizeText(input.chatId);
  const existingRecord = normalizeGalleryCatalogRecord(input.existingRecord, chatId, now);

  return {
    version: GALLERY_CATALOG_VERSION,
    chatId,
    updatedAt: now,
    entries: mergeGalleryCatalogEntries({
      persistedEntries: existingRecord?.entries ?? [],
      liveEntries: Array.isArray(input.liveEntries) ? input.liveEntries : [],
      now,
    }),
  };
}

function getLocalStorageTarget(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function buildLocalCacheKey(chatId: string): string {
  return `${GALLERY_CATALOG_LOCAL_CACHE_KEY_PREFIX}::${normalizeText(chatId) || 'unknown'}`;
}

function readLocalGalleryCatalogRecord(chatId: string): GalleryCatalogRecord | null {
  const target = getLocalStorageTarget();
  if (!target || !chatId) return null;
  try {
    const raw = target.getItem(buildLocalCacheKey(chatId));
    if (!raw) return null;
    return normalizeGalleryCatalogRecord(JSON.parse(raw), chatId);
  } catch {
    return null;
  }
}

function writeLocalGalleryCatalogRecord(record: GalleryCatalogRecord): void {
  const target = getLocalStorageTarget();
  if (!target || !record.chatId) return;
  try {
    target.setItem(buildLocalCacheKey(record.chatId), JSON.stringify(record));
  } catch {
    // non-fatal
  }
}

function readFallbackVariableGalleryCatalogRecord(chatId: string): GalleryCatalogRecord | null {
  try {
    const vars = getVariables?.({ type: 'chat' }) ?? {};
    const raw = _.get(vars, GALLERY_CATALOG_FALLBACK_VAR_PATH, null);
    return normalizeGalleryCatalogRecord(raw, chatId);
  } catch {
    return null;
  }
}

function writeFallbackVariableGalleryCatalogRecord(record: GalleryCatalogRecord): void {
  try {
    if (typeof updateVariablesWith !== 'function') return;
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        _.set(vars, GALLERY_CATALOG_FALLBACK_VAR_PATH, record);
        return vars;
      },
      { type: 'chat' },
    );
  } catch {
    // non-fatal
  }
}

function readMetadataGalleryCatalogRecord(chatId: string): GalleryCatalogRecord | null {
  const ctx = readHostContext();
  const raw = _.get(ctx?.chatMetadata?.[GALLERY_CATALOG_PLUGIN_KEY], GALLERY_CATALOG_METADATA_PATH, null);
  return normalizeGalleryCatalogRecord(raw, chatId);
}

async function writeMetadataGalleryCatalogRecord(record: GalleryCatalogRecord): Promise<boolean> {
  const windows = listReachableHostWindows();
  for (const hostWindow of windows) {
    try {
      const context = (hostWindow as any)?.SillyTavern?.getContext?.();
      const currentNamespace =
        _.cloneDeep(
          (hostWindow as any)?.chat_metadata?.[GALLERY_CATALOG_PLUGIN_KEY] ??
            context?.chatMetadata?.[GALLERY_CATALOG_PLUGIN_KEY] ??
            {},
        ) ?? {};
      _.set(currentNamespace, GALLERY_CATALOG_METADATA_PATH, record);

      if (typeof (hostWindow as any)?.updateChatMetadata === 'function') {
        (hostWindow as any).updateChatMetadata({ [GALLERY_CATALOG_PLUGIN_KEY]: currentNamespace });
      } else if ((hostWindow as any)?.chat_metadata && typeof (hostWindow as any).chat_metadata === 'object') {
        (hostWindow as any).chat_metadata[GALLERY_CATALOG_PLUGIN_KEY] = currentNamespace;
      } else if (context?.chatMetadata && typeof context.chatMetadata === 'object') {
        context.chatMetadata[GALLERY_CATALOG_PLUGIN_KEY] = currentNamespace;
      } else {
        continue;
      }

      if ((hostWindow as any)?.chat_metadata && typeof (hostWindow as any).chat_metadata === 'object') {
        (hostWindow as any).chat_metadata.tainted = true;
      }
      if (context?.chatMetadata && typeof context.chatMetadata === 'object') {
        context.chatMetadata.tainted = true;
      }

      if (typeof (hostWindow as any)?.saveMetadata === 'function') {
        await (hostWindow as any).saveMetadata();
      } else if (typeof (hostWindow as any)?.saveChatConditional === 'function') {
        await (hostWindow as any).saveChatConditional();
      }
      return true;
    } catch {
      // try next reachable host window
    }
  }
  return false;
}

export function resolveGalleryCatalogChatId(): string {
  const ctx = readHostContext();
  const fromContext = normalizeText(ctx?.chatId ?? ctx?.getCurrentChatId?.());
  if (fromContext) return fromContext;
  try {
    return normalizeText((globalThis as any).SillyTavern?.getCurrentChatId?.());
  } catch {
    return '';
  }
}

export function readGalleryCatalogRecord(): GalleryCatalogRecord | null {
  const chatId = resolveGalleryCatalogChatId();
  if (!chatId) return null;

  const metadataRecord = readMetadataGalleryCatalogRecord(chatId);
  const localRecord = readLocalGalleryCatalogRecord(chatId);
  const fallbackRecord = readFallbackVariableGalleryCatalogRecord(chatId);
  const mergedEntries = mergeGalleryCatalogEntries({
    persistedEntries: [
      ...(metadataRecord?.entries ?? []),
      ...(localRecord?.entries ?? []),
      ...(fallbackRecord?.entries ?? []),
    ],
  });

  if (mergedEntries.length === 0 && !metadataRecord && !localRecord && !fallbackRecord) {
    return null;
  }

  console.info(
    '[gallery-catalog] read',
    buildGalleryCatalogReadDebugPayload({
      chatId,
      metadataRecord,
      localRecord,
      fallbackRecord,
      mergedEntries,
    }),
  );

  return {
    version: GALLERY_CATALOG_VERSION,
    chatId,
    updatedAt: normalizeTimestamp(
      metadataRecord?.updatedAt ?? localRecord?.updatedAt ?? fallbackRecord?.updatedAt ?? new Date().toISOString(),
    ),
    entries: mergedEntries,
  };
}

export async function writeGalleryCatalogRecord(record: GalleryCatalogRecord): Promise<void> {
  const normalized = buildGalleryCatalogRecord({
    chatId: record.chatId || resolveGalleryCatalogChatId(),
    existingRecord: record,
    liveEntries: record.entries,
    now: record.updatedAt,
  });

  writeLocalGalleryCatalogRecord(normalized);

  const wroteMetadata = await writeMetadataGalleryCatalogRecord(normalized);
  let wroteFallback = false;
  if (!wroteMetadata) {
    writeFallbackVariableGalleryCatalogRecord(normalized);
    wroteFallback = true;
  }

  console.info(
    '[gallery-catalog] write',
    buildGalleryCatalogWriteDebugPayload({
      record: normalized,
      wroteMetadata,
      wroteFallback,
    }),
  );
}

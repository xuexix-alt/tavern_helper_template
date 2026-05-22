import type { ReaderGalleryEntry } from './types';

export type RolePortraitSource = 'default' | 'gallery';

export type RolePortraitRole = {
  key: string;
  label: string;
};

export type RolePortraitImageRef = {
  messageId: number;
  markerId?: string;
  imageId?: string;
  requestId?: string;
  promptToken?: string;
  createdOrder?: number;
};

export type RolePortraitImageSnapshot = RolePortraitImageRef & {
  id: string;
  title?: string;
  characterName?: string;
  src?: string;
  alt?: string;
};

export type RolePortraitOverride = {
  roleKey: string;
  /** Legacy/current primary portrait ref. Kept so older saved settings continue to resolve. */
  imageRef?: RolePortraitImageRef;
  imageRefs?: RolePortraitImageRef[];
  imageSnapshot?: RolePortraitImageSnapshot;
  imageSnapshots?: RolePortraitImageSnapshot[];
  updatedAt: number;
  /** User explicitly cancelled a custom portrait; keep this tombstone so auto gallery matching does not reselect it. */
  clearedAt?: number;
};

export type RolePortraitOverrideMap = Record<string, RolePortraitOverride>;

export type ResolvedRolePortrait = {
  src: string;
  alt: string;
  source: RolePortraitSource;
  entry?: ReaderGalleryEntry;
};

const SETTINGS_KEY = 'same_layer_role_portraits';
const CHAT_SETTINGS_ROOT = 'stream_demo';
const CHAT_SETTINGS_KEY = 'role_portraits';
const PROJECT_ROLE_NAME_ALIASES = [
  ['林月华', 'Lin Yuehua'],
  ['陈雪', 'Chen Xue'],
  ['赵卫国', 'Zhao Weiguo'],
  ['陈幺妹', 'Chen Yaomei'],
  ['何铃', 'He Ling'],
  ['雪乃', 'Yukino', 'Yukinoshita', 'Fujii Yukino', '藤井雪乃'],
];

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeNameWithoutParenthetical(value: unknown) {
  return normalizeText(value)
    .replace(/\s*[\(（][^)）]+[\)）]\s*$/g, '')
    .trim();
}

/**
 * 预编译的别名索引：normalized alias → 同组内所有别名（含去括号副本）。
 *
 * `buildNameCandidates` 每次调用都要重建 Set + 遍历所有别名组；
 * 这张索引把"给定一个候选名，它属于哪些别名组"这层映射提前算好，
 * 查表即 O(aliases)。所有 `resolveRolePortrait` / `findGalleryEntriesForRole`
 * 都会复用它，合起来一次 rebuild 能省大量字符串处理。
 */
const ALIAS_GROUP_INDEX: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>();
  for (const aliasGroup of PROJECT_ROLE_NAME_ALIASES) {
    const expanded = new Set<string>();
    for (const alias of aliasGroup) {
      const normalized = normalizeText(alias);
      const withoutParenthetical = normalizeNameWithoutParenthetical(alias);
      if (normalized) expanded.add(normalized);
      if (withoutParenthetical) expanded.add(withoutParenthetical);
    }
    for (const key of expanded) {
      const existing = index.get(key);
      if (existing) {
        for (const alias of expanded) existing.add(alias);
      } else {
        index.set(key, new Set(expanded));
      }
    }
  }
  return index;
})();

function buildNameCandidates(...values: unknown[]) {
  const candidates = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    const withoutParenthetical = normalizeNameWithoutParenthetical(value);
    if (normalized) candidates.add(normalized);
    if (withoutParenthetical) candidates.add(withoutParenthetical);
  }

  // 通过预编译索引一次性拉入同组所有别名，避免每次全量遍历 PROJECT_ROLE_NAME_ALIASES。
  const pending = Array.from(candidates);
  for (const candidate of pending) {
    const group = ALIAS_GROUP_INDEX.get(candidate);
    if (!group) continue;
    for (const alias of group) candidates.add(alias);
  }

  return Array.from(candidates);
}

function normalizeRoleKey(value: unknown) {
  return String(value ?? '').trim();
}

function hasImageSource(entry: ReaderGalleryEntry) {
  return Boolean(String(entry.src ?? '').trim());
}

function buildRolePortraitImageRef(entry: ReaderGalleryEntry): RolePortraitImageRef {
  const ref: RolePortraitImageRef = {
    messageId: entry.messageId,
  };
  if (entry.markerId) ref.markerId = entry.markerId;
  if (entry.imageId) ref.imageId = entry.imageId;
  if (entry.requestId) ref.requestId = entry.requestId;
  if (entry.promptToken) ref.promptToken = entry.promptToken;
  const hasStablePluginId = Boolean(ref.markerId || ref.imageId || ref.requestId);
  if (!hasStablePluginId && Number.isFinite(Number(entry.createdOrder))) {
    ref.createdOrder = Math.trunc(Number(entry.createdOrder));
  }
  return ref;
}

function buildRolePortraitImageSnapshot(entry: ReaderGalleryEntry): RolePortraitImageSnapshot {
  const snapshot: RolePortraitImageSnapshot = {
    ...buildRolePortraitImageRef(entry),
    id: String(entry.id ?? ''),
  };
  if (entry.title) snapshot.title = entry.title;
  if (entry.characterName) snapshot.characterName = entry.characterName;
  if (entry.src) snapshot.src = entry.src;
  if (entry.alt) snapshot.alt = entry.alt;
  return snapshot;
}

function imageRefKey(ref: RolePortraitImageRef) {
  return [
    ref.messageId,
    ref.markerId ?? '',
    ref.imageId ?? '',
    ref.requestId ?? '',
    ref.promptToken ?? '',
    ref.createdOrder ?? '',
  ].join('::');
}

function snapshotToGalleryEntry(snapshot: RolePortraitImageSnapshot): ReaderGalleryEntry | undefined {
  if (!hasImageSource(snapshot as ReaderGalleryEntry)) return undefined;
  return {
    id: snapshot.id || imageRefKey(snapshot),
    messageId: snapshot.messageId,
    markerId: snapshot.markerId,
    imageId: snapshot.imageId,
    requestId: snapshot.requestId,
    promptToken: snapshot.promptToken,
    title: snapshot.title || snapshot.characterName || `楼层 #${snapshot.messageId} · 立绘`,
    characterName: snapshot.characterName,
    createdOrder: Number.isFinite(Number(snapshot.createdOrder)) ? Math.trunc(Number(snapshot.createdOrder)) : 0,
    src: snapshot.src,
    alt: snapshot.alt,
  } as ReaderGalleryEntry;
}

function entryMatchesImageRef(entry: ReaderGalleryEntry, ref: RolePortraitImageRef) {
  if (entry.messageId !== ref.messageId) return false;
  if (ref.markerId && entry.markerId === ref.markerId) return true;
  if (ref.imageId && entry.imageId === ref.imageId) return true;
  if (ref.requestId && entry.requestId === ref.requestId) return true;
  const hasOrderRef = Number.isFinite(Number(ref.createdOrder));
  if (hasOrderRef && entry.createdOrder !== ref.createdOrder) return false;
  if (ref.promptToken && entry.promptToken === ref.promptToken) return true;
  return (
    !ref.markerId &&
    !ref.imageId &&
    !ref.requestId &&
    !ref.promptToken &&
    (!hasOrderRef || entry.createdOrder === ref.createdOrder)
  );
}

function listOverrideRefs(override?: RolePortraitOverride | null): RolePortraitImageRef[] {
  if (!override || isRolePortraitOverrideCleared(override)) return [];
  const out: RolePortraitImageRef[] = [];
  const seen = new Set<string>();
  for (const ref of [...(override.imageRefs ?? []), override.imageRef].filter(Boolean)) {
    const key = imageRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function listOverrideSnapshots(override?: RolePortraitOverride | null): RolePortraitImageSnapshot[] {
  if (!override || isRolePortraitOverrideCleared(override)) return [];
  const out: RolePortraitImageSnapshot[] = [];
  const seen = new Set<string>();
  for (const snapshot of [...(override.imageSnapshots ?? []), override.imageSnapshot].filter(Boolean)) {
    const key = imageRefKey(snapshot);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(snapshot);
  }
  return out;
}

function isRolePortraitOverrideCleared(override?: RolePortraitOverride | null) {
  return Number.isFinite(Number(override?.clearedAt));
}

function findEntriesForRefs(entries: ReaderGalleryEntry[], refs: RolePortraitImageRef[]) {
  const out: ReaderGalleryEntry[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const entry = entries.find(candidate => hasImageSource(candidate) && entryMatchesImageRef(candidate, ref));
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

function findEntryForRef(entries: ReaderGalleryEntry[], ref?: RolePortraitImageRef) {
  if (!ref) return undefined;
  return entries.find(candidate => hasImageSource(candidate) && entryMatchesImageRef(candidate, ref));
}

function findEntriesForSnapshots(
  entries: ReaderGalleryEntry[],
  snapshots: RolePortraitImageSnapshot[],
): ReaderGalleryEntry[] {
  const out: ReaderGalleryEntry[] = [];
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    const entry = findEntryForRef(entries, snapshot) ?? snapshotToGalleryEntry(snapshot);
    if (!entry || !hasImageSource(entry) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

function findEntryForSnapshot(
  entries: ReaderGalleryEntry[],
  snapshot?: RolePortraitImageSnapshot,
): ReaderGalleryEntry | undefined {
  if (!snapshot) return undefined;
  return findEntryForRef(entries, snapshot) ?? snapshotToGalleryEntry(snapshot);
}

function sortNewestFirst(entries: ReaderGalleryEntry[]) {
  return [...entries].sort((a, b) => {
    if (b.messageId !== a.messageId) return b.messageId - a.messageId;
    return b.createdOrder - a.createdOrder;
  });
}

/**
 * 预处理画廊条目：过滤掉没有图源的，再按 "楼层更新、同楼层按创建顺序" 降序排一次。
 *
 * 后续 `findGalleryEntriesForRole`、`resolveRolePortrait`、`resolveRolePortraitSet`
 * 都可复用同一份 `readyEntries`，避免每角色独立 `entries.filter().sort()`。
 */
export type RolePortraitLookup = {
  readyEntries: ReaderGalleryEntry[];
};

export function prepareRolePortraitLookup(entries: ReaderGalleryEntry[]): RolePortraitLookup {
  return { readyEntries: sortNewestFirst(entries.filter(hasImageSource)) };
}

function resolveLookup(lookup: RolePortraitLookup | undefined, entries: ReaderGalleryEntry[]): RolePortraitLookup {
  return lookup ?? prepareRolePortraitLookup(entries);
}

export function findGalleryEntryForRole(
  role: RolePortraitRole,
  entries: ReaderGalleryEntry[],
  lookup?: RolePortraitLookup,
) {
  return findGalleryEntriesForRole(role, entries, lookup)[0];
}

export function findGalleryEntriesForRole(
  role: RolePortraitRole,
  entries: ReaderGalleryEntry[],
  lookup?: RolePortraitLookup,
) {
  const roleNames = buildNameCandidates(role.label, role.key);
  const readyEntries = resolveLookup(lookup, entries).readyEntries;

  const matched: ReaderGalleryEntry[] = [];
  const seen = new Set<string>();

  for (const entry of readyEntries) {
    const characterNames = buildNameCandidates(entry.characterName);
    if (!characterNames.some(characterName => roleNames.includes(characterName))) continue;
    seen.add(entry.id);
    matched.push(entry);
  }

  for (const entry of readyEntries) {
    if (seen.has(entry.id)) continue;
    const haystack = normalizeText([entry.title, entry.promptToken, entry.anchorText].filter(Boolean).join(' '));
    if (!roleNames.some(name => name && haystack.includes(name))) continue;
    seen.add(entry.id);
    matched.push(entry);
  }

  return matched;
}

export function buildRolePortraitOverride(roleKey: string, entry: ReaderGalleryEntry): RolePortraitOverride {
  const imageRef = buildRolePortraitImageRef(entry);
  const imageSnapshot = buildRolePortraitImageSnapshot(entry);
  return {
    roleKey: normalizeRoleKey(roleKey),
    imageRef,
    imageRefs: [imageRef],
    imageSnapshot,
    imageSnapshots: [imageSnapshot],
    updatedAt: Date.now(),
  };
}

export function addRolePortraitSetImage(
  roleKey: string,
  current: RolePortraitOverride | undefined,
  entry: ReaderGalleryEntry,
): RolePortraitOverride {
  const imageRef = buildRolePortraitImageRef(entry);
  const imageSnapshot = buildRolePortraitImageSnapshot(entry);
  const refs = [...listOverrideRefs(current), imageRef];
  const seen = new Set<string>();
  const imageRefs = refs.filter(ref => {
    const key = imageRefKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const snapshots = [...listOverrideSnapshots(current), imageSnapshot];
  const seenSnapshots = new Set<string>();
  const imageSnapshots = snapshots.filter(snapshot => {
    const key = imageRefKey(snapshot);
    if (seenSnapshots.has(key)) return false;
    seenSnapshots.add(key);
    return true;
  });

  return {
    roleKey: normalizeRoleKey(roleKey),
    imageRef: current?.imageRef ?? imageRef,
    imageRefs,
    imageSnapshot: current?.imageSnapshot ?? imageSnapshot,
    imageSnapshots,
    updatedAt: Date.now(),
  };
}

export function setPrimaryRolePortraitOverride(
  roleKey: string,
  current: RolePortraitOverride | undefined,
  entry: ReaderGalleryEntry,
): RolePortraitOverride {
  const override = addRolePortraitSetImage(roleKey, current, entry);
  return {
    ...override,
    imageRef: buildRolePortraitImageRef(entry),
    imageSnapshot: buildRolePortraitImageSnapshot(entry),
  };
}

export function resolveRolePortraitSet(
  role: RolePortraitRole,
  entries: ReaderGalleryEntry[],
  overrides: RolePortraitOverrideMap,
  options: { defaultEntries?: ReaderGalleryEntry[]; lookup?: RolePortraitLookup } = {},
): ReaderGalleryEntry[] {
  const defaultEntries = options.defaultEntries ?? [];
  const lookup = resolveLookup(options.lookup, entries);
  const override = overrides[role.key];
  const isCleared = isRolePortraitOverrideCleared(override);
  // 默认图也参与覆盖查找，这样"选过一张默认真人设定图"会被持久化并复用。
  const overrideLookupPool = [...entries, ...defaultEntries];
  const overrideEntries = isCleared ? [] : findEntriesForRefs(overrideLookupPool, listOverrideRefs(override));
  const overrideSnapshotEntries = isCleared
    ? []
    : findEntriesForSnapshots(overrideLookupPool, listOverrideSnapshots(override));
  const matchedEntries = isCleared ? [] : findGalleryEntriesForRole(role, entries, lookup);
  const out: ReaderGalleryEntry[] = [];
  const seen = new Set<string>();
  for (const entry of [...overrideEntries, ...overrideSnapshotEntries, ...matchedEntries]) {
    if (!entry?.src || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  const defaultIds = new Set(defaultEntries.map(entry => entry.id));
  const hasNonDefaultEntry = out.some(entry => !defaultIds.has(entry.id));
  if (!hasNonDefaultEntry && defaultEntries.length > 0) {
    for (const entry of defaultEntries) {
      if (!entry?.src || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

export function resolveRolePortrait(
  role: RolePortraitRole,
  entries: ReaderGalleryEntry[],
  overrides: RolePortraitOverrideMap,
  options: { defaultSrc: string; defaultEntries?: ReaderGalleryEntry[]; lookup?: RolePortraitLookup },
): ResolvedRolePortrait {
  const override = overrides[role.key];
  const defaultEntries = options.defaultEntries ?? [];
  const lookup = resolveLookup(options.lookup, entries);
  const isCleared = isRolePortraitOverrideCleared(override);
  const overrideLookupPool = [...entries, ...defaultEntries];
  const overrideEntry = isCleared
    ? undefined
    : (findEntryForRef(overrideLookupPool, override?.imageRef) ??
      findEntryForSnapshot(overrideLookupPool, override?.imageSnapshot) ??
      findEntriesForRefs(overrideLookupPool, listOverrideRefs(override))[0] ??
      findEntriesForSnapshots(overrideLookupPool, listOverrideSnapshots(override))[0]);
  const entry = overrideEntry ?? (isCleared ? undefined : findGalleryEntryForRole(role, entries, lookup));

  if (entry?.src) {
    // 若命中的是默认图，source 保持 default，避免 UI 误判为"画廊设定"。
    const isDefaultEntry = defaultEntries.some(candidate => candidate.id === entry.id);
    return {
      src: entry.src,
      alt: entry.alt || `${role.label} ${isDefaultEntry ? '默认人物设定图' : '人物设定图'}`,
      source: isDefaultEntry ? 'default' : 'gallery',
      entry,
    };
  }

  const defaultEntry = defaultEntries.find(candidate => Boolean(candidate?.src));
  if (defaultEntry) {
    return {
      src: defaultEntry.src!,
      alt: defaultEntry.alt || `${role.label} 默认人物设定图`,
      source: 'default',
      entry: defaultEntry,
    };
  }

  return {
    src: options.defaultSrc,
    alt: `${role.label} 默认人物设定图`,
    source: 'default',
  };
}

export function clearRolePortraitOverride(roleKey: string): RolePortraitOverride {
  const now = Date.now();
  return {
    roleKey: normalizeRoleKey(roleKey),
    imageRefs: [],
    updatedAt: now,
    clearedAt: now,
  };
}

export function readRolePortraitOverrides(): RolePortraitOverrideMap {
  const chatValue = readChatRolePortraitOverrides();
  if (chatValue) return chatValue;

  const legacyValue = readLegacyScriptRolePortraitOverrides();
  if (legacyValue) {
    writeRolePortraitOverrides(legacyValue);
    return legacyValue;
  }

  return {};
}

export function writeRolePortraitOverrides(overrides: RolePortraitOverrideMap) {
  if (writeChatRolePortraitOverrides(overrides)) return;
  writeLegacyScriptRolePortraitOverrides(overrides);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readChatRolePortraitOverrides(): RolePortraitOverrideMap | null {
  try {
    if (typeof getVariables !== 'function') return null;
    const raw = getVariables({ type: 'chat' }) as Record<string, any>;
    const value = raw?.[CHAT_SETTINGS_ROOT]?.[CHAT_SETTINGS_KEY];
    return isRecord(value) ? (value as RolePortraitOverrideMap) : null;
  } catch {
    return null;
  }
}

function readLegacyScriptRolePortraitOverrides(): RolePortraitOverrideMap | null {
  try {
    if (typeof getVariables !== 'function') return null;
    const option =
      typeof getScriptId === 'function'
        ? ({ type: 'script', script_id: getScriptId() } as const)
        : ({ type: 'script' } as const);
    const raw = getVariables(option) as Record<string, any>;
    const value = raw?.[SETTINGS_KEY];
    return isRecord(value) ? (value as RolePortraitOverrideMap) : null;
  } catch {
    return null;
  }
}

function withChatRolePortraitOverrides(
  raw: Record<string, any> | null | undefined,
  overrides: RolePortraitOverrideMap,
): Record<string, any> {
  const next = { ...(raw ?? {}) };
  const root = isRecord(next[CHAT_SETTINGS_ROOT]) ? { ...next[CHAT_SETTINGS_ROOT] } : {};
  root[CHAT_SETTINGS_KEY] = overrides;
  next[CHAT_SETTINGS_ROOT] = root;
  return next;
}

function writeChatRolePortraitOverrides(overrides: RolePortraitOverrideMap): boolean {
  try {
    if (typeof updateVariablesWith === 'function') {
      updateVariablesWith(
        variables => withChatRolePortraitOverrides(variables, overrides),
        { type: 'chat' },
      );
      return true;
    }
    if (typeof getVariables === 'function' && typeof replaceVariables === 'function') {
      const current = (getVariables({ type: 'chat' }) ?? {}) as Record<string, any>;
      replaceVariables(withChatRolePortraitOverrides(current, overrides), { type: 'chat' });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function writeLegacyScriptRolePortraitOverrides(overrides: RolePortraitOverrideMap) {
  try {
    if (typeof getVariables !== 'function' || typeof replaceVariables !== 'function') return;
    const option =
      typeof getScriptId === 'function'
        ? ({ type: 'script', script_id: getScriptId() } as const)
        : ({ type: 'script' } as const);
    const current = (getVariables(option) ?? {}) as Record<string, any>;
    replaceVariables({ ...current, [SETTINGS_KEY]: overrides }, option);
  } catch {
    // Tavern Helper globals are absent in unit tests and some local tooling paths.
  }
}

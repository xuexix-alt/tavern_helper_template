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

export type RolePortraitOverride = {
  roleKey: string;
  /** Legacy/current primary portrait ref. Kept so older saved settings continue to resolve. */
  imageRef: RolePortraitImageRef;
  imageRefs?: RolePortraitImageRef[];
  updatedAt: number;
};

export type RolePortraitOverrideMap = Record<string, RolePortraitOverride>;

export type ResolvedRolePortrait = {
  src: string;
  alt: string;
  source: RolePortraitSource;
  entry?: ReaderGalleryEntry;
};

const SETTINGS_KEY = 'same_layer_role_portraits';
const PROJECT_ROLE_NAME_ALIASES = [
  ['林月华', 'Lin Yuehua'],
  ['陈雪', 'Chen Xue'],
  ['赵卫国', 'Zhao Weiguo'],
  ['陈幺妹', 'Chen Yaomei'],
  ['何铃', 'He Ling'],
];

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeNameWithoutParenthetical(value: unknown) {
  return normalizeText(value).replace(/\s*[\(（][^)）]+[\)）]\s*$/g, '').trim();
}

function buildNameCandidates(...values: unknown[]) {
  const candidates = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    const withoutParenthetical = normalizeNameWithoutParenthetical(value);
    if (normalized) candidates.add(normalized);
    if (withoutParenthetical) candidates.add(withoutParenthetical);
  }

  for (const aliasGroup of PROJECT_ROLE_NAME_ALIASES) {
    const normalizedGroup = aliasGroup.flatMap(alias => [
      normalizeText(alias),
      normalizeNameWithoutParenthetical(alias),
    ]);
    if (!normalizedGroup.some(alias => candidates.has(alias))) continue;
    normalizedGroup.forEach(alias => {
      if (alias) candidates.add(alias);
    });
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

function entryMatchesImageRef(entry: ReaderGalleryEntry, ref: RolePortraitImageRef) {
  if (entry.messageId !== ref.messageId) return false;
  if (ref.markerId && entry.markerId === ref.markerId) return true;
  if (ref.imageId && entry.imageId === ref.imageId) return true;
  if (ref.requestId && entry.requestId === ref.requestId) return true;
  const hasOrderRef = Number.isFinite(Number(ref.createdOrder));
  if (hasOrderRef && entry.createdOrder !== ref.createdOrder) return false;
  if (ref.promptToken && entry.promptToken === ref.promptToken) return true;
  return !ref.markerId && !ref.imageId && !ref.requestId && !ref.promptToken && (!hasOrderRef || entry.createdOrder === ref.createdOrder);
}

function listOverrideRefs(override?: RolePortraitOverride | null): RolePortraitImageRef[] {
  if (!override) return [];
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

function sortNewestFirst(entries: ReaderGalleryEntry[]) {
  return [...entries].sort((a, b) => {
    if (b.messageId !== a.messageId) return b.messageId - a.messageId;
    return b.createdOrder - a.createdOrder;
  });
}

export function findGalleryEntryForRole(role: RolePortraitRole, entries: ReaderGalleryEntry[]) {
  return findGalleryEntriesForRole(role, entries)[0];
}

export function findGalleryEntriesForRole(role: RolePortraitRole, entries: ReaderGalleryEntry[]) {
  const roleNames = buildNameCandidates(role.label, role.key);
  const readyEntries = sortNewestFirst(entries.filter(hasImageSource));

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
  return {
    roleKey: normalizeRoleKey(roleKey),
    imageRef,
    imageRefs: [imageRef],
    updatedAt: Date.now(),
  };
}

export function addRolePortraitSetImage(
  roleKey: string,
  current: RolePortraitOverride | undefined,
  entry: ReaderGalleryEntry,
): RolePortraitOverride {
  const imageRef = buildRolePortraitImageRef(entry);
  const refs = [...listOverrideRefs(current), imageRef];
  const seen = new Set<string>();
  const imageRefs = refs.filter(ref => {
    const key = imageRefKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    roleKey: normalizeRoleKey(roleKey),
    imageRef: current?.imageRef ?? imageRef,
    imageRefs,
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
  };
}

export function resolveRolePortraitSet(
  role: RolePortraitRole,
  entries: ReaderGalleryEntry[],
  overrides: RolePortraitOverrideMap,
): ReaderGalleryEntry[] {
  const overrideEntries = findEntriesForRefs(entries, listOverrideRefs(overrides[role.key]));
  const matchedEntries = findGalleryEntriesForRole(role, entries);
  const out: ReaderGalleryEntry[] = [];
  const seen = new Set<string>();
  for (const entry of [...overrideEntries, ...matchedEntries]) {
    if (!entry?.src || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

export function resolveRolePortrait(
  role: RolePortraitRole,
  entries: ReaderGalleryEntry[],
  overrides: RolePortraitOverrideMap,
  options: { defaultSrc: string },
): ResolvedRolePortrait {
  const override = overrides[role.key];
  const overrideEntry = findEntryForRef(entries, override?.imageRef) ?? findEntriesForRefs(entries, listOverrideRefs(override))[0];
  const entry = overrideEntry ?? findGalleryEntryForRole(role, entries);

  if (entry?.src) {
    return {
      src: entry.src,
      alt: entry.alt || `${role.label} 人物设定图`,
      source: 'gallery',
      entry,
    };
  }

  return {
    src: options.defaultSrc,
    alt: `${role.label} 默认人物设定图`,
    source: 'default',
  };
}

export function readRolePortraitOverrides(): RolePortraitOverrideMap {
  try {
    const raw = getVariables({ type: 'script', script_id: getScriptId() }) as Record<string, any>;
    const value = raw?.[SETTINGS_KEY];
    if (!value || typeof value !== 'object') return {};
    return value as RolePortraitOverrideMap;
  } catch {
    return {};
  }
}

export function writeRolePortraitOverrides(overrides: RolePortraitOverrideMap) {
  try {
    const current = (getVariables({ type: 'script', script_id: getScriptId() }) ?? {}) as Record<string, any>;
    replaceVariables({ ...current, [SETTINGS_KEY]: overrides }, { type: 'script', script_id: getScriptId() });
  } catch {
    // Tavern Helper globals are absent in unit tests and some local tooling paths.
  }
}

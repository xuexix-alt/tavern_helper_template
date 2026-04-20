import { buildGeneratedImageMarkerId } from './generatedImageMarker.ts';

export type GeneratedImageEntityMembershipSeed = {
  markerId?: string;
  imageId?: string;
  requestId?: string;
  promptToken?: string;
  anchorText?: string;
  createdOrder?: number;
};

export type GeneratedImageEntityNativeSeed = {
  markerId?: string;
  imageId?: string;
  requestId?: string;
  promptToken?: string;
  anchorText?: string;
  createdOrder?: number;
  src?: string;
  alt?: string;
  title?: string;
  characterName?: string;
};

export type GeneratedImageEntity = {
  id: string;
  messageId: number;
  markerId?: string;
  imageId?: string;
  requestId?: string;
  promptToken: string;
  anchorText?: string;
  createdOrder: number;
  src?: string;
  alt?: string;
  title?: string;
  characterName?: string;
  ready: boolean;
};

type GeneratedImageEntityBuildInput = {
  messageId: number;
  memberships?: GeneratedImageEntityMembershipSeed[];
  nativeImages?: GeneratedImageEntityNativeSeed[];
};

type InternalGeneratedImageEntity = GeneratedImageEntity & {
  aliasKeys: Set<string>;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeAnchor(value: unknown): string {
  return normalizeText(value)
    .replace(/[“”"'`‘’《》【】（）(){}<>]/g, '')
    .replace(/\[|\]/g, '')
    .replace(/[，。！？；：、…,.!?;:]/g, '')
    .trim();
}

function normalizeSrc(value: unknown): string {
  return normalizeText(value);
}

function addAlias(aliasKeys: Set<string>, prefix: string, value: unknown) {
  const normalized = prefix === 'anchor' ? normalizeAnchor(value) : normalizeText(value);
  if (!normalized) return;
  aliasKeys.add(`${prefix}:${normalized}`);
}

function buildAliasKeys(input: {
  markerId?: unknown;
  imageId?: unknown;
  requestId?: unknown;
  promptToken?: unknown;
  anchorText?: unknown;
}) {
  const aliasKeys = new Set<string>();
  addAlias(aliasKeys, 'marker', input.markerId);
  addAlias(aliasKeys, 'image', input.imageId);
  addAlias(aliasKeys, 'request', input.requestId);
  addAlias(aliasKeys, 'prompt', input.promptToken);
  addAlias(aliasKeys, 'anchor', input.anchorText);
  return aliasKeys;
}

function createEntityFromMembership(
  messageId: number,
  membership: GeneratedImageEntityMembershipSeed,
  index: number,
): InternalGeneratedImageEntity {
  const promptToken = normalizeText(membership.promptToken);
  const anchorText = normalizeText(membership.anchorText) || undefined;
  const createdOrder = Number.isFinite(Number(membership.createdOrder)) ? Math.trunc(Number(membership.createdOrder)) : index;
  const markerId =
    normalizeText(membership.markerId) ||
    buildGeneratedImageMarkerId({
      messageId,
      promptToken: promptToken || undefined,
      requestId: normalizeText(membership.requestId) || undefined,
      imageId: normalizeText(membership.imageId) || undefined,
      anchorText,
      order: createdOrder,
    });

  return {
    id: markerId,
    messageId,
    markerId,
    imageId: normalizeText(membership.imageId) || undefined,
    requestId: normalizeText(membership.requestId) || undefined,
    promptToken,
    anchorText,
    createdOrder,
    ready: false,
    aliasKeys: buildAliasKeys({
      markerId,
      imageId: membership.imageId,
      requestId: membership.requestId,
      promptToken,
      anchorText,
    }),
  };
}

function createEntityFromNative(
  messageId: number,
  nativeImage: GeneratedImageEntityNativeSeed,
  index: number,
  orderBase: number,
): InternalGeneratedImageEntity {
  const promptToken = normalizeText(nativeImage.promptToken);
  const anchorText = normalizeText(nativeImage.anchorText) || undefined;
  const createdOrder = Number.isFinite(Number(nativeImage.createdOrder))
    ? Math.trunc(Number(nativeImage.createdOrder))
    : orderBase + index;
  const markerId =
    normalizeText(nativeImage.markerId) ||
    buildGeneratedImageMarkerId({
      messageId,
      promptToken: promptToken || undefined,
      requestId: normalizeText(nativeImage.requestId) || undefined,
      imageId: normalizeText(nativeImage.imageId) || undefined,
      anchorText,
      order: createdOrder,
    });
  const src = normalizeSrc(nativeImage.src) || undefined;

  return {
    id: markerId,
    messageId,
    markerId,
    imageId: normalizeText(nativeImage.imageId) || undefined,
    requestId: normalizeText(nativeImage.requestId) || undefined,
    promptToken,
    anchorText,
    createdOrder,
    src,
    alt: normalizeText(nativeImage.alt) || undefined,
    title: normalizeText(nativeImage.title) || undefined,
    characterName: normalizeText(nativeImage.characterName) || undefined,
    ready: Boolean(src),
    aliasKeys: buildAliasKeys({
      markerId,
      imageId: nativeImage.imageId,
      requestId: nativeImage.requestId,
      promptToken,
      anchorText,
    }),
  };
}

function findMatchingEntity(
  entities: InternalGeneratedImageEntity[],
  nativeImage: GeneratedImageEntityNativeSeed,
): InternalGeneratedImageEntity | undefined {
  const aliasKeys = buildAliasKeys(nativeImage);
  if (aliasKeys.size === 0) return undefined;
  return entities.find(entity => Array.from(aliasKeys).some(alias => entity.aliasKeys.has(alias)));
}

function mergeEntity(target: InternalGeneratedImageEntity, source: InternalGeneratedImageEntity) {
  target.markerId = target.markerId ?? source.markerId;
  target.imageId = target.imageId ?? source.imageId;
  target.requestId = target.requestId ?? source.requestId;
  target.promptToken = target.promptToken || source.promptToken;
  target.anchorText = target.anchorText ?? source.anchorText;
  target.createdOrder = Math.min(target.createdOrder, source.createdOrder);
  target.src = target.src ?? source.src;
  target.alt = target.alt ?? source.alt;
  target.title = target.title ?? source.title;
  target.characterName = target.characterName ?? source.characterName;
  target.ready = target.ready || source.ready;
  for (const alias of source.aliasKeys) {
    target.aliasKeys.add(alias);
  }
}

export function buildGeneratedImageEntities(input: GeneratedImageEntityBuildInput): GeneratedImageEntity[] {
  const messageId = Math.trunc(Number(input.messageId));
  if (!Number.isFinite(messageId) || messageId < 0) return [];

  const memberships = Array.isArray(input.memberships) ? input.memberships : [];
  const nativeImages = Array.isArray(input.nativeImages) ? input.nativeImages : [];
  const entities = memberships.map((membership, index) => createEntityFromMembership(messageId, membership, index));
  const orderBase = entities.length;

  nativeImages.forEach((nativeImage, index) => {
    const source = createEntityFromNative(messageId, nativeImage, index, orderBase);
    const target = findMatchingEntity(entities, nativeImage);
    if (target) {
      mergeEntity(target, source);
      return;
    }
    entities.push(source);
  });

  return entities
    .sort((a, b) => a.createdOrder - b.createdOrder)
    .map(({ aliasKeys: _aliasKeys, ...entity }) => entity);
}

export function filterReadyGeneratedImageEntities(entities: GeneratedImageEntity[]): GeneratedImageEntity[] {
  return (Array.isArray(entities) ? entities : []).filter(entity => entity.ready && Boolean(normalizeSrc(entity.src)));
}

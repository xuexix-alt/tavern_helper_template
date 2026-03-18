import { buildGeneratedImageMarkerId } from './generatedImageMarker.ts';

export type GeneratedImageMembershipPersistedEntry = {
  markerId?: string;
  imageId?: string;
  promptToken?: string;
  requestId?: string;
  anchorText?: string;
};

export type GeneratedImageMembershipEntry = {
  markerId: string;
  imageId?: string;
  promptToken: string;
  requestId?: string;
  anchorText?: string;
  createdOrder: number;
};

type BuildGeneratedImageMembershipInput = {
  messageId: number;
  promptTokens: string[];
  persistedEntries: GeneratedImageMembershipPersistedEntry[];
  createdOrderBase?: number;
};

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function buildFallbackMarkerId(input: {
  messageId: number;
  promptToken?: string;
  requestId?: string;
  imageId?: string;
  anchorText?: string;
  order: number;
}) {
  return buildGeneratedImageMarkerId({
    messageId: input.messageId,
    promptToken: input.promptToken,
    requestId: input.requestId,
    imageId: input.imageId,
    anchorText: input.anchorText,
    order: input.order,
  });
}

export function buildGeneratedImageMembership(
  input: BuildGeneratedImageMembershipInput,
): GeneratedImageMembershipEntry[] {
  const messageId = Math.trunc(Number(input.messageId));
  if (!Number.isFinite(messageId) || messageId < 0) return [];

  const promptTokens = Array.isArray(input.promptTokens) ? input.promptTokens.map(normalizeText).filter(Boolean) : [];
  const persistedEntries = Array.isArray(input.persistedEntries) ? input.persistedEntries : [];
  const createdOrderBase = Math.trunc(Number(input.createdOrderBase ?? 0));
  const remainingPersisted = persistedEntries.map((entry, index) => ({ entry, index }));
  const out: GeneratedImageMembershipEntry[] = [];

  const consumePersisted = (predicate: (entry: GeneratedImageMembershipPersistedEntry) => boolean) => {
    const foundIndex = remainingPersisted.findIndex(item => predicate(item.entry));
    if (foundIndex < 0) return null;
    const [found] = remainingPersisted.splice(foundIndex, 1);
    return found.entry;
  };

  promptTokens.forEach((promptToken, order) => {
    const markerId = buildFallbackMarkerId({
      messageId,
      promptToken,
      order,
    });
    const matched =
      consumePersisted(entry => normalizeText(entry.markerId) === markerId) ??
      consumePersisted(entry => normalizeText(entry.promptToken) === promptToken);

    out.push({
      markerId: normalizeText(matched?.markerId) || markerId,
      imageId: normalizeText(matched?.imageId) || undefined,
      promptToken,
      requestId: normalizeText(matched?.requestId) || undefined,
      anchorText: normalizeText(matched?.anchorText) || undefined,
      createdOrder: createdOrderBase * 100 + order,
    });
  });

  remainingPersisted.forEach(({ entry }, orderOffset) => {
    const order = promptTokens.length + orderOffset;
    out.push({
      markerId:
        normalizeText(entry.markerId) ||
        buildFallbackMarkerId({
          messageId,
          promptToken: normalizeText(entry.promptToken) || undefined,
          requestId: normalizeText(entry.requestId) || undefined,
          imageId: normalizeText(entry.imageId) || undefined,
          anchorText: normalizeText(entry.anchorText) || undefined,
          order,
        }),
      imageId: normalizeText(entry.imageId) || undefined,
      promptToken: normalizeText(entry.promptToken),
      requestId: normalizeText(entry.requestId) || undefined,
      anchorText: normalizeText(entry.anchorText) || undefined,
      createdOrder: createdOrderBase * 100 + order,
    });
  });

  return out;
}

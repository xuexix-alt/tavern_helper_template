const generatedImageEntityRevisionByMessage = reactive(new Map<number, number>());

function normalizeGeneratedImageMessageId(messageId: number | null | undefined): number | null {
  const normalized = Number(messageId);
  if (!Number.isFinite(normalized) || normalized < 0) return null;
  return Math.trunc(normalized);
}

export function readGeneratedImageEntityRevision(messageId: number | null | undefined): number {
  const normalizedId = normalizeGeneratedImageMessageId(messageId);
  if (normalizedId == null) return 0;
  return generatedImageEntityRevisionByMessage.get(normalizedId) ?? 0;
}

export function bumpGeneratedImageEntityRevision(messageId?: number | null) {
  const normalizedId = normalizeGeneratedImageMessageId(messageId);
  if (normalizedId != null) {
    generatedImageEntityRevisionByMessage.set(
      normalizedId,
      (generatedImageEntityRevisionByMessage.get(normalizedId) ?? 0) + 1,
    );
    return;
  }

  for (const [existingId, revision] of generatedImageEntityRevisionByMessage.entries()) {
    generatedImageEntityRevisionByMessage.set(existingId, revision + 1);
  }
}

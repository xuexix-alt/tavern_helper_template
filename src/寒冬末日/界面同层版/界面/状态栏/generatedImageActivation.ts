export type GeneratedImageActivationPayload = {
  messageId: number | null;
  promptToken: string;
  requestId: string;
  imageSrc: string;
  source?: 'transcript' | 'gallery';
};

function decodeValue(value: string): string {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
}

function normalizeMessageIdValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    const numeric = Number(text);
    if (!Number.isFinite(numeric) || numeric < 0) continue;
    return Math.trunc(numeric);
  }
  return null;
}

export function parseGeneratedImageActivationPayload(input: {
  carrierDataset?: Record<string, unknown> | null;
  targetDataset?: Record<string, unknown> | null;
  targetSrc?: string | null;
  targetCurrentSrc?: string | null;
  targetAttrSrc?: string | null;
}): GeneratedImageActivationPayload {
  const carrierDataset = input.carrierDataset ?? {};
  const targetDataset = input.targetDataset ?? {};
  const messageId = normalizeMessageIdValue(
    carrierDataset.messageId,
    carrierDataset.messageIndex,
    targetDataset.messageId,
    targetDataset.messageIndex,
  );
  const promptToken = decodeValue(
    String(
      carrierDataset.promptToken ??
        targetDataset.promptToken ??
        carrierDataset.imageTag ??
        targetDataset.imageTag ??
        carrierDataset.link ??
        targetDataset.link ??
        '',
    ),
  );
  const requestId = String(carrierDataset.requestId ?? targetDataset.requestId ?? '').trim();
  const rawSource = String(carrierDataset.source ?? targetDataset.source ?? '').trim();
  const source = rawSource === 'gallery' || rawSource === 'transcript' ? rawSource : undefined;
  const imageSrc = decodeValue(
    String(
      carrierDataset.imageSrc ??
        targetDataset.imageSrc ??
        input.targetAttrSrc ??
        input.targetCurrentSrc ??
        input.targetSrc ??
        '',
    ),
  );

  return {
    messageId,
    promptToken,
    requestId,
    imageSrc,
    source,
  };
}

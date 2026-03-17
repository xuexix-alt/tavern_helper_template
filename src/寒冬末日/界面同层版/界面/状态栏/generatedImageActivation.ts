export type GeneratedImageActivationPayload = {
  messageId: number | null;
  promptToken: string;
  requestId: string;
  imageSrc: string;
};

function decodeValue(value: string): string {
  try {
    return decodeURIComponent(String(value ?? ''));
  } catch {
    return String(value ?? '');
  }
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
  const rawMessageId = Number(carrierDataset.messageId ?? targetDataset.messageId ?? '');
  const messageId = Number.isFinite(rawMessageId) ? Math.trunc(rawMessageId) : null;
  const promptToken = decodeValue(String(carrierDataset.promptToken ?? targetDataset.promptToken ?? ''));
  const requestId = String(carrierDataset.requestId ?? targetDataset.requestId ?? '').trim();
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
  };
}

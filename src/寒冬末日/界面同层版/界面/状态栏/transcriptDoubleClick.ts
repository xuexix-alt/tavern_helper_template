type ClosestCapableElement = {
  dataset?: Record<string, unknown>;
  closest?: (selector: string) => ClosestCapableElement | null;
};

function toFiniteMessageId(input: unknown): number | null {
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
}

export function resolveTranscriptDoubleClickMessageId(target: EventTarget | null): number | null {
  const element = target as ClosestCapableElement | null;
  if (!element || typeof element.closest !== 'function') return null;

  const generatedCarrier = element.closest(
    '.st-chatu8-image-span, .assistant-gallery-image, .assistant-fallback-inline-image, .assistant-fallback-generated-image',
  );
  if (generatedCarrier) return null;

  const messageCarrier = element.closest(
    '.assistant-body-proxy[data-message-id], .assistant-body[data-message-id], .assistant-card[data-message-id], .transcript-entry[data-message-id]',
  );
  if (!messageCarrier) return null;

  return toFiniteMessageId(messageCarrier.dataset?.messageId);
}

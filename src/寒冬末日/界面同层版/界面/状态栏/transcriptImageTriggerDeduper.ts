type TranscriptImageTriggerState = {
  messageId: number | null;
  timestampMs: number;
};

export function shouldSkipTranscriptImageTrigger(
  messageId: number,
  state: TranscriptImageTriggerState,
  nowMs: number,
  windowMs = 300,
): boolean {
  const normalizedMessageId = Math.trunc(Number(messageId));
  const normalizedNowMs = Number(nowMs);
  const normalizedWindowMs = Math.max(0, Math.trunc(Number(windowMs)));

  if (!Number.isFinite(normalizedMessageId) || normalizedMessageId < 0) return false;
  if (!Number.isFinite(normalizedNowMs)) return false;

  const shouldSkip =
    state.messageId === normalizedMessageId &&
    normalizedNowMs >= state.timestampMs &&
    normalizedNowMs - state.timestampMs <= normalizedWindowMs;

  state.messageId = normalizedMessageId;
  state.timestampMs = normalizedNowMs;
  return shouldSkip;
}

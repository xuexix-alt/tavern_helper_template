type TranscriptLikeItem = {
  message_id?: number;
  role?: string;
  raw?: string;
  phase?: string;
};

type GenerationListenerEpochController = {
  activateNext: () => number;
  invalidate: () => number;
  isCurrent: (epoch: number) => boolean;
  current: () => number;
};

function normalizeText(input: unknown): string {
  return String(input ?? '').replace(/\r\n/g, '\n').trim();
}

export function buildDebugMessageSignature(input: unknown): string {
  const text = normalizeText(input);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `${text.length}:${hash.toString(16)}`;
}

export function summarizeTranscriptForDebug(items: TranscriptLikeItem[]): Array<{
  messageId: number;
  role: string;
  phase: string;
  signature: string;
}> {
  return (Array.isArray(items) ? items : [])
    .filter(item => String(item?.role ?? '') === 'assistant')
    .map(item => ({
      messageId: Math.trunc(Number(item?.message_id)),
      role: String(item?.role ?? ''),
      phase: String(item?.phase ?? ''),
      signature: buildDebugMessageSignature(item?.raw ?? ''),
    }))
    .filter(item => Number.isFinite(item.messageId) && item.messageId >= 0);
}

export function shouldIgnoreHostRefreshDuringBusy(input: {
  busy: boolean;
  eventName: string;
  generationStartedEventName: string;
  generationEndedEventName: string;
  streamTokenEventName: string;
  smoothStreamTokenEventName: string;
}): boolean {
  if (input.busy !== true) return false;
  return (
    input.eventName === input.generationStartedEventName ||
    input.eventName === input.generationEndedEventName ||
    input.eventName === input.streamTokenEventName ||
    input.eventName === input.smoothStreamTokenEventName
  );
}

export function createGenerationListenerEpochController(initialEpoch = 0): GenerationListenerEpochController {
  let currentEpoch = Math.max(0, Math.trunc(Number(initialEpoch) || 0));
  return {
    activateNext() {
      currentEpoch += 1;
      return currentEpoch;
    },
    invalidate() {
      currentEpoch += 1;
      return currentEpoch;
    },
    isCurrent(epoch: number) {
      return Math.trunc(Number(epoch)) === currentEpoch;
    },
    current() {
      return currentEpoch;
    },
  };
}

export function buildDemoAssistantFinalBodySource(input: {
  content: string;
  strippedRenderSource: string;
}): string {
  const content = normalizeText(input.content);
  if (content) return content;
  return normalizeText(input.strippedRenderSource);
}

export function shouldSuppressLifecycleEchoHostRefresh(input: {
  eventName: string;
  nowMs: number;
  suppressUntilMs: number;
  suppressedEventNames: string[];
}): boolean {
  const nowMs = Number(input.nowMs);
  const suppressUntilMs = Number(input.suppressUntilMs);
  if (!Number.isFinite(nowMs) || !Number.isFinite(suppressUntilMs)) return false;
  if (nowMs > suppressUntilMs) return false;
  return (Array.isArray(input.suppressedEventNames) ? input.suppressedEventNames : []).includes(input.eventName);
}

export function shouldCreateAssistantPlaceholderOnFirstToken(input: {
  assistantMessageId: number | null | undefined;
  placeholderCreating: boolean;
  token: string;
}): boolean {
  if (input.assistantMessageId != null && Number.isFinite(Number(input.assistantMessageId))) return false;
  if (input.placeholderCreating === true) return false;
  return String(input.token ?? '').length > 0;
}

export function shouldEnsureAssistantPlaceholderBeforeFinalize(input: {
  assistantMessageId: number | null | undefined;
  placeholderCreating: boolean;
  finalText: string;
}): boolean {
  if (input.assistantMessageId != null && Number.isFinite(Number(input.assistantMessageId))) return false;
  if (input.placeholderCreating === true) return false;
  return String(input.finalText ?? '').trim().length > 0;
}

export function shouldPrewarmHostMesTextAfterPatch(input: {
  phase: 'stream' | 'done';
  assistantMessageId: number | null | undefined;
  hostMesTextPrimed: boolean;
}): boolean {
  if (input.assistantMessageId == null || !Number.isFinite(Number(input.assistantMessageId))) return false;
  if (input.phase === 'done') return true;
  return input.hostMesTextPrimed !== true;
}

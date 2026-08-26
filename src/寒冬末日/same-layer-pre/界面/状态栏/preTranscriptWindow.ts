import { PRE_TRANSCRIPT_DISPLAY_MIN } from './preTranscriptDisplaySetting.ts';

type PreTranscriptLike = {
  message_id: number;
  role?: string;
};

function isPreReadableMessage<T extends PreTranscriptLike>(item: T): boolean {
  const messageId = Math.trunc(Number(item?.message_id));
  return Number.isFinite(messageId) && messageId > 0 && (item.role === 'user' || item.role === 'assistant');
}

export function countPreReadableMessages<T extends PreTranscriptLike>(items: T[]): number {
  return (Array.isArray(items) ? items : []).filter(isPreReadableMessage).length;
}

export function selectPreTranscriptWindow<T extends PreTranscriptLike>(items: T[], count: number): T[] {
  const normalizedCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (normalizedCount === 0) return [];
  return (Array.isArray(items) ? items : []).filter(isPreReadableMessage).slice(-normalizedCount);
}

export function selectPreMvuTranscriptItems<T extends PreTranscriptLike>(items: T[]): T[] {
  return selectPreTranscriptWindow(items, PRE_TRANSCRIPT_DISPLAY_MIN);
}

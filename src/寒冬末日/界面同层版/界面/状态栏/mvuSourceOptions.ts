export type MvuSourceOption = {
  key: string;
  label: string;
  pillLabel: string;
  targetMessageId: number;
  sortId: number;
  isLatest: boolean;
};

type TranscriptLike = {
  message_id: number;
  role?: string;
  isOpening?: boolean;
};

type BuildMvuSourceOptionsInput = {
  transcriptItems: TranscriptLike[];
  targetMessageId?: number | null;
  refreshRevision?: number;
  hasStatData: (messageId: number) => boolean;
};

function toFiniteMessageId(input: unknown): number | null {
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
}

function isReadableAssistantLike(item: TranscriptLike, hasStatData: (messageId: number) => boolean): boolean {
  const messageId = toFiniteMessageId(item?.message_id);
  if (messageId == null) return false;
  if (!(item?.isOpening === true || item?.role === 'assistant')) return false;
  return hasStatData(messageId);
}

function createOption(messageId: number, latestMessageId: number): MvuSourceOption {
  const label = `${messageId}#`;
  return {
    key: `message:${messageId}`,
    label,
    pillLabel: label,
    targetMessageId: messageId,
    sortId: messageId,
    isLatest: messageId === latestMessageId,
  };
}

export function buildMvuSourceOptions(input: BuildMvuSourceOptionsInput): MvuSourceOption[] {
  const refreshRevision = Number(input.refreshRevision ?? 0);
  const transcriptItems = Array.isArray(input.transcriptItems) ? input.transcriptItems : [];
  const readableMessageIds = new Set<number>();

  for (const item of transcriptItems) {
    if (!isReadableAssistantLike(item, input.hasStatData)) continue;
    const messageId = toFiniteMessageId(item.message_id);
    if (messageId == null) continue;
    readableMessageIds.add(messageId);
  }

  const targetMessageId = toFiniteMessageId(input.targetMessageId);
  if (targetMessageId != null && input.hasStatData(targetMessageId)) {
    readableMessageIds.add(targetMessageId);
  }

  const sortedMessageIds = Array.from(readableMessageIds).sort((a, b) => b - a || refreshRevision * 0);
  if (sortedMessageIds.length === 0) return [];

  const latestMessageId = sortedMessageIds[0];
  return sortedMessageIds.map(messageId => createOption(messageId, latestMessageId));
}

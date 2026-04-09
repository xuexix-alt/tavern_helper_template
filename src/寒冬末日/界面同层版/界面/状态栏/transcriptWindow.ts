export type TranscriptWindowRange = {
  pageIndex: number;
  pageSize: number;
  containerFloorStartId: number;
  anchorLastId: number;
  startId: number;
  endId: number;
  storyCount: number;
  maxPageIndex: number;
};

export type TranscriptWindowPageOption = TranscriptWindowRange & {
  key: string;
  label: string;
  isLatest: boolean;
};

type ResolveTranscriptWindowRangeInput = {
  anchorLastId: number;
  containerMessageId?: number | null;
  pageIndex?: number;
  pageSize?: number;
};

function normalizeNonNegativeInt(input: unknown, fallback = 0): number {
  const numeric = Math.trunc(Number(input));
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

export function resolveTranscriptWindowRange(input: ResolveTranscriptWindowRangeInput): TranscriptWindowRange | null {
  const pageSize = Math.max(1, normalizeNonNegativeInt(input.pageSize, 4));
  const anchorLastId = normalizeNonNegativeInt(input.anchorLastId, -1);
  const containerFloorStartId = Math.max(0, normalizeNonNegativeInt(input.containerMessageId, -1) + 1);
  if (anchorLastId < containerFloorStartId) return null;

  const storyCount = anchorLastId - containerFloorStartId + 1;
  const maxPageIndex = Math.max(0, Math.ceil(storyCount / pageSize) - 1);
  const pageIndex = Math.min(maxPageIndex, normalizeNonNegativeInt(input.pageIndex, 0));
  const endId = anchorLastId - pageIndex * pageSize;
  const startId = Math.max(containerFloorStartId, endId - pageSize + 1);

  return {
    pageIndex,
    pageSize,
    containerFloorStartId,
    anchorLastId,
    startId,
    endId,
    storyCount,
    maxPageIndex,
  };
}

export function buildTranscriptWindowPageOptions(
  input: ResolveTranscriptWindowRangeInput,
): TranscriptWindowPageOption[] {
  const baseRange = resolveTranscriptWindowRange(input);
  if (!baseRange) return [];

  const pages: TranscriptWindowPageOption[] = [];
  for (let pageIndex = 0; pageIndex <= baseRange.maxPageIndex; pageIndex += 1) {
    const range = resolveTranscriptWindowRange({ ...input, pageIndex });
    if (!range) continue;
    pages.push({
      ...range,
      key: `window:${range.startId}-${range.endId}`,
      label: pageIndex === 0 ? `最新 ${range.startId}-${range.endId}` : `历史 ${range.startId}-${range.endId}`,
      isLatest: pageIndex === 0,
    });
  }
  return pages;
}

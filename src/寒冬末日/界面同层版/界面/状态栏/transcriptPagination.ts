export function resolveTailPageStart(totalItems: number, pageSize: number): number {
  const normalizedTotal = Math.max(0, Math.trunc(Number(totalItems) || 0));
  const normalizedPageSize = Math.max(1, Math.trunc(Number(pageSize) || 1));
  return Math.max(0, normalizedTotal - normalizedPageSize);
}

export function resolveTranscriptStartIndexOnItemsChange(input: {
  currentStartIndex: number;
  totalItems: number;
  pageSize: number;
  shouldFollowLatest: boolean;
  isNearBottom: boolean;
}): number {
  const tailStart = resolveTailPageStart(input.totalItems, input.pageSize);
  if (input.shouldFollowLatest || input.isNearBottom) {
    return tailStart;
  }

  const currentStartIndex = Math.max(0, Math.trunc(Number(input.currentStartIndex) || 0));
  return Math.min(currentStartIndex, tailStart);
}

export function shouldRevealOlderPageOnUpwardIntent(input: {
  hasMoreAbove: boolean;
  scrollTop: number;
  deltaY: number;
  topThreshold?: number;
  upwardIntentThreshold?: number;
}): boolean {
  if (!input.hasMoreAbove) return false;
  const topThreshold = Math.max(0, Math.trunc(Number(input.topThreshold) || 32));
  const upwardIntentThreshold = Math.max(1, Math.trunc(Number(input.upwardIntentThreshold) || 18));
  const scrollTop = Number(input.scrollTop) || 0;
  const deltaY = Number(input.deltaY) || 0;
  return scrollTop <= topThreshold && deltaY <= -upwardIntentThreshold;
}

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

export function didTranscriptAppendNewFloor(input: { previousIds: number[]; nextIds: number[] }): boolean {
  const previousIds = input.previousIds.map(id => Math.trunc(Number(id))).filter(id => Number.isFinite(id) && id >= 0);
  const nextIds = input.nextIds.map(id => Math.trunc(Number(id))).filter(id => Number.isFinite(id) && id >= 0);

  if (nextIds.length === 0) return false;
  if (previousIds.length === 0) return nextIds.length > 0;

  return nextIds.at(-1)! > previousIds.at(-1)!;
}

export function resolveReadingModeOnTranscriptScroll(input: {
  isStreaming: boolean;
  hasPendingStreamUserIntent: boolean;
  streamFollowSuppressed: boolean;
  isNearBottom: boolean;
  currentScrollTop: number;
  previousScrollTop: number;
  upwardScrollThreshold?: number;
}): {
  readingMode: 'following_latest' | 'browsing_history';
  streamFollowSuppressed: boolean;
  clearPendingStreamUserIntent: boolean;
} {
  const upwardScrollThreshold = Math.max(0, Math.trunc(Number(input.upwardScrollThreshold) || 4));
  const currentScrollTop = Math.max(0, Number(input.currentScrollTop) || 0);
  const previousScrollTop = Math.max(0, Number(input.previousScrollTop) || 0);
  const scrolledUp = currentScrollTop + upwardScrollThreshold < previousScrollTop;

  if (input.isStreaming === true && (input.streamFollowSuppressed || input.hasPendingStreamUserIntent || scrolledUp)) {
    if (input.isNearBottom) {
      return {
        readingMode: 'following_latest',
        streamFollowSuppressed: false,
        clearPendingStreamUserIntent: true,
      };
    }

    return {
      readingMode: 'browsing_history',
      streamFollowSuppressed: true,
      clearPendingStreamUserIntent: true,
    };
  }

  return {
    readingMode: input.isNearBottom ? 'following_latest' : 'browsing_history',
    streamFollowSuppressed: false,
    clearPendingStreamUserIntent: false,
  };
}

export function shouldAnchorTranscriptToBottomOnItemsChange(input: {
  shouldFollowLatest: boolean;
  isNearBottom: boolean;
  isStreaming: boolean;
  hasPendingStreamUserIntent: boolean;
  streamFollowSuppressed: boolean;
}): boolean {
  if (input.isStreaming === true && (input.hasPendingStreamUserIntent || input.streamFollowSuppressed)) {
    return false;
  }

  return input.shouldFollowLatest || input.isNearBottom;
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

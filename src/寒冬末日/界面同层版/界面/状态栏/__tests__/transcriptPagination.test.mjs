import test from 'node:test';
import assert from 'node:assert/strict';

import {
  didTranscriptAppendNewFloor,
  resolveReadingModeOnTranscriptScroll,
  resolveTailPageStart,
  resolveTranscriptStartIndexOnItemsChange,
  shouldAnchorTranscriptToBottomOnItemsChange,
  shouldRevealOlderPageOnUpwardIntent,
} from '../transcriptPagination.ts';

test('resolveTailPageStart keeps all items visible until the transcript exceeds one page', () => {
  assert.equal(resolveTailPageStart(0, 6), 0);
  assert.equal(resolveTailPageStart(6, 6), 0);
  assert.equal(resolveTailPageStart(7, 6), 1);
  assert.equal(resolveTailPageStart(8, 6), 2);
});

test('resolveTranscriptStartIndexOnItemsChange keeps the tail window anchored while following latest', () => {
  assert.equal(
    resolveTranscriptStartIndexOnItemsChange({
      currentStartIndex: 0,
      totalItems: 7,
      pageSize: 6,
      shouldFollowLatest: true,
      isNearBottom: false,
    }),
    1,
  );

  assert.equal(
    resolveTranscriptStartIndexOnItemsChange({
      currentStartIndex: 2,
      totalItems: 6,
      pageSize: 6,
      shouldFollowLatest: true,
      isNearBottom: false,
    }),
    0,
  );
});

test('resolveTranscriptStartIndexOnItemsChange clamps stale paging state while browsing history', () => {
  assert.equal(
    resolveTranscriptStartIndexOnItemsChange({
      currentStartIndex: 4,
      totalItems: 6,
      pageSize: 6,
      shouldFollowLatest: false,
      isNearBottom: false,
    }),
    0,
  );

  assert.equal(
    resolveTranscriptStartIndexOnItemsChange({
      currentStartIndex: 0,
      totalItems: 8,
      pageSize: 6,
      shouldFollowLatest: false,
      isNearBottom: false,
    }),
    0,
  );
});

test('shouldRevealOlderPageOnUpwardIntent only fires for explicit upward overscroll at the top edge', () => {
  assert.equal(
    shouldRevealOlderPageOnUpwardIntent({
      hasMoreAbove: true,
      scrollTop: 0,
      deltaY: -24,
    }),
    true,
  );

  assert.equal(
    shouldRevealOlderPageOnUpwardIntent({
      hasMoreAbove: true,
      scrollTop: 40,
      deltaY: -24,
    }),
    false,
  );

  assert.equal(
    shouldRevealOlderPageOnUpwardIntent({
      hasMoreAbove: true,
      scrollTop: 0,
      deltaY: 24,
    }),
    false,
  );

  assert.equal(
    shouldRevealOlderPageOnUpwardIntent({
      hasMoreAbove: false,
      scrollTop: 0,
      deltaY: -24,
    }),
    false,
  );
});

test('resolveReadingModeOnTranscriptScroll latches browsing history during streaming as soon as the reader scrolls upward', () => {
  assert.deepEqual(
    resolveReadingModeOnTranscriptScroll({
      isStreaming: true,
      hasPendingStreamUserIntent: true,
      streamFollowSuppressed: false,
      isNearBottom: false,
      currentScrollTop: 640,
      previousScrollTop: 720,
    }),
    {
      readingMode: 'browsing_history',
      streamFollowSuppressed: true,
      clearPendingStreamUserIntent: true,
    },
  );
});

test('didTranscriptAppendNewFloor only returns true when the transcript tail advances to a newer floor id', () => {
  assert.equal(
    didTranscriptAppendNewFloor({
      previousIds: [5, 6, 7, 8],
      nextIds: [6, 7, 8, 9],
    }),
    true,
  );

  assert.equal(
    didTranscriptAppendNewFloor({
      previousIds: [5, 6, 7, 8],
      nextIds: [5, 6, 7, 8],
    }),
    false,
  );

  assert.equal(
    didTranscriptAppendNewFloor({
      previousIds: [6, 7, 8, 9],
      nextIds: [1, 2, 3, 4],
    }),
    false,
  );
});

test('resolveReadingModeOnTranscriptScroll resumes follow mode when the reader deliberately returns to the bottom during streaming', () => {
  assert.deepEqual(
    resolveReadingModeOnTranscriptScroll({
      isStreaming: true,
      hasPendingStreamUserIntent: false,
      streamFollowSuppressed: true,
      isNearBottom: true,
      currentScrollTop: 900,
      previousScrollTop: 860,
    }),
    {
      readingMode: 'following_latest',
      streamFollowSuppressed: false,
      clearPendingStreamUserIntent: true,
    },
  );
});

test('shouldAnchorTranscriptToBottomOnItemsChange blocks auto-lock while a streaming scroll override is active even if the scroller is still near bottom', () => {
  assert.equal(
    shouldAnchorTranscriptToBottomOnItemsChange({
      shouldFollowLatest: true,
      isNearBottom: true,
      isStreaming: true,
      hasPendingStreamUserIntent: true,
      streamFollowSuppressed: false,
    }),
    false,
  );

  assert.equal(
    shouldAnchorTranscriptToBottomOnItemsChange({
      shouldFollowLatest: false,
      isNearBottom: true,
      isStreaming: true,
      hasPendingStreamUserIntent: false,
      streamFollowSuppressed: true,
    }),
    false,
  );
});

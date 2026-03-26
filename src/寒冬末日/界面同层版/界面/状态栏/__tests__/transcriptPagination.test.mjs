import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveTailPageStart,
  resolveTranscriptStartIndexOnItemsChange,
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

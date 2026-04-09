import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTranscriptWindowPageOptions, resolveTranscriptWindowRange } from '../transcriptWindow.ts';

test('resolveTranscriptWindowRange anchors exact 4-floor pages from the latest floor id', () => {
  const latest = resolveTranscriptWindowRange({
    anchorLastId: 20,
    containerMessageId: 0,
    pageIndex: 0,
    pageSize: 4,
  });
  const previous = resolveTranscriptWindowRange({
    anchorLastId: 20,
    containerMessageId: 0,
    pageIndex: 1,
    pageSize: 4,
  });

  assert.deepEqual(
    latest && { startId: latest.startId, endId: latest.endId, pageIndex: latest.pageIndex },
    { startId: 17, endId: 20, pageIndex: 0 },
  );
  assert.deepEqual(
    previous && { startId: previous.startId, endId: previous.endId, pageIndex: previous.pageIndex },
    { startId: 13, endId: 16, pageIndex: 1 },
  );
});

test('buildTranscriptWindowPageOptions produces stable latest-first menu labels without gaps or overlaps', () => {
  const options = buildTranscriptWindowPageOptions({
    anchorLastId: 20,
    containerMessageId: 0,
    pageSize: 4,
  });

  assert.deepEqual(
    options.map(option => option.label),
    ['最新 17-20', '历史 13-16', '历史 9-12', '历史 5-8', '历史 1-4'],
  );
});

test('resolveTranscriptWindowRange clamps oversized page indexes to the oldest available page', () => {
  const range = resolveTranscriptWindowRange({
    anchorLastId: 10,
    containerMessageId: 0,
    pageIndex: 99,
    pageSize: 4,
  });

  assert.deepEqual(
    range && { startId: range.startId, endId: range.endId, pageIndex: range.pageIndex, maxPageIndex: range.maxPageIndex },
    { startId: 1, endId: 2, pageIndex: 2, maxPageIndex: 2 },
  );
});

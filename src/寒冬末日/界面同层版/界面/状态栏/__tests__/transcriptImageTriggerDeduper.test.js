const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldSkipTranscriptImageTrigger } = require('../transcriptImageTriggerDeduper.ts');

test('shouldSkipTranscriptImageTrigger suppresses repeated triggers for the same message within the guard window', () => {
  const state = { messageId: null, timestampMs: 0 };

  assert.equal(shouldSkipTranscriptImageTrigger(4, state, 1000, 300), false);
  assert.equal(shouldSkipTranscriptImageTrigger(4, state, 1200, 300), true);
});

test('shouldSkipTranscriptImageTrigger allows a different message id immediately', () => {
  const state = { messageId: null, timestampMs: 0 };

  assert.equal(shouldSkipTranscriptImageTrigger(4, state, 1000, 300), false);
  assert.equal(shouldSkipTranscriptImageTrigger(6, state, 1100, 300), false);
});

test('shouldSkipTranscriptImageTrigger allows the same message id again after the guard window expires', () => {
  const state = { messageId: null, timestampMs: 0 };

  assert.equal(shouldSkipTranscriptImageTrigger(8, state, 1000, 300), false);
  assert.equal(shouldSkipTranscriptImageTrigger(8, state, 1401, 300), false);
});

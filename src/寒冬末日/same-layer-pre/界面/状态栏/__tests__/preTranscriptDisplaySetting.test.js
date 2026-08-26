const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PRE_TRANSCRIPT_DISPLAY_MIN,
  PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY,
  normalizePreTranscriptDisplayPreference,
  readPreTranscriptDisplayPreference,
  resolvePreTranscriptDisplayCount,
  writePreTranscriptDisplayPreference,
} = require('../preTranscriptDisplaySetting.ts');

function createStorage(initialValue) {
  let value = initialValue;
  return {
    getItem(key) {
      assert.equal(key, PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY);
      value = next;
    },
    value() {
      return value;
    },
  };
}

test('normalizes missing, invalid, fractional, and too-small preferences to six', () => {
  assert.equal(PRE_TRANSCRIPT_DISPLAY_MIN, 6);
  assert.equal(normalizePreTranscriptDisplayPreference(null), 6);
  assert.equal(normalizePreTranscriptDisplayPreference('bad'), 6);
  assert.equal(normalizePreTranscriptDisplayPreference(5), 6);
  assert.equal(normalizePreTranscriptDisplayPreference(12.9), 12);
});

test('reads and writes one shared local-storage key', () => {
  const storage = createStorage('18');
  assert.equal(readPreTranscriptDisplayPreference(storage), 18);
  assert.equal(writePreTranscriptDisplayPreference(24, storage), 24);
  assert.equal(storage.value(), '24');
});

test('short chats clamp the effective count without overwriting the saved preference', () => {
  const storage = createStorage('30');
  const saved = readPreTranscriptDisplayPreference(storage);
  assert.equal(resolvePreTranscriptDisplayCount(saved, 10), 10);
  assert.equal(storage.value(), '30');
  assert.equal(resolvePreTranscriptDisplayCount(saved, 0), 0);
});

test('storage failures fall back to six without throwing', () => {
  const broken = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readPreTranscriptDisplayPreference(broken), 6);
  assert.equal(writePreTranscriptDisplayPreference(20, broken), 20);
});

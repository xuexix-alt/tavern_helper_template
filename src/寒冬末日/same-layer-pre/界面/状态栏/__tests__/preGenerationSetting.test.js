const test = require('node:test');
const assert = require('node:assert/strict');
const { readPreStreamingPreference, writePreStreamingPreference } = require('../preGenerationSetting.ts');

test('streaming is disabled by default and can be persisted in both directions', () => {
  let value = null;
  const storage = {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
  assert.equal(readPreStreamingPreference(storage), false);
  writePreStreamingPreference(true, storage);
  assert.equal(readPreStreamingPreference(storage), true);
  writePreStreamingPreference(false, storage);
  assert.equal(readPreStreamingPreference(storage), false);
  value = 'invalid';
  assert.equal(readPreStreamingPreference(storage), false);
});

test('unavailable storage does not prevent changing the current preference', () => {
  const storage = {
    getItem: () => {
      throw Error('blocked');
    },
    setItem: () => {
      throw Error('blocked');
    },
  };
  assert.equal(readPreStreamingPreference(storage), false);
  assert.equal(writePreStreamingPreference(true, storage), true);
});

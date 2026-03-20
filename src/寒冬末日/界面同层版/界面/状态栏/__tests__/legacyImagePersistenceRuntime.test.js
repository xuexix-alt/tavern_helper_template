const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LEGACY_IMAGE_PERSISTENCE_RUNTIME_ENABLED,
  isLegacyImagePersistenceRuntimeEnabled,
} = require('../legacyImagePersistenceRuntime.ts');

test('legacy image persistence runtime is disabled', () => {
  assert.equal(LEGACY_IMAGE_PERSISTENCE_RUNTIME_ENABLED, false);
  assert.equal(isLegacyImagePersistenceRuntimeEnabled(), false);
});

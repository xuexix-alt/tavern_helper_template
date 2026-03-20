const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveAssistantMessageRefreshMode } = require('../assistantMessageRefreshMode.ts');

test('resolveAssistantMessageRefreshMode keeps stream patches host-silent', () => {
  assert.equal(resolveAssistantMessageRefreshMode('stream'), 'none');
});

test('resolveAssistantMessageRefreshMode keeps the final done patch host-silent', () => {
  assert.equal(resolveAssistantMessageRefreshMode('done'), 'none');
});

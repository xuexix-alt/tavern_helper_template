const test = require('node:test');
const assert = require('node:assert/strict');

const { collectGenerationRevealMessageIds } = require('../latestUserMacroVisibility.ts');

test('collectGenerationRevealMessageIds includes the latest hidden user id during regenerate flows', () => {
  assert.deepEqual(
    collectGenerationRevealMessageIds({
      detachedUserInput: false,
      hiddenMessageIds: [49, 50],
      latestHiddenUserMessageId: 48,
    }),
    [48, 49, 50],
  );
});

test('collectGenerationRevealMessageIds keeps detached opening flows isolated from host transcript reveal', () => {
  assert.deepEqual(
    collectGenerationRevealMessageIds({
      detachedUserInput: true,
      hiddenMessageIds: [49, 50],
      latestHiddenUserMessageId: 48,
    }),
    [],
  );
});

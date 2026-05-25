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

test('collectGenerationRevealMessageIds bounds hidden story reveal to recent message and character budgets', () => {
  assert.deepEqual(
    collectGenerationRevealMessageIds({
      detachedUserInput: false,
      hiddenMessages: [
        { message_id: 41, messageLength: 50_000 },
        { message_id: 42, messageLength: 50_000 },
        { message_id: 43, messageLength: 50_000 },
        { message_id: 44, messageLength: 50_000 },
      ],
      maxRevealMessages: 3,
      maxRevealCharacters: 120_000,
    }),
    [43, 44],
  );
});

test('collectGenerationRevealMessageIds keeps latest hidden user even when story reveal is budgeted', () => {
  assert.deepEqual(
    collectGenerationRevealMessageIds({
      detachedUserInput: false,
      hiddenMessages: [
        { message_id: 51, messageLength: 80_000 },
        { message_id: 52, messageLength: 80_000 },
      ],
      latestHiddenUserMessageId: 50,
      maxRevealMessages: 1,
      maxRevealCharacters: 80_000,
    }),
    [50, 52],
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

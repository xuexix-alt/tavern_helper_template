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

test('collectGenerationRevealMessageIds reveals recent raw floors plus older summary-structured floors for Tavern depth regex', () => {
  assert.deepEqual(
    collectGenerationRevealMessageIds({
      detachedUserInput: false,
      hiddenMessages: [
        { message_id: 1, messageLength: 80_000, hasDepthSummary: true, depthSummaryLength: 700 },
        { message_id: 2, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 3, messageLength: 80_000, hasDepthSummary: true, depthSummaryLength: 900 },
        { message_id: 4, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 5, messageLength: 80_000, hasDepthSummary: true, depthSummaryLength: 600 },
        { message_id: 6, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 7, messageLength: 80_000, hasDepthSummary: true, depthSummaryLength: 500 },
        { message_id: 8, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 9, messageLength: 80_000, hasDepthSummary: true, depthSummaryLength: 400 },
        { message_id: 10, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 11, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 12, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 13, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 14, messageLength: 80_000, hasDepthSummary: false, depthSummaryLength: 0 },
      ],
      nearRawRevealMessages: 10,
      maxFarSummaryCharacters: 2_000,
    }),
    [1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
});

test('collectGenerationRevealMessageIds treats far summary budget as estimated prompt text, not original floor text', () => {
  assert.deepEqual(
    collectGenerationRevealMessageIds({
      detachedUserInput: false,
      hiddenMessages: [
        { message_id: 1, messageLength: 100_000, hasDepthSummary: true, depthSummaryLength: 700 },
        { message_id: 2, messageLength: 100_000, hasDepthSummary: true, depthSummaryLength: 700 },
        { message_id: 3, messageLength: 100_000, hasDepthSummary: true, depthSummaryLength: 700 },
        { message_id: 4, messageLength: 100_000, hasDepthSummary: false, depthSummaryLength: 0 },
        { message_id: 5, messageLength: 100_000, hasDepthSummary: false, depthSummaryLength: 0 },
      ],
      nearRawRevealMessages: 2,
      maxFarSummaryCharacters: 1_400,
    }),
    [2, 3, 4, 5],
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

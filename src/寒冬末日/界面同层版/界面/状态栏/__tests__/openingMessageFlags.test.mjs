import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasOpeningAssistantFlag,
  hasOpeningSeedFlag,
  isCurrentOpeningAssistantMessageByPayload,
  isCurrentOpeningSeedMessageByPayload,
  isTrackedOpeningAssistantMessage,
  isTrackedOpeningSeedMessage,
  sanitizeInheritedMessageData,
} from '../openingMessageFlags.ts';

test('isTrackedOpeningSeedMessage only treats the preferred user floor as the real opening seed when id is known', () => {
  const actualSeed = {
    message_id: 1,
    role: 'user',
    data: { stream_demo: { opening_seed: true } },
  };
  const leakedSeed = {
    message_id: 5,
    role: 'user',
    data: { stream_demo: { opening_seed: true } },
  };

  assert.equal(hasOpeningSeedFlag(actualSeed), true);
  assert.equal(hasOpeningSeedFlag(leakedSeed), true);
  assert.equal(isTrackedOpeningSeedMessage(actualSeed, 1), true);
  assert.equal(isTrackedOpeningSeedMessage(leakedSeed, 1), false);
});

test('isTrackedOpeningAssistantMessage only treats the preferred assistant floor as the real opening result when id is known', () => {
  const actualResult = {
    message_id: 2,
    role: 'assistant',
    data: { stream_demo: { opening_assistant: true } },
  };
  const leakedResult = {
    message_id: 6,
    role: 'assistant',
    data: { stream_demo: { opening_assistant: true } },
  };

  assert.equal(hasOpeningAssistantFlag(actualResult), true);
  assert.equal(hasOpeningAssistantFlag(leakedResult), true);
  assert.equal(isTrackedOpeningAssistantMessage(actualResult, 2), true);
  assert.equal(isTrackedOpeningAssistantMessage(leakedResult, 2), false);
});

test('sanitizeInheritedMessageData strips opening-only stream_demo flags but keeps unrelated payload data', () => {
  const sanitized = sanitizeInheritedMessageData({
    stream_demo: {
      opening_seed: true,
      opening_assistant: true,
      reader_state: { density: 'comfortable' },
    },
    display_data: {
      some: 'value',
    },
  });

  assert.deepEqual(sanitized, {
    stream_demo: {
      reader_state: { density: 'comfortable' },
    },
    display_data: {
      some: 'value',
    },
  });
});

test('isCurrentOpeningSeedMessageByPayload falls back to flagged message when payload has no preferred id yet', () => {
  const seed = {
    message_id: 1,
    role: 'user',
    data: { stream_demo: { opening_seed: true } },
  };

  assert.equal(isCurrentOpeningSeedMessageByPayload(seed, { opening_seed_user_message_id: null }), true);
});

test('isCurrentOpeningAssistantMessageByPayload matches only the payload-selected opening assistant id', () => {
  const current = {
    message_id: 2,
    role: 'assistant',
    data: { stream_demo: { opening_assistant: true } },
  };
  const leaked = {
    message_id: 6,
    role: 'assistant',
    data: { stream_demo: { opening_assistant: true } },
  };

  assert.equal(isCurrentOpeningAssistantMessageByPayload(current, { opening_assistant_message_id: 2 }), true);
  assert.equal(isCurrentOpeningAssistantMessageByPayload(leaked, { opening_assistant_message_id: 2 }), false);
});

test('isCurrentOpeningSeedMessageByPayload treats the preferred user id as authoritative even before the runtime flag is readable', () => {
  const seedWithoutFlag = {
    message_id: 1,
    role: 'user',
    data: {},
  };
  const unrelatedUser = {
    message_id: 3,
    role: 'user',
    data: {},
  };

  assert.equal(isCurrentOpeningSeedMessageByPayload(seedWithoutFlag, { opening_seed_user_message_id: 1 }), true);
  assert.equal(isCurrentOpeningSeedMessageByPayload(unrelatedUser, { opening_seed_user_message_id: 1 }), false);
});

test('isCurrentOpeningAssistantMessageByPayload treats the preferred assistant id as authoritative even before the runtime flag is readable', () => {
  const resultWithoutFlag = {
    message_id: 2,
    role: 'assistant',
    data: {},
  };
  const unrelatedAssistant = {
    message_id: 4,
    role: 'assistant',
    data: {},
  };

  assert.equal(isCurrentOpeningAssistantMessageByPayload(resultWithoutFlag, { opening_assistant_message_id: 2 }), true);
  assert.equal(isCurrentOpeningAssistantMessageByPayload(unrelatedAssistant, { opening_assistant_message_id: 2 }), false);
});

test('isCurrentOpeningAssistantMessageByPayload still treats the payload-selected result floor as the opening assistant even if host role drifts', () => {
  const resultWithDriftedRole = {
    message_id: 2,
    role: 'system',
    data: {},
  };

  assert.equal(
    isCurrentOpeningAssistantMessageByPayload(resultWithDriftedRole, { opening_assistant_message_id: 2 }),
    true,
  );
});

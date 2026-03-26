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

test('isCurrentOpeningAssistantMessageByPayload matches only the payload-selected opening result id', () => {
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

  assert.equal(isCurrentOpeningAssistantMessageByPayload(current, { opening_result_message_id: 2 }), true);
  assert.equal(isCurrentOpeningAssistantMessageByPayload(leaked, { opening_result_message_id: 2 }), false);
});

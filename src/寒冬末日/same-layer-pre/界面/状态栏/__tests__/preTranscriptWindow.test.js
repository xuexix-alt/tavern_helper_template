const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countPreReadableMessages,
  selectPreMvuTranscriptItems,
  selectPreTranscriptWindow,
} = require('../preTranscriptWindow.ts');

const messages = [
  { message_id: 0, role: 'assistant' },
  { message_id: 1, role: 'user' },
  { message_id: 2, role: 'assistant' },
  { message_id: 3, role: 'system' },
  { message_id: 4, role: 'user' },
  { message_id: 5, role: 'assistant' },
  { message_id: 6, role: 'user' },
  { message_id: 7, role: 'assistant' },
  { message_id: 8, role: 'user' },
  { message_id: 9, role: 'assistant' },
];

test('counts only positive user and assistant正文 floors', () => {
  assert.equal(countPreReadableMessages(messages), 8);
});

test('selects the requested readable tail while preserving order', () => {
  assert.deepEqual(
    selectPreTranscriptWindow(messages, 6).map(item => item.message_id),
    [4, 5, 6, 7, 8, 9],
  );
  assert.deepEqual(
    selectPreTranscriptWindow(messages, 8).map(item => item.message_id),
    [1, 2, 4, 5, 6, 7, 8, 9],
  );
});

test('keeps MVU candidates fixed to the latest six readable items', () => {
  assert.deepEqual(
    selectPreMvuTranscriptItems(messages).map(item => item.message_id),
    [4, 5, 6, 7, 8, 9],
  );
});

require('ts-node/register/transpile-only');

const { buildMvuSourceOptions } = require('../src/寒冬末日/界面同层版/界面/状态栏/mvuSourceOptions.ts');

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nexpected: ${expectedJson}\nactual: ${actualJson}`);
  }
}

const transcript = [
  { message_id: 0, role: 'assistant', isOpening: true },
  { message_id: 1, role: 'user', isOpening: false },
  { message_id: 2, role: 'assistant', isOpening: false },
  { message_id: 3, role: 'assistant', isOpening: false },
  { message_id: 4, role: 'system', isOpening: false },
];

const readable = new Set([0, 3, 9]);

const options = buildMvuSourceOptions({
  transcriptItems: transcript,
  targetMessageId: 9,
  hasStatData(messageId) {
    return readable.has(messageId);
  },
});

assertDeepEqual(
  options.map(item => ({
    targetMessageId: item.targetMessageId,
    isLatest: item.isLatest,
    label: item.label,
  })),
  [
    { targetMessageId: 9, isLatest: true, label: '9#' },
    { targetMessageId: 3, isLatest: false, label: '3#' },
    { targetMessageId: 0, isLatest: false, label: '0#' },
  ],
  'mvu source options should only include readable assistant/opening message ids',
);

console.log('mvu source options test passed');

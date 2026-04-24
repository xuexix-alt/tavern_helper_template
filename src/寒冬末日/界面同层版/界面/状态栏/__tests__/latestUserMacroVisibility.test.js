const test = require('node:test');
const assert = require('node:assert/strict');

const { withLatestUserUnhidden } = require('../latestUserMacroVisibility.ts');

test('withLatestUserUnhidden temporarily unhides the latest hidden user message and restores it afterwards', async () => {
  const setCalls = [];
  const messages = [
    { message_id: 1, role: 'assistant', is_hidden: true },
    { message_id: 2, role: 'user', is_hidden: true },
  ];

  const result = await withLatestUserUnhidden({
    messages,
    setChatMessages: async (patches, options) => {
      setCalls.push({ patches, options });
    },
    action: async () => 'ok',
  });

  assert.equal(result, 'ok');
  assert.deepEqual(setCalls, [
    {
      patches: [{ message_id: 2, is_hidden: false }],
      options: { refresh: 'none' },
    },
    {
      patches: [{ message_id: 2, is_hidden: true }],
      options: { refresh: 'none' },
    },
  ]);
});

test('withLatestUserUnhidden is a no-op when the latest user message is already visible', async () => {
  const setCalls = [];
  const result = await withLatestUserUnhidden({
    messages: [
      { message_id: 1, role: 'assistant', is_hidden: true },
      { message_id: 2, role: 'user', is_hidden: false },
    ],
    setChatMessages: async (patches, options) => {
      setCalls.push({ patches, options });
    },
    action: async () => 'visible',
  });

  assert.equal(result, 'visible');
  assert.deepEqual(setCalls, []);
});

test('withLatestUserUnhidden restores the latest hidden user message even when the action throws', async () => {
  const setCalls = [];

  await assert.rejects(
    withLatestUserUnhidden({
      messages: [
        { message_id: 1, role: 'assistant', is_hidden: true },
        { message_id: 2, role: 'user', is_hidden: true },
      ],
      setChatMessages: async (patches, options) => {
        setCalls.push({ patches, options });
      },
      action: async () => {
        throw new Error('boom');
      },
    }),
    /boom/,
  );

  assert.deepEqual(setCalls, [
    {
      patches: [{ message_id: 2, is_hidden: false }],
      options: { refresh: 'none' },
    },
    {
      patches: [{ message_id: 2, is_hidden: true }],
      options: { refresh: 'none' },
    },
  ]);
});

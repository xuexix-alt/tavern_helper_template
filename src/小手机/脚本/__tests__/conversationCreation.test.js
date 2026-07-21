require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePrivateConversation, decideGroupConversation } = require('../聊天APP/conversationCreation.ts');

test('private decision requires one name and reuses only an exact private member', () => {
  assert.deepEqual(decidePrivateConversation([], []), { ok: false, reason: 'select-one' });
  assert.deepEqual(decidePrivateConversation(['甲', '乙'], []), { ok: false, reason: 'select-one' });
  const privateChat = { id: 'p1', type: 'private', members: ['甲'], name: '甲' };
  const groupChat = { id: 'g1', type: 'group', members: ['甲'], name: '甲群' };
  assert.deepEqual(decidePrivateConversation(['甲'], [groupChat, privateChat]), {
    ok: true,
    kind: 'existing',
    conversation: privateChat,
  });
  assert.deepEqual(decidePrivateConversation(['乙'], [privateChat]), {
    ok: true,
    kind: 'create',
    payload: { type: 'private', members: ['乙'], name: '乙' },
  });
});

test('group decision deduplicates members and requires two distinct names', () => {
  assert.deepEqual(decideGroupConversation(['甲', '甲'], ''), { ok: false, reason: 'select-at-least-two' });
  assert.deepEqual(decideGroupConversation(['甲', '乙', '甲'], ''), {
    ok: true,
    payload: { type: 'group', members: ['甲', '乙'], name: '甲、乙' },
  });
  assert.deepEqual(decideGroupConversation(['甲', '乙'], '  自定义群  '), {
    ok: true,
    payload: { type: 'group', members: ['甲', '乙'], name: '自定义群' },
  });
});

import assert from 'node:assert/strict';

import type { PhoneMessage } from '../data/phoneDb';
import { extractRecentCompletedMessages } from '../platform/storyExtractor';
import { commitStoryCounter, reconcileStoryCounter, selectWechatIncrement } from '../profiles/profileSources';
import type { ProfileStoryMessage } from '../profiles/profileTypes';

function story(id: string, role: 'user' | 'assistant', content: string): ProfileStoryMessage {
  return { id, role, content };
}

function phoneMessage(id: string, createdAt: number): PhoneMessage {
  return {
    id,
    sessionKey: '角色A::chat-a',
    conversationId: 'private:main:纪宁',
    type: 'private',
    sender: id === 'm2' ? '你' : '纪宁',
    content: `消息${id}`,
    createdAt,
    syncedToLore: true,
  };
}

function testStoryCounterReconcilesInsteadOfDoubleCounting(): void {
  const initial = reconcileStoryCounter(undefined, [
    story('10', 'user', '进入诊疗室'),
    story('11', 'assistant', '纪宁抬头。'),
  ]);
  assert.equal(initial.count, 2);

  const committed = commitStoryCounter(initial);
  assert.equal(committed.count, 0);

  const regenerated = reconcileStoryCounter(committed, [
    story('10', 'user', '进入诊疗室'),
    story('11', 'assistant', '纪宁放下记录板。'),
  ]);
  assert.equal(regenerated.count, 0);
  assert.deepEqual(regenerated.changedMessageKeys, ['assistant:11']);

  const withNewMessage = reconcileStoryCounter(regenerated, [
    story('10', 'user', '进入诊疗室'),
    story('11', 'assistant', '纪宁放下记录板。'),
    story('12', 'user', '询问药品情况'),
  ]);
  assert.equal(withNewMessage.count, 1);

  const deletedBeforeCommit = reconcileStoryCounter(withNewMessage, [
    story('10', 'user', '进入诊疗室'),
    story('11', 'assistant', '纪宁放下记录板。'),
  ]);
  assert.equal(deletedBeforeCommit.count, 0);
}

function testWechatAnchorSelection(): void {
  const messages = [phoneMessage('m1', 1), phoneMessage('m2', 2), phoneMessage('m3', 3), phoneMessage('m4', 4)];
  const selected = selectWechatIncrement(messages, 'm2', 20, 4);
  assert.deepEqual(
    selected.contextMessages.map(item => item.id),
    ['m1', 'm2'],
  );
  assert.deepEqual(
    selected.newMessages.map(item => item.id),
    ['m3', 'm4'],
  );
  assert.equal(selected.fallbackReason, undefined);

  const first = selectWechatIncrement(messages, undefined, 2, 4);
  assert.deepEqual(
    first.newMessages.map(item => item.id),
    ['m3', 'm4'],
  );
  assert.equal(first.fallbackReason, 'first-analysis');

  const missing = selectWechatIncrement(messages, 'missing', 2, 4);
  assert.deepEqual(
    missing.newMessages.map(item => item.id),
    ['m3', 'm4'],
  );
  assert.equal(missing.fallbackReason, 'anchor-missing');
}

function testCompletedStoryExtraction(): void {
  (globalThis as any).getChatMessages = () => [
    { message_id: 1, role: 'user', message: '用户1', is_hidden: false },
    { message_id: 2, role: 'assistant', message: '助手2', is_hidden: false },
    { message_id: 3, role: 'assistant', message: '隐藏3', is_hidden: true },
    { message_id: 4, role: 'user', message: '用户4', is_hidden: false },
    { message_id: 5, role: 'assistant', message: '当前未完成', is_hidden: false },
  ];

  assert.deepEqual(extractRecentCompletedMessages(5, 20), [
    { id: '1', role: 'user', content: '用户1' },
    { id: '2', role: 'assistant', content: '助手2' },
    { id: '4', role: 'user', content: '用户4' },
  ]);
}

testStoryCounterReconcilesInsteadOfDoubleCounting();
testWechatAnchorSelection();
testCompletedStoryExtraction();
console.log('profile source tests passed');

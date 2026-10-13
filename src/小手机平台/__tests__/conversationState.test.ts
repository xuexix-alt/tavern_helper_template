import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createMemoryPhoneDb, createIndexedDbPhoneDb, type PhoneDb } from '../data/phoneDb';
import { createConversationState } from '../data/conversationState';
import { createPhoneRuntime } from '../core/runtime';

async function verify(db: PhoneDb) {
  const message = (id: string, sessionKey = 'a', conversationId = 'c') => ({
    id,
    sessionKey,
    conversationId,
    type: 'private' as const,
    sender: 'Alice',
    content: id,
    createdAt: 1,
  });
  await db.addMessage(message('old'));
  const changes: string[] = [];
  const state = createConversationState(db, message => changes.push(message.id));
  await state.initialize('a');
  assert.equal(await state.count('a'), 0);
  await state.db.addMessage(message('new'));
  await state.db.addMessage(message('late'));
  await state.db.addMessage(message('other', 'a', 'd'));
  assert.equal(await state.count('a'), 3);
  await Promise.all([state.markRead('a', 'c', ['new']), state.markRead('a', 'c', ['old'])]);
  assert.equal(await state.count('a'), 2, '同时间迟到消息和其他会话保持未读');
  await state.markRead('a', 'c', ['other']);
  assert.equal(await state.count('a'), 2, '不能跨会话标读');
  await state.db.addMessage({ ...message('mine'), sender: '你' });
  assert.equal(await state.count('a'), 2, '自己的消息不计未读');
  const restored = createConversationState(db);
  await restored.initialize('a');
  assert.equal(await restored.count('a'), 2, '重新初始化保留未读');
  await restored.initialize('b');
  await restored.db.addMessage(message('new', 'b'));
  await restored.markRead('a', 'c', ['new']);
  assert.equal(await restored.count('b'), 1, '相同消息ID跨session隔离');
  await restored.db.putRecord('conversations', { id: 'c', sessionKey: 'a', title: 'replacement' });
  assert.equal(await restored.count('a'), 2, '全量替换会话不覆盖已读收据');
  await state.db.addMessageWithInbox(
    { ...message('outgoing'), sender: '你' },
    { id: 'outgoing', sessionKey: 'a', conversationId: 'c', status: 'pending' },
  );
  assert.ok(changes.includes('outgoing'), '原子发送也通知列表');
  assert.deepEqual(changes.slice(0, 3), ['new', 'late', 'other'], '所有消息持久化后通知');
  const bundle = await db.exportSession('a');
  const importedDb = createMemoryPhoneDb();
  await importedDb.importSession(bundle);
  assert.equal(await createConversationState(importedDb).count('a'), 2, '导入导出保留已读与未读');
}

async function main() {
  await verify(createMemoryPhoneDb());
  const factory = new IDBFactory();
  await verify(await createIndexedDbPhoneDb(factory));
  const reconnected = createConversationState(await createIndexedDbPhoneDb(factory));
  assert.equal(await reconnected.count('a'), 2, 'IndexedDB重新连接仍保留未读');
  const runtime = createPhoneRuntime();
  runtime.setOwner({ characterName: 'A', adapterId: 'a', runtimeMajor: 1 });
  runtime.setSession('a');
  runtime.setUnreadCount('A::a', 3);
  assert.equal(runtime.getUnreadCount(), 3);
  runtime.setSession('b');
  assert.equal(runtime.getUnreadCount(), 0);
  runtime.setUnreadCount('A::a', 9);
  assert.equal(runtime.getUnreadCount(), 0);
  runtime.setUnreadCount('A::b', 2);
  runtime.setOwner(null);
  assert.equal(runtime.getUnreadCount(), 0);
  console.log('conversation state tests passed');
}
void main();

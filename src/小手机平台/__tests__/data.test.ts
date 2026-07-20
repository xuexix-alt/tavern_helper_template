import assert from 'node:assert/strict';

import { createIndexedDbPhoneDb, createMemoryPhoneDb, type PhoneMessageInput } from '../data/phoneDb';
import { ChatLoreSync, LORE_ENTRY_DEFINITIONS } from '../data/chatLoreSync';
import { buildLoreSummary } from '../data/loreSummary';

const sessionA = '角色A::chat-a';
const sessionB = '角色A::chat-b';

function message(id: string, createdAt: number, overrides: Partial<PhoneMessageInput> = {}): PhoneMessageInput {
  return {
    id,
    sessionKey: sessionA,
    conversationId: 'private:alice',
    type: 'private',
    sender: '爱丽丝',
    content: `消息${id}`,
    createdAt,
    ...overrides,
  };
}

async function testMemoryPhoneDb(): Promise<void> {
  const db = createMemoryPhoneDb();
  await db.addMessage(message('same-id', 20));
  await db.addMessage(message('older', 10));
  await db.addMessage(message('same-id', 5, { sessionKey: sessionB }));
  await db.addMessage(message('group', 30, { conversationId: 'group:eden', type: 'group', groupName: '伊甸住户群' }));

  assert.deepEqual(
    (await db.listMessages({ sessionKey: sessionA })).map(item => item.id),
    ['older', 'same-id', 'group'],
    '查询应隔离 session 并按 createdAt 升序',
  );
  assert.equal((await db.listMessages({ sessionKey: sessionB }))[0].syncedToLore, false, '新消息默认未同步');
  assert.deepEqual(
    (await db.listMessages({ sessionKey: sessionA, type: 'private' })).map(item => item.id),
    ['older', 'same-id'],
    '可按 session/type 查询',
  );

  await db.markSynced(sessionA, ['same-id']);
  assert.equal(
    (await db.listMessages({ sessionKey: sessionA })).find(item => item.id === 'same-id')?.syncedToLore,
    true,
  );
  assert.equal(
    (await db.listMessages({ sessionKey: sessionA })).find(item => item.id === 'older')?.syncedToLore,
    false,
  );
  assert.equal((await db.listMessages({ sessionKey: sessionB }))[0].syncedToLore, false, '同 ID 跨 session 不得误标');

  await db.putRecord('conversations', { id: 'conversation-1', sessionKey: sessionA, title: '爱丽丝' });
  await db.putRecord('contactPrefs', { id: 'alice', sessionKey: sessionA, muted: true });
  await db.putRecord('inbox', { id: 'notice-1', sessionKey: sessionA, unread: true });
  await db.putRecord('proactiveJobs', { id: 'job-1', sessionKey: sessionA, runAt: 42 });
  assert.equal((await db.listRecords('conversations', sessionA))[0].title, '爱丽丝');
  assert.equal((await db.listRecords('contactPrefs', sessionA))[0].muted, true);
  assert.equal((await db.listRecords('inbox', sessionA))[0].unread, true);
  assert.equal((await db.listRecords('proactiveJobs', sessionA))[0].runAt, 42);

  await assert.rejects(() => createIndexedDbPhoneDb(undefined), /IndexedDB.*(?:不可用|unavailable)/i);
}

function testLoreSummary(): void {
  const privateMessages = Array.from({ length: 12 }, (_, index) =>
    message(`p${index}`, index, {
      conversationId: index % 2 === 0 ? 'private:alice' : 'private:bob',
      content: `private-${index}`,
      gameDate: '寒冬纪元第3日',
      gameTime: `0${index}:00`,
    }),
  );
  const privateSummary = buildLoreSummary({ type: 'private', messages: privateMessages });
  assert.equal((privateSummary.match(/private-/g) ?? []).length, 8, '私聊应取 session 全部私聊最近 8 条');
  assert.equal(privateSummary.includes('private-3'), false);
  assert.match(privateSummary, /寒冬纪元第3日/);
  assert.match(privateSummary, /爱丽丝/);

  const groupMessages = Array.from({ length: 13 }, (_, index) =>
    message(`g${index}`, index, {
      type: 'group',
      conversationId: index === 12 ? 'group:other' : 'group:eden',
      sender: `住户${index}`,
      content: `group-${index}`,
      groupName: '伊甸住户群',
      participants: ['爱丽丝', '鲍勃'],
    }),
  );
  const groupSummary = buildLoreSummary({ type: 'group', conversationId: 'group:eden', messages: groupMessages });
  assert.equal((groupSummary.match(/group-/g) ?? []).length, 10, '群聊应仅取目标 conversation 最近 10 条');
  assert.equal(groupSummary.includes('group-12'), false);
  assert.match(groupSummary, /伊甸住户群/);
  assert.match(groupSummary, /爱丽丝、鲍勃/);

  const broadcasts = Array.from({ length: 10 }, (_, index) =>
    message(`b${index}`, index, {
      type: 'broadcast',
      conversationId: 'broadcast:radio',
      content: `broadcast-${index}`,
      source: index % 2 === 0 ? '官方电台' : '匿名频段',
      trust: index % 2 === 0 ? 'confirmed' : 'unverified',
    }),
  );
  const broadcastSummary = buildLoreSummary({ type: 'broadcast', messages: broadcasts });
  assert.equal((broadcastSummary.match(/broadcast-/g) ?? []).length, 8, '广播应取最近 8 条');
  assert.match(broadcastSummary, /confirmed/);
  assert.match(broadcastSummary, /unverified/);
  assert.match(broadcastSummary, /官方电台|匿名频段/);

  const malicious = '<img src=x onerror=alert(1)>'.repeat(4);
  const textSummary = buildLoreSummary({
    type: 'private',
    messages: [message('html', 1, { content: malicious })],
  });
  assert.equal(textSummary.includes('<img src=x onerror=alert(1)>'), true, 'HTML 必须原样作为业务文本');
  const renderedContent = textSummary.slice(textSummary.indexOf(':') + 1).trim();
  assert.ok(renderedContent.length <= 80, '单条 content 最多 80 字符');

  const huge = Array.from({ length: 10 }, (_, index) =>
    message(`huge-${index}`, index, {
      type: 'group',
      conversationId: 'group:huge',
      sender: `非常长的发送者-${index}-${'人'.repeat(70)}`,
      content: '文'.repeat(200),
      groupName: `超长群名${'群'.repeat(120)}`,
      participants: [`成员${'甲'.repeat(80)}`, `成员${'乙'.repeat(80)}`],
    }),
  );
  const bounded = buildLoreSummary({ type: 'group', conversationId: 'group:huge', messages: huge });
  assert.ok(bounded.length <= 800, '最终条目最多 800 字符');
  assert.match(bounded, /…\[中间省略\]…/);
  assert.ok(bounded.startsWith('【群聊】') && bounded.endsWith('文'.repeat(20)), '截断应保留约 200 字符首尾');
}

type ScheduledTask = { id: number; callback: () => void; cancelled: boolean; delayMs: number };

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

function fakeScheduler() {
  let nextId = 1;
  const tasks: ScheduledTask[] = [];
  return {
    tasks,
    schedule(callback: () => void, delayMs = 0): number {
      const id = nextId++;
      tasks.push({ id, callback, cancelled: false, delayMs });
      return id;
    },
    clear(id: unknown): void {
      const task = tasks.find(item => item.id === id);
      if (task) task.cancelled = true;
    },
    run(id: number): void {
      const task = tasks.find(item => item.id === id);
      if (task && !task.cancelled) task.callback();
    },
  };
}

async function testChatLoreSync(): Promise<void> {
  const db = createMemoryPhoneDb();
  await db.addMessage(message('a-private', 1));
  await db.addMessage(message('a-group', 2, { type: 'group', conversationId: 'group:eden', groupName: '伊甸住户群' }));
  await db.addMessage(
    message('a-radio', 3, {
      type: 'broadcast',
      conversationId: 'broadcast:radio',
      source: '避难所电台',
      trust: 'confirmed',
    }),
  );

  assert.deepEqual(
    LORE_ENTRY_DEFINITIONS.map(entry => [entry.type, entry.name]),
    [
      ['private', '[手机通讯]私聊记录'],
      ['group', '[手机通讯]伊甸住户群'],
      ['broadcast', '[手机情报]广播摘要'],
    ],
  );
  for (const entry of LORE_ENTRY_DEFINITIONS) {
    assert.deepEqual(entry.strategy, { type: 'constant' });
    assert.deepEqual(entry.position, { type: 'at_depth', role: 'system', depth: 4, order: 100 });
    assert.equal(entry.probability, 100);
  }

  const scheduler = fakeScheduler();
  const started: string[] = [];
  const resolvers: Array<() => void> = [];
  const sync = new ChatLoreSync({
    db,
    writer: (worldbookName, entry) => {
      started.push(`${worldbookName}:${entry.name}`);
      return new Promise<void>(resolve => resolvers.push(resolve));
    },
    schedule: (callback, delayMs) => scheduler.schedule(callback, delayMs),
    clearSchedule: id => scheduler.clear(id),
  });

  sync.schedule({ sessionKey: sessionA, worldbookName: '不应写入的旧世界书', type: 'private' });
  sync.schedule({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' });
  sync.schedule({
    sessionKey: sessionA,
    worldbookName: '世界书-A',
    type: 'group',
    conversationId: 'group:eden',
  });
  sync.schedule({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'broadcast' });
  assert.equal(scheduler.tasks.length, 4);
  assert.equal(scheduler.tasks[0].cancelled, true, '同 session/type 的旧 timer 应被防抖取消');
  assert.equal(scheduler.tasks.filter(task => !task.cancelled).length, 3, '不同 type 应拥有独立防抖槽');
  assert.equal(
    scheduler.tasks.every(task => task.delayMs === 500),
    true,
    '防抖延迟必须固定为 500ms',
  );
  scheduler.tasks.forEach(task => scheduler.run(task.id));
  await flushMicrotasks();
  assert.deepEqual(started, ['世界书-A:[手机通讯]私聊记录'], '三个并发类型必须走共享串行队列');

  await db.addMessage(message('during-write', 4));
  resolvers.shift()?.();
  await flushMicrotasks();
  assert.deepEqual(started.slice(0, 2), ['世界书-A:[手机通讯]私聊记录', '世界书-A:[手机通讯]伊甸住户群']);
  resolvers.shift()?.();
  await flushMicrotasks();
  resolvers.shift()?.();
  await sync.whenIdle();
  const privateState = await db.listMessages({ sessionKey: sessionA, type: 'private' });
  assert.equal(privateState.find(item => item.id === 'a-private')?.syncedToLore, true, '成功后应标记捕获批次');
  assert.equal(privateState.find(item => item.id === 'during-write')?.syncedToLore, false, '写入期间新增消息不得误标');

  const cancelled = fakeScheduler();
  const cancelledWrites: string[] = [];
  await db.addMessage(message('b-private', 1, { sessionKey: sessionB }));
  const cancelSync = new ChatLoreSync({
    db,
    writer: async worldbookName => {
      cancelledWrites.push(worldbookName);
    },
    schedule: (callback, delayMs) => cancelled.schedule(callback, delayMs),
    clearSchedule: id => cancelled.clear(id),
  });
  cancelSync.schedule({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' });
  cancelSync.schedule({ sessionKey: sessionB, worldbookName: '世界书-B', type: 'private' });
  cancelSync.cancelSession(sessionA);
  cancelled.tasks.forEach(task => cancelled.run(task.id));
  await cancelSync.whenIdle();
  assert.deepEqual(cancelledWrites, ['世界书-B'], '显式取消 A 只能取消 A，不得取消已捕获的 B');

  const retryDb = createMemoryPhoneDb();
  await retryDb.addMessage(message('retry-me', 1));
  let attempts = 0;
  const retrySync = new ChatLoreSync({
    db: retryDb,
    writer: async worldbookName => {
      attempts += 1;
      assert.equal(worldbookName, '捕获的世界书-A');
      if (attempts === 1) throw new Error('write failed');
    },
  });
  await assert.rejects(
    () =>
      retrySync.flushNow({
        sessionKey: sessionA,
        worldbookName: '捕获的世界书-A',
        type: 'private',
      }),
    /write failed/,
  );
  assert.equal((await retryDb.listMessages({ sessionKey: sessionA }))[0].syncedToLore, false, 'writer 失败不得标记');
  await retrySync.flushNow({ sessionKey: sessionA, worldbookName: '捕获的世界书-A', type: 'private' });
  assert.equal(attempts, 2, '失败批次必须可重试');
  assert.equal((await retryDb.listMessages({ sessionKey: sessionA }))[0].syncedToLore, true);
}

async function main(): Promise<void> {
  await testMemoryPhoneDb();
  testLoreSummary();
  await testChatLoreSync();
  console.log('data tests passed');
}

void main();

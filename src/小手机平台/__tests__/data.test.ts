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

  const nested = { id: 'nested', sessionKey: sessionA, settings: { labels: ['原值'] } };
  await db.putRecord('contactPrefs', nested);
  nested.settings.labels[0] = '外部修改';
  const firstNestedRead = await db.listRecords('contactPrefs', sessionA);
  assert.deepEqual(firstNestedRead.find(record => record.id === 'nested')?.settings, { labels: ['原值'] });
  const returnedSettings = firstNestedRead.find(record => record.id === 'nested')?.settings as { labels: string[] };
  returnedSettings.labels[0] = '返回值修改';
  const secondNestedRead = await db.listRecords('contactPrefs', sessionA);
  assert.deepEqual(
    secondNestedRead.find(record => record.id === 'nested')?.settings,
    { labels: ['原值'] },
    'Memory put/list 必须使用 structured clone 隔离嵌套对象',
  );
  await assert.rejects(
    () => db.putRecord('inbox', { id: 'uncloneable', sessionKey: sessionA, callback: () => undefined }),
    /clone|克隆|DataClone/i,
    'Memory 应与 IndexedDB 一样拒绝不可 structured-clone 的值',
  );

  await assert.rejects(() => createIndexedDbPhoneDb(undefined), /IndexedDB.*(?:不可用|unavailable)/i);
}

async function testBroadcastValidation(): Promise<void> {
  const db = createMemoryPhoneDb();
  await assert.rejects(
    () =>
      db.addMessage(
        message('missing-source', 1, {
          type: 'broadcast',
          conversationId: 'broadcast:radio',
          trust: 'confirmed',
        }),
      ),
    /source|来源/i,
  );
  await assert.rejects(
    () =>
      db.addMessage(
        message('missing-trust', 2, {
          type: 'broadcast',
          conversationId: 'broadcast:radio',
          source: '官方电台',
        }),
      ),
    /trust|可信/i,
  );
  await assert.rejects(
    () =>
      db.addMessage(
        message('blank-source', 3, {
          type: 'broadcast',
          conversationId: 'broadcast:radio',
          source: '   ',
          trust: 'unverified',
        }),
      ),
    /source|来源|空/i,
  );
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
  const bypassedDb = buildLoreSummary({
    type: 'broadcast',
    messages: [
      message('invalid-radio', 20, {
        type: 'broadcast',
        conversationId: 'broadcast:radio',
        content: '不能伪造的广播',
      }),
    ],
  });
  assert.equal(bypassedDb.includes('不能伪造的广播'), false, '绕过 DB 且缺来源/可信度的广播必须被过滤');
  assert.equal(bypassedDb.includes('未知来源'), false);

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

async function testInFlightSessionSwitch(): Promise<void> {
  const db = createMemoryPhoneDb();
  const sharedId = 'same-message-id';
  await db.addMessage(message(sharedId, 1, { sessionKey: sessionA, content: 'A 的消息' }));
  await db.addMessage(message(sharedId, 1, { sessionKey: sessionB, content: 'B 的消息' }));

  let currentSession = { sessionKey: sessionA, worldbookName: '世界书-A' };
  const capturedCurrentRequest = () => ({ ...currentSession, type: 'private' as const });
  const writes: string[] = [];
  const releaseWriters: Array<() => void> = [];
  const sync = new ChatLoreSync({
    db,
    writer: (worldbookName, entry) => {
      writes.push(`${worldbookName}:${entry.content}`);
      return new Promise<void>(resolve => releaseWriters.push(resolve));
    },
  });

  const writeA = sync.flushNow(capturedCurrentRequest());
  await flushMicrotasks();
  assert.deepEqual(
    writes.map(value => value.split(':', 1)[0]),
    ['世界书-A'],
    'A writer 应先进入 pending，且使用调度时捕获的 A 世界书',
  );

  currentSession = { sessionKey: sessionB, worldbookName: '世界书-B' };
  const writeB = sync.flushNow(capturedCurrentRequest());
  await flushMicrotasks();
  assert.equal(writes.length, 1, 'A writer 阻塞期间 B 不得并发进入 writer');

  releaseWriters.shift()?.();
  await flushMicrotasks();
  assert.deepEqual(
    writes.map(value => value.split(':', 1)[0]),
    ['世界书-A', '世界书-B'],
    '切到 B 后仍应先写 A 书，再串行写 B 书',
  );
  assert.match(writes[0], /A 的消息/);
  assert.match(writes[1], /B 的消息/);

  const afterA = await Promise.all([
    db.listMessages({ sessionKey: sessionA }),
    db.listMessages({ sessionKey: sessionB }),
  ]);
  assert.equal(afterA[0][0].syncedToLore, true, 'A writer 成功后只能标记 A 批次');
  assert.equal(afterA[1][0].syncedToLore, false, '同 ID 的 B 消息在 B writer pending 时不得被 A 误标');

  releaseWriters.shift()?.();
  await Promise.all([writeA, writeB]);
  const afterB = await db.listMessages({ sessionKey: sessionB });
  assert.equal(afterB[0].syncedToLore, true, 'B writer 成功后应只标记 B 批次');
}

async function testDuplicateFlushAndCaptureFailure(): Promise<void> {
  const db = createMemoryPhoneDb();
  await db.addMessage(message('only-once', 1));
  let writes = 0;
  let releaseWriter: (() => void) | undefined;
  const sync = new ChatLoreSync({
    db,
    writer: async () => {
      writes += 1;
      await new Promise<void>(resolve => {
        releaseWriter = resolve;
      });
    },
  });
  const first = sync.flushNow({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' });
  await flushMicrotasks();
  const duplicate = sync.flushNow({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' });
  await flushMicrotasks();
  assert.equal(writes, 1);
  releaseWriter?.();
  await Promise.all([first, duplicate]);
  assert.equal(writes, 1, '首写 pending 时重复 flush 不得重复写同一批消息');

  let rejectRead = true;
  const failingDb = {
    ...db,
    async listMessages(query: Parameters<typeof db.listMessages>[0]) {
      if (rejectRead) {
        rejectRead = false;
        throw new Error('db read failed');
      }
      return db.listMessages(query);
    },
  };
  await db.addMessage(message('after-read-failure', 2));
  const readFailureSync = new ChatLoreSync({ db: failingDb, writer: async () => undefined });
  await assert.rejects(
    () => readFailureSync.flushNow({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' }),
    /db read failed/,
  );
  await readFailureSync.flushNow({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' });
}

async function testSyncLifecycle(): Promise<void> {
  const pendingDb = createMemoryPhoneDb();
  await pendingDb.addMessage(message('pending-timer', 1));
  const scheduler = fakeScheduler();
  let pendingWrites = 0;
  const pendingSync = new ChatLoreSync({
    db: pendingDb,
    writer: async () => {
      pendingWrites += 1;
    },
    schedule: (callback, delayMs) => scheduler.schedule(callback, delayMs),
    clearSchedule: timer => scheduler.clear(timer),
  });
  pendingSync.schedule({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' });
  let idleSettled = false;
  const waitingForTimer = pendingSync.whenIdle().then(() => {
    idleSettled = true;
  });
  await flushMicrotasks();
  assert.equal(idleSettled, false, 'whenIdle 必须等待尚未开始的 debounce timer');
  pendingSync.cancelSession(sessionA);
  await waitingForTimer;
  assert.equal(idleSettled, true, 'cancelSession 必须 settle 被取消的 pending 工作');
  pendingSync.schedule({ sessionKey: sessionB, worldbookName: '世界书-B', type: 'private' });
  const disposedTimer = scheduler.tasks.at(-1);
  await pendingSync.dispose();
  assert.equal(disposedTimer?.cancelled, true, 'dispose 必须取消全部未开始 timer');
  assert.equal(pendingWrites, 0);

  const activeDb = createMemoryPhoneDb();
  await activeDb.addMessage(message('first-fails', 1));
  await activeDb.addMessage(
    message('second-completes', 2, { type: 'group', conversationId: 'group:eden', groupName: '伊甸住户群' }),
  );
  const entered: string[] = [];
  let releaseSecond: (() => void) | undefined;
  const lifecycleSync = new ChatLoreSync({
    db: activeDb,
    writer: async (_worldbookName, entry) => {
      entered.push(entry.type);
      if (entry.type === 'private') throw new Error('first writer failed');
      await new Promise<void>(resolve => {
        releaseSecond = resolve;
      });
    },
  });
  const failing = lifecycleSync.flushNow({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' });
  const completing = lifecycleSync.flushNow({
    sessionKey: sessionA,
    worldbookName: '世界书-A',
    type: 'group',
    conversationId: 'group:eden',
  });
  void failing.catch(() => undefined);
  void completing.catch(() => undefined);
  const disposing = lifecycleSync.dispose();
  await flushMicrotasks();
  assert.deepEqual(entered, ['private', 'group'], '前一工作失败后共享队列仍应继续后续工作');
  let disposeSettled = false;
  void disposing
    .finally(() => {
      disposeSettled = true;
    })
    .catch(() => undefined);
  await flushMicrotasks();
  assert.equal(disposeSettled, false, 'dispose 必须等待失败之外的其余 active 工作 settle');
  releaseSecond?.();
  await assert.rejects(
    () => disposing,
    error => error instanceof AggregateError && error.errors.some(item => String(item).includes('first writer failed')),
  );
  assert.throws(
    () => lifecycleSync.schedule({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' }),
    /disposed|closed|关闭/i,
  );
  await assert.rejects(
    () => lifecycleSync.flushNow({ sessionKey: sessionA, worldbookName: '世界书-A', type: 'private' }),
    /disposed|closed|关闭/i,
  );
}

async function main(): Promise<void> {
  await testMemoryPhoneDb();
  await testBroadcastValidation();
  testLoreSummary();
  await testChatLoreSync();
  await testInFlightSessionSwitch();
  await testDuplicateFlushAndCaptureFailure();
  await testSyncLifecycle();
  console.log('data tests passed');
}

void main();

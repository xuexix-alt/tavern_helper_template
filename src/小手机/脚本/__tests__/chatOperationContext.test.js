require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatOperationContextFactory } = require('../聊天数据库/chatOperationContext.ts');

test('each operation synchronously pins chatId before database promises resolve', async () => {
  let current = 'old-chat';
  const diagnostics = [];
  const resolvers = [];
  const beginOperation = createChatOperationContextFactory({
    readChatId: () => current,
    openDatabase: () => new Promise(resolve => resolvers.push(resolve)),
    onDiagnosticChatId: id => diagnostics.push(id),
  });
  const oldOperation = beginOperation();
  current = 'new-chat';
  const newOperation = beginOperation();
  assert.equal(oldOperation.chatId, 'old-chat');
  assert.equal(newOperation.chatId, 'new-chat');
  resolvers[1]({ label: 'new-db' });
  resolvers[0]({ label: 'old-db' });
  assert.equal((await oldOperation.dbPromise).label, 'old-db');
  assert.equal((await newOperation.dbPromise).label, 'new-db');
  assert.deepEqual(diagnostics, ['old-chat', 'new-chat']);
});

test('missing chat ids normalize to default at synchronous entry', () => {
  const beginOperation = createChatOperationContextFactory({
    readChatId: () => '',
    openDatabase: async () => ({}),
    onDiagnosticChatId: () => {},
  });
  assert.equal(beginOperation().chatId, 'default');
});

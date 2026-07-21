require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createConversationForOperation,
  queryConversationsForOperation,
} = require('../聊天数据库/chatPartitionOperations.ts');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
};

test('reverse database resolution preserves database and chatId pairing', async () => {
  const oldDb = deferred();
  const newDb = deferred();
  const writes = [];
  const queries = [];
  const oldCreate = createConversationForOperation(
    { chatId: 'old-chat', dbPromise: oldDb.promise },
    { type: 'private', members: ['甲'], name: '甲' },
    1,
    (db, record) => {
      writes.push([db.label, record]);
      return record;
    },
  );
  const newQuery = queryConversationsForOperation({ chatId: 'new-chat', dbPromise: newDb.promise }, db => ({
    getAll: chatId => {
      queries.push([db.label, chatId]);
      return [chatId];
    },
  }));
  newDb.resolve({ label: 'new-db' });
  oldDb.resolve({ label: 'old-db' });
  const [record, rows] = await Promise.all([oldCreate, newQuery]);
  assert.equal(record.chatId, 'old-chat');
  assert.match(record.id, /^conv_old-chat_private_/);
  assert.deepEqual(
    writes.map(([db, value]) => [db, value.chatId]),
    [['old-db', 'old-chat']],
  );
  assert.deepEqual(queries, [['new-db', 'new-chat']]);
  assert.deepEqual(rows, ['new-chat']);
});

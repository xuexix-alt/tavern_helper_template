require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabaseConnectionCache } = require('../聊天数据库/databaseConnectionCache.ts');

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

test('concurrent opens share one promise and version change closes only the current connection', async () => {
  const first = deferred();
  const second = deferred();
  const pending = [first, second];
  const opened = [];
  const connected = [];
  const disconnected = [];
  const versionHandlers = new Map();
  const cache = createDatabaseConnectionCache({
    openConnection: () => {
      opened.push(opened.length + 1);
      return pending[opened.length - 1].promise;
    },
    setVersionChangeHandler: (database, handler) => versionHandlers.set(database, handler),
    closeConnection: database => database.close(),
    onConnected: database => connected.push(database.label),
    onDisconnected: database => disconnected.push(database.label),
  });

  const firstOpen = cache.open();
  assert.equal(cache.open(), firstOpen);
  assert.deepEqual(opened, [1]);
  const oldDatabase = {
    label: 'old',
    closeCalls: 0,
    close() {
      this.closeCalls += 1;
    },
  };
  first.resolve(oldDatabase);
  assert.equal(await firstOpen, oldDatabase);
  assert.deepEqual(connected, ['old']);

  versionHandlers.get(oldDatabase)();
  versionHandlers.get(oldDatabase)();
  assert.equal(oldDatabase.closeCalls, 2);
  assert.deepEqual(disconnected, ['old']);

  const secondOpen = cache.open();
  assert.notEqual(secondOpen, firstOpen);
  assert.deepEqual(opened, [1, 2]);
  const newDatabase = {
    label: 'new',
    closeCalls: 0,
    close() {
      this.closeCalls += 1;
    },
  };
  second.resolve(newDatabase);
  assert.equal(await secondOpen, newDatabase);
  assert.deepEqual(connected, ['old', 'new']);

  versionHandlers.get(oldDatabase)();
  assert.equal(cache.open(), secondOpen);
  assert.deepEqual(disconnected, ['old']);
});

test('failed connection is evicted so a later open can retry', async () => {
  const attempts = [];
  const cache = createDatabaseConnectionCache({
    openConnection: () => {
      const attempt = deferred();
      attempts.push(attempt);
      return attempt.promise;
    },
    setVersionChangeHandler: () => {},
    closeConnection: () => {},
    onConnected: () => {},
    onDisconnected: () => {},
  });

  const failedOpen = cache.open();
  attempts[0].reject(new Error('open failed'));
  await assert.rejects(failedOpen, /open failed/);
  const retriedOpen = cache.open();
  assert.notEqual(retriedOpen, failedOpen);
  assert.equal(attempts.length, 2);
  attempts[1].resolve({ label: 'recovered' });
  assert.equal((await retriedOpen).label, 'recovered');
});

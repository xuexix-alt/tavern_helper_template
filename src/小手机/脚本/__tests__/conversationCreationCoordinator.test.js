process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationCreationCoordinator } = require('../聊天APP/conversationCreationCoordinator.ts');

function harness(overrides = {}) {
  const calls = { get: 0, create: 0, commit: [], refresh: 0, refreshErrors: 0 };
  const created = { id: 'new', type: 'private', members: ['甲'], name: '甲' };
  const deps = {
    getConversations: async () => {
      calls.get += 1;
      return [];
    },
    createConversation: async payload => {
      calls.create += 1;
      return { ...created, ...payload };
    },
    onCommit: conversation => calls.commit.push(conversation),
    refreshConversations: async () => {
      calls.refresh += 1;
    },
    onRefreshError: () => {
      calls.refreshErrors += 1;
    },
    captureContext: () => 'ctx-1',
    isCurrent: token => token === 'ctx-1',
    ...overrides,
  };
  return { calls, coordinator: createConversationCreationCoordinator(deps) };
}

test('private confirmation performs fresh lookup and reuses an existing private without create', async () => {
  const existing = { id: 'old', type: 'private', members: ['甲'], name: '甲' };
  const h = harness({
    getConversations: async () => {
      h.calls.get += 1;
      return [existing];
    },
  });
  assert.deepEqual(await h.coordinator.confirmPrivate(['甲']), { ok: true, kind: 'existing', conversation: existing });
  assert.deepEqual(h.calls, { get: 1, create: 0, commit: [existing], refresh: 0, refreshErrors: 0 });
});

test('private lookup failure fails closed and never creates', async () => {
  const h = harness({
    getConversations: async () => {
      h.calls.get += 1;
      throw new Error('read failed');
    },
  });
  assert.deepEqual(await h.coordinator.confirmPrivate(['甲']), { ok: false, reason: 'lookup-error' });
  assert.equal(h.calls.create, 0);
});

test('stale private lookup never starts a create in the new context', async () => {
  let release;
  let current = true;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const h = harness({
    getConversations: async () => {
      h.calls.get += 1;
      await pending;
      return [];
    },
    captureContext: () => 'old',
    isCurrent: token => token === 'old' && current,
  });
  const result = h.coordinator.confirmPrivate(['甲']);
  current = false;
  release();
  assert.deepEqual(await result, { ok: false, reason: 'stale' });
  assert.equal(h.calls.create, 0);
  assert.equal(h.calls.commit.length, 0);
  assert.equal(h.calls.refresh, 0);
});

test('created conversation commits and resolves before a non-blocking refresh settles', async () => {
  let rejectRefresh;
  const pendingRefresh = new Promise((_, reject) => {
    rejectRefresh = reject;
  });
  const h = harness({
    refreshConversations: () => {
      h.calls.refresh += 1;
      return pendingRefresh;
    },
  });
  const result = await Promise.race([
    h.coordinator.confirmPrivate(['甲']),
    new Promise((_, reject) => setTimeout(() => reject(new Error('confirmation waited for refresh')), 50)),
  ]);
  assert.equal(result.ok, true);
  assert.equal(h.calls.create, 1);
  assert.equal(h.calls.commit.length, 1);
  assert.equal(h.coordinator.isBusy(), false);
  rejectRefresh(new Error('refresh failed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.refresh, 1);
  assert.equal(h.calls.refreshErrors, 1);
  assert.equal(h.calls.create, 1);
});

test('group confirmation always creates once and busy submissions are rejected', async () => {
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const h = harness({
    createConversation: async payload => {
      h.calls.create += 1;
      await pending;
      return { id: 'g', ...payload };
    },
  });
  const first = h.coordinator.confirmGroup(['甲', '乙'], '');
  assert.deepEqual(await h.coordinator.confirmGroup(['甲', '乙'], ''), { ok: false, reason: 'busy' });
  release();
  assert.equal((await first).ok, true);
  assert.equal(h.calls.create, 1);
});

test('creation errors preserve caller state and stale completion does not commit or refresh', async () => {
  const failed = harness({
    createConversation: async () => {
      failed.calls.create += 1;
      throw new Error('create failed');
    },
  });
  assert.deepEqual(await failed.coordinator.confirmGroup(['甲', '乙'], '群'), { ok: false, reason: 'create-error' });
  assert.equal(failed.calls.commit.length, 0);
  const stale = harness({ captureContext: () => 'old', isCurrent: () => false });
  assert.deepEqual(await stale.coordinator.confirmPrivate(['甲']), { ok: false, reason: 'stale' });
  assert.equal(stale.calls.get, 0);
  assert.equal(stale.calls.create, 0);
  assert.equal(stale.calls.commit.length, 0);
  assert.equal(stale.calls.refresh, 0);
});

test('commit programming errors reject consistently for existing and created conversations', async () => {
  const commitError = new Error('commit failed');
  const existing = { id: 'old', type: 'private', members: ['甲'], name: '甲' };
  const reused = harness({
    getConversations: async () => {
      reused.calls.get += 1;
      return [existing];
    },
    onCommit: () => {
      throw commitError;
    },
  });
  await assert.rejects(reused.coordinator.confirmPrivate(['甲']), error => error === commitError);
  assert.equal(reused.coordinator.isBusy(), false);
  assert.equal(reused.calls.refresh, 0);

  const created = harness({
    onCommit: () => {
      throw commitError;
    },
  });
  await assert.rejects(created.coordinator.confirmGroup(['甲', '乙'], '群'), error => error === commitError);
  assert.equal(created.coordinator.isBusy(), false);
  assert.equal(created.calls.refresh, 0);
});

test('synchronous refresh and refresh error callback failures cannot change creation success or become unhandled', async () => {
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const h = harness({
      refreshConversations: () => {
        h.calls.refresh += 1;
        throw new Error('sync refresh failed');
      },
      onRefreshError: () => {
        h.calls.refreshErrors += 1;
        throw new Error('reporting failed');
      },
    });
    const result = await h.coordinator.confirmGroup(['甲', '乙'], '群');
    assert.equal(result.ok, true);
    assert.equal(h.calls.commit.length, 1);
    assert.equal(h.coordinator.isBusy(), false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.refresh, 1);
    assert.equal(h.calls.refreshErrors, 1);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('context becoming stale after create returns stale without commit or refresh and clears busy', async () => {
  let release;
  let current = true;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const h = harness({
    createConversation: async payload => {
      h.calls.create += 1;
      await pending;
      return { id: 'new', ...payload };
    },
    captureContext: () => 'old',
    isCurrent: token => token === 'old' && current,
  });
  const result = h.coordinator.confirmGroup(['甲', '乙'], '群');
  assert.equal(h.coordinator.isBusy(), true);
  current = false;
  release();
  assert.deepEqual(await result, { ok: false, reason: 'stale' });
  assert.equal(h.calls.create, 1);
  assert.equal(h.calls.commit.length, 0);
  assert.equal(h.calls.refresh, 0);
  assert.equal(h.coordinator.isBusy(), false);
});

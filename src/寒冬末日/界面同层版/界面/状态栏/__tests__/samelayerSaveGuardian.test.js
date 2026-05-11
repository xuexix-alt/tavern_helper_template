/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createSameLayerSaveGuardian } = require('../samelayerSaveGuardian.ts');

function buildResponse(status, body = '{}') {
  return new Response(body, { status, statusText: status >= 400 ? 'error' : 'ok' });
}

function buildFakeHook() {
  let wrapper = null;
  let restored = false;
  let nativeImpl = async () => buildResponse(200);
  return {
    install: (makeWrapper, nat) => {
      nativeImpl = nat;
      // 生产代码会把"该 window 自己的 native fetch"喂给 makeWrapper，得到一个新的 wrapper；
      // 单测里只有一个"模拟 window"，所以直接用 nativeImpl 作为 native fetch 造 wrapper。
      wrapper = makeWrapper((input, init) => nativeImpl(input, init));
      return {
        nativeFetch: (input, init) => nativeImpl(input, init),
        restore: () => {
          restored = true;
        },
      };
    },
    setNative: impl => {
      nativeImpl = impl;
    },
    callThroughWrapper: (input, init) => wrapper(input, init),
    isRestored: () => restored,
  };
}

function createGuardian(options = {}) {
  const hook = buildFakeHook();
  const changes = [];
  const contextStore = { saveChat: options.saveChat ?? null };
  const handle = createSameLayerSaveGuardian({
    installFetchHook: makeWrapper => hook.install(makeWrapper, options.native ?? (async () => buildResponse(200))),
    contextResolver: () => contextStore,
    options: {
      onStateChange: snapshot => changes.push({ ...snapshot, recentFailures: [...snapshot.recentFailures] }),
    },
  });
  return { handle, hook, changes, contextStore };
}

test('guardian records a success when /api/chats/save returns 200', async () => {
  const { handle, hook } = createGuardian({
    native: async () => buildResponse(200),
  });

  await hook.callThroughWrapper('/api/chats/save', { method: 'POST' });

  assert.equal(handle.health.status, 'healthy');
  assert.equal(handle.health.consecutiveFailures, 0);
  assert.notEqual(handle.health.lastSucceededAt, null);
  assert.equal(handle.health.lastFailedAt, null);
});

test('guardian records a failure on 500 and notifies via onStateChange', async () => {
  const { handle, hook, changes } = createGuardian({
    native: async () => buildResponse(500, 'EPERM rename'),
  });

  await hook.callThroughWrapper('/api/chats/save', { method: 'POST' });

  assert.equal(handle.health.status, 'failing');
  assert.equal(handle.health.consecutiveFailures, 1);
  assert.equal(handle.health.recentFailures.length, 1);
  assert.equal(handle.health.recentFailures[0].status, 500);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].status, 'failing');
});

test('guardian ignores unrelated fetch calls', async () => {
  const { handle, hook } = createGuardian({ native: async () => buildResponse(500) });

  await hook.callThroughWrapper('/api/generate', { method: 'POST' });

  assert.equal(handle.health.status, 'healthy');
  assert.equal(handle.health.consecutiveFailures, 0);
  assert.equal(handle.health.lastFailedAt, null);
});

test('guardian flips back to healthy after a recovering save', async () => {
  let counter = 0;
  const { handle, hook } = createGuardian({
    native: async () => {
      counter += 1;
      return counter === 1 ? buildResponse(500, 'EPERM') : buildResponse(200);
    },
  });

  await hook.callThroughWrapper('/api/chats/save');
  await hook.callThroughWrapper('/api/chats/save');

  assert.equal(handle.health.status, 'healthy');
  assert.equal(handle.health.consecutiveFailures, 0);
});

test('guardian captures network-level exceptions as failures', async () => {
  const { handle, hook } = createGuardian({
    native: async () => {
      throw new Error('network down');
    },
  });

  let threw = false;
  try {
    await hook.callThroughWrapper('/api/chats/save');
  } catch (error) {
    threw = true;
    assert.match(error.message, /network down/);
  }
  assert.equal(threw, true);
  assert.equal(handle.health.status, 'failing');
  assert.equal(handle.health.recentFailures[0].status, 'network');
});

test('requestExplicitSave calls saveChat and treats new success timestamp as recovery', async () => {
  let saveCalls = 0;
  let responder = null;
  const saveChat = async () => {
    saveCalls += 1;
    // Simulate the real thing: saveChatConditional triggers a /api/chats/save fetch internally.
    await responder();
  };
  const { handle, hook } = createGuardian({
    saveChat,
    native: async () => buildResponse(200),
  });
  responder = async () => {
    await hook.callThroughWrapper('/api/chats/save');
  };

  const ok = await handle.requestExplicitSave('test-retry');
  assert.equal(saveCalls, 1);
  assert.equal(ok, true);
  assert.equal(handle.health.status, 'healthy');
});

test('requestExplicitSave returns false when context has no saveChat', async () => {
  const { handle } = createGuardian({ saveChat: null });

  const ok = await handle.requestExplicitSave('no-context');
  assert.equal(ok, false);
});

test('requestExplicitSave records a failure if saveChat throws', async () => {
  const saveChat = async () => {
    throw new Error('boom');
  };
  const { handle } = createGuardian({ saveChat });

  const ok = await handle.requestExplicitSave('throw-test');
  assert.equal(ok, false);
  assert.equal(handle.health.status, 'failing');
  assert.equal(handle.health.recentFailures[0].status, 'network');
  assert.match(handle.health.recentFailures[0].statusText ?? '', /throw-test/);
});

test('uninstall calls restore exactly once', async () => {
  const { handle, hook } = createGuardian({});
  handle.uninstall();
  handle.uninstall(); // idempotent in the sense that it should not throw
  assert.equal(hook.isRestored(), true);
});

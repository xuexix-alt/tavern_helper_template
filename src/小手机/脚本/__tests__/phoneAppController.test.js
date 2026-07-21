const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
require('ts-node/register/transpile-only');

const { createPhoneAppController } = require('../小手机主程序/phoneAppController.ts');

function createHarness() {
  const scheduled = [];
  const containers = new Map([
    ['chat-app', { id: 'chat-app', isConnected: true }],
    ['weather-app', { id: 'weather-app', isConnected: true }],
  ]);
  const placeholders = [];
  const errors = [];
  const logs = [];
  const current = { value: null };
  const visible = { count: 0 };
  const registered = new Set(['chat-app', 'weather-app']);
  const vue = { createApp() {} };

  const controller = createPhoneAppController({
    vue,
    scheduleMount: callback => scheduled.push(callback),
    getContainer: appId => containers.get(appId) ?? null,
    ensurePhoneVisible: () => {
      visible.count += 1;
    },
    isRegisteredApp: appId => registered.has(appId),
    setCurrentApp: appId => {
      current.value = appId;
    },
    showPlaceholder: (container, message) => placeholders.push([container.id, message]),
    showError: (container, error) => errors.push([container.id, error]),
    logError: error => logs.push(error),
  });

  function flushScheduled() {
    const callbacks = scheduled.splice(0);
    callbacks.forEach(callback => callback());
  }

  return {
    controller,
    scheduled,
    containers,
    placeholders,
    errors,
    logs,
    current,
    visible,
    registered,
    vue,
    flushScheduled,
  };
}

test('renderer registered before open mounts once in the exact app container with the provided Vue runtime', () => {
  const harness = createHarness();
  const calls = [];
  harness.controller.registerRenderer('chat-app', context => {
    calls.push(context);
  });

  assert.equal(harness.controller.openApp('chat-app'), true);
  assert.equal(harness.current.value, 'chat-app');
  assert.equal(harness.visible.count, 1);
  assert.equal(harness.scheduled.length, 1);

  harness.flushScheduled();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].container, harness.containers.get('chat-app'));
  assert.equal(calls[0].vue, harness.vue);
});

test('opening before renderer registration shows a placeholder, then late registration mounts once', () => {
  const harness = createHarness();
  const calls = [];

  assert.equal(harness.controller.openApp('chat-app'), true);
  harness.flushScheduled();
  assert.deepEqual(harness.placeholders, [['chat-app', 'APP 尚未就绪']]);

  harness.controller.registerRenderer('chat-app', context => {
    calls.push(context);
  });
  assert.equal(harness.scheduled.length, 1);
  harness.flushScheduled();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].container, harness.containers.get('chat-app'));
  assert.equal(calls[0].vue, harness.vue);
});

test('unregistered app is rejected without changing state or scheduling a mount', () => {
  const harness = createHarness();

  assert.equal(harness.controller.openApp('missing-app'), false);
  assert.equal(harness.current.value, null);
  assert.equal(harness.controller.getCurrentAppId(), null);
  assert.equal(harness.visible.count, 0);
  assert.equal(harness.scheduled.length, 0);
});

test('registering a replacement renderer cleans the visible renderer before scheduling the replacement', () => {
  const harness = createHarness();
  const calls = [];
  harness.controller.registerRenderer('chat-app', () => {
    calls.push('mount-old');
    return () => calls.push('clean-old');
  });
  harness.controller.openApp('chat-app');
  harness.flushScheduled();

  harness.controller.registerRenderer('chat-app', () => {
    calls.push('mount-new');
  });

  assert.deepEqual(calls, ['mount-old', 'clean-old']);
  assert.equal(harness.scheduled.length, 1);
  harness.flushScheduled();
  assert.deepEqual(calls, ['mount-old', 'clean-old', 'mount-new']);
});

test('registering the same visible renderer again still cleans and remounts it', () => {
  const harness = createHarness();
  const calls = [];
  const renderer = () => {
    calls.push('mount');
    return () => calls.push('clean');
  };
  harness.controller.registerRenderer('chat-app', renderer);
  harness.controller.openApp('chat-app');
  harness.flushScheduled();

  harness.controller.registerRenderer('chat-app', renderer);

  assert.deepEqual(calls, ['mount', 'clean']);
  assert.equal(harness.scheduled.length, 1);
  harness.flushScheduled();
  assert.deepEqual(calls, ['mount', 'clean', 'mount']);
});

test('unregistering the visible renderer cleans it while retaining the route and showing a placeholder', () => {
  const harness = createHarness();
  const calls = [];
  harness.controller.registerRenderer('chat-app', () => {
    calls.push('mount');
    return () => calls.push('clean');
  });
  harness.controller.openApp('chat-app');
  harness.flushScheduled();

  harness.controller.unregisterRenderer('chat-app');

  assert.deepEqual(calls, ['mount', 'clean']);
  assert.equal(harness.controller.getCurrentAppId(), 'chat-app');
  assert.equal(harness.current.value, 'chat-app');
  assert.equal(harness.scheduled.length, 1);
  harness.flushScheduled();
  assert.deepEqual(harness.placeholders, [['chat-app', 'APP 尚未就绪']]);
  assert.deepEqual(calls, ['mount', 'clean']);
});

test('switching apps invalidates stale mounts and cleans an actively mounted renderer once', () => {
  const harness = createHarness();
  const calls = [];
  harness.controller.registerRenderer('chat-app', () => {
    calls.push('mount-chat');
    return () => calls.push('clean-chat');
  });
  harness.controller.registerRenderer('weather-app', () => {
    calls.push('mount-weather');
    return () => calls.push('clean-weather');
  });

  harness.controller.openApp('chat-app');
  harness.controller.openApp('weather-app');
  harness.flushScheduled();
  assert.deepEqual(calls, ['mount-weather']);

  harness.controller.openApp('chat-app');
  harness.flushScheduled();
  assert.deepEqual(calls, ['mount-weather', 'clean-weather', 'mount-chat']);

  harness.controller.openApp('weather-app');
  assert.deepEqual(calls, ['mount-weather', 'clean-weather', 'mount-chat', 'clean-chat']);
  harness.flushScheduled();
  assert.deepEqual(calls, ['mount-weather', 'clean-weather', 'mount-chat', 'clean-chat', 'mount-weather']);
  assert.equal(calls.filter(call => call === 'clean-chat').length, 1);
});

test('reopening the active app preserves its renderer while ensuring the phone is visible again', () => {
  const harness = createHarness();
  const calls = [];
  harness.controller.registerRenderer('chat-app', () => {
    calls.push('mount');
    return () => calls.push('clean');
  });
  harness.controller.openApp('chat-app');
  harness.flushScheduled();

  assert.equal(harness.controller.openApp('chat-app'), true);
  assert.equal(harness.visible.count, 2);
  assert.equal(harness.scheduled.length, 0);
  assert.deepEqual(calls, ['mount']);
});

test('going home twice and then destroying cleans the active renderer at most once and clears current state', () => {
  const harness = createHarness();
  const calls = [];
  harness.controller.registerRenderer('chat-app', () => () => calls.push('clean'));
  harness.controller.openApp('chat-app');
  harness.flushScheduled();

  harness.controller.goHome();
  harness.controller.goHome();
  harness.controller.destroy();

  assert.deepEqual(calls, ['clean']);
  assert.equal(harness.controller.getCurrentAppId(), null);
  assert.equal(harness.current.value, null);
});

test('destroying the controller invalidates a scheduled mount', () => {
  const harness = createHarness();
  const calls = [];
  harness.controller.registerRenderer('chat-app', () => calls.push('mount'));
  harness.controller.openApp('chat-app');

  harness.controller.destroy();
  harness.flushScheduled();

  assert.deepEqual(calls, []);
  assert.equal(harness.controller.getCurrentAppId(), null);
  assert.equal(harness.current.value, null);
});

test('a renderer failure clears partial content and reports the exact mount error', () => {
  const harness = createHarness();
  const container = harness.containers.get('chat-app');
  container.innerHTML = 'existing';
  const error = new Error('mount failed');
  harness.controller.registerRenderer('chat-app', ({ container: target }) => {
    target.innerHTML = 'partial';
    throw error;
  });
  harness.controller.openApp('chat-app');

  assert.doesNotThrow(() => harness.flushScheduled());
  assert.equal(container.innerHTML, '');
  assert.deepEqual(harness.errors, [['chat-app', error]]);
});

test('a cleanup failure is logged without preventing navigation home', () => {
  const harness = createHarness();
  const error = new Error('cleanup failed');
  harness.controller.registerRenderer('chat-app', () => () => {
    throw error;
  });
  harness.controller.openApp('chat-app');
  harness.flushScheduled();

  assert.doesNotThrow(() => harness.controller.goHome());
  assert.deepEqual(harness.logs, [error]);
  assert.equal(harness.controller.getCurrentAppId(), null);
  assert.equal(harness.current.value, null);
});

test('refreshCurrent mounts once a previously missing container becomes connected', () => {
  const harness = createHarness();
  const calls = [];
  harness.containers.delete('chat-app');
  harness.controller.registerRenderer('chat-app', context => calls.push(context));
  harness.controller.openApp('chat-app');
  harness.flushScheduled();
  assert.deepEqual(calls, []);

  const container = { id: 'chat-app', isConnected: true };
  harness.containers.set('chat-app', container);
  harness.controller.refreshCurrent();
  harness.flushScheduled();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].container, container);
  assert.equal(calls[0].vue, harness.vue);
});

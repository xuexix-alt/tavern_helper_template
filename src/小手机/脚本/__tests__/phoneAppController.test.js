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

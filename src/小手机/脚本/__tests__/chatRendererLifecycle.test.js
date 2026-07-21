process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { mountChatRenderer, waitForPhoneSystem } = require('../聊天APP/chatRendererLifecycle.ts');

test('mountChatRenderer mounts into the exact container and cleanup is idempotent', () => {
  const calls = [];
  const container = { id: 'target' };
  const app = { mount: value => calls.push(['mount', value]), unmount: () => calls.push(['unmount']) };
  const vue = { createApp: component => { calls.push(['create', component]); return app; } };
  const cleanup = mountChatRenderer({ container, vue, component: 'ChatComponent' });
  cleanup(); cleanup();
  assert.deepEqual(calls, [['create', 'ChatComponent'], ['mount', container], ['unmount']]);
});

test('mountChatRenderer rolls back and rethrows mount failures', () => {
  let unmounts = 0;
  const vue = { createApp: () => ({ mount: () => { throw new Error('mount failed'); }, unmount: () => { unmounts += 1; } }) };
  assert.throws(() => mountChatRenderer({ container: {}, vue, component: {} }), /mount failed/);
  assert.equal(unmounts, 1);
});

test('waitForPhoneSystem calls onReady once when the system appears', () => {
  const queue = [];
  let system = null;
  let ready = 0;
  waitForPhoneSystem({ read: () => system, schedule: fn => { queue.push(fn); return fn; }, cancel: () => {}, onReady: value => { assert.equal(value, system); ready += 1; } });
  assert.equal(queue.length, 1);
  system = { registerApp() {} };
  queue.shift()();
  assert.equal(ready, 1);
});

test('cancelling the waiter clears its timer and stale callbacks cannot register', () => {
  const queue = [];
  const cancelled = [];
  let ready = 0;
  const stop = waitForPhoneSystem({ read: () => null, schedule: fn => { queue.push(fn); return fn; }, cancel: token => cancelled.push(token), onReady: () => { ready += 1; } });
  const stale = queue[0];
  stop();
  stale();
  assert.deepEqual(cancelled, [stale]);
  assert.equal(ready, 0);
  assert.equal(queue.length, 1);
});

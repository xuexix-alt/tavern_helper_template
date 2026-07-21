process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node' });
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLatestMessageOperationGuard } = require('../聊天APP/chatMessageOperation.ts');

test('same-renderer navigation leaves the active message operation able to release global busy', () => {
  const guard = createLatestMessageOperationGuard();
  const first = guard.start();
  assert.equal(guard.isCurrent(first), true);
  // Navigating between conversations does not touch the operation guard.
  assert.equal(guard.finish(first), true);
  assert.equal(guard.isCurrent(first), false);
});

test('a stale completion cannot finish or disturb a later message operation', () => {
  const guard = createLatestMessageOperationGuard();
  const first = guard.start();
  guard.invalidate();
  const second = guard.start();
  assert.equal(guard.finish(first), false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.finish(second), true);
  assert.equal(guard.isCurrent(second), false);
});

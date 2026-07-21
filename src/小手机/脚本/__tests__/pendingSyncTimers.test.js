require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cancelPendingTimers } = require('../聊天正文联动/pendingSyncTimers.ts');

test('cancelPendingTimers clears every token once, empties the map, and never runs callbacks', () => {
  let callbacks = 0;
  const tokens = [
    { id: 1, run: () => callbacks++ },
    { id: 2, run: () => callbacks++ },
    { id: 3, run: () => callbacks++ },
  ];
  const timers = new Map(tokens.map(token => [token.id, token]));
  const cleared = [];
  cancelPendingTimers(timers, token => cleared.push(token.id));
  cancelPendingTimers(timers, token => cleared.push(token.id));
  assert.deepEqual(cleared, [1, 2, 3]);
  assert.equal(timers.size, 0);
  assert.equal(callbacks, 0);
});

test('ChatSync exports cancelPending through the actual object', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../聊天正文联动/index.ts'), 'utf8');
  const object = source.match(/const ChatSync\s*=\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(object);
  assert.match(object[1], /\bcancelPending\b/);
  const body = source.match(/function cancelPending\(\)[^{]*\{([\s\S]*?)\n\s*\}/);
  assert.ok(body);
  assert.match(body[1], /cancelPendingTimers\(syncTimers,\s*clearTimeout\)/);
  assert.doesNotMatch(body[1], /syncToChatLore/);
});

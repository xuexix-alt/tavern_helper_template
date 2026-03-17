require('ts-node/register/transpile-only');

const { createImageRecentIntentStore } = require('../src/寒冬末日/界面同层版/界面/状态栏/imageRecentIntent.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

let currentNow = 1_000;
const store = createImageRecentIntentStore({
  now: () => currentNow,
  ttlMs: 2_000,
});

store.mark(6, 'transcript');
let current = store.read();
assertEqual(current?.messageId, 6, 'recent intent should keep latest message id');
assertEqual(current?.source, 'transcript', 'recent intent should preserve source');

currentNow += 1_500;
current = store.read();
assertEqual(current?.messageId, 6, 'recent intent should stay valid inside ttl');

currentNow += 700;
current = store.read();
assertEqual(current, null, 'recent intent should expire after ttl');

console.log('image recent intent test passed');

require('ts-node/register/transpile-only');

const { createImageRecentIntentStore } = require('../src/寒冬末日/界面同层版/界面/状态栏/imageRecentIntent.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

let currentNow = 1_000;
const shortTtlStore = createImageRecentIntentStore({
  now: () => currentNow,
  ttlMs: 2_000,
});

shortTtlStore.mark(6, 'transcript');
let current = shortTtlStore.read();
assertEqual(current?.messageId, 6, 'recent intent should keep latest message id');
assertEqual(current?.source, 'transcript', 'recent intent should preserve source');

currentNow += 1_500;
current = shortTtlStore.read();
assertEqual(current?.messageId, 6, 'recent intent should stay valid inside ttl');

currentNow += 700;
current = shortTtlStore.read();
assertEqual(current, null, 'recent intent should expire after ttl');

let defaultNow = 10_000;
const defaultStore = createImageRecentIntentStore({
  now: () => defaultNow,
});

defaultStore.mark(8, 'transcript');
defaultNow += 65_000;
current = defaultStore.read();
assertEqual(current?.messageId, 8, 'default recent intent should survive slow plugin LLM image prompt generation');

defaultNow += 10 * 60_000;
current = defaultStore.read();
assertEqual(current, null, 'default recent intent should eventually expire');

console.log('image recent intent test passed');

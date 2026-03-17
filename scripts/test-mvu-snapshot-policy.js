require('ts-node/register/transpile-only');

const { resolveMvuSnapshotState } = require('../src/寒冬末日/界面同层版/界面/状态栏/mvuSnapshotPolicy.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const currentEmpty = { ok: false };
const latestReadable = { ok: true, data: { 慕小小: { 姓名: '慕小小' } }, messageId: 11 };

const emptyResult = resolveMvuSnapshotState({
  target: 5,
  current: currentEmpty,
  latest: latestReadable,
  ready: false,
  previousSource: 'default',
  previousResolvedMessageId: 'latest',
  extraAnalysis: false,
});

assertEqual(emptyResult.mode, 'empty', 'unreadable target should become empty instead of falling back to latest');
assertEqual(emptyResult.source, 'default', 'unreadable target should keep default source');

const retryResult = resolveMvuSnapshotState({
  target: 5,
  current: currentEmpty,
  latest: latestReadable,
  ready: true,
  previousSource: 'current',
  previousResolvedMessageId: 5,
  extraAnalysis: true,
});

assertEqual(retryResult.mode, 'empty', 'extra analysis should stay empty instead of keeping stale snapshot');
assertEqual(retryResult.isRetrying, true, 'extra analysis should mark retrying without falling back');
assertEqual(retryResult.source, 'default', 'extra analysis should not preserve stale current source');

console.log('mvu snapshot policy test passed');

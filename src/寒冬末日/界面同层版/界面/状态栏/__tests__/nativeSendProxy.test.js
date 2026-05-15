const test = require('node:test');
const assert = require('node:assert/strict');

const { buildNativeSendSlashCommand, normalizeNativeSendText } = require('../nativeSendProxy.ts');

test('normalizeNativeSendText flattens newlines and guards slash pipeline separators', () => {
  assert.equal(normalizeNativeSendText('  第一行\n第二行 | 第三段  '), '第一行 第二行 ｜ 第三段');
});

test('buildNativeSendSlashCommand only inserts the user floor; generation is triggered separately', () => {
  assert.equal(buildNativeSendSlashCommand('第一行\n第二行 | 第三段', false), '/send 第一行 第二行 ｜ 第三段');
});

test('buildNativeSendSlashCommand ignores legacy trigger options so slash pipelines cannot swallow generation', () => {
  assert.equal(
    buildNativeSendSlashCommand('第一行\n第二行 | 第三段', { awaitTrigger: true }),
    '/send 第一行 第二行 ｜ 第三段',
  );
});

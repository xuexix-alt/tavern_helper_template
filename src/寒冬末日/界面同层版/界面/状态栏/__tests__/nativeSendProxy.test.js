const test = require('node:test');
const assert = require('node:assert/strict');

const { buildNativeSendSlashCommand, normalizeNativeSendText } = require('../nativeSendProxy.ts');

test('normalizeNativeSendText flattens newlines and guards slash pipeline separators', () => {
  assert.equal(normalizeNativeSendText('  第一行\n第二行 | 第三段  '), '第一行 第二行 ｜ 第三段');
});

test('buildNativeSendSlashCommand uses /send + /trigger await=true for native proxy mode', () => {
  assert.equal(
    buildNativeSendSlashCommand('第一行\n第二行 | 第三段', true),
    '/send 第一行 第二行 ｜ 第三段 | /trigger await=true',
  );
});

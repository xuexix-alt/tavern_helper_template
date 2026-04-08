const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('same-layer system panel no longer renders guarantee-distance card', () => {
  const sourcePath = path.resolve(__dirname, '../components/MvuRolePanel.vue');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.doesNotMatch(source, /距离上次保底升级/);
  assert.doesNotMatch(source, /const pityText = computed\(/);
  assert.doesNotMatch(source, /'庇护所\.距离上次升级'/);
});

test('eden helper no longer contains guarantee-upgrade settlement logic or guarantee copy', () => {
  const sourcePath = path.resolve(__dirname, '../../../../脚本/伊甸后台数据辅助/index.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function formatDistanceText\(daysSinceUpgrade: number\): string \{/);
  assert.match(source, /return `\$\{days\}天`;/);
  assert.doesNotMatch(source, /剩余保底升级天数/);
  assert.doesNotMatch(source, /保底升级！/);
  assert.doesNotMatch(source, /const isGuarantee = baseDays >= 7;/);
  assert.doesNotMatch(source, /reason: 'guarantee'/);
});

test('initvar default shelter distance text is simplified after guarantee removal', () => {
  const sourcePath = path.resolve(__dirname, '../../../../世界书/寒冬末日/[initvar].yaml');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /距离上次升级: "0天"/);
  assert.doesNotMatch(source, /剩余保底升级天数/);
});

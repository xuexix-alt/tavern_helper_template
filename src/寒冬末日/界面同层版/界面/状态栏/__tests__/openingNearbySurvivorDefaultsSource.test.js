const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../../../shared/opening.ts');

test('opening nearby survivor defaults stay empty and avoid raw role-profile imports', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.doesNotMatch(source, /角色档案_-__王静\.txt\?raw/);
  assert.doesNotMatch(source, /角色档案_-_林月华\.txt\?raw/);
  assert.doesNotMatch(source, /角色档案_-_赵卫国\.txt\?raw/);
  assert.doesNotMatch(source, /角色档案_-_陈雪\.txt\?raw/);
  assert.doesNotMatch(source, /角色详情_-_慕小小\.txt\?raw/);
  assert.doesNotMatch(source, /角色详情_-_桃乐丝・泽巴哈\.txt\?raw/);
  assert.doesNotMatch(source, /export const OPENING_MESSAGE_ID = 0;/);
  assert.match(
    source,
    /function getDefaultNearbySurvivorTypes\(\): string \{\s*return '';/,
  );
});

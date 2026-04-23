const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

test('eden command metadata parser exposes 名称 and 说明 for UI display', () => {
  const source = read('../edenOneShotCommands.ts');

  assert.match(source, /主线任务-星穹秩序\.txt\?raw/);
  assert.match(source, /type EdenOneShotCommandMeta =/);
  assert.match(source, /name:\s*string/);
  assert.match(source, /description:\s*string/);
  assert.match(source, /category:\s*string/);
  assert.match(source, /\^编号\(\?<id>\[a-z\]\{2\}\\d\{3\}\)-名称：/);
  assert.match(source, /作用：/);
});

test('eden command display entries prefer variable metadata fields when present', () => {
  const source = read('../edenOneShotCommands.ts');

  assert.match(source, /record\.说明/);
  assert.match(source, /record\.范围/);
  assert.match(source, /record\.时效/);
  assert.match(source, /category:\s*meta\?\.category \|\| '未分类'/);
});

test('eden command display entries sort by usable quantity before category and key', () => {
  const source = read('../edenOneShotCommands.ts');

  assert.match(source, /const CATEGORY_ORDER = \['认知修改类', '时空修改类', '战斗修改类', '属性修改类', '未分类'\]/);
  assert.match(source, /if \(a\.quantity !== b\.quantity\) return b\.quantity - a\.quantity;/);
  assert.match(
    source,
    /if \(a\.category !== b\.category\) return categoryRank\(a\.category\) - categoryRank\(b\.category\);/,
  );
});

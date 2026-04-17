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
  assert.match(source, /\^编号\(\?<id>\[a-z\]\{2\}\\d\{3\}\)-名称：/);
  assert.match(source, /作用：/);
});

test('eden command display entries prefer variable metadata fields when present', () => {
  const source = read('../edenOneShotCommands.ts');

  assert.match(source, /record\.说明/);
  assert.match(source, /record\.范围/);
  assert.match(source, /record\.时效/);
});

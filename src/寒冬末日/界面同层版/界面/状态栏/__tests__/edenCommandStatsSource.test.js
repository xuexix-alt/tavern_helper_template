const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

test('schema and initvar define 顶层 伊甸一次性指令 as 编号到次数映射', () => {
  const schemaSource = read('../../../../schema.ts');
  const initvarSource = read('../../../../世界书/寒冬末日/[initvar].yaml');

  assert.match(schemaSource, /伊甸一次性指令:\s*z\s*\.record\(/);
  assert.match(schemaSource, /z\.coerce\.number\(\)\.int\(\)\.prefault\(0\)/);
  assert.match(initvarSource, /伊甸一次性指令:\s*\{\}/);
});

test('mvu update rules include 顶层 伊甸一次性指令 write guidance', () => {
  const rulesSource = read('../../../../世界书/变量/[mvu_update]变量更新规则.yaml');

  assert.match(rulesSource, /^  伊甸一次性指令:\s*$/m);
  assert.match(rulesSource, /record<string,\s*number>/);
  assert.match(rulesSource, /key 为指令编号/);
  assert.match(rulesSource, /剩余次数|number 为剩余次数/);
});

test('same-layer system panel renders eden one-shot command stats card from top-level systemMvuData field', () => {
  const panelSource = read('../components/MvuRolePanel.vue');
  const storeSource = read('../mvuRoleStore.ts');

  assert.match(panelSource, /伊甸一次性指令/);
  assert.match(panelSource, /const edenCommandStatEntries = computed\(/);
  assert.match(panelSource, /_\.get\(systemMvuData\.value, '伊甸一次性指令', \{\}\)/);
  assert.match(panelSource, /v-for="entry in edenCommandStatEntries"/);
  assert.match(panelSource, /entry\.key/);
  assert.match(panelSource, /entry\.value/);
  assert.match(
    storeSource,
    /const RESERVED_TOP_LEVEL_KEYS = new Set\(\['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC', '伊甸一次性指令'\]\);/,
  );
});

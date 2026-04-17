const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

test('schema and initvar keep 顶层 伊甸一次性指令 as full metadata entries with zeroed counts', () => {
  const schemaSource = read('../../../../schema.ts');
  const initvarSource = read('../../../../世界书/寒冬末日/[initvar].yaml');
  const schemaScriptSource = read('../../../../脚本/变量结构/index.ts');
  const commandSchemaBlock = schemaSource.match(
    /const 伊甸一次性指令条目Schema = z[\s\S]*?const 角色控制Schema = z/,
  )?.[0];

  assert.ok(commandSchemaBlock, 'should locate 伊甸一次性指令条目Schema block');

  assert.match(schemaSource, /伊甸一次性指令:\s*z\s*\.record\(/);
  assert.match(commandSchemaBlock, /名称:\s*z\.string\(\)\.prefault\(''\)/);
  assert.match(commandSchemaBlock, /数量:\s*z\.number\(\)\.int\(\)\.nonnegative\(\)\.prefault\(0\)/);
  assert.match(commandSchemaBlock, /说明:\s*z\.string\(\)\.prefault\(''\)/);
  assert.match(commandSchemaBlock, /范围:\s*z\.string\(\)\.prefault\(''\)/);
  assert.match(commandSchemaBlock, /时效:\s*z\.string\(\)\.prefault\(''\)/);
  assert.doesNotMatch(commandSchemaBlock, /\.preprocess\(/);
  assert.doesNotMatch(commandSchemaBlock, /z\.coerce\.number\(\)/);
  assert.doesNotMatch(commandSchemaBlock, /\.transform\(/);
  assert.match(schemaScriptSource, /registerMvuSchema\(Schema\)/);
  assert.match(initvarSource, /伊甸一次性指令:\s*$/m);
  assert.match(initvarSource, /rz001:\s*[\r\n]+\s*名称:\s*朋友妻不客气/);
  assert.match(initvarSource, /sk001:\s*[\r\n]+\s*名称:\s*一二三木头人/);
  assert.match(initvarSource, /zd001:\s*[\r\n]+\s*名称:\s*一夫当关/);
  assert.match(initvarSource, /sx001:\s*[\r\n]+\s*名称:\s*满血复活/);
  assert.match(initvarSource, /数量:\s*0/);
  assert.match(initvarSource, /说明:\s*移除伴侣性道德感/);
  assert.match(initvarSource, /范围:\s*指定一位男性角色/);
  assert.match(initvarSource, /时效:\s*12小时/);
});

test('mvu update rules and output format document 名称+数量 writes for 顶层 伊甸一次性指令', () => {
  const rulesSource = read('../../../../世界书/变量/[mvu_update]变量更新规则.yaml');
  const outputSource = read('../../../../世界书/变量/[mvu_update]变量输出格式.yaml');
  const taskSource = read('../../../../世界书/寒冬末日/主线任务-星穹秩序.txt');

  assert.match(rulesSource, /^  伊甸一次性指令:\s*$/m);
  assert.match(rulesSource, /\[编号:\s*string\]/);
  assert.match(rulesSource, /名称:\s*string/);
  assert.match(rulesSource, /数量:\s*number/);
  assert.match(rulesSource, /说明:\s*string/);
  assert.match(rulesSource, /范围:\s*string/);
  assert.match(rulesSource, /时效:\s*string/);
  assert.match(rulesSource, /编号 为动态 key/);
  assert.match(rulesSource, /已有编号只更新 `\/伊甸一次性指令\/\$\{编号\}\/数量`/);
  assert.match(rulesSource, /\| 名称 \| 类别 \| 编号 \| 说明 \| 范围 \| 时效 \|/);
  assert.match(rulesSource, /\| 朋友妻不客气 \| 认知修改类 \| rz001 \|/);
  assert.match(outputSource, /"path":\s*"\/伊甸一次性指令\/rz001",\s*"value":\s*\{\s*"名称":/);
  assert.match(outputSource, /"说明":\s*"[^"]+"/);
  assert.match(outputSource, /"范围":\s*"[^"]+"/);
  assert.match(outputSource, /"时效":\s*"[^"]+"/);
  assert.match(outputSource, /"path":\s*"\/伊甸一次性指令\/sk001\/数量"/);
  assert.match(taskSource, /编号rz001-名称：/);
  assert.match(taskSource, /编号sk001-名称：/);
  assert.match(taskSource, /编号zd001-名称：/);
  assert.match(taskSource, /编号sx001-名称：/);
});

test('same-layer system panel and workbench modal render eden commands from top-level systemMvuData field', () => {
  const panelSource = read('../components/MvuRolePanel.vue');
  const workbenchSource = read('../components/WorkbenchTabs.vue');
  const storeSource = read('../mvuRoleStore.ts');
  const commandsSource = read('../edenOneShotCommands.ts');

  assert.match(panelSource, /伊甸一次性指令/);
  assert.match(panelSource, /const edenCommandStatEntries = computed\(/);
  assert.match(panelSource, /_\.get\(systemMvuData\.value, '伊甸一次性指令', \{\}\)/);
  assert.match(panelSource, /v-for="entry in edenCommandStatEntries"/);
  assert.match(panelSource, /entry\.name/);
  assert.match(panelSource, /entry\.quantity/);
  assert.match(panelSource, /entry\.description/);
  assert.match(panelSource, /entry\.scope/);
  assert.match(panelSource, /entry\.duration/);
  assert.match(workbenchSource, /useMvuSystemStore/);
  assert.match(workbenchSource, /_\.get\(systemMvuData\.value, '伊甸一次性指令', \{\}\)/);
  assert.match(workbenchSource, /名称/);
  assert.match(workbenchSource, /数量/);
  assert.match(workbenchSource, /说明/);
  assert.match(workbenchSource, /范围/);
  assert.match(workbenchSource, /时效/);
  assert.match(workbenchSource, /v-for="entry in edenCommandEntries"/);
  assert.match(commandsSource, /const record = value as Record<string, unknown>;/);
  assert.match(commandsSource, /name:\s*String\(record\.名称 \?\? ''\)\.trim\(\) \|\| meta\?\.name \|\| normalizedKey/);
  assert.match(commandsSource, /quantity:\s*normalizeQuantity\(record\.数量\)/);
  assert.match(
    commandsSource,
    /description:\s*String\(record\.说明 \?\? ''\)\.trim\(\) \|\| meta\?\.description \|\| ''/,
  );
  assert.match(commandsSource, /scope:\s*String\(record\.范围 \?\? ''\)\.trim\(\) \|\| meta\?\.scope \|\| ''/);
  assert.match(commandsSource, /duration:\s*String\(record\.时效 \?\? ''\)\.trim\(\) \|\| meta\?\.duration \|\| ''/);
  assert.match(storeSource, /const RESERVED_TOP_LEVEL_KEYS = new Set\(\[/);
  assert.match(storeSource, /'伊甸一次性指令'/);
});

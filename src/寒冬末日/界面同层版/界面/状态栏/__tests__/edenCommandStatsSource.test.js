const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

test('schema and initvar keep 顶层 伊甸一次性指令 as full metadata entries with seeded counts', () => {
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
  assert.match(commandSchemaBlock, /生效实例:\s*z\s*\.array\(/);
  assert.match(commandSchemaBlock, /对象范围:\s*z\.string\(\)\.prefault\(''\)/);
  assert.match(commandSchemaBlock, /剩余时效:\s*z\.string\(\)\.prefault\(''\)/);
  assert.doesNotMatch(commandSchemaBlock, /状态:\s*z\.enum/);
  assert.doesNotMatch(commandSchemaBlock, /内容:\s*z\.string/);
  assert.doesNotMatch(commandSchemaBlock, /预计失效|失效条件|最近判定|开始:/);
  assert.doesNotMatch(commandSchemaBlock, /\.preprocess\(/);
  assert.doesNotMatch(commandSchemaBlock, /z\.coerce\.number\(\)/);
  assert.doesNotMatch(commandSchemaBlock, /\.transform\(/);
  assert.match(schemaScriptSource, /registerMvuSchema\(Schema\)/);
  assert.match(initvarSource, /伊甸一次性指令:\s*$/m);
  assert.match(initvarSource, /rz001:\s*[\r\n]+\s*名称:\s*朋友妻不客气/);
  assert.match(initvarSource, /sk001:\s*[\r\n]+\s*名称:\s*一二三木头人/);
  assert.match(initvarSource, /zd001:\s*[\r\n]+\s*名称:\s*一夫当关/);
  assert.match(initvarSource, /sx001:\s*[\r\n]+\s*名称:\s*满血复活/);
  assert.match(initvarSource, /数量:\s*1/);
  assert.match(initvarSource, /说明:\s*移除伴侣性道德感/);
  assert.match(initvarSource, /范围:\s*指定一位男性角色/);
  assert.match(initvarSource, /时效:\s*12小时/);
  assert.match(initvarSource, /rz001:\s*[\s\S]*?生效实例:\s*\[\]/);
  assert.match(initvarSource, /sk001:\s*[\s\S]*?生效实例:\s*\[\]/);
  assert.match(initvarSource, /zd004:\s*[\s\S]*?生效实例:\s*\[\]/);
  assert.match(initvarSource, /sx002:\s*[\s\S]*?生效实例:\s*\[\]/);
});

test('mvu update rules and output format document 名称+数量 writes for 顶层 伊甸一次性指令', () => {
  const rulesSource = read('../../../../世界书/变量/[mvu_update]变量更新规则.yaml');
  const outputSource = read('../../../../世界书/变量/[mvu_update]变量输出格式.yaml');
  const taskSource = read('../../../../世界书/寒冬末日/伊甸一次性指令和主线任务.txt');
  const worldbookIndexSource = read('../../../../世界书/index.yaml');

  assert.match(rulesSource, /^  伊甸一次性指令:\s*$/m);
  assert.match(rulesSource, /\[编号:\s*string\]/);
  assert.match(rulesSource, /名称:\s*string/);
  assert.match(rulesSource, /数量:\s*number/);
  assert.match(rulesSource, /说明:\s*string/);
  assert.match(rulesSource, /范围:\s*string/);
  assert.match(rulesSource, /时效:\s*string/);
  assert.match(rulesSource, /生效实例:\s*\{\s*对象范围:\s*string;\s*剩余时效:\s*string;\s*\}\[\]/);
  assert.match(rulesSource, /编号 为动态 key/);
  assert.match(rulesSource, /更新 `\/伊甸一次性指令\/\$\{编号\}\/数量`/);
  assert.match(rulesSource, /只维护 `数量` 和 `生效实例`/);
  assert.match(rulesSource, /禁止.*实例 key/);
  assert.match(rulesSource, /禁止.*名称 \/ 说明 \/ 范围 \/ 时效/);
  assert.match(rulesSource, /replace.*\/伊甸一次性指令\/\$\{编号\}\/生效实例/);
  assert.match(rulesSource, /replace.*\/伊甸一次性指令\/\$\{编号\}\/生效实例\/\$\{实例序号\}\/剩余时效/);
  assert.match(rulesSource, /尚在起作用/);
  assert.doesNotMatch(rulesSource, /指令还在作用时：只更新 `剩余时效`；同样 replace 整个 `生效实例` 数组/);
  assert.match(rulesSource, /\| 名称 \| 类别 \| 编号 \| 说明 \| 范围 \| 时效 \|/);
  assert.match(rulesSource, /\| 朋友妻不客气 \| 认知修改类 \| rz001 \|/);
  assert.match(outputSource, /"path":\s*"\/伊甸一次性指令\/rz001",\s*"value":\s*\{\s*"名称":/);
  assert.match(outputSource, /"说明":\s*"[^"]+"/);
  assert.match(outputSource, /"范围":\s*"[^"]+"/);
  assert.match(outputSource, /"时效":\s*"[^"]+"/);
  assert.match(outputSource, /"path":\s*"\/伊甸一次性指令\/sk001\/数量"/);
  assert.match(outputSource, /"path":\s*"\/伊甸一次性指令\/sk001\/生效实例"/);
  assert.match(outputSource, /"对象范围":\s*"核心区\/客厅"/);
  assert.match(outputSource, /"剩余时效":\s*"约6小时"/);
  assert.doesNotMatch(outputSource, /\/生效实例\/sk001_/);
  assert.match(taskSource, /编号rz001-名称：/);
  assert.match(taskSource, /编号sk001-名称：/);
  assert.match(taskSource, /编号zd001-名称：/);
  assert.match(taskSource, /编号sx001-名称：/);
  assert.match(
    worldbookIndexSource,
    /名称: 伊甸一次性指令和主线任务[\s\S]*?激活策略:\s*[\r\n]+\s*类型: 蓝灯[\s\S]*?顺序: 8[\s\S]*?文件: 寒冬末日\\伊甸一次性指令和主线任务/,
  );
  assert.doesNotMatch(worldbookIndexSource, /名称: 主线任务-星穹秩序|文件: 寒冬末日\\主线任务-星穹秩序/);
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
  assert.match(panelSource, /commandCategoryLabel\(entry\.category\)/);
  assert.match(panelSource, /systemCommandCardClass\(entry\)/);
  assert.match(panelSource, /class="system-command-topline"/);
  assert.match(panelSource, /class="system-command-titleline"/);
  assert.match(panelSource, /class="system-command-description"/);
  assert.match(panelSource, /class="system-command-meta-chip"/);
  assert.doesNotMatch(panelSource, /class="system-command-copy"/);
  assert.match(workbenchSource, /useMvuSystemStore/);
  assert.match(workbenchSource, /buildEdenActiveDirectiveEntries/);
  assert.match(workbenchSource, /_\.get\(systemMvuData\.value, '伊甸一次性指令', \{\}\)/);
  assert.match(workbenchSource, /v-for="entry in edenCommandEntries"/);
  assert.match(workbenchSource, /commandCardClass\(entry\)/);
  assert.match(workbenchSource, /commandCategoryLabel\(entry\.category\)/);
  assert.match(workbenchSource, /class="command-card-topline"/);
  assert.match(workbenchSource, /class="command-card-titleline"/);
  assert.match(workbenchSource, /class="command-card-description"/);
  assert.match(workbenchSource, /class="command-extra-chip"/);
  assert.doesNotMatch(workbenchSource, /<small>名称<\/small>/);
  assert.doesNotMatch(workbenchSource, /<span>说明<\/span>/);
  assert.match(commandsSource, /const record = value as Record<string, unknown>;/);
  assert.match(commandsSource, /name:\s*String\(record\.名称 \?\? ''\)\.trim\(\) \|\| meta\?\.name \|\| normalizedKey/);
  assert.match(commandsSource, /quantity:\s*normalizeQuantity\(record\.数量\)/);
  assert.match(
    commandsSource,
    /description:\s*String\(record\.说明 \?\? ''\)\.trim\(\) \|\| meta\?\.description \|\| ''/,
  );
  assert.match(commandsSource, /scope:\s*String\(record\.范围 \?\? ''\)\.trim\(\) \|\| meta\?\.scope \|\| ''/);
  assert.match(commandsSource, /duration:\s*String\(record\.时效 \?\? ''\)\.trim\(\) \|\| meta\?\.duration \|\| ''/);
  assert.match(commandsSource, /category:\s*meta\?\.category \|\| '未分类'/);
  assert.match(storeSource, /const RESERVED_TOP_LEVEL_KEYS = new Set\(\[/);
  assert.match(storeSource, /'伊甸一次性指令'/);
});

test('workbench renders a tab-independent active directive strip from lightweight active instances', () => {
  const commandsSource = read('../edenOneShotCommands.ts');
  const workbenchSource = read('../components/WorkbenchTabs.vue');

  assert.match(commandsSource, /export type EdenActiveDirectiveEntry/);
  assert.match(commandsSource, /targetScope:\s*string/);
  assert.match(commandsSource, /remaining:\s*string/);
  assert.match(commandsSource, /quantity:\s*number/);
  assert.match(commandsSource, /fixedDuration:\s*string/);
  assert.match(commandsSource, /description:\s*string/);
  assert.match(commandsSource, /export function buildEdenActiveDirectiveEntries\(raw: unknown\)/);
  assert.match(commandsSource, /Array\.isArray\(record\.生效实例\)/);
  assert.match(commandsSource, /对象范围/);
  assert.match(commandsSource, /剩余时效/);
  assert.doesNotMatch(commandsSource, /instanceKey/);
  assert.doesNotMatch(commandsSource, /状态|内容|预计失效|失效条件|最近判定/);

  assert.match(
    workbenchSource,
    /<section class="active-directive-strip[\s\S]*?<div class="system-tabs"/,
    'active directive strip should render before tab buttons and stay independent of activeTab',
  );
  assert.match(workbenchSource, /activeDirectiveEntries/);
  assert.match(workbenchSource, /primaryActiveDirective/);
  assert.match(workbenchSource, /primaryActiveDirective\.targetScope/);
  assert.match(workbenchSource, /primaryActiveDirective\.remaining/);
  assert.match(workbenchSource, /primaryActiveDirective\.description/);
  assert.match(workbenchSource, /primaryActiveDirective\.fixedDuration/);
  assert.match(workbenchSource, /当前无生效中的一次性指令/);
  assert.doesNotMatch(workbenchSource, /primaryActiveDirective\.content|primaryActiveDirective\.status/);
});

test('workbench logs tab owns system summary and command tab keeps themed category cards', () => {
  const workbenchSource = read('../components/WorkbenchTabs.vue');
  const storyPageSource = read('../pages/StoryPage.vue');

  assert.doesNotMatch(workbenchSource, /<section class="workbench-summary-strip">[\s\S]*?<div class="system-tabs"/);
  assert.match(
    workbenchSource,
    /<section v-else class="workbench-panel logs-panel">[\s\S]*<section class="workbench-summary-strip">/,
  );
  assert.doesNotMatch(storyPageSource, /const activeUtilityPills = computed\(\(\) => \{[\s\S]*?日志[\s\S]*?楼层/);
  assert.match(workbenchSource, /class="command-category-badge"/);
  assert.match(workbenchSource, /class="command-quantity-pill"/);
  assert.match(workbenchSource, /\.command-card-topline/);
  assert.match(workbenchSource, /\.command-card-titleline/);
  assert.match(workbenchSource, /\.command-card-description/);
  assert.match(workbenchSource, /\.command-extra-chip/);
  assert.match(workbenchSource, /\.command-card\.is-zero/);
  assert.match(workbenchSource, /--cmd-category-color/);
  assert.match(workbenchSource, /color-mix\(in srgb, var\(--cmd-category-color\)/);
});

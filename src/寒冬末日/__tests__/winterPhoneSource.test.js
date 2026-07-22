/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const entrypoints = [
  {
    path: 'src/小手机平台/脚本/10平台服务/index.ts',
    id: 'platform.services',
    dependsOn: [],
    capabilities: ['host.gateway', 'settings.store'],
  },
  {
    path: 'src/小手机平台/脚本/20数据与同步/index.ts',
    id: 'data.sync',
    dependsOn: ['platform.services'],
    capabilities: ['phone.db', 'chat-lore.sync'],
  },
  {
    path: 'src/小手机平台/脚本/30AI与调度/index.ts',
    id: 'ai.scheduler',
    dependsOn: ['platform.services', 'data.sync'],
    capabilities: ['prompt.assembler', 'ai.providers', 'phone.scheduler'],
  },
  {
    path: 'src/小手机平台/脚本/40手机外壳/index.ts',
    id: 'phone.shell',
    dependsOn: ['platform.services'],
    capabilities: ['phone.shell'],
  },
  {
    path: 'src/小手机平台/脚本/50通信与情报APP/index.ts',
    id: 'communication.apps',
    dependsOn: ['data.sync', 'ai.scheduler', 'phone.shell'],
    capabilities: ['communication.apps'],
  },
];

const winterAdapterPath = 'src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts';

test('runtime entry installs once at script-ready time without disposing the shared runtime', () => {
  const source = readFileSync('src/小手机平台/脚本/00运行时管理器/index.ts', 'utf8');

  assert.match(source, /\$\(\(\)\s*=>\s*\{?[\s\S]*installPhoneRuntime\(\)/);
  assert.doesNotMatch(source, /\.dispose\(|initializeModules|document\.|indexedDB|setTimeout|setInterval/);
});

for (const entrypoint of entrypoints) {
  test(`${entrypoint.id} is a declarative module entrypoint`, () => {
    const source = readFileSync(entrypoint.path, 'utf8');

    assert.match(source, /registerPhoneModule\s*\(\s*\{/);
    assert.match(source, new RegExp(`id:\\s*['"]${escapeRegExp(entrypoint.id)}['"]`));
    assert.match(source, /version:\s*['"]1\.0\.0['"]/);
    assert.match(source, /required:\s*true/);
    assertArrayLiteral(source, 'dependsOn', entrypoint.dependsOn);
    assertArrayLiteral(source, 'capabilities', entrypoint.capabilities);
    assert.match(source, /createServiceModule/);
    assert.doesNotMatch(
      source,
      /document\.|createElement|appendChild|indexedDB|setTimeout|setInterval|initializeModules|\.start\s*\(|createPhoneShell\s*\(/,
    );
  });
}

test('data entry publishes persistent IndexedDB with an explicit memory fallback constructor', () => {
  const source = readFileSync('src/小手机平台/脚本/20数据与同步/index.ts', 'utf8');

  assert.match(source, /createIndexedDbPhoneDb/);
  assert.match(source, /createMemoryPhoneDb/);
  assert.match(source, /['"]phone\.db['"]:\s*Object\.freeze\(\{[^}]*createIndexedDbPhoneDb[^}]*createMemoryPhoneDb/s);
});

test('webpack filters discovered scripts before entry parsing and can omit generator plugins', () => {
  const source = readFileSync('webpack.config.ts', 'utf8');
  const prefixes = source.indexOf('TAVERN_BUILD_PREFIXES');
  const selection = source.indexOf('selectBuildFiles(');
  const config = source.indexOf('const config: Config');

  assert.ok(prefixes >= 0, 'webpack must read TAVERN_BUILD_PREFIXES');
  assert.ok(selection > prefixes, 'webpack must apply the explicit build scope');
  assert.ok(config > selection, 'entry filtering must happen before config.entries is created');
  assert.match(source, /from ['"]\.\/webpack\.buildScope\.cjs['"]/, 'config helper must use a resolvable extension');
  assert.match(source, /TAVERN_SKIP_GENERATORS\s*===\s*['"]1['"]/);
  assert.match(
    source,
    /skipGenerators\s*\?\s*\[\]\s*:\s*\[\s*\{\s*apply:\s*schema_dump\s*\},\s*\{\s*apply:\s*tavern_sync\s*\}\s*\]/s,
  );
});

test('build scope matches path boundaries and rejects explicitly empty scopes', () => {
  const { selectBuildFiles } = require('../../../webpack.buildScope.cjs');
  const files = ['src/foo/index.ts', 'src/foo/nested/index.ts', 'src/foobar/index.ts', 'src\\foo\\win\\index.ts'];

  assert.deepEqual(selectBuildFiles(files, undefined), files, '未设置变量时保持全量行为');
  assert.deepEqual(selectBuildFiles(files, ' src/foo/ '), [
    'src/foo/index.ts',
    'src/foo/nested/index.ts',
    'src\\foo\\win\\index.ts',
  ]);
  assert.deepEqual(selectBuildFiles(['src/foo', 'src/foobar'], 'src\\foo'), ['src/foo']);
  assert.throws(() => selectBuildFiles(files, ' ;  ; '), /TAVERN_BUILD_PREFIXES.*valid|effective|empty/i);
});

test('internal service publication does not collide with Vue auto-import names', () => {
  const types = readFileSync('src/小手机平台/core/types.ts', 'utf8');
  const registry = readFileSync('src/小手机平台/core/serviceRegistry.ts', 'utf8');
  const serviceModule = readFileSync('src/小手机平台/core/serviceModule.ts', 'utf8');

  assert.match(types, /publish\(ownerId:/);
  assert.match(registry, /publish\(ownerId:/);
  assert.match(serviceModule, /context\.services\.publish\(/);
  assert.doesNotMatch(registry, /\bprovide\s*\(/);
});

test('winter keeps global network facts but removes redundant per-role communication fields', () => {
  const schema = readFileSync('src/寒冬末日/schema.ts', 'utf8');
  const init = readFileSync('src/寒冬末日/世界书/寒冬末日/[initvar].yaml', 'utf8');
  const rules = readFileSync('src/寒冬末日/世界书/变量/[mvu_update]变量更新规则.yaml', 'utf8');
  const output = readFileSync('src/寒冬末日/世界书/变量/[mvu_update]变量输出格式.yaml', 'utf8');
  const variables = readFileSync('src/寒冬末日/世界书/变量/变量列表.txt', 'utf8');
  const temporaryNpc = readFileSync('src/寒冬末日/世界书/变量/临时NPC变量结构示意.txt', 'utf8');

  assert.match(schema, /公共通信网/);
  assert.doesNotMatch(schema, /通讯Schema|终端类型|已建立联系/);
  assert.match(init, /^通讯网络:/m);
  assert.doesNotMatch(init, /^\s{2}通讯:/m);
  assert.doesNotMatch(rules, /\/纪宁\/通讯\/|完整通讯对象|首版手机只读MVU/);
  assert.match(output, /\/通讯网络\//);
  assert.doesNotMatch(output, /\/纪宁\/通讯\/|完整通讯对象|伊甸终端T2/);
  assert.match(variables, /通讯网络/);
  assert.match(variables, /format_message_variable::stat_data/);
  assert.doesNotMatch(temporaryNpc, /通讯:|已建立联系|伊甸终端T2/);
});

test('winter adapter declares the exact owner, MVU snapshot identity, abilities, and profile entry contract', () => {
  const source = readFileSync(winterAdapterPath, 'utf8');
  const core = readFileSync('src/寒冬末日/脚本/小手机-90寒冬适配器/winterAdapterCore.ts', 'utf8');
  const combined = `${source}\n${core}`;

  assert.match(source, /registerPhoneModule\s*\(\s*\{/);
  assert.match(source, /id:\s*['"]winter\.adapter['"]/);
  assert.match(source, /dependsOn:\s*\[['"]communication\.apps['"]\]/);
  assert.match(combined, /末世寒冬 - 星穹秩序/);
  assert.doesNotMatch(combined, /EDEN_TERMINAL_T2_ABILITY|EDEN_TERMINAL_T4_ABILITY|canAssignEdenTerminal/);
  assert.match(combined, /assistantMessageId/);
  assert.match(combined, /mvuSignature/);
  assert.match(combined, /角色档案 - /);
  assert.match(source, /PhoneAppServices/);
  assert.match(source, /createIndexedDbPhoneDb\s*\(/);
  assert.match(source, /createPhoneApps\s*\(/);
  assert.match(source, /createPhoneShell\s*\(/);
  assert.match(source, /createPhoneShell\s*\(\s*\{[\s\S]*?onRequestClose:\s*\(\)\s*=>\s*context\?\.runtime\.close\(\)/);
  assert.match(source, /new\s+ChatLoreSync\s*\(/);
  assert.match(source, /new\s+TavernProvider\s*\(/);
  assert.match(source, /new\s+ControlledPhoneScheduler\s*\(/);
  assert.match(source, /getCharWorldbookNames\s*\(\s*['"]current['"]\s*\)/);
  assert.match(source, /eventOn\s*\(/);
  assert.match(source, /generationActive/);
  assert.match(source, /Mvu\.events\.VARIABLE_UPDATE_STARTED/);
  assert.match(source, /Mvu\.events\.VARIABLE_INITIALIZED/);
  assert.match(source, /VARIABLE_INITIALIZED[\s\S]*?refreshUnlessGenerating/);
  assert.match(source, /context\?\.runtime\.getHostStoryMessageId\(\)/);
  assert.match(source, /runtime\.on\(\s*['"]hostStory['"][\s\S]*?refreshUnlessGenerating/);
  assert.match(
    source,
    /runtime\.on\(\s*['"]hostStory['"],\s*storyMessageId\s*=>[\s\S]*?storyMessageId\s*===\s*null[\s\S]*?scheduleSnapshotRefresh\(\)/,
    'Pre bridge 暂时卸载时不得清空已成功的稳定快照，重新绑定后应合并刷新',
  );
  assert.match(
    source,
    /function scheduleSnapshotRefresh[\s\S]*?clearTimeout[\s\S]*?setTimeout[\s\S]*?refreshUnlessGenerating/,
    '酒馆与 MVU 的连续事件必须合并后再读取 latest，避免在事件栈中反复处理整份 stat_data',
  );
  assert.match(
    source,
    /async function deactivate[\s\S]*?clearScheduledSnapshotRefresh\(\)/,
    '适配器停用时必须清理待执行的快照刷新',
  );
  assert.match(source, /pre\.story-floor:/);
  const refreshLatestSnapshotBlock = source.slice(
    source.indexOf('async function refreshLatestSnapshot'),
    source.indexOf('async function refreshSnapshot'),
  );
  assert.doesNotMatch(refreshLatestSnapshotBlock, /getChatMessages\(\s*['"]0-\{\{lastMessageId\}\}['"]/);
  assert.match(source, /getVariables\(\{\s*type:\s*['"]message['"],\s*message_id:\s*['"]latest['"]\s*\}\)/);
  assert.doesNotMatch(source, /Mvu\.getMvuData/);
  assert.match(source, /await refreshInitialSnapshot\(\)/);
  assert.match(
    source,
    /async function refreshInitialSnapshot[\s\S]*?while\s*\(snapshot\s*===\s*null[\s\S]*?refreshLatestSnapshot\(\)[\s\S]*?setTimeout/,
  );
  assert.match(
    source,
    /当前 chat「\$\{session\.chatId\}」的 latest 消息变量无 stat_data/,
  );
  const waitForMvu = source.indexOf("await waitGlobalInitialized('Mvu')");
  const createHostGateway = source.indexOf('createTopHostGateway', source.indexOf('async function init'));
  assert.ok(waitForMvu >= 0 && waitForMvu < createHostGateway, 'adapter init must wait for Mvu before host activation');
  assert.match(source, /advanceSnapshotCompletionGate\s*\(/);
  const refreshSnapshotBlock = source.slice(
    source.indexOf('async function refreshSnapshot'),
    source.indexOf('async function enqueueSnapshotJobs'),
  );
  assert.doesNotMatch(
    refreshSnapshotBlock,
    /invalidateSnapshot\(\)/,
    '瞬时读取失败不得清空上一份稳定快照',
  );
  assert.match(refreshSnapshotBlock, /snapshot\?\.key\s*===\s*nextKey/);
  assert.ok(
    refreshSnapshotBlock.indexOf('snapshot = next') < refreshSnapshotBlock.indexOf('await synchronizeSnapshotEffects'),
    'readable MVU must publish the stable snapshot before optional persistence/scheduler effects',
  );
  assert.match(source, /function synchronizeSnapshotEffects[\s\S]*?稳定快照附属同步失败/);
  assert.match(source, /\+\+hostEpoch/);
  assert.match(source, /assertHostCapture\s*\(/);
  assert.match(source, /runPendingDispatchPreparation\s*\(/);
  assert.match(source, /EDEN_GROUP_CONVERSATION_ID/);
  assert.match(source, /listRecords\(\s*['"]contactPrefs['"],\s*sessionKey\s*\)/);
  assert.match(source, /putRecord\(\s*['"]contactPrefs['"]/);
  assert.match(source, /kind:\s*['"]manual-contact['"]/);
  assert.match(source, /async function addContact/);
  assert.match(source, /async function setContactGroupMembership/);
  assert.doesNotMatch(source, /deriveContactAvailability|deriveEdenGroupMemberIds|伊甸终端T2/);
  assert.match(source, /lastPublishedSnapshots\s*=\s*new Map/);
  assert.match(source, /lastPublishedSnapshots\.get\(next\.sessionKey\)/);
  assert.match(source, /lastPublishedSnapshots\.set\(next\.sessionKey,\s*next\)/);
  assert.match(source, /planTemporaryNpcPromotion\s*\(/);
  const invalidationBlock = source.slice(
    source.indexOf('function invalidateSnapshot'),
    source.indexOf('async function refreshLatestSnapshot'),
  );
  assert.doesNotMatch(invalidationBlock, /lastPublishedSnapshots\.(?:clear|delete)/);
  const generationStartedBlock = source.slice(
    source.indexOf('listen(tavern_events.GENERATION_STARTED'),
    source.indexOf('listen(tavern_events.GENERATION_ENDED'),
  );
  assert.doesNotMatch(generationStartedBlock, /invalidateSnapshot\(\)/);
  const mvuStartedBlock = source.slice(
    source.indexOf('listen(Mvu.events.VARIABLE_UPDATE_STARTED'),
    source.indexOf('listen(Mvu.events.VARIABLE_UPDATE_ENDED'),
  );
  assert.doesNotMatch(mvuStartedBlock, /invalidateSnapshot\(\)/);
  assert.match(source, /migrateIdentities\s*\(/);
  assert.match(source, /buildWinterSchedulerJobs\s*\(/);
  assert.match(source, /submitWinterSchedulerJobs\s*\(\s*scheduler,\s*jobs\s*\)/);
  assert.match(core, /scheduler\.enqueue\s*\(/);
  assert.match(core, /scheduler\.runAvailable\s*\(/);
  assert.match(source, /dispatchAi:\s*job\s*=>/);
  assert.match(source, /deliverDeterministic:\s*job\s*=>/);
  assert.doesNotMatch(source, /dispatchAi:\s*\(\)\s*=>\s*undefined|deliverDeterministic:\s*\(\)\s*=>\s*undefined/);
  assert.match(source, /retryPendingLore/);
  assert.match(source, /loreRetryRequests/);
  assert.match(source, /parameters:\s*publicSettings\.parameters/);
  assert.match(source, /function\s+assertSnapshotCapture\s*\(/);
  const sendMessageBlock = source.slice(
    source.indexOf('async function sendMessage'),
    source.indexOf('async function retryMessage'),
  );
  assert.match(sendMessageBlock, /assertSnapshotCapture\s*\([\s\S]*assertConversationCanSend\s*\(/);
  assert.match(sendMessageBlock, /markPending:\s*\(\)\s*=>\s*database\.addMessageWithInbox\s*\(/);
  assert.doesNotMatch(sendMessageBlock, /await database\.addMessage\s*\(/);
  assert.doesNotMatch(
    sendMessageBlock,
    /await database\.addMessage\s*\([\s\S]*assertCapturedSession\s*\([\s\S]*await runPendingDispatchPreparation/,
  );
  const retryMessageBlock = source.slice(
    source.indexOf('async function retryMessage'),
    source.indexOf('async function cancelMessage'),
  );
  assert.match(retryMessageBlock, /assertSnapshotCapture\s*\([\s\S]*assertConversationCanSend\s*\(/);
  const scheduledAiBlock = source.slice(
    source.indexOf('async function dispatchScheduledAi'),
    source.indexOf('function scheduledPayload'),
  );
  assert.match(scheduledAiBlock, /conversationId:\s*job\.conversationId/);
  assert.match(scheduledAiBlock, /type:\s*['"]group['"]/);
  assert.match(scheduledAiBlock, /type:\s*['"]group['"],[\s\S]*conversationId:\s*job\.conversationId/);
  assert.doesNotMatch(scheduledAiBlock, /conversationId:\s*['"]broadcast:eden['"]/);
  assert.match(source, /launchAiRequest[\s\S]*assertHostCapture\s*\(/);
  assert.match(source, /enqueueSnapshotJobs[\s\S]*assertHostCapture\s*\(/);
  assert.match(source, /runtime\.on\(\s*['"]status['"]/);
  assert.match(source, /stopRuntimeStatus/);
  assert.doesNotMatch(source, /tavernPhoneLauncher|createLauncher|launcher\?\.remove/);
  assert.doesNotMatch(source, /switchSession[\s\S]{0,500}cancelAllRequests\s*\(/);
  assert.match(source, /activeChatWorldbookName/);
  assert.match(source, /assertCapturedSession\s*\(/);
  assert.match(source, /chatLore:\s*chatLore/);
  assert.match(source, /finally\s*\{[\s\S]*deactivate\s*\(/);
  assert.doesNotMatch(combined, /same-layer-pre|sameLayerPre|useSameLayerPre/);
});

test('Eden Terminal is a level-one default shelter ability without T2 or T4 phone gating', () => {
  const abilities = readFileSync('src/寒冬末日/世界书/寒冬末日/庇护所升级能力.txt', 'utf8');
  const levelOne = abilities.slice(abilities.indexOf('  "1":'), abilities.indexOf('  "2":'));

  assert.match(levelOne, /social\.eden_terminal_t1/);
  assert.match(abilities, /social\.eden_terminal_t1:[\s\S]*?name:\s*["']📱伊甸终端["'][\s\S]*?unlock_level:\s*1/);
  assert.doesNotMatch(abilities, /📱伊甸手机终端T2|social\.eden_phone_mass_t4/);
});

test('schema dump has a strict, path-boundary-aware winter scope', () => {
  const dumpSource = readFileSync('dump_schema.ts', 'utf8');

  assert.match(dumpSource, /TAVERN_SCHEMA_PREFIXES/);
  assert.match(dumpSource, /replaceAll\(['"]\\\\['"],\s*['"]\/['"]\)/);
  assert.match(dumpSource, /prefix\s*\+\s*['"]\/['"]/);
  assert.match(dumpSource, /throw new Error\([^)]*TAVERN_SCHEMA_PREFIXES/s);
  assert.match(dumpSource, /for\s*\(const schema_file of/);
});

function assertArrayLiteral(source, key, values) {
  const literal = values.map(value => `'${value}'`).join(', ');
  assert.match(source, new RegExp(`${key}:\\s*\\[${escapeRegExp(literal)}\\]`));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

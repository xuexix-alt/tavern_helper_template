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

test('winter communication facts are declared across schema, init data, and update rules', () => {
  const schema = readFileSync('src/寒冬末日/schema.ts', 'utf8');
  const init = readFileSync('src/寒冬末日/世界书/寒冬末日/[initvar].yaml', 'utf8');
  const rules = readFileSync('src/寒冬末日/世界书/变量/[mvu_update]变量更新规则.yaml', 'utf8');
  const output = readFileSync('src/寒冬末日/世界书/变量/[mvu_update]变量输出格式.yaml', 'utf8');
  const variables = readFileSync('src/寒冬末日/世界书/变量/变量列表.txt', 'utf8');
  const temporaryNpc = readFileSync('src/寒冬末日/世界书/变量/临时NPC变量结构示意.txt', 'utf8');

  assert.match(schema, /终端类型/);
  assert.match(schema, /公共通信网/);
  assert.match(init, /^通讯网络:/m);
  assert.match(rules, /social\.shift_ration_protocol_t2/);
  assert.match(rules, /最多5台/);
  assert.match(rules, /social\.eden_phone_mass_t4/);
  assert.match(rules, /首版手机只读MVU/);
  assert.match(output, /\/通讯网络\//);
  assert.match(output, /\/纪宁\/通讯\//);
  assert.match(output, /旧存档[\s\S]*insert[\s\S]*完整通讯对象/);
  assert.match(variables, /通讯网络/);
  assert.match(variables, /format_message_variable::stat_data/);
  assert.match(temporaryNpc, /已建立联系/);
  assert.match(temporaryNpc, /伊甸终端T2/);
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

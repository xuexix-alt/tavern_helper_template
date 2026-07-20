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
  const selection = source.indexOf('buildPrefixes.length');
  const config = source.indexOf('const config: Config');

  assert.ok(prefixes >= 0, 'webpack must read TAVERN_BUILD_PREFIXES');
  assert.ok(selection > prefixes, 'webpack must select normalized prefixes');
  assert.ok(config > selection, 'entry filtering must happen before config.entries is created');
  assert.match(source, /split\(['"];['"]\)/);
  assert.match(source, /trim\(\)\.replaceAll\(['"]\\\\['"],\s*['"]\/['"]\)/);
  assert.match(source, /TAVERN_SKIP_GENERATORS\s*===\s*['"]1['"]/);
  assert.match(
    source,
    /skipGenerators\s*\?\s*\[\]\s*:\s*\[\s*\{\s*apply:\s*schema_dump\s*\},\s*\{\s*apply:\s*tavern_sync\s*\}\s*\]/s,
  );
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

function assertArrayLiteral(source, key, values) {
  const literal = values.map(value => `'${value}'`).join(', ');
  assert.match(source, new RegExp(`${key}:\\s*\\[${escapeRegExp(literal)}\\]`));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

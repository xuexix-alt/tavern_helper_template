/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const runtimeManagerPath = 'src/小手机平台/脚本/00运行时管理器/index.ts';
const mainAdapterPath = 'src/小手机平台/脚本/90主适配器/index.ts';
const winterAdapterPath = 'src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts';

function readSource(path) {
  return fs.readFileSync(path, 'utf8');
}

test('runtime manager leaves module initialization to PhoneRuntime', () => {
  const source = readSource(runtimeManagerPath);

  assert.match(source, /installPhoneRuntime\(\)/);
  assert.doesNotMatch(source, /setTimeout|setInterval|initializeModules/);
  assert.doesNotMatch(source, /runtime\.registry|runtime\.services/);
  assert.doesNotMatch(source, /initializedOrder|registration\.factory/);
});

test('winter adapter is the only top-level phone adapter and shell owner', () => {
  const mainSource = readSource(mainAdapterPath);
  const winterSource = readSource(winterAdapterPath);

  assert.doesNotMatch(mainSource, /capabilities:\s*\[[^\]]*phone\.adapter/);
  assert.doesNotMatch(mainSource, /createPhoneShell\s*\(/);
  assert.match(winterSource, /id:\s*['"]winter\.adapter['"]/);
  assert.match(winterSource, /capabilities:\s*\[['"]phone\.adapter['"]\]/);
  assert.match(winterSource, /createPhoneShell\s*\(/);
});

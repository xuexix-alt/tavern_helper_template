import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as z from 'zod';
import * as versions from 'compare-versions';

const source = await readFile(new URL('../src/寒冬末日/脚本/自动更新角色卡/index.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const phone = {
  type: 'script',
  id: 'd9d2a605-64f7-4b3e-8d79-310b6bf87051',
  enabled: true,
  content:
    "import 'https://cdn.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/小手机平台/一体化/index.js'",
};
async function run({ current = '1.1.3', imported = '2.0.0', status = 200, scripts = [phone], force = true } = {}) {
  let settings = { check_on_load: false };
  let imports = 0;
  const notices = [],
    urls = [];
  const context = vm.createContext({
    exports: {},
    require: name => (name === 'zod' ? z : versions),
    window: {},
    console,
    URL,
    getScriptId: () => 'test',
    getVariables: () => settings,
    replaceVariables: value => {
      settings = value;
    },
    fetch: async url => {
      urls.push(url);
      return { ok: true, text: async () => '', blob: async () => ({ size: 100 }) };
    },
    YAML: { parse: () => ({ 版本: '2.0.0' }) },
    _: { get: (obj, key, fallback) => obj[key] ?? fallback },
    getCharacter: async () => ({ version: imports ? imported : current, extensions: { tavern_helper: { scripts } } }),
    importRawCharacter: async () => {
      imports++;
      return { ok: status === 200, status };
    },
    toastr: Object.fromEntries(
      ['success', 'info', 'warning'].map(level => [level, message => notices.push({ level, message })]),
    ),
    $: () => {},
  });
  vm.runInContext(code, context);
  await vm.runInContext(`runUpdateFlow({force_apply:${force},from_button:true})`, context);
  return { settings, imports, notices, urls };
}
for (const scenario of [
  { status: 500 },
  { imported: '1.1.3' },
  { scripts: [] },
  { scripts: [{ ...phone, enabled: false }] },
  { scripts: [{ type: 'folder', enabled: false, scripts: [phone] }] },
]) {
  const result = await run(scenario);
  assert.equal(
    result.notices.some(item => item.level === 'success'),
    false,
    JSON.stringify(scenario),
  );
  assert.equal(result.settings.last_applied_remote_version, '');
  assert.ok(result.settings.last_error);
}
const repaired = await run({ current: '2.0.0' });
assert.equal(repaired.imports, 1, '手动执行应允许同版本重装');
assert.equal(repaired.settings.last_applied_remote_version, '2.0.0');
assert.ok(repaired.notices.some(item => item.level === 'success' && item.message.includes('刷新')));
assert.equal(new URL(repaired.urls[1]).searchParams.get('version'), '2.0.0');
assert.equal((await run({ current: '2.0.0', force: false })).imports, 0);
assert.equal((await run({ current: '2.1.0' })).imports, 0, '手动修复不能降级');
assert.equal(
  (await run({ scripts: [{ type: 'folder', enabled: true, scripts: [phone] }] })).settings.last_applied_remote_version,
  '2.0.0',
);
const incomplete = await run({ current: '2.0.0', force: false, scripts: [] });
assert.equal(incomplete.imports, 0);
assert.ok(incomplete.settings.last_error.includes('小手机'));
console.log('auto-update character regression tests passed');

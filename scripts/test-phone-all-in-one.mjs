import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { jsonrepair } from 'jsonrepair';
import lodash from 'lodash';
import * as z from 'zod';
import * as Vue from 'vue';

const directory = new URL('../dist/小手机平台/一体化/', import.meta.url);
const content = await readFile(new URL('index.js', directory), 'utf8');
const script = JSON.parse(await readFile(new URL('小手机一体化.json', directory), 'utf8'));
assert.equal(script.type, 'script');
assert.equal(script.content, content, '导入包必须内嵌当前构建结果');
assert.equal(script.enabled, true);
assert.deepEqual(
  (await readdir(directory)).filter(name => name.endsWith('.js')),
  ['index.js'],
);

const ready = [];
const microtasks = [];
const top = { location: { href: 'http://localhost:8000' }, setTimeout: () => 1, clearTimeout() {}, dispatchEvent() {} };
top.top = top;
top.parent = top;
const context = createContext({
  Vue,
  window: top,
  console,
  z,
  _: lodash,
  Event,
  crypto: globalThis.crypto,
  queueMicrotask: callback => microtasks.push(callback),
  $: value => {
    if (typeof value === 'function') ready.push(value);
    return { one() {} };
  },
});
const module = new SourceTextModule(content, { context });
await module.link(specifier => {
  assert.equal(specifier, 'https://cdn.jsdelivr.net/npm/jsonrepair/+esm', '只允许第三方依赖；组件不能分包加载');
  return new SyntheticModule(
    ['jsonrepair'],
    function () {
      this.setExport('jsonrepair', jsonrepair);
    },
    { context },
  );
});
await module.evaluate().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
assert.equal(ready.length, 10, '运行时及九个业务入口都应在 ready 时启动');
for (const callback of ready) callback();
assert.ok(top.TavernPhone, '应安装顶层运行时');
const modules = top.TavernPhone.getModules();
const expected = [
  'platform.services',
  'data.sync',
  'ai.scheduler',
  'phone.shell',
  'communication.apps',
  'intelligence.services',
  'wechat.adapter',
  'main.adapter',
  'winter.adapter',
];
assert.deepEqual(Array.from(modules, item => item.id).sort(), expected.sort());
const byId = new Map(modules.map(item => [item.id, item]));
const visiting = new Set();
const visited = new Set();
function visit(id) {
  assert.ok(byId.has(id), '依赖模块不存在：' + id);
  assert.equal(visiting.has(id), false, '不能存在循环依赖：' + id);
  if (visited.has(id)) return;
  visiting.add(id);
  byId.get(id).dependsOn.forEach(visit);
  visiting.delete(id);
  visited.add(id);
}
expected.forEach(visit);
assert.equal(modules.filter(item => item.capabilities.includes('phone.adapter')).length, 1);
assert.ok(microtasks.length > 0, '运行时应安排依赖初始化');
console.log('一体化产物验证通过：单脚本 JSON、10 个入口、9 个模块、唯一角色适配器及完整依赖图。');

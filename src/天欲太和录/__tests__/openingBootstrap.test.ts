import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

import { installTianyuOpeningPreset, parseTianyuOpeningPreset } from '../脚本/变量结构/openingBootstrap';

const rawPreset = parseYaml(readFileSync('src/天欲太和录/opening-preset.yaml', 'utf8'));
const preset = parseTianyuOpeningPreset(rawPreset);

assert.equal(preset.version, 2);
assert.equal(preset.preset_id, 'tianyu-taihe-v1');
assert.equal(preset.ui.title, '天欲太和录 · 江湖开局');
assert.deepEqual(
  preset.fields.map(field => field.label),
  ['初始身份', '阴阳道路', '开局位置', '初始目标', '剧情基调', '叙事文风', '开局字数'],
);
assert.match(preset.prompt.task, /残卷失窃/);
assert.ok(preset.prompt.forbidden.some(item => item.includes('替玩家决定')));

const original = {
  existing: { keep: true },
  same_layer_pre: { another_setting: 'preserve-me' },
};
let characterVariables: Record<string, any> = structuredClone(original);
const writes: Array<Record<string, unknown>> = [];
const dependencies = {
  getCharacterVariables: () => characterVariables,
  replaceCharacterVariables: (next: Record<string, unknown>) => {
    writes.push(structuredClone(next));
    characterVariables = next;
  },
};

assert.equal(installTianyuOpeningPreset(preset, dependencies), 'installed');
assert.equal(writes.length, 1);
assert.deepEqual(characterVariables.existing, original.existing);
assert.equal(characterVariables.same_layer_pre.another_setting, 'preserve-me');
assert.deepEqual(characterVariables.same_layer_pre.opening_preset, preset);
assert.equal(installTianyuOpeningPreset(preset, dependencies), 'unchanged');
assert.equal(writes.length, 1, 'an unchanged preset must not rewrite character variables');

const bootstrapSource = readFileSync('src/天欲太和录/脚本/变量结构/openingBootstrap.ts', 'utf8');
const entrySource = readFileSync('src/天欲太和录/脚本/变量结构/index.ts', 'utf8');
assert.doesNotMatch(bootstrapSource, /TIANYU_PROLOGUE|createChatMessages|ensureTianyuPrologue/);
assert.match(entrySource, /opening-preset\.yaml\?raw/);
assert.match(entrySource, /getVariables\(\{ type: 'character' \}\)/);
assert.match(entrySource, /replaceVariables\(variables, \{ type: 'character' \}\)/);
assert.doesNotMatch(entrySource, /createChatMessages|CHAT_CHANGED|waitGlobalInitialized\('Mvu'\)/);

console.log('天欲太和录 runtime opening preset bootstrap test passed');

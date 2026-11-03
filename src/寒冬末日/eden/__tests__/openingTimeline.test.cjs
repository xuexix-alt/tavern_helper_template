/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules -- Node test harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
const { defaultEdenOpeningStartDay, defaultEdenOpeningTime } = require('../openingConfig.ts');
// Compile the production pure timeline helper without importing browser/raw-loader dependencies.
const source = fs.readFileSync(path.resolve(__dirname, '../../界面同层版/shared/opening.ts'), 'utf8');
const helper = source.slice(
  source.indexOf('export function adaptEdenOpeningTimeline('),
  source.indexOf('export function buildOpeningGeneratePrompt('),
);
const compiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
new Function('exports', compiled)(exportsObject);
const { adaptEdenOpeningTimeline } = exportsObject;
const template = name => fs.readFileSync(path.resolve(__dirname, '../../../../docs', name), 'utf8');
test('canonical A/B/C defaults align with existing story dates', () => {
  assert.equal(defaultEdenOpeningStartDay('A'), -90);
  for (const mode of ['B', 'C']) {
    assert.equal(defaultEdenOpeningStartDay(mode), 372);
    assert.equal(defaultEdenOpeningTime(mode), '公元2027年12月21日·14:00');
  }
});
test('custom A start replaces fixed anchors while preserving creative requirements', () => {
  const result = adaptEdenOpeningTimeline(template('OpeningSetupPanel.generate提示词.灾变前3个月.txt'), -60);
  assert.doesNotMatch(result, /-90|9月14日|12月14日|三个月|3\s*个月/);
  assert.match(result, /末日天数 必须为 -60/);
  assert.match(result, /提前60天/);
  assert.match(result, /邻里群像/);
});
test('B start uses selected day and obtains Eden seven days earlier', () => {
  const result = adaptEdenOpeningTimeline(template('OpeningSetupPanel.generate提示词.txt'), 372);
  assert.doesNotMatch(result, /灾变的1年后/);
  assert.match(result, /灾后第365天/);
  assert.match(result, /末日天数 必须为 372/);
  assert.throws(() => adaptEdenOpeningTimeline('', Infinity));
});
test('legacy build only transforms timeline when options supplied', () => {
  assert.match(source, /if \(options\) templateRaw = adaptEdenOpeningTimeline\(templateRaw, options.edenStartDay\)/);
});

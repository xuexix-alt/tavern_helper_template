const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../../../../');

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

test('A-rank pre-disaster opening keeps September 14 anchored 90 days before the December 14 apocalypse', () => {
  const preset = read('src/寒冬末日/界面同层版/shared/opening-preset.default.json');
  const initvar = read('src/寒冬末日/世界书/寒冬末日/[initvar].yaml');
  const updateRules = read('src/寒冬末日/世界书/变量/[mvu_update]变量更新规则.yaml');
  const timeUtil = read('src/寒冬末日/util/time.ts');
  const schema = read('src/寒冬末日/schema.ts');
  const schemaJson = read('src/寒冬末日/schema.json');
  const bundledCard = read('src/寒冬末日.json');
  const preDisasterPrompt = read('docs/OpeningSetupPanel.generate提示词.灾变前3个月.txt');

  assert.match(preset, /"time": "公元2026年9月14日·14:00"/);
  assert.doesNotMatch(preset, /"time": "公元2026年6月14日·14:00"/);
  assert.match(initvar, /日期: 公元2026年9月14日/);
  assert.match(initvar, /末日天数: -90/);
  assert.match(schema, /末日天数: z\.coerce\.number\(\)\.prefault\(-90\)/);
  assert.match(schema, /末日天数: -90/);
  assert.match(schemaJson, /"末日天数": -90/);
  assert.match(bundledCard, /末日天数: -90/);
  assert.doesNotMatch(bundledCard, /"time": "公元2026年6月14日·14:00"/);
  assert.match(preDisasterPrompt, /9月14日/);
  assert.match(preDisasterPrompt, /12月14日/);
  assert.match(updateRules, /灾难前3个月为-90天/);
  assert.doesNotMatch(`${preset}\n${initvar}\n${updateRules}\n${timeUtil}`, /末日纪元/);
  assert.doesNotMatch(`${preset}\n${initvar}`, /952[67]年12月14日/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../../../../');

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

test('opening and init variables use common-era September dates instead of the old apocalypse-era December calendar', () => {
  const preset = read('src/寒冬末日/界面同层版/shared/opening-preset.default.json');
  const initvar = read('src/寒冬末日/世界书/寒冬末日/[initvar].yaml');
  const updateRules = read('src/寒冬末日/世界书/变量/[mvu_update]变量更新规则.yaml');
  const timeUtil = read('src/寒冬末日/util/time.ts');

  assert.match(preset, /"time": "公元2026年9月14日·14:00"/);
  assert.match(preset, /"time": "公元2026年6月14日·14:00"/);
  assert.match(initvar, /日期: 公元2026年9月14日/);
  assert.doesNotMatch(`${preset}\n${initvar}\n${updateRules}\n${timeUtil}`, /末日纪元/);
  assert.doesNotMatch(`${preset}\n${initvar}`, /952[67]年12月14日/);
});

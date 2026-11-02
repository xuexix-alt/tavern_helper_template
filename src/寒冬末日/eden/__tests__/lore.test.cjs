/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules -- Node lore integration tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const ejs = require('ejs');
const loreRoot = path.resolve(__dirname, '../../世界书');
const files = [
  '变量/[mvu_update]变量更新规则.yaml',
  '变量/[mvu_update]变量输出格式.yaml',
  '变量/变量计算方法.txt',
  '寒冬末日/伊甸一次性指令和主线任务.txt',
  '寒冬末日/世界设定.txt',
  '寒冬末日/庇护所升级能力.txt',
];

for (const managed of [false, true]) {
  test(`real EJS lore rendering keeps legacy and confirmed modes coherent (managed=${managed})`, () => {
    const rendered = files.map(file => {
      const raw = fs.readFileSync(path.join(loreRoot, file), 'utf8');
      if (file.endsWith('.yaml') || file.endsWith('庇护所升级能力.txt')) assert.doesNotThrow(() => YAML.parse(raw));
      const output = ejs.render(raw, {
        getvar: (key, options) => (key === 'eden.worldbookManaged' ? managed : options?.defaults),
      });
      if (file.endsWith('.yaml') || (!managed && file.endsWith('庇护所升级能力.txt')))
        assert.doesNotThrow(() => YAML.parse(output));
      return output;
    });
    if (managed) {
      assert.doesNotMatch(
        rendered.join('\n'),
        /阶段升级奖励|在场角色 Imp \+20|所有在场角色无视上限|<主线任务>|庇护延伸.*共鸣|eden_shelter_ability_master/,
      );
      assert.match(rendered[3], /<伊甸一次性指令>/);
    } else {
      assert.match(rendered[3], /<主线任务>/);
      assert.match(rendered[5], /eden_shelter_ability_master/);
    }
  });
}

test('new seed lore retains all eighteen technical levels and three initial clue paths', () => {
  const mission = fs.readFileSync(path.join(loreRoot, '寒冬末日/末日救亡任务.txt'), 'utf8');
  const technology = fs.readFileSync(path.join(loreRoot, '寒冬末日/伊甸技术.txt'), 'utf8');
  assert.equal([...mission.matchAll(/^lv[0-5]\./gm)].length, 18);
  assert.match(technology, /线索A/);
  assert.match(technology, /线索B/);
  assert.match(technology, /线索C/);
  assert.match(mission, /迟到的新成果不自动恢复/);
  assert.match(mission, /仅灾后/);
});

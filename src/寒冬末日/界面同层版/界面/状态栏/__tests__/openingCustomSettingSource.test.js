const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../../../../');

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

test('opening form exposes a blank custom opening setting field in default and pre-disaster presets', () => {
  const preset = read('src/寒冬末日/界面同层版/shared/opening-preset.default.json');

  assert.match(preset, /"key": "custom_opening_setting"/);
  assert.match(preset, /"label": "开场自定义"/);
  assert.match(preset, /"default_value": ""/);
  assert.doesNotMatch(preset, /"key": "nearby_factions"/);
  assert.doesNotMatch(preset, /"key": "nearby_survivor_types"/);
});

test('opening prompts use custom opening setting and omit nearby social groups and forbidden drift blocks', () => {
  const prompt = read('docs/OpeningSetupPanel.generate提示词.txt');
  const preDisasterPrompt = read('docs/OpeningSetupPanel.generate提示词.灾变前3个月.txt');
  const combined = `${prompt}\n${preDisasterPrompt}`;

  assert.match(combined, /<用户要求的自定义开场设定>/);
  assert.match(combined, /\$\{用户要求的自定义开场设定\}/);
  assert.doesNotMatch(combined, /<附近社会团体>/);
  assert.doesNotMatch(combined, /<附近社会关系/);
  assert.doesNotMatch(combined, /\$\{社会组织\}/);
  assert.doesNotMatch(combined, /\$\{其他幸存者类别\}/);
  assert.doesNotMatch(combined, /<禁止出现的设定>/);
  assert.doesNotMatch(combined, /\$\{forbidden_drift\}/);
});

test('opening prompt context persists and exposes the custom opening setting without nearby social fields', () => {
  const source = read('src/寒冬末日/界面同层版/shared/opening.ts');

  assert.match(source, /'custom_opening_setting'/);
  assert.match(source, /customOpeningSetting/);
  assert.match(source, /用户要求的自定义开场设定/);
  assert.doesNotMatch(source, /'nearby_factions'/);
  assert.doesNotMatch(source, /'nearby_survivor_types'/);
  assert.doesNotMatch(source, /const nearbyFactions/);
  assert.doesNotMatch(source, /const nearbySurvivorTypes/);
});

test('opening setup panel exposes a story preset menu with a usable new-story entry', () => {
  const source = read('src/寒冬末日/界面同层版/界面/状态栏/components/OpeningSetupPanel.vue');

  assert.match(source, /opening-story-menu/);
  assert.match(source, /opening-story-select/);
  assert.match(source, /末世寒冬-星球秩序/);
  assert.match(source, /新的故事/);
  assert.match(source, /selectedStoryKey/);
  assert.match(source, /isCurrentStorySelected/);
  assert.match(source, /visibleNewStoryFormSchema/);
  assert.match(source, /OPENING_STORY_TEMPLATE_GENERIC/);
  assert.match(source, /@change="emitStoryTemplate/);
  assert.match(source, /opening-combo-field/);
  assert.match(source, /presetSelectValue/);
  assert.doesNotMatch(source, /<datalist/);
  assert.doesNotMatch(source, /opening-new-story-placeholder/);
});

test('generic story opening prompt and form expose fanwork, genre, and protagonist fields', () => {
  const source = read('src/寒冬末日/界面同层版/shared/opening.ts');
  const schema = read('src/寒冬末日/界面同层版/shared/opening.schema.ts');
  const prompt = read('docs/OpeningSetupPanel.generate通用故事提示词.txt');

  assert.match(schema, /story_template/);
  assert.match(source, /OPENING_STORY_TEMPLATE_GENERIC/);
  assert.match(source, /openingPromptTemplateGenericStoryRaw/);
  assert.match(source, /GENERIC_STORY_GENRE_OPTIONS/);
  assert.match(source, /GENERIC_STORY_FANWORK_OPTIONS_BY_GENRE/);
  assert.match(source, /GENERIC_STORY_FANWORK_OPTIONS/);
  assert.match(source, /getGenericStoryFanworkOptionsForGenre/);
  assert.match(source, /key: 'generic_genre'/);
  assert.match(source, /key: 'is_fanwork'/);
  assert.match(source, /key: 'fanwork_name'/);
  assert.match(source, /key: 'protagonist_background'/);
  assert.match(source, /getOpeningMissingRequiredField/);
  assert.match(prompt, /\$\{题材\}/);
  assert.match(prompt, /\$\{是否为同人作品\}/);
  assert.match(prompt, /\$\{作品名\}/);
  assert.match(prompt, /\$\{主人公背景\}/);
  assert.doesNotMatch(prompt, /不要擅自套用具体同人 IP/);
});

test('generic story fanwork presets cover major media types and are grouped by genre', () => {
  const source = read('src/寒冬末日/界面同层版/shared/opening.ts');
  const component = read('src/寒冬末日/界面同层版/界面/状态栏/components/OpeningSetupPanel.vue');

  for (const genre of [
    '玄幻',
    '奇幻',
    '仙侠',
    '都市',
    '都市异能',
    '历史',
    '架空历史',
    '科幻',
    '末世',
    '无限流',
    '悬疑',
    '灵异',
    '克苏鲁',
    '赛博朋克',
    '星际',
    '西幻',
    '武侠',
    '游戏异界',
    '轻小说',
    '恋爱日常',
    '情色',
    '娱乐圈',
    '宫斗宅斗',
    '权谋',
    '群像',
  ]) {
    assert.match(source, new RegExp(`${genre}: \\[`), `${genre} should have a fanwork preset group`);
  }

  for (const work of ['狂飙', '星际穿越', '进击的巨人', '赛博朋克2077', '诡秘之主', '红楼梦', '山海经']) {
    assert.match(source, new RegExp(work), `${work} should be available in fanwork presets`);
  }

  for (const eroticWork of ['金瓶梅', '查泰莱夫人的情人', 'O的故事', '大开眼戒', '五十度灰', '兰斯系列']) {
    assert.match(source, new RegExp(eroticWork), `${eroticWork} should be available in erotic presets`);
  }

  assert.match(component, /getGenericStoryFanworkOptionsForGenre\(props\.payload\.form_values\.generic_genre/);
  assert.match(component, /getFieldOptions\(field\)/);
});

test('fanwork preset menu is filtered by selected genre before falling back to the general pool', () => {
  const source = read('src/寒冬末日/界面同层版/shared/opening.ts');
  const getOptionsFunction =
    /export function getGenericStoryFanworkOptionsForGenre\(genre: string\): string\[\] \{[\s\S]*?\n\}/.exec(
      source,
    )?.[0];

  assert.ok(getOptionsFunction, 'getGenericStoryFanworkOptionsForGenre should exist');
  assert.match(getOptionsFunction, /genreOptions\.length\s*>\s*0/);
  assert.match(getOptionsFunction, /GENERIC_STORY_FANWORK_OPTIONS/);
  assert.doesNotMatch(getOptionsFunction, /mergeUniqueOptions\(genreOptions,\s*GENERIC_STORY_FANWORK_OPTIONS\)/);
});

test('opening submit paths branch validation by story template in main and pre UIs', () => {
  const mainSource = read('src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts');
  const preSource = read('src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue');
  const combined = `${mainSource}\n${preSource}`;

  assert.match(combined, /updateOpeningStoryTemplate/);
  assert.match(combined, /getOpeningMissingRequiredField/);
  assert.match(combined, /!isGenericStoryOpening\(openingPayload\.value\) && !getOpeningWorldMode/);
  assert.match(
    mainSource,
    /resolveOpeningPromptTemplateRaw\(payload\.world_mode_id, getOpeningStoryTemplateId\(payload\)\)/,
  );
});

import assert from 'node:assert/strict';
import _ from 'lodash';

import {
  buildRuntimeOpeningGeneratePrompt,
  getRuntimeOpeningDefaultPayload,
  readRuntimeOpeningPresetFromCharacterVariables,
  toLegacyOpeningPreset,
} from '../../../shared/runtimeOpeningPreset';

(globalThis as typeof globalThis & { _: typeof _ })._ = _;

const rawPreset = {
  version: 2,
  preset_id: 'test-wuxia-opening',
  ui: {
    title: '测试武侠录',
    intro: '从一场失窃案踏入江湖。',
    submit_label: '踏入江湖',
  },
  meta_template: {
    character_label: '主角姓名',
    time_label: '故事时间',
    location_label: '开局地点',
  },
  default_meta: {
    character: '{{user}}',
    time: '天和元年1月1日 14:00',
    location: '太和山',
  },
  fields: [
    {
      key: 'path',
      label: '阴阳道路',
      kind: 'select',
      required: true,
      options: ['太和之道', '天欲之道'],
      default_value: '尚未选择',
      placeholder: '',
    },
    {
      key: 'goal',
      label: '初始目标',
      kind: 'textarea',
      required: false,
      options: [],
      default_value: '',
      placeholder: '寻找残卷',
    },
  ],
  prompt: {
    task: '动态创作第一幕正式剧情',
    directives: ['从藏经阁失窃展开', '玩家选择必须改变第一场冲突'],
    forbidden: ['不得替玩家决定长期道路'],
  },
  output: {
    content_tag: 'content',
    option_tag: 'option',
    option_count: 4,
  },
};

function main() {
  const absent = readRuntimeOpeningPresetFromCharacterVariables({});
  assert.deepEqual(absent, { status: 'absent' });

  const read = readRuntimeOpeningPresetFromCharacterVariables({
    same_layer_pre: { opening_preset: rawPreset },
  });
  assert.equal(read.status, 'valid');
  if (read.status !== 'valid') throw new Error('expected a valid runtime preset');

  const legacyPreset = toLegacyOpeningPreset(read.preset);
  assert.equal(legacyPreset.preset_id, rawPreset.preset_id);
  assert.deepEqual(
    legacyPreset.form_schema.map(field => field.key),
    ['path', 'goal'],
  );

  const payload = getRuntimeOpeningDefaultPayload(read.preset);
  assert.equal(payload.story_template, 'runtime:test-wuxia-opening');
  assert.equal(payload.meta.character, '{{user}}');
  assert.equal(payload.form_values.path, '尚未选择');
  payload.form_values.path = '天欲之道';
  payload.form_values.goal = '';

  const prompt = buildRuntimeOpeningGeneratePrompt(read.preset, payload);
  assert.match(prompt, /<opening_request>/);
  assert.match(prompt, /角色卡开局：测试武侠录/);
  assert.match(prompt, /任务：动态创作第一幕正式剧情/);
  assert.match(prompt, /主角姓名：\{\{user\}\}/);
  assert.match(prompt, /故事时间：天和元年1月1日 14:00/);
  assert.match(prompt, /开局地点：太和山/);
  assert.match(prompt, /阴阳道路：天欲之道/);
  assert.match(prompt, /初始目标：未设定/);
  assert.match(prompt, /- 从藏经阁失窃展开/);
  assert.match(prompt, /- 不得替玩家决定长期道路/);
  assert.match(prompt, /<content>正式开局剧情<\/content>/);
  assert.match(prompt, /同一个 <option> 标签内给出 4 个/);

  const invalid = readRuntimeOpeningPresetFromCharacterVariables({
    same_layer_pre: {
      opening_preset: {
        ...rawPreset,
        ui: { ...rawPreset.ui, title: '' },
      },
    },
  });
  assert.equal(invalid.status, 'invalid');
  if (invalid.status !== 'invalid') throw new Error('expected an invalid runtime preset');
  assert.match(invalid.error, /ui\.title/);

  console.log('runtime opening preset test passed');
}

main();

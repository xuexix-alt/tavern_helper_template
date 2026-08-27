import assert from 'node:assert/strict';
import _ from 'lodash';

import {
  RUNTIME_OPENING_CHAT_SNAPSHOT_PATH,
  buildRuntimeOpeningGeneratePrompt,
  getRuntimeOpeningDefaultPayload,
  readRuntimeOpeningPresetFromChatVariables,
  readRuntimeOpeningPresetFromCharacterVariables,
  toLegacyOpeningPreset,
  withRuntimeOpeningPresetAtPath,
} from '../../../shared/runtimeOpeningPreset';
import {
  buildRuntimeOpeningExport,
  buildRuntimeOpeningLoreContent,
  parseRuntimeOpeningImport,
  toPortableRuntimeOpeningPreset,
} from '../../../shared/runtimeOpeningPresetTransfer';

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

  const imported = parseRuntimeOpeningImport({
    format: 'same-layer-pre-opening',
    version: 1,
    preset: rawPreset,
    answers: {
      meta: { character: '林秋' },
      form_values: { path: '天欲之道', goal: '<危险> &' },
    },
  });
  assert.equal(imported.source, 'bundle');
  assert.equal(imported.payload.meta.character, '林秋');
  assert.equal(imported.payload.meta.time, rawPreset.default_meta.time);
  assert.equal(imported.payload.meta.location, rawPreset.default_meta.location);
  assert.equal(imported.payload.form_values.path, '天欲之道');
  assert.equal(imported.payload.form_values.goal, '<危险> &');

  const bare = parseRuntimeOpeningImport(rawPreset);
  assert.equal(bare.source, 'bare-preset');
  assert.deepEqual(bare.payload.meta, rawPreset.default_meta);
  assert.equal(bare.payload.form_values.path, rawPreset.fields[0].default_value);

  assert.throws(
    () =>
      parseRuntimeOpeningImport({
        format: 'same-layer-pre-opening',
        version: 1,
        preset: rawPreset,
        answers: { form_values: { path: '不存在的道路' } },
      }),
    /阴阳道路.*不存在的道路/,
  );

  const exported = buildRuntimeOpeningExport(imported.preset, {
    ...imported.payload,
    state: 'ready',
    use_stream: true,
    compiled_prompt_snapshot: '不得导出',
    opening_assistant_message_id: 9,
  });
  assert.equal(exported.format, 'same-layer-pre-opening');
  assert.equal(exported.version, 1);
  assert.equal(exported.answers.meta.character, '林秋');
  assert.equal(exported.answers.form_values.path, '天欲之道');
  const exportedText = JSON.stringify(exported);
  assert.doesNotMatch(exportedText, /state|use_stream|compiled_prompt_snapshot|opening_assistant_message_id|不得导出/);

  const lore = buildRuntimeOpeningLoreContent(imported.preset, imported.payload);
  assert.match(lore, /<same_layer_pre_opening_context>/);
  assert.match(lore, /主角姓名：林秋/);
  assert.match(lore, /阴阳道路：天欲之道/);
  assert.match(lore, /初始目标：&lt;危险&gt; &amp;/);
  assert.match(lore, /从藏经阁失窃展开/);
  assert.match(lore, /不得替玩家决定长期道路/);
  assert.doesNotMatch(lore, /content_tag|option_tag|option_count|<content>|<option>/);

  const chatVariables = withRuntimeOpeningPresetAtPath({}, RUNTIME_OPENING_CHAT_SNAPSHOT_PATH, imported.preset);
  assert.deepEqual(readRuntimeOpeningPresetFromChatVariables(chatVariables), {
    status: 'valid',
    preset: imported.preset,
  });
  assert.deepEqual(readRuntimeOpeningPresetFromChatVariables({}), { status: 'absent' });

  const portableSourcePreset = {
    version: 1,
    preset_id: 'legacy-generic',
    world_intro: '这是通用故事。',
    first_line: '请根据表单开始故事。',
    meta_template: { character_label: '主角', time_label: '时间', location_label: '地点' },
    default_meta: { character: '{{user}}', time: '', location: '' },
    form_schema: [
      {
        key: 'genre',
        label: '原字段名',
        kind: 'text',
        required: false,
        options: [],
        placeholder: '',
        default_value: '',
      },
    ],
    form_schema_overrides: {},
    prompt_rules: { should_echo_setup: true, output_tags: ['content', 'option'] },
  } as const;
  const legacyPayload = {
    version: 5,
    state: 'placeholder' as const,
    story_template: 'generic-story',
    world_mode_id: '',
    route_id: '',
    use_stream: false,
    compiled_prompt_snapshot: '',
    opening_assistant_message_id: null,
    meta: { character: '', time: '', location: '' },
    form_values: { genre: '' },
  };
  const portable = toPortableRuntimeOpeningPreset(portableSourcePreset, legacyPayload);
  assert.equal(portable.version, 2);
  assert.equal(portable.preset_id, 'legacy-generic');
  assert.equal(portable.fields[0].label, '原字段名');
  assert.equal(portable.fields[0].default_value, '');
  const emptyExport = buildRuntimeOpeningExport(portable, legacyPayload);
  assert.deepEqual(emptyExport.answers.form_values, { genre: '' });

  const edited = {
    ...emptyExport,
    preset: {
      ...emptyExport.preset,
      fields: emptyExport.preset.fields.map(field =>
        field.key === 'genre' ? { ...field, label: '编辑后的字段名' } : field,
      ),
    },
  };
  const editedImport = parseRuntimeOpeningImport(edited);
  assert.equal(editedImport.preset.fields[0].label, '编辑后的字段名');
  assert.equal(editedImport.payload.form_values.genre, '');

  console.log('runtime opening preset test passed');
}

main();

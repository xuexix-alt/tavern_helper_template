import _ from 'lodash';

import { OpeningPayloadSchema, type OpeningPayload, type OpeningPreset } from './opening.schema';
import { RuntimeOpeningPresetSchema, type RuntimeOpeningPreset } from './runtimeOpeningPreset.schema';

export const RUNTIME_OPENING_CHARACTER_PATH = 'same_layer_pre.opening_preset';
export const RUNTIME_OPENING_STORY_PREFIX = 'runtime:';

export type RuntimeOpeningPresetReadResult =
  | { status: 'absent' }
  | { status: 'valid'; preset: RuntimeOpeningPreset }
  | { status: 'invalid'; error: string };

function formatRuntimePresetError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .map(issue => `${issue.path.map(String).join('.') || 'opening_preset'}: ${issue.message}`)
    .join('; ');
}

export function readRuntimeOpeningPresetFromCharacterVariables(
  variables: Record<string, unknown> | null | undefined,
): RuntimeOpeningPresetReadResult {
  const raw = _.get(variables ?? {}, RUNTIME_OPENING_CHARACTER_PATH);
  if (raw === undefined || raw === null) return { status: 'absent' };

  const parsed = RuntimeOpeningPresetSchema.safeParse(raw);
  if (!parsed.success) return { status: 'invalid', error: formatRuntimePresetError(parsed.error) };
  return { status: 'valid', preset: parsed.data };
}

export function toLegacyOpeningPreset(preset: RuntimeOpeningPreset): OpeningPreset {
  return {
    version: 1,
    preset_id: preset.preset_id,
    world_intro: preset.ui.intro,
    first_line: preset.prompt.task,
    meta_template: preset.meta_template,
    default_meta: preset.default_meta,
    form_schema: preset.fields,
    form_schema_overrides: {},
    prompt_rules: {
      should_echo_setup: true,
      output_tags: [preset.output.content_tag, preset.output.option_tag],
    },
  };
}

export function runtimeOpeningStoryTemplateId(presetId: string): string {
  return `${RUNTIME_OPENING_STORY_PREFIX}${String(presetId ?? '').trim()}`;
}

export function isRuntimeOpeningPayload(payload: Pick<OpeningPayload, 'story_template'> | null | undefined): boolean {
  return String(payload?.story_template ?? '').startsWith(RUNTIME_OPENING_STORY_PREFIX);
}

export function getRuntimeOpeningDefaultPayload(preset: RuntimeOpeningPreset): OpeningPayload {
  return OpeningPayloadSchema.parse({
    version: 5,
    state: 'configuring',
    story_template: runtimeOpeningStoryTemplateId(preset.preset_id),
    world_mode_id: '',
    route_id: '',
    use_stream: false,
    compiled_prompt_snapshot: '',
    opening_assistant_message_id: null,
    meta: preset.default_meta,
    form_values: Object.fromEntries(preset.fields.map(field => [field.key, field.default_value])),
  });
}

function displayValue(value: unknown): string {
  return String(value ?? '').trim() || '未设定';
}

function formatBulletLines(items: string[]): string {
  return items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '- 无';
}

export function buildRuntimeOpeningGeneratePrompt(preset: RuntimeOpeningPreset, payload: OpeningPayload): string {
  const metaLines = [
    `${preset.meta_template.character_label}：${displayValue(payload.meta.character)}`,
    `${preset.meta_template.time_label}：${displayValue(payload.meta.time)}`,
    `${preset.meta_template.location_label}：${displayValue(payload.meta.location)}`,
  ];
  const fieldLines = preset.fields.map(field => `${field.label}：${displayValue(payload.form_values[field.key])}`);
  const { content_tag: contentTag, option_tag: optionTag, option_count: optionCount } = preset.output;

  const prompt = [
    '<opening_request>',
    `角色卡开局：${preset.ui.title}`,
    `任务：${preset.prompt.task}`,
    '',
    '<opening_meta>',
    ...metaLines,
    '</opening_meta>',
    '',
    '<player_opening_choices>',
    ...fieldLines,
    '</player_opening_choices>',
    '',
    '<card_directives>',
    formatBulletLines(preset.prompt.directives),
    '</card_directives>',
    '',
    '<forbidden>',
    formatBulletLines(preset.prompt.forbidden),
    '</forbidden>',
    '',
    '输出要求：',
    `- <${contentTag}>正式开局剧情</${contentTag}>`,
    `- 在同一个 <${optionTag}> 标签内给出 ${optionCount} 个后续行动选项，每项单独一行。`,
    '- 不要复述表单，不要解释提示词。',
    '</opening_request>',
  ].join('\n');

  return typeof substitudeMacros === 'function' ? substitudeMacros(prompt) : prompt;
}

import openingPresetRaw from './opening-preset.default.json';
import { OpeningPayloadSchema, OpeningPresetSchema, type OpeningPayload, type OpeningPreset } from './opening.schema';

export const OPENING_CHAT_STATE_PATH = 'stream_demo.opening';
export const OPENING_MESSAGE_ID = 0;

export function getDefaultOpeningPreset(): OpeningPreset {
  return OpeningPresetSchema.parse(openingPresetRaw);
}

export function getDefaultOpeningPayload(preset = getDefaultOpeningPreset()): OpeningPayload {
  return OpeningPayloadSchema.parse({
    version: 1,
    state: 'placeholder',
    preset_id: preset.preset_id,
    base: {
      world_intro: preset.world_intro,
      first_line: preset.first_line,
    },
    meta: preset.default_meta,
    user_input: Object.fromEntries(preset.form_schema.map(field => [field.key, ''])),
    prompt_echo: '',
    opening_content: '',
    options: [],
  });
}

export function readOpeningPayloadFromChat(): OpeningPayload | null {
  try {
    const vars = getVariables?.({ type: 'chat' }) ?? {};
    const raw = _.get(vars, OPENING_CHAT_STATE_PATH, null);
    if (!raw) return null;
    return OpeningPayloadSchema.parse(raw);
  } catch {
    return null;
  }
}

export function replaceOpeningPayloadInChat(payload: OpeningPayload) {
  try {
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        _.set(vars, OPENING_CHAT_STATE_PATH, OpeningPayloadSchema.parse(payload));
        return vars;
      },
      { type: 'chat' },
    );
  } catch {
    // ignore
  }
}

export function buildOpeningPrompt(preset: OpeningPreset, payload: OpeningPayload): string {
  const userBlocks = Object.entries(payload.user_input)
    .map(([key, value]) => ({ key, value: String(value ?? '').trim() }))
    .filter(entry => entry.value)
    .map(entry => `- ${entry.key}: ${entry.value}`)
    .join('\n');

  return [
    '<opening_setup>',
    `<world_intro>${payload.base.world_intro}</world_intro>`,
    `<first_line>${payload.base.first_line}</first_line>`,
    '<meta>',
    `<time>${payload.meta.time}</time>`,
    `<location>${payload.meta.location}</location>`,
    `<character>${payload.meta.character}</character>`,
    '</meta>',
    '<user_choice>',
    userBlocks || '- 无额外用户输入',
    '</user_choice>',
    '</opening_setup>',
    '',
    '请先输出 <opening_prompt_echo>，简要回显你理解到的开局设定。',
    '然后输出 <content> 作为正式开局剧情正文。',
    '如有可选分支，再输出 <option>。',
    '不要输出与这三个标签无关的额外结构。',
    '',
    `开局风格偏好：${payload.user_input.opening_style || '轻小说叙事'}`,
  ].join('\n');
}

export function extractTaggedBlock(raw: string, tagName: string): string {
  const source = String(raw ?? '');
  const match = source.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return String(match?.[1] ?? '').trim();
}

export function extractOpeningContent(raw: string): string {
  return extractTaggedBlock(raw, 'content') || String(raw ?? '').trim();
}

export function extractOpeningPromptEcho(raw: string): string {
  return extractTaggedBlock(raw, 'opening_prompt_echo');
}

export function extractOpeningOptions(raw: string): string[] {
  const optionBlock = extractTaggedBlock(raw, 'option');
  return optionBlock
    .split('\n')
    .map(line => line.replace(/^(?:[-*•]+|\d+[.)、]|[（(]?\d+[)）、])\s*/, '').trim())
    .filter(Boolean);
}

import { z } from 'zod';

import type { OpeningPayload, OpeningPreset } from './opening.schema';
import { getRuntimeOpeningDefaultPayload } from './runtimeOpeningPreset';
import { RuntimeOpeningPresetSchema, type RuntimeOpeningPreset } from './runtimeOpeningPreset.schema';

const RuntimeOpeningAnswersSchema = z
  .object({
    meta: z
      .object({
        character: z.string().optional(),
        time: z.string().optional(),
        location: z.string().optional(),
      })
      .strict()
      .optional()
      .default({}),
    form_values: z.record(z.string(), z.string()).optional().default({}),
  })
  .strict();

export const RuntimeOpeningExportBundleSchema = z
  .object({
    format: z.literal('same-layer-pre-opening'),
    version: z.literal(1),
    preset: RuntimeOpeningPresetSchema,
    answers: RuntimeOpeningAnswersSchema,
  })
  .strict();

export type RuntimeOpeningExportBundle = z.infer<typeof RuntimeOpeningExportBundleSchema>;

export type RuntimeOpeningImportResult = {
  preset: RuntimeOpeningPreset;
  payload: OpeningPayload;
  source: 'bundle' | 'bare-preset';
};

function validOutputTag(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(text) ? text : fallback;
}

export function toPortableRuntimeOpeningPreset(
  legacyPreset: OpeningPreset,
  payload: Pick<OpeningPayload, 'story_template' | 'world_mode_id' | 'route_id' | 'meta' | 'form_values'>,
  options: {
    fields?: OpeningPreset['form_schema'];
    extraFields?: OpeningPreset['form_schema'];
  } = {},
): RuntimeOpeningPreset {
  const generic = String(payload.story_template ?? '').trim() === 'generic-story';
  const legacyFields = options.fields ?? legacyPreset.form_schema;
  const inheritedFields = legacyFields.map(field => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required ?? false,
    options: field.options ?? [],
    placeholder: field.placeholder ?? '',
    default_value: field.default_value ?? '',
  }));
  const compatibilityFields = options.extraFields ?? [];
  const fields = [
    ...compatibilityFields,
    ...inheritedFields.filter(field => !compatibilityFields.some(item => item.key === field.key)),
  ];
  const [contentTag, optionTag] = legacyPreset.prompt_rules.output_tags ?? [];

  return RuntimeOpeningPresetSchema.parse({
    version: 2,
    preset_id: legacyPreset.preset_id,
    ui: {
      title: generic ? '通用故事开场' : '末世寒冬 - 星穹秩序',
      intro: legacyPreset.world_intro,
      submit_label: '生成开局',
    },
    meta_template: legacyPreset.meta_template,
    default_meta: payload.meta,
    fields,
    prompt: {
      task: legacyPreset.first_line || '请根据开局配置开始正式剧情。',
      directives: legacyPreset.world_intro ? [legacyPreset.world_intro] : [],
      forbidden: [],
    },
    output: {
      content_tag: validOutputTag(contentTag, 'content'),
      option_tag: validOutputTag(optionTag, 'option'),
      option_count: 4,
    },
  });
}

function formatSchemaError(error: z.ZodError): string {
  return z.prettifyError(error);
}

function resolveImportSource(raw: unknown): {
  preset: RuntimeOpeningPreset;
  answers: z.infer<typeof RuntimeOpeningAnswersSchema>;
  source: RuntimeOpeningImportResult['source'];
} {
  const bundle = RuntimeOpeningExportBundleSchema.safeParse(raw);
  if (bundle.success) {
    return { preset: bundle.data.preset, answers: bundle.data.answers, source: 'bundle' };
  }

  const preset = RuntimeOpeningPresetSchema.safeParse(raw);
  if (preset.success) {
    return { preset: preset.data, answers: { meta: {}, form_values: {} }, source: 'bare-preset' };
  }

  const looksLikeBundle = typeof raw === 'object' && raw !== null && ('format' in raw || 'preset' in raw);
  throw new Error(formatSchemaError(looksLikeBundle ? bundle.error : preset.error));
}

export function parseRuntimeOpeningImport(raw: unknown): RuntimeOpeningImportResult {
  const { preset, answers, source } = resolveImportSource(raw);
  const payload = getRuntimeOpeningDefaultPayload(preset);
  payload.meta = {
    character: answers.meta.character ?? payload.meta.character,
    time: answers.meta.time ?? payload.meta.time,
    location: answers.meta.location ?? payload.meta.location,
  };

  payload.form_values = Object.fromEntries(
    preset.fields.map(field => {
      const hasImportedValue = Object.hasOwn(answers.form_values, field.key);
      const importedValue = hasImportedValue ? answers.form_values[field.key] : field.default_value;
      if (
        hasImportedValue &&
        field.kind === 'select' &&
        importedValue !== '' &&
        !field.options.includes(importedValue)
      ) {
        throw new Error(`${field.label}：导入值“${importedValue}”不在可选项中`);
      }
      return [field.key, importedValue];
    }),
  );

  return { preset, payload, source };
}

export function buildRuntimeOpeningExport(
  preset: RuntimeOpeningPreset,
  payload: OpeningPayload,
): RuntimeOpeningExportBundle {
  return RuntimeOpeningExportBundleSchema.parse({
    format: 'same-layer-pre-opening',
    version: 1,
    preset,
    answers: {
      meta: {
        character: payload.meta.character,
        time: payload.meta.time,
        location: payload.meta.location,
      },
      form_values: Object.fromEntries(
        preset.fields.map(field => [field.key, String(payload.form_values[field.key] ?? '')]),
      ),
    },
  });
}

function escapeStructuredText(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function displayValue(value: unknown): string {
  const text = String(value ?? '').trim();
  return escapeStructuredText(text || '未设定');
}

function bulletList(items: readonly string[]): string {
  return items.length > 0 ? items.map(item => `- ${displayValue(item)}`).join('\n') : '- 无';
}

export function buildRuntimeOpeningLoreContent(preset: RuntimeOpeningPreset, payload: OpeningPayload): string {
  const meta = [
    `${displayValue(preset.meta_template.character_label)}：${displayValue(payload.meta.character)}`,
    `${displayValue(preset.meta_template.time_label)}：${displayValue(payload.meta.time)}`,
    `${displayValue(preset.meta_template.location_label)}：${displayValue(payload.meta.location)}`,
  ];
  const fields = preset.fields.map(
    field => `${displayValue(field.label)}：${displayValue(payload.form_values[field.key])}`,
  );

  return [
    '<same_layer_pre_opening_context>',
    '<opening_task>',
    displayValue(preset.prompt.task),
    '</opening_task>',
    '',
    '<opening_meta>',
    ...meta,
    '</opening_meta>',
    '',
    '<player_opening_choices>',
    ...(fields.length > 0 ? fields : ['未设定']),
    '</player_opening_choices>',
    '',
    '<persistent_directives>',
    bulletList(preset.prompt.directives),
    '</persistent_directives>',
    '',
    '<forbidden>',
    bulletList(preset.prompt.forbidden),
    '</forbidden>',
    '</same_layer_pre_opening_context>',
  ].join('\n');
}

import { z } from 'zod';

const RuntimeOpeningFieldSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(['text', 'textarea', 'select']),
    required: z.boolean().optional().default(false),
    options: z.array(z.string()).optional().default([]),
    placeholder: z.string().optional().default(''),
    default_value: z.string().optional().default(''),
  })
  .strict();

const OutputTagSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

export const RuntimeOpeningPresetSchema = z
  .object({
    version: z.literal(2),
    preset_id: z.string().min(1),
    ui: z
      .object({
        title: z.string().min(1),
        intro: z.string().default(''),
        submit_label: z.string().min(1).default('生成开局'),
      })
      .strict(),
    meta_template: z
      .object({
        character_label: z.string().min(1).default('主角'),
        time_label: z.string().min(1).default('时间'),
        location_label: z.string().min(1).default('地点'),
      })
      .strict(),
    default_meta: z
      .object({
        character: z.string().default('{{user}}'),
        time: z.string().default(''),
        location: z.string().default(''),
      })
      .strict(),
    fields: z.array(RuntimeOpeningFieldSchema).default([]),
    prompt: z
      .object({
        task: z.string().min(1),
        directives: z.array(z.string().min(1)).default([]),
        forbidden: z.array(z.string().min(1)).default([]),
      })
      .strict(),
    output: z
      .object({
        content_tag: OutputTagSchema.default('content'),
        option_tag: OutputTagSchema.default('option'),
        option_count: z.coerce.number().int().min(1).max(12).default(4),
      })
      .strict(),
  })
  .strict();

export type RuntimeOpeningPreset = z.infer<typeof RuntimeOpeningPresetSchema>;

import { z } from 'zod';

export const OpeningFormFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['text', 'textarea', 'select']),
  required: z.boolean().optional().default(false),
  options: z.array(z.string()).optional().default([]),
  placeholder: z.string().optional().default(''),
  default_value: z.string().optional().default(''),
});

export const OpeningPresetSchema = z.object({
  version: z.literal(1),
  preset_id: z.string().min(1),
  world_intro: z.string().default(''),
  first_line: z.string().default(''),
  meta_template: z.object({
    time_label: z.string().default('时间'),
    location_label: z.string().default('地点'),
    character_label: z.string().default('主角'),
  }),
  default_meta: z.object({
    time: z.string().default(''),
    location: z.string().default(''),
    character: z.string().default(''),
  }),
  form_schema: z.array(OpeningFormFieldSchema).default([]),
  form_schema_overrides: z
    .record(
      z.string(),
      z.object({
        default_meta: z
          .object({
            time: z.string().optional(),
            location: z.string().optional(),
            character: z.string().optional(),
          })
          .partial()
          .optional(),
        fields: z.array(OpeningFormFieldSchema).default([]),
      }),
    )
    .default({}),
  prompt_rules: z.object({
    should_echo_setup: z.boolean().default(true),
    output_tags: z.array(z.string()).default(['content', 'option']),
  }),
});

export const OpeningPayloadSchema = z
  .object({
    version: z.literal(5),
    state: z.enum(['placeholder', 'configuring', 'generating', 'ready']).default('placeholder'),
    world_mode_id: z.string().default('B'),
    route_id: z.string().default('后宫+养成'),
    use_stream: z.boolean().default(false),
    compiled_prompt_snapshot: z.string().default(''),
    opening_assistant_message_id: z.number().int().positive().nullable().default(null),
    meta: z.object({
      time: z.string().default(''),
      location: z.string().default(''),
      character: z.string().default(''),
    }),
    form_values: z.record(z.string(), z.string()).default({}),
  })
  .prefault({});

export type OpeningFormField = z.infer<typeof OpeningFormFieldSchema>;
export type OpeningPreset = z.infer<typeof OpeningPresetSchema>;
export type OpeningPayload = z.infer<typeof OpeningPayloadSchema>;

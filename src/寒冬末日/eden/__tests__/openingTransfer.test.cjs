/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules -- Node test harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
const { toEdenOpeningConfig, createOpeningEdenDocument, EdenOpeningConfigSchema } = require('../openingConfig.ts');
const { createDefaultEdenDocument } = require('../defaults.ts');
test('portable config strips progress and validates start day', () => {
  const doc = createDefaultEdenDocument({ missionLore: '使命', technologyLore: '技术', startDay: 3 });
  const config = toEdenOpeningConfig(doc, -90);
  assert.equal(config.revision, undefined);
  assert.equal(config.achievements, undefined);
  assert.equal(EdenOpeningConfigSchema.safeParse({ ...config, startDay: 1.2 }).success, false);
  const restored = createOpeningEdenDocument(config, '使命', '技术');
  assert.equal(restored.rescueStartDay, 0);
  assert.deepEqual(restored.achievements, {});
});
const transfer = require('../../界面同层版/shared/runtimeOpeningPresetTransfer.ts');
const preset = {
  version: 2,
  preset_id: 'test',
  ui: { title: 'test' },
  meta_template: {},
  default_meta: {},
  fields: [{ key: 'shelter_ability_summary', label: '能力', kind: 'text' }],
  prompt: { task: '开始' },
  output: {},
};
test('v2 bundle round trips Eden and removes legacy active capability text', () => {
  const { RuntimeOpeningPresetSchema } = require('../../界面同层版/shared/runtimeOpeningPreset.schema.ts');
  const integrated = RuntimeOpeningPresetSchema.parse({ ...preset, integrations: { eden: true } });
  const payload = {
    meta: { character: '玩家', time: '现在', location: '此地' },
    form_values: { shelter_ability_summary: '旧能力' },
  };
  const config = toEdenOpeningConfig(
    createDefaultEdenDocument({ missionLore: '使命', technologyLore: '技术', startDay: 3 }),
    3,
  );
  const bundle = transfer.buildRuntimeOpeningExport(integrated, payload, config);
  assert.equal(bundle.version, 2);
  assert.deepEqual(bundle.answers.form_values, {});
  const imported = transfer.parseRuntimeOpeningImport(bundle);
  assert.deepEqual(imported.eden, config);
  assert.deepEqual(imported.payload.form_values, {});
  assert.throws(() =>
    transfer.parseRuntimeOpeningImport({ ...bundle, preset: { ...bundle.preset, integrations: undefined } }),
  );
  assert.doesNotMatch(transfer.buildRuntimeOpeningLoreContent(integrated, payload), /旧能力/);
  assert.match(transfer.buildRuntimeOpeningLoreContent(integrated, payload), /当前伊甸世界书/);
});
test('legacy bundle and bare preset stay generic', () => {
  const { RuntimeOpeningPresetSchema } = require('../../界面同层版/shared/runtimeOpeningPreset.schema.ts');
  const generic = RuntimeOpeningPresetSchema.parse(preset);
  const bare = transfer.parseRuntimeOpeningImport(generic);
  const bundle = transfer.buildRuntimeOpeningExport(generic, bare.payload);
  assert.equal(bundle.version, 1);
  assert.equal(bundle.eden, undefined);
  assert.equal(transfer.parseRuntimeOpeningImport(bundle).source, 'bundle');
  assert.equal(bare.preset.integrations, undefined);
});

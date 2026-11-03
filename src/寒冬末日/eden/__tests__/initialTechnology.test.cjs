/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules -- Node test harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
const model = require('../model.ts');
const { createDefaultEdenDocument } = require('../defaults.ts');
test('initial technology is knowledge without rescue credit or production', () => {
  const doc = model.EdenDocumentSchema.parse({
    ...createDefaultEdenDocument({ missionLore: '使命', technologyLore: '技术', startDay: 3 }),
    initialTechnologies: [{ branch: '农业', techLevel: 0, name: '营养液' }],
  });
  const context = { day: 10, messageId: 10 };
  assert.equal(model.getKnownEdenTechnologies(doc, context)[0].id, '技术:农业-lv0');
  assert.match(model.describeTechnologies(doc, context), /营养液/);
  assert.match(model.getEdenMissionBoard(doc, context).currentTask.title, /自持生产/);
  assert.equal(model.getEdenRuntime(doc, context).rescue.deadlineDay, 33);
  assert.deepEqual(model.getEdenRuntime(doc, context).achievements, []);
  assert.throws(
    () =>
      model.confirmAchievement(
        doc,
        { kind: '技术', branch: '农业', techLevel: 0, key: 'alias', name: '营养液', evidence: '重复' },
        context,
      ),
    /重复/,
  );
  const produced = model.confirmAchievement(
    doc,
    { kind: '生产', key: 'farm', name: '农场', evidence: '运行' },
    context,
  );
  assert.equal(model.getEdenRuntime(produced, context).rescue.deadlineDay, 40);
  assert.equal(model.getKnownEdenTechnologies(doc, { day: -90, messageId: 0 }).length, 1);
});
test('initial technology validates unique exact levels and old documents', () => {
  const doc = createDefaultEdenDocument({ missionLore: '使命', technologyLore: '技术', startDay: 0 });
  delete doc.initialTechnologies;
  assert.deepEqual(model.EdenDocumentSchema.parse(doc).initialTechnologies, []);
  const item = { branch: '工业', techLevel: 2, name: '制造' };
  assert.equal(model.EdenDocumentSchema.safeParse({ ...doc, initialTechnologies: [item, item] }).success, false);
  assert.equal(model.InitialEdenTechnologySchema.safeParse({ ...item, techLevel: 6 }).success, false);
});

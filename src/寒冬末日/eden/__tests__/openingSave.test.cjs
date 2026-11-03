/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules -- Node test harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
const { createDefaultEdenDocument } = require('../defaults.ts');
const { saveEdenDocument, readEdenDocument } = require('../worldbook.ts');
const { confirmEdenOpening } = require('../opening.ts');
const { toEdenOpeningConfig } = require('../openingConfig.ts');

const entry = {
  name: '[同层PRE]自定义开局上下文',
  content: '开局场景',
  enabled: true,
  extra: { same_layer_pre: { kind: 'runtime_opening_context', format_version: 1 } },
};
function harness() {
  let chat = 'a',
    binding = null,
    writes = 0;
  let entries = [{ uid: 1, name: '手机', content: '保留手机' }];
  const deps = {
    currentChatId: () => chat,
    boundWorldbook: () => binding,
    ensureWorldbook: async () => (binding = 'a-book'),
    read: async () => structuredClone(entries),
    update: async (_name, updater) => {
      entries = structuredClone(await updater(structuredClone(entries)));
      writes++;
    },
  };
  return {
    deps,
    get entries() {
      return entries;
    },
    get writes() {
      return writes;
    },
    set entries(value) {
      entries = value;
    },
    set chat(value) {
      chat = value;
    },
  };
}
function draft() {
  return createDefaultEdenDocument({ missionLore: '救亡规则', technologyLore: '技术规则', startDay: 3 });
}

test('opening confirmation commits Eden and opening context together while preserving phone', async () => {
  const h = harness();
  await saveEdenDocument('a', draft(), 0, { day: 3, messageId: 0 }, h.deps, null, { openingEntry: entry });
  assert.equal(h.writes, 1);
  assert.equal(h.entries.length, 8);
  assert.equal(h.entries.find(e => e.name === '手机').content, '保留手机');
  assert.equal(h.entries.find(e => e.name === entry.name).content, '开局场景');
});

test('opening collision rejects whole update without partial Eden entries', async () => {
  const h = harness();
  h.entries = [...h.entries, { uid: 2, name: entry.name, content: '手写条目' }];
  await assert.rejects(
    () => saveEdenDocument('a', draft(), 0, { day: 3, messageId: 0 }, h.deps, null, { openingEntry: entry }),
    /同名/,
  );
  assert.equal(h.writes, 0);
  assert.equal(readEdenDocument(h.entries), null);
});

test('opening retry resumes the already committed revision without extending deadline', async () => {
  const h = harness();
  const doc = draft();
  doc.openingSetup = { fingerprint: 'same-config', startDay: 3 };
  const saved = await saveEdenDocument('a', doc, 0, { day: 3, messageId: 0 }, h.deps, null, { openingEntry: entry });
  const retried = await saveEdenDocument('a', doc, 0, { day: 3, messageId: 0 }, h.deps, 'a-book', {
    openingEntry: entry,
  });
  assert.equal(retried.document.revision, saved.document.revision);
  assert.equal(retried.document.rescueStartDay, 3);
  assert.equal(h.writes, 1);
});

test('opening guard is checked again inside update and cannot write after story starts', async () => {
  const h = harness();
  let started = false;
  const update = h.deps.update;
  h.deps.update = async (name, updater) => {
    started = true;
    return update(name, updater);
  };
  await assert.rejects(
    () =>
      saveEdenDocument('a', draft(), 0, { day: 3, messageId: 0 }, h.deps, null, {
        openingEntry: entry,
        assertCanSave: () => {
          if (started) throw new Error('已有剧情');
        },
      }),
    /已有剧情/,
  );
  assert.equal(h.writes, 0);
});

test('confirming an existing document preserves its original rescue cycle and achievement history', async () => {
  const h = harness();
  const existing = draft();
  existing.achievements['生产:seed'] = {
    kind: '生产',
    key: 'seed',
    name: '原生产线',
    evidence: '旧剧情',
    day: 4,
    messageId: 3,
    sourceFingerprint: 'old',
    branch: '其他',
    techLevel: null,
  };
  const saved = await saveEdenDocument('a', existing, 0, { day: 4, messageId: 3 }, h.deps);
  const result = await confirmEdenOpening(
    {
      chatId: 'a',
      config: toEdenOpeningConfig(saved.document, 40),
      existingDocument: saved.document,
      missionLore: '救亡规则',
      technologyLore: '技术规则',
      openingEntry: entry,
      expectedRevision: saved.document.revision,
      expectedWorldbookName: 'a-book',
    },
    { ...h.deps, assertUnstarted() {}, async synchronize() {} },
  );
  assert.equal(result.document.rescueStartDay, 3);
  assert.deepEqual(result.document.achievements, existing.achievements);
});

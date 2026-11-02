/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules -- Node CommonJS test harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
const {
  EdenDocumentSchema,
  getEdenRuntime,
  confirmAchievement,
  projectEdenToMvu,
  buildEdenAnchors,
  getEdenMissionBoard,
} = require('../model.ts');
const { createDefaultEdenDocument } = require('../defaults.ts');
const { loadEdenDocument, saveEdenDocument, refreshEdenEntries, EDEN_DOCUMENT_ENTRY } = require('../worldbook.ts');

function document() {
  return createDefaultEdenDocument({ missionLore: '救亡使命', technologyLore: '外星文明技术', startDay: 2 });
}
const context = (day = 2, messageId = 10) => ({ day, messageId });

test('defaults have four levels and preserve independent ability conditions', () => {
  const doc = document();
  assert.equal(doc.level, 1);
  assert.equal(doc.levelNames.length, 4);
  assert.deepEqual(EdenDocumentSchema.parse(doc), doc);
  assert.equal(
    getEdenRuntime(doc, context()).abilities.some(item => item.id === 'external-power'),
    false,
  );
  doc.level = 3;
  doc.rooms = ['2002'];
  let state = getEdenRuntime(doc, context());
  assert.equal(state.rooms.length, 0);
  doc.abilities['external-power'].conditionConfirmed = true;
  state = getEdenRuntime(doc, context());
  assert.deepEqual(state.rooms, ['2002']);
  assert.equal(
    state.abilities.some(item => item.id === 'external-power'),
    true,
  );
});

test('mission board shows current targets and known clues without exposing complete setting texts', () => {
  const doc = document();
  const initial = getEdenMissionBoard(doc, context());
  assert.match(initial.currentTask.title, /农业 lv0/);
  assert.equal(initial.clues.length, 3);
  assert.equal(JSON.stringify(initial).includes(doc.missionLore), false);
  assert.equal(
    getEdenMissionBoard(doc, context(-90)).clues.some(clue => clue.id === 'ag0-station'),
    false,
  );
  const acquired = confirmAchievement(
    doc,
    { kind: '技术', branch: '农业', techLevel: 0, name: '万能营养液', evidence: '已取得知识', key: '农业-lv0' },
    context(),
  );
  const board = getEdenMissionBoard(acquired, context(), { 新线索: { 描述: '发现新的资料索引', 状态: '已探索' } });
  assert.match(board.currentTask.title, /自持生产/);
  assert.equal(board.clues.length, 1);
  assert.equal(board.clues[0].description, '发现新的资料索引');
});

test('invalid or ambiguous authoring fails rather than silently changing the saved ability', () => {
  const doc = document();
  doc.level = 5;
  assert.throws(() => EdenDocumentSchema.parse(doc));
  doc.level = 1;
  doc.abilities.heat.effect = '';
  assert.throws(() => EdenDocumentSchema.parse(doc));
});

test('higher modules replace obsolete limits without deleting lower-level definitions', () => {
  const doc = document();
  doc.level = 4;
  doc.abilities['external-power'].conditionConfirmed = true;
  const active = getEdenRuntime(doc, context()).abilities.map(item => item.id);
  assert.equal(active.includes('shower'), false);
  assert.equal(active.includes('hotwater'), true);
  assert.equal(active.includes('food'), false);
  assert.equal(active.includes('gourmet'), true);
  assert.equal(active.includes('heat'), false);
  assert.equal(active.includes('load'), false);
  assert.equal(active.includes('external-power'), true);
  assert.equal('shower' in doc.abilities, true);
  doc.abilities.hotwater.enabled = false;
  assert.equal(
    getEdenRuntime(doc, context()).abilities.some(item => item.id === 'shower'),
    true,
  );
});

test('disaster-only deadline starts on entry for a post-disaster save and is strict beyond 30 days', () => {
  const doc = document();
  assert.equal(getEdenRuntime(doc, context(-2)).rescue.status, '灾前准备');
  assert.equal(getEdenRuntime(doc, context(32)).rescue.overdue, false);
  assert.equal(getEdenRuntime(doc, context(33)).rescue.overdue, true);
  assert.equal(getEdenRuntime(doc, context(33)).abilities.length, 0);
  doc.rescueStartDay = 0;
  assert.equal(getEdenRuntime(doc, context(30)).rescue.overdue, false);
  assert.equal(getEdenRuntime(doc, context(31)).rescue.overdue, true);
});

test('acquisition and production count separately; duplicate IDs cannot reset the deadline', () => {
  let doc = document();
  const achievement = { kind: '技术', key: 'agriculture-0', name: '万能营养液', evidence: '取得存储器并传入知识' };
  doc = confirmAchievement(doc, achievement, context(10));
  assert.equal(getEdenRuntime(doc, context(10)).rescue.lastAchievementDay, 10);
  assert.throws(() => confirmAchievement(doc, achievement, context(20)), /重复/);
  doc = confirmAchievement(doc, { ...achievement, kind: '生产', evidence: '循环种植已实际运行' }, context(20));
  assert.equal(Object.keys(doc.achievements).length, 2);
  assert.equal(getEdenRuntime(doc, context(20)).rescue.lastAchievementDay, 20);
});

test('pre-disaster achievements are recorded but do not advance the catastrophe deadline', () => {
  let doc = document();
  doc.rescueStartDay = 0;
  doc = confirmAchievement(
    doc,
    { kind: '技术', key: 'agriculture-0', name: '营养液', evidence: '灾前取得' },
    context(-5),
  );
  assert.equal(getEdenRuntime(doc, context(1)).rescue.lastAchievementDay, 0);
  assert.equal(getEdenRuntime(doc, context(31)).rescue.overdue, true);
});

test('rolled-back days and message floors cannot expose future confirmed achievements', () => {
  const doc = confirmAchievement(
    document(),
    { kind: '技术', key: 'agriculture-0', name: '营养液', evidence: '已取得' },
    context(20, 40),
  );
  assert.equal(getEdenRuntime(doc, context(19, 40)).achievements.length, 0);
  assert.equal(getEdenRuntime(doc, context(20, 39)).achievements.length, 0);
  assert.equal(getEdenRuntime(doc, context(20, 40)).achievements.length, 1);
});

test('late achievements never automatically restore an already missed deadline', () => {
  let doc = document();
  doc.rescueStartDay = 0;
  doc = confirmAchievement(doc, { kind: '技术', key: 'late', name: '迟来的技术', evidence: '第32天取得' }, context(32));
  assert.equal(getEdenRuntime(doc, context(32)).rescue.overdue, true);
  assert.equal(getEdenRuntime(doc, context(32)).running, false);
  doc.rescueStartDay = 32; // Only explicit player confirmation starts a fresh cycle.
  assert.equal(getEdenRuntime(doc, context(32)).running, true);
});

test('reused numeric floors cannot revive achievements from another story branch', () => {
  const original = buildEdenAnchors([{ message_id: 10, role: 'assistant', message: '找到农业技术' }]);
  const replacement = buildEdenAnchors([{ message_id: 10, role: 'assistant', message: '空手而归' }]);
  const doc = confirmAchievement(
    document(),
    { kind: '技术', key: 'ag0', name: '营养液', evidence: '已取得' },
    { ...context(10), anchors: original },
  );
  assert.equal(getEdenRuntime(doc, { ...context(10), anchors: original }).achievements.length, 1);
  assert.equal(getEdenRuntime(doc, { ...context(10), anchors: replacement }).achievements.length, 0);
});

test('known technology category and level form a stable identity independent of the typed name', () => {
  const input = { kind: '技术', branch: '农业', techLevel: 0, key: '任意', name: '营养液', evidence: '取得知识' };
  const doc = confirmAchievement(document(), input, context(4));
  assert.throws(() => confirmAchievement(doc, { ...input, key: '改名', name: '另一名字' }, context(5)), /重复/);
  assert.throws(() => confirmAchievement(document(), { ...input, techLevel: 6 }, context(5)));
});

test('a technology can be explicitly reconfirmed when its old source floor was rerolled', () => {
  const input = { kind: '技术', key: 'ag0', name: '营养液', evidence: '取得资料' };
  const oldAnchors = buildEdenAnchors([{ message_id: 10, message: '旧剧情取得技术' }]);
  const newAnchors = buildEdenAnchors([{ message_id: 10, message: '新剧情重新取得技术' }]);
  const oldDoc = confirmAchievement(document(), input, { ...context(10), anchors: oldAnchors });
  const reconfirmed = confirmAchievement(
    oldDoc,
    { ...input, evidence: '在新剧情重新取得资料' },
    { ...context(10), anchors: newAnchors },
  );
  assert.equal(Object.keys(reconfirmed.achievements).length, 1);
  assert.equal(getEdenRuntime(reconfirmed, { ...context(10), anchors: newAnchors }).achievements.length, 1);
  assert.throws(() => confirmAchievement(reconfirmed, input, { ...context(10), anchors: newAnchors }), /重复/);
});

test('projection replaces old broad service claims and does not grant every registered room services', () => {
  const doc = document();
  doc.level = 3;
  doc.rooms = ['2002'];
  const stat = { 庇护所: { 庇护所等级: 10, 庇护所能力: { 全域控制: {} }, 接口覆盖等价庇护范围: true } };
  projectEdenToMvu(doc, context(), stat);
  assert.equal(stat.庇护所.庇护所等级, 3);
  assert.deepEqual(stat.庇护所.当前生存庇护范围, {});
  assert.equal(stat.庇护所.接口覆盖等价庇护范围, false);
  assert.equal('全域控制' in stat.庇护所.庇护所能力, false);
});

function harness() {
  let chatId = 'a';
  let entries = [{ uid: 1, name: '[微信-私聊]纪宁', content: '手机原文', extra: { other: true } }];
  let fail = false;
  let binding = null;
  let writes = 0;
  const deps = {
    currentChatId: () => chatId,
    boundWorldbook: () => binding ?? 'book-' + chatId,
    ensureWorldbook: async () => 'book-' + chatId,
    read: async () => structuredClone(entries),
    update: async (_name, updater) => {
      if (fail) throw new Error('写入失败');
      entries = structuredClone(await updater(structuredClone(entries))).map((entry, index) => ({
        uid: index + 1,
        ...entry,
      }));
      writes++;
    },
  };
  return {
    deps,
    entries: () => entries,
    writes: () => writes,
    switchChat: () => {
      chatId = 'b';
    },
    rebind: name => {
      binding = name;
    },
    fail: () => {
      fail = true;
    },
  };
}

test('reading absent config is read-only; confirmation upserts owned entries and preserves phone entries', async () => {
  const h = harness();
  assert.equal(await loadEdenDocument('a', h.deps), null);
  assert.equal(h.writes(), 0);
  const saved = await saveEdenDocument('a', document(), 0, context(), h.deps);
  assert.equal(saved.document.revision, 1);
  assert.equal(h.entries()[0].content, '手机原文');
  assert.equal(h.entries().find(entry => entry.name === EDEN_DOCUMENT_ENTRY).enabled, false);
  const reopened = await loadEdenDocument('a', h.deps);
  assert.deepEqual(reopened.document, saved.document);
  saved.document.abilities.heat.effect = '手动修改的供暖能力';
  const second = await saveEdenDocument('a', saved.document, 1, context(), h.deps);
  assert.equal(second.document.revision, 2);
  assert.equal(h.entries().filter(entry => entry.name === EDEN_DOCUMENT_ENTRY).length, 1);
  assert.equal(
    h.entries().some(entry => entry.content.includes('手动修改的供暖能力')),
    true,
  );
});

test('stale drafts and switched chats cannot overwrite a newer saved document', async () => {
  const h = harness();
  await saveEdenDocument('a', document(), 0, context(), h.deps);
  await assert.rejects(saveEdenDocument('a', document(), 0, context(), h.deps), /版本|更新/);
  h.switchChat();
  await assert.rejects(saveEdenDocument('a', document(), 1, context(), h.deps), /聊天/);
  assert.equal(h.writes(), 1);
});

test('failed write leaves the submitted draft unchanged and no saved config', async () => {
  const h = harness();
  const draft = document();
  h.fail();
  await assert.rejects(saveEdenDocument('a', draft, 0, context(), h.deps), /写入失败/);
  assert.equal(draft.revision, 0);
  assert.equal(await loadEdenDocument('a', h.deps), null);
});

test('same-chat worldbook rebind is rejected even if the revision matches', async () => {
  const h = harness();
  const saved = await saveEdenDocument('a', document(), 0, context(), h.deps);
  h.rebind('book-b');
  await assert.rejects(saveEdenDocument('a', saved.document, 1, context(), h.deps, 'book-a'), /绑定/);
  assert.equal(h.writes(), 1);
});

test('a first write failure reports the self-created binding so the draft can safely retry', async () => {
  let binding = null;
  let fail = true;
  const h = harness();
  const deps = {
    ...h.deps,
    boundWorldbook: () => binding,
    ensureWorldbook: async () => (binding = 'created-a'),
    update: async (...args) => {
      if (fail) throw Error('断网');
      return h.deps.update(...args);
    },
  };
  let created;
  await assert.rejects(saveEdenDocument('a', document(), 0, context(), deps, null), error => {
    created = error.createdWorldbookName;
    return error.message === '断网' && created === 'created-a';
  });
  fail = false;
  const saved = await saveEdenDocument('a', document(), 0, context(), deps, created);
  assert.equal(saved.worldbookName, 'created-a');
});

test('confirmation persists the previewed start day without silent normalization', async () => {
  const h = harness();
  const draft = document();
  draft.rescueStartDay = 8;
  const saved = await saveEdenDocument('a', draft, 0, context(10), h.deps);
  assert.equal(saved.document.rescueStartDay, 8);
});

test('refresh updates runtime deadlines without changing confirmed definitions or version', async () => {
  const h = harness();
  await saveEdenDocument('a', document(), 0, context(), h.deps);
  await refreshEdenEntries('a', context(33), h.deps);
  const loaded = await loadEdenDocument('a', h.deps);
  assert.equal(loaded.document.revision, 1);
  assert.equal(
    h.entries().some(entry => entry.content.includes('救亡逾期')),
    true,
  );
});

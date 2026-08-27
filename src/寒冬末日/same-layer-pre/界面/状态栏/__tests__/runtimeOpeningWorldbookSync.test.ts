import assert from 'node:assert/strict';

import { getRuntimeOpeningDefaultPayload } from '../../../../界面同层版/shared/runtimeOpeningPreset';
import { RuntimeOpeningPresetSchema } from '../../../../界面同层版/shared/runtimeOpeningPreset.schema';
import {
  RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME,
  buildRuntimeOpeningWorldbookEntry,
  syncRuntimeOpeningWorldbook,
  type RuntimeOpeningWorldbookDeps,
} from '../runtimeOpeningWorldbookSync';

const preset = RuntimeOpeningPresetSchema.parse({
  version: 2,
  preset_id: 'chat-worldbook-test',
  ui: { title: '聊天开局', intro: '', submit_label: '生成开局' },
  meta_template: { character_label: '主角', time_label: '时间', location_label: '地点' },
  default_meta: { character: '林秋', time: '冬至', location: '山门' },
  fields: [
    {
      key: 'path',
      label: '道路',
      kind: 'select',
      required: true,
      options: ['太和', '天欲'],
      placeholder: '',
      default_value: '太和',
    },
  ],
  prompt: { task: '从山门冲突开始', directives: ['保持选择有效'], forbidden: ['不得替玩家行动'] },
  output: { content_tag: 'content', option_tag: 'option', option_count: 4 },
});

const payload = getRuntimeOpeningDefaultPayload(preset);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createHarness(initialEntries: any[] = []) {
  let chatId = 'chat-a';
  let entries = clone(initialEntries);
  let creates = 0;
  let updates = 0;
  const deps: RuntimeOpeningWorldbookDeps = {
    getCurrentChatId: () => chatId,
    getOrCreateChatWorldbook: async () => 'chat-a-worldbook',
    getWorldbook: async () => clone(entries),
    updateWorldbookWith: async (_name, updater) => {
      updates += 1;
      entries = clone(await updater(clone(entries)));
      return entries;
    },
    createWorldbookEntries: async (_name, newEntries) => {
      creates += 1;
      entries.push({ uid: 100 + entries.length, ...clone(newEntries[0]) });
      return { worldbook: clone(entries), new_entries: [clone(entries.at(-1))] };
    },
  };
  return {
    deps,
    get entries() {
      return entries;
    },
    get creates() {
      return creates;
    },
    get updates() {
      return updates;
    },
    setChatId(value: string) {
      chatId = value;
    },
  };
}

async function main() {
  const entry = buildRuntimeOpeningWorldbookEntry(preset, payload);
  assert.equal(entry.name, RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME);
  assert.equal(entry.name, '[同层PRE]自定义开局上下文');
  assert.equal(entry.enabled, true);
  assert.deepEqual(entry.strategy, {
    type: 'constant',
    keys: [],
    keys_secondary: { logic: 'and_any', keys: [] },
    scan_depth: 'same_as_global',
  });
  assert.deepEqual(entry.position, {
    type: 'before_character_definition',
    role: 'system',
    depth: 4,
    order: 90,
  });
  assert.equal(entry.probability, 100);
  assert.deepEqual(entry.recursion, {
    prevent_incoming: true,
    prevent_outgoing: true,
    delay_until: null,
  });
  assert.match(entry.content, /道路：太和/);

  const created = createHarness();
  const createResult = await syncRuntimeOpeningWorldbook({ expectedChatId: 'chat-a', preset, payload }, created.deps);
  assert.equal(createResult.worldbookName, 'chat-a-worldbook');
  assert.equal(created.creates, 1);
  assert.equal(created.updates, 0);
  assert.equal(created.entries[0].name, RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME);

  const unrelated = { uid: 1, name: '其他条目', enabled: false, content: '保持原样', extra: { owner: 'user' } };
  const existing = { uid: 2, name: RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME, enabled: false, content: '旧内容' };
  const duplicate = { uid: 3, name: RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME, enabled: true, content: '重复内容' };
  const updated = createHarness([unrelated, existing, duplicate]);
  payload.form_values.path = '天欲';
  await syncRuntimeOpeningWorldbook({ expectedChatId: 'chat-a', preset, payload }, updated.deps);
  assert.equal(updated.creates, 0);
  assert.equal(updated.updates, 1);
  assert.deepEqual(
    updated.entries.find(item => item.name === '其他条目'),
    unrelated,
  );
  const owned = updated.entries.filter(item => item.name === RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].uid, 2);
  assert.equal(owned[0].enabled, true);
  assert.match(owned[0].content, /道路：天欲/);

  const switched = createHarness();
  switched.deps.getOrCreateChatWorldbook = async () => {
    switched.setChatId('chat-b');
    return 'chat-a-worldbook';
  };
  await assert.rejects(
    syncRuntimeOpeningWorldbook({ expectedChatId: 'chat-a', preset, payload }, switched.deps),
    /当前聊天已切换/,
  );
  assert.equal(switched.creates, 0);
  assert.equal(switched.updates, 0);

  const switchedDuringWrite = createHarness();
  const createEntry = switchedDuringWrite.deps.createWorldbookEntries;
  switchedDuringWrite.deps.createWorldbookEntries = async (...args) => {
    const result = await createEntry(...args);
    switchedDuringWrite.setChatId('chat-b');
    return result;
  };
  await assert.rejects(
    syncRuntimeOpeningWorldbook({ expectedChatId: 'chat-a', preset, payload }, switchedDuringWrite.deps),
    /当前聊天已切换/,
  );
  assert.equal(
    switchedDuringWrite.creates,
    1,
    'captured old-chat worldbook write may finish before the switch is observed',
  );

  console.log('runtime opening worldbook sync tests passed');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

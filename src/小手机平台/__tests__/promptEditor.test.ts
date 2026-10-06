import assert from 'node:assert/strict';
import {
  defaultPromptSettings,
  validatePromptSettings,
  renderPromptTemplate,
  loadPromptSettings,
  savePromptSettings,
} from '../ai/promptTemplates';
import { PROMPT_DEFINITIONS } from '../ai/promptCatalog';
const storage = (() => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
})();
const settings = defaultPromptSettings();
assert.ok(PROMPT_DEFINITIONS.length >= 15);
for (const group of ['微信', '人物档案', '广播', '智能任务'])
  assert.ok(PROMPT_DEFINITIONS.some(item => item.group === group));
const definition = PROMPT_DEFINITIONS.find(item => item.id === 'chat.prefill')!;
settings.overrides[definition.id] = { text: '回复：{{playerMessage}}', enabled: true };
assert.equal(
  renderPromptTemplate(definition.id, { playerMessage: '{{replyAs}}', replyAs: '纪宁' }, settings),
  '回复：{{replyAs}}',
);
assert.throws(
  () => validatePromptSettings({ ...settings, overrides: { 'not-real': { text: '坏', enabled: true } } }),
  /未知/,
);
assert.throws(
  () => validatePromptSettings({ ...settings, overrides: { 'chat.prefill': { text: '{{unknown}}', enabled: true } } }),
  /变量/,
);
assert.throws(
  () =>
    validatePromptSettings({ ...settings, context: { ...settings.context, protectedHistory: 100, historyCount: 30 } }),
  /保护/,
);
savePromptSettings(settings, storage, '甲');
assert.equal(loadPromptSettings(storage, '甲').overrides[definition.id].text, '回复：{{playerMessage}}');
assert.deepEqual(loadPromptSettings(storage, '乙').overrides, {});
assert.throws(() => savePromptSettings({ ...settings, version: 99 } as any, storage, '甲'), /版本/);
assert.equal(loadPromptSettings(storage, '甲').overrides[definition.id].text, '回复：{{playerMessage}}');
console.log('prompt editor tests passed');

assert.throws(
  () => validatePromptSettings({ ...settings, context: { ...settings.context, storyCharacters: 200 } }),
  /600/,
);
assert.throws(
  () => validatePromptSettings({ ...settings, overrides: { 'chat.history': { text: '缺少历史', enabled: true } } }),
  /wechat/,
);
assert.throws(
  () =>
    savePromptSettings(
      settings,
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      },
      '甲',
    ),
  /quota/,
);

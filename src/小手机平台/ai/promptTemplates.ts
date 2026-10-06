import { getPhoneTopWindow } from '../core/register';
import { PROMPT_DEFINITIONS } from './promptCatalog';
export interface PromptSettings {
  version: 1;
  overrides: Record<string, { text: string; enabled: boolean }>;
  context: {
    maxCharacters: number;
    historyCount: number;
    protectedHistory: number;
    storyCount: number;
    storyCharacters: number;
  };
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function defaultPromptSettings(): PromptSettings {
  return {
    version: 1,
    overrides: {},
    context: { maxCharacters: 32000, historyCount: 30, protectedHistory: 16, storyCount: 5, storyCharacters: 1600 },
  };
}
export function getPromptScope(): string {
  try {
    const owner = getPhoneTopWindow().TavernPhone?.getOwner();
    if (owner?.characterName) return owner.characterName;
  } catch {
    /* Node tests do not have a top window. */
  }
  try {
    return typeof SillyTavern !== 'undefined' && SillyTavern.name2 ? SillyTavern.name2 : '默认角色';
  } catch {
    return '默认角色';
  }
}
const key = (scope: string) => 'tavern-phone:prompts:v1:' + encodeURIComponent(scope);
export function validatePromptSettings(value: unknown): PromptSettings {
  const s = value as PromptSettings;
  if (!s || s.version !== 1) throw new Error('不支持的提示词配置版本');
  if (!s.context || !s.overrides || typeof s.overrides !== 'object' || Array.isArray(s.overrides))
    throw new Error('配置结构不完整');
  const ranges: Record<string, [number, number]> = {
    maxCharacters: [4000, 200000],
    historyCount: [1, 200],
    protectedHistory: [0, 200],
    storyCount: [1, 50],
    storyCharacters: [600, 20000],
  };
  for (const [name, [min, max]] of Object.entries(ranges)) {
    const n = s.context[name as keyof typeof s.context];
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(name + ' 应为 ' + min + '～' + max + ' 的整数');
  }
  if (s.context.protectedHistory > s.context.historyCount) throw new Error('保护条数不能超过读取历史条数');
  for (const [id, override] of Object.entries(s.overrides)) {
    const d = PROMPT_DEFINITIONS.find(x => x.id === id);
    if (!d) throw new Error('未知提示词：' + id);
    if (
      !override ||
      typeof override.text !== 'string' ||
      typeof override.enabled !== 'boolean' ||
      override.text.length > 100000
    )
      throw new Error('提示词格式或长度无效：' + d.title);
    if (!d.canDisable && (!override.enabled || !override.text.trim())) throw new Error(d.title + ' 不能为空或关闭');
    for (const match of override.text.matchAll(/{{([a-zA-Z]\w*)}}/g))
      if (!(match[1] in d.tokens)) throw new Error('未知变量：' + match[1]);
    const required: Record<string, string[]> = {
      'chat.rules': ['protocol'],
      'chat.members': ['members', 'mvu'],
      'chat.history': ['wechat'],
      'chat.output': ['outputContract'],
      'retry.body': ['originalPrompt'],
      'profile.body': ['outputContract', 'personId', 'mvuFacts', 'evidenceRefs'],
      'broadcast.body': ['value1'],
      'tasks.body': ['wechat'],
      'enhance.body': ['personName'],
    };
    for (const token of required[id] ?? [])
      if (!override.text.includes('{{' + token + '}}')) throw new Error(d.title + ' 必须保留变量 {{' + token + '}}');
  }
  return JSON.parse(JSON.stringify(s));
}
export function loadPromptSettings(storage: StorageLike = localStorage, scope = getPromptScope()): PromptSettings {
  const raw = storage.getItem(key(scope));
  return raw ? validatePromptSettings(JSON.parse(raw)) : defaultPromptSettings();
}
export function savePromptSettings(
  value: unknown,
  storage: StorageLike = localStorage,
  scope = getPromptScope(),
): void {
  const valid = validatePromptSettings(value);
  storage.setItem(key(scope), JSON.stringify(valid));
}
export function getPromptSettings(): PromptSettings {
  try {
    return loadPromptSettings();
  } catch {
    return defaultPromptSettings();
  }
}
export function renderPromptTemplate(
  id: string,
  values: Record<string, unknown> = {},
  settings: PromptSettings = getPromptSettings(),
): string {
  const d = PROMPT_DEFINITIONS.find(x => x.id === id);
  if (!d) throw new Error('未知提示词：' + id);
  const override = settings.overrides[id];
  if (d.canDisable && override?.enabled === false) return '';
  return (override?.text ?? d.text).replace(/{{([a-zA-Z]\w*)}}/g, (_, name) => String(values[name] ?? ''));
}

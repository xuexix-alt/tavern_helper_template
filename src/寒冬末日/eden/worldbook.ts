import {
  EdenDocumentSchema,
  describeEden,
  describeRescue,
  describeTechnologies,
  type EdenContext,
  type EdenDocument,
} from './model';
import type { PartialDeep } from 'type-fest';

export const EDEN_DOCUMENT_ENTRY = '[伊甸设定]等级与能力';
export const EDEN_ENTRY_NAMES = [
  EDEN_DOCUMENT_ENTRY,
  '当前伊甸',
  '当前救亡任务',
  '当前伊甸技术',
  '[伊甸设定]末日救亡任务',
  '[伊甸设定]伊甸技术',
] as const;
type EdenEntry = Omit<WorldbookEntry, 'uid'> & { uid?: number };
export interface EdenWorldbookDeps {
  currentChatId(): string | null;
  boundWorldbook(): string | null;
  ensureWorldbook(): Promise<string>;
  read(name: string): Promise<WorldbookEntry[]>;
  update(name: string, updater: (entries: WorldbookEntry[]) => PartialDeep<WorldbookEntry>[]): Promise<unknown>;
}
export type SavedEden = { document: EdenDocument; worldbookName: string };

export class EdenWorldbookSaveError extends Error {
  constructor(
    message: string,
    public readonly createdWorldbookName: string,
  ) {
    super(message);
  }
}

function assertChat(chatId: string, deps: EdenWorldbookDeps, worldbookName?: string): void {
  if (!chatId || deps.currentChatId() !== chatId) throw new Error('当前聊天已切换，已终止伊甸世界书操作');
  if (worldbookName && deps.boundWorldbook() !== worldbookName) throw new Error('聊天绑定世界书已变更，请重新载入');
}

export function readEdenDocument(entries: readonly PartialDeep<WorldbookEntry>[]): EdenDocument | null {
  const entry = entries.find(item => item.name === EDEN_DOCUMENT_ENTRY && item.extra?.eden?.owner === 'eden-editor-v1');
  if (!entry) return null;
  return EdenDocumentSchema.parse(entry.extra?.eden?.document);
}

export function renderEdenEntries(document: EdenDocument, context: EdenContext): EdenEntry[] {
  const catalog = [
    '<伊甸等级与能力设定>',
    ...document.levelNames.map((name, i) => `${i + 1}级：${name}`),
    ...Object.entries(document.abilities).map(
      ([id, item]) =>
        `${id}｜${item.name}｜${item.group}｜${item.level}级\n效果：${item.effect}\n限制：${item.limit || '无额外限制'}\n条件：${item.condition || '等级达标'}；确认：${item.conditionConfirmed ? '是' : '否'}；启用：${item.enabled ? '是' : '否'}\n替代：${item.replaces.join('、') || '无'}`,
    ),
    '</伊甸等级与能力设定>',
  ].join('\n');
  const contents = [
    catalog,
    describeEden(document, context),
    describeRescue(document, context),
    describeTechnologies(document, context),
    document.missionLore,
    context.day !== null && context.day < 0
      ? document.technologyLore
          .split(/\r?\n/)
          .filter(line => !(/线索B/.test(line) && /灾后/.test(line)))
          .join('\n')
      : document.technologyLore,
  ];
  return EDEN_ENTRY_NAMES.map((name, index) => ({
    name,
    enabled: index !== 0,
    content: contents[index],
    strategy: {
      type: 'constant',
      keys: [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: { type: 'at_depth', role: 'system', depth: 1, order: 40 + index },
    probability: 100,
    recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
    effect: { sticky: null, cooldown: null, delay: null },
    extra: {
      eden: { owner: 'eden-editor-v1', kind: index, ...(index === 0 ? { document: structuredClone(document) } : {}) },
    },
  }));
}

function mergeEntries(entries: WorldbookEntry[], next: EdenEntry[]): PartialDeep<WorldbookEntry>[] {
  const byName = new Map(next.map(entry => [entry.name, entry]));
  const seen = new Set<string>();
  const merged = entries.flatMap(entry => {
    const replacement = byName.get(entry.name);
    if (!replacement) return [entry];
    if (entry.extra?.eden?.owner !== 'eden-editor-v1')
      throw new Error(`世界书已有同名非伊甸条目“${entry.name}”，请先重命名后再保存`);
    if (seen.has(entry.name)) return [];
    seen.add(entry.name);
    return [{ ...entry, ...replacement, uid: entry.uid, extra: { ...entry.extra, ...replacement.extra } }];
  });
  return [...merged, ...next.filter(entry => !seen.has(entry.name))];
}

export async function loadEdenDocument(chatId: string, deps: EdenWorldbookDeps): Promise<SavedEden | null> {
  assertChat(chatId, deps);
  const worldbookName = deps.boundWorldbook();
  if (!worldbookName) return null;
  const entries = await deps.read(worldbookName);
  assertChat(chatId, deps, worldbookName);
  const document = readEdenDocument(entries);
  return document ? { document, worldbookName } : null;
}

// 同一运行上下文内串行写入，异步 await 后重新检查聊天和绑定，updater 中重新检查版本。
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

export function saveEdenDocument(
  chatId: string,
  draft: EdenDocument,
  expectedRevision: number,
  context: EdenContext,
  deps: EdenWorldbookDeps,
  expectedWorldbookName: string | null = deps.boundWorldbook(),
): Promise<SavedEden> {
  const parsed = EdenDocumentSchema.parse(structuredClone(draft));
  return enqueue(async () => {
    assertChat(chatId, deps);
    if (deps.boundWorldbook() !== expectedWorldbookName) throw new Error('聊天绑定世界书已变更，请重新载入后再确认');
    const worldbookName = deps.boundWorldbook() ?? (await deps.ensureWorldbook());
    assertChat(chatId, deps, worldbookName);
    const document = EdenDocumentSchema.parse({
      ...parsed,
      revision: expectedRevision + 1,
      savedAt: new Date().toISOString(),
    });
    try {
      await deps.update(worldbookName, entries => {
        assertChat(chatId, deps, worldbookName);
        const current = readEdenDocument(entries);
        if ((current?.revision ?? 0) !== expectedRevision)
          throw new Error('世界书版本已有更新，请先重新载入，避免覆盖其他修改');
        return mergeEntries(entries, renderEdenEntries(document, context));
      });
    } catch (error) {
      if (
        expectedWorldbookName === null &&
        deps.currentChatId() === chatId &&
        deps.boundWorldbook() === worldbookName
      ) {
        throw new EdenWorldbookSaveError(error instanceof Error ? error.message : String(error), worldbookName);
      }
      throw error;
    }
    assertChat(chatId, deps, worldbookName);
    return { document, worldbookName };
  });
}

export function refreshEdenEntries(
  chatId: string,
  context: EdenContext,
  deps: EdenWorldbookDeps,
): Promise<SavedEden | null> {
  return enqueue(async () => {
    const loaded = await loadEdenDocument(chatId, deps);
    if (!loaded) return null;
    const next = renderEdenEntries(loaded.document, context);
    const entries = await deps.read(loaded.worldbookName);
    assertChat(chatId, deps, loaded.worldbookName);
    if (
      next.every(entry =>
        entries.some(
          current =>
            current.name === entry.name && current.enabled === entry.enabled && current.content === entry.content,
        ),
      )
    )
      return loaded;
    let confirmedDocument = loaded.document;
    await deps.update(loaded.worldbookName, current => {
      assertChat(chatId, deps, loaded.worldbookName);
      const latest = readEdenDocument(current);
      if (!latest) throw new Error('伊甸设定已被删除，请重新载入');
      confirmedDocument = latest;
      return mergeEntries(current, renderEdenEntries(latest, context));
    });
    assertChat(chatId, deps, loaded.worldbookName);
    return { document: confirmedDocument, worldbookName: loaded.worldbookName };
  });
}

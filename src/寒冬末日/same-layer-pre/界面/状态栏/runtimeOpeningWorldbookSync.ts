import type { OpeningPayload } from '../../../界面同层版/shared/opening.schema';
import { buildRuntimeOpeningLoreContent } from '../../../界面同层版/shared/runtimeOpeningPresetTransfer';
import type { RuntimeOpeningPreset } from '../../../界面同层版/shared/runtimeOpeningPreset.schema';

export const RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME = '[同层PRE]自定义开局上下文';

export interface RuntimeOpeningWorldbookDeps {
  getCurrentChatId(): string | null;
  getOrCreateChatWorldbook(chat: 'current'): Promise<string>;
  getWorldbook(name: string): Promise<WorldbookEntry[]>;
  updateWorldbookWith(name: string, updater: WorldbookUpdater, options: { render: 'debounced' }): Promise<unknown>;
  createWorldbookEntries(
    name: string,
    entries: PartialDeep<WorldbookEntry>[],
    options: { render: 'debounced' },
  ): Promise<unknown>;
}

export function buildRuntimeOpeningWorldbookEntry(preset: RuntimeOpeningPreset, payload: OpeningPayload) {
  return {
    name: RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME,
    enabled: true,
    strategy: {
      type: 'constant' as const,
      keys: [],
      keys_secondary: { logic: 'and_any' as const, keys: [] },
      scan_depth: 'same_as_global' as const,
    },
    position: {
      type: 'before_character_definition' as const,
      role: 'system' as const,
      depth: 4,
      order: 90,
    },
    content: buildRuntimeOpeningLoreContent(preset, payload),
    probability: 100,
    recursion: {
      prevent_incoming: true,
      prevent_outgoing: true,
      delay_until: null,
    },
    effect: {
      sticky: null,
      cooldown: null,
      delay: null,
    },
    extra: {
      same_layer_pre: {
        kind: 'runtime_opening_context',
        format_version: 1,
      },
    },
  };
}

function assertCurrentChat(expectedChatId: string, deps: RuntimeOpeningWorldbookDeps): void {
  if (!expectedChatId || deps.getCurrentChatId() !== expectedChatId) {
    throw new Error('当前聊天已切换，已终止开局世界书同步');
  }
}

export async function syncRuntimeOpeningWorldbook(
  input: { expectedChatId: string; preset: RuntimeOpeningPreset; payload: OpeningPayload },
  deps: RuntimeOpeningWorldbookDeps,
): Promise<{ worldbookName: string }> {
  assertCurrentChat(input.expectedChatId, deps);
  const worldbookName = await deps.getOrCreateChatWorldbook('current');
  assertCurrentChat(input.expectedChatId, deps);
  const entries = await deps.getWorldbook(worldbookName);
  assertCurrentChat(input.expectedChatId, deps);

  const nextEntry = buildRuntimeOpeningWorldbookEntry(input.preset, input.payload);
  if (!entries.some(entry => entry.name === RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME)) {
    await deps.createWorldbookEntries(worldbookName, [nextEntry], { render: 'debounced' });
    assertCurrentChat(input.expectedChatId, deps);
    return { worldbookName };
  }

  await deps.updateWorldbookWith(
    worldbookName,
    current => {
      let replaced = false;
      return current.flatMap(entry => {
        if (entry.name !== RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME) return [entry];
        if (replaced) return [];
        replaced = true;
        return [{ ...entry, ...nextEntry }];
      });
    },
    { render: 'debounced' },
  );
  assertCurrentChat(input.expectedChatId, deps);
  return { worldbookName };
}

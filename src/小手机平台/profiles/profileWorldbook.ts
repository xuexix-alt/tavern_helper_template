import { renderPromptProfile } from './profileAnalysis';
import type { DynamicProfileDocument } from './profileTypes';

export interface ProfileWorldbookEntry {
  uid?: number;
  name: string;
  enabled: boolean;
  content: string;
  strategy: {
    type: 'selective';
    keys: string[];
    keys_secondary: { logic: 'and_any'; keys: string[] };
    scan_depth: 'same_as_global';
  };
  position: {
    type: 'before_character_definition';
    role: 'system';
    depth: number;
    order: number;
  };
  probability: number;
  recursion: { prevent_incoming: boolean; prevent_outgoing: boolean; delay_until: null };
  effect: { sticky: null; cooldown: null; delay: null };
  extra: Record<string, unknown>;
}

export interface ReadDynamicProfileEntry {
  content: string;
  document: DynamicProfileDocument;
  entry: ProfileWorldbookEntry;
}

export function dynamicProfileEntryName(personId: string): string {
  const normalized = personId.trim();
  if (!normalized) throw new Error('人物档案条目缺少 personId');
  return `[人物动态]${normalized}`;
}

export function buildDynamicProfileEntry(
  document: DynamicProfileDocument,
  aliases: readonly string[],
  maxCharacters: number,
): Omit<ProfileWorldbookEntry, 'uid'> {
  const keys = [...new Set([document.personName, ...aliases].map(item => item.trim()).filter(Boolean))];
  if (keys.length === 0) throw new Error('人物档案条目至少需要一个绿色关键词');
  return {
    name: dynamicProfileEntryName(document.personId),
    enabled: true,
    content: renderPromptProfile(document, maxCharacters),
    strategy: {
      type: 'selective',
      keys,
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: { type: 'before_character_definition', role: 'system', depth: 4, order: 101 },
    probability: 100,
    recursion: { prevent_incoming: false, prevent_outgoing: true, delay_until: null },
    effect: { sticky: null, cooldown: null, delay: null },
    extra: {
      tavernPhoneKind: 'dynamic-profile',
      personId: document.personId,
      schemaVersion: 1,
      dynamicProfileDocument: structuredClone(document),
    },
  };
}

function isDynamicProfileDocument(value: unknown, personId: string): value is DynamicProfileDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<DynamicProfileDocument>;
  return candidate.version === 1 && candidate.personId === personId && typeof candidate.sessionKey === 'string';
}

export function readDynamicProfileEntry(
  personId: string,
  entries: readonly ProfileWorldbookEntry[],
): ReadDynamicProfileEntry | undefined {
  const entry = entries.find(item => item.name === dynamicProfileEntryName(personId));
  if (!entry) return undefined;
  const document = entry.extra?.dynamicProfileDocument;
  if (!isDynamicProfileDocument(document, personId)) return undefined;
  return { content: entry.content, document, entry };
}

export interface DynamicProfileWorldbookWriter {
  read(worldbookName: string): Promise<ProfileWorldbookEntry[]>;
  update(worldbookName: string, updater: (entries: ProfileWorldbookEntry[]) => ProfileWorldbookEntry[]): Promise<void>;
  assertSession(): void;
}

export async function writeDynamicProfileEntry(
  worldbookName: string,
  document: DynamicProfileDocument,
  aliases: readonly string[],
  maxCharacters: number,
  writer: DynamicProfileWorldbookWriter,
): Promise<void> {
  writer.assertSession();
  const next = buildDynamicProfileEntry(document, aliases, maxCharacters);
  await writer.update(worldbookName, entries => {
    const index = entries.findIndex(item => item.name === next.name);
    if (index < 0) return [...entries, next];
    return entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...next, uid: entry.uid } : entry));
  });
  writer.assertSession();
}

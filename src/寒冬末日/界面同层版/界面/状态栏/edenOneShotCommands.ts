import taskDocRaw from '../../../世界书/寒冬末日/主线任务-星穹秩序.txt?raw';

export type EdenOneShotCommandMeta = {
  id: string;
  name: string;
  scope: string;
  description: string;
  duration: string;
  category: string;
};

export type EdenOneShotCommandDisplayEntry = {
  key: string;
  name: string;
  quantity: number;
  description: string;
  scope: string;
  duration: string;
  category: string;
};

const CATEGORY_TITLES = ['认知修改类', '时空修改类', '战斗修改类', '属性修改类'];
const CATEGORY_ORDER = ['认知修改类', '时空修改类', '战斗修改类', '属性修改类', '未分类'];

function categoryRank(category: string): number {
  const index = CATEGORY_ORDER.indexOf(String(category ?? '').trim());
  return index >= 0 ? index : CATEGORY_ORDER.length;
}

function parseCommandLine(line: string, category: string): EdenOneShotCommandMeta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('编号')) return null;

  const match = trimmed.match(
    /^编号(?<id>[a-z]{2}\d{3})-名称：(?<name>.+?)-范围：(?<scope>.+?)-作用：(?<description>.+?)-\s*时效：(?<duration>.+)$/u,
  );
  if (!match?.groups) return null;

  return {
    id: String(match.groups.id ?? '').trim(),
    name: String(match.groups.name ?? '').trim(),
    scope: String(match.groups.scope ?? '').trim(),
    description: String(match.groups.description ?? '').trim(),
    duration: String(match.groups.duration ?? '').trim(),
    category,
  };
}

function parseEdenOneShotCommands(raw: string): Record<string, EdenOneShotCommandMeta> {
  const lines = raw.split(/\r?\n/);
  const result: Record<string, EdenOneShotCommandMeta> = {};
  let currentCategory = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const categoryTitle = CATEGORY_TITLES.find(title => trimmed.startsWith(`${title}：`));
    if (categoryTitle) {
      currentCategory = categoryTitle;
      continue;
    }

    const parsed = parseCommandLine(trimmed, currentCategory);
    if (parsed) result[parsed.id] = parsed;
  }

  return result;
}

export const edenOneShotCommandMetaMap = parseEdenOneShotCommands(taskDocRaw);

export function getEdenOneShotCommandMeta(id: string): EdenOneShotCommandMeta | null {
  const normalizedId = String(id ?? '').trim();
  if (!normalizedId) return null;
  return edenOneShotCommandMetaMap[normalizedId] ?? null;
}

function normalizeQuantity(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function buildEdenCommandDisplayEntries(raw: unknown): EdenOneShotCommandDisplayEntry[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];

  return Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => {
      const normalizedKey = String(key ?? '').trim();
      if (!normalizedKey) return null;

      const meta = getEdenOneShotCommandMeta(normalizedKey);
      const legacyQuantity = normalizeQuantity(value);

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        return {
          key: normalizedKey,
          name: String(record.名称 ?? '').trim() || meta?.name || normalizedKey,
          quantity: normalizeQuantity(record.数量),
          description: String(record.说明 ?? '').trim() || meta?.description || '',
          scope: String(record.范围 ?? '').trim() || meta?.scope || '',
          duration: String(record.时效 ?? '').trim() || meta?.duration || '',
          category: meta?.category || '未分类',
        };
      }

      return {
        key: normalizedKey,
        name: meta?.name || normalizedKey,
        quantity: legacyQuantity,
        description: meta?.description || '',
        scope: meta?.scope || '',
        duration: meta?.duration || '',
        category: meta?.category || '未分类',
      };
    })
    .filter((entry): entry is EdenOneShotCommandDisplayEntry => Boolean(entry))
    .sort((a, b) => {
      const availableDiff = Number(b.quantity > 0) - Number(a.quantity > 0);
      if (availableDiff !== 0) return availableDiff;
      if (a.quantity !== b.quantity) return b.quantity - a.quantity;
      if (a.category !== b.category) return categoryRank(a.category) - categoryRank(b.category);
      return (a.name || a.key).localeCompare(b.name || b.key, 'zh-Hans-CN');
    });
}

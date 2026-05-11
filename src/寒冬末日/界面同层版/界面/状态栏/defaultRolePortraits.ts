import type { ReaderGalleryEntry } from './types';

/**
 * 默认立绘条目。
 *
 * 说明：
 * - 这份清单是"未匹配到任何画廊/玩家覆盖时"出现在角色背面的占位立绘。
 * - 故意使用远程 URL（catbox 图床）而不是 `?url` inline 资源，
 *   是因为每张 JPG 尺寸明显大于现有 `opening-modal-icon.webp`（单图接近 100 KB 级别），
 *   全部 inline 会让同层 bundle 膨胀数 MB，显著拖慢 iframe 启动；
 *   远程加载 + `loading="lazy"` 可以把这些图的成本推到"翻到背面才去取"。
 * - 命中规则走的是现有 `rolePortraits.ts` 的名字别名链路（见 PROJECT_ROLE_NAME_ALIASES），
 *   这里只需要用角色主名（中文姓名）即可。
 */
export type DefaultRolePortraitVariant = 'anime' | 'realistic' | 'realistic_alt';

export type DefaultRolePortraitSource = {
  variant: DefaultRolePortraitVariant;
  url: string;
  label: string;
};

export type DefaultRolePortraitRecipe = {
  /** 与 MVU 中角色 `姓名` 字段对得上的主键（通常是中文姓名）。 */
  roleName: string;
  sources: DefaultRolePortraitSource[];
};

const DEFAULT_ROLE_PORTRAIT_RECIPES: DefaultRolePortraitRecipe[] = [
  {
    roleName: '林月华',
    sources: [
      { variant: 'anime', url: 'https://files.catbox.moe/q23grw.jpg', label: '动漫设定图' },
      { variant: 'realistic', url: 'https://files.catbox.moe/pmwb24.jpg', label: '真人设定图' },
    ],
  },
  {
    roleName: '凌音',
    sources: [
      { variant: 'anime', url: 'https://files.catbox.moe/clstrs.jpg', label: '动漫设定图' },
      { variant: 'realistic', url: 'https://files.catbox.moe/g5wbi3.jpg', label: '真人设定图' },
    ],
  },
  {
    roleName: '慕小小',
    sources: [
      { variant: 'anime', url: 'https://files.catbox.moe/np88e0.jpg', label: '动漫设定图' },
      { variant: 'realistic', url: 'https://files.catbox.moe/qwfs4j.jpg', label: '真人设定图' },
      { variant: 'realistic_alt', url: 'https://files.catbox.moe/7jgkda.jpg', label: '真人变色设定图' },
    ],
  },
  {
    roleName: '雪乃',
    sources: [
      { variant: 'anime', url: 'https://files.catbox.moe/nwnufb.jpg', label: '动漫设定图' },
      { variant: 'realistic', url: 'https://files.catbox.moe/vxtqkp.jpg', label: '真人设定图' },
    ],
  },
  {
    roleName: '佐伯惠理',
    sources: [
      { variant: 'anime', url: 'https://files.catbox.moe/gav71r.jpg', label: '动漫设定图' },
      { variant: 'realistic', url: 'https://files.catbox.moe/411fkg.jpg', label: '真人设定图' },
    ],
  },
  {
    roleName: '佐伯诗织',
    sources: [
      { variant: 'anime', url: 'https://files.catbox.moe/dm5b4e.jpg', label: '动漫设定图' },
      { variant: 'realistic', url: 'https://files.catbox.moe/n4656v.jpg', label: '真人设定图' },
    ],
  },
  {
    roleName: '纪宁',
    sources: [
      { variant: 'anime', url: 'https://files.catbox.moe/evqhhf.jpg', label: '动漫设定图' },
      { variant: 'realistic', url: 'https://files.catbox.moe/mj3j1y.jpg', label: '真人设定图' },
    ],
  },
];

/**
 * 默认立绘条目在 `ReaderGalleryEntry` 形状里的稳定 messageId。
 *
 * 用一个 UI 不会自然到达的负数，避免把"默认图"误当作真实楼层生成的画廊条目。
 */
const DEFAULT_ROLE_PORTRAIT_VIRTUAL_MESSAGE_ID = -1;

function normalizeName(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function buildDefaultEntry(roleName: string, source: DefaultRolePortraitSource, index: number): ReaderGalleryEntry {
  const id = `default::${roleName}::${source.variant}`;
  return {
    id,
    messageId: DEFAULT_ROLE_PORTRAIT_VIRTUAL_MESSAGE_ID,
    promptToken: `default:${source.variant}`,
    title: `${roleName} ${source.label}`,
    characterName: roleName,
    createdOrder: index,
    src: source.url,
    alt: `${roleName} ${source.label}`,
  } as ReaderGalleryEntry;
}

const DEFAULT_ROLE_PORTRAIT_INDEX: Map<string, ReaderGalleryEntry[]> = (() => {
  const map = new Map<string, ReaderGalleryEntry[]>();
  for (const recipe of DEFAULT_ROLE_PORTRAIT_RECIPES) {
    const entries = recipe.sources.map((source, index) => buildDefaultEntry(recipe.roleName, source, index));
    map.set(normalizeName(recipe.roleName), entries);
  }
  return map;
})();

/**
 * 依次按角色候选名查表（label/key 都会传进来，`rolePortraits.ts` 那边做的名字别名由调用方保留）。
 */
export function findDefaultRolePortraitEntries(
  ...roleNameCandidates: Array<string | null | undefined>
): ReaderGalleryEntry[] {
  for (const candidate of roleNameCandidates) {
    const normalized = normalizeName(candidate);
    if (!normalized) continue;
    const hit = DEFAULT_ROLE_PORTRAIT_INDEX.get(normalized);
    if (hit && hit.length > 0) return hit;
  }
  return [];
}

export function listDefaultRolePortraitRoleNames(): string[] {
  return DEFAULT_ROLE_PORTRAIT_RECIPES.map(recipe => recipe.roleName);
}

export function isDefaultRolePortraitEntryId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith('default::');
}

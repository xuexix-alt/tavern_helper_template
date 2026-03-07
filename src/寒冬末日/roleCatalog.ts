export type RoleCatalogItem = {
  name: string;
  identity: string;
  summary: string;
  location: string;
  aliases?: string[];
  defaultSelected?: boolean;
};

export const ROLE_CATALOG: RoleCatalogItem[] = [
  {
    name: '纪宁',
    identity: '邻家护士 / 新婚妻子',
    summary: '高同理与高边界并存，擅长危机沟通与卫生隔离，重视尊严与同意。',
    location: '楼层20/2002',
    aliases: ['亚美', '护士亚美'],
  },
  {
    name: '陈宇',
    identity: '理性观察者 / 纪宁丈夫',
    summary: '冷静务实，偏工程与分析思维，在混乱环境中擅长建立秩序。',
    location: '楼层20/2002',
    aliases: ['哲也', '相田'],
  },
  {
    name: '雪乃',
    identity: '稳重执行者',
    summary: '谨慎内敛、执行力强，在资源紧张时更关注规则与可持续分配。',
    location: '楼层20/2005',
    aliases: [],
  },
  {
    name: '桃乐丝・泽巴哈',
    identity: '外来幸存者 / 复杂立场',
    summary: '背景复杂、信息价值高，合作与对抗的边界会随局势快速变化。',
    location: '楼层19/1902',
    aliases: ['桃乐丝', '泽巴哈'],
  },
  {
    name: '王静',
    identity: '强压下的求生者',
    summary: '警惕心强，先求活再谈信任，关系推进依赖持续兑现与低风险互动。',
    location: '楼层20/2006',
    aliases: ['王静'],
  },
];

export const ROLE_CATALOG_NAMES = ROLE_CATALOG.map(item => item.name);

export const ROLE_CATALOG_NAME_SET = new Set(ROLE_CATALOG_NAMES);

export const DEFAULT_SELECTED_ROLE_NAMES = ROLE_CATALOG.filter(item => item.defaultSelected !== false).map(
  item => item.name,
);

export const ROLE_ALIAS_MAP = (() => {
  const map: Record<string, string> = {};
  for (const item of ROLE_CATALOG) {
    map[item.name] = item.name;
    for (const alias of item.aliases ?? []) {
      const key = String(alias ?? '').trim();
      if (!key) continue;
      map[key] = item.name;
    }
  }
  return map;
})();

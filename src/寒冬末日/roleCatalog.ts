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
    name: '浅见亚美',
    identity: '邻家护士 / 新婚妻子',
    summary: '高同理与高边界并存，擅长危机沟通与卫生隔离，重视尊严与同意。',
    location: '楼层20/2002',
    aliases: ['亚美', '护士亚美'],
  },
  {
    name: '相田哲也',
    identity: '理性观察者 / 亚美丈夫',
    summary: '冷静务实，偏工程与分析思维，在混乱环境中擅长建立秩序。',
    location: '楼层20/2002',
    aliases: ['哲也', '相田'],
  },
  {
    name: '星野琉璃',
    identity: '明星模特 / 女王气场',
    summary: '骄傲强势但在末日压力下逐步破防，价值与安全感高度绑定。',
    location: '楼层20/2003',
    aliases: ['琉璃', '星野'],
  },
  {
    name: '早川遥',
    identity: '双胞胎姐姐 / 温柔知性',
    summary: '更偏理性与照料型决策，常在风险场景中优先考虑团队稳定。',
    location: '楼层20/2004',
    aliases: ['遥', '早川遥姐'],
  },
  {
    name: '早川舞',
    identity: '双胞胎妹妹 / 元气外放',
    summary: '情绪表达直接，行动力强，容易在高压下作出冲动但真诚的选择。',
    location: '楼层20/2004',
    aliases: ['舞', '早川舞'],
  },
  {
    name: '藤井雪乃',
    identity: '稳重执行者',
    summary: '谨慎内敛、执行力强，在资源紧张时更关注规则与可持续分配。',
    location: '楼层20/2005',
    aliases: ['雪乃', '藤井'],
  },
  {
    name: '中村惠子',
    identity: '现实主义幸存者',
    summary: '对风险与收益高度敏感，行为务实，重视可验证的安全承诺。',
    location: '楼层20/2005',
    aliases: ['惠子', '中村'],
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
  {
    name: '小泽花',
    identity: '年轻幸存者',
    summary: '情绪敏感但可塑性高，对稳定环境与可靠引导的反馈显著。',
    location: '楼层20/2007',
    aliases: ['小泽花', '小花'],
  },
];

export const ROLE_CATALOG_NAMES = ROLE_CATALOG.map(item => item.name);

export const ROLE_CATALOG_NAME_SET = new Set(ROLE_CATALOG_NAMES);

export const DEFAULT_SELECTED_ROLE_NAMES = ROLE_CATALOG
  .filter(item => item.defaultSelected !== false)
  .map(item => item.name);

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


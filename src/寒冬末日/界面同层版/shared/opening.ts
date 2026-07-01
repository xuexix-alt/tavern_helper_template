import _ from 'lodash';
import YAML from 'yaml';

import openingPromptTemplateRaw from '../../../../docs/OpeningSetupPanel.generate提示词.txt?raw';
import openingPromptTemplatePreDisasterRaw from '../../../../docs/OpeningSetupPanel.generate提示词.灾变前3个月.txt?raw';
import openingPromptTemplateGenericStoryRaw from '../../../../docs/OpeningSetupPanel.generate通用故事提示词.txt?raw';
import worldModeProfilesRaw from '../../世界书/寒冬末日/世界观配置集.yaml?raw';
import routeProfilesRaw from '../../世界书/寒冬末日/主流派起始偏置表.yaml?raw';
import shelterAbilityRaw from '../../世界书/寒冬末日/庇护所升级能力.txt?raw';
import openingPresetRaw from './opening-preset.default.json';
import { OpeningPayloadSchema, OpeningPresetSchema, type OpeningPayload, type OpeningPreset } from './opening.schema';

export const OPENING_CHAT_STATE_PATH = 'stream_demo.opening';
export const OPENING_STORY_TEMPLATE_WINTER = 'winter-apocalypse-order';
export const OPENING_STORY_TEMPLATE_GENERIC = 'generic-story';

export type OpeningWorldModeOption = {
  id: string;
  key: string;
  name: string;
  slogan: string;
  core_pleasure: string;
  recommended_main_route: string;
  secondary_routes: string[];
  environment_summary: string;
  threat_summary: string;
  society_summary: string;
  route_hint: string;
  environment: Record<string, unknown>;
  axes: Record<string, unknown>;
};

export type OpeningRouteOption = {
  id: string;
  name: string;
  core_fantasy: string;
  world_lens: string;
  recommended_world_modes: string[];
  guaranteed_opening_elements: string[];
  starting_liabilities: string[];
  opening_conflict_sources: string[];
  forbidden_drift: string[];
};

const GENERIC_STORY_GENRE_OPTIONS = [
  '玄幻',
  '奇幻',
  '仙侠',
  '都市',
  '都市异能',
  '历史',
  '架空历史',
  '科幻',
  '末世',
  '无限流',
  '悬疑',
  '灵异',
  '克苏鲁',
  '赛博朋克',
  '星际',
  '西幻',
  '武侠',
  '游戏异界',
  '轻小说',
  '恋爱日常',
  '情色',
  '娱乐圈',
  '宫斗宅斗',
  '权谋',
  '群像',
];

const GENERIC_STORY_FANWORK_OPTIONS_BY_GENRE: Record<string, string[]> = {
  玄幻: ['斗破苍穹', '斗罗大陆', '遮天', '完美世界', '牧神记', '大主宰', '武动乾坤', '圣墟', '元尊', '神墓'],
  奇幻: ['魔戒', '冰与火之歌', '哈利·波特', '纳尼亚传奇', '巫师', '龙族', '诡秘之主', '奥术神座', '西游记'],
  仙侠: ['凡人修仙传', '仙逆', '一念永恒', '修真聊天群', '诛仙', '星辰变', '莽荒纪', '大道争锋', '灭运图录'],
  都市: [
    '繁花',
    '狂飙',
    '欢乐颂',
    '爱情公寓',
    '小欢喜',
    '都挺好',
    '流金岁月',
    '微微一笑很倾城',
    '何以笙箫默',
    '全职高手',
  ],
  都市异能: ['龙族', '一人之下', '灵笼', '镇魂街', '全职法师', '异常生物见闻录', '超能陆战队', '漫威电影宇宙'],
  历史: [
    '三国演义',
    '水浒传',
    '史记',
    '资治通鉴',
    '大明王朝1566',
    '雍正王朝',
    '长安十二时辰',
    '琅琊榜',
    '庆余年',
    '赘婿',
  ],
  架空历史: ['庆余年', '赘婿', '琅琊榜', '雪中悍刀行', '将夜', '择天记', '凰权', '权力的游戏'],
  科幻: ['三体', '流浪地球', '星际穿越', '银翼杀手', '攻壳机动队', '高达', '银河英雄传说', '黑客帝国', '异形', '沙丘'],
  末世: [
    '灵笼',
    '学园默示录',
    '进击的巨人',
    '行尸走肉',
    '末日乐园',
    '全球进化',
    '雪国列车',
    '疯狂的麦克斯',
    '生化危机',
    '明日方舟',
  ],
  无限流: ['无限恐怖', '惊悚乐园', '轮回乐园', '从姑获鸟开始', '地球上线', '死亡万花筒', '全球高考'],
  悬疑: ['诡秘之主', '盗墓笔记', '鬼吹灯', '隐秘的角落', '白夜追凶', '开端', '心理罪', '福尔摩斯', '东方快车谋杀案'],
  灵异: ['盗墓笔记', '鬼吹灯', '镇魂', '地狱公寓', '怨气撞铃', '民调局异闻录', '聊斋志异', '山海经'],
  克苏鲁: ['诡秘之主', '克苏鲁神话', '血源诅咒', '潜行吧！奈亚子', '深渊上的火', 'SCP基金会', '印斯茅斯的阴霾'],
  赛博朋克: ['赛博朋克2077', '攻壳机动队', '银翼杀手', '心理测量者', '边缘行者', '阿丽塔：战斗天使'],
  星际: ['崩坏：星穹铁道', '星际争霸', '星球大战', '银河英雄传说', '高达', 'EVE Online', '三体', '吞噬星空'],
  西幻: ['魔戒', '冰与火之歌', '哈利·波特', '巫师', '魔兽世界', '上古卷轴', '龙与地下城', '纳尼亚传奇', '奥德赛'],
  武侠: ['金庸群侠传', '天龙八部', '笑傲江湖', '神雕侠侣', '陆小凤传奇', '楚留香传奇', '雪中悍刀行', '水浒传'],
  游戏异界: ['刀剑神域', 'Overlord', '记录的地平线', '全职高手', '游戏王', '宝可梦', '原神', '明日方舟'],
  轻小说: [
    '刀剑神域',
    'Re:从零开始的异世界生活',
    'Overlord',
    '无职转生',
    '魔法禁书目录',
    '凉宫春日系列',
    '为美好的世界献上祝福！',
  ],
  恋爱日常: [
    '傲慢与偏见',
    '罗密欧与朱丽叶',
    '辉夜大小姐想让我告白',
    '五等分的新娘',
    '路人女主的养成方法',
    '春物',
    'CLANNAD',
    '樱花庄的宠物女孩',
  ],
  情色: [
    '金瓶梅',
    '肉蒲团',
    '素女经',
    '飞燕外传',
    '痴婆子传',
    '查泰莱夫人的情人',
    '北回归线',
    '南回归线',
    'O的故事',
    '艾曼纽',
    '维纳斯的三角洲',
    '十日谈',
    '危险关系',
    '青楼十二房',
    '感官世界',
    '花与蛇',
    '苦月亮',
    '巴黎最后的探戈',
    '大开眼戒',
    '秘书',
    '本能',
    '爱你九周半',
    '色，戒',
    '西西里的美丽传说',
    '五十度灰',
    '不忠',
    '原罪',
    '欲望都市',
    '加州靡情',
    '都铎王朝',
    '兰斯系列',
    '凯瑟琳',
    '情人',
  ],
  娱乐圈: ['全职高手', '偶像大师', 'Love Live!', 'BanG Dream!', '偶像梦幻祭', '华丽的挑战', '甄嬛传', '繁花'],
  宫斗宅斗: ['甄嬛传', '如懿传', '延禧攻略', '知否知否应是绿肥红瘦', '步步惊心', '红楼梦', '源氏物语'],
  权谋: ['琅琊榜', '庆余年', '权力的游戏', '三国演义', '雍正王朝', '大明王朝1566', '长安十二时辰', '资治通鉴'],
  群像: [
    '红楼梦',
    '水浒传',
    '明日方舟',
    '原神',
    '崩坏：星穹铁道',
    '海贼王',
    '火影忍者',
    '进击的巨人',
    '全职高手',
    '龙族',
  ],
};

const GENERIC_STORY_FANWORK_OPTIONS = [
  '西游记',
  '红楼梦',
  '三国演义',
  '水浒传',
  '山海经',
  '聊斋志异',
  '封神演义',
  '史记',
  '资治通鉴',
  '希腊神话',
  '北欧神话',
  '荷马史诗',
  '奥德赛',
  '伊利亚特',
  '圣经',
  '一千零一夜',
  '源氏物语',
  '莎士比亚戏剧',
  '罗密欧与朱丽叶',
  '哈姆雷特',
  '傲慢与偏见',
  '金瓶梅',
  '肉蒲团',
  '素女经',
  '飞燕外传',
  '痴婆子传',
  '查泰莱夫人的情人',
  '北回归线',
  '南回归线',
  'O的故事',
  '艾曼纽',
  '维纳斯的三角洲',
  '十日谈',
  '危险关系',
  '福尔摩斯',
  '东方快车谋杀案',
  '魔戒',
  '哈利·波特',
  '冰与火之歌',
  '沙丘',
  '三体',
  '流浪地球',
  '星际穿越',
  '黑客帝国',
  '星球大战',
  '漫威电影宇宙',
  'DC宇宙',
  '异形',
  '生化危机',
  '疯狂的麦克斯',
  '银翼杀手',
  '感官世界',
  '花与蛇',
  '苦月亮',
  '巴黎最后的探戈',
  '大开眼戒',
  '秘书',
  '本能',
  '爱你九周半',
  '色，戒',
  '西西里的美丽传说',
  '五十度灰',
  '不忠',
  '原罪',
  '欲望都市',
  '加州靡情',
  '都铎王朝',
  '甄嬛传',
  '如懿传',
  '延禧攻略',
  '琅琊榜',
  '庆余年',
  '长安十二时辰',
  '大明王朝1566',
  '雍正王朝',
  '狂飙',
  '繁花',
  '爱情公寓',
  '小欢喜',
  '都挺好',
  '原神',
  '崩坏：星穹铁道',
  '明日方舟',
  '碧蓝航线',
  'Fate/Grand Order',
  '东方Project',
  '赛马娘',
  '蔚蓝档案',
  '少女前线',
  '咒术回战',
  '鬼灭之刃',
  '海贼王',
  '火影忍者',
  '死神',
  '进击的巨人',
  '电锯人',
  '新世纪福音战士',
  '高达',
  '攻壳机动队',
  '赛博朋克2077',
  '边缘行者',
  '上古卷轴',
  '魔兽世界',
  '星际争霸',
  '宝可梦',
  '塞尔达传说',
  '最终幻想',
  '女神异闻录',
  '血源诅咒',
  '艾尔登法环',
  '黑暗之魂',
  '巫师',
  '兰斯系列',
  '凯瑟琳',
  '诡秘之主',
  '斗破苍穹',
  '斗罗大陆',
  '凡人修仙传',
  '遮天',
  '吞噬星空',
  '全职高手',
  '庆余年',
  '雪中悍刀行',
];

function mergeUniqueOptions(...groups: string[][]): string[] {
  return Array.from(
    new Set(
      groups
        .flat()
        .map(item => trimText(item))
        .filter(Boolean),
    ),
  );
}

export function getGenericStoryFanworkOptionsForGenre(genre: string): string[] {
  const normalizedGenre = trimText(genre);
  const genreOptions = GENERIC_STORY_FANWORK_OPTIONS_BY_GENRE[normalizedGenre] ?? [];
  return genreOptions.length > 0 ? genreOptions : GENERIC_STORY_FANWORK_OPTIONS;
}

function parseYamlDocument(raw: string): Record<string, unknown> {
  try {
    const doc = YAML.parse(String(raw ?? ''));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? (doc as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const __worldModeDoc = parseYamlDocument(worldModeProfilesRaw);
const __routeDoc = parseYamlDocument(routeProfilesRaw);
const __shelterAbilityDoc = parseYamlDocument(shelterAbilityRaw);

function normalizeStringList(input: unknown): string[] {
  return Array.isArray(input) ? input.map(item => String(item ?? '').trim()).filter(Boolean) : [];
}

function trimText(input: unknown): string {
  return String(input ?? '').trim();
}

function compactText(input: unknown): string {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePositiveInteger(input: unknown): number | null {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function formatUnknownValue(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return trimText(input);
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  if (Array.isArray(input)) return input.map(formatUnknownValue).filter(Boolean).join('、');
  if (typeof input === 'object') {
    try {
      return trimText(YAML.stringify(input));
    } catch {
      return '';
    }
  }
  return '';
}

function readCurrentMessageStatDataForPrompt(): Record<string, unknown> | null {
  try {
    const vars = getVariables?.({ type: 'message' }) ?? null;
    const statData = _.get(vars, 'stat_data', null);
    return statData && typeof statData === 'object' && !Array.isArray(statData)
      ? (_.cloneDeep(statData) as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatCurrentMessageStatDataForPrompt(): string {
  const statData = readCurrentMessageStatDataForPrompt();
  if (!statData) return '';

  let serialized = '';
  try {
    serialized = trimText(YAML.stringify({ stat_data: statData }));
  } catch {
    try {
      serialized = trimText(JSON.stringify({ stat_data: statData }, null, 2));
    } catch {
      serialized = '';
    }
  }
  if (!serialized) return '';

  return [
    '<status_current_variable>',
    '[不得在正文中输出]当前变量真相如下，请严格按这些已有路径与层级生成 UpdateVariable / JSONPatch：',
    '```yaml',
    serialized,
    '```',
    '[上一轮的变量中，如有任何角色Imp < 0或健康值=0，则角色已经死亡，本轮演绎其死亡剧情，并今后正文不会违反这个事实。]',
    '</status_current_variable>',
  ].join('\n');
}

export function isGenericStoryOpening(payload: Pick<OpeningPayload, 'story_template'> | null | undefined): boolean {
  return trimText(payload?.story_template) === OPENING_STORY_TEMPLATE_GENERIC;
}

export function getOpeningStoryTemplateId(payload: Pick<OpeningPayload, 'story_template'> | null | undefined): string {
  return isGenericStoryOpening(payload) ? OPENING_STORY_TEMPLATE_GENERIC : OPENING_STORY_TEMPLATE_WINTER;
}

export function getGenericStoryFormSchema(): OpeningPreset['form_schema'] {
  return [
    {
      key: 'generic_genre',
      label: '题材',
      kind: 'text',
      required: true,
      options: GENERIC_STORY_GENRE_OPTIONS,
      default_value: '',
      placeholder: '选择或输入题材，例如：玄幻 / 都市异能 / 无限流 / 克苏鲁',
    },
    {
      key: 'is_fanwork',
      label: '是否为同人作品',
      kind: 'select',
      required: true,
      options: ['否', '是'],
      default_value: '否',
    },
    {
      key: 'fanwork_name',
      label: '同人作品名称',
      kind: 'text',
      required: false,
      options: GENERIC_STORY_FANWORK_OPTIONS,
      default_value: '',
      placeholder: '选择或输入作品名；非同人可留空',
    },
    {
      key: 'protagonist_background',
      label: '主人公背景',
      kind: 'textarea',
      required: false,
      default_value: '',
      placeholder: '可选：身份、能力、前史、初始资源、与主要人物的关系',
    },
    {
      key: 'opening_scene',
      label: '开头场景',
      kind: 'textarea',
      required: true,
      default_value: '',
      placeholder: '例如：深夜收到一封不该存在的邀请函；醒来时已经站在副本入口',
    },
    {
      key: 'user_requirements',
      label: '用户要求',
      kind: 'textarea',
      required: false,
      default_value: '',
      placeholder: '可选：想保留/改写的世界观、人设关系、爽点、禁忌、开局事件',
    },
    {
      key: 'early_story_tone',
      label: '剧情基调',
      kind: 'textarea',
      required: false,
      default_value: '',
      placeholder: '例如：暗流涌动、轻松日常、热血升级、悬疑压迫、群像权谋',
    },
    {
      key: 'opening_style',
      label: '文风',
      kind: 'select',
      required: true,
      options: ['轻小说', '网文爽文', '电影感叙事', '现代文学', '克制冷峻', '诗性华丽'],
      default_value: '轻小说',
    },
    {
      key: 'word_count',
      label: '字数',
      kind: 'text',
      required: true,
      default_value: '1500',
      placeholder: '默认 1500',
    },
  ];
}

export function getOpeningFormSchema(preset: OpeningPreset, payload: OpeningPayload): OpeningPreset['form_schema'] {
  if (isGenericStoryOpening(payload)) return getGenericStoryFormSchema();
  return getEffectiveFormSchema(preset, payload.world_mode_id);
}

export function getOpeningMissingRequiredField(preset: OpeningPreset, payload: OpeningPayload) {
  const missing = getOpeningFormSchema(preset, payload).find(
    field => field.required && !trimText(payload.form_values?.[field.key]),
  );
  if (missing) return missing;
  if (isGenericStoryOpening(payload) && trimText(payload.form_values?.is_fanwork) === '是') {
    const fanworkName = trimText(payload.form_values?.fanwork_name);
    if (!fanworkName) {
      return {
        key: 'fanwork_name',
        label: '同人作品名称',
        kind: 'text' as const,
        required: true,
        options: GENERIC_STORY_FANWORK_OPTIONS,
        placeholder: '选择或输入作品名',
        default_value: '',
      };
    }
  }
  return null;
}

function buildDefaultOpeningFormValues(
  preset: OpeningPreset,
  worldModeId?: string,
  storyTemplate = OPENING_STORY_TEMPLATE_WINTER,
): Record<string, string> {
  const schema =
    storyTemplate === OPENING_STORY_TEMPLATE_GENERIC
      ? getGenericStoryFormSchema()
      : getEffectiveFormSchema(preset, worldModeId);
  return Object.fromEntries(
    schema.map(field => {
      if (field.key === 'shelter_ability_summary') {
        return [field.key, getDefaultShelterAbilitySummary()];
      }
      return [field.key, trimText(field.default_value)];
    }),
  );
}

export function getEffectiveFormSchema(preset: OpeningPreset, worldModeId?: string) {
  const normalizedId = trimText(worldModeId);
  const override = normalizedId ? preset.form_schema_overrides?.[normalizedId] : undefined;
  const fields = override?.fields?.length ? override.fields : preset.form_schema;
  return fields ?? [];
}

export function getEffectiveDefaultMeta(preset: OpeningPreset, worldModeId?: string) {
  const normalizedId = trimText(worldModeId);
  const override = normalizedId ? preset.form_schema_overrides?.[normalizedId]?.default_meta : undefined;
  return {
    time: trimText(override?.time ?? preset.default_meta.time),
    location: trimText(override?.location ?? preset.default_meta.location),
    character: trimText(override?.character ?? preset.default_meta.character),
  };
}

function getDefaultShelterAbilitySummary(): string {
  const unlocks = (_.get(__shelterAbilityDoc, ['levels', '1', 'unlocks'], []) ?? []) as unknown[];
  const abilityRecord = (_.get(__shelterAbilityDoc, 'abilities', {}) ?? {}) as Record<string, Record<string, unknown>>;
  const parts = unlocks
    .map(key => abilityRecord[String(key ?? '').trim()])
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .slice(0, 5)
    .map(item => {
      const promptBrief = trimText(_.get(item, 'summary.prompt_brief', ''));
      if (promptBrief) return promptBrief;
      const name = trimText(item.name);
      const desc = trimText(item.desc);
      return [name || '未命名能力', desc].filter(Boolean).join('：');
    });

  return parts.join('\n') || '未设定';
}

function normalizeOpeningState(input: unknown): OpeningPayload['state'] {
  const value = trimText(input);
  if (value === 'ready' || value === 'generating' || value === 'configuring') return value;
  return 'placeholder';
}

function migrateOpeningPayload(raw: unknown, preset: OpeningPreset): OpeningPayload {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const storyTemplate =
    trimText(_.get(source, 'story_template', '')) === OPENING_STORY_TEMPLATE_GENERIC
      ? OPENING_STORY_TEMPLATE_GENERIC
      : OPENING_STORY_TEMPLATE_WINTER;
  const worldModeId = trimText(_.get(source, 'world_mode_id', getDefaultWorldModeId())) || getDefaultWorldModeId();
  const effectiveSchema =
    storyTemplate === OPENING_STORY_TEMPLATE_GENERIC
      ? getGenericStoryFormSchema()
      : getEffectiveFormSchema(preset, worldModeId);
  const effectiveDefaultMeta = getEffectiveDefaultMeta(preset, worldModeId);
  const nextFormValues = buildDefaultOpeningFormValues(preset, worldModeId, storyTemplate);
  const rawFormValues = (_.get(source, 'form_values', null) ?? null) as Record<string, unknown> | null;
  const rawUserInput = (_.get(source, 'user_input', {}) ?? {}) as Record<string, unknown>;
  const rawUserDraft = (_.get(source, 'user_draft', {}) ?? {}) as Record<string, unknown>;

  effectiveSchema.forEach(field => {
    const key = field.key;
    const value =
      rawFormValues?.[key] ??
      rawUserDraft[key] ??
      rawUserInput[key] ??
      field.default_value ??
      nextFormValues[key] ??
      '';
    nextFormValues[key] = trimText(value);
  });

  const nextStateSource = normalizeOpeningState(_.get(source, 'state', 'placeholder'));
  const nextOpeningAssistantMessageId =
    normalizePositiveInteger(_.get(source, 'opening_assistant_message_id', null)) ??
    normalizePositiveInteger(_.get(source, 'opening_result_message_id', null));
  const nextCompiledPromptSnapshot = trimText(_.get(source, 'compiled_prompt_snapshot', ''));
  const hasConfiguredFormValues = Object.values(nextFormValues).some(Boolean);
  const nextState =
    nextOpeningAssistantMessageId != null
      ? 'ready'
      : nextStateSource === 'generating'
        ? 'generating'
        : nextCompiledPromptSnapshot || hasConfiguredFormValues
          ? 'configuring'
          : 'placeholder';

  const rawRouteId = trimText(_.get(source, 'route_id', ''));
  const resolvedRouteId = rawRouteId && getOpeningRoute(rawRouteId) ? rawRouteId : getDefaultRouteId(worldModeId);

  return OpeningPayloadSchema.parse({
    version: 5,
    state: nextState,
    story_template: storyTemplate,
    world_mode_id: worldModeId,
    route_id: resolvedRouteId,
    use_stream: _.get(source, 'use_stream', false),
    compiled_prompt_snapshot: nextCompiledPromptSnapshot,
    opening_assistant_message_id: nextOpeningAssistantMessageId,
    meta: {
      time: compactText(_.get(source, 'meta.time', effectiveDefaultMeta.time)),
      location: compactText(_.get(source, 'meta.location', effectiveDefaultMeta.location)),
      character: compactText(_.get(source, 'meta.character', effectiveDefaultMeta.character)),
    },
    form_values: nextFormValues,
  });
}

export function getOpeningWorldModes(): OpeningWorldModeOption[] {
  const profiles = (_.get(__worldModeDoc, 'profiles', {}) ?? {}) as Record<string, any>;
  return Object.entries(profiles)
    .map(([id, raw]) => {
      const aiBriefSeed = (_.get(raw, 'ai_brief_seed', {}) ?? {}) as Record<string, unknown>;
      return {
        id: String((raw as any)?.id ?? id).trim() || id,
        key: String((raw as any)?.key ?? id).trim() || id,
        name: String((raw as any)?.name ?? id).trim() || id,
        slogan: String((raw as any)?.slogan ?? '').trim(),
        core_pleasure: String((raw as any)?.core_pleasure ?? '').trim(),
        recommended_main_route: String((raw as any)?.recommended_main_route ?? '').trim(),
        secondary_routes: normalizeStringList((raw as any)?.secondary_routes),
        environment_summary: String(aiBriefSeed['环境体感'] ?? '').trim(),
        threat_summary: String(aiBriefSeed['主要威胁'] ?? '').trim(),
        society_summary: String(aiBriefSeed['社会状态'] ?? '').trim(),
        route_hint: String(aiBriefSeed['路线提示'] ?? '').trim(),
        environment:
          (_.get(raw, 'environment', {}) ?? {}) && typeof _.get(raw, 'environment', {}) === 'object'
            ? { ...((_.get(raw, 'environment', {}) ?? {}) as Record<string, unknown>) }
            : {},
        axes:
          (_.get(raw, 'axes', {}) ?? {}) && typeof _.get(raw, 'axes', {}) === 'object'
            ? { ...((_.get(raw, 'axes', {}) ?? {}) as Record<string, unknown>) }
            : {},
      };
    })
    .filter(item => item.id && item.name);
}

export function getOpeningRoutes(): OpeningRouteOption[] {
  const profiles = (_.get(__routeDoc, 'profiles', {}) ?? {}) as Record<string, any>;
  return Object.entries(profiles)
    .map(([name, raw]) => ({
      id: String((raw as any)?.id ?? name).trim() || name,
      name: String((raw as any)?.name ?? name).trim() || name,
      core_fantasy: String((raw as any)?.core_fantasy ?? '').trim(),
      world_lens: String((raw as any)?.world_lens ?? '').trim(),
      recommended_world_modes: normalizeStringList((raw as any)?.recommended_world_modes),
      guaranteed_opening_elements: normalizeStringList((raw as any)?.guaranteed_opening_elements),
      starting_liabilities: normalizeStringList((raw as any)?.starting_liabilities),
      opening_conflict_sources: normalizeStringList((raw as any)?.opening_conflict_sources),
      forbidden_drift: normalizeStringList((raw as any)?.forbidden_drift),
    }))
    .filter(item => item.name);
}

export function getOpeningWorldMode(id: string): OpeningWorldModeOption | null {
  const normalizedId = String(id ?? '').trim();
  return getOpeningWorldModes().find(item => item.id === normalizedId || item.key === normalizedId) ?? null;
}

export function getOpeningRoute(id: string): OpeningRouteOption | null {
  const normalizedId = String(id ?? '').trim();
  return getOpeningRoutes().find(item => item.name === normalizedId || item.id === normalizedId) ?? null;
}

function getDefaultWorldModeId(): string {
  if (getOpeningWorldMode('B')) return 'B';
  return getOpeningWorldModes()[0]?.id || 'B';
}

function getDefaultRouteId(worldModeId = getDefaultWorldModeId()): string {
  const mode = getOpeningWorldMode(worldModeId);
  if (mode?.recommended_main_route && getOpeningRoute(mode.recommended_main_route)) {
    return mode.recommended_main_route;
  }
  return getOpeningRoutes()[0]?.name || '后宫+养成';
}

export function getDefaultOpeningPreset(): OpeningPreset {
  return OpeningPresetSchema.parse(openingPresetRaw);
}

export function getDefaultOpeningPayload(preset = getDefaultOpeningPreset()): OpeningPayload {
  const world_mode_id = getDefaultWorldModeId();
  const route_id = getDefaultRouteId(world_mode_id);

  return OpeningPayloadSchema.parse({
    version: 5,
    state: 'placeholder',
    story_template: OPENING_STORY_TEMPLATE_WINTER,
    world_mode_id,
    route_id,
    use_stream: false,
    compiled_prompt_snapshot: '',
    opening_assistant_message_id: null,
    meta: getEffectiveDefaultMeta(preset, world_mode_id),
    form_values: buildDefaultOpeningFormValues(preset, world_mode_id),
  });
}

export function readOpeningPayloadFromChat(): OpeningPayload | null {
  try {
    const vars = getVariables?.({ type: 'chat' }) ?? {};
    const raw = _.get(vars, OPENING_CHAT_STATE_PATH, null);
    if (!raw) return null;
    return migrateOpeningPayload(raw, getDefaultOpeningPreset());
  } catch {
    return null;
  }
}

const OPENING_PERSISTED_FORM_KEYS = [
  'pre_disaster_identity',
  'shelter_ability_summary',
  'early_story_tone',
  'opening_style',
  'supplemental_setting',
  'custom_opening_setting',
  'word_count',
  'financial_level',
  'pre_disaster_contacts',
  'stockpile_focus',
  'generic_genre',
  'is_fanwork',
  'fanwork_name',
  'protagonist_background',
  'opening_scene',
  'user_requirements',
] as const;

function buildCompactOpeningPayloadForChat(payload: OpeningPayload) {
  const compactFormValues = Object.fromEntries(
    OPENING_PERSISTED_FORM_KEYS.map(key => [key, trimText(payload.form_values?.[key])]).filter(([, value]) =>
      Boolean(value),
    ),
  );

  return {
    version: 5,
    state: payload.state,
    story_template: getOpeningStoryTemplateId(payload),
    world_mode_id: trimText(payload.world_mode_id) || getDefaultWorldModeId(),
    route_id:
      trimText(payload.route_id) || getDefaultRouteId(trimText(payload.world_mode_id) || getDefaultWorldModeId()),
    use_stream: payload.use_stream === true,
    compiled_prompt_snapshot: trimText(payload.compiled_prompt_snapshot),
    opening_assistant_message_id:
      Number.isFinite(Number(payload.opening_assistant_message_id)) && Number(payload.opening_assistant_message_id) > 0
        ? Math.trunc(Number(payload.opening_assistant_message_id))
        : null,
    meta: {
      character: compactText(payload.meta.character) || '{{user}}',
      ...(isGenericStoryOpening(payload)
        ? {
            time: compactText(payload.meta.time),
            location: compactText(payload.meta.location),
          }
        : {}),
    },
    form_values: compactFormValues,
  };
}

export function replaceOpeningPayloadInChat(payload: OpeningPayload) {
  try {
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        const compact = buildCompactOpeningPayloadForChat(payload);
        _.set(vars, OPENING_CHAT_STATE_PATH, compact);
        console.log('[Debug] replaceOpeningPayloadInChat', {
          state: compact.state,
          opening_assistant_message_id: compact.opening_assistant_message_id,
          hasCompiledPromptSnapshot: Boolean(compact.compiled_prompt_snapshot),
        });
        return vars;
      },
      { type: 'chat' },
    );
  } catch (err) {
    console.warn('[Debug] replaceOpeningPayloadInChat ERROR', {
      error: err instanceof Error ? err.message : String(err),
    });
    // ignore
  }
}

const OPENING_AXIS_VIEW = [
  { axisKey: '气候压力', sourceKey: '超自然极端天气', label: '超自然极端天气' },
  { axisKey: '行动窗口', sourceKey: '行动窗口', label: '行动窗口' },
  { axisKey: '社会残存度', sourceKey: '社会残存度', label: '社会组织度' },
  { axisKey: '生产残余度', sourceKey: '生产残余度', label: '生产残余度' },
  { axisKey: '冲突密度', sourceKey: '冲突密度', label: '冲突密度' },
  { axisKey: '外部威胁主因', sourceKey: '外部威胁主因', label: '外部威胁主因' },
  { axisKey: '外出死亡风险', sourceKey: '外出死亡风险', label: '外出死亡风险' },
  { axisKey: '据点化程度', sourceKey: '据点化程度', label: '据点化程度' },
] as const;

function describeThreatCause(label: string, subtype: string): string {
  if (label === '环境') {
    return `人出到室外，要面临${subtype || '失温'}等环境威胁，灾难初期大部分人因此丧命。`;
  }
  if (label === '野化生物') {
    return `在城市或远郊还有${subtype || '野化生物'}持续威胁，它们超自然地进化成适应极端低温，并以任意活体为食，攻击性很强。`;
  }
  if (label === '异变体') {
    return `除了极端环境，还存在${subtype || '异变体'}造成的直接生存威胁，这类目标危险、不可预测且难以正面处理。`;
  }
  if (label === '暴徒') {
    return `人类内部还要面对${subtype || '暴徒'}带来的直接暴力威胁，掠夺、围堵和伤亡随时可能发生。`;
  }
  if (label === '组织博弈') {
    return `人类内部还要面对不同阵营组织间的${subtype || '组织博弈'}，时有伤亡，试探、渗透和争斗会持续升级。`;
  }
  if (label === '交易秩序争夺') {
    return `在气候窗口存在的情况下，各组织间会因${subtype || '资源控制'}展开争夺，普通人很难脱离被盘剥的位置。`;
  }
  return label ? `当前外部威胁以${label}${subtype ? `（${subtype}）` : ''}为主。` : '未设定';
}

function describeTripFatality(label: string): string {
  if (label === '低') return '无准备外出仍然危险，但只要抓住窗口并做好基础防护，尚不至于等同送命。';
  if (label === '中') return '无准备外出有明显死亡风险，任何离开庇护的决定都必须谨慎评估。';
  if (label === '高') return '无准备外出接近拿命赌博，短时间暴露也可能直接造成重伤或死亡。';
  if (label === '极高') return '无准备外出几乎等同送命，离开掩体本身就是极高风险行为。';
  return '未设定';
}

function describeStrongholdLevel(label: string): string {
  if (label === '低') return '稳定据点极少，幸存者大多以零散个体或脆弱小团体形式苟活，很难形成持续控制区。';
  if (label === '中') return '存在少量中小型据点和局部控制区，但整体仍分散脆弱，随时可能被吞并、瓦解或改旗易帜。';
  if (label === '高') return '多个据点已经形成稳定控制范围，幸存者开始围绕据点、规则和资源重新组织生活。';
  if (label === '极高') return '据点和控制区高度成型，区域秩序、势力边界与统治关系已经非常清晰。';
  return '未设定';
}

function formatWorldModeAxisLine(axisName: string, axisValue: unknown): string {
  const axisRecord = axisValue && typeof axisValue === 'object' ? (axisValue as Record<string, unknown>) : {};
  const label = trimText(axisRecord.label);
  const subtype = trimText(axisRecord.subtype);
  const overrideDescription = trimText(axisRecord.description);
  const view = OPENING_AXIS_VIEW.find(item => item.axisKey === axisName);

  if (overrideDescription) {
    return `${view?.label || axisName}：${overrideDescription}`;
  }

  const sourceKey = view?.sourceKey || axisName;
  const dictionaryRecord = (_.get(__worldModeDoc, ['world_mode_axis_dictionary', sourceKey, 'labels', label], {}) ??
    {}) as Record<string, unknown>;
  const description = trimText(dictionaryRecord.description);

  let resolvedDescription = description;
  if (!resolvedDescription && axisName === '外部威胁主因') {
    resolvedDescription = describeThreatCause(label, subtype);
  }
  if (!resolvedDescription && axisName === '外出死亡风险') {
    resolvedDescription = describeTripFatality(label);
  }
  if (!resolvedDescription && axisName === '据点化程度') {
    resolvedDescription = describeStrongholdLevel(label);
  }

  return `${view?.label || axisName}：${resolvedDescription || '未设定'}`;
}

export function buildWorldModeAxisDictionary(worldMode: OpeningWorldModeOption | null): string {
  if (!worldMode) return '未设定';
  const lines = OPENING_AXIS_VIEW.map(item => item.axisKey)
    .map(axisName => formatWorldModeAxisLine(axisName, worldMode.axes[axisName]))
    .filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : '未设定';
}

function buildWorldModeAxisTextMap(worldMode: OpeningWorldModeOption | null): Record<string, string> {
  if (!worldMode) {
    return {
      社会组织度变量: '社会组织度：未设定',
      生产残余度变量: '生产残余度：未设定',
      冲突密度变量: '冲突密度：未设定',
      据点化程度变量: '据点化程度：未设定',
    };
  }

  return {
    社会组织度变量: formatWorldModeAxisLine('社会残存度', worldMode.axes['社会残存度']),
    生产残余度变量: formatWorldModeAxisLine('生产残余度', worldMode.axes['生产残余度']),
    冲突密度变量: formatWorldModeAxisLine('冲突密度', worldMode.axes['冲突密度']),
    据点化程度变量: formatWorldModeAxisLine('据点化程度', worldMode.axes['据点化程度']),
  };
}

function buildWorldModeSummary(worldMode: OpeningWorldModeOption | null): string {
  if (!worldMode) return '未设定';
  return [worldMode.environment_summary, worldMode.threat_summary, worldMode.society_summary, worldMode.route_hint]
    .filter(Boolean)
    .join('；');
}

function resolveTemplateValue(context: Record<string, string>, key: string): string | null {
  const normalizedKey = trimText(key);
  if (!normalizedKey) return null;
  const resolved = trimText(context[normalizedKey]);
  return resolved || null;
}

export function compileOpeningPromptTemplate(template: string, context: Record<string, string>): string {
  return String(template ?? '')
    .replace(/\$\{\s*([^{}\n]+?)\s*\}/g, (match, key: string) => resolveTemplateValue(context, key) ?? match)
    .replace(/\{\{\s*([^{}\n]+?)\s*\}\}/g, (match, key: string) => resolveTemplateValue(context, key) ?? match);
}

export function buildOpeningPromptContext(preset: OpeningPreset, payload: OpeningPayload): Record<string, string> {
  const worldMode = getOpeningWorldMode(payload.world_mode_id);
  const route = getOpeningRoute(payload.route_id);
  const formValues = payload.form_values ?? {};
  const worldModeAxisDictionary = buildWorldModeAxisDictionary(worldMode);
  const worldModeAxisTextMap = buildWorldModeAxisTextMap(worldMode);
  const shelterAbilitySummary = trimText(formValues.shelter_ability_summary) || getDefaultShelterAbilitySummary();
  const supplementalSetting = trimText(formValues.supplemental_setting) || '未设定';
  const customOpeningSetting = trimText(formValues.custom_opening_setting) || '未设定';
  const wordCount = trimText(formValues.word_count) || '1500';
  const financialLevel = trimText(formValues.financial_level) || '未设定';
  const preDisasterContacts = trimText(formValues.pre_disaster_contacts) || '未设定';
  const stockpileFocus = trimText(formValues.stockpile_focus) || '未设定';
  const genericGenre = trimText(formValues.generic_genre) || '未设定';
  const isFanwork = trimText(formValues.is_fanwork) === '是' ? '是' : '否';
  const fanworkName = trimText(formValues.fanwork_name) || '未设定';
  const protagonistBackground = trimText(formValues.protagonist_background) || '未设定';
  const openingScene = trimText(formValues.opening_scene) || '未设定';
  const userRequirements = trimText(formValues.user_requirements) || '未设定';
  const worldVariable = worldModeAxisDictionary;

  return {
    user: trimText(payload.meta.character) || '{{user}}',
    character_name: trimText(payload.meta.character) || '{{user}}',
    time: trimText(payload.meta.time) || '未设定',
    location: trimText(payload.meta.location) || '未设定',
    world_intro: trimText(preset.world_intro) || '未设定',
    first_line: trimText(preset.first_line) || '未设定',
    world_mode_id: worldMode?.id || trimText(payload.world_mode_id) || '未设定',
    world_mode_name: worldMode?.name || trimText(payload.world_mode_id) || '未设定',
    world_mode_slogan: worldMode?.slogan || '未设定',
    world_mode_core_pleasure: worldMode?.core_pleasure || '未设定',
    world_mode_summary: buildWorldModeSummary(worldMode),
    world_mode_axis_dictionary: worldModeAxisDictionary,
    world_mode_environment: formatUnknownValue(worldMode?.environment) || '未设定',
    route_name: route?.name || trimText(payload.route_id) || '未设定',
    route_core_fantasy: route?.core_fantasy || '未设定',
    route_world_lens: route?.world_lens || '未设定',
    guaranteed_opening_elements: route?.guaranteed_opening_elements.join('；') || '未设定',
    starting_liabilities: route?.starting_liabilities.join('；') || '未设定',
    opening_conflict_sources: route?.opening_conflict_sources.join('；') || '未设定',
    世界观变量: worldVariable,
    world_variable: worldVariable,
    ...worldModeAxisTextMap,
    pre_disaster_identity: trimText(formValues.pre_disaster_identity) || '未设定',
    '职业/身份': trimText(formValues.pre_disaster_identity) || '未设定',
    early_story_tone: trimText(formValues.early_story_tone) || '未设定',
    opening_style: trimText(formValues.opening_style) || '未设定',
    supplemental_setting: supplementalSetting,
    补充设定: supplementalSetting,
    custom_opening_setting: customOpeningSetting,
    开场自定义: customOpeningSetting,
    用户要求的自定义开场设定: customOpeningSetting,
    user_job: trimText(formValues.pre_disaster_identity) || '未设定',
    剧情基调: trimText(formValues.early_story_tone) || '未设定',
    story_tone: trimText(formValues.early_story_tone) || '未设定',
    文风: trimText(formValues.opening_style) || '未设定',
    writing_style: trimText(formValues.opening_style) || '未设定',
    min_words: wordCount,
    字数: wordCount,
    shelter_ability_summary: shelterAbilitySummary,
    庇护所能力变量: shelterAbilitySummary,
    financial_level: financialLevel,
    资金水平: financialLevel,
    pre_disaster_contacts: preDisasterContacts,
    灾前人脉: preDisasterContacts,
    stockpile_focus: stockpileFocus,
    囤积方向: stockpileFocus,
    story_template: getOpeningStoryTemplateId(payload),
    是否为同人作品: isFanwork,
    is_fanwork: isFanwork,
    作品名: fanworkName,
    fanwork_name: fanworkName,
    题材: genericGenre,
    generic_genre: genericGenre,
    主人公背景: protagonistBackground,
    protagonist_background: protagonistBackground,
    用户开场场景: openingScene,
    opening_scene: openingScene,
    用户开场地点: trimText(payload.meta.location) || '未设定',
    opening_location: trimText(payload.meta.location) || '未设定',
    用户要求: userRequirements,
    user_requirements: userRequirements,
  };
}

export function resolveOpeningPromptTemplateRaw(
  worldModeId: string,
  storyTemplate = OPENING_STORY_TEMPLATE_WINTER,
): string {
  if (storyTemplate === OPENING_STORY_TEMPLATE_GENERIC) return String(openingPromptTemplateGenericStoryRaw ?? '');
  const normalizedId = trimText(worldModeId);
  if (normalizedId === 'A') return String(openingPromptTemplatePreDisasterRaw ?? '');
  return String(openingPromptTemplateRaw ?? '');
}

export function buildOpeningGeneratePrompt(preset: OpeningPreset, payload: OpeningPayload): string {
  const context = buildOpeningPromptContext(preset, payload);
  const templateRaw = resolveOpeningPromptTemplateRaw(payload.world_mode_id, getOpeningStoryTemplateId(payload));
  const compiledTemplate = compileOpeningPromptTemplate(String(templateRaw ?? '').trim(), context);
  const finalTemplate = typeof substitudeMacros === 'function' ? substitudeMacros(compiledTemplate) : compiledTemplate;

  return [
    finalTemplate,
    '输出格式：<content>正文</content> <option>后续剧情推进选项，格式为 A.${10字以内的选项文本} 每个选项单独一行，确保4个选项放在同一个标签内</option> ',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function extractTaggedBlock(raw: string, tagName: string): string {
  const source = String(raw ?? '');
  const match = source.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return String(match?.[1] ?? '').trim();
}

export function extractTaggedBlockLoose(raw: string, tagName: string): string {
  const source = String(raw ?? '');
  const startTag = `<${tagName}>`;
  const endTag = `</${tagName}>`;
  const startIndex = source.toLowerCase().indexOf(startTag.toLowerCase());
  if (startIndex < 0) return '';
  const contentStart = startIndex + startTag.length;
  const endIndex = source.toLowerCase().indexOf(endTag.toLowerCase(), contentStart);
  const sliced = endIndex >= 0 ? source.slice(contentStart, endIndex) : source.slice(contentStart);
  return String(sliced ?? '').trim();
}

function removeTaggedBlock(raw: string, tagName: string): string {
  return String(raw ?? '')
    .replace(new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`, 'gi'), '')
    .trim();
}

export function extractOpeningContent(raw: string): string {
  return extractTaggedBlock(raw, 'content') || removeTaggedBlock(raw, 'option');
}

export function extractOpeningContentLoose(raw: string): string {
  return extractTaggedBlockLoose(raw, 'content') || removeTaggedBlock(raw, 'option');
}

export function extractOpeningOptions(raw: string): string[] {
  const optionBlock = extractTaggedBlock(raw, 'option') || extractTaggedBlockLoose(raw, 'option');
  const taggedOptions = optionBlock
    .split('\n')
    .map(line => line.replace(/^(?:[-*•]+|\d+[.)、]|[（(]?\d+[)）、])\s*/, '').trim())
    .filter(Boolean);

  if (taggedOptions.length > 0) return taggedOptions;

  return String(raw ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^(?:【|\[)?[A-Da-d](?:】|\]|\.|、|\))\s*/.test(line))
    .map(line => line.replace(/^(?:【|\[)?[A-Da-d](?:】|\]|\.|、|\))\s*/, '').trim())
    .filter(Boolean);
}

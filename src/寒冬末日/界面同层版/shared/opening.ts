import YAML from 'yaml';

import openingPromptTemplateRaw from '../../../../docs/OpeningSetupPanel.generate提示词.txt?raw';
import shelterAbilityRaw from '../../世界书/寒冬末日/庇护所升级能力.txt?raw';
import externalFactionRaw from '../../世界书/寒冬末日/外部幸存者势力.txt?raw';
import initVarRaw from '../../世界书/寒冬末日/[initvar].yaml?raw';
import muXiaoxiaoRaw from '../../世界书/寒冬末日/角色详情_-_慕小小.txt?raw';
import dorothyRaw from '../../世界书/寒冬末日/角色详情_-_桃乐丝・泽巴哈.txt?raw';
import zhaoWeiguoRaw from '../../世界书/寒冬末日/角色档案_-_赵卫国.txt?raw';
import linYuehuaRaw from '../../世界书/寒冬末日/角色档案_-_林月华.txt?raw';
import chenXueRaw from '../../世界书/寒冬末日/角色档案_-_陈雪.txt?raw';
import wangJingRaw from '../../世界书/寒冬末日/角色档案_-__王静.txt?raw';
import worldModeProfilesRaw from '../../世界书/寒冬末日/世界观配置集.yaml?raw';
import routeProfilesRaw from '../../世界书/寒冬末日/主流派起始偏置表.yaml?raw';
import openingPresetRaw from './opening-preset.default.json';
import { OpeningPayloadSchema, OpeningPresetSchema, type OpeningPayload, type OpeningPreset } from './opening.schema';

export const OPENING_CHAT_STATE_PATH = 'stream_demo.opening';
export const OPENING_MESSAGE_ID = 0;

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
const __initVarDoc = parseYamlDocument(initVarRaw);

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

function buildDefaultOpeningFormValues(preset: OpeningPreset): Record<string, string> {
  return Object.fromEntries(
    preset.form_schema.map(field => {
      if (field.key === 'shelter_ability_summary') {
        return [field.key, getDefaultShelterAbilitySummary()];
      }
      if (field.key === 'nearby_factions') {
        return [field.key, getDefaultNearbyFactions()];
      }
      if (field.key === 'nearby_survivor_types') {
        return [field.key, getDefaultNearbySurvivorTypes()];
      }
      return [field.key, trimText(field.default_value)];
    }),
  );
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

function getDefaultNearbyFactions(): string {
  const source = String(externalFactionRaw ?? '');
  const matches = Array.from(source.matchAll(/势力[一二三四五六七八九十]：([^\r\n(]+)/g))
    .map(match => trimText(match[1]))
    .filter(Boolean);

  if (matches.length > 0) {
    return matches.join('；');
  }

  const early = ['地下停车场/地铁站难民', '超市/便利店废墟据点', '医院急诊楼幸存者'];
  return early.join('；');
}

function getDefaultNearbySurvivorTypes(): string {
  const sources = [muXiaoxiaoRaw, dorothyRaw, zhaoWeiguoRaw, linYuehuaRaw, chenXueRaw, wangJingRaw].map(item =>
    String(item ?? ''),
  );
  const identities = new Set<string>();

  sources.forEach(source => {
    const matches = [
      ...Array.from(source.matchAll(/identity:\s*([^\r\n]+)/g)).map(match => trimText(match[1])),
      ...Array.from(source.matchAll(/public:\s*([^\r\n]+)/g)).map(match => trimText(match[1])),
    ];

    matches.forEach(value => {
      value
        .split('/')
        .map(item => trimText(item))
        .filter(Boolean)
        .filter(
          item =>
            !item.includes('{{user}}') &&
            !item.includes('邻居') &&
            !item.includes('表妹') &&
            !item.includes('姐姐') &&
            !item.includes('妹妹'),
        )
        .forEach(item => identities.add(item));
    });
  });

  const floorResidentsSpeech = trimText(_.get(__initVarDoc, ['楼层其他住户', '言语'], ''));
  const floorResidentsBehavior = trimText(_.get(__initVarDoc, ['楼层其他住户', '行为'], ''));

  const identityText = Array.from(identities).slice(0, 8).join('；');
  return [identityText, floorResidentsSpeech, floorResidentsBehavior].filter(Boolean).join('；') || '未设定';
}

function normalizeOpeningState(input: unknown): OpeningPayload['state'] {
  const value = trimText(input);
  if (value === 'ready' || value === 'generating' || value === 'configuring') return value;
  return 'placeholder';
}

function migrateOpeningPayload(raw: unknown, preset: OpeningPreset): OpeningPayload {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const nextFormValues = buildDefaultOpeningFormValues(preset);
  const rawFormValues = (_.get(source, 'form_values', null) ?? null) as Record<string, unknown> | null;
  const rawUserInput = (_.get(source, 'user_input', {}) ?? {}) as Record<string, unknown>;
  const rawUserDraft = (_.get(source, 'user_draft', {}) ?? {}) as Record<string, unknown>;

  preset.form_schema.forEach(field => {
    const key = field.key;
    const value = rawFormValues?.[key] ?? rawUserDraft[key] ?? rawUserInput[key] ?? field.default_value;
    nextFormValues[key] = trimText(value);
  });

  const legacyContent = trimText(_.get(source, 'opening_content', ''));
  const legacyOptions = Array.isArray(_.get(source, 'options', []))
    ? (_.get(source, 'options', []) as unknown[]).map(item => trimText(item)).filter(Boolean)
    : [];
  const rawResult = (_.get(source, 'result', null) ?? null) as Record<string, unknown> | null;
  const nextResult =
    rawResult || legacyContent || legacyOptions.length > 0
      ? {
          raw: trimText(rawResult?.raw ?? legacyContent),
          content: trimText(rawResult?.content ?? legacyContent),
          options: Array.isArray(rawResult?.options)
            ? (rawResult.options as unknown[]).map(item => trimText(item)).filter(Boolean)
            : legacyOptions,
          generated_at: trimText(rawResult?.generated_at),
        }
      : null;

  const nextStateSource = normalizeOpeningState(_.get(source, 'state', 'placeholder'));
  const nextState = nextResult
    ? ['ready', 'generating'].includes(nextStateSource)
      ? nextStateSource
      : 'ready'
    : nextStateSource === 'placeholder'
      ? 'placeholder'
      : nextStateSource === 'generating'
        ? 'generating'
        : nextFormValues && Object.values(nextFormValues).some(Boolean)
          ? 'configuring'
          : 'placeholder';

  return OpeningPayloadSchema.parse({
    version: 2,
    state: nextState,
    world_mode_id: _.get(source, 'world_mode_id', getDefaultWorldModeId()),
    route_id: _.get(source, 'route_id', getDefaultRouteId(_.get(source, 'world_mode_id', getDefaultWorldModeId()))),
    use_stream: _.get(source, 'use_stream', false),
    meta: {
      time: compactText(_.get(source, 'meta.time', preset.default_meta.time)),
      location: compactText(_.get(source, 'meta.location', preset.default_meta.location)),
      character: compactText(_.get(source, 'meta.character', preset.default_meta.character)),
    },
    form_values: nextFormValues,
    result:
      nextResult && (nextResult.raw || nextResult.content || nextResult.options.length > 0 || nextResult.generated_at)
        ? nextResult
        : null,
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
  return getOpeningRoutes()[0]?.name || '养';
}

export function getDefaultOpeningPreset(): OpeningPreset {
  return OpeningPresetSchema.parse(openingPresetRaw);
}

export function getDefaultOpeningPayload(preset = getDefaultOpeningPreset()): OpeningPayload {
  const world_mode_id = getDefaultWorldModeId();
  const route_id = getDefaultRouteId(world_mode_id);

  return OpeningPayloadSchema.parse({
    version: 2,
    state: 'placeholder',
    world_mode_id,
    route_id,
    use_stream: false,
    meta: preset.default_meta,
    form_values: buildDefaultOpeningFormValues(preset),
    result: null,
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

export function replaceOpeningPayloadInChat(payload: OpeningPayload) {
  try {
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        _.set(vars, OPENING_CHAT_STATE_PATH, OpeningPayloadSchema.parse(payload));
        return vars;
      },
      { type: 'chat' },
    );
  } catch {
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
  const view = OPENING_AXIS_VIEW.find(item => item.axisKey === axisName);
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

function buildWorldModeSummary(worldMode: OpeningWorldModeOption | null): string {
  if (!worldMode) return '未设定';
  return [worldMode.environment_summary, worldMode.threat_summary, worldMode.society_summary, worldMode.route_hint]
    .filter(Boolean)
    .join('；');
}

function fillTemplateValue(context: Record<string, string>, key: string): string {
  return trimText(context[key]) || '未设定';
}

export function compileOpeningPromptTemplate(template: string, context: Record<string, string>): string {
  return String(template ?? '')
    .replace(/\{\{\s*([^{}\n]+?)\s*\}\}/g, (_match, key: string) => fillTemplateValue(context, trimText(key)))
    .replace(/(?<!\{)\{\s*([^{}\n]+?)\s*\}(?!\})/g, (_match, key: string) => fillTemplateValue(context, trimText(key)));
}

export function buildOpeningPromptContext(preset: OpeningPreset, payload: OpeningPayload): Record<string, string> {
  const worldMode = getOpeningWorldMode(payload.world_mode_id);
  const route = getOpeningRoute(payload.route_id);
  const formValues = payload.form_values ?? {};
  const worldModeAxisDictionary = buildWorldModeAxisDictionary(worldMode);
  const forbiddenDrift = route?.forbidden_drift.join('；') || '未设定';
  const shelterAbilitySummary = trimText(formValues.shelter_ability_summary) || getDefaultShelterAbilitySummary();
  const nearbyFactions = trimText(formValues.nearby_factions) || getDefaultNearbyFactions();
  const nearbySurvivorTypes = trimText(formValues.nearby_survivor_types) || getDefaultNearbySurvivorTypes();
  const supplementalSetting = trimText(formValues.supplemental_setting) || '未设定';
  const wordCount = trimText(formValues.word_count) || '1500';
  const worldVariable = [worldModeAxisDictionary, `边界约束：${forbiddenDrift}`].filter(Boolean).join('\n');

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
    forbidden_drift: forbiddenDrift,
    世界观变量: worldVariable,
    world_variable: worldVariable,
    pre_disaster_identity: trimText(formValues.pre_disaster_identity) || '未设定',
    early_story_tone: trimText(formValues.early_story_tone) || '未设定',
    opening_style: trimText(formValues.opening_style) || '未设定',
    supplemental_setting: supplementalSetting,
    补充设定: supplementalSetting,
    user_job: trimText(formValues.pre_disaster_identity) || '未设定',
    剧情基调: trimText(formValues.early_story_tone) || '未设定',
    story_tone: trimText(formValues.early_story_tone) || '未设定',
    文风: trimText(formValues.opening_style) || '未设定',
    writing_style: trimText(formValues.opening_style) || '未设定',
    min_words: wordCount,
    字数: wordCount,
    shelter_ability_summary: shelterAbilitySummary,
    庇护所能力变量: shelterAbilitySummary,
    nearby_factions: nearbyFactions,
    社会组织: nearbyFactions,
    nearby_survivor_types: nearbySurvivorTypes,
    其他幸存者类别: nearbySurvivorTypes,
  };
}

export function buildOpeningGeneratePrompt(preset: OpeningPreset, payload: OpeningPayload): string {
  const context = buildOpeningPromptContext(preset, payload);
  const compiledTemplate = compileOpeningPromptTemplate(String(openingPromptTemplateRaw ?? '').trim(), context);
  const finalTemplate = typeof substitudeMacros === 'function' ? substitudeMacros(compiledTemplate) : compiledTemplate;

  return [
    finalTemplate,
    '输出要求：只输出 <content>...</content>，可选输出一个 <option>...</option> 作为开局后的可选行动。',
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

export function extractOpeningContent(raw: string): string {
  return extractTaggedBlock(raw, 'content') || String(raw ?? '').trim();
}

export function extractOpeningContentLoose(raw: string): string {
  return extractTaggedBlockLoose(raw, 'content') || String(raw ?? '').trim();
}

export function extractOpeningOptions(raw: string): string[] {
  const optionBlock = extractTaggedBlock(raw, 'option');
  return optionBlock
    .split('\n')
    .map(line => line.replace(/^(?:[-*•]+|\d+[.)、]|[（(]?\d+[)）、])\s*/, '').trim())
    .filter(Boolean);
}

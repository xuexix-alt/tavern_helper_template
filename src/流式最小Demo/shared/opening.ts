import YAML from 'yaml';

import worldModeProfilesRaw from '../../寒冬末日/世界书/寒冬末日/世界观配置集.yaml?raw';
import routeProfilesRaw from '../../寒冬末日/世界书/寒冬末日/主流派起始偏置表.yaml?raw';
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

function normalizeStringList(input: unknown): string[] {
  return Array.isArray(input) ? input.map(item => String(item ?? '').trim()).filter(Boolean) : [];
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
    version: 1,
    state: 'placeholder',
    preset_id: preset.preset_id,
    world_mode_id,
    route_id,
    use_stream: false,
    base: {
      world_intro: preset.world_intro,
      first_line: preset.first_line,
    },
    meta: preset.default_meta,
    user_input: Object.fromEntries(
      preset.form_schema.map(field => [field.key, String(field.default_value ?? '').trim()]),
    ),
    streaming_raw: '',
    world_mode_brief: '',
    prompt_echo: '',
    opening_content: '',
    options: [],
    update_variable_block: '',
  });
}

export function readOpeningPayloadFromChat(): OpeningPayload | null {
  try {
    const vars = getVariables?.({ type: 'chat' }) ?? {};
    const raw = _.get(vars, OPENING_CHAT_STATE_PATH, null);
    if (!raw) return null;
    return OpeningPayloadSchema.parse(raw);
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

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value))
    return value
      .map(item => String(item ?? '').trim())
      .filter(Boolean)
      .join(' / ');
  if (typeof value === 'object') {
    const pairs = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${stringifyValue(item)}`)
      .filter(Boolean);
    return pairs.join('；');
  }
  return String(value ?? '').trim();
}

function buildWorldModePromptBlock(worldMode: OpeningWorldModeOption | null): string[] {
  if (!worldMode) return ['<world_mode_profile>', '未选择世界观档位', '</world_mode_profile>'];

  return [
    '<world_mode_profile>',
    `<id>${worldMode.id}</id>`,
    `<name>${worldMode.name}</name>`,
    `<slogan>${worldMode.slogan}</slogan>`,
    `<core_pleasure>${worldMode.core_pleasure}</core_pleasure>`,
    `<recommended_main_route>${worldMode.recommended_main_route}</recommended_main_route>`,
    '<environment>',
    ...Object.entries(worldMode.environment).map(([key, value]) => `- ${key}: ${stringifyValue(value)}`),
    '</environment>',
    '<axes>',
    ...Object.entries(worldMode.axes).map(([key, value]) => `- ${key}: ${stringifyValue(value)}`),
    '</axes>',
    `<environment_summary>${worldMode.environment_summary}</environment_summary>`,
    `<threat_summary>${worldMode.threat_summary}</threat_summary>`,
    `<society_summary>${worldMode.society_summary}</society_summary>`,
    `<route_hint>${worldMode.route_hint}</route_hint>`,
    '</world_mode_profile>',
  ];
}

function buildRoutePromptBlock(route: OpeningRouteOption | null): string[] {
  if (!route) return ['<route_profile>', '未选择主流派', '</route_profile>'];

  return [
    '<route_profile>',
    `<id>${route.id}</id>`,
    `<name>${route.name}</name>`,
    `<core_fantasy>${route.core_fantasy}</core_fantasy>`,
    `<world_lens>${route.world_lens}</world_lens>`,
    '<recommended_world_modes>',
    route.recommended_world_modes.length > 0
      ? route.recommended_world_modes.map(item => `- ${item}`).join('\n')
      : '- 无',
    '</recommended_world_modes>',
    '<guaranteed_opening_elements>',
    route.guaranteed_opening_elements.length > 0
      ? route.guaranteed_opening_elements.map(item => `- ${item}`).join('\n')
      : '- 无',
    '</guaranteed_opening_elements>',
    '<starting_liabilities>',
    route.starting_liabilities.length > 0 ? route.starting_liabilities.map(item => `- ${item}`).join('\n') : '- 无',
    '</starting_liabilities>',
    '<opening_conflict_sources>',
    route.opening_conflict_sources.length > 0
      ? route.opening_conflict_sources.map(item => `- ${item}`).join('\n')
      : '- 无',
    '</opening_conflict_sources>',
    '<forbidden_drift>',
    route.forbidden_drift.length > 0 ? route.forbidden_drift.map(item => `- ${item}`).join('\n') : '- 无',
    '</forbidden_drift>',
    '</route_profile>',
  ];
}

export function buildOpeningPrompt(preset: OpeningPreset, payload: OpeningPayload): string {
  const worldMode = getOpeningWorldMode(payload.world_mode_id);
  const route = getOpeningRoute(payload.route_id);
  const labelMap = new Map(preset.form_schema.map(field => [field.key, field.label]));
  const userBlocks = Object.entries(payload.user_input)
    .map(([key, value]) => ({ key, label: labelMap.get(key) || key, value: String(value ?? '').trim() }))
    .filter(entry => entry.value)
    .map(entry => `- ${entry.label}: ${entry.value}`)
    .join('\n');

  return [
    '<opening_setup>',
    `<world_intro>${payload.base.world_intro}</world_intro>`,
    `<first_line>${payload.base.first_line}</first_line>`,
    '<meta>',
    `<time>${payload.meta.time}</time>`,
    `<location>${payload.meta.location}</location>`,
    `<character>${payload.meta.character}</character>`,
    '</meta>',
    ...buildWorldModePromptBlock(worldMode),
    ...buildRoutePromptBlock(route),
    '<user_choice>',
    userBlocks || '- 无额外用户输入',
    '</user_choice>',
    '</opening_setup>',
    '',
    '【导演版开场任务】',
    '你现在不是在解释设定，而是在生成“本局第一幕”。',
    'opening 必须优先采用“灾变递进蒙太奇 + 当前时刻切入”的结构，而不是纯说明文。',
    '你必须通过住户片段、温度体感、系统播报、观察接口与可干预边界来写世界。',
    '',
    '【必须出现的结构】',
    '1. 用 2~4 个时间节点快速展示灾变如何升级。',
    '2. 至少给出 2~4 个具体房间、人物或小群体的生存切片。',
    '3. 明确制造“2001 庇护所内部”与“外界生存状态”的强反差。',
    '4. 结尾必须以伊甸系统的播报、扫描结果或干预提问收尾。',
    '',
    '【能力展示规则】',
    '不要罗列技能说明书。只能通过玩家体感、系统播报、扫描信息、观察接口、可干预边界来体现庇护所能力。',
    '必须同时体现“能做什么”与“还做不到什么”。禁止把庇护所写成无所不能的神明系统。',
    '',
    '【人物与动机规则】',
    '主角默认是庇护所的主人。若主角名为 {{user}}，将其视为玩家默认姓名宏；若用户手动填写姓名，则以用户填写为准。',
    '必须体现主角面对“想救人”与“必须权衡效率、风险、资源、优先级”之间的矛盾。',
    '',
    '你需要把“前期剧情基调”视为本局 opening 的强指导要求。',
    '你需要把“开局风格”视为正文文风和镜头组织方式的强指导要求，不能空表运转。',
    '“末日前职业/身份（选填）”“个人简介（选填）”“补充设定（选填）”若被填写，必须体现在 opening 的人物理解、镜头重点或冲突组织中。',
    '若这些选填字段为空，不得擅自补写夸张背景。',
    '',
    '【content 最低完成标准】',
    '至少 1 个系统压力、至少 1 个尚未解决的短板、至少 1 个立即可做的现实选择、至少 1 个流派专属爽点入口、至少 1 个与世界观档位匹配的外部矛盾源。',
    '不得把所有问题在 opening 中直接解决，不得把 build 写成万能，不得忽略约束协议层。',
    '',
    '请先输出 <world_mode_brief>，只对本局世界运行状态做极短摘要。',
    '你必须严格遵守给定世界观配置与主流派偏置，不得改写硬参数，不得发明配置外的新规则。',
    '然后输出 <opening_prompt_echo>，简要回显你理解到的开局设定。',
    '再输出 <content> 作为正式开局剧情正文。',
    '如有可选分支，再输出 <option>。',
    '在 <option> 之后，你必须输出一个完整的变量更新块，格式必须严格如下：',
    '<UpdateVariable>',
    '<Analysis>',
    '……',
    '</Analysis>',
    '<JSONPatch>',
    '……',
    '</JSONPatch>',
    '</UpdateVariable>',
    '[后续其他要求的标签]',
    '其中 `<UpdateVariable>` 块不能省略，且必须包含 `<Analysis>` 和 `<JSONPatch>` 两部分。',
    '不要遗漏标签，不要交换顺序，不要把 JSONPatch 写到别的标签里。',
    '除 `world_mode_brief / opening_prompt_echo / content / option / UpdateVariable` 及其后续必要标签外，不要输出无关结构。',
    '',
    `前期剧情基调：${payload.user_input.early_story_tone || '未指定，请结合主流派与世界观自然推导'}`,
    `开局风格偏好：${payload.user_input.opening_style || '轻小说叙事'}`,
  ].join('\n');
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

export function extractOpeningWorldModeBrief(raw: string): string {
  return extractTaggedBlock(raw, 'world_mode_brief');
}

export function extractOpeningWorldModeBriefLoose(raw: string): string {
  return extractTaggedBlockLoose(raw, 'world_mode_brief');
}

export function extractOpeningContent(raw: string): string {
  return extractTaggedBlock(raw, 'content') || String(raw ?? '').trim();
}

export function extractOpeningContentLoose(raw: string): string {
  return extractTaggedBlockLoose(raw, 'content') || String(raw ?? '').trim();
}

export function extractOpeningPromptEcho(raw: string): string {
  return extractTaggedBlock(raw, 'opening_prompt_echo');
}

export function extractOpeningPromptEchoLoose(raw: string): string {
  return extractTaggedBlockLoose(raw, 'opening_prompt_echo');
}

export function extractUpdateVariableBlock(raw: string): string {
  return extractTaggedBlock(raw, 'UpdateVariable');
}

export function extractUpdateVariableBlockLoose(raw: string): string {
  return extractTaggedBlockLoose(raw, 'UpdateVariable');
}

export function extractOpeningOptions(raw: string): string[] {
  const optionBlock = extractTaggedBlock(raw, 'option');
  return optionBlock
    .split('\n')
    .map(line => line.replace(/^(?:[-*•]+|\d+[.)、]|[（(]?\d+[)）、])\s*/, '').trim())
    .filter(Boolean);
}

export function formatUpdateVariableBlock(raw: string): string {
  const content = String(raw ?? '').trim();
  if (!content) return '';
  return ['<UpdateVariable>', content, '</UpdateVariable>'].join('\n');
}

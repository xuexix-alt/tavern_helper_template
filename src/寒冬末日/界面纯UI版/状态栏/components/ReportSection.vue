<template>
  <section class="section report-section">
    <div class="report-inline-body">
      <div v-if="loading" class="report-loading">
        <div class="report-spinner"></div>
        <div class="report-loading-text">正在读取变量与日志…</div>
      </div>

      <div v-else-if="errorText" class="report-error">
        <div class="report-error-title">生成失败</div>
        <div class="report-error-detail">{{ errorText }}</div>
      </div>

      <template v-else>
        <div class="report-duo">
          <div class="report-pane report-pane--digest">
            <div class="report-pane-tab active">
              <span>汇总摘要</span>
              <button class="report-btn compact inline" type="button" :disabled="loading" @click="refreshReport">
                {{ loading ? '刷新中…' : '刷新' }}
              </button>
            </div>
            <div class="report-pane-body report-pane-body--digest">
              <div class="report-quick-list">
                <div
                  v-for="(line, idx) in quickDigestLines"
                  :key="line.key"
                  class="report-quick-line"
                  :class="line.tone"
                >
                  <div class="report-quick-index">0{{ idx + 1 }}</div>
                  <div class="report-quick-content">
                    <div class="report-quick-label">{{ line.label }}</div>
                    <div v-if="line.tokens && line.tokens.length > 0" class="report-quick-interactive">
                      <div
                        v-if="!line.hideTextWhenTokens"
                        class="report-quick-text report-quick-text--interactive"
                        :class="{ 'report-quick-text--multi': line.multiline }"
                      >
                        <TextHighlight :text="line.text" :query="query" />
                      </div>
                      <div class="report-quick-token-row" :class="{ 'is-stack': line.tokenLayout === 'stack' }">
                        <button
                          v-for="token in line.tokens"
                          :key="token.id"
                          type="button"
                          class="report-quick-token"
                          :class="{ active: activeQuickTokenId === token.id, disabled: token.items.length === 0 }"
                          :disabled="token.items.length === 0"
                          @click.stop="token.items.length > 0 && toggleQuickToken(token.id)"
                        >
                          {{ token.label }}
                        </button>
                      </div>
                    </div>
                    <div v-else class="report-quick-text">
                      <TextHighlight :text="line.text" :query="query" />
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="activeTokenContext" class="report-float-pop" @click.stop>
                <div class="report-float-pop-head">
                  <div class="report-float-pop-title">{{ activeTokenContext.token.popupTitle }}</div>
                  <button class="report-float-pop-close" type="button" @click.stop="activeQuickTokenId = null">
                    关闭
                  </button>
                </div>
                <ul class="report-float-pop-list">
                  <li
                    v-for="(item, itemIdx) in activeTokenContext.token.items"
                    :key="`${activeTokenContext.token.id}:${itemIdx}`"
                  >
                    {{ item }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import _ from 'lodash';
import { diffWorldHours } from '../../../util/time';
import { normalizeRoomTag } from '../../../util/room';
import { resolveViewMessageId } from '../../viewMessage';
import TextHighlight from './TextHighlight.vue';

type ReportSource = '脚本' | 'AI' | '系统' | '未知';

type ReportRow = {
  key: string;
  title: string;
  detail: string;
  source?: ReportSource;
};

type ReportSection = {
  key: string;
  title: string;
  items: ReportRow[];
  emptyText?: string;
};

type ReportResult = {
  summary: string;
  sections: ReportSection[];
  briefs: {
    time: string;
    overview: string;
    focus: string;
    roll: string;
    mission: string;
    status: string;
    change: string;
  };
  details: {
    missionStage: string[];
    missionGoals: string[];
    intel: string[];
    stageOn: string[];
    onstageTotal: number;
    deaths: string[];
    stageOff: string[];
    roomMoves: string[];
    healthChanges: string[];
    impChanges: string[];
    thoughtChanges: string[];
    others: string[];
    aiUpdatedFields: string[];
    scriptUpdatedFields: string[];
    currentStageShort: string;
    shelterLevel: number | null;
    roll: string[];
    shelter: string[];
  };
};

type PatchOp = { op?: string; path?: string; value?: any };

type QuickToken = {
  id: string;
  label: string;
  popupTitle: string;
  items: string[];
};

type QuickLine = {
  key: string;
  label: string;
  text: string;
  tone: 'summary' | 'focus' | 'hint';
  multiline?: boolean;
  tokenLayout?: 'wrap' | 'stack';
  hideTextWhenTokens?: boolean;
  tokens?: QuickToken[];
};

type EdenLog = {
  ts?: string;
  level?: string;
  event?: string;
  zh?: string;
  data?: string;
};

const props = withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);
const query = computed(() => props.query ?? '');

const loading = ref(false);
const errorText = ref('');
const report = ref<ReportResult | null>(null);
const activeQuickTokenId = ref<string | null>(null);

function compactDigestText(text: string, maxLen = 58): string {
  const normalized = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLen - 1))}…`;
}

const quickDigestLines = computed<QuickLine[]>(() => {
  const briefs = report.value?.briefs;
  const details = report.value?.details;
  const aiCount = details?.aiUpdatedFields.length ?? 0;
  const scriptCount = details?.scriptUpdatedFields.length ?? 0;
  const rollLineText = `今日roll点：${briefs?.roll || '暂无记录'}`;

  return [
    {
      key: 'quick_01',
      label: '状态',
      text: compactDigestText(briefs?.status || '登场0/0 · 死亡0 · 离场0 · 庇护所等级？', 64),
      tone: 'focus',
      hideTextWhenTokens: true,
      tokens: [
        {
          id: 'token_status_on',
          label: `登场${details?.stageOn.length ?? 0}/${details?.onstageTotal ?? 0}`,
          popupTitle: '当前新增登场',
          items: details?.stageOn ?? [],
        },
        {
          id: 'token_status_dead',
          label: `死亡${details?.deaths.length ?? 0}`,
          popupTitle: '角色死亡',
          items: details?.deaths ?? [],
        },
        {
          id: 'token_status_off',
          label: `离场${details?.stageOff.length ?? 0}`,
          popupTitle: '角色离场',
          items: details?.stageOff ?? [],
        },
        {
          id: 'token_status_shelter',
          label: `庇护所等级${details?.shelterLevel ?? '？'}`,
          popupTitle: '庇护所相关变化',
          items: details?.shelter ?? [],
        },
      ],
    },
    {
      key: 'quick_02',
      label: '时间',
      text: compactDigestText(briefs?.time || '时间：跨+0天 · 约0.0小时 · --:--', 64),
      tone: 'summary',
    },
    {
      key: 'quick_03',
      label: '快报',
      text: rollLineText,
      tone: 'hint',
      tokenLayout: 'wrap',
      tokens: [
        {
          id: 'token_roll_ai',
          label: `AI更新${aiCount}项`,
          popupTitle: 'AI 更新字段',
          items: details?.aiUpdatedFields ?? [],
        },
        {
          id: 'token_roll_script',
          label: `脚本更新${scriptCount}项`,
          popupTitle: '脚本更新字段',
          items: details?.scriptUpdatedFields ?? [],
        },
      ],
    },
    {
      key: 'quick_04',
      label: '任务',
      text: compactDigestText(briefs?.mission || '任务：当前阶段? · 任务目标0 · 情报0', 64),
      tone: 'summary',
      hideTextWhenTokens: true,
      tokens: [
        {
          id: 'token_mission_stage',
          label: `当前${details?.currentStageShort ?? '阶段?'}`,
          popupTitle: '主线阶段变化',
          items: details?.missionStage ?? [],
        },
        {
          id: 'token_mission_goal',
          label: `任务目标${details?.missionGoals.length ?? 0}`,
          popupTitle: '阶段目标变化',
          items: details?.missionGoals ?? [],
        },
        {
          id: 'token_mission_intel',
          label: `情报${details?.intel.length ?? 0}`,
          popupTitle: '情报碎片变化',
          items: details?.intel ?? [],
        },
      ],
    },
    {
      key: 'quick_05',
      label: '角色信息变动',
      text: `房间${details?.roomMoves.length ?? 0} · 健康${details?.healthChanges.length ?? 0} · 其他${details?.others.length ?? 0}`,
      tone: 'summary',
      hideTextWhenTokens: true,
      tokens: [
        {
          id: 'token_change_room',
          label: `房间${details?.roomMoves.length ?? 0}`,
          popupTitle: '房间移动',
          items: details?.roomMoves ?? [],
        },
        {
          id: 'token_change_health',
          label: `健康${details?.healthChanges.length ?? 0}`,
          popupTitle: '健康变化',
          items: details?.healthChanges ?? [],
        },
        {
          id: 'token_change_other',
          label: `其他${details?.others.length ?? 0}`,
          popupTitle: '其他字段变化',
          items: details?.others ?? [],
        },
      ],
    },
    {
      key: 'quick_06',
      label: '角色信息变动2',
      text: `IMP${details?.impChanges.length ?? 0} · 想法${details?.thoughtChanges.length ?? 0}`,
      tone: 'hint',
      hideTextWhenTokens: true,
      tokens: [
        {
          id: 'token_change_imp',
          label: `IMP${details?.impChanges.length ?? 0}`,
          popupTitle: 'IMP 变化',
          items: details?.impChanges ?? [],
        },
        {
          id: 'token_change_thought',
          label: `想法${details?.thoughtChanges.length ?? 0}`,
          popupTitle: '内心想法变化',
          items: details?.thoughtChanges ?? [],
        },
      ],
    },
  ];
});

const activeTokenContext = computed<{ line: QuickLine; token: QuickToken } | null>(() => {
  const tokenId = activeQuickTokenId.value;
  if (!tokenId) return null;
  for (const line of quickDigestLines.value) {
    const token = line.tokens?.find(item => item.id === tokenId);
    if (token) return { line, token };
  }
  return null;
});

function toggleQuickToken(tokenId: string) {
  activeQuickTokenId.value = activeQuickTokenId.value === tokenId ? null : tokenId;
}

function onDocumentClick() {
  if (activeQuickTokenId.value) activeQuickTokenId.value = null;
}

async function refreshReport() {
  if (loading.value) return;
  loading.value = true;
  errorText.value = '';
  activeQuickTokenId.value = null;
  try {
    report.value = await buildReport();
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : String(err ?? '未知错误');
  } finally {
    loading.value = false;
  }
}

function jsonPointerToDot(ptr: string): string {
  if (!ptr) return '';
  let s = ptr.replace(/~1/g, '/').replace(/~0/g, '~');
  if (s.startsWith('/')) s = s.slice(1);
  return s
    .split('/')
    .map(seg => seg.trim())
    .filter(Boolean)
    .join('.');
}

function extractJsonPatchOps(raw: string): PatchOp[] {
  if (!raw) return [];
  const m = raw.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/i);
  if (!m) return [];
  const inner = String(m[1] ?? '').trim();
  if (!inner) return [];

  const firstBracket = inner.indexOf('[');
  const lastBracket = inner.lastIndexOf(']');
  const candidate =
    firstBracket >= 0 && lastBracket > firstBracket ? inner.slice(firstBracket, lastBracket + 1) : inner;

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed as PatchOp[];
  } catch {
    // ignore
  }
  return [];
}

function buildAiPathSet(raw: string): Set<string> {
  const ops = extractJsonPatchOps(raw);
  const paths = ops
    .map(op => jsonPointerToDot(String(op?.path ?? '')))
    .filter(Boolean)
    .map(p => (p.startsWith('stat_data.') ? p : p));
  return new Set(paths);
}

function aiTouchedPath(aiPaths: Set<string>, target: string): boolean {
  return pathMatchesSet(aiPaths, target);
}

function pathMatchesSet(pathSet: Set<string>, target: string): boolean {
  if (!target) return false;
  for (const p of pathSet) {
    if (!p) continue;
    if (target === p) return true;
    if (target.startsWith(p + '.')) return true;
    if (p.startsWith(target + '.')) return true;
  }
  return false;
}

function safeParseJson(text: string): any | null {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractRoleNameFromLog(record: EdenLog): string {
  const zh = String(record?.zh ?? '');
  const m = zh.match(/回拨「(.+?)」/);
  if (m?.[1]) return m[1];

  const dataObj = safeParseJson(record?.data ?? '');
  if (dataObj && typeof dataObj === 'object') {
    const role = dataObj.role ?? dataObj.name ?? dataObj.roleName;
    if (typeof role === 'string' && role.trim()) return role.trim();
    const patched = Array.isArray(dataObj.patched) ? dataObj.patched : [];
    if (patched.length > 0 && patched[0]?.name) return String(patched[0].name);
  }

  return '';
}

function parseStageScriptHints(logs: EdenLog[]): { forceOnstage: Set<string>; forceOffstage: Set<string> } {
  const forceOnstage = new Set<string>();
  const forceOffstage = new Set<string>();
  for (const record of logs) {
    const event = String(record?.event ?? '');
    if (!event.includes('stage_sanitize')) continue;
    const name = extractRoleNameFromLog(record);
    if (!name) continue;
    if (event.includes('force_onstage')) forceOnstage.add(name);
    if (event.includes('force_offstage')) forceOffstage.add(name);
  }
  return { forceOnstage, forceOffstage };
}

function pickDailyRollLog(logs: any[], currentId: number | null): any | null {
  if (!Array.isArray(logs) || logs.length === 0) return null;
  if (currentId == null) return logs[logs.length - 1];
  const withId = logs.filter(l => typeof l?.message_id === 'number');
  if (withId.length === 0) return logs[logs.length - 1];
  const exact = withId.find(l => l.message_id === currentId);
  if (exact) return exact;
  const before = withId.filter(l => l.message_id <= currentId).pop();
  return before ?? withId[withId.length - 1];
}

function parseRollText(text: string): { roll: number | null; upgraded: boolean; isGuarantee: boolean } {
  const s = String(text ?? '');
  const isGuarantee = s.includes('保底');
  const upgraded = s.includes('升级') && !s.includes('未升级');
  const m = s.match(/投掷[:：]?\s*(\d+)/);
  const roll = m ? Number(m[1]) : null;
  return { roll: Number.isFinite(roll) ? roll : null, upgraded, isGuarantee };
}

function parseDateToEpochDayLoose(dateStr: string): number | null {
  const m = String(dateStr ?? '').match(/(\d{1,4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 86400000);
}

function extractClockText(timeStr: string): string {
  const m = String(timeStr ?? '').match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? '--:--';
}

function extractStageShort(stageText: string): string {
  const raw = String(stageText ?? '').trim();
  if (!raw) return '阶段?';
  const m = raw.match(/阶段[一二三四五六七八九十百千万0-9]+/);
  return m?.[0] ?? raw;
}

function listRoles(stat_data: any): { core: string[]; temp: string[] } {
  const reserved = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);
  const core: string[] = [];
  for (const [key, val] of Object.entries(stat_data ?? {})) {
    if (reserved.has(key)) continue;
    if (!val || typeof val !== 'object') continue;
    if (!('登场状态' in val) || !('健康' in val)) continue;
    core.push(key);
  }
  const temp: string[] = [];
  const tempNpc = _.get(stat_data, '临时NPC', {});
  if (tempNpc && typeof tempNpc === 'object') {
    for (const [key, val] of Object.entries(tempNpc)) {
      if (!val || typeof val !== 'object') continue;
      if (!('登场状态' in val) || !('健康' in val)) continue;
      temp.push(key);
    }
  }
  return { core, temp };
}

function getRole(stat_data: any, name: string, isTemp: boolean): any {
  return isTemp ? _.get(stat_data, ['临时NPC', name], null) : _.get(stat_data, [name], null);
}

function sourceByPath(aiPaths: Set<string>, path: string, fallback: ReportSource = '脚本'): ReportSource {
  return aiTouchedPath(aiPaths, path) ? 'AI' : fallback;
}

function stripStatDataPrefix(path: string): string {
  return path.startsWith('stat_data.') ? path.slice('stat_data.'.length) : path;
}

function collectChangedLeafPaths(prevValue: any, nextValue: any, basePath: string): string[] {
  const changed: string[] = [];

  const walk = (before: any, after: any, path: string) => {
    if (_.isEqual(before, after)) return;

    const beforeObj = _.isPlainObject(before);
    const afterObj = _.isPlainObject(after);
    if (beforeObj && afterObj) {
      const beforeKeys = Object.keys(before as Record<string, any>);
      const afterKeys = Object.keys(after as Record<string, any>);
      const keys = new Set([...beforeKeys, ...afterKeys]);
      if (keys.size === 0) {
        changed.push(path);
        return;
      }
      for (const key of keys) {
        walk((before as Record<string, any>)[key], (after as Record<string, any>)[key], `${path}.${key}`);
      }
      return;
    }

    if (Array.isArray(before) && Array.isArray(after)) {
      changed.push(path);
      return;
    }

    changed.push(path);
  };

  walk(prevValue, nextValue, basePath);
  return _.uniq(changed.filter(Boolean));
}

async function buildReport(): Promise<ReportResult> {
  await waitGlobalInitialized('Mvu');

  const currentId = Number(resolveViewMessageId({ preferHistory: true }));
  if (!Number.isFinite(currentId)) throw new Error('无法获取当前楼层号');

  const prevId = findPrevMessageId(currentId);

  const currentMvu = Mvu.getMvuData({ type: 'message', message_id: currentId });
  const prevMvu = prevId != null ? Mvu.getMvuData({ type: 'message', message_id: prevId }) : null;

  const currentData = _.get(currentMvu, 'stat_data', {}) ?? {};
  const prevData = _.get(prevMvu, 'stat_data', {}) ?? {};

  const chatVars = typeof getVariables === 'function' ? (getVariables({ type: 'chat' }) ?? {}) : {};
  const edenLogs: EdenLog[] = Array.isArray(_.get(chatVars, 'eden.debug.eden_helper_log'))
    ? _.get(chatVars, 'eden.debug.eden_helper_log')
    : [];
  const rollLogs: any[] = Array.isArray(_.get(chatVars, 'eden.debug.daily_roll_log'))
    ? _.get(chatVars, 'eden.debug.daily_roll_log')
    : [];

  const rawMsg = getChatMessages(currentId)?.[0]?.message ?? '';
  const aiPaths = buildAiPathSet(rawMsg);
  const { forceOnstage, forceOffstage } = parseStageScriptHints(edenLogs);

  const recognizedPaths = new Set<string>();

  const currentWorld = _.get(currentData, '世界', {}) ?? {};
  const prevWorld = _.get(prevData, '世界', {}) ?? {};
  const deltaHours = diffWorldHours(prevWorld, currentWorld);
  const prevEpochDay = parseDateToEpochDayLoose(String(prevWorld?.日期 ?? ''));
  const currentEpochDay = parseDateToEpochDayLoose(String(currentWorld?.日期 ?? ''));
  const crossDays =
    prevEpochDay != null && currentEpochDay != null && currentEpochDay >= prevEpochDay
      ? currentEpochDay - prevEpochDay
      : 0;
  const currentClock = extractClockText(String(currentWorld?.时间 ?? ''));
  const timeBrief = `时间：跨+${crossDays}天 · ${deltaHours != null ? `约${deltaHours.toFixed(1)}小时` : '约0.0小时'} · ${currentClock}`;

  const summaryParts: string[] = [];
  if (currentWorld?.末日天数 != null) summaryParts.push(`末日第 ${currentWorld.末日天数} 天`);
  if (deltaHours != null) summaryParts.push(`时间过去 ${deltaHours.toFixed(1)} 小时`);
  const summaryLead = summaryParts.length > 0 ? `经过了一段时间（${summaryParts.join('，')}）` : '经过了一段时间';
  const summary = `${summaryLead}，发生了以下变化：`;

  const sections: ReportSection[] = [];

  // 时间推进
  const timeItems: ReportRow[] = [];
  if (!_.isEqual(prevWorld?.日期, currentWorld?.日期) || !_.isEqual(prevWorld?.末日天数, currentWorld?.末日天数)) {
    timeItems.push({
      key: 'date',
      title: '日期/天数',
      detail: `${prevWorld?.日期 || '未知'} → ${currentWorld?.日期 || '未知'}（末日第 ${
        currentWorld?.末日天数 ?? '未知'
      } 天）`,
      source: sourceByPath(aiPaths, 'stat_data.世界.日期', 'AI'),
    });
    recognizedPaths.add('stat_data.世界.日期');
    recognizedPaths.add('stat_data.世界.末日天数');
  }
  if (!_.isEqual(prevWorld?.时间, currentWorld?.时间)) {
    timeItems.push({
      key: 'time',
      title: '时间',
      detail: `${prevWorld?.时间 || '未知'} → ${currentWorld?.时间 || '未知'}${
        deltaHours != null ? `（约 ${deltaHours.toFixed(1)} 小时）` : ''
      }`,
      source: sourceByPath(aiPaths, 'stat_data.世界.时间', 'AI'),
    });
    recognizedPaths.add('stat_data.世界.时间');
  }
  if (!_.isEqual(prevWorld?.地址, currentWorld?.地址)) {
    timeItems.push({
      key: 'location',
      title: '地址',
      detail: `${prevWorld?.地址 || '未知'} → ${currentWorld?.地址 || '未知'}`,
      source: sourceByPath(aiPaths, 'stat_data.世界.地址', 'AI'),
    });
    recognizedPaths.add('stat_data.世界.地址');
  }
  sections.push({ key: 'world', title: '时间推进', items: timeItems });

  // ROLL 点
  const shelter = _.get(currentData, '庇护所', {}) ?? {};
  const rollItem: ReportRow[] = [];
  const rollLog = pickDailyRollLog(rollLogs, currentId);
  const rollText = String(shelter?.今日投掷点数 ?? '').trim();
  let rollBrief = '暂无记录';
  if (rollLog || rollText) {
    const parsed = rollLog
      ? {
          roll: typeof rollLog.roll === 'number' ? rollLog.roll : null,
          upgraded: rollLog.upgraded === true,
          isGuarantee: rollLog.isGuarantee === true,
        }
      : parseRollText(rollText);

    const rollLabel =
      parsed.roll != null ? `${parsed.roll} 点` : parsed.isGuarantee ? '保底升级' : rollText || '未记录';
    const upgradedLabel = parsed.upgraded ? '升级成功' : '未升级';
    const roundLabel =
      rollLog && typeof rollLog?.message_id === 'number'
        ? rollLog.message_id === currentId
          ? '本楼层'
          : '前楼层'
        : '本楼层';
    const rollPointText = parsed.roll != null ? `${parsed.roll}点` : rollLabel.replace(/\s+/g, '');
    rollBrief = `${roundLabel} roll${rollPointText} ${parsed.upgraded ? '已升级' : '未升级'}`;

    rollItem.push({
      key: 'roll',
      title: '今日 Roll 点',
      detail: `由【${rollLog ? '脚本' : 'AI'}】执行，点数为 ${rollLabel}，${upgradedLabel}`,
      source: rollLog ? '脚本' : sourceByPath(aiPaths, 'stat_data.庇护所.今日投掷点数', 'AI'),
    });
    recognizedPaths.add('stat_data.庇护所.今日投掷点数');
  }
  sections.push({ key: 'roll', title: 'ROLL 点', items: rollItem, emptyText: '今日未检测到 Roll 变化' });

  // 庇护所变化
  const shelterItems: ReportRow[] = [];
  const prevShelter = _.get(prevData, '庇护所', {}) ?? {};
  if (!_.isEqual(prevShelter?.庇护所等级, shelter?.庇护所等级)) {
    shelterItems.push({
      key: 'shelter_level',
      title: '庇护所等级',
      detail: `${prevShelter?.庇护所等级 ?? '未知'} → ${shelter?.庇护所等级 ?? '未知'}`,
      source: sourceByPath(aiPaths, 'stat_data.庇护所.庇护所等级', '脚本'),
    });
    recognizedPaths.add('stat_data.庇护所.庇护所等级');
  }

  if (!_.isEqual(prevShelter?.距离上次升级, shelter?.距离上次升级)) {
    shelterItems.push({
      key: 'shelter_distance',
      title: '距离上次升级',
      detail: `${prevShelter?.距离上次升级 || '未知'} → ${shelter?.距离上次升级 || '未知'}`,
      source: sourceByPath(aiPaths, 'stat_data.庇护所.距离上次升级', '脚本'),
    });
    recognizedPaths.add('stat_data.庇护所.距离上次升级');
  }

  const prevAbilities = _.get(prevShelter, '庇护所能力', {}) ?? {};
  const curAbilities = _.get(shelter, '庇护所能力', {}) ?? {};
  const addedAbilities = Object.keys(curAbilities).filter(k => !Object.prototype.hasOwnProperty.call(prevAbilities, k));
  if (addedAbilities.length > 0) {
    shelterItems.push({
      key: 'shelter_abilities',
      title: '新增庇护所能力',
      detail: addedAbilities.join('、'),
      source: sourceByPath(aiPaths, 'stat_data.庇护所.庇护所能力', '脚本'),
    });
    recognizedPaths.add('stat_data.庇护所.庇护所能力');
  }

  const prevScope = _.get(prevShelter, '当前生存庇护范围', {}) ?? {};
  const curScope = _.get(shelter, '当前生存庇护范围', {}) ?? {};
  if (!_.isEqual(prevScope, curScope)) {
    const floors = new Set([...Object.keys(prevScope), ...Object.keys(curScope)]);
    const changes: string[] = [];
    for (const floor of floors) {
      const before = Array.isArray(prevScope?.[floor]) ? prevScope[floor] : [];
      const after = Array.isArray(curScope?.[floor]) ? curScope[floor] : [];
      const added = after.filter((x: string) => !before.includes(x));
      const removed = before.filter((x: string) => !after.includes(x));
      if (added.length) changes.push(`楼层${floor}+${added.join('、')}`);
      if (removed.length) changes.push(`楼层${floor}-${removed.join('、')}`);
    }
    shelterItems.push({
      key: 'shelter_scope',
      title: '庇护范围变更',
      detail: changes.length ? changes.join('；') : '范围更新',
      source: sourceByPath(aiPaths, 'stat_data.庇护所.当前生存庇护范围', '脚本'),
    });
    recognizedPaths.add('stat_data.庇护所.当前生存庇护范围');
  }

  sections.push({ key: 'shelter', title: '庇护所变化', items: shelterItems, emptyText: '庇护所无显著变化' });

  // 主线任务
  const missionItems: ReportRow[] = [];
  const curMission = _.get(currentData, '主线任务', {}) ?? {};
  const prevMission = _.get(prevData, '主线任务', {}) ?? {};

  if (!_.isEqual(prevMission?.当前阶段, curMission?.当前阶段)) {
    missionItems.push({
      key: 'mission_stage',
      title: '主线阶段',
      detail: `${prevMission?.当前阶段 || '未知'} → ${curMission?.当前阶段 || '未知'}`,
      source: sourceByPath(aiPaths, 'stat_data.主线任务.当前阶段', 'AI'),
    });
    recognizedPaths.add('stat_data.主线任务.当前阶段');
  }

  const goals = new Set([...Object.keys(prevMission?.阶段目标 ?? {}), ...Object.keys(curMission?.阶段目标 ?? {})]);
  for (const key of goals) {
    const prevGoal = _.get(prevMission, ['阶段目标', key], null);
    const curGoal = _.get(curMission, ['阶段目标', key], null);
    if (!prevGoal && !curGoal) continue;
    if (_.isEqual(prevGoal, curGoal)) continue;
    missionItems.push({
      key: `goal_${key}`,
      title: `目标：${key}`,
      detail: `${prevGoal?.当前值 ?? '--'} → ${curGoal?.当前值 ?? '--'} / 目标 ${curGoal?.目标值 ?? '--'}`,
      source: sourceByPath(aiPaths, `stat_data.主线任务.阶段目标.${key}`, 'AI'),
    });
    recognizedPaths.add(`stat_data.主线任务.阶段目标.${key}`);
  }

  sections.push({ key: 'mission', title: '任务进度', items: missionItems, emptyText: '主线任务无显著变化' });

  // 情报碎片
  const intelItems: ReportRow[] = [];
  const intelKeys = new Set([...Object.keys(prevMission?.情报碎片 ?? {}), ...Object.keys(curMission?.情报碎片 ?? {})]);
  for (const key of intelKeys) {
    const prevIntel = _.get(prevMission, ['情报碎片', key], null);
    const curIntel = _.get(curMission, ['情报碎片', key], null);
    if (!prevIntel && curIntel) {
      intelItems.push({
        key: `intel_new_${key}`,
        title: `新增情报`,
        detail: `${curIntel?.编号 || key}：${curIntel?.描述 || ''}（状态：${curIntel?.状态 || '未知'}）`,
        source: sourceByPath(aiPaths, `stat_data.主线任务.情报碎片.${key}`, 'AI'),
      });
      continue;
    }
    if (prevIntel && curIntel && prevIntel?.状态 !== curIntel?.状态) {
      intelItems.push({
        key: `intel_${key}`,
        title: `情报进度`,
        detail: `${curIntel?.编号 || key}：${prevIntel?.状态 || '未知'} → ${curIntel?.状态 || '未知'}`,
        source: sourceByPath(aiPaths, `stat_data.主线任务.情报碎片.${key}.状态`, 'AI'),
      });
    }
    recognizedPaths.add(`stat_data.主线任务.情报碎片.${key}`);
  }
  sections.push({ key: 'intel', title: '情报碎片', items: intelItems, emptyText: '情报碎片暂无进展' });

  // 角色动态
  const roleItems: ReportRow[] = [];
  const currentRoles = listRoles(currentData);
  const prevRoles = listRoles(prevData);

  const newCore = currentRoles.core.filter(name => !prevRoles.core.includes(name));
  const newTemp = currentRoles.temp.filter(name => !prevRoles.temp.includes(name));

  if (newCore.length > 0) {
    roleItems.push({
      key: 'new_core',
      title: '新增主要角色',
      detail: `新增 ${newCore.length} 名：${newCore.join('、')}`,
      source: 'AI',
    });
  }
  if (newTemp.length > 0) {
    roleItems.push({
      key: 'new_temp',
      title: '新增临时 NPC',
      detail: `新增 ${newTemp.length} 名：${newTemp.join('、')}`,
      source: 'AI',
    });
  }

  const allNames = new Set([...currentRoles.core, ...currentRoles.temp, ...prevRoles.core, ...prevRoles.temp]);
  const deaths: Array<{ name: string; reason: string; source: ReportSource }> = [];
  const stageOn: string[] = [];
  const stageOff: Array<{ name: string; source: ReportSource }> = [];

  for (const name of allNames) {
    const isTemp = currentRoles.temp.includes(name) || prevRoles.temp.includes(name);
    const newRole = getRole(currentData, name, isTemp);
    const oldRole = getRole(prevData, name, isTemp);
    if (!newRole || typeof newRole !== 'object') continue;

    const newHealth = Number(newRole?.健康 ?? NaN);
    const oldHealth = Number(oldRole?.健康 ?? NaN);
    const newStatus = String(newRole?.健康状况 ?? '');
    const oldStatus = String(oldRole?.健康状况 ?? '');

    const died =
      (Number.isFinite(newHealth) && newHealth <= 0 && Number.isFinite(oldHealth) && oldHealth > 0) ||
      (oldStatus !== '死亡' && newStatus === '死亡');

    if (died) {
      const mark = Number(newRole?.秩序刻印 ?? NaN);
      const reason =
        Number.isFinite(mark) && mark < 0
          ? 'Imp<0 精神崩溃'
          : String(newRole?.健康更新原因 ?? '').includes('死亡')
            ? String(newRole?.健康更新原因 ?? '')
            : '健康值为0';
      deaths.push({
        name,
        reason,
        source: sourceByPath(aiPaths, `stat_data.${isTemp ? `临时NPC.${name}` : name}.健康`, '脚本'),
      });
    }

    const oldStage = String(oldRole?.登场状态 ?? '');
    const newStage = String(newRole?.登场状态 ?? '');
    if (oldStage !== newStage) {
      if (newStage === '登场') stageOn.push(name);
      if (newStage === '离场') {
        const source = aiTouchedPath(aiPaths, `stat_data.${isTemp ? `临时NPC.${name}` : name}.登场状态`)
          ? 'AI'
          : forceOffstage.has(name)
            ? '脚本'
            : '脚本';
        stageOff.push({ name, source });
      }
    }
  }

  if (deaths.length > 0) {
    roleItems.push({
      key: 'deaths',
      title: '角色死亡',
      detail: `有 ${deaths.length} 名角色死亡：${deaths.map(d => `${d.name}（${d.reason}）`).join('、')}`,
      source: deaths.some(d => d.source === 'AI') ? 'AI' : '脚本',
    });
  }

  if (stageOn.length > 0) {
    const scriptOn = stageOn.filter(name => forceOnstage.has(name));
    roleItems.push({
      key: 'stage_on',
      title: '角色登场',
      detail: `剧情登场 ${stageOn.length} 名：${stageOn.join('、')}${scriptOn.length ? `（脚本判定：${scriptOn.join('、')}）` : ''}`,
      source: scriptOn.length ? '脚本' : 'AI',
    });
  }
  if (stageOff.length > 0) {
    const names = stageOff.map(x => x.name);
    const byScript = stageOff.filter(x => x.source === '脚本').map(x => x.name);
    roleItems.push({
      key: 'stage_off',
      title: '角色离场',
      detail: `离场 ${stageOff.length} 名：${names.join('、')}${byScript.length ? `（脚本判定：${byScript.join('、')}）` : ''}`,
      source: byScript.length ? '脚本' : 'AI',
    });
  }

  sections.push({ key: 'roles', title: '角色情况', items: roleItems, emptyText: '角色未出现显著变化' });

  // 房间移动
  const roomItems: ReportRow[] = [];
  for (const name of allNames) {
    const isTemp = currentRoles.temp.includes(name) || prevRoles.temp.includes(name);
    const newRole = getRole(currentData, name, isTemp);
    const oldRole = getRole(prevData, name, isTemp);
    if (!newRole || !oldRole) continue;
    const oldRoom = normalizeRoomTag(String(oldRole?.所在房间 ?? ''));
    const newRoom = normalizeRoomTag(String(newRole?.所在房间 ?? ''));
    if (oldRoom === newRoom) continue;
    roomItems.push({
      key: `room_${name}`,
      title: `${name}`,
      detail: `${oldRoom || '未知/空'} → ${newRoom || '未知/空'}`,
      source: sourceByPath(aiPaths, `stat_data.${isTemp ? `临时NPC.${name}` : name}.所在房间`, '脚本'),
    });
    recognizedPaths.add(`stat_data.${isTemp ? `临时NPC.${name}` : name}.所在房间`);
  }
  sections.push({ key: 'rooms', title: '房间移动', items: roomItems, emptyText: '房间位置未发生变化' });

  // 健康变化
  const healthItems: ReportRow[] = [];
  for (const name of allNames) {
    const isTemp = currentRoles.temp.includes(name) || prevRoles.temp.includes(name);
    const newRole = getRole(currentData, name, isTemp);
    const oldRole = getRole(prevData, name, isTemp);
    if (!newRole || !oldRole) continue;
    const newHealth = Number(newRole?.健康 ?? NaN);
    const oldHealth = Number(oldRole?.健康 ?? NaN);
    if (!Number.isFinite(newHealth) || !Number.isFinite(oldHealth)) continue;
    if (newHealth === oldHealth) continue;

    const reason = String(newRole?.健康更新原因 ?? '').trim();
    const isOffstage = reason.includes('离场');
    const source = aiTouchedPath(aiPaths, `stat_data.${isTemp ? `临时NPC.${name}` : name}.健康`)
      ? 'AI'
      : isOffstage
        ? '脚本'
        : '脚本';

    healthItems.push({
      key: `health_${name}`,
      title: name,
      detail: `${oldHealth} → ${newHealth}${reason ? `（${reason}）` : ''}`,
      source,
    });
    recognizedPaths.add(`stat_data.${isTemp ? `临时NPC.${name}` : name}.健康`);
    recognizedPaths.add(`stat_data.${isTemp ? `临时NPC.${name}` : name}.健康更新原因`);
  }
  sections.push({ key: 'health', title: '健康值变化', items: healthItems, emptyText: '健康值无显著变化' });

  // IMP 变化
  const impItems: ReportRow[] = [];
  for (const name of allNames) {
    const isTemp = currentRoles.temp.includes(name) || prevRoles.temp.includes(name);
    const newRole = getRole(currentData, name, isTemp);
    const oldRole = getRole(prevData, name, isTemp);
    if (!newRole || !oldRole) continue;
    const newImp = Number(newRole?.秩序刻印 ?? NaN);
    const oldImp = Number(oldRole?.秩序刻印 ?? NaN);
    if (!Number.isFinite(newImp) || !Number.isFinite(oldImp)) continue;
    if (newImp === oldImp) continue;
    const reason = String(newRole?.秩序刻印更新原因 ?? '').trim();
    const source = sourceByPath(aiPaths, `stat_data.${isTemp ? `临时NPC.${name}` : name}.秩序刻印`, 'AI');
    impItems.push({
      key: `imp_${name}`,
      title: name,
      detail: `${oldImp} → ${newImp}${reason ? `（${reason}）` : ''}`,
      source,
    });
    recognizedPaths.add(`stat_data.${isTemp ? `临时NPC.${name}` : name}.秩序刻印`);
  }
  sections.push({ key: 'imp', title: 'IMP 变化', items: impItems, emptyText: '秩序刻印无变化' });

  // 内心想法变化
  const thoughtItems: ReportRow[] = [];
  for (const name of allNames) {
    const isTemp = currentRoles.temp.includes(name) || prevRoles.temp.includes(name);
    const newRole = getRole(currentData, name, isTemp);
    const oldRole = getRole(prevData, name, isTemp);
    if (!newRole || !oldRole) continue;
    const oldThought = String(oldRole?.内心想法 ?? '').trim();
    const newThought = String(newRole?.内心想法 ?? '').trim();
    if (oldThought === newThought) continue;
    thoughtItems.push({
      key: `thought_${name}`,
      title: name,
      detail: `${oldThought || '（空）'} → ${newThought || '（空）'}`,
      source: sourceByPath(aiPaths, `stat_data.${isTemp ? `临时NPC.${name}` : name}.内心想法`, 'AI'),
    });
    recognizedPaths.add(`stat_data.${isTemp ? `临时NPC.${name}` : name}.内心想法`);
  }
  sections.push({ key: 'thought', title: '内心想法', items: thoughtItems, emptyText: '内心想法无变化' });

  const changedLeafPaths = collectChangedLeafPaths(prevData, currentData, 'stat_data');

  // 其他字段（除已识别板块外的变更）
  const otherItems: ReportRow[] = [];
  const otherChangedPaths = changedLeafPaths.filter(path => {
    if (!path.startsWith('stat_data.')) return false;
    return !pathMatchesSet(recognizedPaths, path);
  });
  for (const path of otherChangedPaths) {
    otherItems.push({
      key: `other_${path}`,
      title: path.replace('stat_data.', ''),
      detail: '字段值发生变化',
      source: aiTouchedPath(aiPaths, path) ? 'AI' : '脚本',
    });
    if (otherItems.length >= 12) break;
  }
  sections.push({
    key: 'others',
    title: '其他字段',
    items: otherItems,
    emptyText: otherChangedPaths.length === 0 ? '未发现额外字段变化' : '已截断显示前 12 项',
  });

  let focusText = '暂无重点变化';
  for (const section of sections) {
    if (!Array.isArray(section.items) || section.items.length === 0) continue;
    const first = section.items[0];
    focusText = `${section.title} · ${first.title}：${first.detail}`;
    break;
  }

  const nonEmptySections = sections.filter(section => Array.isArray(section.items) && section.items.length > 0);
  const sectionCount = nonEmptySections.length;
  const itemCount = nonEmptySections.reduce((sum, section) => sum + section.items.length, 0);

  const allCurrentRoleNames = [...currentRoles.core, ...currentRoles.temp];

  const overview = `末日第${currentWorld?.末日天数 ?? '？'}天 · ${currentWorld?.时间 || '未知时间'}${
    currentWorld?.地址 ? ` · ${currentWorld.地址}` : ''
  } · 变动${sectionCount}组/${itemCount}项`;
  const currentStageShort = extractStageShort(String(curMission?.当前阶段 ?? ''));
  const changedGoalCount = missionItems.filter(item => item.key !== 'mission_stage').length;
  const mission = `当前${currentStageShort} · 任务目标${changedGoalCount} · 情报${intelItems.length}`;
  const status = `登场${stageOn.length}/${allCurrentRoleNames.length || 0} · 死亡${deaths.length} · 离场${stageOff.length} · 庇护所等级${
    shelter?.庇护所等级 ?? '？'
  }`;
  const change = `房间${roomItems.length} · 健康${healthItems.length} · IMP${impItems.length} · 想法${thoughtItems.length}`;
  const listRowText = (rows: ReportRow[]): string[] => rows.map(row => `${row.title}：${row.detail}`);
  const deathText = deaths.map(entry => `${entry.name}（${entry.reason}）`);
  const stageOnText = stageOn.map(name => `${name}（登场）`);
  const stageOffText = stageOff.map(entry => `${entry.name}（离场）`);
  const rollDetailText = rollItem.length > 0 ? listRowText(rollItem) : [rollBrief];
  const shelterText = shelterItems.length > 0 ? listRowText(shelterItems) : [];
  const thoughtText = listRowText(thoughtItems);
  const aiUpdatedFields = changedLeafPaths.filter(path => aiTouchedPath(aiPaths, path)).map(stripStatDataPrefix);
  const scriptUpdatedFields = changedLeafPaths.filter(path => !aiTouchedPath(aiPaths, path)).map(stripStatDataPrefix);

  return {
    summary,
    sections,
    briefs: {
      time: timeBrief,
      overview,
      focus: focusText,
      roll: rollBrief,
      mission,
      status,
      change,
    },
    details: {
      missionStage: missionItems.filter(item => item.key === 'mission_stage').map(item => `${item.detail}`),
      missionGoals: missionItems
        .filter(item => item.key !== 'mission_stage')
        .map(item => `${item.title}：${item.detail}`),
      intel: listRowText(intelItems),
      stageOn: stageOnText,
      onstageTotal: allCurrentRoleNames.length || 0,
      deaths: deathText,
      stageOff: stageOffText,
      roomMoves: listRowText(roomItems),
      healthChanges: listRowText(healthItems),
      impChanges: listRowText(impItems),
      thoughtChanges: thoughtText,
      others: listRowText(otherItems),
      aiUpdatedFields,
      scriptUpdatedFields,
      currentStageShort,
      shelterLevel: Number.isFinite(Number(shelter?.庇护所等级)) ? Number(shelter?.庇护所等级) : null,
      roll: rollDetailText,
      shelter: shelterText,
    },
  };
}

function findPrevMessageId(currentId: number): number | null {
  if (!Number.isFinite(currentId) || currentId <= 0) return null;
  const start = Math.max(0, currentId - 30);
  const end = currentId - 1;
  if (end < start) return null;
  const msgs = getChatMessages(`${start}-${end}`);
  if (msgs && msgs.length > 0) return msgs[msgs.length - 1].message_id;
  const lastId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
  if (lastId != null && Number(lastId) === currentId) {
    const prev = getChatMessages(-2)?.[0];
    return prev?.message_id ?? null;
  }
  return null;
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  void refreshReport();
});

onActivated(() => {
  void refreshReport();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
});
</script>

<style scoped>
.report-section {
  display: grid;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
}

.report-btn {
  flex: 0 0 auto;
  padding: 6px 10px;
  border-radius: 9px;
  border: 1px solid var(--report-accent-border-strong);
  background: var(--report-accent-bg-base);
  color: var(--text-color);
  cursor: pointer;
  font-weight: 700;
  transition: all var(--transition-speed);
}

.report-btn.compact {
  font-size: 0.82em;
}

.report-btn.inline {
  margin-left: auto;
  padding: 3px 8px;
  font-size: 0.74em;
  line-height: 1.2;
}

.report-btn:hover {
  background: var(--report-accent-bg-strong);
}

.report-btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.report-inline-body {
  display: grid;
  gap: 6px;
}

.report-duo {
  display: block;
}

.report-pane {
  min-width: 0;
  border: 1px solid var(--report-surface-border-base);
  border-radius: 12px;
  background: var(--report-surface-bg-weak);
  overflow: hidden;
}

.report-pane--digest {
  width: 100%;
}

.report-pane-tab {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 0.84em;
  font-weight: 700;
  color: var(--text-color);
  border: 0;
  border-bottom: 1px solid var(--report-surface-border-soft);
  background: var(--report-surface-bg-soft);
  cursor: default;
}

.report-pane-tab.active {
  color: var(--accent-gold);
  background: var(--report-accent-bg-tab-active);
  border-bottom-color: var(--report-accent-border-active);
}

.report-pane-body {
  padding: 8px;
}

.report-pane-body--digest {
  display: grid;
  gap: 5px;
  position: relative;
}

.report-quick-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(56px, auto);
  align-items: start;
  gap: 6px 8px;
}

.report-quick-line {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 7px;
  align-items: start;
  border-radius: 9px;
  border: 1px solid var(--report-surface-border-soft);
  background: var(--report-surface-bg-card);
  padding: 5px 7px;
}

.report-quick-line.summary {
  border-color: var(--report-accent-border-medium);
  background: var(--report-accent-bg-soft);
}

.report-quick-line.focus {
  border-color: var(--report-focus-border);
  background: var(--report-focus-bg);
}

.report-quick-line.hint {
  border-style: dashed;
  opacity: 0.92;
}

.report-quick-index {
  width: 26px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--report-surface-border-stronger);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.64em;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--report-quick-index-text);
  background: var(--report-shadow-soft-color);
}

.report-quick-content {
  min-width: 0;
  display: grid;
  gap: 1px;
  position: relative;
}

.report-quick-label {
  font-size: 0.68em;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  color: var(--accent-blue);
}

.report-quick-text {
  font-size: 0.76em;
  line-height: 1.3;
  color: var(--report-quick-text-color);
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.report-quick-text--multi {
  display: block;
  -webkit-line-clamp: unset;
  white-space: pre-line;
}

.report-quick-interactive {
  display: grid;
  gap: 3px;
}

.report-quick-token-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.report-quick-token-row.is-stack {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3px;
}

.report-quick-token {
  border: 1px solid var(--report-accent-border-soft);
  background: var(--report-accent-bg-softest);
  color: var(--report-token-text);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 0.75em;
  line-height: 1.35;
  cursor: pointer;
  white-space: nowrap;
}

.report-quick-token-row.is-stack .report-quick-token {
  justify-self: start;
  white-space: normal;
  text-align: left;
  line-height: 1.25;
}

.report-quick-token:hover {
  background: var(--report-accent-bg-hover);
}

.report-quick-token:disabled,
.report-quick-token.disabled {
  opacity: 0.46;
  filter: grayscale(0.35);
  cursor: default;
  background: var(--report-token-disabled-bg);
  border-color: var(--report-token-disabled-border);
  color: var(--report-token-disabled-text);
}

.report-quick-token.active {
  border-color: var(--report-quick-token-active-border);
  background: var(--report-quick-token-active-bg);
  color: var(--report-quick-token-active-text);
}

.report-quick-pop {
  border: 1px solid var(--report-surface-border-stronger);
  background: var(--report-quick-pop-bg);
  border-radius: 8px;
  padding: 6px 8px;
  box-shadow: 0 8px 20px var(--report-shadow-soft-color);
}

.report-quick-pop-title {
  font-size: 0.72em;
  font-weight: 700;
  color: var(--accent-gold);
  margin-bottom: 4px;
}

.report-quick-pop-list {
  margin: 0;
  padding-left: 14px;
  max-height: 140px;
  overflow: auto;
  display: grid;
  gap: 2px;
}

.report-quick-pop-list > li {
  font-size: 0.75em;
  line-height: 1.35;
  color: var(--report-pop-list-text);
}

.report-quick-pop-empty {
  font-size: 0.74em;
  color: var(--report-quick-pop-empty-text);
}

.report-float-pop {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 6px;
  z-index: 30;
  border: 1px solid var(--report-surface-border-bold);
  background: var(--report-float-pop-bg);
  border-radius: 10px;
  padding: 7px 8px;
  box-shadow: 0 10px 20px var(--report-shadow-medium-color);
  backdrop-filter: blur(4px);
}

.report-float-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.report-float-pop-title {
  font-size: 0.74em;
  font-weight: 700;
  color: var(--accent-gold);
}

.report-float-pop-close {
  border: 1px solid var(--report-accent-bg-strong);
  background: var(--report-accent-bg-weak);
  color: var(--report-float-close-text);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 0.7em;
  line-height: 1.3;
  cursor: pointer;
}

.report-float-pop-list {
  margin: 0;
  padding-left: 14px;
  max-height: 120px;
  overflow: auto;
  display: grid;
  gap: 2px;
}

.report-float-pop-list > li {
  font-size: 0.76em;
  line-height: 1.34;
  color: var(--report-pop-list-text);
}

.report-accordion {
  margin: 0;
  border-radius: 10px;
  border: 1px solid var(--report-surface-border-faint);
  background: var(--report-surface-bg-weak);
  overflow: hidden;
}

.report-accordion[open] {
  border-color: var(--report-surface-border-stronger);
}

.report-accordion-title {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-weight: 700;
  color: var(--accent-gold);
  background: var(--report-surface-bg-low);
}

.report-accordion-title::-webkit-details-marker {
  display: none;
}

.report-accordion-meta {
  font-size: 0.76em;
  color: var(--report-meta-text);
}

.report-accordion-body {
  padding: 4px 6px 6px;
}

.report-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 3px;
  background: transparent;
}

.report-table th,
.report-table td {
  text-align: left;
  padding: 7px 9px;
  border-bottom: none;
  font-size: 0.82em;
}

.report-table th {
  color: var(--accent-blue);
  background: transparent;
  font-weight: 700;
}

.report-table tbody tr td {
  background: var(--report-surface-bg-soft);
}

.report-table tbody tr td:first-child {
  border-radius: 10px 0 0 10px;
}

.report-table tbody tr td:last-child {
  border-radius: 0 10px 10px 0;
}

.report-cell-title {
  width: 28%;
  color: var(--text-strong);
}

.report-cell-detail {
  width: 54%;
  white-space: pre-line;
}

.report-cell-source {
  width: 18%;
}

.source-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.8em;
  border: 1px solid var(--report-surface-border-strong);
  background: var(--report-surface-bg-medium);
}

.source-AI {
  color: var(--report-source-ai-text);
  border-color: var(--report-accent-border-bright);
}

.source-脚本 {
  color: var(--report-source-script-text);
  border-color: var(--report-source-script-border);
}

.source-系统,
.source-未知 {
  color: var(--report-source-system-text);
  border-color: var(--report-source-system-border);
}

.report-empty {
  padding: 7px 9px;
  border-radius: 10px;
  border: 1px dashed var(--report-surface-border-strong);
  color: var(--report-empty-text);
}

.report-loading {
  padding: 14px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--accent-blue);
}

.report-spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--report-accent-bg-hover);
  border-top-color: var(--report-accent-border-spinner);
  animation: reportSpin 1s linear infinite;
}

.report-error {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--report-error-border);
  background: var(--report-error-bg);
  color: var(--report-error-text);
}

.report-error-title {
  font-weight: 700;
  margin-bottom: 4px;
}

@keyframes reportSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 600px) {
  .report-btn.inline {
    width: auto;
  }

  .report-table th,
  .report-table td {
    padding: 6px 7px;
    font-size: 0.8em;
  }
}

@media (max-width: 900px) {
  .report-pane-body {
    padding: 7px;
  }
}

@media (max-width: 680px) {
  .report-quick-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .report-accordion-body {
    padding: 4px 5px 6px;
  }

  .report-table {
    border-spacing: 0 6px;
  }

  .report-table thead {
    display: none;
  }

  .report-table tbody tr {
    display: grid;
    gap: 5px;
    padding: 7px 8px;
    border-radius: 10px;
    background: var(--report-surface-bg-soft);
    border: 1px solid var(--report-surface-border-soft);
  }

  .report-table tbody tr td {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    width: 100%;
    padding: 0;
    background: transparent;
    font-size: 0.8em;
  }

  .report-table tbody tr td::before {
    content: attr(data-label);
    flex: 0 0 32px;
    font-size: 0.76em;
    line-height: 1.4;
    color: var(--report-mobile-label-color);
  }

  .report-table tbody tr td:first-child,
  .report-table tbody tr td:last-child {
    border-radius: 0;
  }

  .report-cell-title,
  .report-cell-detail,
  .report-cell-source {
    width: auto;
  }

  .report-cell-source .source-tag {
    margin-top: 1px;
  }
}
</style>


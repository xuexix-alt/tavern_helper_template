<template>
  <section class="section report-section">
    <h2 class="section-title">📜 变量演化汇报</h2>
    <div class="report-actions">
      <button class="report-btn" type="button" :disabled="loading" @click="openReport">
        {{ loading ? '正在生成…' : '查看汇总' }}
      </button>
      <div class="report-hint">点击后对比上一楼层变量，生成 RPG 风格汇报</div>
    </div>

    <div v-if="lastComputedAt" class="report-last">上次生成：{{ lastComputedAt }}</div>
    <div v-if="lastSummary" class="report-summary-preview">{{ lastSummary }}</div>

    <Teleport to="body">
      <div v-if="reportOpen" class="report-modal-mask" :style="reportModalMaskStyle" @click.self="closeReport">
        <div class="report-modal" role="dialog" aria-modal="true">
          <div class="report-modal-header">
            <div class="report-modal-title">📜 本楼层变量演化汇总</div>
            <button class="report-icon-btn" type="button" @click="closeReport">✕</button>
          </div>

          <div class="report-modal-body">
            <div v-if="loading" class="report-loading">
              <div class="report-spinner"></div>
              <div class="report-loading-text">正在读取变量与日志…</div>
            </div>

            <div v-else-if="errorText" class="report-error">
              <div class="report-error-title">生成失败</div>
              <div class="report-error-detail">{{ errorText }}</div>
            </div>

            <template v-else>
              <div class="report-summary">
                {{ report?.summary || '暂无可汇报的变化。' }}
              </div>

              <template v-if="visibleSections.length > 0">
                <details
                  v-for="section in visibleSections"
                  :key="section.key"
                  class="report-accordion"
                  :open="isSectionOpen(section.key)"
                >
                  <summary class="report-accordion-title">
                    <span class="report-accordion-text">{{ section.title }}</span>
                    <span class="report-accordion-meta">{{ section.items.length }} 项</span>
                  </summary>
                  <div class="report-accordion-body">
                    <table class="report-table">
                      <thead>
                        <tr>
                          <th>项目</th>
                          <th>变化</th>
                          <th>来源</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in section.items" :key="row.key">
                          <td class="report-cell-title">{{ row.title }}</td>
                          <td class="report-cell-detail">{{ row.detail }}</td>
                          <td class="report-cell-source">
                            <span class="source-tag" :class="`source-${row.source ?? 'unknown'}`">
                              {{ row.source ?? '未知' }}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              </template>
              <div v-else class="report-empty">本楼层未检测到变量变化</div>
            </template>
          </div>

          <div class="report-modal-footer">
            <button class="report-btn ghost" type="button" :disabled="loading" @click="closeReport">关闭</button>
            <!-- 暂停使用：重新生成 -->
            <!-- <button class="report-btn primary" type="button" :disabled="loading" @click="refreshReport">重新生成</button> -->
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import _ from 'lodash';
import { useEventListener, useThrottleFn } from '@vueuse/core';
import { diffWorldHours } from '../../../util/time';
import { normalizeRoomTag } from '../../../util/room';

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
};

type PatchOp = { op?: string; path?: string; value?: any };

type EdenLog = {
  ts?: string;
  level?: string;
  event?: string;
  zh?: string;
  data?: string;
};

const reportOpen = ref(false);
const loading = ref(false);
const errorText = ref('');
const report = ref<ReportResult | null>(null);
const lastComputedAt = ref('');
const lastSummary = ref('');

const reportModalViewportTop = ref(0);
const reportModalViewportHeight = ref(0);
let reportParentScrollTarget: HTMLElement | Window | null = null;
let reportScrollOverflow = '';
let reportDocOverflow = '';
let reportBodyOverflow = '';
let stopReportScroll: (() => void) | null = null;
let stopReportResize: (() => void) | null = null;

const reportModalMaskStyle = computed(() => ({
  top: `${reportModalViewportTop.value}px`,
  height: `${reportModalViewportHeight.value}px`,
}));

const visibleSections = computed(() => {
  const sections = report.value?.sections ?? [];
  return sections.filter(section => Array.isArray(section.items) && section.items.length > 0);
});

const defaultOpenSections = new Set<string>(['world', 'roll', 'roles']);

function isSectionOpen(key: string): boolean {
  return defaultOpenSections.has(key);
}

function getParentScrollContainer(frameEl: HTMLElement): HTMLElement | Window {
  try {
    const doc = frameEl.ownerDocument;
    const win = doc.defaultView ?? window.parent;
    let cur: HTMLElement | null = frameEl.parentElement;
    while (cur) {
      const style = win.getComputedStyle(cur);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 1) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return win;
  } catch {
    return window.parent;
  }
}

function updateReportModalViewport() {
  const frameEl = window.frameElement as HTMLElement | null;
  if (!frameEl) return;
  const parentWin = window.parent as Window | null;
  if (!parentWin) return;

  const rect = frameEl.getBoundingClientRect();
  const topInIframeDoc = Math.max(0, -rect.top);
  reportModalViewportTop.value = topInIframeDoc;
  reportModalViewportHeight.value = Math.max(0, parentWin.innerHeight);
}

const throttledUpdateReportModalViewport = useThrottleFn(updateReportModalViewport, 50);

function bindReportParentScrollSync() {
  const frameEl = window.frameElement as HTMLElement | null;
  if (!frameEl) return;
  reportParentScrollTarget = getParentScrollContainer(frameEl);
  const handler = throttledUpdateReportModalViewport;
  if (!reportParentScrollTarget) return;
  stopReportScroll?.();
  stopReportResize?.();
  stopReportScroll = useEventListener(reportParentScrollTarget, 'scroll', handler, { passive: true });
  const resizeTarget = reportParentScrollTarget instanceof Window ? reportParentScrollTarget : window.parent ?? window;
  stopReportResize = useEventListener(resizeTarget, 'resize', handler, { passive: true });
}

function unbindReportParentScrollSync() {
  stopReportScroll?.();
  stopReportResize?.();
  stopReportScroll = null;
  stopReportResize = null;
}

function lockParentScroll() {
  const frameEl = window.frameElement as HTMLElement | null;
  if (!frameEl) return;
  reportParentScrollTarget = getParentScrollContainer(frameEl);
  if (reportParentScrollTarget instanceof Window) {
    const doc = reportParentScrollTarget.document;
    reportDocOverflow = doc.documentElement.style.overflow;
    reportBodyOverflow = doc.body.style.overflow;
    doc.documentElement.style.overflow = 'hidden';
    doc.body.style.overflow = 'hidden';
  } else if (reportParentScrollTarget) {
    reportScrollOverflow = reportParentScrollTarget.style.overflow;
    reportParentScrollTarget.style.overflow = 'hidden';
  }
}

function unlockParentScroll() {
  if (reportParentScrollTarget instanceof Window) {
    const doc = reportParentScrollTarget.document;
    doc.documentElement.style.overflow = reportDocOverflow;
    doc.body.style.overflow = reportBodyOverflow;
  } else if (reportParentScrollTarget) {
    reportParentScrollTarget.style.overflow = reportScrollOverflow;
  }
  reportParentScrollTarget = null;
  reportScrollOverflow = '';
  reportDocOverflow = '';
  reportBodyOverflow = '';
}

async function openReport() {
  reportOpen.value = true;
  updateReportModalViewport();
  bindReportParentScrollSync();
  lockParentScroll();
  await refreshReport();
}

function closeReport() {
  reportOpen.value = false;
  unbindReportParentScrollSync();
  unlockParentScroll();
}

async function refreshReport() {
  if (loading.value) return;
  loading.value = true;
  errorText.value = '';
  try {
    report.value = await buildReport();
    lastComputedAt.value = new Date().toLocaleString();
    lastSummary.value = report.value?.summary ?? '';
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
  if (!target) return false;
  for (const p of aiPaths) {
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

async function buildReport(): Promise<ReportResult> {
  await waitGlobalInitialized('Mvu');

  const currentIdRaw = typeof getCurrentMessageId === 'function' ? getCurrentMessageId() : null;
  const currentId = Number(currentIdRaw);
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
  const offstageSettled: string[] = [];
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

    if (isOffstage) offstageSettled.push(name);

    healthItems.push({
      key: `health_${name}`,
      title: name,
      detail: `${oldHealth} → ${newHealth}${reason ? `（${reason}）` : ''}`,
      source,
    });
    recognizedPaths.add(`stat_data.${isTemp ? `临时NPC.${name}` : name}.健康`);
    recognizedPaths.add(`stat_data.${isTemp ? `临时NPC.${name}` : name}.健康更新原因`);
  }
  if (offstageSettled.length > 0) {
    healthItems.unshift({
      key: 'health_offstage',
      title: '后台结算',
      detail: `以下角色由后台根据时间推演进行健康结算：${offstageSettled.join('、')}`,
      source: '脚本',
    });
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

  // 其他字段（AI patch 未覆盖的变更）
  const otherItems: ReportRow[] = [];
  const aiPathList = Array.from(aiPaths).filter(p => p.startsWith('stat_data.'));
  for (const path of aiPathList) {
    if (recognizedPaths.has(path)) continue;
    otherItems.push({
      key: `other_${path}`,
      title: path.replace('stat_data.', ''),
      detail: '本轮由 AI 直接输出更新',
      source: 'AI',
    });
    if (otherItems.length >= 12) break;
  }
  sections.push({
    key: 'others',
    title: '其他字段',
    items: otherItems,
    emptyText: aiPathList.length === 0 ? '未检测到 JSONPatch 输出' : '未发现额外字段变化',
  });

  return { summary, sections };
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

onBeforeUnmount(() => {
  unbindReportParentScrollSync();
  unlockParentScroll();
});
</script>

<style scoped>
.report-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.report-btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  cursor: pointer;
  font-weight: 700;
  transition: all var(--transition-speed);
}

.report-btn:hover {
  background: var(--border-color);
  color: var(--bg-dark);
}

.report-btn.primary {
  border-color: rgba(0, 180, 216, 0.55);
  background-color: rgba(0, 180, 216, 0.18);
  color: #e8fbff;
}

.report-btn.ghost {
  background: transparent;
}

.report-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.report-hint {
  font-size: 0.85em;
  opacity: 0.75;
}

.report-last {
  margin-top: 10px;
  font-size: 0.85em;
  color: var(--accent-blue);
}

.report-summary-preview {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.9em;
  opacity: 0.9;
  max-height: 72px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.report-modal-mask {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 70;
  background: rgba(0, 0, 0, 0.6);
  padding-top: calc(12px + env(safe-area-inset-top));
  padding-right: calc(12px + env(safe-area-inset-right));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  padding-left: calc(12px + env(safe-area-inset-left));
  display: flex;
  align-items: center;
  justify-content: center;
}

.report-modal {
  width: min(648px, calc(100% - 24px));
  max-height: calc(100% - 24px);
  background: rgba(20, 22, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
}

.report-modal-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 14px 14px 10px;
}

.report-modal-title {
  font-weight: 800;
  color: var(--text-strong, #f1fa8c);
  flex: 1 1 auto;
}

.report-icon-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
  margin-left: auto;
}

.report-modal-body {
  padding: 8px 14px 12px;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 0;
}

.report-summary {
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  line-height: 1.5;
  margin-bottom: 16px;
}

.report-accordion {
  margin: 10px 0;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

.report-accordion[open] {
  border-color: rgba(255, 255, 255, 0.16);
}

.report-accordion-title {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 700;
  color: var(--accent-gold);
  background: rgba(255, 255, 255, 0.04);
}

.report-accordion-title::-webkit-details-marker {
  display: none;
}

.report-accordion-meta {
  font-size: 0.8em;
  color: rgba(255, 255, 255, 0.65);
}

.report-accordion-body {
  padding: 8px 10px 12px;
}

.report-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 6px;
  background: transparent;
}

.report-table th,
.report-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: none;
  font-size: 0.9em;
}

.report-table th {
  color: var(--accent-blue);
  background: transparent;
  font-weight: 700;
}

.report-table tbody tr td {
  background: rgba(255, 255, 255, 0.05);
}

.report-table tbody tr td:first-child {
  border-radius: 10px 0 0 10px;
}

.report-table tbody tr td:last-child {
  border-radius: 0 10px 10px 0;
}

.report-cell-title {
  width: 30%;
  color: var(--text-strong);
}

.report-cell-detail {
  width: 50%;
  white-space: pre-line;
}

.report-cell-source {
  width: 20%;
}

.source-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.8em;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
}

.source-AI {
  color: #8be9fd;
  border-color: rgba(139, 233, 253, 0.5);
}

.source-脚本 {
  color: #50fa7b;
  border-color: rgba(80, 250, 123, 0.5);
}

.source-系统,
.source-未知 {
  color: #f1fa8c;
  border-color: rgba(241, 250, 140, 0.4);
}

.report-empty {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.6);
}

.report-modal-footer {
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex: 0 0 auto;
}

.report-loading {
  padding: 24px 0;
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
  border: 3px solid rgba(139, 233, 253, 0.2);
  border-top-color: rgba(139, 233, 253, 0.9);
  animation: reportSpin 1s linear infinite;
}

.report-error {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 85, 85, 0.4);
  background: rgba(255, 85, 85, 0.1);
  color: #ffb3b3;
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
  .report-table th,
  .report-table td {
    padding: 8px 10px;
  }
}
</style>

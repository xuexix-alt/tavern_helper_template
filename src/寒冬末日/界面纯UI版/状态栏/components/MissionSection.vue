<template>
  <section id="mission-section" class="section">
    <h2 class="section-title">
      📜 主线任务 📜
      <span v-if="hasMissionNew" class="new-dot" aria-label="有新进展"></span>
    </h2>
    <div class="mission-content">
      <div class="mission-overview-grid">
        <!-- 当前阶段 -->
        <div class="mission-phase">
          <div class="phase-label">📍 当前阶段</div>
          <div class="phase-name"><TextHighlight :text="store.data.主线任务.当前阶段" :query="query" /></div>
        </div>

        <!-- 阶段目标进度条 -->
        <div class="goals-progress-bar">
          <div class="progress-header">
            <span>🎯 阶段目标进度</span>
            <span class="progress-text">{{ completedGoalsDisplay }}/{{ goalsTotalDisplay }}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- 阶段目标 -->
      <div class="mission-goals">
        <div class="mission-panel-title">
          <span class="panel-title-main">📋 目标清单</span>
          <span class="panel-title-count">{{ completedGoalsDisplay }}/{{ goalsTotalDisplay }}</span>
        </div>
        <div class="goals-list">
          <template v-if="visibleStageTargets.length > 0">
            <div
              v-for="(goal, idx) in visibleStageTargets"
              :key="goal.key"
              class="goal-item"
              :class="{ completed: isGoalCompleted(goal.key, idx) }"
            >
              <div class="goal-checkbox">
                <svg v-if="isGoalCompleted(goal.key, idx)" viewBox="0 0 24 24" class="check-icon">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                <svg v-else viewBox="0 0 24 24" class="check-icon empty">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <div class="goal-content">
                <div class="goal-text" :class="{ completed: isGoalCompleted(goal.key, idx) }">
                  <TextHighlight :text="getGoalText(goal)" :query="query" />
                </div>
                <div v-if="hasGoalProgress(goal)" class="goal-meta">
                  <span class="meta-chip">进度：{{ goal.当前值 ?? 0 }}/{{ goal.目标值 ?? 0 }}</span>
                </div>
                <span v-if="isGoalCompleted(goal.key, idx)" class="goal-status-tag">已完成</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="goal-item empty">{{ query ? '(当前关键词下无目标)' : '(暂无目标)' }}</div>
          </template>
        </div>
      </div>

      <!-- 情报碎片 -->
      <div class="mission-intel">
        <div class="mission-panel-title">
          <span class="panel-title-main">🔍 情报碎片</span>
          <span class="panel-title-count">{{ intelCompletedDisplay }}/{{ intelTotalDisplay }}</span>
        </div>
        <div v-if="intelTotalDisplay === 0" class="intel-empty-hint">
          {{ query ? '当前关键词下没有匹配的情报碎片。' : '暂无情报碎片，继续探索/搜刮可解锁新的线索。' }}
        </div>
        <div class="intel-list">
          <template v-if="intelTotalDisplay > 0">
            <div v-for="item in visibleIntelEntries" :key="item.key" class="intel-item" :class="item.intel.状态">
              <div class="intel-status-ring" :class="item.intel.状态">
                <svg viewBox="0 0 36 36" class="progress-ring">
                  <circle cx="18" cy="18" r="16" class="ring-bg" />
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    class="ring-progress"
                    :stroke-dasharray="getRingProgress(item.intel.状态)"
                    :class="item.intel.状态"
                  />
                </svg>
                <span class="ring-icon">{{ getStatusIcon(item.intel.状态) }}</span>
              </div>
              <div class="intel-content">
                <div class="intel-header">
                  <span class="intel-id"><TextHighlight :text="item.intel.编号" :query="query" /></span>
                  <span class="intel-status-badge" :class="item.intel.状态">{{ item.intel.状态 }}</span>
                </div>
                <div class="intel-desc"><TextHighlight :text="item.intel.描述" :query="query" /></div>
                <div class="intel-meta">
                  <span class="intel-value">💰 <TextHighlight :text="item.intel.价值" :query="query" /></span>
                  <span class="intel-risk">⚠️ <TextHighlight :text="item.intel.风险" :query="query" /></span>
                  <span v-if="getIntelCleanupHint(item.key, item.intel)" class="intel-deadline">{{
                    getIntelCleanupHint(item.key, item.intel)
                  }}</span>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="intel-item empty">{{ query ? '(当前关键词下无情报碎片)' : '(暂无情报碎片)' }}</div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TextHighlight from './TextHighlight.vue';
import { useDataStore } from '../../store';
import { resolveViewMessageId } from '../../viewMessage';

const props = withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);
const store = useDataStore();
const currentMessageId = computed(() => resolveViewMessageId({ preferHistory: true }) ?? -1);
const query = computed(() => props.query ?? '');
const normalizedQuery = computed(() => query.value.trim().toLowerCase());

const hasMissionNew = computed(() => {
  const currentId = currentMessageId.value;
  if (!Number.isFinite(currentId) || currentId <= 0) return false;
  const meta = (store.data.主线任务 as any)?.$meta;
  if (!meta || typeof meta !== 'object') return false;

  const intelMeta = (meta as any)?.情报碎片 ?? {};
  if (intelMeta && typeof intelMeta === 'object') {
    for (const v of Object.values(intelMeta as any)) {
      if (!v || typeof v !== 'object') continue;
      const createdAt = Number((v as any).created_at ?? 0);
      const exploredAt = Number((v as any).explored_at ?? 0);
      const completedAt = Number((v as any).completed_at ?? 0);
      if (createdAt === currentId || exploredAt === currentId || completedAt === currentId) return true;
    }
  }

  const goalsMeta = (meta as any)?.阶段目标 ?? {};
  if (goalsMeta && typeof goalsMeta === 'object') {
    for (const v of Object.values(goalsMeta as any)) {
      if (!v || typeof v !== 'object') continue;
      const completedAt = Number((v as any).completed_at ?? 0);
      if (completedAt === currentId) return true;
    }
  }

  return false;
});

type StageTarget = { key: string; 描述: string; 当前值: number; 目标值: number };
const stageTargets = computed<StageTarget[]>(() => {
  const raw = store.data.主线任务.阶段目标 as any;
  if (Array.isArray(raw)) {
    return (raw as any[]).map((t, idx) => ({
      key: String(idx),
      描述: t?.描述 ?? '',
      当前值: Number(t?.当前值 ?? 0),
      目标值: Number(t?.目标值 ?? 0),
    }));
  }
  return Object.entries(raw ?? {}).map(([key, t]) => ({
    key,
    描述: (t as any)?.描述 ?? key,
    当前值: Number((t as any)?.当前值 ?? 0),
    目标值: Number((t as any)?.目标值 ?? 0),
  }));
});

function matchByQuery(...values: Array<string | number | null | undefined>): boolean {
  if (!normalizedQuery.value) return true;
  const merged = values
    .map(v => String(v ?? ''))
    .join('\n')
    .toLowerCase();
  return merged.includes(normalizedQuery.value);
}

const visibleStageTargets = computed(() =>
  stageTargets.value.filter(goal => matchByQuery(goal.key, goal.描述, goal.当前值, goal.目标值)),
);

const goalsTotalDisplay = computed(() => visibleStageTargets.value.length);
const completedGoalsDisplay = computed(
  () => visibleStageTargets.value.filter((goal, idx) => isGoalCompleted(goal.key, idx)).length,
);

const progressPercent = computed(() => {
  const total = goalsTotalDisplay.value;
  if (total === 0) return 0;
  return Math.round((completedGoalsDisplay.value / total) * 100);
});

function isGoalCompleted(goalKey: string, idx: number): boolean {
  const status = store.data.主线任务.目标完成状态 ?? {};
  const fallbackKey = String(idx);
  if (status[fallbackKey] === true) return true;
  if (status[goalKey] === true) return true;
  const goal = stageTargets.value.find(item => item.key === goalKey) ?? stageTargets.value[idx];
  if (!goal || typeof goal !== 'object') return false;

  const numericValues = Object.values(goal as Record<string, unknown>)
    .map(v => Number(v))
    .filter(v => Number.isFinite(v));
  if (numericValues.length < 2) return false;

  const [current, target] = numericValues;
  return target > 0 && current >= target;
}

function getGoalText(goal: any): string {
  if (!goal) return '';
  if (typeof goal === 'string') return goal;
  if (typeof goal === 'object' && '描述' in goal) return goal.描述 as string;
  return String(goal);
}

function hasGoalProgress(goal: any): boolean {
  return goal && typeof goal === 'object' && goal.当前值 !== undefined && goal.目标值 !== undefined;
}

const intelEntries = computed(() =>
  Object.entries(store.data.主线任务.情报碎片 ?? {}).map(([key, intel]) => ({
    key,
    intel: intel as any,
  })),
);

const visibleIntelEntries = computed(() =>
  intelEntries.value.filter(({ key, intel }) =>
    matchByQuery(key, intel?.编号, intel?.描述, intel?.状态, intel?.价值, intel?.风险),
  ),
);

const intelTotalDisplay = computed(() => visibleIntelEntries.value.length);
const intelCompletedDisplay = computed(
  () => visibleIntelEntries.value.filter(({ intel }) => intel?.状态 === '已完成').length,
);

function getIntelCleanupHint(key: string, intel: any): string | null {
  const meta = (store.data.主线任务 as any)?.$meta?.情报碎片?.[key];
  const currentId = currentMessageId.value;
  if (!meta || !Number.isFinite(currentId)) return null;

  const createdAt = Number(meta.created_at ?? 0);
  const exploredAt = Number(meta.explored_at ?? 0);
  const completedAt = Number(meta.completed_at ?? 0);

  const status = String(intel?.状态 ?? '');
  const doneLimit = 3;
  const notDoneLimit = 5;

  if (status === '已完成') {
    const base = completedAt || exploredAt || createdAt;
    if (!base) return null;
    const remaining = doneLimit - (currentId - base);
    if (remaining <= 0) return '即将自动清理（已完成）';
    return `剩余${remaining}层自动清理（已完成）`;
  }

  if (status === '已探索') {
    const base = exploredAt || createdAt;
    if (!base) return null;
    const remaining = doneLimit - (currentId - base);
    if (remaining <= 0) return '即将自动清理（已探索）';
    return `剩余${remaining}层自动清理（已探索）`;
  }

  // 未探索：5 楼时限
  const base = createdAt;
  if (!base) return null;
  const remaining = notDoneLimit - (currentId - base);
  if (remaining <= 0) return '已超时：即将自动清理';
  return `时限剩余${remaining}层（未完成将清理）`;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case '已完成':
      return '✓';
    case '已探索':
      return '◐';
    case '未探索':
      return '○';
    default:
      return '○';
  }
}

function getRingProgress(status: string): string {
  let progress = 33;
  switch (status) {
    case '已完成':
      progress = 100;
      break;
    case '已探索':
      progress = 66;
      break;
    case '未探索':
      progress = 33;
      break;
  }
  const circumference = 2 * Math.PI * 16;
  const offset = circumference - (progress / 100) * circumference;
  return `${progress} ${circumference} ${offset}`;
}
</script>

<style scoped>
.new-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: 8px;
  border-radius: 999px;
  background: var(--mission-new-dot-bg);
  box-shadow:
    0 0 0 2px var(--mission-new-dot-ring),
    0 0 10px var(--mission-new-dot-glow);
  vertical-align: middle;
}

.mission-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mission-phase {
  background-color: var(--bg-medium);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--mission-surface-border-soft);
}

.phase-label {
  font-size: 0.85em;
  color: var(--text-color);
  opacity: 0.8;
  margin-bottom: 6px;
}

.phase-name {
  font-size: 1em;
  font-weight: bold;
  color: var(--accent-gold);
}

/* 进度条 */
.goals-progress-bar {
  background-color: var(--bg-medium);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--mission-surface-border-soft);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.9em;
  color: var(--text-color);
}

.progress-text {
  color: var(--accent-gold);
  font-weight: bold;
}

.progress-track {
  height: 8px;
  background-color: var(--bg-dark);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--dialog-color), var(--accent-gold));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.mission-goals,
.mission-intel {
  margin-top: 4px;
}

.goals-count,
.intel-count {
  font-size: 0.85em;
  opacity: 0.7;
}

.intel-empty-hint {
  margin-top: 6px;
  font-size: 0.8em;
  color: var(--text-color);
  opacity: 0.7;
}

.goals-list,
.intel-list {
  margin-top: 8px;
  padding: 8px;
  background-color: var(--bg-dark);
  border-radius: 8px;
}

/* 目标清单 */
.goal-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 8px;
  border-bottom: 1px solid var(--mission-surface-border-soft);
  transition: all 0.2s ease;
}

.goal-item:last-child {
  border-bottom: none;
}

.goal-item.empty {
  color: var(--text-color);
  opacity: 0.6;
  justify-content: center;
}

.goal-item.completed {
  background-color: var(--mission-goal-completed-bg);
}

.goal-checkbox {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  margin-top: 1px;
}

.check-icon {
  width: 100%;
  height: 100%;
  fill: var(--dialog-color);
}

.check-icon.empty {
  fill: var(--bg-light);
  stroke: var(--text-color);
  opacity: 0.5;
}

.goal-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.goal-text {
  font-size: 0.9em;
  color: var(--text-color);
  line-height: 1.4;
  transition: all 0.2s ease;
}

.goal-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-chip {
  font-size: 0.75em;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--mission-meta-chip-bg);
  color: var(--mission-meta-chip-text);
  border: 1px solid var(--mission-meta-chip-border);
}

.goal-text.completed {
  opacity: 0.6;
  text-decoration: line-through;
}

.goal-status-tag {
  font-size: 0.7em;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--dialog-color);
  color: var(--mission-goal-status-text);
  font-weight: bold;
}

/* 情报碎片 */
.intel-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background-color: var(--mission-intel-surface-bg);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 3px solid transparent;
  transition: all 0.2s ease;
}

.intel-item:last-child {
  margin-bottom: 0;
}

.intel-item.empty {
  text-align: center;
  color: var(--text-color);
  opacity: 0.6;
  padding: 16px;
  justify-content: center;
  border-left: none;
}

.intel-item.已完成 {
  border-left-color: var(--dialog-color);
  background-color: var(--mission-intel-completed-bg);
}

.intel-item.已探索 {
  border-left-color: var(--accent-blue);
  background-color: var(--mission-intel-explored-bg);
}

.intel-item.未探索 {
  border-left-color: var(--text-color);
  opacity: 0.7;
}

/* 进度环 */
.intel-status-ring {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  position: relative;
}

.progress-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: var(--bg-dark);
  stroke-width: 2;
}

.ring-progress {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  transition: stroke-dasharray 0.3s ease;
}

.ring-progress.已完成 {
  stroke: var(--dialog-color);
}

.ring-progress.已探索 {
  stroke: var(--accent-blue);
}

.ring-progress.未探索 {
  stroke: var(--text-color);
  opacity: 0.5;
}

.ring-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.75em;
  font-weight: bold;
}

.intel-content {
  flex: 1;
  min-width: 0;
}

.intel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.intel-id {
  font-weight: bold;
  color: var(--accent-gold);
  font-size: 0.9em;
}

.intel-status-badge {
  font-size: 0.7em;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
}

.intel-status-badge.未探索 {
  color: var(--text-color);
  background-color: var(--bg-dark);
}

.intel-status-badge.已探索 {
  color: var(--mission-intel-status-explored-text);
  background-color: var(--accent-blue);
}

.intel-status-badge.已完成 {
  color: var(--mission-intel-status-completed-text);
  background-color: var(--dialog-color);
}

.intel-desc {
  font-size: 0.85em;
  color: var(--text-color);
  margin-bottom: 8px;
  line-height: 1.4;
}

.intel-meta {
  display: flex;
  gap: 12px;
  font-size: 0.75em;
  flex-wrap: wrap;
}

.intel-value {
  color: var(--accent-gold);
}

.intel-risk {
  color: var(--accent-red);
}

.intel-deadline {
  color: var(--text-color);
  opacity: 0.75;
}

/* --- mission compact redesign --- */
#mission-section .mission-content {
  gap: 9px;
}

#mission-section .mission-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 8px;
}

#mission-section .mission-phase,
#mission-section .goals-progress-bar {
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid var(--mission-overview-card-border);
  background: var(--mission-overview-card-bg);
}

#mission-section .phase-label {
  margin-bottom: 4px;
  font-size: 0.76em;
}

#mission-section .phase-name {
  font-size: 0.92em;
  line-height: 1.25;
}

#mission-section .progress-header {
  margin-bottom: 6px;
  font-size: 0.8em;
}

#mission-section .progress-track {
  height: 6px;
  border-radius: 999px;
}

#mission-section .mission-goals,
#mission-section .mission-intel {
  margin-top: 0;
  padding: 7px;
  border-radius: 10px;
  border: 1px solid var(--mission-panel-border);
  background: var(--mission-panel-bg);
}

#mission-section .mission-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid var(--mission-panel-title-border);
  background: var(--mission-panel-title-bg);
}

#mission-section .panel-title-main {
  font-size: 0.98em;
  font-weight: 700;
  line-height: 1.2;
}

#mission-section .panel-title-count {
  font-size: 0.82em;
  font-weight: 700;
  color: var(--mission-panel-title-count-color);
  opacity: 0.95;
}

#mission-section .goals-list,
#mission-section .intel-list {
  margin-top: 0;
  padding: 6px;
  border-radius: 8px;
}

#mission-section .goal-item {
  gap: 8px;
  padding: 7px 6px;
}

#mission-section .goal-content {
  gap: 3px;
}

#mission-section .goal-text {
  font-size: 0.84em;
  line-height: 1.32;
}

#mission-section .meta-chip {
  font-size: 0.72em;
  padding: 1px 6px;
}

#mission-section .goal-status-tag {
  font-size: 0.66em;
  padding: 1px 5px;
}

#mission-section .goal-checkbox {
  width: 19px;
  height: 19px;
  margin-top: 0;
}

#mission-section .intel-item {
  gap: 9px;
  padding: 8px;
  margin-bottom: 6px;
  border-radius: 8px;
}

#mission-section .intel-status-ring {
  width: 30px;
  height: 30px;
}

#mission-section .intel-header {
  margin-bottom: 4px;
}

#mission-section .intel-id {
  font-size: 0.78em;
}

#mission-section .intel-status-badge {
  font-size: 0.65em;
  padding: 1px 7px;
}

#mission-section .intel-desc {
  font-size: 0.8em;
  margin-bottom: 5px;
  line-height: 1.35;
}

#mission-section .intel-meta {
  gap: 8px;
  font-size: 0.72em;
}

#mission-section .intel-empty-hint {
  margin: 2px 2px 5px;
  font-size: 0.74em;
}

@media (max-width: 640px) {
  #mission-section .mission-overview-grid {
    grid-template-columns: 1fr;
  }

  #mission-section .panel-title-main {
    font-size: 0.92em;
  }
}
</style>

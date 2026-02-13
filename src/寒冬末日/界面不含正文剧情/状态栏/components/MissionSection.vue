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
          <div class="phase-name">{{ store.data.主线任务.当前阶段 }}</div>
        </div>

        <!-- 阶段目标进度条 -->
        <div class="goals-progress-bar">
          <div class="progress-header">
            <span>🎯 阶段目标进度</span>
            <span class="progress-text">{{ completedGoals }}/{{ stageTargets.length }}</span>
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
          <span class="panel-title-count">{{ completedGoals }}/{{ stageTargets.length }}</span>
        </div>
        <div class="goals-list">
          <template v-if="stageTargets.length > 0">
            <div
              v-for="(goal, idx) in stageTargets"
              :key="goal.key || idx"
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
                  {{ getGoalText(goal) }}
                </div>
                <div v-if="hasGoalProgress(goal)" class="goal-meta">
                  <span class="meta-chip">进度：{{ goal.当前值 ?? 0 }}/{{ goal.目标值 ?? 0 }}</span>
                </div>
                <span v-if="isGoalCompleted(goal.key, idx)" class="goal-status-tag">已完成</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="goal-item empty">(暂无目标)</div>
          </template>
        </div>
      </div>

      <!-- 情报碎片 -->
      <div class="mission-intel">
        <div class="mission-panel-title">
          <span class="panel-title-main">🔍 情报碎片</span>
          <span class="panel-title-count">{{ intelCompleted }}/{{ intelTotal }}</span>
        </div>
        <div v-if="intelTotal === 0" class="intel-empty-hint">暂无情报碎片，继续探索/搜刮可解锁新的线索。</div>
        <div class="intel-list">
          <template v-if="intelTotal > 0">
            <div v-for="(intel, key) in store.data.主线任务.情报碎片" :key="key" class="intel-item" :class="intel.状态">
              <div class="intel-status-ring" :class="intel.状态">
                <svg viewBox="0 0 36 36" class="progress-ring">
                  <circle cx="18" cy="18" r="16" class="ring-bg" />
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    class="ring-progress"
                    :stroke-dasharray="getRingProgress(intel.状态)"
                    :class="intel.状态"
                  />
                </svg>
                <span class="ring-icon">{{ getStatusIcon(intel.状态) }}</span>
              </div>
              <div class="intel-content">
                <div class="intel-header">
                  <span class="intel-id">{{ intel.编号 }}</span>
                  <span class="intel-status-badge" :class="intel.状态">{{ intel.状态 }}</span>
                </div>
                <div class="intel-desc">{{ intel.描述 }}</div>
                <div class="intel-meta">
                  <span class="intel-value">💰 {{ intel.价值 }}</span>
                  <span class="intel-risk">⚠️ {{ intel.风险 }}</span>
                  <span v-if="getIntelCleanupHint(key, intel)" class="intel-deadline">{{
                    getIntelCleanupHint(key, intel)
                  }}</span>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="intel-item empty">(暂无情报碎片)</div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDataStore } from '../../store';
import { resolveViewMessageId } from '../../../界面/viewMessage';

const store = useDataStore();
const currentMessageId = computed(() => resolveViewMessageId({ preferHistory: true }) ?? -1);

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
      if (createdAt === currentId || exploredAt === currentId || completedAt === currentId)
        return true;
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

const completedGoals = computed(() => stageTargets.value.filter((g, idx) => isGoalCompleted(g.key, idx)).length);

const progressPercent = computed(() => {
  const total = stageTargets.value.length;
  if (total === 0) return 0;
  return Math.round((completedGoals.value / total) * 100);
});

function isGoalCompleted(goalKey: string, idx: number): boolean {
  const status = store.data.主线任务.目标完成状态 ?? {};
  if (goalKey in status) return status[goalKey] === true;
  const fallbackKey = String(idx);
  return status[fallbackKey] === true;
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

// 情报碎片统计
const intelTotal = computed(() => Object.keys(store.data.主线任务.情报碎片 ?? {}).length);
const intelCompleted = computed(
  () => Object.values(store.data.主线任务.情报碎片 ?? {}).filter(i => i.状态 === '已完成').length,
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
  background: rgba(229, 57, 53, 0.9);
  box-shadow:
    0 0 0 2px rgba(0, 0, 0, 0.25),
    0 0 10px rgba(229, 57, 53, 0.35);
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
  border: 1px solid rgba(255, 255, 255, 0.05);
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
  border: 1px solid rgba(255, 255, 255, 0.05);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
  background-color: rgba(80, 250, 123, 0.1);
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
  background: rgba(255, 255, 255, 0.08);
  color: var(--accent-blue);
  border: 1px solid rgba(255, 255, 255, 0.08);
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
  color: var(--bg-dark);
  font-weight: bold;
}

/* 情报碎片 */
.intel-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background-color: var(--bg-medium);
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
  background-color: rgba(80, 250, 123, 0.08);
}

.intel-item.已探索 {
  border-left-color: var(--accent-blue);
  background-color: rgba(189, 147, 249, 0.08);
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
  color: var(--bg-dark);
  background-color: var(--accent-blue);
}

.intel-status-badge.已完成 {
  color: var(--bg-dark);
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
  border: 1px solid rgba(173, 186, 216, 0.16);
  background: linear-gradient(170deg, rgba(35, 41, 62, 0.92), rgba(21, 25, 42, 0.85));
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
  border: 1px solid rgba(173, 186, 216, 0.14);
  background: linear-gradient(180deg, rgba(13, 17, 31, 0.86), rgba(8, 10, 22, 0.88));
}

#mission-section .mission-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid rgba(141, 233, 255, 0.3);
  background: linear-gradient(180deg, rgba(67, 79, 112, 0.55), rgba(54, 63, 92, 0.5));
}

#mission-section .panel-title-main {
  font-size: 0.98em;
  font-weight: 700;
  line-height: 1.2;
}

#mission-section .panel-title-count {
  font-size: 0.82em;
  font-weight: 700;
  color: rgba(237, 241, 255, 0.9);
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

<template>
  <section class="workbench-card">
    <div class="workbench-tabs" role="tablist" aria-label="工作台面板">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="workbench-tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'overview'" class="workbench-panel">
      <section class="overview-grid">
        <div class="overview-block">
          <span class="block-label">当前轮次</span>
          <strong class="block-value">{{ summary.turnCount }}</strong>
        </div>

        <div class="overview-block">
          <span class="block-label">最近一次 user 输入</span>
          <div class="block-text">{{ summary.latestUserPreview || '暂无用户输入' }}</div>
        </div>

        <div class="overview-block">
          <span class="block-label">最新 assistant</span>
          <div class="block-text">{{ summary.latestAssistantPreview || '暂无助手回复' }}</div>
        </div>

        <div class="overview-block">
          <span class="block-label">当前模式</span>
          <div class="block-text">{{ summary.readingModeLabel }} / {{ summary.statusLabel }}</div>
        </div>

        <div class="overview-block">
          <span class="block-label">当前占位楼层</span>
          <div class="block-text">{{ summary.assistantAnchorLabel }}</div>
        </div>
      </section>
    </div>

    <div v-else-if="activeTab === 'characters'" class="workbench-panel placeholder-panel">
      <strong>人物面板预留</strong>
      <p>这里后续接 zod mvu 的专业角色/道侣/人物面板，不在当前 demo 阶段展开。</p>
    </div>

    <div v-else class="workbench-panel logs-panel">
      <section class="log-summary">
        <div class="log-summary-block">
          <span class="block-label">简短剧情摘要</span>
          <div class="block-text">{{ summary.storySummary || '暂无剧情摘要' }}</div>
        </div>
        <div class="log-summary-block">
          <span class="block-label">最近一次 user 输入</span>
          <div class="block-text">{{ summary.latestUserPreview || '暂无' }}</div>
        </div>
      </section>

      <section class="log-list-section">
        <span class="block-label">最近操作</span>
        <div v-if="logs.length === 0" class="empty-log">暂无日志</div>
        <ul v-else class="log-list">
          <li v-for="log in logs" :key="log.id" class="log-item" :class="`is-${log.type}`">
            <div class="log-head">
              <strong>{{ log.title }}</strong>
              <span>{{ log.createdAt }}</span>
            </div>
            <div class="log-detail">{{ log.detail }}</div>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ReaderLogItem, ReaderSummary } from '../types';

type WorkbenchTab = 'overview' | 'characters' | 'logs';

defineProps<{
  summary: ReaderSummary;
  logs: ReaderLogItem[];
}>();

defineEmits<{}>();

const activeTab = ref<WorkbenchTab>('overview');
const tabs: Array<{ key: WorkbenchTab; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'characters', label: '人物' },
  { key: 'logs', label: '日志' },
];
</script>

<style scoped>
.workbench-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: var(--demo-surface-card-strong);
  border: 1px solid var(--demo-border-accent);
}

.workbench-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.workbench-tab-btn {
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-muted);
  background: var(--demo-surface-panel);
  color: var(--demo-text-primary);
  padding: 6px 12px;
}

.workbench-tab-btn.active {
  background: var(--demo-gradient-chip-active);
  border-color: var(--demo-border-accent-active);
}

.workbench-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.overview-block,
.log-summary-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  background: var(--demo-surface-panel);
  border: 1px solid var(--demo-border-accent-soft);
}

.block-label {
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.block-value {
  font-size: 18px;
}

.block-text,
.log-detail,
.placeholder-panel p {
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.placeholder-panel {
  padding: 10px;
  border-radius: 10px;
  background: var(--demo-surface-panel);
  border: 1px dashed var(--demo-border-accent);
}

.log-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.log-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  padding: 10px;
  border-radius: 10px;
  background: var(--demo-surface-panel-strong);
  border: 1px solid var(--demo-border-accent-soft);
}

.log-item.is-action {
  border-color: var(--demo-border-cyan);
}

.log-item.is-error {
  border-color: var(--demo-border-danger-soft);
}

.log-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.empty-log {
  font-size: 12px;
  color: var(--demo-text-subtle);
}

@media (max-width: 680px) {
  .overview-grid,
  .log-summary {
    grid-template-columns: 1fr;
  }
}
</style>

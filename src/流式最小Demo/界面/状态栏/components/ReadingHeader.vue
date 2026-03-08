<template>
  <section class="reading-header">
    <div class="reading-title-block">
      <span class="reading-kicker">READER MODE</span>
      <h2>故事阅读器</h2>
      <p>在当前楼层中阅读、回滚、重生与追踪剧情，不再依赖酒馆原生楼层视角。</p>
    </div>

    <div class="reading-metrics">
      <div class="metric-card">
        <span class="metric-label">当前轮次</span>
        <strong class="metric-value">{{ summary.turnCount }}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-label">阅读模式</span>
        <strong class="metric-value">{{ summary.readingModeLabel }}</strong>
      </div>
      <div class="metric-card">
        <span class="metric-label">生成状态</span>
        <strong class="metric-value">{{ summary.statusLabel }}</strong>
      </div>
      <div class="metric-card wide">
        <span class="metric-label">占位楼层 / latest assistant</span>
        <strong class="metric-value">{{ summary.assistantAnchorLabel }}</strong>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ReaderSummary } from '../types';

defineProps<{
  summary: ReaderSummary;
}>();
</script>

<style scoped>
.reading-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: var(--demo-surface-card-strong);
  border: 1px solid var(--demo-border-accent);
}

.reading-title-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reading-kicker {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--demo-text-accent-soft);
}

.reading-title-block h2,
.reading-title-block p {
  margin: 0;
}

.reading-title-block h2 {
  font-size: 18px;
}

.reading-title-block p {
  font-size: 12px;
  line-height: 1.45;
  color: var(--demo-text-tertiary);
}

.reading-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
  padding: 10px;
  border-radius: 10px;
  background: var(--demo-surface-panel);
  border: 1px solid var(--demo-border-accent-soft);
}

.metric-card.wide {
  grid-column: span 1;
}

.metric-label {
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.metric-value {
  font-size: 13px;
  color: var(--demo-text-primary);
}

@media (max-width: 680px) {
  .reading-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

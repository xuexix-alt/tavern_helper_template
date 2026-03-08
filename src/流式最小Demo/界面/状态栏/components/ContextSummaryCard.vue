<template>
  <section class="summary-card">
    <div class="summary-block">
      <span class="summary-label">最近一次 user 输入</span>
      <div class="summary-body">{{ summary.latestUserPreview || '暂无用户输入' }}</div>
    </div>

    <div class="summary-block">
      <span class="summary-label">简短剧情摘要</span>
      <div class="summary-body">{{ summary.storySummary || '暂无剧情摘要' }}</div>
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
.summary-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 12px;
  background: var(--demo-surface-card);
  border: 1px solid var(--demo-border-accent);
}

.summary-label {
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.summary-body {
  font-size: 13px;
  line-height: 1.55;
  color: var(--demo-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 680px) {
  .summary-card {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <section class="workbench-card">
    <section class="workbench-panel logs-panel">
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
  </section>
</template>

<script setup lang="ts">
import type { ReaderLogItem } from '../types';

defineProps<{
  logs: ReaderLogItem[];
}>();
</script>

<style scoped>
.workbench-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: var(--demo-surface-card-strong);
  border: 1px solid var(--demo-border-accent);
}

.workbench-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-label {
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.block-text,
.log-detail {
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
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
</style>

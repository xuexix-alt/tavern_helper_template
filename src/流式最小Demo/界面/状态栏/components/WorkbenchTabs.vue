<template>
  <section class="workbench-card hud-panel clip-corner-sm">
    <section class="workbench-panel logs-panel">
      <span class="block-label">最近操作</span>
      <div v-if="logs.length === 0" class="empty-log">暂无日志</div>
      <ul v-else class="log-list">
        <li v-for="log in logs" :key="log.id" class="log-item clip-corner-sm" :class="`is-${log.type}`">
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
  padding: 12px;
  border-radius: 14px;
}

.workbench-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-label {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}

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
  background: color-mix(in srgb, var(--surface) 42%, transparent);
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

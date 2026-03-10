<template>
  <section class="toolbar-card">
    <div class="toolbar-row">
      <div class="toolbar-block">
        <span class="toolbar-label">筛选</span>
        <div class="toolbar-segmented">
          <button
            v-for="item in filterItems"
            :key="item.value"
            type="button"
            class="toolbar-chip"
            :class="{ active: filterMode === item.value }"
            @click="$emit('update:filterMode', item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="toolbar-block">
        <span class="toolbar-label">密度</span>
        <div class="toolbar-segmented">
          <button
            v-for="item in densityItems"
            :key="item.value"
            type="button"
            class="toolbar-chip"
            :class="{ active: density === item.value }"
            @click="$emit('update:density', item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="toolbar-row meta-row">
      <div class="toolbar-meta">
        <span>总楼层 {{ totalCount }}</span>
        <span class="meta-divider">·</span>
        <span>正文</span>
        <span class="meta-preview">{{ latestUserPreview || '暂无' }}</span>
      </div>
      <div class="toolbar-actions">
        <span
          v-if="isBrowsingHistory"
          class="history-indicator"
          title="当前正在浏览历史"
          aria-label="当前正在浏览历史"
          >⌁</span
        >
        <button type="button" class="jump-btn" :disabled="atLatest" @click="$emit('jump-latest')">
          {{ atLatest ? '已在最新' : '回到最新' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TranscriptDensity, TranscriptFilterMode } from '../types';

defineProps<{
  filterMode: TranscriptFilterMode;
  density: TranscriptDensity;
  totalCount: number;
  latestUserPreview: string;
  atLatest: boolean;
  isBrowsingHistory: boolean;
}>();

defineEmits<{
  (event: 'update:filterMode', value: TranscriptFilterMode): void;
  (event: 'update:density', value: TranscriptDensity): void;
  (event: 'jump-latest'): void;
}>();

const filterItems: Array<{ label: string; value: TranscriptFilterMode }> = [
  { label: '仅助手', value: 'assistant' },
  { label: '全部', value: 'all' },
];

const densityItems: Array<{ label: string; value: TranscriptDensity }> = [
  { label: '正常', value: 'comfortable' },
  { label: '极简', value: 'minimal' },
];
</script>

<style scoped>
.toolbar-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: var(--demo-surface-card);
  border: 1px solid var(--demo-border-accent);
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar-block {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-label {
  font-size: 12px;
  color: var(--demo-text-tertiary);
}

.toolbar-segmented {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.toolbar-chip,
.jump-btn {
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-muted);
  background: var(--demo-surface-panel);
  color: var(--demo-text-primary);
  padding: 6px 12px;
}

.toolbar-chip.active {
  background: var(--demo-gradient-chip-active);
  border-color: var(--demo-border-accent-active);
}

.meta-row {
  align-items: center;
}

.toolbar-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.meta-divider {
  opacity: 0.6;
}

.meta-preview {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.history-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-warning-soft);
  background: var(--demo-surface-user-soft);
  color: var(--demo-text-warning-soft);
  font-size: 12px;
  line-height: 1;
}

.jump-btn:disabled {
  opacity: 0.55;
}
</style>

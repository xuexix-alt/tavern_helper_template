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
        <span>消息 {{ totalCount }}</span>
        <span>助手 {{ assistantCount }}</span>
        <span>当前占位 #{{ assistantMessageId ?? '-' }}</span>
      </div>
      <button type="button" class="jump-btn" :disabled="atLatest" @click="$emit('jump-latest')">
        {{ atLatest ? '已在最新' : '回到最新' }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TranscriptDensity, TranscriptFilterMode } from '../types';

defineProps<{
  filterMode: TranscriptFilterMode;
  density: TranscriptDensity;
  totalCount: number;
  assistantCount: number;
  assistantMessageId: number | null;
  atLatest: boolean;
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
  { label: '舒适', value: 'comfortable' },
  { label: '紧凑', value: 'compact' },
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
  background: rgba(20, 28, 46, 0.9);
  border: 1px solid rgba(126, 160, 255, 0.18);
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
  color: rgba(230, 236, 255, 0.72);
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
  border: 1px solid rgba(126, 160, 255, 0.2);
  background: rgba(7, 11, 20, 0.9);
  color: #f3f7ff;
  padding: 6px 12px;
}

.toolbar-chip.active {
  background: linear-gradient(135deg, rgba(120, 160, 255, 0.34), rgba(95, 208, 255, 0.28));
  border-color: rgba(120, 160, 255, 0.45);
}

.meta-row {
  align-items: center;
}

.toolbar-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: rgba(230, 236, 255, 0.64);
}

.jump-btn:disabled {
  opacity: 0.55;
}
</style>

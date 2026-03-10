<template>
  <section class="toolbar-card hud-panel clip-corner">
    <div class="toolbar-brand-row">
      <div class="toolbar-brand">
        <span class="demo-kicker">TRANSCRIPT // WORKBENCH</span>
        <strong>实时工作台</strong>
      </div>

      <div class="toolbar-live">
        <span class="toolbar-live-dot"></span>
        <span>在线</span>
      </div>
    </div>

    <div class="toolbar-row toolbar-row-main">
      <div class="toolbar-block toolbar-theme-block">
        <span class="toolbar-label">主题</span>
        <div class="toolbar-segmented toolbar-segmented-scroll">
          <button
            v-for="item in themeItems"
            :key="item.value"
            type="button"
            class="toolbar-chip clip-corner-sm"
            :class="{ active: theme === item.value }"
            @click="$emit('update:theme', item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="toolbar-block">
        <span class="toolbar-label">筛选模式</span>
        <div class="toolbar-segmented">
          <button
            v-for="item in filterItems"
            :key="item.value"
            type="button"
            class="toolbar-chip clip-corner-sm"
            :class="{ active: filterMode === item.value }"
            @click="$emit('update:filterMode', item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="toolbar-block">
        <span class="toolbar-label">阅读密度</span>
        <div class="toolbar-segmented">
          <button
            v-for="item in densityItems"
            :key="item.value"
            type="button"
            class="toolbar-chip clip-corner-sm"
            :class="{ active: density === item.value }"
            @click="$emit('update:density', item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <button type="button" class="jump-btn clip-corner-sm" :disabled="atLatest" @click="$emit('jump-latest')">
        {{ atLatest ? '已在最新' : '回到最新' }}
      </button>
    </div>

    <div class="toolbar-row meta-row">
      <div class="toolbar-meta">
        <span>总楼层 {{ totalCount }}</span>
        <span class="meta-divider">·</span>
        <span>最近正文</span>
        <span class="meta-preview">{{ latestUserPreview || '暂无' }}</span>
      </div>
      <div class="toolbar-actions">
        <span v-if="isBrowsingHistory" class="history-indicator" title="当前正在浏览历史" aria-label="当前正在浏览历史">
          HISTORY
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DemoTheme, TranscriptDensity, TranscriptFilterMode } from '../types';

defineProps<{
  theme: DemoTheme;
  filterMode: TranscriptFilterMode;
  density: TranscriptDensity;
  totalCount: number;
  latestUserPreview: string;
  atLatest: boolean;
  isBrowsingHistory: boolean;
}>();

defineEmits<{
  (event: 'update:theme', value: DemoTheme): void;
  (event: 'update:filterMode', value: TranscriptFilterMode): void;
  (event: 'update:density', value: TranscriptDensity): void;
  (event: 'jump-latest'): void;
}>();

const themeItems: Array<{ label: string; value: DemoTheme }> = [
  { label: '科技', value: 'tech' },
  { label: '暗黑', value: 'dark' },
  { label: '鎏金', value: 'gold' },
  { label: 'iOS', value: 'ios' },
  { label: 'iPod', value: 'ipod' },
  { label: '琥珀', value: 'amber' },
];

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
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
}

.toolbar-brand-row,
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar-brand {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toolbar-brand strong {
  font-size: 16px;
  line-height: 1.2;
}

.toolbar-live {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 40%, transparent);
  padding: 8px 10px;
  border-radius: 999px;
  font-family: var(--demo-font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--demo-text-tertiary);
}

.toolbar-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary) 8%, transparent);
}

.toolbar-row-main {
  align-items: flex-end;
}

.toolbar-block {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 240px;
}

.toolbar-theme-block {
  flex-basis: 100%;
}

.toolbar-label {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-tertiary);
}

.toolbar-segmented {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.toolbar-segmented-scroll {
  width: 100%;
  overflow-x: auto;
  flex-wrap: nowrap;
  padding-bottom: 2px;
}

.toolbar-chip,
.jump-btn {
  min-height: 38px;
  border: 1px solid var(--demo-border-accent-muted);
  background: color-mix(in srgb, var(--surface) 42%, transparent);
  color: var(--demo-text-primary);
  padding: 8px 13px;
  white-space: nowrap;
}

.toolbar-chip.active {
  background: var(--demo-gradient-chip-active);
  border-color: var(--demo-border-accent-active);
  box-shadow: 0 10px 20px color-mix(in srgb, var(--shadow-color) 24%, transparent);
}

.meta-row {
  align-items: center;
  padding-top: 2px;
  border-top: 1px solid color-mix(in srgb, var(--border) 18%, transparent);
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
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--demo-border-warning-soft);
  background: var(--demo-surface-user-soft);
  color: var(--demo-text-warning-soft);
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  line-height: 1;
}

.jump-btn:disabled {
  opacity: 0.55;
}

@media (max-width: 640px) {
  .toolbar-card {
    padding: 12px;
  }

  .toolbar-row-main {
    align-items: stretch;
  }

  .jump-btn {
    width: 100%;
  }
}
</style>

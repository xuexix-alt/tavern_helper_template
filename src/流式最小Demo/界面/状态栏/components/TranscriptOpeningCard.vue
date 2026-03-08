<template>
  <article class="transcript-item opening" :class="[`is-${density}`, { collapsed: !expanded }]">
    <header class="transcript-head">
      <div class="opening-banner">
        <span class="opening-kicker">CHAPTER OPENING</span>
        <strong class="opening-title">章节开场</strong>
        <span class="opening-desc">以下内容直接联动酒馆真实开局楼层，作为 transcript 的起点。</span>
      </div>

      <div class="transcript-title-row">
        <strong>#{{ item.message_id }}</strong>
        <span class="role-pill is-assistant">开局</span>
        <span v-if="item.hidden" class="meta-pill">hidden</span>
        <span class="meta-pill">seed</span>
      </div>

      <div class="transcript-actions">
        <span class="transcript-preview">{{ item.preview || '(空消息)' }}</span>
        <button type="button" class="toggle-btn" @click="$emit('toggle-opening')">
          {{ expanded ? '收起开场' : '展开开场' }}
        </button>
        <button v-if="item.canOpenDetail" type="button" class="detail-btn" @click="$emit('open-detail', item)">
          详情
        </button>
      </div>
    </header>

    <div
      v-if="showBody"
      class="transcript-body opening-body"
      :class="{ compact: density === 'compact', collapsed: !expanded }"
    >
      <div class="html-body" v-html="item.finalHtml || '<p>(空回复)</p>'"></div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { TranscriptDensity, TranscriptItem } from '../types';

defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'toggle-opening'): void;
}>();

const props = defineProps<{
  item: TranscriptItem;
  density: TranscriptDensity;
  expanded: boolean;
}>();

const showBody = computed(() => {
  if (props.density === 'minimal') return props.expanded;
  return true;
});
</script>

<style scoped>
.transcript-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--demo-border-warning-stronger);
  background:
    radial-gradient(circle at top left, var(--demo-surface-user-muted), transparent 42%),
    linear-gradient(180deg, var(--demo-surface-opening-shadow), var(--demo-surface-panel-strong));
  box-shadow:
    0 0 0 1px var(--demo-surface-user-muted) inset,
    0 10px 24px var(--demo-surface-shadow-soft);
}

.transcript-item.is-compact {
  padding: 8px 9px;
}

.transcript-item.is-minimal {
  padding: 8px;
}

.transcript-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.opening-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--demo-surface-user-soft);
  border: 1px solid var(--demo-border-warning);
}

.opening-kicker {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--demo-text-opening);
}

.opening-title {
  font-size: 15px;
  line-height: 1.2;
  color: var(--demo-text-warning);
}

.opening-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--demo-text-opening-muted);
}

.transcript-title-row,
.transcript-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.role-pill,
.meta-pill,
.detail-btn {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
}

.role-pill.is-assistant {
  background: var(--demo-surface-accent);
  color: var(--demo-text-accent);
}

.meta-pill {
  background: var(--demo-surface-neutral-strong);
  color: var(--demo-text-muted);
}

.transcript-preview {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--demo-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-btn {
  border: 1px solid var(--demo-border-accent);
  background: var(--demo-surface-neutral-soft);
  color: var(--demo-text-primary);
}

.toggle-btn {
  border: 1px solid var(--demo-border-warning-soft);
  background: var(--demo-surface-user-soft);
  color: var(--demo-text-warning);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
}

.transcript-body {
  font-size: 13px;
  line-height: 1.55;
}

.opening-body.compact {
  max-height: 220px;
  overflow: auto;
}

.opening-body.collapsed {
  max-height: 176px;
  overflow: hidden;
  position: relative;
}

.opening-body.collapsed::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 56px;
  background: var(--demo-gradient-opening-fade);
  pointer-events: none;
}

.html-body {
  padding: 4px 2px 0;
}

.html-body :deep(p),
.html-body :deep(li),
.html-body :deep(blockquote) {
  color: var(--demo-text-opening-strong);
}

.html-body :deep(h1),
.html-body :deep(h2),
.html-body :deep(h3),
.html-body :deep(strong) {
  color: var(--demo-text-warning-strong);
}

.html-body :deep(p) {
  margin: 0 0 0.6em;
}

.html-body :deep(p:last-child) {
  margin-bottom: 0;
}
</style>

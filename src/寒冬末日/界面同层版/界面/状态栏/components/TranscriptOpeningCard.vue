<template>
  <article
    class="transcript-item opening clip-corner"
    :class="[`is-${density}`, `font-${fontMode}`, { collapsed: !expanded }]"
  >
    <header class="transcript-head">
      <div class="opening-banner clip-corner-sm">
        <span class="opening-kicker">CHAPTER OPENING</span>
        <strong class="opening-title">章节开场</strong>
        <span class="opening-desc">寒冬末日-星穹秩序</span>
      </div>

      <div class="transcript-title-row">
        <strong>#{{ item.message_id }}</strong>
        <span class="role-pill is-assistant">开局</span>
        <span v-if="item.hidden" class="meta-pill">hidden</span>
        <span class="meta-pill">seed</span>
      </div>

      <div class="transcript-actions">
        <span class="transcript-preview">{{ item.preview || '(空消息)' }}</span>
        <button
          v-if="item.canReroll"
          type="button"
          class="reroll-btn clip-corner-sm"
          :disabled="busy"
          @click="$emit('reroll-opening')"
        >
          重ROLL
        </button>
        <button type="button" class="toggle-btn clip-corner-sm" @click="$emit('toggle-opening')">
          {{ expanded ? '收起' : '展开' }}
        </button>
        <button
          v-if="item.canOpenDetail"
          type="button"
          class="detail-btn clip-corner-sm"
          @click="$emit('open-detail', item)"
        >
          详情
        </button>
      </div>
    </header>

    <div v-if="showBody" class="transcript-body opening-body" :class="{ collapsed: !expanded }">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="html-body" v-html="item.finalHtml || '<p>(空回复)</p>'"></div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { ReaderFontMode, TranscriptDensity, TranscriptItem } from '../types';

defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'toggle-opening'): void;
  (event: 'reroll-opening'): void;
}>();

const props = defineProps<{
  item: TranscriptItem;
  density: TranscriptDensity;
  fontMode: ReaderFontMode;
  expanded: boolean;
  busy?: boolean;
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
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--demo-border-warning-stronger);
  background:
    radial-gradient(circle at top left, rgba(191, 158, 96, 0.12), transparent 42%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface) 95%, transparent),
      color-mix(in srgb, var(--surface) 98%, black 2%)
    );
  box-shadow: 0 18px 34px var(--demo-surface-shadow-soft);
}

.transcript-item.is-minimal {
  padding: 9px;
}

.transcript-item.is-minimal .opening-banner {
  padding: 10px 12px;
}

.transcript-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.opening-banner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--surface) 42%, transparent);
  border: 1px solid var(--demo-border-warning);
}

.opening-kicker {
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--demo-text-opening);
}

.opening-title {
  font-size: 17px;
  line-height: 1.2;
  color: var(--demo-text-warning);
}

.opening-desc {
  font-size: 12px;
  line-height: 1.5;
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
.detail-btn,
.toggle-btn {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  font-size: 11px;
}

.role-pill.is-assistant {
  background: var(--demo-surface-accent);
  color: var(--demo-text-accent);
}

.meta-pill {
  background: color-mix(in srgb, var(--surface) 40%, transparent);
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
  background: color-mix(in srgb, var(--surface) 40%, transparent);
  color: var(--demo-text-primary);
}

.toggle-btn {
  border: 1px solid var(--demo-border-warning-soft);
  background: var(--demo-surface-user-soft);
  color: var(--demo-text-warning);
}

.reroll-btn {
  border: 1px solid var(--demo-border-accent);
  background: color-mix(in srgb, var(--surface) 44%, transparent);
  color: var(--demo-text-primary);
}

.transcript-body {
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid rgba(191, 158, 96, 0.18);
  background: color-mix(in srgb, var(--surface) 34%, transparent);
  padding: 12px;
}

.transcript-item.is-minimal .transcript-body {
  padding: 10px;
}

.transcript-item.is-minimal .transcript-preview {
  font-size: 11px;
}

.transcript-item.font-reading .transcript-body,
.transcript-item.font-reading .html-body :deep(p),
.transcript-item.font-reading .html-body :deep(li),
.transcript-item.font-reading .html-body :deep(blockquote) {
  font-family: var(--demo-font-sans);
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
  padding: 2px 0 0;
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

@media (max-width: 760px) {
  .transcript-item {
    padding: 10px 8px;
  }

  .opening-banner {
    padding: 10px 10px;
  }

  .transcript-body {
    padding: 10px 8px;
  }
}
</style>

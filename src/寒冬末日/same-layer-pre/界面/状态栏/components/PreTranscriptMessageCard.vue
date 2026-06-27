<template>
  <article class="pre-message-card" :class="[`role-${item.role}`, { 'is-hidden': item.hidden }]">
    <header class="pre-message-card__header">
      <span class="pre-message-card__role">{{ item.roleLabel }}</span>
      <span class="pre-message-card__id">#{{ item.message_id }}</span>
      <span v-if="item.hidden" class="pre-message-card__flag">HIDDEN</span>
      <span v-if="item.isStreaming" class="pre-message-card__flag">STREAM</span>
    </header>

    <StreamRenderer
      v-if="item.isStreaming"
      :message="item.content"
      :role="item.role"
      :active="true"
      :message-id="item.message_id"
      class="pre-message-card__body"
    />
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else class="pre-message-card__body" v-html="item.finalHtml || item.preview"></div>

    <footer v-if="showActions" class="pre-message-card__actions" :class="{ confirming: showRollbackConfirm }">
      <template v-if="showRollbackConfirm">
        <span class="pre-message-card__confirm-text">删除当前及后续楼层</span>
        <button
          type="button"
          class="pre-message-card__action danger"
          :disabled="busy"
          @click="emit('confirm-rollback', item)"
        >
          确认回退
        </button>
        <button type="button" class="pre-message-card__action" :disabled="busy" @click="emit('cancel-rollback')">
          取消
        </button>
      </template>

      <template v-else>
        <button
          v-if="item.canReroll"
          type="button"
          class="pre-message-card__action primary"
          :disabled="busy"
          @click="emit('regenerate-message', item)"
        >
          重新生成
        </button>
        <button
          v-if="item.canDeleteFrom"
          type="button"
          class="pre-message-card__action"
          :disabled="busy"
          @click="emit('request-rollback', item)"
        >
          回退删除
        </button>
      </template>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import StreamRenderer from './StreamRenderer.vue';
import type { TranscriptItem } from '../types';

const props = defineProps<{
  item: TranscriptItem;
  busy?: boolean;
  showRollbackConfirm?: boolean;
}>();

const emit = defineEmits<{
  (event: 'request-rollback', item: TranscriptItem): void;
  (event: 'confirm-rollback', item: TranscriptItem): void;
  (event: 'cancel-rollback'): void;
  (event: 'regenerate-message', item: TranscriptItem): void;
}>();

const showActions = computed(() => props.item.canDeleteFrom || props.item.canReroll || props.showRollbackConfirm);
</script>

<style scoped>
.pre-message-card {
  box-sizing: border-box;
  display: grid;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  padding: 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 22%, transparent);
  color: var(--demo-text-primary);
}

.pre-message-card.role-user {
  border-color: color-mix(in srgb, var(--demo-color-success, #4fd88a) 34%, transparent);
}

.pre-message-card.role-system {
  opacity: 0.86;
}

.pre-message-card.is-hidden {
  opacity: 0.58;
}

.pre-message-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--demo-text-tertiary);
}

.pre-message-card__role {
  color: var(--demo-text-accent);
}

.pre-message-card__id {
  margin-left: auto;
}

.pre-message-card__flag {
  padding: 2px 6px;
  border: 1px solid var(--demo-border-accent-soft);
  color: var(--demo-text-secondary);
}

.pre-message-card__body {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.75;
}

.pre-message-card__body :deep(*) {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.pre-message-card__body :deep(:where(p, .pre-reading-paragraph, blockquote)) {
  text-indent: 2em;
  margin-block: 0;
}

.pre-message-card__body
  :deep(:where(p, .pre-reading-paragraph, blockquote) + :where(p, .pre-reading-paragraph, blockquote)) {
  margin-block-start: 1em;
}

.pre-message-card__body :deep(:where(ul, ol, pre, table, figure)) {
  text-indent: 0;
}

.pre-message-card__body :deep(:where(
  figure,
  .assistant-fallback-inline-image,
  .assistant-fallback-generated-image,
  .st-chatu8-image-span,
  span.image-tag-placeholder,
  .st-chatu8-image-container,
  .ai-image-container
)) {
  text-indent: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  margin-block: 0.75em;
}

.pre-message-card__body :deep(pre),
.pre-message-card__body :deep(code) {
  white-space: pre-wrap !important;
  overflow-x: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.pre-message-card__body :deep(table) {
  display: table;
  table-layout: fixed;
  width: 100%;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.pre-message-card__body :deep(:where(img, video, canvas, svg, iframe)) {
  display: block;
  margin-inline: auto;
  text-indent: 0;
  max-width: 100%;
  height: auto;
}

.pre-message-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  padding-top: 2px;
}

.pre-message-card__actions.confirming {
  justify-content: flex-start;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--demo-color-danger, #ff5c7a) 34%, transparent);
  background: color-mix(in srgb, var(--demo-color-danger, #ff5c7a) 7%, transparent);
}

.pre-message-card__confirm-text {
  min-width: 0;
  margin-right: auto;
  color: var(--demo-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.pre-message-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 28%, transparent);
  color: var(--demo-text-primary);
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.pre-message-card__action:hover:not(:disabled),
.pre-message-card__action:focus-visible {
  border-color: var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface) 34%);
  color: var(--demo-text-accent);
}

.pre-message-card__action:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary) 72%, white 12%);
  outline-offset: 2px;
}

.pre-message-card__action:disabled {
  cursor: default;
  opacity: 0.46;
}

.pre-message-card__action.primary {
  border-color: color-mix(in srgb, var(--primary) 34%, var(--demo-border-accent-soft));
  color: var(--demo-text-accent);
}

.pre-message-card__action.danger {
  border-color: color-mix(in srgb, var(--demo-color-danger, #ff5c7a) 52%, transparent);
  color: var(--demo-color-danger, #ff5c7a);
}

@media (max-width: 760px) {
  .pre-message-card {
    padding: 11px;
  }

  .pre-message-card__body {
    font-size: 13px;
    line-height: 1.65;
  }

  .pre-message-card__actions {
    justify-content: stretch;
  }

  .pre-message-card__action {
    flex: 1 1 auto;
  }
}
</style>

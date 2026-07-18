<template>
  <StreamRenderer
    v-if="item.isStreaming"
    class="pre-message-card__body pre-apple-message-body"
    :message="item.content"
    :role="item.role"
    :active="true"
    :message-id="item.message_id"
  />
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-else class="pre-message-card__body pre-apple-message-body" v-html="item.finalHtml || item.preview"></div>
</template>

<script setup lang="ts">
import type { TranscriptItem } from '../types';
import StreamRenderer from './StreamRenderer.vue';

defineProps<{
  item: TranscriptItem;
}>();
</script>

<style scoped>
.pre-apple-message-body {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: 17px;
  line-height: 1.8;
}

.pre-apple-message-body :deep(*) {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.pre-apple-message-body :deep(:where(p, .pre-reading-paragraph, blockquote)) {
  margin-block: 0;
  text-indent: 2em;
}

.pre-apple-message-body
  :deep(:where(p, .pre-reading-paragraph, blockquote) + :where(p, .pre-reading-paragraph, blockquote)) {
  margin-block-start: 1em;
}

.pre-apple-message-body :deep(:where(ul, ol, pre, table, figure)) {
  text-indent: 0;
}

.pre-apple-message-body
  :deep(
    :where(
      figure,
      .assistant-fallback-inline-image,
      .assistant-fallback-generated-image,
      .st-chatu8-image-span,
      span.image-tag-placeholder,
      .st-chatu8-image-container,
      .ai-image-container
    )
  ) {
  display: flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  margin-block: 0.75em;
  margin-inline: auto;
  text-indent: 0;
}

.pre-apple-message-body :deep(pre),
.pre-apple-message-body :deep(code) {
  white-space: pre-wrap !important;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.pre-apple-message-body :deep(table) {
  display: table;
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.pre-apple-message-body :deep(:where(img, video, canvas, svg, iframe)) {
  display: block;
  max-width: 100%;
  height: auto;
  margin-inline: auto;
  text-indent: 0;
}

@media (max-width: 760px) {
  .pre-apple-message-body {
    font-size: 16px;
    line-height: 1.78;
  }
}
</style>

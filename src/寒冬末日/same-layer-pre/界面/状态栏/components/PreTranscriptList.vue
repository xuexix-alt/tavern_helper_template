<template>
  <section ref="listRef" class="pre-transcript-list">
    <div v-if="items.length === 0" class="pre-transcript-list__empty">等待聊天记录</div>
    <template v-else>
      <PreTranscriptMessageCard
        v-for="item in items"
        :key="`${item.message_id}-${item.phase}`"
        :item="item"
        :busy="busy"
        :show-rollback-confirm="rollbackConfirmMessageId === item.message_id"
        @request-rollback="emit('request-rollback', $event)"
        @confirm-rollback="emit('confirm-rollback', $event)"
        @cancel-rollback="emit('cancel-rollback')"
        @regenerate-message="emit('regenerate-message', $event)"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { nextTick, ref, watch } from 'vue';
import PreTranscriptMessageCard from './PreTranscriptMessageCard.vue';
import type { TranscriptItem } from '../types';
import { installPreHostImageGestureForwarder } from '../preHostImageGestureForwarder';

const props = defineProps<{
  items: TranscriptItem[];
  busy?: boolean;
  rollbackConfirmMessageId?: number | null;
}>();

const emit = defineEmits<{
  (event: 'request-rollback', item: TranscriptItem): void;
  (event: 'confirm-rollback', item: TranscriptItem): void;
  (event: 'cancel-rollback'): void;
  (event: 'regenerate-message', item: TranscriptItem): void;
}>();

const listRef = ref<HTMLElement | null>(null);
const hostImageGestureForwarder = installPreHostImageGestureForwarder();

async function scrollToBottom() {
  await nextTick();
  const element = listRef.value;
  if (!element) return;
  element.scrollTop = element.scrollHeight;
}

watch(
  () => props.items.at(-1)?.message_id,
  () => void scrollToBottom(),
);

useEventListener(window, 'resize', () => void scrollToBottom());
useEventListener(window, 'dblclick', hostImageGestureForwarder.handleDoubleClick, { capture: true });
useEventListener(window, 'touchend', hostImageGestureForwarder.handleTouchEnd, { capture: true, passive: false });
</script>

<style scoped>
.pre-transcript-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
  min-height: 320px;
  max-height: min(68vh, 860px);
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px;
  scrollbar-width: thin;
}

.pre-transcript-list__empty {
  display: grid;
  min-height: 240px;
  place-items: center;
  border: 1px dashed var(--demo-border-accent-soft);
  color: var(--demo-text-tertiary);
  font-size: 13px;
}

@media (max-width: 760px) {
  .pre-transcript-list {
    min-height: 260px;
    max-height: 58vh;
    gap: 10px;
    padding: 8px;
  }
}
</style>

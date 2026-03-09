<template>
  <section class="transcript-card">
    <div ref="scrollerRef" class="transcript-scroller" @scroll="handleScroll">
      <div v-if="items.length === 0" class="transcript-empty">暂无消息。发送后将在这里模拟酒馆楼层阅读。</div>

      <component
        :is="item.isOpening ? TranscriptOpeningCard : TranscriptMessageCard"
        v-for="item in items"
        :key="item.message_id"
        :item="item"
        :density="density"
        :busy="busy"
        :expanded="openingExpanded"
        :is-editing-user="editingUserMessageId === item.message_id"
        :edit-draft="editingUserDraft"
        :show-edit-regenerate="item.role === 'user' && item.message_id === latestUserMessageId"
        :show-rollback-confirm="rollbackConfirmMessageId === item.message_id"
        :show-swipe-controls="item.role === 'assistant' && item.message_id === swipeMessageId"
        :swipe-label="item.role === 'assistant' && item.message_id === swipeMessageId ? swipeLabel : ''"
        :can-swipe-prev="item.role === 'assistant' && item.message_id === swipeMessageId && canSwipePrev"
        :can-swipe-next="item.role === 'assistant' && item.message_id === swipeMessageId && canSwipeNext"
        @open-detail="openDetail"
        @start-edit="emit('start-edit-user', item)"
        @update-edit-draft="emit('update-edit-draft', $event)"
        @confirm-edit="emit('confirm-edit-user', item)"
        @cancel-edit="emit('cancel-edit-user')"
        @request-rollback="emit('request-rollback', item)"
        @confirm-rollback="emit('confirm-rollback', item)"
        @cancel-rollback="emit('cancel-rollback')"
        @swipe="emit('swipe-assistant', $event)"
        @toggle-opening="emit('toggle-opening')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ReadingMode, TranscriptDensity, TranscriptItem } from '../types';
import TranscriptMessageCard from './TranscriptMessageCard.vue';
import TranscriptOpeningCard from './TranscriptOpeningCard.vue';

const props = defineProps<{
  items: TranscriptItem[];
  density: TranscriptDensity;
  busy: boolean;
  shouldFollowLatest?: boolean;
  openingExpanded?: boolean;
  latestUserMessageId?: number | null;
  editingUserMessageId?: number | null;
  editingUserDraft?: string;
  rollbackConfirmMessageId?: number | null;
  swipeMessageId?: number | null;
  swipeLabel?: string;
  canSwipePrev?: boolean;
  canSwipeNext?: boolean;
}>();

const emit = defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'reading-mode-change', value: ReadingMode): void;
  (event: 'toggle-opening'): void;
  (event: 'start-edit-user', item: TranscriptItem): void;
  (event: 'update-edit-draft', value: string): void;
  (event: 'confirm-edit-user', item: TranscriptItem): void;
  (event: 'cancel-edit-user'): void;
  (event: 'request-rollback', item: TranscriptItem): void;
  (event: 'confirm-rollback', item: TranscriptItem): void;
  (event: 'cancel-rollback'): void;
  (event: 'swipe-assistant', direction: 'prev' | 'next'): void;
}>();

const scrollerRef = ref<HTMLElement | null>(null);

function isNearBottom(element: HTMLElement): boolean {
  const remain = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remain <= 48;
}

function handleScroll() {
  const el = scrollerRef.value;
  if (!el) return;
  emit('reading-mode-change', isNearBottom(el) ? 'following_latest' : 'browsing_history');
}

function openDetail(item: TranscriptItem) {
  emit('open-detail', item);
}

function scrollToLatest() {
  const el = scrollerRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  emit('reading-mode-change', 'following_latest');
}

watch(
  () => props.items.map(item => `${item.message_id}:${item.phase}:${item.preview}:${item.content.length}`).join('|'),
  async () => {
    await nextTick();
    const el = scrollerRef.value;
    if (!el) return;
    if (props.shouldFollowLatest || isNearBottom(el)) {
      el.scrollTop = el.scrollHeight;
      emit('reading-mode-change', 'following_latest');
    }
  },
);

defineExpose({ scrollToLatest });
</script>

<style scoped>
.transcript-card {
  min-height: 320px;
  border-radius: 12px;
  background: var(--demo-surface-card);
  border: 1px solid var(--demo-border-accent);
  overflow: hidden;
}

.transcript-scroller {
  max-height: min(64vh, 760px);
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.transcript-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--demo-text-muted);
}

@media (max-width: 520px) {
  .transcript-scroller {
    max-height: min(58vh, 620px);
  }
}
</style>

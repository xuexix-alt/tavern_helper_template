<template>
  <section class="transcript-card">
    <div ref="listRef" class="transcript-scroller" @scroll="handleScroll">
      <div v-if="items.length === 0" class="transcript-empty">暂无消息。发送后将在这里重建真实楼层阅读视图。</div>

      <div v-for="item in items" :key="item.message_id" class="transcript-entry" :data-message-id="item.message_id">
        <component
          :is="item.isOpening ? TranscriptOpeningCard : TranscriptMessageCard"
          :item="item"
          :density="density"
          :busy="busy"
          :expanded="openingExpanded"
          :is-editing-user="editingUserMessageId === item.message_id"
          :edit-draft="editingUserDraft"
          :show-edit-regenerate="item.role === 'user' && item.message_id === latestUserMessageId"
          :show-rollback-confirm="rollbackConfirmMessageId === item.message_id"
          :show-swipe-controls="false"
          :swipe-label="''"
          :can-swipe-prev="false"
          :can-swipe-next="false"
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

const listRef = ref<HTMLElement | null>(null);

function isNearBottom(element: HTMLElement): boolean {
  const remain = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remain <= 48;
}

function handleScroll() {
  const el = listRef.value;
  if (!el) return;
  emit('reading-mode-change', isNearBottom(el) ? 'following_latest' : 'browsing_history');
}

function openDetail(item: TranscriptItem) {
  emit('open-detail', item);
}

function scrollToLatest() {
  const el = listRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  emit('reading-mode-change', 'following_latest');
}

function scrollToBottom() {
  const el = listRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  emit('reading-mode-change', 'following_latest');
}

function currentVisibleEntryTop(offset = 118) {
  const el = listRef.value;
  if (!el) return 0;

  const entries = Array.from(el.querySelectorAll<HTMLElement>('.transcript-entry'));
  const currentEntry =
    entries.find(entry => {
      const rect = entry.getBoundingClientRect();
      return rect.bottom > offset;
    }) ?? entries[0];

  if (!currentEntry) return 0;
  const rect = currentEntry.getBoundingClientRect();
  return window.scrollY + rect.top;
}

function scrollToCurrentEntryTop(offset = 24) {
  const el = listRef.value;
  if (!el) return;

  const entries = Array.from(el.querySelectorAll<HTMLElement>('.transcript-entry'));
  const currentEntry =
    entries.find(entry => {
      const rect = entry.getBoundingClientRect();
      const scrollerRect = el.getBoundingClientRect();
      return rect.bottom > scrollerRect.top + offset;
    }) ?? entries[0];

  if (!currentEntry) return;

  el.scrollTo({
    top: Math.max(0, currentEntry.offsetTop - 8),
    behavior: 'smooth',
  });
}

watch(
  () => props.items.map(item => `${item.message_id}:${item.phase}:${item.preview}:${item.content.length}`).join('|'),
  async () => {
    await nextTick();
    const el = listRef.value;
    if (!el) return;
    if (props.shouldFollowLatest || isNearBottom(el)) {
      el.scrollTop = el.scrollHeight;
      emit('reading-mode-change', 'following_latest');
    }
  },
);

defineExpose({ scrollToLatest, scrollToBottom, currentVisibleEntryTop, scrollToCurrentEntryTop });
</script>

<style scoped>
.transcript-card {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
}
.transcript-scroller {
  max-height: 680px;
  overflow: auto;
  padding: 2px 0 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.transcript-entry {
  display: flex;
  flex-direction: column;
}
.transcript-empty {
  padding: 42px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--demo-text-muted);
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface) 18%, transparent);
}
@media (max-width: 760px) {
  .transcript-card {
    max-width: 100%;
  }
  .transcript-scroller {
    max-height: 560px;
  }
}
</style>

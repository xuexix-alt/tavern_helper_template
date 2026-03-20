<template>
  <section class="transcript-card">
    <div ref="listRef" class="transcript-scroller" @scroll="handleScroll">
      <div v-if="items.length === 0" class="transcript-empty">暂无消息。发送后将在这里重建真实楼层阅读视图。</div>

      <div
        v-for="item in items"
        :key="buildTranscriptEntryKey(item.message_id, renderRevision)"
        class="transcript-entry"
        :data-message-id="item.message_id"
      >
        <component
          :is="item.isOpening ? TranscriptOpeningCard : TranscriptMessageCard"
          :item="item"
          :density="density"
          :font-mode="fontMode"
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
          @image-intent="emit('image-intent', item)"
          @image-view="emit('image-view', $event)"
          @image-regenerate="emit('image-regenerate', $event)"
          @start-edit="emit('start-edit-user', item)"
          @update-edit-draft="emit('update-edit-draft', $event)"
          @confirm-edit="emit('confirm-edit-user', item)"
          @cancel-edit="emit('cancel-edit-user')"
          @request-rollback="emit('request-rollback', item)"
          @confirm-rollback="emit('confirm-rollback', item)"
          @cancel-rollback="emit('cancel-rollback')"
          @swipe="emit('swipe-assistant', $event)"
          @toggle-opening="emit('toggle-opening')"
          @reroll-opening="emit('reroll-opening')"
        />
      </div>
    </div>

    <div class="transcript-fab-stack" aria-label="阅读滚动控制">
      <button
        type="button"
        class="transcript-fab transcript-fab-top"
        :disabled="atTop"
        title="回到顶部"
        aria-label="回到顶部"
        @click="scrollToTop()"
      >
        ↑
      </button>
      <button
        type="button"
        class="transcript-fab transcript-fab-bottom"
        :disabled="atBottom"
        title="回到底部"
        aria-label="回到底部"
        @click="scrollToBottom()"
      >
        ↓
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useThrottleFn } from '@vueuse/core';
import type { GeneratedImageActivationPayload } from '../generatedImageActivation';
import type { ReaderFontMode, ReadingMode, TranscriptDensity, TranscriptItem } from '../types';
import { buildTranscriptEntryKey } from '../transcriptDomRefresh.ts';
import TranscriptMessageCard from './TranscriptMessageCard.vue';
import TranscriptOpeningCard from './TranscriptOpeningCard.vue';

const props = defineProps<{
  items: TranscriptItem[];
  density: TranscriptDensity;
  fontMode: ReaderFontMode;
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
  renderRevision?: number;
}>();

const emit = defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'image-intent', item: TranscriptItem): void;
  (event: 'image-view', payload: GeneratedImageActivationPayload): void;
  (event: 'image-regenerate', payload: GeneratedImageActivationPayload): void;
  (event: 'reading-mode-change', value: ReadingMode): void;
  (event: 'scroll-state-change', value: { atTop: boolean; atBottom: boolean }): void;
  (event: 'toggle-opening'): void;
  (event: 'reroll-opening'): void;
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
const atTop = ref(true);
const atBottom = ref(true);

function isNearBottom(element: HTMLElement): boolean {
  const remain = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remain <= 48;
}

function isNearTop(element: HTMLElement): boolean {
  return element.scrollTop <= 32;
}

function emitScrollState(element: HTMLElement) {
  atTop.value = isNearTop(element);
  atBottom.value = isNearBottom(element);
  emit('scroll-state-change', {
    atTop: atTop.value,
    atBottom: atBottom.value,
  });
}

const handleScroll = useThrottleFn(() => {
  const el = listRef.value;
  if (!el) return;
  emitScrollState(el);
  emit('reading-mode-change', isNearBottom(el) ? 'following_latest' : 'browsing_history');
}, 80);

function openDetail(item: TranscriptItem) {
  emit('open-detail', item);
}

function scrollToLatest(behavior: ScrollBehavior = 'smooth') {
  const el = listRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior });
  emitScrollState(el);
  emit('reading-mode-change', 'following_latest');
}

function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  const el = listRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior });
  emitScrollState(el);
  emit('reading-mode-change', 'following_latest');
}

function scrollToTop(behavior: ScrollBehavior = 'smooth') {
  const el = listRef.value;
  if (!el) return;
  el.scrollTo({ top: 0, behavior });
  emitScrollState(el);
  emit('reading-mode-change', 'browsing_history');
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

function scrollToMessage(messageId: number, behavior: ScrollBehavior = 'smooth') {
  const el = listRef.value;
  if (!el) return false;
  const entry = el.querySelector<HTMLElement>(`.transcript-entry[data-message-id='${Math.trunc(messageId)}']`);
  if (!entry) return false;

  el.scrollTo({
    top: Math.max(0, entry.offsetTop - 12),
    behavior,
  });
  emitScrollState(el);
  return true;
}

const itemsSignature = computed(() =>
  props.items.map(item => ({
    id: item.message_id,
    phase: item.phase,
    len: item.content.length,
  }))
);

watch(itemsSignature, async () => {
  await nextTick();
  const el = listRef.value;
  if (!el) return;
  if (props.shouldFollowLatest || isNearBottom(el)) {
    el.scrollTop = el.scrollHeight;
    emit('reading-mode-change', 'following_latest');
  }
  emitScrollState(el);
});

onMounted(async () => {
  await nextTick();
  const el = listRef.value;
  if (!el) return;
  emitScrollState(el);
});

defineExpose({
  scrollToLatest,
  scrollToBottom,
  scrollToTop,
  currentVisibleEntryTop,
  scrollToCurrentEntryTop,
  scrollToMessage,
});
</script>

<style scoped>
.transcript-card {
  position: relative;
  width: 100%;
  max-width: none;
  margin: 0 auto;
  --transcript-content-max: var(--reader-content-max, 72rem);
  --transcript-fab-size: 34px;
  --transcript-fab-gap: 8px;
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
}
.transcript-scroller {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  padding: 2px 0 12px;
  scrollbar-gutter: stable;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.transcript-entry {
  display: flex;
  flex-direction: column;
}
.transcript-empty {
  max-width: 100%;
  padding: 42px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--demo-text-muted);
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface) 18%, transparent);
}

.transcript-fab-stack {
  position: absolute;
  top: 12px;
  right: max(8px, calc((100% - var(--transcript-content-max)) / 2 + 10px));
  bottom: 12px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
}

.transcript-fab {
  width: var(--transcript-fab-size);
  height: var(--transcript-fab-size);
  border: 1px solid color-mix(in srgb, var(--primary) 24%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--background) 84%, transparent);
  color: var(--demo-text-accent);
  box-shadow:
    0 8px 20px color-mix(in srgb, var(--shadow-color) 44%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--primary) 8%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--demo-font-mono);
  font-size: 15px;
  line-height: 1;
  pointer-events: auto;
  transition:
    transform 0.18s ease,
    opacity 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease;
}

.transcript-fab:not(:disabled):hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--primary) 10%, var(--background) 90%);
  border-color: color-mix(in srgb, var(--primary) 42%, transparent);
}

.transcript-fab:disabled {
  opacity: 0.3;
}

@media (max-width: 760px) {
  .transcript-card {
    max-width: 100%;
    --transcript-fab-size: 30px;
  }
  .transcript-scroller {
    padding-right: 42px;
  }

  .transcript-fab-stack {
    top: 10px;
    right: 6px;
    bottom: 10px;
  }

  .transcript-fab {
    font-size: 13px;
  }
}
</style>

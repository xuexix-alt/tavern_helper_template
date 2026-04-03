<template>
  <section class="transcript-card">
    <div
      ref="listRef"
      class="transcript-scroller"
      @scroll="handleScroll"
      @wheel.passive="handleWheel"
      @touchstart.passive="handleTouchStart"
      @touchmove.passive="handleTouchMove"
      @touchend.passive="resetTouchGestureState"
      @touchcancel.passive="resetTouchGestureState"
    >
      <div v-if="hasMoreAbove" class="transcript-load-more" @click="loadMoreAbove">↑ 加载更多</div>
      <div v-if="items.length === 0" class="transcript-empty">暂无消息。发送后将在这里重建真实楼层阅读视图。</div>

      <div
        v-for="item in visibleItems"
        :key="buildTranscriptEntryKey(item.message_id, renderRevision)"
        class="transcript-entry"
        :data-message-id="item.message_id"
        style="position: relative"
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
          @open-detail="openDetail"
          @image-intent="emit('image-intent', item)"
          @image-view="emit('image-view', $event)"
          @image-regenerate="emit('image-regenerate', $event)"
          @generate-image="emit('generate-image', $event)"
          @start-edit="emit('start-edit-user', item)"
          @update-edit-draft="emit('update-edit-draft', $event)"
          @confirm-edit="emit('confirm-edit-user', item)"
          @cancel-edit="emit('cancel-edit-user')"
          @request-rollback="emit('request-rollback', item)"
          @confirm-rollback="emit('confirm-rollback', item)"
          @cancel-rollback="emit('cancel-rollback')"
          @toggle-opening="emit('toggle-opening')"
          @reroll-opening="emit('reroll-opening')"
        />

        <!-- 🎨/📷 楼层图片按钮，只在 assistant 楼层显示 -->
        <template v-if="item.role === 'assistant' && !item.isOpening">
          <button
            type="button"
            class="transcript-image-fab"
            :title="
              messageImageCount(item.message_id) > 0 ? `查看 ${messageImageCount(item.message_id)} 张图片` : '生成图片'
            "
            @click="handleImageButtonClick(item.message_id)"
          >
            <span>{{ messageImageCount(item.message_id) > 0 ? '📷' : '🎨' }}</span>
            <span v-if="messageImageCount(item.message_id) > 0" class="transcript-image-fab-badge">
              {{ messageImageCount(item.message_id) }}
            </span>
          </button>
        </template>
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
import { buildTranscriptEntryKey } from '../transcriptDomRefresh';
import {
  resolveTailPageStart,
  resolveTranscriptStartIndexOnItemsChange,
  shouldRevealOlderPageOnUpwardIntent,
} from '../transcriptPagination';
import type { ReaderFontMode, ReaderGalleryEntry, ReadingMode, TranscriptDensity, TranscriptItem } from '../types';
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
  renderRevision?: number;
  galleryEntries?: ReaderGalleryEntry[];
}>();

const emit = defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'image-intent', item: TranscriptItem): void;
  (event: 'image-view', payload: GeneratedImageActivationPayload): void;
  (event: 'image-regenerate', payload: GeneratedImageActivationPayload): void;
  (event: 'generate-image', messageId: number): void;
  (event: 'open-gallery', messageId: number): void;
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
}>();

const listRef = ref<HTMLElement | null>(null);
const atTop = ref(true);
const atBottom = ref(true);
const PAGE_SIZE = 6;
const startIndex = ref(0);
let touchStartY: number | null = null;
let revealedDuringTouchGesture = false;
let loadingMoreAbove = false;

const visibleItems = computed(() => props.items.slice(startIndex.value));
const hasMoreAbove = computed(() => startIndex.value > 0);

async function loadMoreAbove() {
  if (loadingMoreAbove) return;
  loadingMoreAbove = true;
  const el = listRef.value;
  const prevScrollHeight = el ? el.scrollHeight : 0;
  try {
    startIndex.value = Math.max(0, startIndex.value - PAGE_SIZE);
    await nextTick();
    if (el) {
      el.scrollTop += el.scrollHeight - prevScrollHeight;
    }
  } finally {
    loadingMoreAbove = false;
  }
}

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

function handleWheel(event: WheelEvent) {
  const el = listRef.value;
  if (!el) return;
  if (
    shouldRevealOlderPageOnUpwardIntent({
      hasMoreAbove: hasMoreAbove.value,
      scrollTop: el.scrollTop,
      deltaY: event.deltaY,
    })
  ) {
    void loadMoreAbove();
  }
}

function handleTouchStart(event: TouchEvent) {
  touchStartY = event.touches[0]?.clientY ?? null;
  revealedDuringTouchGesture = false;
}

function handleTouchMove(event: TouchEvent) {
  if (revealedDuringTouchGesture) return;
  const el = listRef.value;
  const currentY = event.touches[0]?.clientY ?? null;
  if (!el || touchStartY == null || currentY == null) return;
  if (
    shouldRevealOlderPageOnUpwardIntent({
      hasMoreAbove: hasMoreAbove.value,
      scrollTop: el.scrollTop,
      deltaY: currentY - touchStartY,
    })
  ) {
    revealedDuringTouchGesture = true;
    void loadMoreAbove();
  }
}

function resetTouchGestureState() {
  touchStartY = null;
  revealedDuringTouchGesture = false;
}

function openDetail(item: TranscriptItem) {
  emit('open-detail', item);
}

function handleImageButtonClick(messageId: number) {
  const count = messageImageCount(messageId);
  if (count > 0) {
    emit('open-gallery', messageId);
  } else {
    emit('generate-image', messageId);
  }
}

function messageImageCount(messageId: number): number {
  return (props.galleryEntries ?? []).filter(e => e.messageId === messageId).length;
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

async function scrollToMessage(messageId: number, behavior: ScrollBehavior = 'smooth') {
  const el = listRef.value;
  if (!el) return false;
  // 确保目标楼在可见范围内
  const targetIndex = props.items.findIndex(item => item.message_id === Math.trunc(messageId));
  if (targetIndex >= 0 && targetIndex < startIndex.value) {
    startIndex.value = targetIndex;
    await nextTick();
  }
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
  })),
);

watch(itemsSignature, async () => {
  const el = listRef.value;
  const nextStartIndex = resolveTranscriptStartIndexOnItemsChange({
    currentStartIndex: startIndex.value,
    totalItems: props.items.length,
    pageSize: PAGE_SIZE,
    shouldFollowLatest: props.shouldFollowLatest === true,
    isNearBottom: el ? isNearBottom(el) : false,
  });
  const shouldAnchorBottom = props.shouldFollowLatest === true || (el ? isNearBottom(el) : false);
  startIndex.value = nextStartIndex;
  await nextTick();
  if (el && shouldAnchorBottom) {
    el.scrollTop = el.scrollHeight;
    emit('reading-mode-change', 'following_latest');
  }
  if (el) {
    emitScrollState(el);
  }
});

onMounted(async () => {
  startIndex.value = resolveTailPageStart(props.items.length, PAGE_SIZE);
  await nextTick();
  const el = listRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
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

.transcript-load-more {
  text-align: center;
  padding: 10px 0;
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--demo-text-accent);
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.transcript-load-more:hover {
  opacity: 1;
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

.transcript-image-fab {
  position: absolute;
  bottom: 8px;
  right: calc(var(--transcript-fab-size) + 16px);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.transcript-image-fab:hover {
  background: rgba(0, 0, 0, 0.7);
}
.transcript-image-fab-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  font-size: 9px;
  background: #e74c3c;
  color: white;
  border-radius: 999px;
  padding: 0 3px;
  min-width: 14px;
  line-height: 14px;
  text-align: center;
}
</style>

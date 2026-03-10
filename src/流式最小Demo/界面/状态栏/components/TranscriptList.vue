<template>
  <section class="transcript-card hud-panel clip-corner">
    <header class="transcript-headbar">
      <div>
        <span class="demo-kicker">LIVE TRANSCRIPT</span>
        <strong>当前阅读层</strong>
      </div>
      <span class="transcript-headbar-tip">assistant hidden 楼层在此重建</span>
    </header>

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
  border-radius: 16px;
  overflow: hidden;
}

.transcript-headbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 0;
}

.transcript-headbar strong {
  display: block;
  margin-top: 6px;
  font-size: 15px;
}

.transcript-headbar-tip {
  padding: 7px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 34%, transparent);
  border: 1px solid var(--demo-border-accent-soft);
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--demo-text-tertiary);
}

.transcript-scroller {
  max-height: 760px;
  overflow: auto;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transcript-empty {
  padding: 42px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--demo-text-muted);
}

@media (max-width: 520px) {
  .transcript-headbar {
    flex-direction: column;
    padding: 12px 12px 0;
  }

  .transcript-scroller {
    max-height: 620px;
    padding: 10px 12px 12px;
  }
}
</style>

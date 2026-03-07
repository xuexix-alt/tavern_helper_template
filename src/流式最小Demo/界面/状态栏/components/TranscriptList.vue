<template>
  <section class="transcript-card">
    <div ref="scrollerRef" class="transcript-scroller" @scroll="handleScroll">
      <div v-if="items.length === 0" class="transcript-empty">暂无消息。发送后将在这里模拟酒馆楼层阅读。</div>

      <article
        v-for="item in items"
        :key="item.message_id"
        class="transcript-item"
        :class="[
          `is-${item.role}`,
          `is-${density}`,
          { latest: item.isLatest, streaming: item.isStreaming, opening: item.isOpening },
        ]"
      >
        <header class="transcript-head">
          <div v-if="item.isOpening" class="opening-banner">
            <span class="opening-kicker">CHAPTER OPENING</span>
            <strong class="opening-title">章节开场</strong>
            <span class="opening-desc">以下内容直接联动酒馆真实开局楼层，作为 transcript 的起点。</span>
          </div>

          <div class="transcript-title-row">
            <strong>#{{ item.message_id }}</strong>
            <span class="role-pill" :class="`is-${item.role}`">{{ item.isOpening ? '开局' : item.roleLabel }}</span>
            <span v-if="item.hidden" class="meta-pill">hidden</span>
            <span v-if="item.isStreaming" class="meta-pill is-live">流式中</span>
            <span v-if="item.isOpening" class="meta-pill">seed</span>
          </div>
          <div class="transcript-actions">
            <span class="transcript-preview">{{ item.preview || '(空消息)' }}</span>
            <button v-if="item.canOpenDetail" type="button" class="detail-btn" @click.stop="openDetail(item)">
              详情
            </button>
          </div>
        </header>

        <div v-if="density !== 'minimal'" class="transcript-body">
          <div v-if="item.isStreaming" class="html-body is-stream-stage" v-html="item.streamHtml"></div>
          <div v-else class="html-body" v-html="item.finalHtml || '<p>(空回复)</p>'"></div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TranscriptDensity, TranscriptItem } from '../types';

const props = defineProps<{
  items: TranscriptItem[];
  density: TranscriptDensity;
  shouldFollowLatest?: boolean;
}>();

const emit = defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'follow-change', value: boolean): void;
}>();

const scrollerRef = ref<HTMLElement | null>(null);

function isNearBottom(element: HTMLElement): boolean {
  const remain = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remain <= 48;
}

function handleScroll() {
  const el = scrollerRef.value;
  if (!el) return;
  emit('follow-change', isNearBottom(el));
}

function openDetail(item: TranscriptItem) {
  emit('open-detail', item);
}

function scrollToLatest() {
  const el = scrollerRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  emit('follow-change', true);
}

watch(
  () => props.items.map(item => `${item.message_id}:${item.phase}:${item.preview}:${item.content.length}`).join('|'),
  async () => {
    await nextTick();
    const el = scrollerRef.value;
    if (!el) return;
    if (props.shouldFollowLatest || isNearBottom(el)) {
      el.scrollTop = el.scrollHeight;
      emit('follow-change', true);
    }
  },
);

defineExpose({ scrollToLatest });
</script>

<style scoped>
.transcript-card {
  min-height: 320px;
  border-radius: 12px;
  background: rgba(20, 28, 46, 0.9);
  border: 1px solid rgba(126, 160, 255, 0.18);
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
  color: rgba(230, 236, 255, 0.68);
}

.transcript-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(7, 11, 20, 0.9);
}

.transcript-item.is-user {
  border-color: rgba(255, 214, 102, 0.18);
}

.transcript-item.is-assistant.latest {
  border-color: rgba(95, 208, 255, 0.32);
  box-shadow: 0 0 0 1px rgba(95, 208, 255, 0.1) inset;
}

.transcript-item.opening {
  border-color: rgba(255, 214, 102, 0.38);
  background:
    radial-gradient(circle at top left, rgba(255, 214, 102, 0.1), transparent 42%),
    linear-gradient(180deg, rgba(42, 30, 10, 0.5), rgba(7, 11, 20, 0.92));
  box-shadow:
    0 0 0 1px rgba(255, 214, 102, 0.1) inset,
    0 10px 24px rgba(0, 0, 0, 0.18);
}

.transcript-item.streaming {
  border-color: rgba(95, 208, 255, 0.4);
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
  background: rgba(255, 214, 102, 0.08);
  border: 1px solid rgba(255, 214, 102, 0.18);
}

.opening-kicker {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: rgba(255, 228, 173, 0.78);
}

.opening-title {
  font-size: 15px;
  line-height: 1.2;
  color: #ffe6a6;
}

.opening-desc {
  font-size: 12px;
  line-height: 1.45;
  color: rgba(255, 238, 206, 0.78);
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
  background: rgba(95, 208, 255, 0.16);
  color: #9fe9ff;
}

.role-pill.is-user {
  background: rgba(255, 214, 102, 0.16);
  color: #ffe2a0;
}

.role-pill.is-system {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.84);
}

.meta-pill {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(230, 236, 255, 0.68);
}

.meta-pill.is-live {
  background: rgba(95, 208, 255, 0.16);
  color: #9fe9ff;
}

.transcript-preview {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: rgba(230, 236, 255, 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-btn {
  border: 1px solid rgba(126, 160, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  color: #f3f7ff;
}

.transcript-body {
  font-size: 13px;
  line-height: 1.55;
}

.html-body :deep(p) {
  margin: 0 0 0.6em;
}

.html-body :deep(p:last-child) {
  margin-bottom: 0;
}

.transcript-item.opening .html-body {
  padding: 4px 2px 0;
}

.transcript-item.opening .html-body :deep(p),
.transcript-item.opening .html-body :deep(li),
.transcript-item.opening .html-body :deep(blockquote) {
  color: rgba(255, 244, 220, 0.96);
}

.transcript-item.opening .html-body :deep(h1),
.transcript-item.opening .html-body :deep(h2),
.transcript-item.opening .html-body :deep(h3),
.transcript-item.opening .html-body :deep(strong) {
  color: #ffe29a;
}

.html-body.is-stream-stage :deep(.stream-stage-pre) {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  line-height: 1.55;
}

@media (max-width: 520px) {
  .transcript-scroller {
    max-height: min(58vh, 620px);
  }
}
</style>

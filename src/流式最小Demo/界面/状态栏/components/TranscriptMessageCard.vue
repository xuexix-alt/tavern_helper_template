<template>
  <article class="transcript-item" :class="cardClass">
    <header class="transcript-head">
      <div class="transcript-title-row">
        <strong>#{{ item.message_id }}</strong>
        <span class="role-pill" :class="`is-${item.role}`">{{ item.roleLabel }}</span>
        <span v-if="item.hidden" class="meta-pill">hidden</span>
        <span v-if="item.isStreaming" class="meta-pill is-live">流式中</span>
      </div>

      <div class="transcript-actions">
        <span class="transcript-preview">{{ item.preview || '(空消息)' }}</span>
        <button
          v-if="showEditRegenerate && !isEditingUser"
          type="button"
          class="action-btn"
          :disabled="busy"
          @click="$emit('start-edit', item)"
        >
          改词重生
        </button>
        <template v-if="item.canDeleteFrom">
          <template v-if="showRollbackConfirm">
            <span class="rollback-tip">将删除当前楼层及其后续所有楼层</span>
            <button type="button" class="action-btn danger" :disabled="busy" @click="$emit('confirm-rollback', item)">
              确认回退
            </button>
            <button type="button" class="action-btn" :disabled="busy" @click="$emit('cancel-rollback')">取消</button>
          </template>
          <button
            v-else
            type="button"
            class="action-btn danger"
            :disabled="busy"
            @click="$emit('request-rollback', item)"
          >
            回退删除
          </button>
        </template>
        <button v-if="item.canOpenDetail" type="button" class="detail-btn" @click="$emit('open-detail', item)">
          详情
        </button>
      </div>
    </header>

    <div v-if="showBody" class="transcript-body">
      <template v-if="isEditingUser">
        <textarea
          :value="editDraft"
          class="inline-editor"
          rows="5"
          placeholder="直接修改这条最新 user 输入，然后确认重生。"
          @input="onEditInput"
        />
        <div class="inline-editor-actions">
          <button
            type="button"
            class="action-btn confirm"
            :disabled="busy || !trimmedEditDraft"
            @click="$emit('confirm-edit', item)"
          >
            ✓ 确认
          </button>
          <button type="button" class="action-btn" :disabled="busy" @click="$emit('cancel-edit')">取消</button>
        </div>
      </template>
      <div v-else-if="item.isStreaming" class="html-body is-stream-stage" v-html="item.streamHtml"></div>
      <div v-else class="html-body" v-html="item.finalHtml || '<p>(空回复)</p>'"></div>
    </div>

    <footer v-if="showSwipeControls" class="swipe-actions">
      <button type="button" class="swipe-btn" :disabled="busy || !canSwipePrev" @click="$emit('swipe', 'prev')">
        ←
      </button>
      <span v-if="swipeLabel" class="swipe-label">{{ swipeLabel }}</span>
      <button type="button" class="swipe-btn" :disabled="busy || !canSwipeNext" @click="$emit('swipe', 'next')">
        →
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import type { TranscriptDensity, TranscriptItem } from '../types';

const props = defineProps<{
  item: TranscriptItem;
  density: TranscriptDensity;
  busy?: boolean;
  isEditingUser?: boolean;
  editDraft?: string;
  showEditRegenerate?: boolean;
  showRollbackConfirm?: boolean;
  showSwipeControls?: boolean;
  swipeLabel?: string;
  canSwipePrev?: boolean;
  canSwipeNext?: boolean;
}>();

const emit = defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'start-edit', item: TranscriptItem): void;
  (event: 'update-edit-draft', value: string): void;
  (event: 'confirm-edit', item: TranscriptItem): void;
  (event: 'cancel-edit'): void;
  (event: 'request-rollback', item: TranscriptItem): void;
  (event: 'confirm-rollback', item: TranscriptItem): void;
  (event: 'cancel-rollback'): void;
  (event: 'swipe', direction: 'prev' | 'next'): void;
}>();

const cardClass = computed(() => [
  `is-${props.item.role}`,
  `is-${props.density}`,
  { latest: props.item.isLatest, streaming: props.item.isStreaming },
]);

const showBody = computed(() => {
  if (props.isEditingUser) return true;
  if (props.density === 'comfortable') return true;
  if (props.density === 'compact')
    return props.item.isLatest || props.item.isStreaming || props.item.role === 'assistant';
  return props.item.isStreaming || (props.item.role === 'assistant' && props.item.isLatest);
});

const trimmedEditDraft = computed(() => String(props.editDraft ?? '').trim());

function onEditInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update-edit-draft', target?.value ?? '');
}
</script>

<style scoped>
.transcript-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--demo-border-neutral);
  background: var(--demo-surface-panel);
}

.transcript-item.is-user {
  border-color: var(--demo-border-warning);
}

.transcript-item.is-assistant.latest {
  border-color: var(--demo-border-cyan-focus);
  box-shadow: var(--demo-shadow-accent-inset);
}

.transcript-item.streaming {
  border-color: var(--demo-border-cyan-stronger);
}

.transcript-item.is-compact {
  padding: 8px 9px;
}

.transcript-item.is-minimal {
  padding: 8px;
}

.transcript-item.is-minimal .transcript-preview {
  font-size: 11px;
}

.transcript-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
.action-btn,
.swipe-btn {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
}

.role-pill.is-assistant {
  background: var(--demo-surface-accent);
  color: var(--demo-text-accent);
}

.role-pill.is-user {
  background: var(--demo-surface-user);
  color: var(--demo-text-user);
}

.role-pill.is-system {
  background: var(--demo-surface-neutral-strong);
  color: var(--demo-text-strong);
}

.meta-pill {
  background: var(--demo-surface-neutral-strong);
  color: var(--demo-text-muted);
}

.meta-pill.is-live {
  background: var(--demo-surface-accent);
  color: var(--demo-text-accent);
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
  background: var(--demo-surface-neutral-soft);
  color: var(--demo-text-primary);
}

.action-btn,
.swipe-btn {
  border: 1px solid var(--demo-surface-neutral-stronger);
  background: var(--demo-surface-neutral);
  color: var(--demo-text-primary);
}

.action-btn.confirm {
  border-color: var(--demo-border-success-soft);
  background: var(--demo-surface-success-soft);
  color: var(--demo-text-success);
}

.action-btn.danger {
  border-color: var(--demo-border-danger);
  background: var(--demo-surface-danger-soft);
  color: var(--demo-text-danger);
}

.rollback-tip {
  font-size: 11px;
  color: var(--demo-text-danger-strong);
}

.transcript-body {
  font-size: 13px;
  line-height: 1.55;
}

.inline-editor {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  border-radius: 10px;
  border: 1px solid var(--demo-border-input-warning);
  background: var(--demo-surface-input);
  color: var(--demo-text-primary);
  padding: 10px;
  min-height: 120px;
}

.inline-editor-actions,
.swipe-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.inline-editor-actions {
  margin-top: 8px;
}

.swipe-actions {
  justify-content: flex-end;
}

.swipe-btn {
  min-width: 38px;
  font-size: 14px;
  font-weight: 700;
}

.swipe-label {
  min-width: 42px;
  text-align: center;
  font-size: 12px;
  color: var(--demo-text-muted);
}

.action-btn:disabled,
.swipe-btn:disabled {
  opacity: 0.45;
}

.transcript-item.is-compact .transcript-body {
  max-height: 152px;
  overflow: hidden;
  position: relative;
}

.transcript-item.is-compact .transcript-body::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 44px;
  background: var(--demo-gradient-transcript-fade);
  pointer-events: none;
}

.transcript-item.is-compact.latest .transcript-body::after,
.transcript-item.is-compact.streaming .transcript-body::after {
  display: none;
}

.html-body :deep(p) {
  margin: 0 0 0.6em;
}

.html-body :deep(p:last-child) {
  margin-bottom: 0;
}

.html-body.is-stream-stage :deep(.stream-stage-pre) {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  line-height: 1.55;
}
</style>

<template>
  <article class="transcript-item clip-corner-sm" :class="cardClass">
    <header class="transcript-head">
      <div class="transcript-title-row">
        <span class="channel-pill">{{ channelLabel }}</span>
        <strong>#{{ item.message_id }}</strong>
        <span class="role-pill" :class="`is-${item.role}`">{{ item.roleLabel }}</span>
        <span v-if="item.hidden" class="meta-pill">hidden</span>
        <span v-if="item.isStreaming" class="meta-pill is-live">stream</span>
      </div>

      <div class="transcript-actions">
        <button
          v-if="showEditRegenerate && !isEditingUser"
          type="button"
          class="action-btn clip-corner-sm"
          :disabled="busy"
          @click="$emit('start-edit', item)"
        >
          改词重生
        </button>
        <template v-if="item.canDeleteFrom">
          <template v-if="showRollbackConfirm">
            <span class="rollback-tip">将删除当前楼层及其后续所有楼层</span>
            <button type="button" class="action-btn danger clip-corner-sm" :disabled="busy" @click="$emit('confirm-rollback', item)">
              确认回退
            </button>
            <button type="button" class="action-btn clip-corner-sm" :disabled="busy" @click="$emit('cancel-rollback')">取消</button>
          </template>
          <button
            v-else
            type="button"
            class="action-btn danger clip-corner-sm"
            :disabled="busy"
            @click="$emit('request-rollback', item)"
          >
            回退删除
          </button>
        </template>
        <button v-if="item.canOpenDetail" type="button" class="detail-btn clip-corner-sm" @click="$emit('open-detail', item)">
          详情
        </button>
      </div>
    </header>

    <div class="transcript-preview">{{ item.preview || '(空消息)' }}</div>

    <div v-if="showBody" class="transcript-body-shell clip-corner-sm">
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
            class="action-btn confirm clip-corner-sm"
            :disabled="busy || !trimmedEditDraft"
            @click="$emit('confirm-edit', item)"
          >
            ✓ 确认
          </button>
          <button type="button" class="action-btn clip-corner-sm" :disabled="busy" @click="$emit('cancel-edit')">取消</button>
        </div>
      </template>
      <div v-else-if="item.isStreaming" class="transcript-body html-body is-stream-stage" v-html="item.streamHtml"></div>
      <div v-else class="transcript-body html-body" v-html="item.finalHtml || '<p>(空回复)</p>'"></div>
    </div>

    <footer v-if="showSwipeControls" class="swipe-actions">
      <button type="button" class="swipe-btn clip-corner-sm" :disabled="busy || !canSwipePrev" @click="$emit('swipe', 'prev')">
        ←
      </button>
      <span v-if="swipeLabel" class="swipe-label">{{ swipeLabel }}</span>
      <button type="button" class="swipe-btn clip-corner-sm" :disabled="busy || !canSwipeNext" @click="$emit('swipe', 'next')">
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
  if (props.density === 'compact') {
    return props.item.isLatest || props.item.isStreaming || props.item.role === 'assistant';
  }
  return props.item.isStreaming || (props.item.role === 'assistant' && props.item.isLatest);
});

const trimmedEditDraft = computed(() => String(props.editDraft ?? '').trim());

const channelLabel = computed(() => {
  if (props.item.role === 'assistant') return 'AST';
  if (props.item.role === 'user') return 'USR';
  return 'SYS';
});

function onEditInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update-edit-draft', target?.value ?? '');
}
</script>

<style scoped>
.transcript-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--demo-border-neutral);
  background: var(--demo-assistant-card-bg);
  box-shadow: 0 12px 24px rgba(18, 22, 20, 0.05);
}

.transcript-item.is-user {
  margin-left: auto;
  width: min(100%, 88%);
  border-color: rgba(26, 36, 33, 0.42);
  background: var(--demo-user-card-bg);
  color: var(--demo-user-card-text);
}

.transcript-item.is-assistant.latest {
  border-color: var(--demo-border-cyan-focus);
  box-shadow: var(--demo-shadow-accent-inset);
}

.transcript-item.is-system {
  align-self: center;
  width: min(100%, 72%);
  background: color-mix(in srgb, var(--surface) 74%, transparent);
}

.transcript-item.streaming {
  border-color: var(--demo-border-cyan-stronger);
}

.transcript-item.is-compact {
  padding: 10px;
}

.transcript-item.is-minimal {
  padding: 9px;
}

.transcript-item.is-minimal .transcript-preview {
  font-size: 11px;
}

.transcript-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.transcript-title-row,
.transcript-actions,
.inline-editor-actions,
.swipe-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.transcript-actions {
  justify-content: flex-end;
}

.channel-pill,
.role-pill,
.meta-pill,
.detail-btn,
.action-btn,
.swipe-btn {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  font-size: 11px;
}

.channel-pill {
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 42%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--demo-text-tertiary);
}

.role-pill.is-assistant {
  background: var(--demo-surface-accent);
  color: var(--demo-text-accent);
}

.role-pill.is-user {
  background: color-mix(in srgb, var(--primary-foreground) 12%, transparent);
  color: var(--demo-text-user);
}

.role-pill.is-system {
  background: color-mix(in srgb, var(--surface) 54%, transparent);
  color: var(--demo-text-strong);
}

.meta-pill {
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  color: var(--demo-text-muted);
}

.meta-pill.is-live {
  background: var(--demo-surface-accent);
  color: var(--demo-text-accent);
}

.transcript-preview {
  min-width: 0;
  font-size: 12px;
  color: var(--demo-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-bottom: 2px;
}

.transcript-item.is-user .transcript-preview,
.transcript-item.is-user .channel-pill,
.transcript-item.is-user strong,
.transcript-item.is-user .meta-pill,
.transcript-item.is-user .rollback-tip {
  color: color-mix(in srgb, var(--demo-user-card-text) 86%, transparent);
}

.transcript-item.is-user .channel-pill,
.transcript-item.is-user .meta-pill,
.transcript-item.is-user .detail-btn,
.transcript-item.is-user .action-btn,
.transcript-item.is-user .swipe-btn {
  background: color-mix(in srgb, var(--primary-foreground) 8%, transparent);
  border-color: color-mix(in srgb, var(--primary-foreground) 14%, transparent);
}

.transcript-item.is-user .detail-btn,
.transcript-item.is-user .action-btn,
.transcript-item.is-user .swipe-btn {
  color: var(--demo-text-user);
}

.detail-btn {
  border: 1px solid var(--demo-border-accent);
  background: color-mix(in srgb, var(--surface) 34%, transparent);
  color: var(--demo-text-primary);
}

.action-btn,
.swipe-btn {
  border: 1px solid var(--demo-surface-neutral-stronger);
  background: color-mix(in srgb, var(--surface) 34%, transparent);
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

.transcript-body-shell {
  position: relative;
  border: 1px solid rgba(118, 132, 103, 0.16);
  background: color-mix(in srgb, var(--surface) 42%, transparent);
  padding: 12px;
}

.transcript-item.is-user .transcript-body-shell {
  border-color: color-mix(in srgb, var(--primary-foreground) 12%, transparent);
  background: color-mix(in srgb, var(--primary-foreground) 4%, transparent);
}

.transcript-body {
  font-size: 13px;
  line-height: 1.6;
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

.html-body :deep(ul),
.html-body :deep(ol) {
  margin: 0.4em 0 0.7em;
  padding-left: 1.2em;
}

.html-body :deep(code) {
  font-family: var(--demo-font-mono);
  font-size: 0.92em;
  background: rgba(18, 22, 20, 0.06);
  padding: 0.1em 0.34em;
  border-radius: 5px;
}

.transcript-item.is-user .html-body :deep(code) {
  background: color-mix(in srgb, var(--primary-foreground) 12%, transparent);
}

.html-body :deep(p:last-child) {
  margin-bottom: 0;
}

.html-body.is-stream-stage :deep(.stream-stage-pre) {
  margin: 0;
  white-space: pre-wrap;
}

@media (max-width: 680px) {
  .transcript-item,
  .transcript-item.is-user,
  .transcript-item.is-system {
    width: 100%;
  }

  .transcript-head {
    flex-direction: column;
  }

  .transcript-actions {
    justify-content: flex-start;
  }
}
</style>

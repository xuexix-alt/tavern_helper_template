<template>
  <article class="message-shell" :class="`is-${item.role}`">
    <div v-if="item.role === 'system'" class="system-message clip-corner-sm">
      <span class="system-icon">⚠</span>
      <span class="system-text">[ SYS_ALERT ] {{ item.preview || item.content || '(系统消息)' }}</span>
    </div>

    <template v-else-if="item.role === 'user'">
      <div class="user-wrap">
        <div class="user-message">{{ item.content || item.preview || '(空消息)' }}</div>
      </div>

      <div v-if="showEditRegenerate || item.canDeleteFrom || item.canOpenDetail" class="message-actions user-actions">
        <button
          v-if="showEditRegenerate && !isEditingUser"
          type="button"
          class="action-btn clip-corner-sm"
          :disabled="busy"
          @click="emit('start-edit', item)"
        >
          改词重生
        </button>
        <button
          v-if="item.canDeleteFrom && !showRollbackConfirm"
          type="button"
          class="action-btn danger clip-corner-sm"
          :disabled="busy"
          @click="emit('request-rollback', item)"
        >
          回退删除
        </button>
        <template v-if="item.canDeleteFrom && showRollbackConfirm">
          <span class="rollback-tip">将删除当前楼层及其后续所有楼层</span>
          <button
            type="button"
            class="action-btn danger clip-corner-sm"
            :disabled="busy"
            @click="emit('confirm-rollback', item)"
          >
            确认回退
          </button>
          <button type="button" class="action-btn clip-corner-sm" :disabled="busy" @click="emit('cancel-rollback')">
            取消
          </button>
        </template>
        <button
          v-if="item.canOpenDetail"
          type="button"
          class="action-btn clip-corner-sm"
          @click="emit('open-detail', item)"
        >
          详情
        </button>
      </div>

      <div v-if="isEditingUser" class="editor-wrap">
        <textarea
          :value="editDraft"
          class="inline-editor"
          rows="4"
          placeholder="直接修改这条最新 user 输入，然后确认重生。"
          @input="onEditInput"
        />
        <div class="editor-actions">
          <button
            type="button"
            class="action-btn clip-corner-sm"
            :disabled="busy || !trimmedEditDraft"
            @click="emit('confirm-edit', item)"
          >
            确认重生</button
          ><button type="button" class="action-btn clip-corner-sm" :disabled="busy" @click="emit('cancel-edit')">
            取消
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <section class="assistant-card hud-panel clip-corner">
        <div class="assistant-corners tl"></div>
        <div class="assistant-corners tr"></div>
        <div class="assistant-corners bl"></div>
        <div class="assistant-corners br"></div>

        <div class="assistant-headline">
          ◎ DATA_MODULE_SECURE <span>ID: MSG-{{ item.message_id }}</span>
        </div>

        <div class="assistant-body-wrap">
          <div v-if="item.isStreaming" class="assistant-body html-body is-stream-stage" v-html="item.streamHtml"></div>
          <div v-else class="assistant-body html-body" v-html="item.finalHtml || '<p>(空回复)</p>'"></div>
        </div>

        <div class="assistant-footer">
          <div class="assistant-footer-left">
            <button
              v-if="item.canOpenDetail"
              type="button"
              class="detail-toggle clip-corner-sm"
              @click="emit('open-detail', item)"
            >
              SHOW_DIAGNOSTICS
            </button>
            <button type="button" class="meta-toggle clip-corner-sm" @click="metaOpen = !metaOpen">
              {{ metaOpen ? 'HIDE_META' : 'SHOW_META' }}
            </button>
          </div>
          <div class="assistant-meta-row">
            <span class="meta-chip">{{ item.roleLabel }}</span>
            <span v-if="item.hidden" class="meta-chip">hidden</span>
            <span v-if="item.isStreaming" class="meta-chip">stream</span>
            <span class="meta-chip">{{ item.phase }}</span>
            <span v-if="item.options.length > 0" class="meta-chip">options {{ item.options.length }}</span>
          </div>
        </div>

        <div v-if="metaOpen" class="assistant-meta-panel clip-corner-sm">
          <div class="assistant-meta-grid">
            <div class="meta-block">
              <span>MESSAGE_ID</span><strong>#{{ item.message_id }}</strong>
            </div>
            <div class="meta-block">
              <span>RENDER_SOURCE</span><strong>{{ item.renderSource || 'chat' }}</strong>
            </div>
            <div class="meta-block">
              <span>PHASE</span><strong>{{ item.phase }}</strong>
            </div>
            <div class="meta-block">
              <span>OPTIONS</span><strong>{{ item.options.length }}</strong>
            </div>
          </div>
          <div class="meta-preview-box">
            <span>PREVIEW</span>
            <p>{{ item.preview || '(空)' }}</p>
          </div>
        </div>
      </section>
    </template>
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

const metaOpen = ref(false);
const trimmedEditDraft = computed(() => String(props.editDraft ?? '').trim());
function onEditInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  if (!target) return;
  emit('update-edit-draft', target.value);
}
</script>

<style scoped>
.message-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.system-message {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  align-self: center;
  padding: 14px 20px;
  border: 1px solid color-mix(in srgb, var(--primary) 50%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--demo-text-accent);
  text-transform: uppercase;
}
.system-icon {
  font-size: 14px;
}
.system-text {
  line-height: 1.5;
}
.user-wrap {
  display: flex;
  justify-content: flex-end;
}
.user-message {
  max-width: min(100%, 42rem);
  padding: 12px 18px;
  border-right: 2px solid color-mix(in srgb, var(--primary) 48%, transparent);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 14px;
  line-height: 1.75;
  color: var(--demo-text-primary);
  text-align: right;
}
.assistant-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 60rem;
  padding: 24px 28px 18px;
}
.assistant-corners {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: color-mix(in srgb, var(--primary) 36%, transparent);
  pointer-events: none;
}
.assistant-corners.tl {
  top: -2px;
  left: -2px;
  border-top: 2px solid;
  border-left: 2px solid;
}
.assistant-corners.tr {
  top: -2px;
  right: -2px;
  border-top: 2px solid;
  border-right: 2px solid;
}
.assistant-corners.bl {
  bottom: -2px;
  left: -2px;
  border-bottom: 2px solid;
  border-left: 2px solid;
}
.assistant-corners.br {
  bottom: -2px;
  right: -2px;
  border-bottom: 2px solid;
  border-right: 2px solid;
}
.assistant-headline,
.meta-chip,
.detail-toggle,
.action-btn {
  font-family: var(--demo-font-mono);
}
.assistant-headline {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--demo-text-accent);
  text-transform: uppercase;
}
.assistant-headline span {
  color: var(--demo-text-secondary);
}
.assistant-body-wrap {
  padding-top: 6px;
}
.assistant-body {
  font-size: 15px;
  line-height: 1.9;
  color: var(--demo-text-panel-strong);
}
.assistant-body-wrap :deep(p) {
  margin: 0 0 1em;
}
.assistant-body-wrap :deep(p:last-child) {
  margin-bottom: 0;
}
.assistant-footer,
.assistant-footer-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.assistant-footer {
  justify-content: space-between;
}
.assistant-meta-row,
.message-actions,
.editor-actions,
.assistant-meta-grid {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-chip,
.detail-toggle,
.meta-toggle,
.action-btn {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-secondary);
}
.detail-toggle,
.meta-toggle,
.action-btn {
  color: var(--demo-text-accent);
}
.assistant-meta-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 12%, transparent);
}
.assistant-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.meta-block,
.meta-preview-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.meta-block span,
.meta-preview-box span {
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--demo-text-subtle);
  text-transform: uppercase;
}
.meta-block strong {
  font-family: var(--demo-font-mono);
  font-size: 13px;
  color: var(--demo-text-primary);
}
.meta-preview-box p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--demo-text-secondary);
}
.action-btn.danger {
  color: var(--demo-color-danger);
  border-color: color-mix(in srgb, var(--demo-color-danger) 34%, transparent);
}
.message-actions.user-actions {
  justify-content: flex-end;
}
.rollback-tip {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-warning);
}
.editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}
.inline-editor {
  width: min(100%, 42rem);
  min-height: 110px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  background: color-mix(in srgb, var(--surface) 14%, transparent);
  color: var(--demo-text-primary);
  font-family: var(--demo-font-mono);
  font-size: 13px;
  line-height: 1.7;
}
.editor-actions {
  justify-content: flex-end;
}
@media (max-width: 760px) {
  .assistant-card {
    max-width: 100%;
    padding: 18px 16px;
  }
  .assistant-body {
    font-size: 14px;
  }
  .assistant-footer {
    align-items: flex-start;
  }
  .assistant-meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .user-message,
  .inline-editor {
    max-width: 100%;
  }
}
</style>

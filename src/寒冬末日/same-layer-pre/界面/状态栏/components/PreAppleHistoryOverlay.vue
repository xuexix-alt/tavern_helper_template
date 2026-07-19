<template>
  <Teleport to="body">
    <Transition name="pre-apple-history">
      <div v-if="open" class="pre-apple-history" @click="handleBackdropClick">
        <section
          ref="dialogRef"
          class="pre-apple-history__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pre-apple-history-title"
          tabindex="-1"
          @click.stop
        >
          <header class="pre-apple-history__header">
            <div class="pre-apple-history__heading">
              <span class="pre-apple-history__eyebrow">STORY ARCHIVE</span>
              <h2 id="pre-apple-history-title">故事历史</h2>
            </div>
            <button
              ref="closeButtonRef"
              type="button"
              class="pre-apple-history__close"
              aria-label="关闭故事历史"
              @click="emit('close')"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </header>

          <div class="pre-apple-history__scroller">
            <div v-if="items.length" class="pre-apple-history__list">
              <article
                v-for="item in items"
                :key="item.message_id"
                class="pre-message-card pre-apple-history__message"
                :class="{
                  'is-expanded': expandedMessageId === item.message_id,
                  'is-hidden': item.hidden,
                }"
                :data-message-id="item.message_id"
              >
                <div class="pre-apple-history__row">
                  <button
                    type="button"
                    class="pre-apple-history__summary"
                    :aria-expanded="expandedMessageId === item.message_id"
                    :aria-controls="messageBodyId(item.message_id)"
                    @click="toggleMessage(item.message_id)"
                  >
                    <span class="pre-apple-history__role">{{ item.roleLabel }}</span>
                    <span class="pre-apple-history__id">#{{ item.message_id }}</span>
                    <span v-if="item.hidden" class="pre-apple-history__flag">HIDDEN</span>
                    <span v-if="item.isStreaming" class="pre-apple-history__flag">STREAM</span>
                    <span class="pre-apple-history__preview">{{ plainTextSummary(item) }}</span>
                    <svg class="pre-apple-history__chevron" aria-hidden="true" viewBox="0 0 20 20">
                      <path d="m6.5 8 3.5 3.5L13.5 8" />
                    </svg>
                  </button>

                  <details v-if="item.canReroll || item.canDeleteFrom" class="pre-apple-history__more" @click.stop>
                    <summary class="pre-apple-history__more-trigger" aria-label="更多操作">
                      <svg aria-hidden="true" viewBox="0 0 20 20">
                        <circle cx="4" cy="10" r="1.4" />
                        <circle cx="10" cy="10" r="1.4" />
                        <circle cx="16" cy="10" r="1.4" />
                      </svg>
                    </summary>
                    <div class="pre-apple-history__menu">
                      <button
                        v-if="item.canDeleteFrom"
                        type="button"
                        class="pre-apple-history__menu-action is-danger"
                        :disabled="busy"
                        @click.stop="emit('request-rollback', item)"
                      >
                        回退删除
                      </button>
                      <button
                        v-if="item.canReroll"
                        type="button"
                        class="pre-apple-history__menu-action"
                        :disabled="busy"
                        @click.stop="emit('regenerate-message', item)"
                      >
                        重新生成
                      </button>
                    </div>
                  </details>
                </div>

                <div
                  v-if="expandedMessageId === item.message_id"
                  :id="messageBodyId(item.message_id)"
                  class="pre-apple-history__expanded"
                >
                  <PreAppleMessageBody :item="item" />

                  <div
                    v-if="rollbackConfirmMessageId === item.message_id"
                    class="pre-apple-history__rollback-confirm"
                    role="group"
                    aria-label="确认回退删除"
                    @click.stop
                  >
                    <span>删除当前及后续楼层？</span>
                    <button
                      type="button"
                      class="pre-apple-history__confirm-action is-danger"
                      :disabled="busy"
                      @click.stop="emit('confirm-rollback', item)"
                    >
                      确认回退
                    </button>
                    <button
                      type="button"
                      class="pre-apple-history__confirm-action"
                      :disabled="busy"
                      @click.stop="emit('cancel-rollback')"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </article>
            </div>

            <div v-else class="pre-apple-history__empty" role="status">暂无历史消息</div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import type { TranscriptItem } from '../types';
import PreAppleMessageBody from './PreAppleMessageBody.vue';

const props = defineProps<{
  open: boolean;
  items: TranscriptItem[];
  busy?: boolean;
  rollbackConfirmMessageId?: number | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'request-rollback', item: TranscriptItem): void;
  (event: 'confirm-rollback', item: TranscriptItem): void;
  (event: 'cancel-rollback'): void;
  (event: 'regenerate-message', item: TranscriptItem): void;
}>();

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'details > summary',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const dialogRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const expandedMessageId = ref<number | null>(null);
const rollbackConfirmActive = computed(() => props.rollbackConfirmMessageId != null);
let previousBodyOverflow: string | null = null;

function fallbackExpandedMessageId() {
  const assistants = props.items.filter(item => item.role === 'assistant');
  return assistants.at(-2)?.message_id ?? props.items.at(-1)?.message_id ?? null;
}

function syncExpandedMessage() {
  const currentStillExists = props.items.some(item => item.message_id === expandedMessageId.value);
  if (!currentStillExists) expandedMessageId.value = fallbackExpandedMessageId();
}

function toggleMessage(messageId: number) {
  expandedMessageId.value = messageId;
}

function messageBodyId(messageId: number) {
  return `pre-apple-history-message-${messageId}`;
}

function plainTextSummary(item: TranscriptItem) {
  return (item.raw || item.content || item.preview || '无正文')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lockBodyScroll() {
  if (previousBodyOverflow !== null) return;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function restoreBodyScroll() {
  if (previousBodyOverflow === null) return;
  document.body.style.overflow = previousBodyOverflow;
  previousBodyOverflow = null;
}

function focusableElements() {
  return [...(dialogRef.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(element => {
    return element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0;
  });
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }

  if (event.key !== 'Tab') return;
  const focusable = focusableElements();
  if (!focusable.length) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialogRef.value?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialogRef.value?.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function handleBackdropClick() {
  if (!rollbackConfirmActive.value) emit('close');
}

watch(
  () => props.open,
  async open => {
    if (!open) {
      restoreBodyScroll();
      return;
    }

    syncExpandedMessage();
    lockBodyScroll();
    await nextTick();
    if (props.open) closeButtonRef.value?.focus();
  },
  { immediate: true },
);

watch(
  () => props.items.map(item => item.message_id),
  () => {
    if (props.open) syncExpandedMessage();
  },
);

watch(
  () => props.rollbackConfirmMessageId,
  messageId => {
    if (messageId != null && props.items.some(item => item.message_id === messageId)) {
      expandedMessageId.value = messageId;
    }
  },
  { immediate: true },
);

useEventListener(window, 'keydown', handleKeydown);
onUnmounted(restoreBodyScroll);
</script>

<style scoped>
.pre-apple-history {
  position: fixed;
  z-index: 2147483000;
  inset: 0;
  display: flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, #000 46%, transparent);
  color: var(--apple-label-primary, var(--foreground, #1d1d1f));
  font-family: var(
    --font-sans,
    -apple-system,
    BlinkMacSystemFont,
    'SF Pro Text',
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif
  );
}

.pre-apple-history__dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  box-sizing: border-box;
  width: min(100%, 1040px);
  max-height: 88vh;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--foreground, #1d1d1f) 14%, transparent);
  border-radius: 28px;
  background: var(--apple-glass, var(--glass-bg, rgba(248, 248, 250, 0.78)));
  box-shadow: 0 28px 80px color-mix(in srgb, var(--shadow-color, #000) 38%, transparent);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  transform-origin: center;
}

.pre-apple-history__header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #1d1d1f) 9%, transparent);
}

.pre-apple-history__heading {
  min-width: 0;
}

.pre-apple-history__eyebrow {
  display: block;
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
}

.pre-apple-history__heading h2 {
  margin: 2px 0 0;
  font-size: 20px;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.pre-apple-history__close,
.pre-apple-history__summary,
.pre-apple-history__more-trigger,
.pre-apple-history__menu-action,
.pre-apple-history__confirm-action {
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.pre-apple-history__close {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  padding: 0;
  border-radius: 50%;
  background: var(--apple-control-fill, color-mix(in srgb, var(--foreground, #1d1d1f) 9%, transparent));
}

.pre-apple-history__close svg,
.pre-apple-history__more-trigger svg {
  width: 20px;
  height: 20px;
}

.pre-apple-history__close path,
.pre-apple-history__chevron path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.pre-apple-history__scroller {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 20px 24px 28px;
  scrollbar-width: thin;
}

.pre-apple-history__list {
  display: grid;
  width: min(100%, 760px);
  min-width: 0;
  margin-inline: auto;
  gap: 12px;
}

.pre-message-card {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}

.pre-apple-history__message {
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--foreground, #1d1d1f) 10%, transparent);
  border-radius: 18px;
  background: var(--apple-paper, var(--surface, #f9f9fb));
  box-shadow: 0 1px 2px color-mix(in srgb, var(--shadow-color, #000) 8%, transparent);
}

.pre-apple-history__message.is-hidden {
  opacity: 0.68;
}

.pre-apple-history__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  padding: 6px;
}

.pre-apple-history__summary {
  display: grid;
  grid-template-columns: auto auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 42px;
  flex: 1 1 auto;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-radius: 13px;
  background: transparent;
  text-align: left;
}

.pre-apple-history__role {
  color: var(--primary, #0a84ff);
  font-size: 13px;
  font-weight: 650;
}

.pre-apple-history__id,
.pre-apple-history__flag {
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
}

.pre-apple-history__flag {
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--apple-recessed, color-mix(in srgb, var(--foreground, #1d1d1f) 7%, transparent));
  font-weight: 600;
}

.pre-apple-history__preview {
  min-width: 0;
  overflow: hidden;
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  font-size: 13px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pre-apple-history__chevron {
  width: 18px;
  height: 18px;
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  transition: transform 120ms ease-out;
}

.pre-apple-history__message.is-expanded .pre-apple-history__chevron {
  transform: rotate(180deg);
}

.pre-apple-history__more {
  position: relative;
  flex: 0 0 auto;
}

.pre-apple-history__more-trigger {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 10px;
  background: transparent;
  list-style: none;
}

.pre-apple-history__more-trigger::-webkit-details-marker {
  display: none;
}

.pre-apple-history__more-trigger circle {
  fill: currentColor;
}

.pre-apple-history__menu {
  position: absolute;
  z-index: 2;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  min-width: 148px;
  gap: 4px;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--foreground, #1d1d1f) 12%, transparent);
  border-radius: 14px;
  background: var(--apple-surface-elevated, var(--surface-hover, #fff));
  box-shadow: 0 16px 36px color-mix(in srgb, var(--shadow-color, #000) 24%, transparent);
  transform-origin: right top;
}

.pre-apple-history__menu-action,
.pre-apple-history__confirm-action {
  box-sizing: border-box;
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 9px;
  background: transparent;
  font-size: 13px;
  text-align: left;
}

.pre-apple-history__menu-action.is-danger,
.pre-apple-history__confirm-action.is-danger {
  color: var(--apple-danger, #ff3b30);
}

.pre-apple-history__expanded {
  display: grid;
  gap: 18px;
  padding: 8px 22px 24px;
}

.pre-apple-history__rollback-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: var(--apple-recessed, color-mix(in srgb, var(--apple-danger, #ff3b30) 8%, var(--surface, #fff)));
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  font-size: 13px;
}

.pre-apple-history__rollback-confirm > span {
  margin-right: auto;
}

.pre-apple-history__empty {
  width: min(100%, 760px);
  box-sizing: border-box;
  margin-inline: auto;
  padding: 32px;
  border-radius: 18px;
  background: var(--apple-paper, var(--surface, #f9f9fb));
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  text-align: center;
}

.pre-apple-history button,
.pre-apple-history summary {
  transition:
    transform 100ms ease-out,
    background-color 120ms ease-out,
    filter 120ms ease-out;
}

.pre-apple-history button:hover:not(:disabled),
.pre-apple-history summary:hover {
  background-color: color-mix(in srgb, var(--primary, #0a84ff) 8%, transparent);
}

.pre-apple-history button:active:not(:disabled),
.pre-apple-history summary:active {
  transform: scale(0.98);
  filter: brightness(0.96);
}

.pre-apple-history button:focus-visible,
.pre-apple-history summary:focus-visible,
.pre-apple-history__dialog:focus-visible {
  outline: 3px solid var(--primary, #0a84ff);
  outline-offset: 2px;
}

.pre-apple-history button:disabled {
  cursor: default;
  opacity: 0.48;
}

.pre-apple-history-enter-active,
.pre-apple-history-leave-active {
  transition: opacity 180ms ease;
}

.pre-apple-history-enter-active .pre-apple-history__dialog,
.pre-apple-history-leave-active .pre-apple-history__dialog {
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease,
    backdrop-filter 220ms ease;
}

.pre-apple-history-enter-from,
.pre-apple-history-leave-to {
  opacity: 0;
}

.pre-apple-history-enter-from .pre-apple-history__dialog,
.pre-apple-history-leave-to .pre-apple-history__dialog {
  opacity: 0;
  backdrop-filter: blur(10px) saturate(120%);
  transform: scale(0.97) translateY(12px);
}

@media (max-width: 760px) {
  .pre-apple-history {
    align-items: flex-end;
    padding: 0;
  }

  .pre-apple-history__dialog {
    width: 100%;
    max-height: 96dvh;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 24px 24px 0 0;
    transform-origin: bottom center;
  }

  .pre-apple-history__header {
    padding: 14px 16px;
  }

  .pre-apple-history__close,
  .pre-apple-history__more-trigger {
    width: 44px;
    height: 44px;
  }

  .pre-apple-history__scroller {
    padding: 12px 12px max(20px, env(safe-area-inset-bottom));
  }

  .pre-apple-history__summary {
    grid-template-columns: auto auto auto auto minmax(0, 1fr) auto;
    min-height: 44px;
    padding-inline: 8px;
  }

  .pre-apple-history__expanded {
    padding: 8px 16px 20px;
  }

  .pre-apple-history__menu-action,
  .pre-apple-history__confirm-action {
    min-height: 44px;
  }

  .pre-apple-history__rollback-confirm {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .pre-apple-history__rollback-confirm > span {
    flex-basis: 100%;
  }

  .pre-apple-history-enter-from .pre-apple-history__dialog,
  .pre-apple-history-leave-to .pre-apple-history__dialog {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pre-apple-history-enter-active,
  .pre-apple-history-leave-active,
  .pre-apple-history-enter-active .pre-apple-history__dialog,
  .pre-apple-history-leave-active .pre-apple-history__dialog,
  .pre-apple-history button,
  .pre-apple-history summary,
  .pre-apple-history__chevron {
    transition-duration: 0.01ms !important;
  }

  .pre-apple-history-enter-from .pre-apple-history__dialog,
  .pre-apple-history-leave-to .pre-apple-history__dialog,
  .pre-apple-history button:active:not(:disabled),
  .pre-apple-history summary:active,
  .pre-apple-history__message.is-expanded .pre-apple-history__chevron {
    transform: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .pre-apple-history__dialog {
    background: var(--apple-surface-solid, var(--surface, #f9f9fb));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

@media (prefers-contrast: more) {
  .pre-apple-history {
    background: rgba(0, 0, 0, 0.72);
  }

  .pre-apple-history__dialog,
  .pre-apple-history__message,
  .pre-apple-history__menu {
    border-color: currentColor;
  }

  .pre-apple-history button:focus-visible,
  .pre-apple-history summary:focus-visible,
  .pre-apple-history__dialog:focus-visible {
    outline-width: 4px;
  }
}
</style>

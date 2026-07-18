<template>
  <section ref="readerRef" class="pre-apple-reader" aria-label="当前故事阅读区">
    <div class="pre-apple-reader__column">
      <article
        v-if="relatedUser"
        class="pre-message-card pre-apple-reader__user"
        :class="{ 'is-expanded': userExpanded, 'is-hidden': relatedUser.hidden }"
        :data-message-id="relatedUser.message_id"
      >
        <button
          type="button"
          class="pre-apple-reader__user-toggle"
          :aria-expanded="userExpanded"
          :aria-controls="relatedUserBodyId"
          @click="userExpanded = !userExpanded"
        >
          <span class="pre-apple-reader__meta-role">{{ relatedUser.roleLabel }}</span>
          <span class="pre-apple-reader__user-summary">{{ relatedUserSummary }}</span>
          <span class="pre-apple-reader__user-chevron" aria-hidden="true">⌄</span>
        </button>

        <div v-if="userExpanded" :id="relatedUserBodyId" class="pre-apple-reader__user-body">
          <PreAppleMessageBody :item="relatedUser" />
        </div>
      </article>

      <article
        v-if="latestAssistant"
        class="pre-message-card pre-apple-reader__paper"
        :class="{ 'is-hidden': latestAssistant.hidden }"
        :data-message-id="latestAssistant.message_id"
      >
        <header class="pre-apple-reader__paper-meta">
          <span class="pre-apple-reader__meta-role">{{ latestAssistant.roleLabel }}</span>
          <span>#{{ latestAssistant.message_id }}</span>
          <span v-if="latestAssistant.hidden" class="pre-apple-reader__status">HIDDEN</span>
          <span v-if="latestAssistant.isStreaming" class="pre-apple-reader__status">STREAM</span>
        </header>

        <PreAppleMessageBody :item="latestAssistant" />

        <footer
          v-if="latestAssistant.canDeleteFrom || latestAssistant.canReroll || assistantRollbackConfirming"
          class="pre-apple-reader__actions"
        >
          <div v-if="assistantRollbackConfirming" class="pre-apple-reader__rollback-confirm" role="group">
            <span>删除当前及后续楼层？</span>
            <button
              type="button"
              class="pre-apple-reader__action is-danger"
              :disabled="busy"
              @click="emit('confirm-rollback', latestAssistant)"
            >
              确认回退
            </button>
            <button type="button" class="pre-apple-reader__action" :disabled="busy" @click="emit('cancel-rollback')">
              取消
            </button>
          </div>

          <details v-else class="pre-apple-reader__more">
            <summary class="pre-apple-reader__more-trigger">更多</summary>
            <div class="pre-apple-reader__more-menu">
              <button
                v-if="latestAssistant.canDeleteFrom"
                type="button"
                class="pre-apple-reader__menu-action is-danger"
                :disabled="busy"
                @click="emit('request-rollback', latestAssistant)"
              >
                回退删除
              </button>
              <button
                v-if="latestAssistant.canReroll"
                type="button"
                class="pre-apple-reader__menu-action"
                :disabled="busy"
                @click="emit('regenerate-message', latestAssistant)"
              >
                重新生成
              </button>
            </div>
          </details>
        </footer>
      </article>

      <div v-else-if="relatedUser" class="pre-apple-reader__empty" role="status">等待回复</div>
      <div v-else class="pre-apple-reader__empty" role="status">等待聊天记录</div>

      <div v-if="errorMessage" class="pre-apple-reader__error" role="alert">{{ errorMessage }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { computed, onMounted, ref, watch } from 'vue';
import { installPreHostImageGestureForwarder } from '../preHostImageGestureForwarder';
import type { TranscriptItem } from '../types';
import PreAppleMessageBody from './PreAppleMessageBody.vue';

const props = defineProps<{
  items: TranscriptItem[];
  busy?: boolean;
  rollbackConfirmMessageId?: number | null;
  errorMessage?: string;
}>();

const emit = defineEmits<{
  (event: 'request-rollback', item: TranscriptItem): void;
  (event: 'confirm-rollback', item: TranscriptItem): void;
  (event: 'cancel-rollback'): void;
  (event: 'regenerate-message', item: TranscriptItem): void;
}>();

const readerRef = ref<HTMLElement | null>(null);
const userExpanded = ref(false);

const latestAssistant = computed(() => [...props.items].reverse().find(item => item.role === 'assistant') ?? null);

const relatedUser = computed(() => {
  const assistant = latestAssistant.value;
  const assistantIndex = assistant ? props.items.lastIndexOf(assistant) : props.items.length;

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const item = props.items[index];
    if (item.role === 'user') return item;
  }
  return null;
});

const relatedUserBodyId = computed(() => `pre-apple-user-body-${relatedUser.value?.message_id ?? 'none'}`);
const relatedUserSummary = computed(() => {
  const item = relatedUser.value;
  if (!item) return '';
  return (item.raw || item.content || item.preview)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
});
const assistantRollbackConfirming = computed(
  () => latestAssistant.value?.message_id === props.rollbackConfirmMessageId,
);

watch(
  () => relatedUser.value?.message_id,
  () => {
    userExpanded.value = false;
  },
);

let hostImageGestureForwarder: ReturnType<typeof installPreHostImageGestureForwarder> | null = null;

onMounted(() => {
  hostImageGestureForwarder = installPreHostImageGestureForwarder();
});

useEventListener(window, 'dblclick', event => hostImageGestureForwarder?.handleDoubleClick(event), { capture: true });
useEventListener(window, 'touchend', event => hostImageGestureForwarder?.handleTouchEnd(event), {
  capture: true,
  passive: false,
});

function getScrollTop() {
  return readerRef.value?.scrollTop ?? 0;
}

function setScrollTop(scrollTop: number) {
  if (readerRef.value) readerRef.value.scrollTop = scrollTop;
}

defineExpose({ getScrollTop, setScrollTop });
</script>

<style scoped>
.pre-apple-reader {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 24px 16px 32px;
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
  scrollbar-width: thin;
}

.pre-apple-reader__column {
  display: grid;
  width: min(100%, 760px);
  min-width: 0;
  max-width: 760px;
  margin-inline: auto;
  gap: 16px;
}

.pre-message-card {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}

.pre-apple-reader__user {
  overflow: clip;
  border-radius: 16px;
  background: var(
    --apple-surface-recessed,
    color-mix(in srgb, var(--surface, #f9f9fb) 74%, var(--background, #edeef2))
  );
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--shadow-color, #000) 12%, transparent);
}

.pre-apple-reader__user.is-hidden,
.pre-apple-reader__paper.is-hidden {
  opacity: 0.62;
}

.pre-apple-reader__user-toggle {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: 100%;
  min-height: 44px;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pre-apple-reader__meta-role,
.pre-apple-reader__paper-meta,
.pre-apple-reader__status {
  font-size: 12.5px;
  line-height: 1.4;
  letter-spacing: 0.02em;
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
}

.pre-apple-reader__meta-role {
  font-weight: 650;
}

.pre-apple-reader__user-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pre-apple-reader__user-chevron {
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  font-size: 17px;
  transition: transform 120ms ease-out;
}

.pre-apple-reader__user.is-expanded .pre-apple-reader__user-chevron {
  transform: rotate(180deg);
}

.pre-apple-reader__user-body {
  min-width: 0;
  padding: 8px 16px 16px;
}

.pre-apple-reader__paper {
  display: grid;
  gap: 16px;
  padding: 24px;
  border-radius: 24px;
  background: var(--apple-surface-paper, var(--surface, #f9f9fb));
  box-shadow: 0 18px 48px color-mix(in srgb, var(--shadow-color, #000) 16%, transparent);
}

.pre-apple-reader__paper-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.pre-apple-reader__paper-meta > :nth-child(2) {
  margin-left: auto;
}

.pre-apple-reader__status {
  font-size: 12px;
}

.pre-apple-reader__actions {
  display: flex;
  min-width: 0;
  justify-content: flex-end;
}

.pre-apple-reader__rollback-confirm {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--apple-danger, #ff3b30) 8%, transparent);
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  font-size: 13px;
}

.pre-apple-reader__rollback-confirm > span {
  margin-right: auto;
}

.pre-apple-reader__more {
  position: relative;
}

.pre-apple-reader__more-trigger,
.pre-apple-reader__action,
.pre-apple-reader__menu-action {
  box-sizing: border-box;
  min-height: 32px;
  border: 0;
  border-radius: 10px;
  background: var(--apple-control-fill, color-mix(in srgb, var(--foreground, #1d1d1f) 8%, var(--surface, #f9f9fb)));
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.pre-apple-reader__more-trigger {
  display: inline-flex;
  align-items: center;
  padding-inline: 12px;
  list-style: none;
}

.pre-apple-reader__more-trigger::-webkit-details-marker {
  display: none;
}

.pre-apple-reader__more-menu {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: calc(100% + 8px);
  display: grid;
  min-width: 144px;
  gap: 4px;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--foreground, #1d1d1f) 10%, transparent);
  border-radius: 14px;
  background: var(--apple-surface-elevated, var(--surface-hover, #fff));
  box-shadow: 0 12px 32px color-mix(in srgb, var(--shadow-color, #000) 22%, transparent);
  transform-origin: right bottom;
}

.pre-apple-reader__action,
.pre-apple-reader__menu-action {
  padding-inline: 12px;
}

.pre-apple-reader__menu-action {
  width: 100%;
  text-align: left;
}

.pre-apple-reader__action.is-danger,
.pre-apple-reader__menu-action.is-danger {
  color: var(--apple-danger, #ff3b30);
}

.pre-apple-reader__empty,
.pre-apple-reader__error {
  padding: 24px;
  border-radius: 20px;
  background: var(--apple-surface-paper, var(--surface, #f9f9fb));
  color: var(--apple-label-secondary, var(--muted-foreground, #6e6e73));
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
}

.pre-apple-reader__error {
  color: var(--apple-danger, #ff3b30);
  text-align: left;
}

.pre-apple-reader button,
.pre-apple-reader summary {
  transition:
    transform 100ms ease-out,
    background-color 120ms ease-out,
    filter 120ms ease-out;
}

.pre-apple-reader button:active:not(:disabled),
.pre-apple-reader summary:active {
  transform: scale(0.98);
  filter: brightness(0.96);
}

.pre-apple-reader button:focus-visible,
.pre-apple-reader summary:focus-visible {
  outline: 2px solid var(--primary, #0a84ff);
  outline-offset: 2px;
}

.pre-apple-reader button:disabled {
  cursor: default;
  opacity: 0.48;
}

@media (max-width: 760px) {
  .pre-apple-reader {
    padding: 16px 16px 24px;
  }

  .pre-apple-reader__paper {
    gap: 16px;
    padding: 20px 16px;
    border-radius: 20px;
  }

  .pre-apple-reader__rollback-confirm {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .pre-apple-reader__rollback-confirm > span {
    flex-basis: 100%;
  }

  .pre-apple-reader__action,
  .pre-apple-reader__more-trigger,
  .pre-apple-reader__menu-action {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pre-apple-reader *,
  .pre-apple-reader *::before,
  .pre-apple-reader *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }

  .pre-apple-reader button:active:not(:disabled),
  .pre-apple-reader summary:active,
  .pre-apple-reader__user.is-expanded .pre-apple-reader__user-chevron {
    transform: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .pre-apple-reader__user,
  .pre-apple-reader__paper,
  .pre-apple-reader__more-menu,
  .pre-apple-reader__empty,
  .pre-apple-reader__error {
    background: var(--apple-surface-solid, var(--surface, #f9f9fb));
  }
}

@media (prefers-contrast: more) {
  .pre-apple-reader__user,
  .pre-apple-reader__paper,
  .pre-apple-reader__more-menu,
  .pre-apple-reader__empty,
  .pre-apple-reader__error {
    outline: 1px solid currentColor;
    outline-offset: -1px;
  }

  .pre-apple-reader button:focus-visible,
  .pre-apple-reader summary:focus-visible {
    outline-width: 3px;
  }
}
</style>

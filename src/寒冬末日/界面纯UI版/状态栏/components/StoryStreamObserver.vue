<template>
  <section v-if="visible" class="eden-stream-observer" aria-live="polite">
    <header class="eden-stream-head">
      <span class="eden-stream-title">流式观察</span>
      <span class="eden-stream-status" :class="`is-${status}`">{{ statusText }}</span>
      <button type="button" class="eden-stream-close" @click="dismiss">收起</button>
    </header>
    <pre class="eden-stream-body">{{ displayText }}</pre>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { stripOptionBlocks } from '../optionParser';

type StreamStatus = 'idle' | 'waiting' | 'streaming' | 'done' | 'error';

const props = withDefaults(
  defineProps<{
    active?: boolean;
    armTick?: number;
    timeoutMs?: number;
  }>(),
  {
    active: false,
    armTick: 0,
    timeoutMs: 120000,
  },
);

const status = ref<StreamStatus>('idle');
const streamingText = ref('');
const finalizedText = ref('');
const isArmed = ref(false);
const dismissed = ref(false);

let timeoutId: number | null = null;
let stopStreamListener: { stop: () => void } | null = null;
let stopMessageListener: { stop: () => void } | null = null;
let pendingStreamChunk = '';
let streamFlushRaf = 0;

const statusText = computed(() => {
  if (status.value === 'waiting') return '等待响应';
  if (status.value === 'streaming') return '流式中';
  if (status.value === 'done') return '已收口';
  if (status.value === 'error') return '超时';
  return '空闲';
});

const displayText = computed(() => {
  if (status.value === 'waiting') return '已发送请求，等待流式 token...';
  if (status.value === 'streaming') return streamingText.value || '正在接收流式内容...';
  if (status.value === 'done') return finalizedText.value || streamingText.value || '已完成，但未解析到正文。';
  if (status.value === 'error') return streamingText.value || '等待超时，可重新发送。';
  return '';
});

const visible = computed(() => {
  if (!props.active || dismissed.value) return false;
  return status.value !== 'idle';
});

function clearTimer() {
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function clearPendingStreamChunk() {
  pendingStreamChunk = '';
  if (streamFlushRaf) {
    cancelAnimationFrame(streamFlushRaf);
    streamFlushRaf = 0;
  }
}

function flushPendingStreamChunk() {
  if (!pendingStreamChunk) return;
  const next = `${streamingText.value}${pendingStreamChunk}`;
  pendingStreamChunk = '';
  // 限制显示长度，避免超长响应撑爆布局
  streamingText.value = next.length > 16000 ? next.slice(next.length - 16000) : next;
}

function normalizeMessageText(raw: string, role?: string): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  const contentMatch = text.match(/<content(?:\s[^>]*)?>([\s\S]*?)<\/content>/i);
  if (contentMatch?.[1]) return contentMatch[1].trim();

  const gameMatch = text.match(/<game(?:\s[^>]*)?>([\s\S]*?)<\/game>/i);
  if (gameMatch?.[1]) return gameMatch[1].trim();

  const trimmedOption = stripOptionBlocks(text).trim();
  const hasUpdateTags = /<updatevariable>|<json_patch>|<update>|<initvar>/i.test(trimmedOption);
  if (hasUpdateTags && role !== 'assistant') return '';

  return trimmedOption;
}

function finishWithMessage(message: string) {
  flushPendingStreamChunk();
  finalizedText.value = message.trim();
  status.value = 'done';
  isArmed.value = false;
  clearTimer();
}

function armObserver() {
  dismissed.value = false;
  isArmed.value = true;
  status.value = 'waiting';
  streamingText.value = '';
  finalizedText.value = '';
  clearTimer();
  timeoutId = window.setTimeout(
    () => {
      if (!isArmed.value) return;
      status.value = 'error';
      isArmed.value = false;
    },
    Math.max(5000, Number(props.timeoutMs) || 120000),
  );
}

function dismiss() {
  dismissed.value = true;
  status.value = 'idle';
  isArmed.value = false;
  streamingText.value = '';
  finalizedText.value = '';
  clearPendingStreamChunk();
  clearTimer();
}

function handleStreamToken(token: string) {
  if (!isArmed.value) return;
  status.value = 'streaming';
  pendingStreamChunk += String(token ?? '');
  if (streamFlushRaf) return;
  streamFlushRaf = requestAnimationFrame(() => {
    streamFlushRaf = 0;
    flushPendingStreamChunk();
  });
}

function handleMessageReceived(message_id: number) {
  if (!isArmed.value) return;
  if (typeof getChatMessages !== 'function') return;

  try {
    const msg = getChatMessages(message_id)?.[0];
    if (!msg) return;
    if (msg.role !== 'assistant') return;

    const normalized = normalizeMessageText(String(msg.message ?? ''), msg.role);
    finishWithMessage(normalized || streamingText.value);
  } catch {
    finishWithMessage(streamingText.value);
  }
}

onMounted(() => {
  if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') return;
  stopStreamListener = eventOn(tavern_events.STREAM_TOKEN_RECEIVED, handleStreamToken as any);
  stopMessageListener = eventOn(tavern_events.MESSAGE_RECEIVED, handleMessageReceived as any);
});

onBeforeUnmount(() => {
  clearTimer();
  clearPendingStreamChunk();
  stopStreamListener?.stop?.();
  stopMessageListener?.stop?.();
});

watch(
  () => props.armTick,
  () => {
    armObserver();
  },
);
</script>

<style scoped>
.eden-stream-observer {
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.2);
  padding: 5px 7px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eden-stream-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.eden-stream-title {
  font-size: 0.68em;
  color: rgba(248, 248, 242, 0.86);
  line-height: 1;
}

.eden-stream-status {
  font-size: 0.64em;
  line-height: 1;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 2px 6px;
}

.eden-stream-status.is-waiting {
  color: #ffd889;
  border-color: rgba(255, 216, 137, 0.45);
  background: rgba(255, 216, 137, 0.15);
}

.eden-stream-status.is-streaming {
  color: #8be9fd;
  border-color: rgba(139, 233, 253, 0.5);
  background: rgba(139, 233, 253, 0.14);
}

.eden-stream-status.is-done {
  color: #8be9a4;
  border-color: rgba(139, 233, 164, 0.5);
  background: rgba(139, 233, 164, 0.12);
}

.eden-stream-status.is-error {
  color: #ff8f8f;
  border-color: rgba(255, 143, 143, 0.5);
  background: rgba(255, 143, 143, 0.14);
}

.eden-stream-close {
  margin-left: auto;
  flex: 0 0 auto;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  font: inherit;
  font-size: 0.66em;
  line-height: 1;
  padding: 4px 6px;
  cursor: pointer;
}

.eden-stream-close:hover {
  background: rgba(139, 233, 253, 0.2);
}

.eden-stream-body {
  margin: 0;
  font: inherit;
  font-size: 0.73em;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
  color: rgba(248, 248, 242, 0.9);
  max-height: 110px;
  overflow-y: auto;
}

@media (max-width: 420px) {
  .eden-stream-observer {
    padding: 5px 6px;
  }

  .eden-stream-title {
    font-size: 0.66em;
  }

  .eden-stream-body {
    font-size: 0.71em;
    max-height: 92px;
  }
}
</style>

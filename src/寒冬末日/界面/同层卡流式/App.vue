<template>
  <main id="eden-main-container" class="eden-stream-shell">
    <header class="eden-stream-shell-head">
      <div class="eden-stream-shell-meta">
        <strong class="eden-stream-shell-title">同层卡剧情面板</strong>
        <span v-if="legacyMode" class="eden-stream-shell-badge is-legacy">legacy</span>
        <span class="eden-stream-shell-badge">#{{ displayMessageId }}</span>
        <span class="eden-stream-shell-badge" :class="{ 'is-streaming': displayStreaming }">
          {{ displayStreaming ? '流式中' : '已完成' }}
        </span>
      </div>
    </header>

    <div class="eden-stream-panel-wrap">
      <section v-if="activePanel === 'story'" class="eden-stream-panel">
        <StorySection v-if="showStorySection" :raw="displayParsed.raw" :query="query" :message-id="displayMessageId" />

        <!-- legacy / 解析失败回退 -->
        <section v-else class="eden-stream-card">
          <article v-if="displayParsed.mainText" class="eden-stream-body">{{ displayParsed.mainText }}</article>
          <p v-else class="eden-stream-empty">(当前楼层暂无可解析正文)</p>
        </section>
      </section>

      <section v-else class="eden-stream-panel">
        <ChoicesSection :options="displayOptions" :query="query" />
      </section>
    </div>

    <footer v-if="showComposer" class="eden-stream-composer">
      <input
        v-model="composerInput"
        type="text"
        class="eden-stream-composer-input"
        placeholder="输入内容后回车发送"
        @keydown.enter.prevent="sendComposerInput"
      />
      <button type="button" class="eden-stream-composer-option" @click="togglePanelFromComposer">
        <template v-if="activePanel === 'story'">
          选项
          <span class="eden-stream-composer-option-count">{{ displayOptions.length }}</span>
        </template>
        <template v-else>返回正文</template>
      </button>
      <button
        type="button"
        class="eden-stream-composer-send"
        :disabled="composerSending || !composerInput.trim()"
        @click="sendComposerInput"
      >
        {{ composerSending ? '发送中' : '发送' }}
      </button>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { injectStreamingMessageContext } from '@util/streaming';
import { useInjectedData } from '../状态栏/useInjectedData';
import ChoicesSection from '../状态栏/components/ChoicesSection.vue';
import StorySection from '../状态栏/components/StorySection.vue';
import { sendToChat } from '../outbound';
import { SAMELAYER_EVENTS, type SameLayerPayload } from '../../samelayer_events';
import { parseStreamingInjectedData, useStreamingInjectedData } from './useStreamingInjectedData';
import '../状态栏/global.css';

type StreamPanel = 'story' | 'choices';

const context = injectStreamingMessageContext();
const query = ref('');
const activePanel = useLocalStorage<StreamPanel>('eden:samelayer:panel', 'story');
const { raw, mainText, options } = useStreamingInjectedData(context);
const { raw: legacyRaw, options: legacyOptions, refresh: refreshLegacy } = useInjectedData();
const bridgeRaw = ref('');
const bridgeMessageId = ref<number | null>(null);
const bridgeStreaming = ref(false);
const composerInput = ref('');
const composerSending = ref(false);
const stopHandles: Array<{ stop?: () => void }> = [];
const legacyMode = ref(resolveLegacyMode());

function parseFlag(value: string | null | undefined): boolean | null {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return null;
}

function resolveLegacyMode(): boolean {
  try {
    const search = new URLSearchParams(window.location.search);
    const fromQuery = parseFlag(search.get('legacy_mode'));
    if (fromQuery != null) return fromQuery;
  } catch {
    // ignore
  }

  try {
    const fromStorage = parseFlag(localStorage.getItem('eden:samelayer:legacy_mode'));
    if (fromStorage != null) return fromStorage;
  } catch {
    // ignore
  }

  return false;
}

const displayParsed = computed(() => {
  if (legacyMode.value) {
    const legacyText = String(legacyRaw.value ?? '').trim();
    if (!legacyText) {
      return {
        raw: '',
        mainText: '',
        options: legacyOptions.value,
      };
    }
    const parsedLegacy = parseStreamingInjectedData(legacyText);
    return {
      raw: parsedLegacy.raw,
      mainText: parsedLegacy.mainText,
      options: legacyOptions.value.length > 0 ? legacyOptions.value : parsedLegacy.options,
    };
  }

  const text = bridgeRaw.value.trim();
  if (text) return parseStreamingInjectedData(text);
  return {
    raw: raw.value,
    mainText: mainText.value,
    options: options.value,
  };
});
const displayOptions = computed(() =>
  displayParsed.value.options
    .map(v => String(v ?? '').trim())
    .filter(Boolean),
);

const showStorySection = computed(() => displayParsed.value.raw.trim().length > 0);
const showComposer = computed(() => true);
const displayMessageId = computed(() => bridgeMessageId.value ?? context.message_id);
const displayStreaming = computed(() => {
  if (legacyMode.value) return false;
  if (bridgeMessageId.value != null) return bridgeStreaming.value;
  return context.during_streaming;
});

function applyPayload(payload: SameLayerPayload) {
  if (legacyMode.value) return;
  if (!payload || typeof payload !== 'object') return;

  const payloadChatId = payload.chat_id == null ? null : String(payload.chat_id);
  if (payloadChatId) {
    try {
      const ctx = (window as any)?.SillyTavern?.getContext?.();
      const currentChatId = ctx?.chatId ?? ctx?.getCurrentChatId?.();
      if (currentChatId != null && String(currentChatId) !== payloadChatId) return;
    } catch {
      // ignore
    }
  }

  bridgeMessageId.value = Number(payload.message_id ?? NaN);
  if (!Number.isFinite(bridgeMessageId.value as number)) {
    bridgeMessageId.value = null;
  }
  bridgeRaw.value = String(payload.raw ?? '').trim();
  if (payload.phase === 'final' || payload.phase === 'reset' || payload.phase === 'sync') {
    bridgeStreaming.value = false;
    return;
  }
  bridgeStreaming.value = payload.during_streaming === true;
}

function clearBridge() {
  bridgeMessageId.value = null;
  bridgeRaw.value = '';
  bridgeStreaming.value = false;
}

function togglePanelFromComposer() {
  activePanel.value = activePanel.value === 'story' ? 'choices' : 'story';
}

function sendComposerInput() {
  if (composerSending.value) return;
  const text = String(composerInput.value ?? '').trim();
  if (!text) {
    toastr?.warning?.('请输入内容');
    return;
  }

  composerSending.value = true;
  try {
    const res = sendToChat(text, {
      toast: true,
      successMessage: '已发送，开始流式生成',
      failureMessage: '发送失败，请重试',
      unavailableMessage: '无法发送：triggerSlash 不可用',
    });
    if (res.ok) composerInput.value = '';
  } finally {
    composerSending.value = false;
  }
}

function onAnyEvent(eventName: string, listener: (payload: any) => void) {
  if (typeof eventOn !== 'function') return;
  try {
    const stop = eventOn(eventName as any, listener as any);
    stopHandles.push(stop);
  } catch {
    // ignore
  }
}

onMounted(() => {
  if (legacyMode.value) {
    refreshLegacy();
    return;
  }

  onAnyEvent(SAMELAYER_EVENTS.SHOW, payload => applyPayload(payload));
  onAnyEvent(SAMELAYER_EVENTS.SYNC_DATA, payload => applyPayload(payload));
  onAnyEvent(SAMELAYER_EVENTS.STREAM, payload => applyPayload(payload));
  onAnyEvent(SAMELAYER_EVENTS.FINAL, payload => applyPayload(payload));
  onAnyEvent(SAMELAYER_EVENTS.SYNC_RESPONSE, payload => applyPayload(payload));
  onAnyEvent(SAMELAYER_EVENTS.RESET, payload => {
    clearBridge();
    applyPayload(payload);
  });
  onAnyEvent(SAMELAYER_EVENTS.SEND_RESULT, payload => {
    if (payload?.ok === true) return;
    const reason = String(payload?.reason ?? '未知错误');
    toastr?.error?.(`桥接发送失败：${reason}`);
  });

  if (typeof eventEmit === 'function') {
    void eventEmit(SAMELAYER_EVENTS.REQUIRE_DATA as any);
    void eventEmit(SAMELAYER_EVENTS.SYNC_REQUEST as any);
  }
});

onBeforeUnmount(() => {
  stopHandles.forEach(s => s?.stop?.());
  stopHandles.length = 0;
});
</script>

<style scoped>
.eden-stream-shell {
  padding: 10px;
  gap: 8px;
}

.eden-stream-shell-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px 10px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
}

.eden-stream-shell-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.eden-stream-shell-title {
  margin-right: 4px;
}

.eden-stream-nav {
  margin-bottom: 0;
}

.eden-stream-panel-wrap {
  min-height: 120px;
}

.eden-stream-panel {
  min-height: 0;
}

.eden-stream-composer {
  margin-top: 0;
  padding-top: 8px;
}

.eden-stream-composer-input,
.eden-stream-composer-send {
  height: 34px;
}

.eden-stream-composer-option {
  height: 34px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  font-size: 0.78em;
  padding: 0 10px;
  white-space: nowrap;
}

.eden-stream-composer-option-count {
  margin-left: 4px;
  opacity: 0.88;
}
</style>

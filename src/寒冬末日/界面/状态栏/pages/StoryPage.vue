<template>
  <section class="eden-page">
    <div class="eden-page-scroll">
      <div v-if="isHistoryMode" class="eden-history-banner">
        <span>回看楼层 #{{ historyMessageId }}</span>
        <button type="button" class="eden-history-back-btn" @click="switchToLatest">返回最新</button>
      </div>
      <StorySection :raw="displayRaw" :query="query" :message-id="displayMessageId" />
    </div>
    <footer class="eden-story-composer">
      <div class="eden-story-composer-inner">
        <button type="button" class="eden-story-composer-history" @click="openHistoryPicker">
          回看
        </button>
        <input
          v-model="composerInput"
          type="text"
          class="eden-story-composer-input text_pole"
          :placeholder="isHistoryMode ? '回看模式仅查看，请先返回最新' : '输入内容发送给AI（Enter 快捷发送）'"
          :disabled="isHistoryMode"
          @keydown.enter.exact.prevent="sendComposerInput"
        />
        <button
          type="button"
          class="eden-story-composer-option"
          :disabled="isHistoryMode"
          @click="openChoicesPanel"
        >
          选项
          <span class="eden-story-composer-option-count">{{ displayOptions.length }}</span>
        </button>
        <button
          type="button"
          class="eden-story-composer-send"
          :disabled="isHistoryMode || composerSending || !composerInput.trim()"
          @click="sendComposerInput"
        >
          {{ composerSending ? '发送中' : '发送' }}
        </button>
      </div>
    </footer>

    <Teleport to="body">
      <div v-if="choicesPanelOpen" class="eden-story-choices-mask" @click.self="closeChoicesPanel">
        <div class="eden-story-choices-modal">
          <div class="eden-story-choices-head">
            <strong class="eden-story-choices-title">剧情选项</strong>
            <button type="button" class="eden-story-choices-close" @click="closeChoicesPanel">关闭</button>
          </div>
          <div class="eden-story-choices-body">
            <ChoicesSection :options="displayOptions" :query="query" />
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="historyPickerOpen" class="eden-story-choices-mask" @click.self="closeHistoryPicker">
        <div class="eden-story-choices-modal">
          <div class="eden-story-choices-head">
            <strong class="eden-story-choices-title">回看过往剧情楼层</strong>
            <button type="button" class="eden-story-choices-close" @click="closeHistoryPicker">关闭</button>
          </div>
          <div class="eden-story-choices-body">
            <div class="eden-history-list">
              <button type="button" class="eden-history-item is-latest" @click="switchToLatest">
                <div class="eden-history-item-top">
                  <span>最新楼层</span>
                  <span class="eden-history-item-id">自动跟随</span>
                </div>
              </button>
              <button
                v-for="item in historyCandidates"
                :key="item.message_id"
                type="button"
                class="eden-history-item"
                :class="{ active: historyMessageId === item.message_id }"
                @click="selectHistoryMessage(item.message_id)"
              >
                <div class="eden-history-item-top">
                  <span>楼层 #{{ item.message_id }}</span>
                  <span class="eden-history-item-id">{{ item.timeLabel }}</span>
                </div>
                <div class="eden-history-item-preview">{{ item.preview }}</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import ChoicesSection from '../components/ChoicesSection.vue';
import StorySection from '../components/StorySection.vue';
import { sendToChat } from '../../outbound';
import {
  getViewMessageState,
  onViewMessageChanged,
  setViewMessageHistory,
  setViewMessageLatest,
} from '../../viewMessage';

type HistoryCandidate = {
  message_id: number;
  preview: string;
  timeLabel: string;
};

type HistoryRecord = {
  message_id: number;
  raw: string;
  is_user?: boolean;
  is_system?: boolean;
  send_date?: string;
};

const props = withDefaults(
  defineProps<{
    raw: string;
    options: string[];
    query?: string;
  }>(),
  {
    options: () => [],
    query: '',
  },
);

const composerInput = ref('');
const composerSending = ref(false);
const choicesPanelOpen = ref(false);
const historyPickerOpen = ref(false);
const historyCandidates = ref<HistoryCandidate[]>([]);
const viewMessageState = ref(getViewMessageState());
const historyRaw = ref('');
const historyOptions = ref<string[]>([]);
let stopViewMessageChanged: (() => void) | null = null;

const isHistoryMode = computed(() => viewMessageState.value.mode === 'history');
const historyMessageId = computed(() => {
  const id = Number(viewMessageState.value.message_id);
  return Number.isFinite(id) ? id : null;
});

const displayRaw = computed(() => (isHistoryMode.value ? historyRaw.value : props.raw));
const displayOptions = computed(() => (isHistoryMode.value ? historyOptions.value : props.options));
const displayMessageId = computed(() => {
  const id = historyMessageId.value;
  return isHistoryMode.value && id != null ? id : null;
});

function stripForPreview(input: string): string {
  return String(input ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractOptionsFromRaw(raw: string): string[] {
  const cleaned = String(raw ?? '');
  const optionMatch = cleaned.match(/(<option(?:\s[^>]*)?>(?![\s\S]*?<option(?:\s[^>]*)?>)[\s\S]*?(?:<\/option>|$))/i);
  const optionsRaw = optionMatch
    ? optionMatch[1]
        .replace(/^<option(?:\s[^>]*)?>/i, '')
        .replace(/<\/option>\s*$/i, '')
        .trim()
    : '';
  if (!optionsRaw) return [];
  return optionsRaw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function readMessageRawById(message_id: number): string {
  try {
    const msg = getChatMessages(message_id)?.[0] as any;
    return String(msg?.message ?? '');
  } catch {
    return '';
  }
}

function syncHistoryPayload() {
  const id = historyMessageId.value;
  if (id == null) {
    historyRaw.value = '';
    historyOptions.value = [];
    return;
  }
  const raw = readMessageRawById(id);
  historyRaw.value = raw;
  historyOptions.value = extractOptionsFromRaw(raw);
}

function buildHistoryCandidates(limit = 24): HistoryCandidate[] {
  const out: HistoryCandidate[] = [];
  const byId = new Map<number, HistoryRecord>();

  const mergeRecord = (incoming: Partial<HistoryRecord>) => {
    const id = Number(incoming.message_id);
    if (!Number.isFinite(id) || id < 0) return;
    const message_id = Math.trunc(id);
    const prev = byId.get(message_id);
    const next: HistoryRecord = {
      message_id,
      raw: String(incoming.raw ?? prev?.raw ?? ''),
      is_user: incoming.is_user ?? prev?.is_user,
      is_system: incoming.is_system ?? prev?.is_system,
      send_date: String(incoming.send_date ?? prev?.send_date ?? ''),
    };
    if (!String(next.raw ?? '').trim() && prev?.raw) next.raw = prev.raw;
    byId.set(message_id, next);
  };

  // 源1：SillyTavern context（优先提供 is_user / is_system / send_date）
  try {
    const ctx = (window as any)?.SillyTavern?.getContext?.();
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    for (let i = 0; i < chat.length; i += 1) {
      const msg = chat[i];
      if (!msg || typeof msg !== 'object') continue;
      mergeRecord({
        message_id: i,
        raw: String((msg as any).message ?? ''),
        is_user: (msg as any).is_user === true,
        is_system: (msg as any).is_system === true,
        send_date: String((msg as any).send_date ?? ''),
      });
    }
  } catch {
    // ignore
  }

  // 源2：chat message API（同层桥接/隐藏场景下更稳定）
  try {
    const all = getChatMessages('0-{{lastMessageId}}') as any[];
    if (Array.isArray(all)) {
      for (let i = 0; i < all.length; i += 1) {
        const msg = all[i];
        if (!msg || typeof msg !== 'object') continue;
        const rawId = Number((msg as any).message_id);
        const fallbackId = Number(i);
        mergeRecord({
          message_id: Number.isFinite(rawId) ? rawId : fallbackId,
          raw: String((msg as any).message ?? ''),
          is_user: (msg as any).is_user === true,
          is_system: (msg as any).is_system === true,
          send_date: String((msg as any).send_date ?? ''),
        });
      }
    }
  } catch {
    // ignore
  }

  const ids = [...byId.keys()].sort((a, b) => b - a);
  for (const id of ids) {
    if (out.length >= limit) break;
    const rec = byId.get(id);
    if (!rec) continue;
    if (rec.is_user === true) continue;
    if (rec.is_system === true) continue;
    const raw = String(rec.raw ?? '').trim();
    if (!raw) continue;
    out.push({
      message_id: id,
      preview: stripForPreview(raw).slice(0, 120) || '(空内容)',
      timeLabel: String(rec.send_date ?? '').trim() || '助手消息',
    });
  }

  return out;
}

function openChoicesPanel() {
  if (isHistoryMode.value) {
    toastr?.info?.('回看模式仅查看，不能发送选项。请先返回最新楼层。');
    return;
  }
  choicesPanelOpen.value = true;
}

function closeChoicesPanel() {
  choicesPanelOpen.value = false;
}

function sendComposerInput() {
  if (composerSending.value) return;
  if (isHistoryMode.value) {
    toastr?.info?.('回看模式仅查看，不能发送。请先返回最新楼层。');
    return;
  }
  const text = String(composerInput.value ?? '').trim();
  if (!text) {
    toastr?.warning?.('请输入内容');
    return;
  }

  composerSending.value = true;
  try {
    const res = sendToChat(text, {
      toast: true,
      successMessage: '已发送',
      failureMessage: '发送失败，已尝试复制，请手动发送',
      unavailableMessage: '无法直接发送，已尝试复制，请手动发送',
    });
    if (res.ok) composerInput.value = '';
  } finally {
    composerSending.value = false;
  }
}

function openHistoryPicker() {
  historyCandidates.value = buildHistoryCandidates();
  historyPickerOpen.value = true;
}

function closeHistoryPicker() {
  historyPickerOpen.value = false;
}

function selectHistoryMessage(message_id: number) {
  const ok = setViewMessageHistory(message_id, 'story-page');
  if (!ok) {
    toastr?.warning?.('无效楼层号');
    return;
  }
  closeHistoryPicker();
}

function switchToLatest() {
  setViewMessageLatest('story-page');
  closeHistoryPicker();
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (choicesPanelOpen.value) closeChoicesPanel();
  if (historyPickerOpen.value) closeHistoryPicker();
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown);
  stopViewMessageChanged = onViewMessageChanged(nextState => {
    viewMessageState.value = nextState;
    syncHistoryPayload();
  });
  syncHistoryPayload();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
  stopViewMessageChanged?.();
  stopViewMessageChanged = null;
});
</script>

<style scoped>
.eden-history-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 214, 102, 0.42);
  background: rgba(255, 214, 102, 0.16);
  color: #fff6d7;
  font-size: 0.82em;
}

.eden-history-back-btn {
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
  font: inherit;
  font-size: 0.85em;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
}

.eden-history-back-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}

.eden-page {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 6px;
}

.eden-page-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.eden-story-composer {
  padding: 0 8px 8px;
}

.eden-story-composer-inner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 4px;
  border-radius: 9px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
}

.eden-story-composer-history {
  flex: 0 0 auto;
  border-radius: 7px;
  border: 1px solid rgba(255, 214, 102, 0.55);
  background: rgba(255, 214, 102, 0.18);
  color: var(--text-color);
  font: inherit;
  font-size: 0.76em;
  line-height: 1;
  padding: 6px 8px;
  cursor: pointer;
}

.eden-story-composer-history:hover {
  background: rgba(255, 214, 102, 0.3);
}

.eden-story-composer-input {
  min-width: 0;
  width: 100%;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.22);
  color: var(--text-color);
  padding: 6px 8px;
  font: inherit;
  font-size: 0.88em;
}

.eden-story-composer-input::placeholder {
  color: rgba(248, 248, 242, 0.55);
}

.eden-story-composer-option,
.eden-story-composer-send {
  flex: 0 0 auto;
  border-radius: 7px;
  color: var(--text-color);
  font: inherit;
  font-size: 0.76em;
  line-height: 1;
  padding: 6px 9px;
  cursor: pointer;
}

.eden-story-composer-option {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.1);
}

.eden-story-composer-option:hover {
  background: rgba(139, 233, 253, 0.2);
}

.eden-story-composer-option-count {
  display: inline-block;
  min-width: 1.35em;
  margin-left: 4px;
  padding: 1px 4px;
  border-radius: 999px;
  text-align: center;
  background: rgba(139, 233, 253, 0.22);
  border: 1px solid rgba(139, 233, 253, 0.4);
}

.eden-story-composer-send {
  border: 1px solid rgba(139, 233, 253, 0.55);
  background: rgba(139, 233, 253, 0.25);
}

.eden-story-composer-send:hover:not(:disabled) {
  background: rgba(139, 233, 253, 0.38);
}

.eden-story-composer-send:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.eden-history-list {
  display: grid;
  gap: 6px;
}

.eden-history-item {
  width: 100%;
  text-align: left;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
  font: inherit;
  padding: 8px 10px;
  cursor: pointer;
}

.eden-history-item:hover {
  background: rgba(139, 233, 253, 0.18);
}

.eden-history-item.active {
  border-color: rgba(255, 214, 102, 0.62);
  background: rgba(255, 214, 102, 0.2);
}

.eden-history-item.is-latest {
  border-color: rgba(139, 233, 253, 0.45);
}

.eden-history-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.82em;
  margin-bottom: 4px;
}

.eden-history-item-id {
  opacity: 0.78;
  font-size: 0.82em;
}

.eden-history-item-preview {
  font-size: 0.78em;
  line-height: 1.35;
  opacity: 0.9;
}

.eden-story-choices-mask {
  position: fixed;
  inset: 0;
  z-index: 2200;
  padding: 54px 12px 10px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: rgba(8, 12, 20, 0.55);
  backdrop-filter: blur(2px);
}

.eden-story-choices-modal {
  width: min(100%, 900px);
  max-height: min(72vh, 820px);
  border-radius: 12px;
  border: 1px solid rgba(139, 233, 253, 0.4);
  background: linear-gradient(180deg, rgba(20, 26, 40, 0.96), rgba(10, 14, 22, 0.97));
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.36);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.eden-story-choices-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.eden-story-choices-title {
  font-size: 0.88em;
  color: var(--text-strong);
  line-height: 1;
}

.eden-story-choices-close {
  flex: 0 0 auto;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color);
  font: inherit;
  font-size: 0.76em;
  line-height: 1;
  padding: 6px 9px;
  cursor: pointer;
}

.eden-story-choices-close:hover {
  background: rgba(139, 233, 253, 0.24);
}

.eden-story-choices-body {
  min-height: 0;
  overflow: auto;
  padding: 6px;
}

.eden-story-choices-body :deep(.choices-title) {
  display: none;
}

.eden-story-choices-body :deep(.choice-item) {
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 7px;
}

.eden-story-choices-body :deep(.palette-button) {
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  font-size: 15px;
}

@media (max-width: 420px) {
  .eden-page-scroll {
    padding: 6px 6px 8px;
  }

  .eden-story-composer {
    padding: 0 6px 6px;
  }

  .eden-story-composer-inner {
    gap: 3px;
    padding: 3px;
  }

  .eden-story-composer-input {
    font-size: 0.84em;
    padding: 6px 7px;
  }

  .eden-story-composer-option,
  .eden-story-composer-send {
    min-width: 34px;
    padding: 5px 7px;
  }

  .eden-story-composer-history {
    min-width: 34px;
    padding: 5px 7px;
  }

  .eden-story-choices-mask {
    padding: 44px 8px 8px;
    align-items: flex-start;
  }

  .eden-story-choices-modal {
    max-height: min(78vh, 940px);
  }
}
</style>

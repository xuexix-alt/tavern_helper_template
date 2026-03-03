<template>
  <section class="eden-page">
    <div class="eden-page-scroll">
      <div v-if="isHistoryMode" class="eden-history-banner">
        <span>回看楼层 #{{ historyMessageId }}</span>
        <button type="button" class="eden-history-back-btn" @click="switchToLatest">返回最新</button>
      </div>
      <StorySection :raw="displayRaw" :query="query" :message-id="displayMessageId" />
    </div>
    <transition name="eden-story-accordion">
      <section
        v-if="activeAccordionPanel"
        ref="accordionPanelRef"
        class="eden-story-accordion"
        :class="[{ 'is-compact': compactAccordionPanel }, `is-${activeAccordionPanel}`]"
        :style="accordionPanelStyle"
      >
        <div class="eden-story-choices-modal">
          <div class="eden-story-choices-head">
            <strong class="eden-story-choices-title">{{
              choicesPanelOpen ? '剧情选项' : '回看过往剧情楼层'
            }}</strong>
            <button type="button" class="eden-story-choices-close" @click="closeAccordionPanel">
              {{ choicesPanelOpen ? '收起选项' : '收起回看' }}
            </button>
          </div>
          <div class="eden-story-choices-body">
            <template v-if="choicesPanelOpen">
              <ChoicesSection :options="displayOptions" :query="query" @choice-sent="onChoiceSent" />
            </template>
            <template v-else>
              <div class="eden-history-list">
                <button
                  type="button"
                  class="eden-history-item is-latest"
                  :class="{ active: !isHistoryMode }"
                  @click="switchToLatest"
                >
                  <div class="eden-history-item-top">
                    <span>最新楼层 #{{ latestLiveMessageId ?? '?' }}</span>
                    <div class="eden-history-item-id-group">
                      <span class="eden-history-item-id">自动跟随</span>
                      <span class="eden-history-follow-state">{{ latestFollowStateLabel }}</span>
                    </div>
                  </div>
                </button>
                <div
                  v-for="item in historyCandidates"
                  :key="item.message_id"
                  class="eden-history-item"
                  :class="[{ active: historyMessageId === item.message_id }, `is-${item.role}`]"
                >
                  <button type="button" class="eden-history-item-main" @click="selectHistoryMessage(item.message_id)">
                    <div class="eden-history-item-top">
                      <span class="eden-history-item-title-group">
                        <span>楼层 #{{ item.message_id }}</span>
                        <span class="eden-history-mini-role" :class="`is-${item.role}`">{{
                          item.role === 'user' ? '用户' : 'AI'
                        }}</span>
                      </span>
                      <span class="eden-history-item-id">{{ item.timeLabel }}</span>
                    </div>
                    <div class="eden-history-item-preview">{{ item.preview }}</div>
                  </button>
                  <div class="eden-history-item-actions">
                    <span class="eden-history-role-tag" :class="`is-${item.role}`">{{ item.roleLabel }}</span>
                    <button
                      type="button"
                      class="eden-history-item-delete"
                      :disabled="deletingFromMessageId !== null"
                      @click.stop="deleteFromMessage(item)"
                    >
                      {{ deletingFromMessageId === item.message_id ? '删除中…' : '回退删除' }}
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </section>
    </transition>

    <footer class="eden-story-composer">
      <div class="eden-story-composer-inner">
        <button
          type="button"
          class="eden-story-composer-history"
          :class="{ active: historyPickerOpen }"
          @click="openHistoryPicker"
        >
          {{ historyButtonLabel }}
        </button>
        <input
          v-model="composerInput"
          type="text"
          class="eden-story-composer-input text_pole"
          :placeholder="composerPlaceholder"
          :disabled="isHistoryMode"
          @keydown.enter.exact.prevent="sendComposerInput"
        />
        <button
          type="button"
          class="eden-story-composer-option"
          :class="{ active: choicesPanelOpen }"
          :disabled="isHistoryMode"
          @click="openChoicesPanel"
        >
          {{ optionButtonLabel }}
          <span class="eden-story-composer-option-count">{{ displayOptions.length }}</span>
        </button>
        <button
          type="button"
          class="eden-story-composer-regenerate"
          :class="{ armed: regenerateConfirmArmed }"
          :disabled="!canRegenerate"
          :title="regenerateButtonTitle"
          @click="regenerateFromLatestUserInput"
        >
          {{ regenerateButtonLabel }}
        </button>
        <button
          type="button"
          class="eden-story-composer-send"
          :disabled="
            isHistoryMode ||
            composerSending ||
            regenerateSending ||
            deletingFromMessageId !== null ||
            !composerInput.trim()
          "
          @click="sendComposerInput"
        >
          {{ sendButtonLabel }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount } from 'vue';
import { useWindowSize } from '@vueuse/core';
import ChoicesSection from '../components/ChoicesSection.vue';
import StorySection from '../components/StorySection.vue';
import { sendToChat } from '../../outbound';
import {
  getViewMessageState,
  onViewMessageChanged,
  resolveLiveMessageId,
  setViewMessageHistory,
  setViewMessageLatest,
} from '../../viewMessage';

type HistoryCandidate = {
  message_id: number;
  preview: string;
  timeLabel: string;
  role: 'assistant' | 'user';
  roleLabel: string;
};

type HistoryRecord = {
  message_id: number;
  raw: string;
  is_user?: boolean;
  is_system?: boolean;
  send_date?: string;
};
type AccordionPanel = 'choices' | 'history';

function normalizeBooleanFlag(input: unknown): boolean | undefined {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return Number.isFinite(input) ? input !== 0 : undefined;
  if (typeof input === 'string') {
    const v = input.trim().toLowerCase();
    if (!v) return undefined;
    if (['true', '1', 'yes', 'on', 'user', 'human', 'usr'].includes(v)) return true;
    if (['false', '0', 'no', 'off', 'assistant', 'ai', 'bot', 'system', 'sys'].includes(v)) return false;
  }
  return undefined;
}

function normalizeRoleHints(msg: any): { is_user?: boolean; is_system?: boolean } {
  const role = String(msg?.role ?? msg?.type ?? '')
    .trim()
    .toLowerCase();
  const hintUser = normalizeBooleanFlag(msg?.is_user);
  const hintSystem = normalizeBooleanFlag(msg?.is_system);

  const is_system =
    hintSystem ??
    (role === 'system' ? true : undefined) ??
    (String(msg?.name ?? '').trim() === 'System' ? true : undefined);

  const is_user =
    hintUser ??
    (role === 'user' ? true : undefined) ??
    (role === 'assistant' ? false : undefined) ??
    (is_system === true ? false : undefined);

  return { is_user, is_system };
}

const props = withDefaults(
  defineProps<{
    raw: string;
    options?: string[];
    query?: string;
  }>(),
  {
    options: () => [],
    query: '',
  },
);

const composerInput = ref('');
const composerSending = ref(false);
const regenerateSending = ref(false);
const latestUserInput = ref('');
const latestUserInputMessageId = ref<number | null>(null);
const latestLiveMessageId = ref<number | null>(null);
const containerMessageId = ref<number | null>(null);
const { width: viewportWidth, height: viewportHeight } = useWindowSize({ includeScrollbar: true });
const activeAccordionPanel = ref<AccordionPanel | null>(null);
const accordionPanelRef = ref<HTMLElement | null>(null);
const historyCandidates = ref<HistoryCandidate[]>([]);
const deletingFromMessageId = ref<number | null>(null);
const viewMessageState = ref(getViewMessageState());
const historyRaw = ref('');
const historyOptions = ref<string[]>([]);
const latestModeRaw = ref('');
const latestModeOptions = ref<string[]>([]);
const regenerateConfirmArmed = ref(false);
let stopViewMessageChanged: (() => void) | null = null;
let regenerateConfirmTimer = 0;

const isHistoryMode = computed(() => viewMessageState.value.mode === 'history');
const compactComposerPanel = computed(() => Number(viewportWidth.value || 0) <= 420);
const mobileComposerPanel = computed(() => Number(viewportWidth.value || 0) <= 640);
const historyButtonLabel = computed(() => (compactComposerPanel.value ? '历史' : '回看'));
const optionButtonLabel = computed(() => (compactComposerPanel.value ? '选项' : '选项'));
const sendButtonLabel = computed(() => (composerSending.value ? '发送中' : '发送'));
const regenerateConfirmEnabled = computed(() => mobileComposerPanel.value);
const regenerateButtonLabel = computed(() => {
  if (regenerateSending.value) return '重生中';
  if (regenerateConfirmEnabled.value && regenerateConfirmArmed.value) return compactComposerPanel.value ? '确认' : '确认重生';
  return compactComposerPanel.value ? '重生' : '重新生成';
});
const composerPlaceholder = computed(() => {
  if (isHistoryMode.value) return '回看模式仅查看，请先返回最新';
  if (compactComposerPanel.value) return '输入后回车或点发送';
  return '输入内容发送给AI（Enter 快捷发送）';
});
const historyMessageId = computed(() => {
  const id = Number(viewMessageState.value.message_id);
  return Number.isFinite(id) ? id : null;
});

const displayRaw = computed(() => {
  if (isHistoryMode.value) return historyRaw.value;
  if (String(latestModeRaw.value ?? '').trim()) return latestModeRaw.value;
  return props.raw;
});
const displayOptions = computed(() => {
  if (isHistoryMode.value) return historyOptions.value;
  if (String(latestModeRaw.value ?? '').trim()) return latestModeOptions.value;
  return props.options;
});
const displayMessageId = computed(() => {
  const id = historyMessageId.value;
  if (isHistoryMode.value && id != null) return id;
  const live = latestLiveMessageId.value;
  return live != null ? live : null;
});
const canRegenerate = computed(
  () =>
    !isHistoryMode.value && !composerSending.value && !regenerateSending.value && deletingFromMessageId.value == null,
);
const regenerateButtonTitle = computed(() => {
  if (isHistoryMode.value) return '回看模式下不可用，请先返回最新楼层';
  if (regenerateConfirmEnabled.value && !regenerateConfirmArmed.value) return '移动端防误触：再次点击确认重生';
  if (regenerateConfirmEnabled.value && regenerateConfirmArmed.value) return '点击确认重生';
  if (!String(latestUserInput.value ?? '').trim()) return '未找到最近一次用户输入，将按当前聊天上下文尝试重生';
  if (regenerateSending.value) return '正在以最近一次用户输入重新生成…';
  return `以楼层 #${latestUserInputMessageId.value ?? '?'} 的最新用户输入重新生成`;
});
const latestFollowStateLabel = computed(
  () => `容器#${containerMessageId.value ?? '?'} / 跟随#${latestLiveMessageId.value ?? '?'}`,
);
const choicesPanelOpen = computed(() => activeAccordionPanel.value === 'choices');
const historyPickerOpen = computed(() => activeAccordionPanel.value === 'history');
const compactAccordionPanel = computed(() => Number(viewportWidth.value || 0) <= 540);
const accordionPanelMaxHeightPx = computed(() => {
  const vvHeight = Number(window.visualViewport?.height || 0);
  const viewport = vvHeight > 0 ? vvHeight : Number(viewportHeight.value || 0);
  const reserve = compactAccordionPanel.value ? 188 : 236;
  const adaptive = viewport > 0 ? Math.floor(viewport - reserve) : 420;
  return _.clamp(adaptive, 220, 820);
});
const accordionPanelStyle = computed<Record<string, string>>(() => ({
  '--eden-story-accordion-max-height': `${accordionPanelMaxHeightPx.value}px`,
}));
const REGENERATE_TRIGGER_TIMEOUT_MS = 45000;

function closeAccordionPanel() {
  activeAccordionPanel.value = null;
}

function revealAccordionPanel() {
  nextTick(() => {
    accordionPanelRef.value?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  });
}

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
    return readMessageText(msg);
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

function syncLatestModePayload() {
  const id = latestLiveMessageId.value;
  if (id == null) {
    latestModeRaw.value = '';
    latestModeOptions.value = [];
    return;
  }
  const raw = readMessageRawById(id);
  latestModeRaw.value = raw;
  latestModeOptions.value = extractOptionsFromRaw(raw);
}

function readMessageText(msg: any): string {
  if (Array.isArray(msg?.swipes) && msg.swipes.length > 0) {
    const swipeId = Number(msg?.swipe_id);
    if (Number.isFinite(swipeId) && swipeId >= 0 && swipeId < msg.swipes.length) {
      return String(msg.swipes[swipeId] ?? '').trim();
    }
    return String(msg.swipes[msg.swipes.length - 1] ?? '').trim();
  }
  return String(msg?.message ?? '').trim();
}

function resolveLatestUserInputMetaFromContext(): { message_id: number; text: string } | null {
  try {
    const ctx = (window as any)?.SillyTavern?.getContext?.();
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    for (let i = chat.length - 1; i >= 0; i -= 1) {
      const msg = chat[i];
      if (!msg || typeof msg !== 'object') continue;
      if ((msg as any).is_user !== true) continue;
      const text = readMessageText(msg);
      if (!text) continue;
      return { message_id: i, text };
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveLatestUserInputMetaFromApi(): { message_id: number; text: string } | null {
  try {
    const list = getChatMessages('0-{{lastMessageId}}') as any[];
    if (!Array.isArray(list) || list.length === 0) return null;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const msg = list[i];
      if (!msg || typeof msg !== 'object') continue;
      if ((msg as any).is_user !== true) continue;
      const text = readMessageText(msg);
      if (!text) continue;
      const message_id = Number((msg as any)?.message_id);
      if (Number.isFinite(message_id) && message_id >= 0) return { message_id: Math.trunc(message_id), text };
    }
  } catch {
    // ignore
  }
  return null;
}

function refreshLatestUserInput() {
  const resolved = resolveLatestUserInputMetaFromContext() ?? resolveLatestUserInputMetaFromApi();
  latestUserInput.value = resolved?.text ?? '';
  latestUserInputMessageId.value = resolved?.message_id ?? null;
}

function resolveReliableLiveMessageId(): number | null {
  const fromViewState = resolveLiveMessageId();
  const fromApi = resolveLastMessageId();
  if (fromViewState == null) return fromApi;
  if (fromApi == null) return fromViewState;
  return Math.max(fromViewState, fromApi);
}

function resolveContainerMessageId(): number | null {
  try {
    const id = Number(getCurrentMessageId?.());
    if (Number.isFinite(id) && id >= 0) return Math.trunc(id);
  } catch {
    // ignore
  }
  return null;
}

function refreshLiveMessageId() {
  containerMessageId.value = resolveContainerMessageId();
  latestLiveMessageId.value = resolveReliableLiveMessageId();
  syncLatestModePayload();
}

function buildHistoryCandidates(limit = 48): HistoryCandidate[] {
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
      const roleHints = normalizeRoleHints(msg);
      const rawContextId = Number((msg as any).message_id);
      mergeRecord({
        message_id: Number.isFinite(rawContextId) ? Math.trunc(rawContextId) : i,
        raw: String((msg as any).message ?? ''),
        is_user: roleHints.is_user,
        is_system: roleHints.is_system,
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
        const roleHints = normalizeRoleHints(msg);
        const rawId = Number((msg as any).message_id);
        const fallbackId = Number(i);
        mergeRecord({
          message_id: Number.isFinite(rawId) ? rawId : fallbackId,
          raw: String((msg as any).message ?? ''),
          is_user: roleHints.is_user,
          is_system: roleHints.is_system,
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
    if (rec.is_system === true) continue;
    const raw = String(rec.raw ?? '').trim();
    if (!raw) continue;
    const role: HistoryCandidate['role'] = rec.is_user === true ? 'user' : 'assistant';
    out.push({
      message_id: id,
      preview: stripForPreview(raw).slice(0, 120) || '(空内容)',
      timeLabel: String(rec.send_date ?? '').trim() || (role === 'user' ? '用户输入' : '助手消息'),
      role,
      roleLabel: role === 'user' ? '用户输入' : '助手消息',
    });
  }

  return out;
}

function openChoicesPanel() {
  if (isHistoryMode.value) {
    toastr?.info?.('回看模式仅查看，不能发送选项。请先返回最新楼层。');
    return;
  }
  activeAccordionPanel.value = choicesPanelOpen.value ? null : 'choices';
  if (activeAccordionPanel.value) revealAccordionPanel();
}

function closeChoicesPanel() {
  if (!choicesPanelOpen.value) return;
  closeAccordionPanel();
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

function disarmRegenerateConfirm() {
  regenerateConfirmArmed.value = false;
  if (regenerateConfirmTimer) {
    window.clearTimeout(regenerateConfirmTimer);
    regenerateConfirmTimer = 0;
  }
}

function armRegenerateConfirm() {
  regenerateConfirmArmed.value = true;
  if (regenerateConfirmTimer) window.clearTimeout(regenerateConfirmTimer);
  regenerateConfirmTimer = window.setTimeout(() => {
    regenerateConfirmArmed.value = false;
    regenerateConfirmTimer = 0;
  }, 2400);
}

async function regenerateFromLatestUserInput() {
  if (regenerateSending.value || composerSending.value || deletingFromMessageId.value != null) return;
  if (isHistoryMode.value) {
    toastr?.info?.('回看模式仅查看，不能重新生成。请先返回最新楼层。');
    return;
  }
  if (regenerateConfirmEnabled.value && !regenerateConfirmArmed.value) {
    armRegenerateConfirm();
    toastr?.info?.('再次点击“重生”以确认');
    return;
  }

  disarmRegenerateConfirm();
  regenerateSending.value = true;
  try {
    if (tryClickHostRegenerateButton()) {
      setViewMessageLatest('story-page:host-regenerate');
      toastr?.success?.('已调用酒馆重新生成');
      return;
    }

    refreshLatestUserInput();
    const userText = String(latestUserInput.value ?? '').trim();
    const userMessageId = latestUserInputMessageId.value;
    const lastId = resolveLastMessageId();
    const slash = resolveTriggerSlashForRegenerate();
    if (!slash) {
      toastr?.error?.('无法重生：triggerSlash 不可用');
      return;
    }

    if (userMessageId != null && Number.isFinite(userMessageId) && lastId != null && lastId > userMessageId) {
      const idsToDelete = _.range(userMessageId + 1, lastId + 1);
      if (idsToDelete.length > 0) await deleteChatMessages(idsToDelete, { refresh: 'all' });
    }

    const triggerSettled = await runRegenerateTriggerWithTimeout(slash, REGENERATE_TRIGGER_TIMEOUT_MS);
    if (!triggerSettled) {
      try {
        await Promise.resolve(slash('/trigger'));
        toastr?.warning?.('重新生成等待超时，已切换为非阻塞触发');
      } catch (fallbackErr: any) {
        throw new Error(`重生等待超时，且降级触发失败：${fallbackErr?.message ?? String(fallbackErr)}`);
      }
    }

    setViewMessageLatest('story-page:regenerate');
    historyCandidates.value = buildHistoryCandidates();
    syncHistoryPayload();
    refreshLatestUserInput();
    refreshLiveMessageId();
    if (userText) toastr?.success?.(`已按楼层 #${userMessageId ?? '?'} 的用户输入重新生成`);
    else toastr?.success?.('已按当前聊天上下文重新生成');
  } catch (err: any) {
    toastr?.error?.(`重生失败：${err?.message ?? String(err)}`);
  } finally {
    regenerateSending.value = false;
  }
}

function openHistoryPicker() {
  refreshLiveMessageId();
  historyCandidates.value = buildHistoryCandidates();
  activeAccordionPanel.value = historyPickerOpen.value ? null : 'history';
  if (activeAccordionPanel.value) revealAccordionPanel();
}

function closeHistoryPicker() {
  if (!historyPickerOpen.value) return;
  closeAccordionPanel();
}

function resolveLastMessageId(): number | null {
  try {
    const id = Number(getLastMessageId?.());
    if (Number.isFinite(id) && id >= 0) return Math.trunc(id);
  } catch {
    // ignore
  }
  try {
    const all = getChatMessages('0-{{lastMessageId}}') as any[];
    if (!Array.isArray(all) || all.length === 0) return null;
    const ids = all
      .map(msg => Number((msg as any)?.message_id))
      .filter(id => Number.isFinite(id) && id >= 0)
      .map(id => Math.trunc(id));
    if (ids.length === 0) return null;
    return Math.max(...ids);
  } catch {
    return null;
  }
}

async function confirmWithPopup(content: string): Promise<boolean> {
  try {
    if (typeof (SillyTavern as any)?.callGenericPopup === 'function') {
      const result = await SillyTavern.callGenericPopup(content, SillyTavern.POPUP_TYPE.CONFIRM);
      return result === SillyTavern.POPUP_RESULT.AFFIRMATIVE || result === true;
    }
  } catch {
    // ignore
  }
  return window.confirm(content);
}

async function deleteFromMessage(item: HistoryCandidate) {
  if (deletingFromMessageId.value != null) return;
  const startId = Number(item.message_id);
  if (!Number.isFinite(startId) || startId < 0) {
    toastr?.warning?.('无效楼层号');
    return;
  }

  const lastId = resolveLastMessageId();
  if (lastId == null || startId > lastId) {
    toastr?.warning?.('未找到可删除楼层');
    return;
  }

  const count = lastId - startId + 1;
  const ok = await confirmWithPopup(
    `确定回退并删除楼层 #${startId} 到 #${lastId}（共 ${count} 层）？\n\n该操作与酒馆回退逻辑一致：删除该楼层后，其后的楼层将一并删除。`,
  );
  if (!ok) return;

  deletingFromMessageId.value = startId;
  try {
    const ids = _.range(startId, lastId + 1);
    await deleteChatMessages(ids, { refresh: 'all' });
    setViewMessageLatest('story-page:delete-rollback');
    historyCandidates.value = buildHistoryCandidates();
    syncHistoryPayload();
    refreshLatestUserInput();
    refreshLiveMessageId();
    toastr?.success?.(`已回退删除 ${count} 层`);
  } catch (err: any) {
    toastr?.error?.(`删除失败：${err?.message ?? String(err)}`);
  } finally {
    deletingFromMessageId.value = null;
  }
}

function resolveTriggerSlashForRegenerate(): ((command: string) => Promise<any> | any) | null {
  if (typeof triggerSlash === 'function') return triggerSlash;
  let cur: Window | null = window;
  for (let i = 0; i < 8 && cur; i += 1) {
    try {
      const fn = (cur as any)?.triggerSlash;
      if (typeof fn === 'function') return fn.bind(cur);
    } catch {
      // ignore
    }
    try {
      if (!cur.parent || cur.parent === cur) break;
      cur = cur.parent;
    } catch {
      break;
    }
  }
  try {
    const parent = window.parent as any;
    if (typeof parent?.triggerSlash === 'function') return parent.triggerSlash.bind(parent);
  } catch {
    // ignore
  }
  return null;
}

async function runRegenerateTriggerWithTimeout(
  slash: (command: string) => Promise<any> | any,
  timeoutMs: number,
): Promise<boolean> {
  const normalizedTimeout = Math.max(1500, Math.trunc(timeoutMs || 0));
  let timeoutId = 0;

  const timeoutPromise = new Promise<'timeout'>(resolve => {
    timeoutId = window.setTimeout(() => resolve('timeout'), normalizedTimeout);
  });
  const triggerPromise = Promise.resolve(slash('/trigger await=true'))
    .then(() => 'done' as const)
    .catch((err: any) => {
      throw err;
    });

  try {
    const result = await Promise.race([triggerPromise, timeoutPromise]);
    return result === 'done';
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function tryClickHostRegenerateButton(): boolean {
  const docs: Document[] = [];
  const pushDoc = (doc: Document | null | undefined) => {
    if (!doc) return;
    if (docs.includes(doc)) return;
    docs.push(doc);
  };

  pushDoc(document);
  try {
    pushDoc(window.parent?.document);
  } catch {
    // ignore
  }
  try {
    pushDoc(window.top?.document);
  } catch {
    // ignore
  }

  const selectors = [
    '#option_regenerate',
    '#option_continue',
    'button[title*="重新生成"]',
    'button[aria-label*="重新生成"]',
    'button[title*="Regenerate"]',
    'button[aria-label*="Regenerate"]',
  ];

  const isInteractable = (el: HTMLElement, doc: Document): boolean => {
    if ((el as HTMLButtonElement).disabled) return false;
    const win = doc.defaultView ?? window;
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  for (const doc of docs) {
    for (const selector of selectors) {
      const candidates = Array.from(doc.querySelectorAll<HTMLElement>(selector));
      for (const el of candidates) {
        if (!isInteractable(el, doc)) continue;
        try {
          const view = doc.defaultView ?? window;
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view }));
          return true;
        } catch {
          // ignore
        }
      }
    }
  }

  return false;
}

function selectHistoryMessage(message_id: number) {
  // 语义归一：若用户在回看列表点击的正好是“当前最新楼层”，
  // 则直接切回 latest 模式，避免出现“同号不同态（按钮灰/可用不一致）”。
  if (latestLiveMessageId.value != null && Number(message_id) === Number(latestLiveMessageId.value)) {
    switchToLatest();
    return;
  }
  const ok = setViewMessageHistory(message_id, 'story-page');
  if (!ok) {
    toastr?.warning?.('无效楼层号');
    return;
  }
  closeHistoryPicker();
}

function switchToLatest() {
  setViewMessageLatest('story-page');
  refreshLiveMessageId();
  closeAccordionPanel();
  closeHistoryPicker();
}

function onChoiceSent() {
  closeChoicesPanel();
  setViewMessageLatest('story-page:choice-sent');
  refreshLatestUserInput();
  refreshLiveMessageId();
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (choicesPanelOpen.value) closeChoicesPanel();
  if (historyPickerOpen.value) closeHistoryPicker();
}

function ensureHistorySelectionValid() {
  if (!isHistoryMode.value) return;
  const selected = historyMessageId.value;
  if (selected == null) {
    setViewMessageLatest('story-page:auto-fix-empty-history');
    return;
  }

  // 语义归一：history 选中楼层与当前最新楼层一致时，自动回到 latest 模式。
  // 这样“最新楼层 #N”与“楼层 #N”不会再出现交互差异。
  const liveId = latestLiveMessageId.value;
  if (liveId != null && selected === liveId) {
    setViewMessageLatest('story-page:auto-fix-history-equals-latest');
    return;
  }

  // 生图回传/同层隐藏期间，live id 可能短暂不可用或回跳，不能据此强制退出回看。
  // 只要目标楼层仍存在，就保持 history 选择不变。
  try {
    const target = getChatMessages(selected)?.[0] as any;
    if (target && typeof target === 'object') return;
  } catch {
    // ignore
  }

  // 兜底：若 API 单点读取异常，再用全量列表校验一次。
  try {
    const all = getChatMessages('0-{{lastMessageId}}') as any[];
    if (Array.isArray(all)) {
      const exists = all.some(msg => Number((msg as any)?.message_id) === selected);
      if (exists) return;
    }
  } catch {
    // ignore
  }

  // 只有在确认为“回看楼层不存在”时才回退到最新，避免误切换。
  setViewMessageLatest('story-page:auto-fix-missing-history');
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown);
  stopViewMessageChanged = onViewMessageChanged(nextState => {
    viewMessageState.value = nextState;
    syncHistoryPayload();
    refreshLatestUserInput();
    refreshLiveMessageId();
    ensureHistorySelectionValid();
  });
  syncHistoryPayload();
  refreshLatestUserInput();
  refreshLiveMessageId();
  ensureHistorySelectionValid();
});

watch(
  () => activeAccordionPanel.value,
  panel => {
    if (!panel) return;
    revealAccordionPanel();
  },
);

watch(
  () => props.raw,
  () => {
    refreshLatestUserInput();
    refreshLiveMessageId();
    ensureHistorySelectionValid();
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
  closeAccordionPanel();
  disarmRegenerateConfirm();
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
  grid-template-rows: minmax(0, 1fr) auto auto;
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

.eden-story-accordion {
  margin: 0 8px;
  overflow: hidden;
}

.eden-story-accordion.is-compact {
  margin: 0 6px;
}

.eden-story-accordion-enter-active,
.eden-story-accordion-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.eden-story-accordion-enter-from,
.eden-story-accordion-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.eden-story-composer {
  padding: 0 8px 8px;
}

.eden-story-composer-inner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
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

.eden-story-composer-history.active {
  border-color: rgba(255, 214, 102, 0.72);
  background: rgba(255, 214, 102, 0.32);
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
.eden-story-composer-regenerate,
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

.eden-story-composer-option.active {
  border-color: rgba(139, 233, 253, 0.58);
  background: rgba(139, 233, 253, 0.3);
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

.eden-story-composer-regenerate {
  border: 1px solid rgba(255, 214, 102, 0.48);
  background: rgba(255, 214, 102, 0.16);
}

.eden-story-composer-regenerate:hover:not(:disabled) {
  background: rgba(255, 214, 102, 0.28);
}

.eden-story-composer-regenerate.armed {
  border-color: rgba(255, 120, 120, 0.75);
  background: rgba(255, 120, 120, 0.24);
  color: #ffe8e8;
}

.eden-story-composer-send {
  border: 1px solid rgba(139, 233, 253, 0.55);
  background: rgba(139, 233, 253, 0.25);
}

.eden-story-composer-send:hover:not(:disabled) {
  background: rgba(139, 233, 253, 0.38);
}

.eden-story-composer-regenerate:disabled,
.eden-story-composer-send:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.eden-history-list {
  display: grid;
  gap: 6px;
}

.eden-history-item {
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-left-width: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
  padding: 8px 10px;
  display: grid;
  gap: 7px;
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

.eden-history-item.is-user {
  border-color: rgba(143, 213, 255, 0.45);
  background: linear-gradient(90deg, rgba(143, 213, 255, 0.2), rgba(143, 213, 255, 0.08));
}

.eden-history-item.is-assistant {
  border-color: rgba(255, 214, 102, 0.45);
  background: linear-gradient(90deg, rgba(255, 214, 102, 0.2), rgba(255, 214, 102, 0.08));
}

.eden-history-item.is-user.active {
  border-color: rgba(143, 213, 255, 0.75);
  background: linear-gradient(90deg, rgba(143, 213, 255, 0.32), rgba(143, 213, 255, 0.14));
}

.eden-history-item.is-assistant.active {
  border-color: rgba(255, 214, 102, 0.75);
  background: linear-gradient(90deg, rgba(255, 214, 102, 0.32), rgba(255, 214, 102, 0.14));
}

.eden-history-item-main {
  width: 100%;
  text-align: left;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0;
  cursor: pointer;
}

.eden-history-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.82em;
  margin-bottom: 4px;
}

.eden-history-item-title-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.eden-history-mini-role {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 1px 5px;
  font-size: 0.72em;
  line-height: 1;
  opacity: 0.95;
}

.eden-history-mini-role.is-user {
  border-color: rgba(143, 213, 255, 0.55);
  background: rgba(143, 213, 255, 0.2);
  color: #e5f7ff;
}

.eden-history-mini-role.is-assistant {
  border-color: rgba(255, 214, 102, 0.55);
  background: rgba(255, 214, 102, 0.2);
  color: #fff8dc;
}

.eden-history-item-id {
  opacity: 0.78;
  font-size: 0.82em;
}

.eden-history-item-id-group {
  display: inline-flex;
  align-items: flex-end;
  gap: 6px;
}

.eden-history-follow-state {
  opacity: 0.7;
  font-size: 0.72em;
  white-space: nowrap;
}

.eden-history-item-preview {
  font-size: 0.78em;
  line-height: 1.35;
  opacity: 0.9;
}

.eden-history-item-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.eden-history-role-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.72em;
  line-height: 1;
  padding: 3px 7px;
  opacity: 0.95;
}

.eden-history-role-tag.is-user {
  border-color: rgba(143, 213, 255, 0.5);
  background: rgba(143, 213, 255, 0.22);
  color: #e5f7ff;
}

.eden-history-role-tag.is-assistant {
  border-color: rgba(255, 214, 102, 0.5);
  background: rgba(255, 214, 102, 0.2);
  color: #fff8dc;
}

.eden-history-item-delete {
  border-radius: 7px;
  border: 1px solid rgba(255, 120, 120, 0.45);
  background: rgba(255, 120, 120, 0.15);
  color: #ffdcdc;
  font: inherit;
  font-size: 0.72em;
  line-height: 1;
  padding: 5px 8px;
  cursor: pointer;
}

.eden-history-item-delete:hover:not(:disabled) {
  background: rgba(255, 120, 120, 0.24);
}

.eden-history-item-delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.eden-story-choices-modal {
  width: 100%;
  max-height: var(--eden-story-accordion-max-height, 420px);
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

@media (max-width: 640px) {
  .eden-story-composer-inner {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'input send'
      'history option'
      'regenerate regenerate';
  }

  .eden-story-composer-history {
    grid-area: history;
  }

  .eden-story-composer-input {
    grid-area: input;
  }

  .eden-story-composer-option {
    grid-area: option;
  }

  .eden-story-composer-regenerate {
    grid-area: regenerate;
  }

  .eden-story-composer-send {
    grid-area: send;
    min-width: 64px;
  }

  .eden-story-composer-history,
  .eden-story-composer-option,
  .eden-story-composer-regenerate,
  .eden-story-composer-send {
    width: 100%;
    text-align: center;
    min-height: 32px;
  }
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
  .eden-story-composer-regenerate,
  .eden-story-composer-send,
  .eden-story-composer-history {
    min-width: 34px;
    padding: 5px 7px;
    min-height: 32px;
  }

  .eden-story-choices-modal {
    max-height: var(--eden-story-accordion-max-height, 420px);
  }
}
</style>

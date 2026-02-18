import { SAMELAYER_EVENTS, type SameLayerPayload } from '../../samelayer_events';
import { resolveSameLayerAnchorMessageId, resolveSameLayerLatestAssistantMessageId } from '../../samelayer_anchor';

const HIDDEN_CLASS = 'eden-samelayer-hidden';
const STYLE_ID = 'eden-samelayer-style';
const ANCHOR_STORAGE_KEY = 'eden:samelayer:anchor_message_id';
const STREAM_SCROLL_THROTTLE_MS = 120;
const CHATU8_EVENT_TYPE = {
  GENERATE_IMAGE_REQUEST: 'generate-image-request',
  GENERATE_IMAGE_RESPONSE: 'generate-image-response',
  LLM_PROMPT_REQUEST: 'ch-llm-image-gen-get-prompt-request',
  LLM_PROMPT_RESPONSE: 'ch-llm-image-gen-get-prompt-response',
} as const;
const ACTION_LOCK_TTL_MS = {
  SEND: 2500,
  CHATU8_GENERATE: 45000,
} as const;

type BridgeAction = 'send' | 'chatu8_generate';

type StopHandle = { stop?: () => void } | null;
type ActionLock = {
  action: BridgeAction;
  chat_key: string;
  expires_at: number;
};

type BridgeState = {
  anchor_message_id: number | null;
  message_id: number | null;
  raw: string;
  during_streaming: boolean;
  chat_id: string | null;
  tx_id: string;
  tx_seq: number;
  tx_version: number;
};

const state: BridgeState = {
  anchor_message_id: null,
  message_id: null,
  raw: '',
  during_streaming: false,
  chat_id: null,
  tx_id: 'boot:0',
  tx_seq: 0,
  tx_version: 0,
};
let last_stream_scroll_at = 0;
const actionLocks = new Map<string, ActionLock>();

function normalizeAnchorCandidate(raw: unknown): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function hasPinnedAnchorPreference(): boolean {
  try {
    const fromWindow = normalizeAnchorCandidate((window as any).__EDEN_SAMELAYER_ANCHOR_ID);
    if (fromWindow != null) return true;
  } catch {
    // ignore
  }

  try {
    const fromStorage = normalizeAnchorCandidate(localStorage.getItem(ANCHOR_STORAGE_KEY));
    if (fromStorage != null) return true;
  } catch {
    // ignore
  }

  return false;
}

function syncAnchorToLatestAssistant() {
  if (hasPinnedAnchorPreference()) return;
  const fallback_anchor = resolveSameLayerAnchorMessageId();
  if (fallback_anchor == null) return;
  if (state.anchor_message_id === fallback_anchor) return;
  state.anchor_message_id = fallback_anchor;
}

function followAnchorToMessage(message_id: number) {
  if (hasPinnedAnchorPreference()) return;
  if (!Number.isFinite(message_id)) return;
  // 同层桥接默认固定在锚点楼层（通常是 0 楼），不随最新消息漂移。
  syncAnchorToLatestAssistant();
}

function listReachableHostWindows(): (Window & typeof globalThis)[] {
  const out: Array<Window & typeof globalThis> = [];
  const seen = new Set<Window>();
  const push = (candidate: Window | null | undefined) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    out.push(candidate as Window & typeof globalThis);
  };

  push(window);
  try {
    push(window.parent);
  } catch {
    // ignore
  }
  try {
    push(window.top);
  } catch {
    // ignore
  }
  return out;
}

function readHostEventSource(): any | null {
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const source = (hostWindow as any)?.eventSource;
      if (source && typeof source.on === 'function' && typeof source.emit === 'function') return source;
    } catch {
      // ignore
    }
  }
  return null;
}

function readContext(): any {
  try {
    return (window as any).SillyTavern?.getContext?.() ?? null;
  } catch {
    return null;
  }
}

function readChatId(): string | null {
  try {
    const ctx = readContext();
    const id = ctx?.chatId ?? ctx?.getCurrentChatId?.();
    return id == null ? null : String(id);
  } catch {
    return null;
  }
}

function resolveActionChatKey(): string {
  const chat_id = state.chat_id ?? readChatId();
  return chat_id && String(chat_id).trim() ? String(chat_id) : 'unknown-chat';
}

function actionLockKey(chat_key: string, action: BridgeAction): string {
  return `${chat_key}::${action}`;
}

function cleanupExpiredActionLocks() {
  const now = Date.now();
  for (const [key, lock] of actionLocks.entries()) {
    if (lock.expires_at <= now) actionLocks.delete(key);
  }
}

function tryAcquireActionLock(action: BridgeAction, ttl_ms: number): boolean {
  cleanupExpiredActionLocks();
  const chat_key = resolveActionChatKey();
  const key = actionLockKey(chat_key, action);
  const now = Date.now();
  const current = actionLocks.get(key);
  if (current && current.expires_at > now) return false;
  actionLocks.set(key, {
    action,
    chat_key,
    expires_at: now + Math.max(400, Math.trunc(ttl_ms)),
  });
  return true;
}

function releaseActionLock(action: BridgeAction, chat_key = resolveActionChatKey()) {
  actionLocks.delete(actionLockKey(chat_key, action));
}

function clearActionLocksForChat(chat_key: string | null | undefined) {
  const normalized = String(chat_key ?? '').trim();
  if (!normalized) return;
  for (const key of actionLocks.keys()) {
    if (key.startsWith(`${normalized}::`)) actionLocks.delete(key);
  }
}

function resolveCurrentAnchorForGate(): number | null {
  const anchor = state.anchor_message_id ?? resolveSameLayerAnchorMessageId();
  if (anchor == null || !Number.isFinite(anchor)) return null;
  return Math.trunc(anchor);
}

function isLatestViewAligned(): boolean {
  const latest = resolveSameLayerLatestAssistantMessageId();
  if (latest == null) return true;
  const anchor = resolveCurrentAnchorForGate();
  if (anchor == null) return true;
  return anchor === latest;
}

function buildNotLatestReason(prefix = '仅最新楼层可执行该操作'): string {
  const anchor = resolveCurrentAnchorForGate();
  const latest = resolveSameLayerLatestAssistantMessageId();
  if (latest == null) return prefix;
  if (anchor == null) return `${prefix}（最新#${latest}）`;
  return `${prefix}（当前锚点#${anchor}，最新#${latest}）`;
}

function bumpPayloadTransaction(reason: string) {
  state.tx_version += 1;
  const chat_key = resolveActionChatKey();
  state.tx_id = `${chat_key}:v${state.tx_version}:${reason}`;
}

function isAssistantMessage(message_id: number): boolean {
  try {
    const ctx = readContext();
    const msg = Array.isArray(ctx?.chat) ? ctx.chat[message_id] : null;
    if (!msg) return false;
    return msg.is_user !== true && msg.is_system !== true;
  } catch {
    return false;
  }
}

function ensureHideStyle() {
  if ($(`#${STYLE_ID}`).length > 0) return;
  $('<style>')
    .attr('id', STYLE_ID)
    .text(`#chat > .mes.${HIDDEN_CLASS},#chat .mes.${HIDDEN_CLASS}{display:none !important;}`)
    .appendTo('head');
}

function listChatMessageElements(): JQuery<HTMLElement> {
  const $direct = $('#chat > .mes[mesid]') as JQuery<HTMLElement>;
  if ($direct.length > 0) return $direct;
  return $('#chat .mes[mesid]') as JQuery<HTMLElement>;
}

function findChatMessageElement(message_id: number): JQuery<HTMLElement> {
  let $mes = $(`#chat > .mes[mesid='${message_id}']`) as JQuery<HTMLElement>;
  if ($mes.length > 0) return $mes;
  $mes = $(`#chat .mes[mesid='${message_id}']`) as JQuery<HTMLElement>;
  return $mes;
}

function setMessageHidden(message_id: number, hidden: boolean) {
  const $mes = findChatMessageElement(message_id);
  if ($mes.length === 0) return;
  $mes.toggleClass(HIDDEN_CLASS, hidden);
}

function applyHidePolicy() {
  const anchor_id = state.anchor_message_id;
  listChatMessageElements().each((_idx, el) => {
    const message_id = Number($(el).attr('mesid'));
    if (!Number.isFinite(message_id)) return;
    if (anchor_id == null) {
      setMessageHidden(message_id, false);
      return;
    }
    setMessageHidden(message_id, message_id !== anchor_id);
  });
}

function scrollAnchorIntoView(align: 'start' | 'end' | 'nearest' = 'end') {
  const anchor_id = state.anchor_message_id;
  if (anchor_id == null) return;
  const anchor = findChatMessageElement(anchor_id).get(0);
  if (!anchor) return;

  try {
    anchor.scrollIntoView({ block: align, inline: 'nearest', behavior: 'auto' });
  } catch {
    // ignore
  }
}

function scheduleAnchorScroll(force = false, align: 'start' | 'end' | 'nearest' = 'end') {
  const now = Date.now();
  if (!force && now - last_stream_scroll_at < STREAM_SCROLL_THROTTLE_MS) return;
  last_stream_scroll_at = now;

  requestAnimationFrame(() => scrollAnchorIntoView(align));
  setTimeout(() => scrollAnchorIntoView(align), 0);
  setTimeout(() => scrollAnchorIntoView(align), 80);
}

function readMessageText(message_id: number): string {
  try {
    const msg = getChatMessages(message_id)?.[0];
    if (Array.isArray((msg as any)?.swipes) && (msg as any).swipes.length > 0) {
      const swipeId = Number((msg as any)?.swipe_id);
      if (Number.isFinite(swipeId) && swipeId >= 0 && swipeId < (msg as any).swipes.length) {
        return String((msg as any).swipes[swipeId] ?? '');
      }
      return String((msg as any).swipes[(msg as any).swipes.length - 1] ?? '');
    }
    return String((msg as any)?.message ?? '');
  } catch {
    return '';
  }
}

function buildPayload(
  partial: Partial<BridgeState> = {},
  meta: Pick<SameLayerPayload, 'phase' | 'source'> = {},
): SameLayerPayload {
  const next_tx_seq = state.tx_seq + 1;
  state.tx_seq = next_tx_seq;
  return {
    anchor_message_id: partial.anchor_message_id ?? state.anchor_message_id,
    message_id: partial.message_id ?? state.message_id,
    raw: partial.raw ?? state.raw,
    during_streaming: partial.during_streaming ?? state.during_streaming,
    chat_id: partial.chat_id ?? state.chat_id,
    tx_id: partial.tx_id ?? state.tx_id,
    tx_seq: partial.tx_seq ?? next_tx_seq,
    phase: meta.phase,
    source: meta.source,
  };
}

function emitEvent(eventName: string, payload: unknown) {
  if (typeof eventEmit !== 'function') return;
  void eventEmit(eventName as any, payload);
}

function emitSnapshotLegacyAndShow(
  legacyEventName: string,
  phase: NonNullable<SameLayerPayload['phase']>,
  partial: Partial<BridgeState> = {},
) {
  const payload = buildPayload(partial, { phase, source: 'bridge' });
  emitEvent(legacyEventName, payload);
  emitEvent(SAMELAYER_EVENTS.SHOW, payload);
}

function emitSyncDataSnapshot() {
  const payload = buildPayload({}, { phase: 'sync', source: 'bridge' });
  emitEvent(SAMELAYER_EVENTS.SYNC_DATA, payload);
  emitEvent(SAMELAYER_EVENTS.SYNC_RESPONSE, payload); // 兼容旧前台
  emitEvent(SAMELAYER_EVENTS.SHOW, payload);
}

function resolveTriggerSlash(): ((cmd: string) => any) | null {
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
  return null;
}

function normalizeChatText(input: string): string {
  const raw = String(input ?? '');
  return raw
    .replace(/\r?\n+/g, ' ')
    .trim()
    .replaceAll('|', '｜');
}

function handleSendRequest(payload: { text?: string; await_trigger?: boolean; source?: string } | null | undefined) {
  const sentText = normalizeChatText(String(payload?.text ?? ''));
  const awaitTrigger = payload?.await_trigger !== false;
  if (!sentText) {
    emitEvent(SAMELAYER_EVENTS.SEND_RESULT, { ok: false, reason: '空文本', text: '', source: 'bridge' } as any);
    return;
  }

  if (!isLatestViewAligned()) {
    emitEvent(SAMELAYER_EVENTS.SEND_RESULT, {
      ok: false,
      reason: buildNotLatestReason('回看楼层不可发送'),
      text: sentText,
      source: 'bridge',
    } as any);
    return;
  }

  if (!tryAcquireActionLock('send', ACTION_LOCK_TTL_MS.SEND)) {
    emitEvent(SAMELAYER_EVENTS.SEND_RESULT, {
      ok: false,
      reason: '发送过于频繁，请稍后重试',
      text: sentText,
      source: 'bridge',
    } as any);
    return;
  }

  const slash = resolveTriggerSlash();
  if (!slash) {
    releaseActionLock('send');
    emitEvent(SAMELAYER_EVENTS.SEND_RESULT, {
      ok: false,
      reason: 'triggerSlash 不可用',
      text: sentText,
      source: 'bridge',
    } as any);
    return;
  }

  const cmd = awaitTrigger ? `/send ${sentText} | /trigger await=true` : `/send ${sentText}`;
  try {
    slash(cmd);
    emitEvent(SAMELAYER_EVENTS.SEND_RESULT, { ok: true, reason: '', text: sentText, source: 'bridge' } as any);
  } catch (err) {
    releaseActionLock('send');
    emitEvent(SAMELAYER_EVENTS.SEND_RESULT, {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      text: sentText,
      source: 'bridge',
    } as any);
  }
}

function onHostEventSource(eventName: string, listener: (...args: any[]) => void): StopHandle {
  const source = readHostEventSource();
  if (!source || typeof source.on !== 'function') return null;

  try {
    source.on(eventName, listener);
  } catch {
    return null;
  }

  return {
    stop: () => {
      try {
        if (typeof source.off === 'function') {
          source.off(eventName, listener);
          return;
        }
        if (typeof source.removeListener === 'function') {
          source.removeListener(eventName, listener);
        }
      } catch {
        // ignore
      }
    },
  };
}

function emitPluginEvent(eventName: string, payload: unknown): boolean {
  const source = readHostEventSource();
  if (source && typeof source.emit === 'function') {
    try {
      source.emit(eventName, payload);
      return true;
    } catch {
      // ignore
    }
  }

  if (typeof eventEmit === 'function') {
    try {
      void eventEmit(eventName as any, payload as any);
      return true;
    } catch {
      // ignore
    }
  }

  return false;
}

function refreshAnchorAndChatId() {
  const prev_chat_id = state.chat_id;
  state.chat_id = readChatId();
  if (prev_chat_id && state.chat_id !== prev_chat_id) {
    clearActionLocksForChat(prev_chat_id);
  }
  state.anchor_message_id = resolveSameLayerAnchorMessageId();
  syncAnchorToLatestAssistant();
}

function refreshSnapshotFromHistory() {
  const latest_assistant_id = resolveSameLayerLatestAssistantMessageId();
  const current_message_id = latest_assistant_id ?? state.anchor_message_id;
  state.message_id = current_message_id;
  state.raw = current_message_id == null ? '' : readMessageText(current_message_id);
  state.during_streaming = false;
}

function resetBridge(reason: string) {
  releaseActionLock('send');
  releaseActionLock('chatu8_generate');
  refreshAnchorAndChatId();
  refreshSnapshotFromHistory();
  bumpPayloadTransaction(`reset:${reason}`);
  applyHidePolicy();
  scheduleAnchorScroll(true, 'end');
  emitSnapshotLegacyAndShow(SAMELAYER_EVENTS.RESET, 'reset', { raw: state.raw });
  console.debug('[eden/samelayer] reset', { reason, ...state });
}

function resolveCurrentStreamingMessageId(): number | null {
  const raw = $('#chat > .mes.last_mes').attr('mesid') ?? $('#chat .mes.last_mes').last().attr('mesid') ?? null;
  const message_id = Number(raw);
  return Number.isFinite(message_id) ? message_id : null;
}

function handleStreamToken(message: string) {
  const message_id = resolveCurrentStreamingMessageId();
  if (message_id == null || !isAssistantMessage(message_id)) return;
  const is_new_message = state.message_id !== message_id;
  if (is_new_message) bumpPayloadTransaction(`stream:${message_id}`);

  syncAnchorToLatestAssistant();
  followAnchorToMessage(message_id);
  if (state.anchor_message_id == null) refreshAnchorAndChatId();
  // 首轮生成时可能还没有可解析锚点，兜底为当前流式助手楼层，避免隐藏策略失效。
  if (state.anchor_message_id == null) state.anchor_message_id = resolveSameLayerAnchorMessageId() ?? message_id;
  if (state.anchor_message_id != null && message_id !== state.anchor_message_id) {
    setMessageHidden(message_id, true);
  }

  state.message_id = message_id;
  state.raw = String(message ?? '');
  state.during_streaming = true;
  applyHidePolicy();
  scheduleAnchorScroll(false, 'end');
  emitSnapshotLegacyAndShow(SAMELAYER_EVENTS.STREAM, 'stream');
}

function handleMessageReceived(message_id: number) {
  if (!Number.isFinite(message_id) || !isAssistantMessage(message_id)) return;
  const is_new_message = state.message_id !== message_id;
  if (is_new_message) bumpPayloadTransaction(`final:${message_id}`);
  releaseActionLock('send');

  syncAnchorToLatestAssistant();
  followAnchorToMessage(message_id);
  if (state.anchor_message_id == null) refreshAnchorAndChatId();
  if (state.anchor_message_id == null) state.anchor_message_id = resolveSameLayerAnchorMessageId() ?? message_id;
  if (state.anchor_message_id != null && message_id !== state.anchor_message_id) {
    setMessageHidden(message_id, true);
  }

  state.message_id = message_id;
  state.raw = readMessageText(message_id);
  state.during_streaming = false;
  applyHidePolicy();
  scheduleAnchorScroll(true, 'end');
  emitSnapshotLegacyAndShow(SAMELAYER_EVENTS.FINAL, 'final');
}

function handleMessageUpdated(message_id: number) {
  if (!Number.isFinite(message_id) || !isAssistantMessage(message_id)) return;
  releaseActionLock('send');
  syncAnchorToLatestAssistant();
  followAnchorToMessage(message_id);
  if (message_id !== state.message_id) return;
  state.raw = readMessageText(message_id);
  applyHidePolicy();
  scheduleAnchorScroll(false, 'end');
  emitSnapshotLegacyAndShow(SAMELAYER_EVENTS.FINAL, 'final');
}

function handleMessageSwiped(message_id: number) {
  if (!Number.isFinite(message_id) || !isAssistantMessage(message_id)) return;
  bumpPayloadTransaction(`swipe:${message_id}`);
  releaseActionLock('send');
  syncAnchorToLatestAssistant();
  followAnchorToMessage(message_id);
  if (state.anchor_message_id == null) refreshAnchorAndChatId();

  state.message_id = message_id;
  state.raw = readMessageText(message_id);
  state.during_streaming = false;

  applyHidePolicy();
  scheduleAnchorScroll(true, 'end');
  emitSnapshotLegacyAndShow(SAMELAYER_EVENTS.FINAL, 'final');
}

function onAnyEvent(eventName: string, listener: (...args: any[]) => void): StopHandle {
  if (typeof eventOn !== 'function') return null;
  try {
    return eventOn(eventName as any, listener as any);
  } catch {
    return null;
  }
}

function onPluginEvent(eventName: string, listener: (...args: any[]) => void): StopHandle {
  const hostStop = onHostEventSource(eventName, listener);
  if (hostStop) return hostStop;
  return onAnyEvent(eventName, listener);
}

function normalizePromptForCacheCompare(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const compact = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const bodyMatch = compact.match(/^[^#<>\n]+###([\s\S]*?)###$/);
  const source = (bodyMatch?.[1] ?? compact).replace(/\$\{[\s\S]*?\}\$/g, ' ');
  return source
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function handleChatu8CacheQuery(
  payload: { messageId?: number; queryId?: string; prompts?: unknown[] } | null | undefined,
) {
  const queryId = String(payload?.queryId ?? '').trim();
  if (!queryId) return;
  const messageId = payload?.messageId ?? null;
  const allowPromptNormSet = new Set(
    (Array.isArray(payload?.prompts) ? payload?.prompts : [])
      .map(item => normalizePromptForCacheCompare(item))
      .filter(Boolean),
  );

  try {
    const ctx = readContext();
    if (!ctx) {
      emitEvent(SAMELAYER_EVENTS.CHATU8_CACHE_RESPONSE, {
        queryId,
        messageId,
        images: {},
        source: 'bridge',
        ok: false,
        reason: 'no context',
      });
      return;
    }

    const extSettings = ctx.extensionSettings?.['st-chatu8'];
    const chatMeta = ctx.chatMetadata?.['st-chatu8'];
    const images: Record<string, Array<{ src: string; alt: string }>> = {};
    const parsedEntries: Array<{ prompt: string; promptNorm: string; src: string; entryMsgId: number | null }> = [];

    // 从 chatMetadata 中提取图片缓存（插件通常将生成结果存储在此）
    if (chatMeta && typeof chatMeta === 'object') {
      const entries = (chatMeta as any).imageCache ?? (chatMeta as any).images ?? chatMeta;
      if (entries && typeof entries === 'object') {
        for (const [key, value] of Object.entries(entries)) {
          if (!value) continue;
          const rawEntryMsgId = (value as any)?.messageId ?? (value as any)?.message_id;
          const parsedEntryMsgId = Number(rawEntryMsgId);
          const entryMsgId = Number.isFinite(parsedEntryMsgId) ? Math.trunc(parsedEntryMsgId) : null;

          const prompt = String((value as any)?.prompt ?? (value as any)?.tag ?? key ?? '').trim();
          if (!prompt) continue;
          const promptNorm = normalizePromptForCacheCompare(prompt);
          if (!promptNorm) continue;

          const imgData = (value as any)?.imageData ?? (value as any)?.image ?? (value as any)?.src;
          if (!imgData) continue;

          const src = String(imgData).trim();
          if (!src) continue;
          parsedEntries.push({ prompt, promptNorm, src, entryMsgId });
        }
      }
    }

    let selectedEntries = parsedEntries;
    if (allowPromptNormSet.size > 0) {
      const promptMatched = parsedEntries.filter(item => allowPromptNormSet.has(item.promptNorm));
      if (promptMatched.length > 0) {
        selectedEntries = promptMatched;
      } else if (messageId != null) {
        selectedEntries = parsedEntries.filter(item => item.entryMsgId === messageId || item.entryMsgId == null);
      }
    } else if (messageId != null) {
      selectedEntries = parsedEntries.filter(item => item.entryMsgId === messageId || item.entryMsgId == null);
    }

    for (const item of selectedEntries) {
      if (!images[item.prompt]) images[item.prompt] = [];
      images[item.prompt].push({ src: item.src, alt: '缓存图片' });
    }

    emitEvent(SAMELAYER_EVENTS.CHATU8_CACHE_RESPONSE, {
      queryId,
      messageId,
      images,
      source: 'bridge',
      ok: true,
      meta: {
        allowPromptCount: allowPromptNormSet.size,
        totalEntries: parsedEntries.length,
        selectedEntries: selectedEntries.length,
        hasExtSettings: !!extSettings,
      },
    });
  } catch (err) {
    emitEvent(SAMELAYER_EVENTS.CHATU8_CACHE_RESPONSE, {
      queryId,
      messageId,
      images: {},
      source: 'bridge',
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

$(() => {
  ensureHideStyle();
  resetBridge('init');

  const stops: StopHandle[] = [];
  stops.push(onAnyEvent(tavern_events.STREAM_TOKEN_RECEIVED, handleStreamToken));
  stops.push(onAnyEvent(tavern_events.MESSAGE_RECEIVED, (message_id: number) => handleMessageReceived(message_id)));
  stops.push(onAnyEvent(tavern_events.MESSAGE_UPDATED, (message_id: number) => handleMessageUpdated(message_id)));
  stops.push(onAnyEvent(tavern_events.MESSAGE_SWIPED, (message_id: number) => handleMessageSwiped(message_id)));
  stops.push(
    onAnyEvent(tavern_events.CHARACTER_MESSAGE_RENDERED, () => {
      applyHidePolicy();
      scheduleAnchorScroll(true, 'end');
    }),
  );
  stops.push(
    onAnyEvent(tavern_events.USER_MESSAGE_RENDERED, () => {
      applyHidePolicy();
      scheduleAnchorScroll(true, 'end');
    }),
  );
  stops.push(
    onAnyEvent(tavern_events.MESSAGE_SENT, () => {
      releaseActionLock('send');
      applyHidePolicy();
      scheduleAnchorScroll(true, 'end');
    }),
  );
  stops.push(onAnyEvent(tavern_events.CHAT_CHANGED, () => resetBridge('chat_changed')));
  stops.push(onAnyEvent(SAMELAYER_EVENTS.SYNC_REQUEST, () => emitSyncDataSnapshot()));
  stops.push(onAnyEvent(SAMELAYER_EVENTS.REQUIRE_DATA, () => emitSyncDataSnapshot()));
  stops.push(
    onAnyEvent(SAMELAYER_EVENTS.CHATU8_PROXY_PING, payload => {
      const base = payload && typeof payload === 'object' ? (payload as Record<string, any>) : {};
      emitEvent(SAMELAYER_EVENTS.CHATU8_PROXY_PONG, {
        ...base,
        source: 'bridge',
      });
    }),
  );
  stops.push(
    onAnyEvent(SAMELAYER_EVENTS.CHATU8_GENERATE_REQUEST, payload => {
      const data = payload && typeof payload === 'object' ? (payload as Record<string, any>) : {};
      const requestId = String(data.id ?? '').trim();

      if (!requestId) {
        emitEvent(SAMELAYER_EVENTS.CHATU8_GENERATE_RESPONSE, {
          id: '',
          success: false,
          error: '缺少请求ID',
          source: 'bridge',
        });
        return;
      }

      if (!isLatestViewAligned()) {
        emitEvent(SAMELAYER_EVENTS.CHATU8_GENERATE_RESPONSE, {
          id: requestId,
          success: false,
          error: buildNotLatestReason('回看楼层不可触发生图'),
          source: 'bridge',
        });
        return;
      }

      if (!tryAcquireActionLock('chatu8_generate', ACTION_LOCK_TTL_MS.CHATU8_GENERATE)) {
        emitEvent(SAMELAYER_EVENTS.CHATU8_GENERATE_RESPONSE, {
          id: requestId,
          success: false,
          error: '已有生图任务进行中，请稍后重试',
          source: 'bridge',
        });
        return;
      }

      const ok = emitPluginEvent(CHATU8_EVENT_TYPE.GENERATE_IMAGE_REQUEST, payload);
      if (!ok) {
        releaseActionLock('chatu8_generate');
        emitEvent(SAMELAYER_EVENTS.CHATU8_GENERATE_RESPONSE, {
          id: requestId,
          success: false,
          error: '生图插件事件通道不可用',
          source: 'bridge',
        });
      }
    }),
  );
  stops.push(
    onAnyEvent(SAMELAYER_EVENTS.CHATU8_LLM_PROMPT_REQUEST, payload => {
      void emitPluginEvent(CHATU8_EVENT_TYPE.LLM_PROMPT_REQUEST, payload);
    }),
  );
  stops.push(
    onPluginEvent(CHATU8_EVENT_TYPE.GENERATE_IMAGE_RESPONSE, payload => {
      releaseActionLock('chatu8_generate');
      emitEvent(SAMELAYER_EVENTS.CHATU8_GENERATE_RESPONSE, payload);
    }),
  );
  stops.push(
    onPluginEvent(CHATU8_EVENT_TYPE.LLM_PROMPT_RESPONSE, payload => {
      emitEvent(SAMELAYER_EVENTS.CHATU8_LLM_PROMPT_RESPONSE, payload);
    }),
  );
  stops.push(
    onAnyEvent(
      SAMELAYER_EVENTS.CHATU8_CACHE_QUERY,
      (payload: { messageId?: number; queryId?: string; prompts?: unknown[] } | null) => {
        handleChatu8CacheQuery(payload);
      },
    ),
  );
  stops.push(
    onAnyEvent(SAMELAYER_EVENTS.SEND_REQUEST, (payload: { text?: string; await_trigger?: boolean; source?: string }) =>
      handleSendRequest(payload),
    ),
  );

  $(window).on('pagehide', () => {
    stops.forEach(s => s?.stop?.());
    actionLocks.clear();
    $(`#${STYLE_ID}`).remove();
    listChatMessageElements().removeClass(HIDDEN_CLASS);
    if (typeof eventClearAll === 'function') eventClearAll();
  });
});

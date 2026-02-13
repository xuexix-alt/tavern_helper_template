import { SAMELAYER_EVENTS, type SameLayerPayload } from '../../samelayer_events';
import { resolveSameLayerAnchorMessageId, resolveSameLayerLatestAssistantMessageId } from '../../samelayer_anchor';

const HIDDEN_CLASS = 'eden-samelayer-hidden';
const STYLE_ID = 'eden-samelayer-style';
const STREAM_SCROLL_THROTTLE_MS = 120;

type StopHandle = { stop?: () => void } | null;

type BridgeState = {
  anchor_message_id: number | null;
  message_id: number | null;
  raw: string;
  during_streaming: boolean;
  chat_id: string | null;
};

const state: BridgeState = {
  anchor_message_id: null,
  message_id: null,
  raw: '',
  during_streaming: false,
  chat_id: null,
};
let last_stream_scroll_at = 0;

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
  return {
    anchor_message_id: partial.anchor_message_id ?? state.anchor_message_id,
    message_id: partial.message_id ?? state.message_id,
    raw: partial.raw ?? state.raw,
    during_streaming: partial.during_streaming ?? state.during_streaming,
    chat_id: partial.chat_id ?? state.chat_id,
    phase: meta.phase,
    source: meta.source,
  };
}

function emitEvent(eventName: string, payload: SameLayerPayload) {
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
  return raw.replace(/\r?\n+/g, ' ').trim().replaceAll('|', '｜');
}

function handleSendRequest(payload: { text?: string; await_trigger?: boolean; source?: string } | null | undefined) {
  const sentText = normalizeChatText(String(payload?.text ?? ''));
  const awaitTrigger = payload?.await_trigger !== false;
  if (!sentText) {
    emitEvent(SAMELAYER_EVENTS.SEND_RESULT, { ok: false, reason: '空文本', text: '', source: 'bridge' } as any);
    return;
  }

  const slash = resolveTriggerSlash();
  if (!slash) {
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
    emitEvent(SAMELAYER_EVENTS.SEND_RESULT, {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      text: sentText,
      source: 'bridge',
    } as any);
  }
}

function refreshAnchorAndChatId() {
  state.chat_id = readChatId();
  state.anchor_message_id = resolveSameLayerAnchorMessageId();
}

function refreshSnapshotFromHistory() {
  const latest_assistant_id = resolveSameLayerLatestAssistantMessageId();
  const current_message_id = latest_assistant_id ?? state.anchor_message_id;
  state.message_id = current_message_id;
  state.raw = current_message_id == null ? '' : readMessageText(current_message_id);
  state.during_streaming = false;
}

function resetBridge(reason: string) {
  refreshAnchorAndChatId();
  refreshSnapshotFromHistory();
  applyHidePolicy();
  scheduleAnchorScroll(true, 'end');
  emitSnapshotLegacyAndShow(SAMELAYER_EVENTS.RESET, 'reset', { raw: state.raw });
  console.debug('[eden/samelayer] reset', { reason, ...state });
}

function resolveCurrentStreamingMessageId(): number | null {
  const raw =
    $('#chat > .mes.last_mes').attr('mesid') ??
    $('#chat .mes.last_mes').last().attr('mesid') ??
    null;
  const message_id = Number(raw);
  return Number.isFinite(message_id) ? message_id : null;
}

function handleStreamToken(message: string) {
  const message_id = resolveCurrentStreamingMessageId();
  if (message_id == null || !isAssistantMessage(message_id)) return;

  if (state.anchor_message_id == null) refreshAnchorAndChatId();
  // 首轮生成时可能还没有可解析锚点，兜底为当前流式助手楼层，避免隐藏策略失效。
  if (state.anchor_message_id == null) state.anchor_message_id = message_id;
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

  if (state.anchor_message_id == null) refreshAnchorAndChatId();
  if (state.anchor_message_id == null) state.anchor_message_id = message_id;
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
  if (message_id !== state.message_id) return;
  state.raw = readMessageText(message_id);
  applyHidePolicy();
  scheduleAnchorScroll(false, 'end');
  emitSnapshotLegacyAndShow(SAMELAYER_EVENTS.FINAL, 'final');
}

function handleMessageSwiped(message_id: number) {
  if (!Number.isFinite(message_id) || !isAssistantMessage(message_id)) return;
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
      applyHidePolicy();
      scheduleAnchorScroll(true, 'end');
    }),
  );
  stops.push(onAnyEvent(tavern_events.CHAT_CHANGED, () => resetBridge('chat_changed')));
  stops.push(onAnyEvent(SAMELAYER_EVENTS.SYNC_REQUEST, () => emitSyncDataSnapshot()));
  stops.push(onAnyEvent(SAMELAYER_EVENTS.REQUIRE_DATA, () => emitSyncDataSnapshot()));
  stops.push(
    onAnyEvent(SAMELAYER_EVENTS.SEND_REQUEST, (payload: { text?: string; await_trigger?: boolean; source?: string }) =>
      handleSendRequest(payload),
    ),
  );

  $(window).on('pagehide', () => {
    stops.forEach(s => s?.stop?.());
    $(`#${STYLE_ID}`).remove();
    listChatMessageElements().removeClass(HIDDEN_CLASS);
    if (typeof eventClearAll === 'function') eventClearAll();
  });
});

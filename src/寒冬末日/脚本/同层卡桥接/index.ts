import {
  SAMELAYER_EVENTS,
  type SameLayerCommandName,
  type SameLayerCommandRequestPayload,
  type SameLayerCommandResponsePayload,
  type SameLayerPayload,
} from '../../samelayer_events';
import { resolveSameLayerAnchorMessageId, resolveSameLayerLatestAssistantMessageId } from '../../samelayer_anchor';

const ANCHOR_STORAGE_KEY = 'eden:samelayer:anchor_message_id';
const STREAM_SCROLL_THROTTLE_MS = 120;
const HIDE_POLICY_DEBOUNCE_MS = 120;
const CHATU8_EVENT_TYPE = {
  GENERATE_IMAGE_REQUEST: 'generate-image-request',
  GENERATE_IMAGE_RESPONSE: 'generate-image-response',
  LLM_PROMPT_REQUEST: 'ch-llm-image-gen-get-prompt-request',
  LLM_PROMPT_RESPONSE: 'ch-llm-image-gen-get-prompt-response',
} as const;
const ENABLE_LATEST_ACTION_GATE = false;
const ENABLE_ANCHOR_SCROLL_SYNC = false;
const ACTION_LOCK_TTL_MS = {
  SEND: 2500,
  CHATU8_GENERATE: 45000,
} as const;
const COMMAND_TIMEOUT_MS = {
  CHATU8_GENERATE: 45000,
  CHATU8_LLM_PROMPT: 45000,
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
let hide_policy_timer = 0;
let hide_policy_running = false;
let hide_policy_rerun = false;

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
  // 鍚屽眰妗ユ帴榛樿鍥哄畾鍦ㄩ敋鐐规ゼ灞傦紙閫氬父鏄?0 妤硷級锛屼笉闅忔渶鏂版秷鎭紓绉汇€?  syncAnchorToLatestAssistant();
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

function buildNotLatestReason(prefix = 'action allowed on latest floor only'): string {
  const anchor = resolveCurrentAnchorForGate();
  const latest = resolveSameLayerLatestAssistantMessageId();
  if (latest == null) return prefix;
  if (anchor == null) return `${prefix} (latest #${latest})`;
  return `${prefix} (anchor #${anchor}, latest #${latest})`;
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

function findChatMessageElement(message_id: number): JQuery<HTMLElement> {
  let $mes = $(`#chat > .mes[mesid='${message_id}']`) as JQuery<HTMLElement>;
  if ($mes.length > 0) return $mes;
  $mes = $(`#chat .mes[mesid='${message_id}']`) as JQuery<HTMLElement>;
  return $mes;
}

function listAssistantMessageStates(): Array<{ message_id: number; is_hidden: boolean }> {
  try {
    const last_message_id = Number(getLastMessageId?.());
    if (!Number.isFinite(last_message_id) || last_message_id < 0) return [];
    const list = getChatMessages(`0-${Math.trunc(last_message_id)}`, {
      role: 'assistant',
      hide_state: 'all',
    }) as Array<{ message_id?: number; is_hidden?: boolean }>;
    return list
      .map(item => ({
        message_id: Number(item?.message_id),
        is_hidden: item?.is_hidden === true,
      }))
      .filter(item => Number.isFinite(item.message_id));
  } catch {
    return [];
  }
}

function buildHidePatchByAnchor(anchor_message_id: number | null): Array<{ message_id: number; is_hidden: boolean }> {
  const assistant_messages = listAssistantMessageStates();
  if (assistant_messages.length === 0) return [];

  const has_anchor = anchor_message_id != null && Number.isFinite(anchor_message_id);
  const anchor_id = has_anchor ? Math.trunc(anchor_message_id as number) : null;
  return assistant_messages
    .map(item => {
      const should_hide = anchor_id != null ? item.message_id !== anchor_id : false;
      if (item.is_hidden === should_hide) return null;
      return { message_id: item.message_id, is_hidden: should_hide };
    })
    .filter(Boolean) as Array<{ message_id: number; is_hidden: boolean }>;
}

async function applyDataHidePolicy(reason: string) {
  if (hide_policy_running) {
    hide_policy_rerun = true;
    return;
  }

  hide_policy_running = true;
  try {
    do {
      hide_policy_rerun = false;
      const anchor_id = resolveCurrentAnchorForGate();
      const patch = buildHidePatchByAnchor(anchor_id);
      if (patch.length === 0) continue;
      await setChatMessages(patch, { refresh: 'affected' });
    } while (hide_policy_rerun);
  } catch (error) {
    console.warn('[eden/samelayer] applyDataHidePolicy failed', {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    hide_policy_running = false;
  }
}

function queueDataHidePolicy(reason: string) {
  if (hide_policy_timer) window.clearTimeout(hide_policy_timer);
  hide_policy_timer = window.setTimeout(() => {
    hide_policy_timer = 0;
    void applyDataHidePolicy(reason);
  }, HIDE_POLICY_DEBOUNCE_MS);
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
  if (!ENABLE_ANCHOR_SCROLL_SYNC) return;
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

function emitShowSnapshot(phase: NonNullable<SameLayerPayload['phase']>, partial: Partial<BridgeState> = {}) {
  const payload = buildPayload(partial, { phase, source: 'bridge' });
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
    .replaceAll('|', '/');
}

function executeSendRequest(
  payload: { text?: string; await_trigger?: boolean; source?: string } | null | undefined,
): { ok: boolean; reason: string; text: string; source: 'bridge' } {
  const sentText = normalizeChatText(String(payload?.text ?? ''));
  const awaitTrigger = payload?.await_trigger !== false;
  if (!sentText) {
    return { ok: false, reason: 'empty text', text: '', source: 'bridge' };
  }

  if (ENABLE_LATEST_ACTION_GATE && !isLatestViewAligned()) {
    return {
      ok: false,
      reason: buildNotLatestReason('not latest floor'),
      text: sentText,
      source: 'bridge',
    };
  }

  if (!tryAcquireActionLock('send', ACTION_LOCK_TTL_MS.SEND)) {
    return {
      ok: false,
      reason: 'send is locked, retry later',
      text: sentText,
      source: 'bridge',
    };
  }

  const slash = resolveTriggerSlash();
  if (!slash) {
    releaseActionLock('send');
    return {
      ok: false,
      reason: 'triggerSlash unavailable',
      text: sentText,
      source: 'bridge',
    };
  }

  const cmd = awaitTrigger ? `/send ${sentText} | /trigger await=true` : `/send ${sentText}`;
  try {
    slash(cmd);
    return { ok: true, reason: '', text: sentText, source: 'bridge' };
  } catch (err) {
    releaseActionLock('send');
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      text: sentText,
      source: 'bridge',
    };
  }
}

function emitCommandResponse(response: SameLayerCommandResponsePayload) {
  emitEvent(SAMELAYER_EVENTS.COMMAND_RESPONSE, response);
}

function resolveSnapshotPayload(): SameLayerPayload {
  refreshAnchorAndChatId();
  refreshSnapshotFromHistory();
  return buildPayload({}, { phase: 'sync', source: 'bridge' });
}

function createBridgeRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeOptionalString(input: unknown): string | null {
  const value = String(input ?? '').trim();
  return value ? value : null;
}

function normalizeBooleanLike(input: unknown, fallback = false): boolean {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return input !== 0;
  if (typeof input === 'string') {
    const value = input.trim().toLowerCase();
    if (value === 'true' || value === '1' || value === 'yes' || value === 'on') return true;
    if (value === 'false' || value === '0' || value === 'no' || value === 'off') return false;
  }
  return fallback;
}

function normalizeImageDataToSrc(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `data:image/png;base64,${raw}`;
}

function waitPluginResponseById(
  eventName: string,
  requestId: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = 0;
    const stop = onPluginEvent(eventName, payload => {
      const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const id = String(data.id ?? '').trim();
      if (id !== requestId) return;
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      stop?.stop?.();
      resolve(data);
    });

    if (!stop) {
      reject(new Error(`plugin event unavailable: ${eventName}`));
      return;
    }

    timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      stop?.stop?.();
      reject(new Error(`plugin response timeout: ${eventName}`));
    }, Math.max(300, Math.trunc(timeoutMs)));
  });
}

async function requestGenerateImageViaPlugin(rawPayload: Record<string, unknown>) {
  const prompt = String(rawPayload.prompt ?? '').trim();
  if (!prompt) throw new Error('missing image prompt');

  if (ENABLE_LATEST_ACTION_GATE && !isLatestViewAligned()) {
    return {
      id: createBridgeRequestId('img-blocked'),
      success: false,
      error: buildNotLatestReason('not latest floor for image generation'),
      prompt,
      change: normalizeOptionalString(rawPayload.change),
      imageData: '',
      source: 'bridge',
    };
  }

  if (!tryAcquireActionLock('chatu8_generate', ACTION_LOCK_TTL_MS.CHATU8_GENERATE)) {
    return {
      id: createBridgeRequestId('img-locked'),
      success: false,
      error: 'generation already in progress',
      prompt,
      change: normalizeOptionalString(rawPayload.change),
      imageData: '',
      source: 'bridge',
    };
  }

  const requestId = normalizeOptionalString(rawPayload.id) ?? createBridgeRequestId('img');
  const payload = {
    id: requestId,
    prompt,
    change: normalizeOptionalString(rawPayload.change),
    width: Number.isFinite(Number(rawPayload.width)) ? Math.trunc(Number(rawPayload.width)) : null,
    height: Number.isFinite(Number(rawPayload.height)) ? Math.trunc(Number(rawPayload.height)) : null,
    source: 'bridge',
  };

  const emitted = emitPluginEvent(CHATU8_EVENT_TYPE.GENERATE_IMAGE_REQUEST, payload);
  if (!emitted) {
    releaseActionLock('chatu8_generate');
    return {
      id: requestId,
      success: false,
      error: 'image plugin channel unavailable',
      prompt,
      change: normalizeOptionalString(rawPayload.change),
      imageData: '',
      source: 'bridge',
    };
  }

  try {
    const raw = await waitPluginResponseById(
      CHATU8_EVENT_TYPE.GENERATE_IMAGE_RESPONSE,
      requestId,
      COMMAND_TIMEOUT_MS.CHATU8_GENERATE,
    );
    const imageData = normalizeImageDataToSrc(raw.imageData ?? raw.image);
    const success = normalizeBooleanLike(raw.success ?? raw.ok, !!imageData);
    return {
      id: requestId,
      success,
      error: String(raw.error ?? raw.reason ?? '').trim(),
      prompt: String(raw.prompt ?? payload.prompt ?? '').trim(),
      change: normalizeOptionalString(raw.change ?? payload.change),
      imageData,
      source: 'bridge',
    };
  } finally {
    releaseActionLock('chatu8_generate');
  }
}

async function requestLlmPromptViaPlugin(rawPayload: Record<string, unknown>) {
  const requestId = normalizeOptionalString(rawPayload.id) ?? createBridgeRequestId('llm');
  const payload = {
    ...rawPayload,
    id: requestId,
    source: 'bridge',
  };

  const emitted = emitPluginEvent(CHATU8_EVENT_TYPE.LLM_PROMPT_REQUEST, payload);
  if (!emitted) {
    return {
      id: requestId,
      success: false,
      error: 'llm prompt channel unavailable',
      prompt: '',
      source: 'bridge',
    };
  }

  const raw = await waitPluginResponseById(
    CHATU8_EVENT_TYPE.LLM_PROMPT_RESPONSE,
    requestId,
    COMMAND_TIMEOUT_MS.CHATU8_LLM_PROMPT,
  );
  const prompt = String(raw.prompt ?? raw.result ?? '').trim();
  const success = normalizeBooleanLike(raw.success ?? raw.ok, !!prompt);
  return {
    id: requestId,
    success,
    error: String(raw.error ?? raw.reason ?? '').trim(),
    prompt,
    source: 'bridge',
  };
}

function handleCommandRequest(raw: SameLayerCommandRequestPayload | null | undefined) {
  const req = raw && typeof raw === 'object' ? (raw as SameLayerCommandRequestPayload) : null;
  const id = String(req?.id ?? '').trim();
  const command = String(req?.command ?? '').trim() as SameLayerCommandName;
  const payload = req?.payload && typeof req.payload === 'object' ? req.payload : {};

  if (!id || !command) return;

  try {
    if (command === 'ping') {
      emitCommandResponse({ id, command, ok: true, data: { ready: true }, source: 'bridge' });
      return;
    }

    if (command === 'get_snapshot') {
      const snapshot = resolveSnapshotPayload();
      emitCommandResponse({ id, command, ok: true, data: { snapshot }, source: 'bridge' });
      return;
    }

    if (command === 'send_message') {
      const result = executeSendRequest({
        text: String((payload as any)?.text ?? ''),
        await_trigger: (payload as any)?.await_trigger !== false,
        source: 'command',
      });
      emitCommandResponse({
        id,
        command,
        ok: result.ok,
        data: { result },
        error: result.ok ? '' : result.reason,
        source: 'bridge',
      });
      return;
    }

    if (command === 'get_context') {
      const ctx = readContext();
      emitCommandResponse({
        id,
        command,
        ok: true,
        data: {
          context: {
            chat_id: readChatId(),
            name1: ctx?.name1 ?? null,
            name2: ctx?.name2 ?? null,
            characterName: ctx?.name2 ?? null,
            userName: ctx?.name1 ?? null,
          },
        },
        source: 'bridge',
      });
      return;
    }

    if (command === 'generate_image') {
      void requestGenerateImageViaPlugin(payload)
        .then(result => {
          const ok = result.success === true && !!result.imageData;
          emitCommandResponse({
            id,
            command,
            ok,
            data: { result },
            error: ok ? '' : result.error || 'image generation failed',
            source: 'bridge',
          });
        })
        .catch(err => {
          emitCommandResponse({
            id,
            command,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            source: 'bridge',
          });
        });
      return;
    }

    if (command === 'get_llm_prompt') {
      void requestLlmPromptViaPlugin(payload)
        .then(result => {
          const ok = result.success === true && !!String(result.prompt ?? '').trim();
          emitCommandResponse({
            id,
            command,
            ok,
            data: { result },
            error: ok ? '' : result.error || 'llm prompt request failed',
            source: 'bridge',
          });
        })
        .catch(err => {
          emitCommandResponse({
            id,
            command,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            source: 'bridge',
          });
        });
      return;
    }

    if (command === 'query_image_cache') {
      const result = queryChatu8CacheData({
        messageId: Number((payload as any)?.messageId),
        prompts: Array.isArray((payload as any)?.prompts) ? ((payload as any)?.prompts as unknown[]) : [],
      });
      emitCommandResponse({
        id,
        command,
        ok: result.ok,
        data: { result },
        error: result.ok ? '' : result.reason,
        source: 'bridge',
      });
      return;
    }

    emitCommandResponse({
      id,
      command,
      ok: false,
      error: `unsupported command: ${command}`,
      source: 'bridge',
    });
  } catch (err) {
    emitCommandResponse({
      id,
      command,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: 'bridge',
    });
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
  queueDataHidePolicy(`reset:${reason}`);
  scheduleAnchorScroll(true, 'end');
  emitShowSnapshot('reset', { raw: state.raw });
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
  // 棣栬疆鐢熸垚鏃跺彲鑳借繕娌℃湁鍙В鏋愰敋鐐癸紝鍏滃簳涓哄綋鍓嶆祦寮忓姪鎵嬫ゼ灞傦紝閬垮厤闅愯棌绛栫暐澶辨晥銆?  if (state.anchor_message_id == null) state.anchor_message_id = resolveSameLayerAnchorMessageId() ?? message_id;
  state.message_id = message_id;
  state.raw = String(message ?? '');
  state.during_streaming = true;
  queueDataHidePolicy('stream');
  scheduleAnchorScroll(false, 'end');
  emitShowSnapshot('stream');
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
  state.message_id = message_id;
  state.raw = readMessageText(message_id);
  state.during_streaming = false;
  queueDataHidePolicy('final:received');
  scheduleAnchorScroll(true, 'end');
  emitShowSnapshot('final');
}

function handleMessageUpdated(message_id: number) {
  if (!Number.isFinite(message_id) || !isAssistantMessage(message_id)) return;
  releaseActionLock('send');
  syncAnchorToLatestAssistant();
  followAnchorToMessage(message_id);
  if (message_id !== state.message_id) return;
  state.raw = readMessageText(message_id);
  queueDataHidePolicy('final:updated');
  scheduleAnchorScroll(false, 'end');
  emitShowSnapshot('final');
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

  queueDataHidePolicy('final:swiped');
  scheduleAnchorScroll(true, 'end');
  emitShowSnapshot('final');
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
  const compact = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const bodyMatch = compact.match(/^[^#<>\n]+###([\s\S]*?)###$/);
  const source = (bodyMatch?.[1] ?? compact).replace(/\$\{[\s\S]*?\}\$/g, ' ');
  return source.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function queryChatu8CacheData(payload: {
  messageId?: number | null;
  prompts?: unknown[];
}): {
  ok: boolean;
  reason: string;
  messageId: number | null;
  images: Record<string, Array<{ src: string; alt: string }>>;
  meta?: Record<string, unknown>;
} {
  const rawMessageId = Number(payload?.messageId);
  const messageId = Number.isFinite(rawMessageId) ? Math.trunc(rawMessageId) : null;
  const promptCandidates = payload && Array.isArray(payload.prompts) ? payload.prompts : [];
  const allowPromptNormSet = new Set(
    promptCandidates.map(item => normalizePromptForCacheCompare(item)).filter(Boolean),
  );

  try {
    const ctx = readContext();
    if (!ctx) {
      return {
        ok: false,
        reason: 'no context',
        messageId,
        images: {},
      };
    }

    const extSettings = ctx.extensionSettings?.['st-chatu8'];
    const chatMeta = ctx.chatMetadata?.['st-chatu8'];
    const images: Record<string, Array<{ src: string; alt: string }>> = {};
    const parsedEntries: Array<{ prompt: string; promptNorm: string; src: string; entryMsgId: number | null }> = [];

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

          const src = normalizeImageDataToSrc(imgData);
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
      images[item.prompt].push({ src: item.src, alt: 'cached image' });
    }

    return {
      ok: true,
      reason: '',
      messageId,
      images,
      meta: {
        allowPromptCount: allowPromptNormSet.size,
        totalEntries: parsedEntries.length,
        selectedEntries: selectedEntries.length,
        hasExtSettings: !!extSettings,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      messageId,
      images: {},
    };
  }
}

$(() => {
  resetBridge('init');

  const stops: StopHandle[] = [];
  stops.push(onAnyEvent(tavern_events.STREAM_TOKEN_RECEIVED, handleStreamToken));
  stops.push(onAnyEvent(tavern_events.MESSAGE_RECEIVED, (message_id: number) => handleMessageReceived(message_id)));
  stops.push(onAnyEvent(tavern_events.MESSAGE_UPDATED, (message_id: number) => handleMessageUpdated(message_id)));
  stops.push(onAnyEvent(tavern_events.MESSAGE_SWIPED, (message_id: number) => handleMessageSwiped(message_id)));
  stops.push(
    onAnyEvent(tavern_events.CHARACTER_MESSAGE_RENDERED, () => {
      queueDataHidePolicy('render:character');
      scheduleAnchorScroll(true, 'end');
    }),
  );
  stops.push(
    onAnyEvent(tavern_events.USER_MESSAGE_RENDERED, () => {
      queueDataHidePolicy('render:user');
      scheduleAnchorScroll(true, 'end');
    }),
  );
  stops.push(
    onAnyEvent(tavern_events.MESSAGE_SENT, () => {
      releaseActionLock('send');
      queueDataHidePolicy('message_sent');
      scheduleAnchorScroll(true, 'end');
    }),
  );
  stops.push(onAnyEvent(tavern_events.CHAT_CHANGED, () => resetBridge('chat_changed')));
  stops.push(
    onAnyEvent(SAMELAYER_EVENTS.COMMAND_REQUEST, (payload: SameLayerCommandRequestPayload) =>
      handleCommandRequest(payload),
    ),
  );

  $(window).on('pagehide', () => {
    stops.forEach(s => s?.stop?.());
    actionLocks.clear();
    if (hide_policy_timer) window.clearTimeout(hide_policy_timer);
    hide_policy_timer = 0;
    if (typeof eventClearAll === 'function') eventClearAll();
  });
});




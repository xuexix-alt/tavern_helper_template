import { SAMELAYER_EVENTS, type SameLayerPayload } from '../../samelayer_events';

type InjectedData = {
  options: string[];
};
type StopHandle = { stop?: () => void } | null;

const __edenInjectedDataDebugOnce = new Set<number>();

// 要过滤/隐藏的自定义标签列表（绘图思维链等）
// 注意：避免使用 `\\b`（JSON 会将 `\\b` 反转义为 backspace），使用更稳健的“空白或 >”边界。
const HIDDEN_BLOCK_TAGS = ['imgthink', 'drawprompt', 'imageprompt', 'genimage'];

function stripHiddenBlocks(raw: string): string {
  let cleaned = raw;
  for (const tag of HIDDEN_BLOCK_TAGS) {
    // 匹配 <tag ...>...</tag>（不区分大小写，非贪婪匹配）
    cleaned = cleaned.replace(new RegExp('<' + tag + '(?:\\s[^>]*)?>[\\s\\S]*?<\\/' + tag + '>', 'gi'), '');
  }
  return cleaned;
}

function parseInjectedText(raw: string): InjectedData {
  const cleaned = stripHiddenBlocks(raw);

  const optionMatch = cleaned.match(/(<option(?:\s[^>]*)?>(?![\s\S]*?<option(?:\s[^>]*)?>)[\s\S]*?(?:<\/option>|$))/i);

  const optionsRaw = optionMatch
    ? optionMatch[1]
        .replace(/^<option(?:\s[^>]*)?>/i, '')
        .replace(/<\/option>\s*$/i, '')
        .trim()
    : '';

  const options = optionsRaw
    ? optionsRaw
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean)
    : [];

  return { options };
}

function readMessageRaw(msg: unknown): string {
  const data = msg as any;
  if (Array.isArray(data?.swipes) && data.swipes.length > 0) {
    const swipeId = Number(data?.swipe_id);
    if (Number.isFinite(swipeId) && swipeId >= 0 && swipeId < data.swipes.length) {
      return String(data.swipes[swipeId] ?? '');
    }
    return String(data.swipes[data.swipes.length - 1] ?? '');
  }
  return String(data?.message ?? data?.data?.extra_text ?? data?.text ?? '');
}

function readCurrentChatId(): string | null {
  try {
    const ctx = (window as any)?.SillyTavern?.getContext?.();
    const id = ctx?.chatId ?? ctx?.getCurrentChatId?.();
    return id == null ? null : String(id);
  } catch {
    return null;
  }
}

function isPayloadForCurrentChat(payload: SameLayerPayload): boolean {
  const payloadChatId = payload?.chat_id == null ? null : String(payload.chat_id);
  if (!payloadChatId) return true;
  const currentChatId = readCurrentChatId();
  if (!currentChatId) return true;
  return payloadChatId === currentChatId;
}

function fetchFromCurrentMessage(isDebug: boolean): InjectedData | null {
  const getCurrentMessageIdSafe = (): number | null => {
    if (typeof getCurrentMessageId !== 'function') return null;
    try {
      const id = Number(getCurrentMessageId());
      return Number.isFinite(id) ? id : null;
    } catch (err) {
      if (isDebug) console.debug('[状态栏][InjectedData] getCurrentMessageId 不可用，已跳过当前楼层解析', err);
      return null;
    }
  };

  try {
    // 仅解析“当前 iframe 所在楼层”的消息文本
    const messageId = getCurrentMessageIdSafe();
    if (messageId == null) return null;

    const msg = getChatMessages(messageId)?.[0];
    const raw = readMessageRaw(msg);
    if (!raw.trim()) return null;

    const parsed = parseInjectedText(raw);

    if (isDebug && !__edenInjectedDataDebugOnce.has(messageId)) {
      __edenInjectedDataDebugOnce.add(messageId);
      console.debug('[状态栏][InjectedData] 当前楼层解析', {
        messageId,
        rawLen: raw.length,
        optionsCount: parsed.options.length,
        optionsPreview: parsed.options.slice(0, 3),
      });
    }

    if (parsed.options.length === 0) return null;
    return parsed;
  } catch (e) {
    console.error('[InjectedData] 错误:', e);
    return null;
  }
}

function getMockData(): InjectedData {
  return {
    options: ['前往尖叫声传来的方向查看', '立刻寻找房间躲避', '呼叫其他幸存者支援'],
  };
}

export function useInjectedData() {
  const options = ref<string[]>([]);
  const stopHandles: StopHandle[] = [];

  // 开发模式检测 (通过 URL 查询参数)
  const search = new URLSearchParams(window.location.search);
  const isDevMode = search.has('dev');
  const isDebug = isDevMode || search.has('debug');

  const refresh = () => {
    if (isDevMode) {
      const mockData = getMockData();
      options.value = mockData.options;
      return;
    }

    const fromMsg = fetchFromCurrentMessage(isDebug); // 同步调用
    if (fromMsg) {
      options.value = fromMsg.options;
      return;
    }

    options.value = [];
  };

  const applyBridgePayload = (payload: SameLayerPayload) => {
    if (!payload || typeof payload !== 'object') return;
    if (!isPayloadForCurrentChat(payload)) return;
    const rawText = String(payload.raw ?? '');
    const parsed = parseInjectedText(rawText);
    options.value = parsed.options;

    if (isDebug) {
      // eslint-disable-next-line no-console
      console.debug('[无正文状态栏][InjectedData] 使用同层桥接数据', {
        messageId: payload.message_id,
        phase: payload.phase,
        rawLen: rawText.length,
        optionsCount: parsed.options.length,
      });
    }
  };

  const onAnyEvent = (eventName: string, listener: (payload: SameLayerPayload) => void) => {
    if (typeof eventOn !== 'function') return;
    try {
      const stop = eventOn(eventName as any, listener as any);
      stopHandles.push(stop);
    } catch {
      // ignore
    }
  };

  const bindRefreshOnTavernEvent = (eventName: string) => {
    if (typeof eventOn !== 'function') return;
    try {
      const stop = eventOn(eventName as any, () => {
        refresh();
      });
      stopHandles.push(stop);
    } catch {
      // ignore
    }
  };

  onMounted(() => {
    refresh();

    onAnyEvent(SAMELAYER_EVENTS.SHOW, applyBridgePayload);
    onAnyEvent(SAMELAYER_EVENTS.SYNC_DATA, applyBridgePayload);

    // 兼容旧协议事件，逐步迁移期间不丢数据。
    onAnyEvent(SAMELAYER_EVENTS.STREAM, applyBridgePayload);
    onAnyEvent(SAMELAYER_EVENTS.FINAL, applyBridgePayload);
    onAnyEvent(SAMELAYER_EVENTS.RESET, applyBridgePayload);
    onAnyEvent(SAMELAYER_EVENTS.SYNC_RESPONSE, applyBridgePayload);

    if (typeof tavern_events !== 'undefined') {
      bindRefreshOnTavernEvent(tavern_events.MESSAGE_SWIPED as any);
      bindRefreshOnTavernEvent(tavern_events.MESSAGE_UPDATED as any);
      bindRefreshOnTavernEvent(tavern_events.MESSAGE_EDITED as any);
      bindRefreshOnTavernEvent(tavern_events.MESSAGE_RECEIVED as any);
      bindRefreshOnTavernEvent(tavern_events.CHARACTER_MESSAGE_RENDERED as any);
      bindRefreshOnTavernEvent(tavern_events.USER_MESSAGE_RENDERED as any);
      bindRefreshOnTavernEvent(tavern_events.CHAT_CHANGED as any);
    }

    if (typeof eventEmit === 'function') {
      void eventEmit(SAMELAYER_EVENTS.REQUIRE_DATA as any);
      void eventEmit(SAMELAYER_EVENTS.SYNC_REQUEST as any);
    }
  });

  onBeforeUnmount(() => {
    stopHandles.forEach(s => s?.stop?.());
    stopHandles.length = 0;
  });

  return { options, refresh };
}

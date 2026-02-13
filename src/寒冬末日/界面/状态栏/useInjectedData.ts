import { SAMELAYER_EVENTS, type SameLayerPayload } from '../../samelayer_events';

type InjectedData = {
  raw: string;
  options: string[];
};
type StopHandle = { stop?: () => void } | null;

const __edenInjectedDataDebugOnce = new Set<number>();
const __edenInjectedDataWarnOnce = new Set<number>();

// 要过滤/隐藏的自定义标签列表（绘图思维链等）
// 注意：避免使用 `\\b`（JSON 会将 `\\b` 反转义为 backspace），使用更稳健的“空白或 >”边界。
const HIDDEN_BLOCK_TAGS = ['imgthink', 'drawprompt', 'imageprompt', 'genimage'];
const STRUCTURED_TAGS = ['content', 'game', 'option'] as const;
const IMAGE_PROMPT_TOKEN_RE = /(?:^|[\s>])[\w\u4e00-\u9fa5-]+###([\s\S]+?)###/i;

function hasTag(raw: string, tagName: string): boolean {
  return new RegExp('<' + tagName + '(?:\\s[^>]*)?>', 'i').test(raw);
}

function hasStructuredPayload(raw: string): boolean {
  if (!raw.trim()) return false;
  if (STRUCTURED_TAGS.some(tag => hasTag(raw, tag))) return true;
  return IMAGE_PROMPT_TOKEN_RE.test(raw);
}

function isLikelyUiLoaderPayload(raw: string): boolean {
  const text = String(raw ?? '').trim();
  if (!text) return false;

  if (/\.load\s*\(\s*['"][^'"]*\/dist\/寒冬末日\/界面\/状态栏\/index\.html/i.test(text)) return true;
  if (/<script[\s\S]*?\.load\s*\(/i.test(text)) return true;
  if (/^```[\w-]*\s*[\r\n][\s\S]*?\.load\s*\([\s\S]*```$/i.test(text)) return true;
  if (/<body[\s\S]*?<script[\s\S]*?<\/script>[\s\S]*<\/body>/i.test(text)) return true;
  return false;
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

function readMessageId(msg: unknown): number | null {
  const data = msg as any;
  const id = Number(data?.message_id ?? data?.id);
  return Number.isFinite(id) ? id : null;
}

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

  return { raw, options };
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

function findNearbyStructuredRaw(currentMessageId: number, lookback = 12): { messageId: number; raw: string } | null {
  if (!Number.isFinite(currentMessageId)) return null;
  const start = Math.max(0, Math.trunc(currentMessageId) - lookback);
  const end = Math.trunc(currentMessageId);
  const list = getChatMessages(`${start}-${end}`) ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    const messageId = readMessageId(item);
    if (messageId === currentMessageId) continue;
    const raw = readMessageRaw(item);
    if (!raw.trim()) continue;
    if (isLikelyUiLoaderPayload(raw)) continue;
    if (!hasStructuredPayload(raw)) continue;
    return {
      messageId: messageId ?? currentMessageId,
      raw,
    };
  }
  return null;
}

function fetchFromCurrentMessage(isDebug: boolean): InjectedData | null {
  const getCurrentMessageIdSafe = (): number | null => {
    if (typeof getCurrentMessageId !== 'function') return null;
    try {
      const id = Number(getCurrentMessageId());
      return Number.isFinite(id) ? id : null;
    } catch (err) {
      // 同层脚本或全局脚本 iframe 环境下会抛错，这里静默返回，避免污染控制台与中断逻辑
      if (isDebug) console.debug('[状态栏][InjectedData] getCurrentMessageId 不可用，已跳过当前楼层解析', err);
      return null;
    }
  };

  try {
    // 仅解析“当前 iframe 所在楼层”的消息文本
    const messageId = getCurrentMessageIdSafe();
    if (messageId == null) return null;

    const msg = getChatMessages(messageId)?.[0];
    let raw = readMessageRaw(msg);
    let resolvedMessageId = Number.isFinite(messageId) ? messageId : readMessageId(msg) ?? -1;
    if (!raw.trim()) return null;

    if (isLikelyUiLoaderPayload(raw)) {
      const nearby = findNearbyStructuredRaw(resolvedMessageId);
      if (nearby) {
        raw = nearby.raw;
        resolvedMessageId = nearby.messageId;
      } else {
        // 当前楼层只是“加载界面占位文本”，不再把它当作剧情正文显示
        return { raw: '', options: [] };
      }
    }

    const parsed = parseInjectedText(raw);

    const rawHasContent = hasTag(raw, 'content') || hasTag(raw, 'game');
    const rawHasOption = hasTag(raw, 'option');

    if (isDebug && !__edenInjectedDataDebugOnce.has(resolvedMessageId)) {
      __edenInjectedDataDebugOnce.add(resolvedMessageId);
      console.debug('[状态栏][InjectedData] 当前楼层解析', {
        messageId: resolvedMessageId,
        rawLen: raw.length,
        rawHasContent,
        rawHasOption,
        structuredPayload: hasStructuredPayload(raw),
        optionsCount: parsed.options.length,
        optionsPreview: parsed.options.slice(0, 3),
      });
    }

    // 常见误用：只输出了 <option> 没有 <content>，正文可能为空或显示不完整
    if (!rawHasContent && rawHasOption && !__edenInjectedDataWarnOnce.has(resolvedMessageId)) {
      __edenInjectedDataWarnOnce.add(resolvedMessageId);
      console.warn(
        '[状态栏][InjectedData] 未检测到 <content>/<game>，仅检测到 <option>；建议将正文包在 <content>/<game> 以确保正文显示稳定。',
        {
          messageId: resolvedMessageId,
          optionsCount: parsed.options.length,
        },
      );
    }

    if (!hasStructuredPayload(parsed.raw) && parsed.options.length === 0) return { raw: '', options: [] };
    if (!parsed.raw.trim() && parsed.options.length === 0) return null;
    return parsed;
  } catch (e) {
    console.error('[InjectedData] 错误:', e);
    return null;
  }
}

function getMockData(): InjectedData {
  return {
    raw: `
<content>
<p>
  <strong>【当前剧情】</strong>
  你和幸存者们正在探索一栋废弃医院的二楼，寻找可用的医疗物资。空气中弥漫着消毒水和腐朽混合的怪异气味，寂静得令人不安。
</p>
<p>
  <em>"小心点，这里可能还有"那些东西"。"</em> 浅见亚美紧握着手中的消防斧，低声提醒道。
</p>
<p>
  突然，一声刺耳的尖叫从走廊尽头传来，打破了沉寂。
</p>
</content>
`,
    options: ['前往尖叫声传来的方向查看', '立刻寻找房间躲避', '呼叫其他幸存者支援'],
  };
}

export function useInjectedData() {
  const raw = ref<string>('');
  const options = ref<string[]>([]);
  const stopHandles: StopHandle[] = [];

  // 开发模式检测 (通过 URL 查询参数)
  const search = new URLSearchParams(window.location.search);
  const isDevMode = search.has('dev');
  const isDebug = isDevMode || search.has('debug');

  const refresh = () => {
    if (isDevMode) {
      const mockData = getMockData();
      raw.value = mockData.raw;
      options.value = mockData.options;
      return;
    }

    const fromMsg = fetchFromCurrentMessage(isDebug); // 同步调用
    if (fromMsg) {
      raw.value = fromMsg.raw;
      options.value = fromMsg.options;
      return;
    }

    // 无可用结构化内容时清空，避免保留上一个分支的旧正文
    raw.value = '';
    options.value = [];
  };

  const applyBridgePayload = (payload: SameLayerPayload) => {
    if (!payload || typeof payload !== 'object') return;
    if (!isPayloadForCurrentChat(payload)) return;

    const rawText = String(payload.raw ?? '');
    const parsed = parseInjectedText(rawText);
    raw.value = rawText;
    options.value = parsed.options;

    if (isDebug) {
      // eslint-disable-next-line no-console
      console.debug('[状态栏][InjectedData] 使用同层桥接数据', {
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

    // 分支切换/编辑/收消息后，强制按当前楼层重新解析，避免停留在旧分支正文。
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

  return { raw, options, refresh };
}

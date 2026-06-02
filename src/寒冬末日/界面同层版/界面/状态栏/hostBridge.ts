/**
 * 宿主桥接工具函数
 *
 * 统一提供 iframe ↔ 宿主窗口/文档 的查找、遍历能力。
 * 所有需要跨 iframe 访问宿主 DOM 的模块都应从此处导入，避免重复实现。
 */

// ─── 窗口 / 文档遍历 ───────────────────────────────────────────

/** 收集当前 iframe 可达的所有宿主 Window（含自身） */
export function listReachableHostWindows(): Array<Window & typeof globalThis> {
  const windows: Array<Window & typeof globalThis> = [];
  const seen = new Set<Window>();
  const push = (candidate: Window | null | undefined) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    windows.push(candidate as Window & typeof globalThis);
  };

  push(window);
  try {
    push(window.parent);
  } catch {
    /* cross-origin */
  }
  try {
    push(window.top);
  } catch {
    /* cross-origin */
  }

  return windows;
}

/** 收集当前 iframe 可达的所有宿主 Document（含自身） */
export function collectReachableHostDocuments(): Document[] {
  const docs: Document[] = [];
  const push = (doc: Document | null | undefined) => {
    if (!doc || docs.includes(doc)) return;
    docs.push(doc);
  };

  push(document);
  try {
    push(window.parent?.document);
  } catch {
    /* cross-origin */
  }
  try {
    push(window.top?.document);
  } catch {
    /* cross-origin */
  }

  return docs;
}

/** 收集宿主 Document（不含当前 iframe 自身的 document） */
export function collectHostOnlyDocuments(): Document[] {
  return collectReachableHostDocuments().filter(doc => doc !== document);
}

// ─── SillyTavern 上下文 ────────────────────────────────────────

/** 从可达窗口中读取 SillyTavern.getContext() */
export function readHostContext(): any {
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const ctx = (hostWindow as any)?.SillyTavern?.getContext?.();
      if (ctx) return ctx;
    } catch {
      /* cross-origin */
    }
  }
  return null;
}

/** 通过宿主窗口调用 getChatMessages（避免 iframe scope 中 getChatMessages 不存在的问题） */
export function callHostGetChatMessages(range: string | number, options?: { hide_state?: string }): any[] | null {
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const fn = (hostWindow as any)?.getChatMessages;
      if (typeof fn === 'function') {
        return fn(range, options) as any[];
      }
    } catch {
      /* cross-origin */
    }
  }
  return null;
}

/** 通过宿主 context.chat 或 getChatMessages 读取单条消息详情 */
export function readChatMessageDetail(messageId: number): any | null {
  try {
    const ctx = readHostContext();
    const chat = ctx?.chat;
    // ctx.chat 可能是真数组、Proxy 包装、或普通对象，只要有数字索引访问能力即可
    const chatIsIndexed = chat != null && typeof chat === 'object' && !Array.isArray(chat);
    if (chatIsIndexed) {
      const msg = (chat as any)[messageId];
      if (msg && typeof msg === 'object') return msg;
    }
    // 如果 ctx.chat 是真数组（某些 SillyTavern 版本）
    if (Array.isArray(chat)) {
      return chat[messageId] ?? null;
    }
    // 备用：直接通过宿主窗口调用 getChatMessages
    const list = callHostGetChatMessages(messageId, { hide_state: 'all' });
    return Array.isArray(list) ? (list[0] ?? null) : null;
  } catch {
    return null;
  }
}

// ─── 图片数据规范化 ────────────────────────────────────────────

/** 将各种图片数据格式统一为可用的 src（data: / http / 路径） */
export function normalizeImageDataToSrc(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('idb://')) return raw;
  if (raw.startsWith('idb:')) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `data:image/png;base64,${raw}`;
}

/** 规范化图片 src 用于去重比较 */
export function normalizeImageSrcForCompare(input: unknown): string {
  return String(input ?? '')
    .trim()
    .replace(/&amp;/g, '&');
}

// ─── Prompt Token 工具 ─────────────────────────────────────────

const CHATU8_PROMPT_TOKEN_RE = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;

/** 从文本中提取所有 chatu8 prompt token */
export function collectChatu8PromptTokens(input: string): string[] {
  const text = String(input ?? '');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(CHATU8_PROMPT_TOKEN_RE)) {
    const raw = String(match[0] ?? '').trim();
    const prompt = String(match[2] ?? '').trim();
    if (!raw || !prompt || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/** 提取单个 prompt token */
export function extractPromptToken(input: string): string {
  const text = String(input ?? '').trim();
  if (!text) return '';
  const match = text.match(/([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/);
  return match?.[0]?.trim() ?? '';
}

/** 规范化 prompt token 用于比较 */
export function normalizePromptTokenForCompare(input: string): string {
  const token = extractPromptToken(input) || String(input ?? '').trim();
  return token
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ─── 宿主 DOM 查找 ─────────────────────────────────────────────

const MES_SELECTORS = (mesid: number) => [
  `#chat > .mes[mesid='${mesid}']`,
  `#chat .mes[mesid='${mesid}']`,
  `.mes[mesid='${mesid}']`,
  `#chat > .mes[data-message-index='${mesid}']`,
  `#chat .mes[data-message-index='${mesid}']`,
  `.mes[data-message-index='${mesid}']`,
  `#chat .mes_text[data-message-index='${mesid}']`,
  `.mes_text[data-message-index='${mesid}']`,
];

/** 在宿主文档中查找消息根节点 .mes[mesid] */
export function resolveHostMessageRoot(messageId: number): HTMLElement | null {
  const mesid = Math.trunc(messageId);
  for (const doc of collectHostOnlyDocuments()) {
    for (const selector of MES_SELECTORS(mesid)) {
      const el = doc.querySelector(selector) as HTMLElement | null;
      if (el) return (el.closest?.('.mes') as HTMLElement | null) ?? el;
    }
  }
  return null;
}

/** 在宿主文档中查找消息的 mes_text 节点（用于触发插件行为） */
export function resolveHostMessageTriggerTarget(messageId: number): HTMLElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root) return null;
  return (
    (root.querySelector('.mes_text') as HTMLElement | null) ??
    (root.querySelector('.mes_block') as HTMLElement | null) ??
    (root.querySelector('.message_text') as HTMLElement | null) ??
    root
  );
}

// ─── 宿主图片节点查找 ──────────────────────────────────────────

const CHATU8_IMAGE_BUTTON_SELECTOR = '.st-chatu8-image-button, button.image-tag-button';
const CHATU8_IMAGE_SPAN_SELECTOR = '.st-chatu8-image-span, span.image-tag-placeholder';
const CHATU8_READY_IMAGE_SELECTOR =
  '.st-chatu8-image-span img, .st-chatu8-image-container img, .ai-image-container img';

function buildChatu8ImageSpanRequestSelector(requestId: string): string {
  return `.st-chatu8-image-span[data-request-id='${requestId}'], span.image-tag-placeholder[data-request-id='${requestId}']`;
}

export function resolveHostImageButtonByPromptToken(messageId: number, promptToken: string): HTMLElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root) return null;
  const needle = normalizePromptTokenForCompare(promptToken);
  if (!needle) return null;
  const buttons = Array.from(root.querySelectorAll(CHATU8_IMAGE_BUTTON_SELECTOR)) as HTMLElement[];
  for (const button of buttons) {
    const payload = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
    if (payload && normalizePromptTokenForCompare(payload) === needle) return button;
  }
  return null;
}

export function resolveHostImageButtonByRequestId(messageId: number, requestId: string): HTMLElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root || !requestId) return null;
  const buttons = Array.from(root.querySelectorAll(CHATU8_IMAGE_BUTTON_SELECTOR)) as HTMLElement[];
  return (
    buttons.find(button => {
      const id = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
      return id === requestId;
    }) ?? null
  );
}

export function resolveHostImageNodeByRequestId(messageId: number, requestId: string): HTMLImageElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root || !requestId) return null;
  for (const span of Array.from(root.querySelectorAll(CHATU8_IMAGE_SPAN_SELECTOR)) as HTMLElement[]) {
    const id = String(span.dataset.requestId ?? span.getAttribute('data-request-id') ?? '').trim();
    if (id !== requestId) continue;
    const image = span.querySelector('img') as HTMLImageElement | null;
    if (image) return image;
  }
  return null;
}

export function resolveHostImageNodeBySrc(messageId: number, imageSrc: string): HTMLImageElement | null {
  const root = resolveHostMessageRoot(messageId);
  if (!root || !imageSrc) return null;
  const needle = normalizeImageSrcForCompare(imageSrc);
  if (!needle) return null;
  for (const image of Array.from(root.querySelectorAll(CHATU8_READY_IMAGE_SELECTOR)) as HTMLImageElement[]) {
    if (normalizeImageSrcForCompare(image.getAttribute('src') ?? image.currentSrc ?? '') === needle) return image;
  }
  return null;
}

export function findNextImageElement(start: Element): HTMLImageElement | null {
  let current: Element | null = start;
  while (current) {
    let sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling instanceof HTMLImageElement) return sibling;
      const nested = sibling.querySelector?.('img') as HTMLImageElement | null;
      if (nested) return nested;
      sibling = sibling.nextElementSibling;
    }
    current = current.parentElement;
  }
  return null;
}

export function resolveHostImageNodeByPromptToken(messageId: number, promptToken: string): HTMLImageElement | null {
  const button = resolveHostImageButtonByPromptToken(messageId, promptToken);
  if (!button) return null;
  const ownerRoot = (button.closest('.mes') as HTMLElement | null) ?? resolveHostMessageRoot(messageId);
  const requestId = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
  if (requestId && ownerRoot) {
    const span = ownerRoot.querySelector(buildChatu8ImageSpanRequestSelector(requestId)) as HTMLElement | null;
    const image = span?.querySelector('img') as HTMLImageElement | null;
    if (image) return image;
  }
  return findNextImageElement(button);
}

// ─── 桥接事件标记 ──────────────────────────────────────────────

const BRIDGED_EVENT_FLAG = '__streamDemoBridge';

export function isBridgedEvent(event: Event | null | undefined): boolean {
  return Boolean((event as (Event & Record<string, unknown>) | null | undefined)?.[BRIDGED_EVENT_FLAG]);
}

export function markBridgedEvent<T extends Event>(event: T): T {
  (event as Event & Record<string, unknown>)[BRIDGED_EVENT_FLAG] = true;
  return event;
}

// ─── 通用重试 ──────────────────────────────────────────────────

export type ResolveWithRetryOptions = {
  attempts?: number;
  delayMs?: number;
};

export async function resolveWithRetry<T>(
  resolver: () => T | null | undefined,
  options: ResolveWithRetryOptions = {},
): Promise<T | null> {
  const attempts = Math.max(1, Math.trunc(Number(options.attempts ?? 1)));
  const delayMs = Math.max(0, Math.trunc(Number(options.delayMs ?? 0)));
  for (let index = 0; index < attempts; index += 1) {
    const resolved = resolver();
    if (resolved != null) return resolved;
    if (index >= attempts - 1 || delayMs <= 0) continue;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}

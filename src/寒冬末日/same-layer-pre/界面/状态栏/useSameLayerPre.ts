import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DemoStatus, DemoTheme, ReaderLogItem, ReaderSummary, TranscriptItem } from './types';
import { createPreHostVisualHideController } from './preHostVisualHide';
import { bindPreHostLifecycleBridge } from './preHostLifecycleBridge';

const PRE_TRANSCRIPT_TAIL_PAIR_COUNT = 3;
const PRE_TRANSCRIPT_WINDOW_SIZE = PRE_TRANSCRIPT_TAIL_PAIR_COUNT * 2;
const PRE_EVENT_REFRESH_DELAY_MS = 80;
const PRE_STREAMING_RENDER_INTERVAL_MS = 120;
const PRE_TRANSCRIPT_CACHE_LIMIT = 48;
const OPTION_BLOCK_RE = /<option(?:\s[^>]*)?>([\s\S]*?)(?:<\/option>|$)/gi;
const OPTION_LINE_MARKER_RE = /^(?:[-*•]+|\d+[.)、]|[（(]?\d+[)）、]|(?:【|\[)?[A-Da-d](?:】|\]|\.|、|\)))\s*/;
const INLINE_OPTION_MARKER_RE = /(?:^|\n|\s)(?:【|\[)?[A-Da-d](?:】|\]|\.|、|\))\s*/g;
const DEMO_THEME_CLASS_NAMES = [
  'theme-tech',
  'theme-dark',
  'theme-gold',
  'theme-ios',
  'theme-ipod',
  'theme-amber',
  'theme-apple',
  'theme-apple-sky',
  'theme-apple-mint',
  'theme-apple-lavender',
  'theme-apple-sand',
  'theme-apple-rose',
] as const;

const APPLE_VARIANT_THEME_VALUES = new Set<DemoTheme>([
  'apple-sky',
  'apple-mint',
  'apple-lavender',
  'apple-sand',
  'apple-rose',
]);

type PreTranscriptItemCacheEntry = {
  signature: string;
  item: TranscriptItem;
};

type ScheduledRefreshMode = 'none' | 'targeted' | 'full';

function applyDemoTheme(theme: DemoTheme) {
  const className = `theme-${theme}`;
  const roots = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
  roots.forEach(root => {
    root.classList.remove(...DEMO_THEME_CLASS_NAMES);
    root.classList.add(className);
    if (APPLE_VARIANT_THEME_VALUES.has(theme)) {
      root.classList.add('theme-apple');
    }
  });
}

function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function escapeHtml(text: string) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replace(/\r?\n/g, '<br>');
}

function plainPreview(text: string, maxLength = 96) {
  const normalized = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function decodeCommonHtmlEntities(text: string) {
  return String(text ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeChoiceOption(text: string) {
  return decodeCommonHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?li(?:\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(OPTION_LINE_MARKER_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitInlineMarkedOptions(source: string) {
  const text = String(source ?? '');
  const matches = Array.from(text.matchAll(INLINE_OPTION_MARKER_RE));
  if (matches.length <= 1) return [];

  return matches
    .map((match, index) => {
      const markerStart = match.index ?? 0;
      const contentStart = markerStart + match[0].length;
      const nextStart = matches[index + 1]?.index ?? text.length;
      return normalizeChoiceOption(text.slice(contentStart, nextStart));
    })
    .filter(Boolean);
}

function collectChoiceOptionsFromBlock(block: string) {
  const normalizedBlock = String(block ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?li(?:\s[^>]*)?>/gi, '\n');
  const inlineOptions = splitInlineMarkedOptions(normalizedBlock);
  if (inlineOptions.length > 0) return inlineOptions;

  return normalizedBlock.split('\n').map(normalizeChoiceOption).filter(Boolean);
}

function extractChoiceOptions(rawText: string, renderedHtml = '') {
  const blocks: string[] = [];
  for (const source of [rawText, renderedHtml]) {
    for (const match of String(source ?? '').matchAll(OPTION_BLOCK_RE)) {
      const block = String(match[1] ?? '').trim();
      if (block) blocks.push(block);
    }
  }

  const extracted =
    blocks.length > 0 ? blocks.flatMap(collectChoiceOptionsFromBlock) : splitInlineMarkedOptions(rawText);
  const unique: string[] = [];
  for (const option of extracted) {
    const normalized = normalizeChoiceOption(option);
    if (normalized && !unique.includes(normalized)) unique.push(normalized);
    if (unique.length >= 8) break;
  }
  return unique;
}

function roleLabel(role: TranscriptItem['role']) {
  if (role === 'user') return 'USER';
  if (role === 'system') return 'SYSTEM';
  return 'ASSISTANT';
}

function renderMessageHtml(message: string, role: TranscriptItem['role'], messageId: number) {
  const raw = String(message ?? '');
  if (!raw.trim()) return '';

  if (role === 'user') return escapeHtml(raw);

  if (typeof formatAsDisplayedMessage === 'function') {
    try {
      return formatAsDisplayedMessage(raw, { message_id: messageId });
    } catch (error) {
      console.warn('[same-layer-pre] formatAsDisplayedMessage failed', { messageId, error });
    }
  }

  return escapeHtml(raw);
}

const LOOSE_PARAGRAPH_BREAK_RE = /(?:<br\s*\/?>\s*){2,}/gi;
const STRUCTURED_DISPLAY_BLOCK_RE =
  /<(?:article|aside|blockquote|details|div|figure|h[1-6]|img|li|ol|p|pre|section|table|ul)\b/i;

function wrapLooseReadingParagraphs(html: string) {
  html = String(html ?? '').trim();
  if (!html || STRUCTURED_DISPLAY_BLOCK_RE.test(html) || !LOOSE_PARAGRAPH_BREAK_RE.test(html)) return html;

  return html
    .split(LOOSE_PARAGRAPH_BREAK_RE)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p class="pre-reading-paragraph">${part}</p>`)
    .join('');
}

function normalizeDisplayedHtml(html: string) {
  return wrapLooseReadingParagraphs(
    String(html ?? '')
      .replace(/<q(\s[^>]*)?>/gi, '<span class="dialog-inline">')
      .replace(/<\/q>/gi, '</span>'),
  );
}

function readPreCarrierMessageId(): number | null {
  try {
    if (typeof getCurrentMessageId !== 'function') return null;
    const id = Number(getCurrentMessageId());
    if (!Number.isFinite(id) || id < 0) return null;
    return Math.trunc(id);
  } catch {
    return null;
  }
}

function readHostContext(): any {
  const windows = [window, window.parent, window.top];
  const seen = new Set<Window>();
  for (const targetWindow of windows) {
    if (!targetWindow || seen.has(targetWindow)) continue;
    seen.add(targetWindow);
    try {
      const ctx = (targetWindow as any)?.SillyTavern?.getContext?.();
      if (ctx) return ctx;
    } catch {
      /* cross-origin */
    }
  }
  return null;
}

function getTrueChatLength(): number {
  try {
    const chat = readHostContext()?.chat;
    if (chat && typeof chat === 'object' && Number.isFinite(Number((chat as any).length))) {
      return Math.max(0, Math.trunc(Number((chat as any).length)) - 1);
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof getLastMessageId !== 'function') return 0;
    const id = Number(getLastMessageId());
    return Number.isFinite(id) ? Math.max(0, Math.trunc(id)) : 0;
  } catch {
    return 0;
  }
}

function normalizeHostMessageRole(message: any): TranscriptItem['role'] {
  const role = String(message?.role ?? '');
  if (role === 'assistant' || role === 'user' || role === 'system') return role;
  if (message?.is_system === true || message?.type === 'system') return 'system';
  if (message?.is_user === true || message?.type === 'user') return 'user';
  return 'assistant';
}

function normalizeHostMessageText(message: any) {
  return String(message?.message ?? message?.mes ?? message?.text ?? '');
}

function normalizeChatMessage(message: any, fallbackMessageId: number): ChatMessage {
  const rawId = Number(message?.message_id ?? message?.mesid ?? fallbackMessageId);
  const messageId = Number.isFinite(rawId) ? Math.trunc(rawId) : fallbackMessageId;
  return {
    ...message,
    message_id: messageId,
    role: normalizeHostMessageRole(message),
    message: normalizeHostMessageText(message),
    is_hidden: message?.is_hidden === true,
  } as ChatMessage;
}

function normalizeChatMessages(messages: any[], fallbackStartId: number) {
  return messages
    .map((message, index) => normalizeChatMessage(message, fallbackStartId + index))
    .filter(message => Number.isFinite(Number(message.message_id)));
}

function selectPreTranscriptWindow(messages: ChatMessage[]) {
  return messages
    .filter(message => message.message_id > 0 && (message.role === 'user' || message.role === 'assistant'))
    .slice(-PRE_TRANSCRIPT_WINDOW_SIZE);
}

function normalizeReadableMessageId(value: unknown) {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id >= 0 ? id : null;
}

function normalizeEventMessageIds(values: unknown) {
  const ids = new Set<number>();
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    const id = normalizeReadableMessageId(value);
    if (id !== null) {
      ids.add(id);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    const record = value as Record<string, unknown>;
    ['message_id', 'messageId', 'mesid', 'id'].forEach(key => visit(record[key]));
    visit(record.detail);
    visit(record.data);
  };

  visit(values);
  return Array.from(ids).sort((a, b) => a - b);
}

function readHostChatWindow(startId: number, endId: number) {
  try {
    const chat = readHostContext()?.chat;
    if (!chat || typeof chat !== 'object') return [];
    const length = Math.trunc(Number((chat as any).length));
    if (!Number.isFinite(length) || length <= 0) return [];

    const boundedStart = Math.max(1, Math.trunc(startId));
    const boundedEnd = Math.min(Math.max(0, Math.trunc(endId)), length - 1);
    if (boundedEnd < boundedStart) return [];

    const messages: ChatMessage[] = [];
    for (let id = boundedStart; id <= boundedEnd; id += 1) {
      const message = (chat as any)[id];
      if (message && typeof message === 'object') messages.push(normalizeChatMessage(message, id));
    }
    return messages;
  } catch {
    return [];
  }
}

function collectHostOnlyDocuments(): Document[] {
  const docs: Document[] = [];
  const push = (doc: Document | null | undefined) => {
    if (!doc || doc === document || docs.includes(doc)) return;
    docs.push(doc);
  };

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

function readMessageIdFromHostElement(element: Element) {
  const raw =
    element.getAttribute('mesid') ??
    element.getAttribute('data-message-index') ??
    element.getAttribute('data-message-id');
  const id = Number(raw);
  return Number.isFinite(id) && id >= 0 ? Math.trunc(id) : null;
}

function collectHostVisibleMessageIds() {
  const ids = new Set<number>();
  for (const doc of collectHostOnlyDocuments()) {
    const nodes = doc.querySelectorAll('.mes[mesid], .mes[data-message-index], .mes[data-message-id]');
    nodes.forEach(node => {
      const id = readMessageIdFromHostElement(node);
      if (id !== null) ids.add(id);
    });
  }
  return Array.from(ids).sort((a, b) => a - b);
}

function readHostRenderedMessageHtml(messageId: number) {
  const normalizedId = Math.trunc(Number(messageId));
  if (!Number.isFinite(normalizedId) || normalizedId < 0) return '';

  for (const doc of collectHostOnlyDocuments()) {
    const root = doc.querySelector(`.mes[mesid='${normalizedId}'], .mes[data-message-index='${normalizedId}']`);
    const mesText = root?.querySelector?.('.mes_text') as HTMLElement | null;
    const html = String(mesText?.innerHTML ?? '').trim();
    if (html) return normalizeDisplayedHtml(html);
  }

  try {
    if (typeof retrieveDisplayedMessage !== 'function') return '';
    const html = String(retrieveDisplayedMessage(normalizedId)?.html?.() ?? '').trim();
    return html ? normalizeDisplayedHtml(html) : '';
  } catch {
    return '';
  }
}

function toTranscriptItem(message: ChatMessage, latestId: number, carrierMessageId: number | null): TranscriptItem {
  const role = message.role ?? 'assistant';
  const raw = String(message.message ?? '');
  const hostRenderedHtml = readHostRenderedMessageHtml(message.message_id);
  const finalHtml = hostRenderedHtml || renderMessageHtml(raw, role, message.message_id);
  const canDeleteFrom = message.message_id > 0 && message.message_id !== carrierMessageId;
  return {
    message_id: message.message_id,
    role,
    roleLabel: roleLabel(role),
    isOpening: message.message_id === 0,
    raw,
    renderSource: raw,
    content: raw,
    preview: plainPreview(raw),
    regexText: '',
    streamHtml: '',
    finalHtml,
    options: extractChoiceOptions(raw, finalHtml),
    hidden: Boolean(message.is_hidden),
    phase: 'done',
    isLatest: message.message_id === latestId,
    isStreaming: false,
    canOpenDetail: Boolean(raw.trim()),
    canDeleteFrom,
    canReroll: canDeleteFrom && (role === 'assistant' || role === 'user'),
  };
}

export function useSameLayerPre() {
  const transcriptItems = ref<TranscriptItem[]>([]);
  const composerText = ref('');
  const busy = ref(false);
  const status = ref<DemoStatus>('idle');
  const theme = ref<DemoTheme>('amber');
  const errorMessage = ref('');
  const streamingText = ref('');
  const activeGenerationId = ref<string | null>(null);
  const rollbackConfirmMessageId = ref<number | null>(null);
  const logItems = ref<ReaderLogItem[]>([]);
  const lastRefreshedAt = ref('');
  const stops: Array<{ stop: () => void }> = [];
  const hostVisualHideController = createPreHostVisualHideController();
  const preTranscriptItemCache = new Map<number, PreTranscriptItemCacheEntry>();
  let refreshTimer = 0;
  let pendingRefreshReason = '';
  let pendingRefreshMode: ScheduledRefreshMode = 'none';
  const pendingTargetedRefreshIds = new Set<number>();
  let streamedPreviewText = '';
  let streamedPreviewUpdatedAt = 0;

  function pushLog(type: ReaderLogItem['type'], title: string, detail = '') {
    logItems.value = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        title,
        detail,
        createdAt: nowLabel(),
      },
      ...logItems.value,
    ].slice(0, 40);
  }

  function syncHostVisualHide(messageIds: number[]) {
    const carrierMessageId = readPreCarrierMessageId();
    void nextTick(() => {
      hostVisualHideController.applyToMessageIds(messageIds, { excludeMessageIds: carrierMessageId });
    });
  }

  function replaceHostVisualHide(messageIds: number[]) {
    const carrierMessageId = readPreCarrierMessageId();
    void nextTick(() => {
      hostVisualHideController.replaceWithMessageIds(messageIds, { excludeMessageIds: carrierMessageId });
    });
  }

  function reserveNextHostMessageVisualHide() {
    hostVisualHideController.applyToMessageIds([getTrueChatLength() + 1], {
      excludeMessageIds: readPreCarrierMessageId(),
    });
  }

  function readRecentChatMessagesForUi() {
    const lastId = getTrueChatLength();
    if (lastId <= 0) return [];
    const startId = Math.max(1, lastId - PRE_TRANSCRIPT_WINDOW_SIZE + 1);

    try {
      const list = getChatMessages(`${startId}-${lastId}`, { hide_state: 'all' });
      if (Array.isArray(list)) return selectPreTranscriptWindow(normalizeChatMessages(list, startId));
    } catch (error) {
      console.warn('[same-layer-pre] bounded getChatMessages failed', { startId, lastId, error });
    }

    return selectPreTranscriptWindow(readHostChatWindow(startId, lastId));
  }

  function readChatMessageById(messageId: number) {
    const normalizedId = normalizeReadableMessageId(messageId);
    if (normalizedId === null) return null;
    messageId = normalizedId;

    try {
      const list = getChatMessages(`${messageId}`, { hide_state: 'all' });
      if (Array.isArray(list) && list.length > 0) return normalizeChatMessage(list[0], messageId);
    } catch (error) {
      console.warn('[same-layer-pre] single getChatMessages failed', { messageId, error });
    }

    return readHostChatWindow(messageId, messageId)[0] ?? null;
  }

  function readAllChatMessages() {
    return getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' }) as ChatMessage[];
  }

  function normalizeMessageId(value: unknown) {
    const id = Math.trunc(Number(value));
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function findLatestRegenerateMessage(messages: ChatMessage[], carrierMessageId: number | null) {
    return [...messages]
      .reverse()
      .find(
        message =>
          (message.role === 'assistant' || message.role === 'user') &&
          message.message_id > 0 &&
          message.message_id !== carrierMessageId,
      );
  }

  function findUserPromptBefore(messages: ChatMessage[], messageId: number) {
    return [...messages].reverse().find(message => message.role === 'user' && message.message_id < messageId);
  }

  function collectDeletableMessageIdsFrom(messages: ChatMessage[], messageId: number, carrierMessageId: number | null) {
    const target = Math.trunc(Number(messageId));
    if (!Number.isFinite(target) || target <= 0) return [];

    return messages
      .map(message => Math.trunc(Number(message.message_id)))
      .filter(id => Number.isFinite(id) && id >= target && id > 0 && id !== carrierMessageId)
      .sort((a, b) => a - b);
  }

  function collectDeletableMessageIdsAfter(
    messages: ChatMessage[],
    messageId: number,
    carrierMessageId: number | null,
  ) {
    const target = Math.trunc(Number(messageId));
    if (!Number.isFinite(target) || target <= 0) return [];

    return messages
      .map(message => Math.trunc(Number(message.message_id)))
      .filter(id => Number.isFinite(id) && id > target && id > 0 && id !== carrierMessageId)
      .sort((a, b) => a - b);
  }

  function resolveRegenerateTarget(messages: ChatMessage[], messageId: number, carrierMessageId: number | null) {
    const targetId = normalizeMessageId(messageId);
    const target = messages.find(
      message =>
        targetId !== null &&
        message.message_id === targetId &&
        message.message_id !== carrierMessageId &&
        (message.role === 'assistant' || message.role === 'user'),
    );
    if (!target) return null;

    const promptMessage = target.role === 'user' ? target : findUserPromptBefore(messages, target.message_id);
    const prompt = String(promptMessage?.message ?? '').trim();
    if (!promptMessage || !prompt) return null;

    const trailingIds =
      target.role === 'user'
        ? collectDeletableMessageIdsAfter(messages, target.message_id, carrierMessageId)
        : collectDeletableMessageIdsFrom(messages, target.message_id, carrierMessageId);

    return {
      target,
      promptMessage,
      prompt,
      trailingIds,
    };
  }

  function buildTranscriptItemSignature(message: ChatMessage, latestId: number, carrierMessageId: number | null) {
    const role = message.role ?? 'assistant';
    const raw = String(message.message ?? '');
    const canDeleteFrom = message.message_id > 0 && message.message_id !== carrierMessageId;
    return [
      role,
      message.message_id === latestId ? 'latest' : 'not-latest',
      message.is_hidden === true ? 'hidden' : 'visible',
      canDeleteFrom ? 'delete' : 'locked',
      raw.length,
      raw.slice(0, 96),
      raw.slice(-96),
    ].join('\u0001');
  }

  function buildCachedTranscriptItem(message: ChatMessage, latestId: number, carrierMessageId: number | null) {
    const signature = buildTranscriptItemSignature(message, latestId, carrierMessageId);
    const cached = preTranscriptItemCache.get(message.message_id);
    if (cached?.signature === signature) return cached.item;

    const item = toTranscriptItem(message, latestId, carrierMessageId);
    preTranscriptItemCache.set(message.message_id, { signature, item });
    return item;
  }

  function pruneTranscriptItemCache(visibleMessageIds: number[]) {
    const visibleIds = new Set(visibleMessageIds);
    for (const messageId of Array.from(preTranscriptItemCache.keys())) {
      if (!visibleIds.has(messageId)) preTranscriptItemCache.delete(messageId);
    }

    if (preTranscriptItemCache.size <= PRE_TRANSCRIPT_CACHE_LIMIT) return;
    const overflow = preTranscriptItemCache.size - PRE_TRANSCRIPT_CACHE_LIMIT;
    Array.from(preTranscriptItemCache.keys())
      .slice(0, overflow)
      .forEach(messageId => preTranscriptItemCache.delete(messageId));
  }

  function refreshTranscript(reason = 'manual') {
    try {
      const visibleMessages = readRecentChatMessagesForUi();
      const latestId = visibleMessages.at(-1)?.message_id ?? -1;
      const carrierMessageId = readPreCarrierMessageId();
      const visibleIds = visibleMessages.map(message => message.message_id);
      transcriptItems.value = visibleMessages.map(message =>
        buildCachedTranscriptItem(message, latestId, carrierMessageId),
      );
      pruneTranscriptItemCache(visibleIds);
      const hostMessageIds = collectHostVisibleMessageIds();
      replaceHostVisualHide(hostMessageIds.length > 0 ? hostMessageIds : visibleIds);
      lastRefreshedAt.value = nowLabel();
      errorMessage.value = '';
      if (reason === 'manual') pushLog('info', '已刷新聊天记录', `读取 ${visibleMessages.length} 条楼层`);
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      pushLog('error', '读取聊天失败', errorMessage.value);
    }
  }

  function scheduleTranscriptRefresh(reason = 'event') {
    pendingRefreshMode = 'full';
    pendingTargetedRefreshIds.clear();
    pendingRefreshReason = pendingRefreshReason ? `${pendingRefreshReason},${reason}` : reason;
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      flushScheduledTranscriptRefresh(reason);
    }, PRE_EVENT_REFRESH_DELAY_MS);
  }

  function refreshTranscriptItemsByIds(messageIds: number[], reason = 'event') {
    const normalizedIds = normalizeEventMessageIds(messageIds);
    if (normalizedIds.length === 0) {
      return;
    }

    try {
      const currentItems = transcriptItems.value;
      const currentItemIds = new Set(currentItems.map(item => item.message_id));
      const targetIds = normalizedIds.filter(messageId => currentItemIds.has(messageId));
      if (targetIds.length === 0) {
        return;
      }

      const latestId = currentItems.at(-1)?.message_id ?? -1;
      const carrierMessageId = readPreCarrierMessageId();
      const updatedItems = new Map<number, TranscriptItem>();
      for (const messageId of targetIds) {
        const message = readChatMessageById(messageId);
        if (!message) {
          scheduleTranscriptRefresh(`${reason}:missing`);
          return;
        }
        updatedItems.set(messageId, buildCachedTranscriptItem(message, latestId, carrierMessageId));
      }

      transcriptItems.value = currentItems.map(item => updatedItems.get(item.message_id) ?? item);
      pruneTranscriptItemCache(transcriptItems.value.map(item => item.message_id));
      syncHostVisualHide(targetIds);
      lastRefreshedAt.value = nowLabel();
      errorMessage.value = '';
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      pushLog('error', '更新聊天楼层失败', errorMessage.value);
    }
  }

  function scheduleTargetedTranscriptRefresh(messageIds: number[], reason = 'event') {
    const normalizedIds = normalizeEventMessageIds(messageIds);
    if (normalizedIds.length === 0) {
      return;
    }

    pendingRefreshReason = pendingRefreshReason ? `${pendingRefreshReason},${reason}` : reason;
    if (pendingRefreshMode === 'full') return;
    pendingRefreshMode = 'targeted';
    normalizedIds.forEach(messageId => pendingTargetedRefreshIds.add(messageId));
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      flushScheduledTranscriptRefresh(reason);
    }, PRE_EVENT_REFRESH_DELAY_MS);
  }

  function flushScheduledTranscriptRefresh(reason = 'event') {
    const nextReason = pendingRefreshReason || reason;
    const nextMode = pendingRefreshMode;
    const nextTargetedIds = Array.from(pendingTargetedRefreshIds);
    pendingRefreshReason = '';
    pendingTargetedRefreshIds.clear();
    pendingRefreshMode = 'none';

    if (nextMode === 'full') {
      refreshTranscript(nextReason);
      return;
    }

    if (nextTargetedIds.length > 0) {
      refreshTranscriptItemsByIds(nextTargetedIds, nextReason);
    }
  }

  function updateStreamingPreviewText(text: string) {
    const raw = String(text ?? '');
    if (!raw.trim()) {
      streamingText.value = raw;
      streamedPreviewText = raw;
      streamedPreviewUpdatedAt = 0;
      return;
    }

    const now = Date.now();
    if (
      !streamedPreviewText ||
      raw.length < streamedPreviewText.length ||
      now - streamedPreviewUpdatedAt >= PRE_STREAMING_RENDER_INTERVAL_MS
    ) {
      streamedPreviewText = raw;
      streamedPreviewUpdatedAt = now;
      streamingText.value = raw;
    }
  }

  const streamingItem = computed<TranscriptItem | null>(() => {
    if (!busy.value || !streamingText.value.trim()) return null;
    const latestId = transcriptItems.value.at(-1)?.message_id ?? -1;
    const raw = streamingText.value;
    return {
      message_id: latestId + 1,
      role: 'assistant',
      roleLabel: 'ASSISTANT',
      isOpening: false,
      raw,
      renderSource: raw,
      content: raw,
      preview: plainPreview(raw),
      regexText: '',
      streamHtml: '',
      finalHtml: '',
      options: [],
      hidden: false,
      phase: 'stream',
      isLatest: true,
      isStreaming: true,
      canOpenDetail: false,
      canDeleteFrom: false,
      canReroll: false,
    };
  });

  const visibleTranscriptItems = computed(() => {
    const item = streamingItem.value;
    return item ? [...transcriptItems.value, item] : transcriptItems.value;
  });

  const statusLabel = computed(() => {
    if (status.value === 'streaming') return '生成中';
    if (status.value === 'persisting') return '写入中';
    if (status.value === 'error') return '异常';
    if (status.value === 'done') return '已同步';
    if (status.value === 'preparing') return '准备中';
    return '待命';
  });

  const readerSummary = computed<ReaderSummary>(() => {
    const latestUser = [...transcriptItems.value].reverse().find(item => item.role === 'user');
    const latestAssistant = [...transcriptItems.value].reverse().find(item => item.role === 'assistant');
    return {
      turnCount: transcriptItems.value.length,
      latestUserPreview: latestUser?.preview ?? '',
      latestAssistantPreview: latestAssistant?.preview ?? '',
      readingModeLabel: 'PRE',
      statusLabel: statusLabel.value,
      assistantAnchorLabel: latestAssistant ? `#${latestAssistant.message_id}` : '无',
      storySummary: latestAssistant?.preview ?? latestUser?.preview ?? '等待聊天记录',
    };
  });

  const latestAssistantMessageId = computed(
    () => [...transcriptItems.value].reverse().find(item => item.role === 'assistant')?.message_id ?? null,
  );

  const latestRegeneratableMessage = computed(
    () => [...transcriptItems.value].reverse().find(item => item.canReroll && item.isLatest) ?? null,
  );

  const canRegenerateLatestMessage = computed(() => {
    const target = latestRegeneratableMessage.value;
    if (!target || busy.value) return false;
    if (target.role === 'user') return Boolean(target.raw.trim());
    return Boolean(
      [...transcriptItems.value].reverse().find(item => item.role === 'user' && item.message_id < target.message_id),
    );
  });

  async function submitPrompt(value?: string) {
    const text = String(value ?? composerText.value ?? '').trim();
    if (!text || busy.value) return;

    const generationId = `same-layer-pre-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeGenerationId.value = generationId;
    busy.value = true;
    status.value = 'preparing';
    errorMessage.value = '';
    updateStreamingPreviewText('');
    composerText.value = '';
    pushLog('action', '发送玩家输入', plainPreview(text, 80));

    try {
      reserveNextHostMessageVisualHide();
      await createChatMessages([{ role: 'user', message: text, is_hidden: false }], { refresh: 'affected' });
      refreshTranscript('user_submitted');

      status.value = 'streaming';
      const response = await generate({ user_input: text, should_stream: true, generation_id: generationId });

      status.value = 'persisting';
      reserveNextHostMessageVisualHide();
      await createChatMessages([{ role: 'assistant', message: response, is_hidden: false }], { refresh: 'affected' });
      updateStreamingPreviewText('');
      status.value = 'done';
      refreshTranscript('assistant_persisted');
      pushLog('info', '助手回复已写入', plainPreview(response, 80));
    } catch (error) {
      status.value = 'error';
      errorMessage.value = error instanceof Error ? error.message : String(error);
      pushLog('error', '生成失败', errorMessage.value);
    } finally {
      busy.value = false;
      activeGenerationId.value = null;
    }
  }

  function requestRollbackDelete(item: TranscriptItem) {
    if (busy.value || item.isStreaming || !item.canDeleteFrom) return;
    rollbackConfirmMessageId.value = item.message_id;
  }

  function cancelRollbackDelete() {
    rollbackConfirmMessageId.value = null;
  }

  async function deleteFromMessageId(messageId: number) {
    if (busy.value) return;

    const carrierMessageId = readPreCarrierMessageId();
    const messages = readAllChatMessages();
    const ids = collectDeletableMessageIdsFrom(messages, messageId, carrierMessageId);
    if (ids.length === 0) {
      cancelRollbackDelete();
      return;
    }

    busy.value = true;
    status.value = 'preparing';
    errorMessage.value = '';
    try {
      await deleteChatMessages(ids, { refresh: 'all' });
      cancelRollbackDelete();
      status.value = 'done';
      refreshTranscript('rollback_deleted');
      const lastId = ids.at(-1) ?? ids[0];
      pushLog('action', '回退删除', `已删除楼层 #${ids[0]} 到 #${lastId}`);
    } catch (error) {
      status.value = 'error';
      errorMessage.value = error instanceof Error ? error.message : String(error);
      pushLog('error', '回退删除失败', errorMessage.value);
    } finally {
      busy.value = false;
    }
  }

  async function confirmRollbackDelete(item: TranscriptItem) {
    if (!item.canDeleteFrom) return;
    if (rollbackConfirmMessageId.value !== item.message_id) {
      requestRollbackDelete(item);
      return;
    }
    await deleteFromMessageId(item.message_id);
  }

  async function regenerateMessage(itemOrMessageId?: TranscriptItem | number | null) {
    if (busy.value) return;

    const carrierMessageId = readPreCarrierMessageId();
    const messages = readAllChatMessages();
    const explicitId =
      typeof itemOrMessageId === 'object' && itemOrMessageId !== null
        ? itemOrMessageId.message_id
        : normalizeMessageId(itemOrMessageId);
    const latestMessage = findLatestRegenerateMessage(messages, carrierMessageId);
    const messageId = normalizeMessageId(explicitId ?? latestMessage?.message_id);
    const resolved = messageId !== null ? resolveRegenerateTarget(messages, messageId, carrierMessageId) : null;

    if (!resolved) {
      pushLog('error', '重新生成失败', '未找到可重生的助手楼层');
      return;
    }

    const { target, promptMessage, prompt, trailingIds } = resolved;

    if (target.role === 'assistant' && trailingIds.length === 0) {
      pushLog('error', '重新生成失败', `楼层 #${target.message_id} 不能被删除`);
      return;
    }

    const generationId = `same-layer-pre-regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeGenerationId.value = generationId;
    busy.value = true;
    status.value = 'preparing';
    errorMessage.value = '';
    updateStreamingPreviewText('');
    cancelRollbackDelete();
    pushLog(
      'action',
      '重新生成',
      target.role === 'user'
        ? `基于玩家楼层 #${target.message_id} 重生助手回复`
        : `基于玩家楼层 #${promptMessage.message_id} 重生助手回复`,
    );

    try {
      if (trailingIds.length > 0) {
        await deleteChatMessages(trailingIds, { refresh: 'none' });
        refreshTranscript('regenerate_deleted');
      }

      status.value = 'streaming';
      const response = await generate({ user_input: prompt, should_stream: true, generation_id: generationId });

      status.value = 'persisting';
      reserveNextHostMessageVisualHide();
      await createChatMessages([{ role: 'assistant', message: response, is_hidden: false }], { refresh: 'affected' });
      updateStreamingPreviewText('');
      status.value = 'done';
      refreshTranscript('regenerate_persisted');
      pushLog('info', '重新生成完成', plainPreview(response, 80));
    } catch (error) {
      status.value = 'error';
      errorMessage.value = error instanceof Error ? error.message : String(error);
      pushLog('error', '重新生成失败', errorMessage.value);
    } finally {
      busy.value = false;
      activeGenerationId.value = null;
    }
  }

  async function regenerateLatestMessage() {
    await regenerateMessage();
  }

  function cancelGeneration() {
    const id = activeGenerationId.value;
    if (id && typeof stopGenerationById === 'function') {
      stopGenerationById(id);
    } else if (typeof stopAllGeneration === 'function') {
      stopAllGeneration();
    }
    busy.value = false;
    status.value = 'idle';
    activeGenerationId.value = null;
    updateStreamingPreviewText('');
    pushLog('action', '已请求停止生成');
  }

  watch(
    theme,
    value => {
      applyDemoTheme(value);
    },
    { immediate: true },
  );

  watch(
    () => transcriptItems.value.map(item => item.message_id),
    ids => {
      const confirmId = rollbackConfirmMessageId.value;
      if (confirmId !== null && !ids.includes(confirmId)) rollbackConfirmMessageId.value = null;
    },
  );

  onMounted(() => {
    refreshTranscript('mounted');
    const refreshEvents = [
      tavern_events.MESSAGE_SENT,
      tavern_events.MESSAGE_RECEIVED,
      tavern_events.MESSAGE_DELETED,
      tavern_events.CHAT_CHANGED,
    ];
    for (const eventName of refreshEvents) {
      stops.push(eventOn(eventName as any, () => scheduleTranscriptRefresh(String(eventName))));
    }
    const messageRefreshEvents = [
      tavern_events.MESSAGE_UPDATED,
      tavern_events.MESSAGE_EDITED,
      tavern_events.USER_MESSAGE_RENDERED,
      tavern_events.CHARACTER_MESSAGE_RENDERED,
    ];
    for (const eventName of messageRefreshEvents) {
      stops.push(
        eventOn(eventName as any, (...eventArgs: unknown[]) => {
          const messageIds = normalizeEventMessageIds(eventArgs);
          scheduleTargetedTranscriptRefresh(messageIds, String(eventName));
        }),
      );
    }
    stops.push(
      eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY as any, (text: string, generationId: string) => {
        if (!activeGenerationId.value || generationId !== activeGenerationId.value) return;
        updateStreamingPreviewText(String(text ?? ''));
      }),
    );
    stops.push(
      bindPreHostLifecycleBridge({
        applyHostVisualHide: hostVisualHideController.applyToMessageIds,
        clearHostVisualHide: hostVisualHideController.clearFromMessageIds,
        reapplyHostVisualHide: hostVisualHideController.reapply,
        readCarrierMessageId: readPreCarrierMessageId,
        scheduleTranscriptRefresh,
        scheduleTargetedTranscriptRefresh,
        updateStreamingPreviewText,
        clearStreamingPreviewText: () => updateStreamingPreviewText(''),
      }),
    );
  });

  onBeforeUnmount(() => {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
      refreshTimer = 0;
    }
    pendingTargetedRefreshIds.clear();
    pendingRefreshMode = 'none';
    stops.splice(0).forEach(stop => stop.stop());
    hostVisualHideController.destroy();
  });

  return {
    transcriptItems: visibleTranscriptItems,
    baseTranscriptItems: transcriptItems,
    composerText,
    busy,
    status,
    theme,
    statusLabel,
    errorMessage,
    logItems,
    readerSummary,
    latestAssistantMessageId,
    rollbackConfirmMessageId,
    canRegenerateLatestMessage,
    lastRefreshedAt,
    refreshTranscript,
    submitPrompt,
    cancelGeneration,
    requestRollbackDelete,
    confirmRollbackDelete,
    cancelRollbackDelete,
    regenerateMessage,
    regenerateLatestMessage,
  };
}

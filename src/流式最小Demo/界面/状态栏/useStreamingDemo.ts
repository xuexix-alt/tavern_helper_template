import {
  buildStreamDemoMessage,
  extractStreamDemoContent,
  extractStreamDemoOptions,
  extractStreamDemoPhase,
  isStreamDemoMessage,
  stripStreamDemoRuntimeTags,
  stripTagsForPreview,
} from '../../shared/message';
import {
  buildOpeningPrompt,
  extractOpeningContent,
  extractOpeningContentLoose,
  extractOpeningOptions,
  extractOpeningPromptEcho,
  extractOpeningPromptEchoLoose,
  extractUpdateVariableBlock,
  extractUpdateVariableBlockLoose,
  formatUpdateVariableBlock,
  extractOpeningWorldModeBrief,
  extractOpeningWorldModeBriefLoose,
  getDefaultOpeningPayload,
  getDefaultOpeningPreset,
  getOpeningRoute,
  getOpeningRoutes,
  getOpeningWorldMode,
  getOpeningWorldModes,
  readOpeningPayloadFromChat,
  replaceOpeningPayloadInChat,
} from '../../shared/opening';
import type { OpeningPayload, OpeningPreset } from '../../shared/opening.schema';
import {
  normalizeDensity,
  normalizeMessageId,
  normalizeReadingMode,
  patchReaderChatState,
  readReaderChatState,
  READER_CHAT_STATE_VERSION,
} from './readerState';
import type {
  DemoStatus,
  ReaderLogItem,
  ReaderSummary,
  ReadingMode,
  TranscriptDensity,
  TranscriptFilterMode,
  TranscriptItem,
} from './types';

type StopHandle = { stop?: () => void } | null;
type HideRefreshMode = 'none' | 'affected';

type BaseChatMessage = {
  message_id: number;
  role: 'assistant' | 'user' | 'system';
  message: string;
  is_hidden: boolean;
};

function applyRegexForDisplay(text: string, role: TranscriptItem['role']): string {
  if (!text) return '';
  try {
    if (typeof formatAsTavernRegexedString === 'function') {
      const source = role === 'user' ? 'user_input' : role === 'system' ? 'world_info' : 'ai_output';
      const out = formatAsTavernRegexedString(text, source, 'display', { depth: 0 });
      return typeof out === 'string' ? out : text;
    }
  } catch {
    // ignore
  }
  return text;
}

function escapeHtml(input: string): string {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildStreamStageHtml(regexText: string): string {
  const source = String(regexText ?? '').trim();
  if (!source) return '<pre class="stream-stage-pre">等待 token…</pre>';
  const maybeHtml = /<\/?[a-z][^>]*>/i.test(source);
  if (maybeHtml) return source;
  return `<pre class="stream-stage-pre">${escapeHtml(source)}</pre>`;
}

function buildFinalHtml(renderSource: string, message_id: number): string {
  try {
    if (typeof formatAsDisplayedMessage === 'function') {
      return formatAsDisplayedMessage(renderSource || '(空回复)', { message_id });
    }
  } catch {
    // ignore
  }
  return `<p>${escapeHtml(renderSource || '(空回复)')}</p>`;
}

function readCurrentContainerMessageId(): number | null {
  try {
    const value = Number(getCurrentMessageId?.());
    return Number.isFinite(value) ? Math.trunc(value) : null;
  } catch {
    return null;
  }
}

function normalizeRoleLabel(role: TranscriptItem['role']): string {
  if (role === 'user') return '用户';
  if (role === 'system') return '系统';
  return '助手';
}

function buildTranscriptItem(input: {
  id: number;
  role: TranscriptItem['role'];
  raw: string;
  hidden: boolean;
  isOpening?: boolean;
  latestAssistantId: number | null;
  status: DemoStatus;
}): TranscriptItem {
  const isDemoAssistant = input.role === 'assistant' && isStreamDemoMessage(input.raw);
  const phase = isDemoAssistant ? extractStreamDemoPhase(input.raw) : 'plain';
  const content = isDemoAssistant ? extractStreamDemoContent(input.raw) : input.raw.trim();
  const options = isDemoAssistant ? extractStreamDemoOptions(input.raw) : [];
  const renderSource = isDemoAssistant ? stripStreamDemoRuntimeTags(input.raw) : input.raw.trim();
  const regexText = applyRegexForDisplay(renderSource, input.role);
  const streamHtml = buildStreamStageHtml(regexText);
  const finalHtml = buildFinalHtml(renderSource, input.id);
  const preview = stripTagsForPreview(regexText || content).slice(0, 80);

  return {
    message_id: input.id,
    role: input.role,
    roleLabel: normalizeRoleLabel(input.role),
    isOpening: input.isOpening === true,
    raw: input.raw,
    renderSource,
    content,
    preview,
    regexText,
    streamHtml,
    finalHtml,
    options,
    hidden: input.hidden,
    phase,
    isLatest: input.latestAssistantId === input.id,
    isStreaming: input.latestAssistantId === input.id && (input.status === 'streaming' || phase === 'stream'),
    canOpenDetail: true,
    canDeleteFrom: input.isOpening !== true,
  };
}

function sortTranscriptItems(items: TranscriptItem[]): TranscriptItem[] {
  return items.slice().sort((a, b) => a.message_id - b.message_id);
}

function composeOpeningSeedText(payload: OpeningPayload, preset: OpeningPreset): string {
  const worldMode = getOpeningWorldMode(payload.world_mode_id);
  const route = getOpeningRoute(payload.route_id);
  return [
    payload.base.world_intro,
    '',
    payload.base.first_line,
    '',
    `世界观档位：${worldMode ? `${worldMode.id} · ${worldMode.name}` : payload.world_mode_id || '未设定'}`,
    `开局主流派：${route?.name || payload.route_id || '未设定'}`,
    `${preset.meta_template.character_label}：${payload.meta.character || '未设定'}`,
    `${preset.meta_template.time_label}：${payload.meta.time || '未设定'}`,
    `${preset.meta_template.location_label}：${payload.meta.location || '未设定'}`,
    '',
    payload.world_mode_brief,
    '',
    payload.opening_content || '开局尚未生成，请先完成开局配置。',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildOpeningAssistantText(payload: OpeningPayload): string {
  const body = String(payload.opening_content ?? '').trim();
  const options = Array.isArray(payload.options)
    ? payload.options.map(option => String(option ?? '').trim()).filter(Boolean)
    : [];
  const updateVariableBlock = formatUpdateVariableBlock(payload.update_variable_block);

  return [
    body,
    options.length > 0 ? ['', ...options.map((option, index) => `${index + 1}. ${option}`)].join('\n') : '',
    updateVariableBlock,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function isOpeningAssistantMessage(message: any): boolean {
  return _.get(message, 'data.stream_demo.opening_assistant') === true;
}

function buildOpeningTranscriptItem(
  payload: OpeningPayload,
  preset: OpeningPreset,
  status: DemoStatus,
): TranscriptItem {
  const renderSource = composeOpeningSeedText(payload, preset);
  const regexText = applyRegexForDisplay(renderSource, 'assistant');
  const finalHtml = buildFinalHtml(renderSource, 0);

  return {
    message_id: 0,
    role: 'assistant',
    roleLabel: '开局',
    isOpening: true,
    raw: renderSource,
    renderSource,
    content: payload.opening_content || renderSource,
    preview: stripTagsForPreview(payload.opening_content || payload.base.first_line || payload.base.world_intro).slice(
      0,
      80,
    ),
    regexText,
    streamHtml: buildStreamStageHtml(regexText),
    finalHtml,
    options: payload.options,
    hidden: false,
    phase: payload.state === 'generating' || status === 'streaming' ? 'stream' : 'done',
    isLatest: false,
    isStreaming: payload.state === 'generating' || status === 'streaming',
    canOpenDetail: true,
    canDeleteFrom: false,
  };
}

export function useStreamingDemo() {
  const initialContainerMessageId = readCurrentContainerMessageId();
  const input = ref('');
  const busy = ref(false);
  const status = ref<DemoStatus>('idle');
  const streamText = ref('');
  const finalText = ref('');
  const errorText = ref('');
  const assistantMessageId = ref<number | null>(null);
  const transcript = ref<TranscriptItem[]>([]);
  const filterMode = ref<TranscriptFilterMode>('assistant');
  const density = ref<TranscriptDensity>('comfortable');
  const readingMode = ref<ReadingMode>('following_latest');
  const selectedItem = ref<TranscriptItem | null>(null);
  const openingExpanded = ref(true);
  const logs = ref<ReaderLogItem[]>([]);
  const editingUserMessageId = ref<number | null>(null);
  const editingUserDraft = ref('');
  const rollbackConfirmMessageId = ref<number | null>(null);
  const openingPreset = ref<OpeningPreset>(getDefaultOpeningPreset());
  const openingPayload = ref<OpeningPayload>(getDefaultOpeningPayload(openingPreset.value));
  const openingWorldModes = getOpeningWorldModes();
  const openingRoutes = getOpeningRoutes();
  const isOpeningWorkbenchHost = initialContainerMessageId === 0;

  const followLatest = computed(() => readingMode.value === 'following_latest');

  const readingModeLabel = computed(() => (readingMode.value === 'following_latest' ? '跟随最新' : '浏览历史'));

  let patchQueue = Promise.resolve();
  let latestPatchedMessage = '';
  let generationStops: StopHandle[] = [];
  let openingGenerationStops: StopHandle[] = [];
  let historyStops: StopHandle[] = [];
  let hidePolicyTimer = 0;
  let hidePolicyRunning = false;
  let hidePolicyRerun = false;
  let externalSyncTimer = 0;
  let readerStatePersistTimer = 0;

  const HOST_VISIBILITY_CLASS = 'stream-demo-workbench-active';
  const HOST_VISIBILITY_STYLE_ID = 'stream-demo-host-visibility-style';

  const visibleTranscript = computed(() => {
    if (filterMode.value === 'all') return transcript.value;
    return transcript.value.filter(
      item => item.role === 'assistant' || item.isOpening || item.message_id === latestUserItem.value?.message_id,
    );
  });

  const transcriptStats = computed(() => ({
    total: transcript.value.length,
    assistant: transcript.value.filter(item => item.role === 'assistant').length,
  }));

  const shouldShowOpeningSetup = computed(
    () => isOpeningWorkbenchHost && ['placeholder', 'configuring'].includes(openingPayload.value.state),
  );

  const latestUserItem = computed(() => {
    for (let i = transcript.value.length - 1; i >= 0; i -= 1) {
      const item = transcript.value[i];
      if (item.role === 'user') return item;
    }
    return null;
  });

  const inputHasText = computed(() => String(input.value ?? '').trim().length > 0);

  function queuePersistReaderChatState() {
    if (readerStatePersistTimer) window.clearTimeout(readerStatePersistTimer);
    readerStatePersistTimer = window.setTimeout(() => {
      readerStatePersistTimer = 0;
      patchReaderChatState({
        initialized: true,
        opening_message_id: transcript.value.find(item => item.isOpening)?.message_id ?? null,
        latest_user_message_id: latestUserItem.value?.message_id ?? null,
        latest_assistant_message_id: latestAssistantItem.value?.message_id ?? null,
        reading_mode: readingMode.value,
        density: density.value,
        opening_expanded: openingExpanded.value,
      });
    }, 80);
  }

  function restoreReaderChatState() {
    const containerId = readCurrentContainerMessageId();
    if (containerId !== 0) {
      return;
    }

    const state = readReaderChatState();
    const restoredMode = normalizeReadingMode(state.reading_mode);
    const restoredDensity = normalizeDensity(state.density);
    const restoredAssistant = normalizeMessageId(state.latest_assistant_message_id);
    if (restoredMode) readingMode.value = restoredMode;
    if (restoredDensity) density.value = restoredDensity;
    if (typeof state.opening_expanded === 'boolean') openingExpanded.value = state.opening_expanded;
    if (restoredAssistant != null) assistantMessageId.value = restoredAssistant;
    if (state.version !== READER_CHAT_STATE_VERSION) {
      queuePersistReaderChatState();
    }

    const restoredOpeningPayload = readOpeningPayloadFromChat();
    if (restoredOpeningPayload) {
      openingPayload.value = restoredOpeningPayload;
    } else {
      replaceOpeningPayloadInChat(openingPayload.value);
    }
  }

  function appendLog(type: ReaderLogItem['type'], title: string, detail: string) {
    logs.value = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title,
        detail,
        createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      },
      ...logs.value,
    ].slice(0, 30);
  }

  const statusLabel = computed(() => {
    if (status.value === 'preparing') return '准备中';
    if (status.value === 'streaming') return '流式中';
    if (status.value === 'persisting') return '写回中';
    if (status.value === 'done') return '已完成';
    if (status.value === 'error') return '错误';
    return '空闲';
  });

  const latestAssistantItem = computed(() => {
    for (let i = transcript.value.length - 1; i >= 0; i -= 1) {
      const item = transcript.value[i];
      if (item.role === 'assistant') return item;
    }
    return null;
  });

  const latestAssistantSwipeState = computed(() => {
    try {
      const list = getChatMessages('0-{{lastMessageId}}', { include_swipes: true, hide_state: 'all' }) as any[];
      const messages = Array.isArray(list) ? list : [];

      for (let indexFromEnd = messages.length - 1; indexFromEnd >= 0; indexFromEnd -= 1) {
        const message = messages[indexFromEnd];
        const messageId = Math.trunc(Number(message?.message_id));
        if (!Number.isFinite(messageId)) continue;
        if (((message?.role as string) || 'assistant') !== 'assistant') continue;

        const swipes = Array.isArray(message?.swipes) ? message.swipes : [];
        const count = swipes.length;
        if (count <= 1) continue;

        const rawIndex = Number(message?.swipe_id);
        const index = Number.isFinite(rawIndex) ? Math.min(Math.max(Math.trunc(rawIndex), 0), count - 1) : count - 1;
        return {
          messageId,
          count,
          index,
          canPrev: index > 0,
          canNext: index < count - 1,
        };
      }

      return { messageId: null as number | null, count: 0, index: 0, canPrev: false, canNext: false };
    } catch {
      return { messageId: null as number | null, count: 0, index: 0, canPrev: false, canNext: false };
    }
  });

  const latestAssistantSwipeMessageId = computed(() => latestAssistantSwipeState.value.messageId);
  const canSwipeLatestAssistantPrev = computed(() => latestAssistantSwipeState.value.canPrev);
  const canSwipeLatestAssistantNext = computed(() => latestAssistantSwipeState.value.canNext);
  const latestAssistantSwipeLabel = computed(() => {
    const swipeState = latestAssistantSwipeState.value;
    if (swipeState.messageId == null || swipeState.count <= 1) return '';
    return `${swipeState.index + 1}/${swipeState.count}`;
  });

  const readerSummary = computed<ReaderSummary>(() => {
    const turnCount = transcript.value.filter(item => item.role === 'assistant' && !item.isOpening).length;
    const latestUserPreview = latestUserItem.value?.preview ?? '';
    const latestAssistantPreview = latestAssistantItem.value?.preview ?? '';
    const assistantAnchorLabel = assistantMessageId.value != null ? `#${assistantMessageId.value}` : '-';
    const storySummary = (() => {
      const source = latestAssistantItem.value?.preview || transcript.value.find(item => item.isOpening)?.preview || '';
      return source.slice(0, 120);
    })();

    return {
      turnCount,
      latestUserPreview,
      latestAssistantPreview,
      readingModeLabel: readingModeLabel.value,
      statusLabel: statusLabel.value,
      assistantAnchorLabel,
      storySummary,
    };
  });

  function closeDetail() {
    selectedItem.value = null;
  }

  function updateOpeningMeta(key: 'character' | 'time' | 'location', value: string) {
    openingPayload.value = {
      ...openingPayload.value,
      state: openingPayload.value.state === 'ready' ? 'configuring' : openingPayload.value.state,
      meta: {
        ...openingPayload.value.meta,
        [key]: String(value ?? ''),
      },
    };
    replaceOpeningPayloadInChat(openingPayload.value);
  }

  function updateOpeningWorldMode(value: string) {
    const worldMode = getOpeningWorldMode(value) ?? openingWorldModes[0] ?? null;
    const nextRouteId = String(openingPayload.value.route_id ?? '').trim() || worldMode?.recommended_main_route || '';
    openingPayload.value = {
      ...openingPayload.value,
      state: openingPayload.value.state === 'ready' ? 'configuring' : openingPayload.value.state,
      world_mode_id: worldMode?.id || value,
      route_id: nextRouteId,
      world_mode_brief: '',
    };
    replaceOpeningPayloadInChat(openingPayload.value);
  }

  function updateOpeningRoute(value: string) {
    const route = getOpeningRoute(value) ?? openingRoutes[0] ?? null;
    openingPayload.value = {
      ...openingPayload.value,
      state: openingPayload.value.state === 'ready' ? 'configuring' : openingPayload.value.state,
      route_id: route?.name || value,
      world_mode_brief: '',
    };
    replaceOpeningPayloadInChat(openingPayload.value);
  }

  function updateOpeningStream(value: boolean) {
    openingPayload.value = {
      ...openingPayload.value,
      use_stream: value === true,
    };
    replaceOpeningPayloadInChat(openingPayload.value);
  }

  function clearOpeningGenerationListeners() {
    openingGenerationStops.forEach(stop => stop?.stop?.());
    openingGenerationStops = [];
  }

  function bindOpeningGenerationListeners() {
    clearOpeningGenerationListeners();
    let streamedRaw = '';

    try {
      openingGenerationStops.push(
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY as any, (token: string) => {
          streamedRaw += String(token ?? '');
          status.value = 'streaming';
          openingPayload.value = {
            ...openingPayload.value,
            state: 'generating',
            streaming_raw: streamedRaw,
            world_mode_brief: extractOpeningWorldModeBriefLoose(streamedRaw),
            prompt_echo: extractOpeningPromptEchoLoose(streamedRaw),
            opening_content: extractOpeningContentLoose(streamedRaw),
            update_variable_block: extractUpdateVariableBlockLoose(streamedRaw),
          };
          rebuildTranscript();
        }),
      );
    } catch {
      // ignore
    }
  }

  function updateOpeningField(key: string, value: string) {
    openingPayload.value = {
      ...openingPayload.value,
      state: openingPayload.value.state === 'ready' ? 'configuring' : openingPayload.value.state,
      user_input: {
        ...openingPayload.value.user_input,
        [key]: String(value ?? ''),
      },
    };
    replaceOpeningPayloadInChat(openingPayload.value);
  }

  function setReadingMode(nextMode: ReadingMode) {
    if (readingMode.value === nextMode) return;
    readingMode.value = nextMode;
    queuePersistReaderChatState();
  }

  function toggleOpeningExpanded() {
    openingExpanded.value = !openingExpanded.value;
    queuePersistReaderChatState();
  }

  function openDetail(item: TranscriptItem) {
    selectedItem.value = item;
  }

  function refreshWorkbench() {
    rebuildTranscript();
    queueHidePolicy('manual_refresh');
    appendLog('info', '手动刷新', '已刷新 transcript，并重新收口 hidden 状态');
    toastr?.info?.('已刷新工作台');
  }

  function collectHostDocuments(): Document[] {
    const docs: Document[] = [];
    const push = (doc: Document | null | undefined) => {
      if (!doc || docs.includes(doc)) return;
      docs.push(doc);
    };

    push(document);
    try {
      push(window.parent?.document);
    } catch {
      // ignore
    }
    try {
      push(window.top?.document);
    } catch {
      // ignore
    }
    return docs;
  }

  function setHostTranscriptVisibility(active: boolean) {
    for (const doc of collectHostDocuments()) {
      const body = doc.body;
      const head = doc.head;
      if (!body || !head) continue;

      const existing = doc.getElementById(HOST_VISIBILITY_STYLE_ID);
      if (active) {
        if (!existing) {
          const style = doc.createElement('style');
          style.id = HOST_VISIBILITY_STYLE_ID;
          style.textContent = `
            body.${HOST_VISIBILITY_CLASS} #chat > .mes[mesid]:not([mesid='0']) {
              display: none !important;
            }
          `;
          head.appendChild(style);
        }
        body.classList.add(HOST_VISIBILITY_CLASS);
      } else {
        body.classList.remove(HOST_VISIBILITY_CLASS);
        existing?.remove();
      }
    }
  }

  async function syncOpeningAssistantMessage(refresh: HideRefreshMode = 'none', createIfMissing = true) {
    if (readCurrentContainerMessageId() !== 0) return;
    if (openingPayload.value.state !== 'ready') return;

    const nextMessage = buildOpeningAssistantText(openingPayload.value);
    if (!nextMessage) return;

    const list = getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' }) as any[];
    const all = Array.isArray(list) ? list : [];
    const existing = all.find(message => {
      const id = Math.trunc(Number(message?.message_id));
      return Number.isFinite(id) && id > 0 && isOpeningAssistantMessage(message);
    });
    const nextData = existing?.data ? _.cloneDeep(existing.data) : {};
    _.set(nextData, 'stream_demo.opening_assistant', true);

    if (existing) {
      await setChatMessages(
        [
          {
            message_id: Math.trunc(Number(existing.message_id)),
            message: nextMessage,
            is_hidden: false,
            data: nextData,
          },
        ],
        { refresh },
      );
      return;
    }

    if (!createIfMissing) return;

    const firstAfterZero = all
      .map(message => Math.trunc(Number(message?.message_id)))
      .find(id => Number.isFinite(id) && id > 0);

    await createChatMessages([{ role: 'assistant', is_hidden: false, message: nextMessage, data: nextData }], {
      insert_before: firstAfterZero ?? 'end',
      refresh,
    });

  }

  function setEditingUserDraft(value: string) {
    editingUserDraft.value = String(value ?? '');
  }

  function cancelInlineEdit() {
    editingUserMessageId.value = null;
    editingUserDraft.value = '';
  }

  function startInlineEdit(item: TranscriptItem) {
    if (busy.value || item.role !== 'user' || item.message_id !== latestUserItem.value?.message_id) return;
    rollbackConfirmMessageId.value = null;
    editingUserMessageId.value = item.message_id;
    editingUserDraft.value = item.raw;
  }

  function cancelRollbackDelete() {
    rollbackConfirmMessageId.value = null;
  }

  function requestRollbackDelete(item: TranscriptItem) {
    if (busy.value || item.isOpening || item.canDeleteFrom !== true) return;
    cancelInlineEdit();
    rollbackConfirmMessageId.value = item.message_id;
  }

  function clearGenerationListeners() {
    generationStops.forEach(stop => stop?.stop?.());
    generationStops = [];
  }

  async function emitOfficialGenerationLifecycle(messageId: number | null | undefined, type: 'normal' | 'regenerate') {
    const normalizedId = Number(messageId);
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;

    try {
      await eventEmit(tavern_events.MESSAGE_RECEIVED as any, Math.trunc(normalizedId), type);
    } catch {
      // ignore
    }

    try {
      await eventEmit(tavern_events.GENERATION_ENDED as any, Math.trunc(normalizedId));
    } catch {
      // ignore
    }

    try {
      await eventEmit(tavern_events.MESSAGE_UPDATED as any, Math.trunc(normalizedId));
    } catch {
      // ignore
    }
  }

  function syncTranscriptFlags(items: TranscriptItem[]): TranscriptItem[] {
    return items.map(item => ({
      ...item,
      isLatest: assistantMessageId.value === item.message_id,
      isStreaming:
        assistantMessageId.value === item.message_id && (status.value === 'streaming' || item.phase === 'stream'),
    }));
  }

  function createLocalTranscriptItem(input: {
    id: number;
    role: TranscriptItem['role'];
    raw: string;
    hidden: boolean;
    isOpening?: boolean;
  }): TranscriptItem {
    return buildTranscriptItem({
      id: input.id,
      role: input.role,
      raw: input.raw,
      hidden: input.hidden,
      isOpening: input.isOpening,
      latestAssistantId: assistantMessageId.value,
      status: status.value,
    });
  }

  function upsertTranscriptItem(nextItem: TranscriptItem) {
    const current = transcript.value.filter(item => item.message_id !== nextItem.message_id);
    transcript.value = syncTranscriptFlags(sortTranscriptItems([...current, nextItem]));
    if (selectedItem.value?.message_id === nextItem.message_id) {
      selectedItem.value = transcript.value.find(item => item.message_id === nextItem.message_id) ?? null;
    }
  }

  function readMessagesAfterContainer(): BaseChatMessage[] {
    const containerId = readCurrentContainerMessageId();
    try {
      const list = getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' }) as any[];
      return (Array.isArray(list) ? list : [])
        .map(message => ({
          message_id: Math.trunc(Number(message?.message_id)),
          role: ((message?.role as string) || 'assistant') as BaseChatMessage['role'],
          message: String(message?.message ?? ''),
          is_hidden: message?.is_hidden === true,
        }))
        .filter(item => Number.isFinite(item.message_id) && (containerId == null || item.message_id > containerId));
    } catch {
      return [];
    }
  }

  function resolveHidePolicyRefresh(reason: string): HideRefreshMode {
    if (reason === 'mounted') return 'affected';
    if (reason.startsWith('external:chat_id_changed')) return 'affected';
    if (reason.startsWith('external:message_sent')) return 'affected';
    if (reason.startsWith('external:message_received')) return 'affected';
    if (reason.startsWith('external:more_messages_loaded')) return 'affected';
    return 'none';
  }

  function resolveHidePolicyDelay(reason: string): number {
    return resolveHidePolicyRefresh(reason) === 'affected' ? 0 : 80;
  }

  async function applyHidePolicy(reason: string) {
    if (readCurrentContainerMessageId() !== 0) {
      setHostTranscriptVisibility(false);
      return;
    }
    setHostTranscriptVisibility(true);
    if (hidePolicyRunning) {
      hidePolicyRerun = true;
      return;
    }
    hidePolicyRunning = true;
    try {
      do {
        hidePolicyRerun = false;
        const refresh = resolveHidePolicyRefresh(reason);
        const patch = readMessagesAfterContainer()
          .filter(item => item.is_hidden === true)
          .map(item => ({ message_id: item.message_id, is_hidden: false }));
        if (patch.length === 0) continue;
        await setChatMessages(patch, { refresh });
      } while (hidePolicyRerun);
    } catch (error) {
      console.warn('[stream-demo] hide policy failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      hidePolicyRunning = false;
    }
  }

  function queueHidePolicy(reason: string) {
    if (hidePolicyTimer) window.clearTimeout(hidePolicyTimer);
    hidePolicyTimer = window.setTimeout(() => {
      hidePolicyTimer = 0;
      void applyHidePolicy(reason);
    }, resolveHidePolicyDelay(reason));
  }

  function queueExternalSync(reason: string) {
    if (externalSyncTimer) window.clearTimeout(externalSyncTimer);
    const scopedReason = `external:${reason}`;
    externalSyncTimer = window.setTimeout(() => {
      externalSyncTimer = 0;
      rebuildTranscript();
      queueHidePolicy(scopedReason);
    }, resolveHidePolicyDelay(scopedReason));
  }

  function handleHostRefreshEvent(name: string) {
    if (
      busy.value &&
      (name === tavern_events.GENERATION_STARTED ||
        name === tavern_events.STREAM_TOKEN_RECEIVED ||
        name === tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED)
    ) {
      readingMode.value = 'following_latest';
      status.value = 'streaming';
      queuePersistReaderChatState();
    }

    queueExternalSync(String(name));
  }

  function rebuildTranscript() {
    const containerId = readCurrentContainerMessageId();
    try {
      const list = getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' }) as any[];
      const all = Array.isArray(list) ? list : [];
      const normalized: TranscriptItem[] = [];
      let nextLatestAssistantId: number | null = null;

      if (containerId === 0) {
        if (openingPayload.value.state !== 'placeholder') {
          normalized.push(buildOpeningTranscriptItem(openingPayload.value, openingPreset.value, status.value));
        } else {
          const opening = all.find(message => Math.trunc(Number(message?.message_id)) === containerId);
          if (opening) {
            const openingRole = ((opening?.role as string) || 'assistant') as TranscriptItem['role'];
            if (openingRole === 'assistant') nextLatestAssistantId = containerId;
            normalized.push(
              buildTranscriptItem({
                id: containerId,
                role: openingRole,
                raw: String(opening?.message ?? ''),
                hidden: opening?.is_hidden === true,
                isOpening: true,
                latestAssistantId: null,
                status: status.value,
              }),
            );
          }
        }
      }

      for (const message of all) {
        const message_id = Number(message?.message_id);
        if (!Number.isFinite(message_id)) continue;
        const id = Math.trunc(message_id);
        if (containerId != null && id <= containerId) continue;
        if (isOpeningAssistantMessage(message)) continue;
        const role = ((message?.role as string) || 'assistant') as TranscriptItem['role'];
        if (role === 'assistant') nextLatestAssistantId = id;

        normalized.push(
          buildTranscriptItem({
            id,
            role,
            raw: String(message?.message ?? ''),
            hidden: message?.is_hidden === true,
            latestAssistantId: null,
            status: status.value,
          }),
        );
      }

      assistantMessageId.value = nextLatestAssistantId;
      transcript.value = syncTranscriptFlags(normalized);
      if (selectedItem.value) {
        selectedItem.value = transcript.value.find(item => item.message_id === selectedItem.value?.message_id) ?? null;
      }
    } catch {
      transcript.value = [];
    }
    queueHidePolicy('rebuild');
    queuePersistReaderChatState();
  }

  async function patchAssistantMessage(phase: 'stream' | 'done') {
    const messageId = assistantMessageId.value;
    if (messageId == null) return;

    const nextMessage = buildStreamDemoMessage(
      phase === 'done' ? finalText.value || streamText.value : streamText.value,
      phase,
    );
    if (nextMessage === latestPatchedMessage) return;
    latestPatchedMessage = nextMessage;

    patchQueue = patchQueue.then(async () => {
      await setChatMessages([{ message_id: messageId, message: nextMessage, is_hidden: false }], { refresh: 'none' });
      upsertTranscriptItem(
        createLocalTranscriptItem({
          id: messageId,
          role: 'assistant',
          raw: nextMessage,
          hidden: false,
        }),
      );
    });
    await patchQueue;
  }

  async function deleteFromMessageId(messageId: number) {
    const target = Math.trunc(Number(messageId));
    if (!Number.isFinite(target)) return;
    const all = readMessagesAfterContainer();
    const ids = all
      .map(item => item.message_id)
      .filter(id => id >= target)
      .sort((a, b) => a - b);
    if (ids.length === 0) return;
    await deleteChatMessages(ids, { refresh: 'all' });
    if (assistantMessageId.value != null && ids.includes(assistantMessageId.value)) {
      assistantMessageId.value = null;
    }
    latestPatchedMessage = '';
    cancelInlineEdit();
    cancelRollbackDelete();
    rebuildTranscript();
    appendLog('action', '回退删除', `已删除楼层 #${ids[0]} 到 #${ids[ids.length - 1]}`);
  }

  async function runGenerationFlow(options: { prompt: string; createUser: boolean }) {
    const prompt = String(options.prompt ?? '').trim();
    if (!prompt || busy.value) return;

    busy.value = true;
    status.value = 'preparing';
    streamText.value = '';
    finalText.value = '';
    errorText.value = '';
    assistantMessageId.value = null;
    latestPatchedMessage = '';
    bindGenerationEvents();

    try {
      if (options.createUser) {
        await createChatMessages([{ role: 'user', message: prompt, is_hidden: false }], { refresh: 'none' });
        const userId = Number(getLastMessageId?.());
        if (Number.isFinite(userId)) {
          upsertTranscriptItem(
            createLocalTranscriptItem({
              id: Math.trunc(userId),
              role: 'user',
              raw: prompt,
              hidden: false,
            }),
          );
        }
        appendLog('action', '发送用户输入', stripTagsForPreview(prompt).slice(0, 80) || '(空输入)');
      }

      const generatePromise = generate({
        should_stream: true,
        max_chat_history: 'all',
      });
      await createAssistantPlaceholder();
      readingMode.value = 'following_latest';

      const result = String(await generatePromise).trim();
      finalText.value = result;
      status.value = 'persisting';
      await patchAssistantMessage('done');
      await emitOfficialGenerationLifecycle(assistantMessageId.value, options.createUser ? 'normal' : 'regenerate');
      status.value = 'done';
      transcript.value = syncTranscriptFlags(transcript.value);
      queueHidePolicy('generation_done');
      appendLog('action', '生成完成', stripTagsForPreview(result).slice(0, 80) || '(空回复)');
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      if (assistantMessageId.value != null) {
        finalText.value = `生成失败：${errorText.value}`;
        try {
          await patchAssistantMessage('done');
        } catch {
          // ignore
        }
      }
      transcript.value = syncTranscriptFlags(transcript.value);
      toastr?.error?.(`流式 demo 失败：${errorText.value}`);
      appendLog('error', '生成失败', errorText.value || '未知错误');
    } finally {
      clearGenerationListeners();
      busy.value = false;
    }
  }

  async function triggerNativeRegenerate(anchorMessageId: number) {
    const latestUser = latestUserItem.value;
    if (busy.value) return;
    if (!latestUser || latestUser.role !== 'user' || latestUser.message_id !== anchorMessageId) {
      toastr?.warning?.('未定位到最后一条 user，无法重生');
      return;
    }

    readingMode.value = 'following_latest';
    queuePersistReaderChatState();
    appendLog('action', '重新生成', `已按楼层 #${anchorMessageId} 走受控 hidden 链重生`);
    await runGenerationFlow({ prompt: latestUser.raw, createUser: false });
  }

  async function rollLatestTurn() {
    const latestUser = latestUserItem.value;
    if (!latestUser || latestUser.role !== 'user') {
      toastr?.info?.('当前还没有可重新生成的 user 楼层');
      return;
    }
    await triggerNativeRegenerate(latestUser.message_id);
  }

  async function confirmInlineEditRegenerate(item: TranscriptItem) {
    const latestUser = latestUserItem.value;
    const targetId = Math.trunc(Number(item.message_id));
    const nextText = String(editingUserDraft.value ?? '').trim();
    if (!latestUser || latestUser.role !== 'user' || latestUser.message_id !== targetId) {
      toastr?.warning?.('只能修改最后一条 user 输入');
      cancelInlineEdit();
      return;
    }
    if (!nextText) {
      toastr?.warning?.('请输入修改后的提示词');
      return;
    }
    if (busy.value) return;

    busy.value = true;
    status.value = 'preparing';
    errorText.value = '';

    try {
      await setChatMessages([{ message_id: targetId, message: nextText, is_hidden: latestUser.hidden }], {
        refresh: 'none',
      });
      const trailingIds = readMessagesAfterContainer()
        .map(message => message.message_id)
        .filter(id => id > targetId)
        .sort((a, b) => a - b);
      if (trailingIds.length > 0) {
        await deleteChatMessages(trailingIds, { refresh: 'none' });
      }
      appendLog('action', '改词重生', stripTagsForPreview(nextText).slice(0, 80) || '(空输入)');
      cancelInlineEdit();
      rebuildTranscript();
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      busy.value = false;
      toastr?.error?.(`改词失败：${errorText.value}`);
      appendLog('error', '改词失败', errorText.value || '未知错误');
      return;
    }

    busy.value = false;
    await triggerNativeRegenerate(targetId);
  }

  async function confirmRollbackDelete(item: TranscriptItem) {
    if (rollbackConfirmMessageId.value !== item.message_id) {
      rollbackConfirmMessageId.value = item.message_id;
      return;
    }
    await deleteFromMessageId(item.message_id);
  }

  async function swipeLatestAssistant(direction: 'prev' | 'next') {
    const swipeState = latestAssistantSwipeState.value;
    const messageId = swipeState.messageId;
    if (messageId == null) {
      toastr?.info?.('当前最新 assistant 没有可切换的 swipe');
      return;
    }
    if (direction === 'prev' && !canSwipeLatestAssistantPrev.value) return;
    if (direction === 'next' && !canSwipeLatestAssistantNext.value) return;
    const nextSwipeId = direction === 'prev' ? swipeState.index - 1 : swipeState.index + 1;
    if (nextSwipeId < 0 || nextSwipeId >= swipeState.count) return;
    await setChatMessages([{ message_id: messageId, swipe_id: nextSwipeId, is_hidden: false }], { refresh: 'none' });
    appendLog('action', '切换 Swipe', `${direction === 'prev' ? '切到上一页' : '切到下一页'}（楼层 #${messageId}）`);
    rebuildTranscript();
    queueHidePolicy(`swipe:${direction}`);
  }

  async function generateOpening() {
    if (busy.value) return;

    if (!getOpeningWorldMode(openingPayload.value.world_mode_id)) {
      toastr?.warning?.('请先选择有效的世界观档位');
      return;
    }
    if (!getOpeningRoute(openingPayload.value.route_id)) {
      toastr?.warning?.('请先选择有效的开局主流派');
      return;
    }

    const missing = openingPreset.value.form_schema.find(
      field => field.required && !String(openingPayload.value.user_input[field.key] ?? '').trim(),
    );
    if (missing) {
      toastr?.warning?.(`请先填写：${missing.label}`);
      return;
    }

    busy.value = true;
    status.value = 'preparing';
    errorText.value = '';

    openingPayload.value = {
      ...openingPayload.value,
      state: 'generating',
      streaming_raw: '',
      world_mode_brief: '',
      prompt_echo: '',
      opening_content: '',
      options: [],
      update_variable_block: '',
    };
    replaceOpeningPayloadInChat(openingPayload.value);
    rebuildTranscript();

    try {
      if (openingPayload.value.use_stream) {
        bindOpeningGenerationListeners();
      }
      const result = await generate({
        user_input: buildOpeningPrompt(openingPreset.value, openingPayload.value),
        should_stream: openingPayload.value.use_stream,
      });
      openingPayload.value = {
        ...openingPayload.value,
        state: 'ready',
        streaming_raw: '',
        world_mode_brief: extractOpeningWorldModeBrief(result),
        prompt_echo: extractOpeningPromptEcho(result),
        opening_content: extractOpeningContent(result),
        options: extractOpeningOptions(result),
        update_variable_block: extractUpdateVariableBlock(result),
      };
      replaceOpeningPayloadInChat(openingPayload.value);
      await syncOpeningAssistantMessage('none', true);
      rebuildTranscript();
      status.value = 'done';
      appendLog(
        'action',
        '生成开局',
        stripTagsForPreview(openingPayload.value.opening_content).slice(0, 80) || '(空开局)',
      );
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      openingPayload.value = {
        ...openingPayload.value,
        state: 'configuring',
        streaming_raw: '',
        update_variable_block: '',
      };
      replaceOpeningPayloadInChat(openingPayload.value);
      toastr?.error?.(`开局生成失败：${errorText.value}`);
    } finally {
      clearOpeningGenerationListeners();
      busy.value = false;
    }
  }

  function bindHistoryRefreshEvents() {
    if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') return;
    const names = [
      tavern_events.CHAT_CHANGED,
      tavern_events.GENERATION_STARTED,
      tavern_events.GENERATION_ENDED,
      tavern_events.MESSAGE_SENT,
      tavern_events.MESSAGE_EDITED,
      tavern_events.MESSAGE_RECEIVED,
      tavern_events.MESSAGE_UPDATED,
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MESSAGE_DELETED,
      tavern_events.MORE_MESSAGES_LOADED,
      tavern_events.STREAM_TOKEN_RECEIVED,
      tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED,
    ];
    historyStops = names.map(name => {
      try {
        return eventOn(name as any, () => handleHostRefreshEvent(String(name)));
      } catch {
        return null;
      }
    });
  }

  function bindGenerationEvents() {
    clearGenerationListeners();
    if (typeof eventOn !== 'function' || typeof iframe_events === 'undefined') return;

    try {
      generationStops.push(
        eventOn(iframe_events.GENERATION_STARTED as any, () => {
          status.value = 'streaming';
          transcript.value = syncTranscriptFlags(transcript.value);
        }),
      );
    } catch {
      // ignore
    }

    try {
      generationStops.push(
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY as any, (token: string) => {
          streamText.value += String(token ?? '');
          status.value = 'streaming';
          void patchAssistantMessage('stream');
        }),
      );
    } catch {
      // ignore
    }

    try {
      generationStops.push(
        eventOn(iframe_events.GENERATION_ENDED as any, (text: string) => {
          finalText.value = String(text ?? '').trim();
        }),
      );
    } catch {
      // ignore
    }
  }

  async function createAssistantPlaceholder() {
    await createChatMessages([{ role: 'assistant', is_hidden: false, message: buildStreamDemoMessage('', 'stream') }], {
      refresh: 'none',
    });
    const id = Number(getLastMessageId?.());
    assistantMessageId.value = Number.isFinite(id) ? Math.trunc(id) : null;
    latestPatchedMessage = '';
    if (assistantMessageId.value != null) {
      upsertTranscriptItem(
        createLocalTranscriptItem({
          id: assistantMessageId.value,
          role: 'assistant',
          raw: buildStreamDemoMessage('', 'stream'),
          hidden: false,
        }),
      );
    }
    await patchAssistantMessage('stream');
  }

  async function runDemo() {
    if (openingPayload.value.state !== 'ready') {
      toastr?.info?.('请先完成开局配置并生成 opening');
      return;
    }
    const prompt = String(input.value ?? '').trim();
    await runGenerationFlow({ prompt, createUser: true });
    input.value = '';
  }

  onMounted(() => {
    restoreReaderChatState();
    void syncOpeningAssistantMessage('none', false);
    rebuildTranscript();
    bindHistoryRefreshEvents();
    queueHidePolicy('mounted');
  });

  watch(
    () => latestUserItem.value?.message_id ?? null,
    latestId => {
      if (editingUserMessageId.value != null && editingUserMessageId.value !== latestId) {
        cancelInlineEdit();
      }
    },
  );

  watch(
    () => transcript.value.map(item => item.message_id).join(','),
    ids => {
      if (rollbackConfirmMessageId.value == null) return;
      if (!ids.split(',').includes(String(rollbackConfirmMessageId.value))) {
        cancelRollbackDelete();
      }
    },
  );

  onBeforeUnmount(() => {
    setHostTranscriptVisibility(false);
    clearGenerationListeners();
    historyStops.forEach(stop => stop?.stop?.());
    historyStops = [];
    if (hidePolicyTimer) {
      window.clearTimeout(hidePolicyTimer);
      hidePolicyTimer = 0;
    }
    if (externalSyncTimer) {
      window.clearTimeout(externalSyncTimer);
      externalSyncTimer = 0;
    }
    if (readerStatePersistTimer) {
      window.clearTimeout(readerStatePersistTimer);
      readerStatePersistTimer = 0;
    }
    clearOpeningGenerationListeners();
  });

  return {
    input,
    busy,
    status,
    streamText,
    finalText,
    errorText,
    assistantMessageId,
    filterMode,
    density,
    readingMode,
    readingModeLabel,
    followLatest,
    openingExpanded,
    selectedItem,
    transcript,
    visibleTranscript,
    transcriptStats,
    latestUserItem,
    latestAssistantItem,
    inputHasText,
    editingUserMessageId,
    editingUserDraft,
    rollbackConfirmMessageId,
    latestAssistantSwipeMessageId,
    canSwipeLatestAssistantPrev,
    canSwipeLatestAssistantNext,
    latestAssistantSwipeLabel,
    openingPreset,
    openingPayload,
    openingWorldModes,
    openingRoutes,
    shouldShowOpeningSetup,
    readerSummary,
    logs,
    runDemo,
    rollLatestTurn,
    refreshWorkbench,
    updateOpeningMeta,
    updateOpeningField,
    updateOpeningWorldMode,
    updateOpeningRoute,
    updateOpeningStream,
    generateOpening,
    deleteFromMessageId,
    startInlineEdit,
    setEditingUserDraft,
    cancelInlineEdit,
    confirmInlineEditRegenerate,
    requestRollbackDelete,
    cancelRollbackDelete,
    confirmRollbackDelete,
    swipeLatestAssistant,
    setReadingMode,
    toggleOpeningExpanded,
    rebuildTranscript,
    openDetail,
    closeDetail,
  };
}

import {
  buildStreamDemoMessage,
  extractStreamDemoContent,
  extractStreamDemoOptions,
  extractStreamDemoPhase,
  isStreamDemoMessage,
  stripStreamDemoRuntimeTags,
  stripTagsForPreview,
} from '../../shared/message';
import type { DemoStatus, TranscriptDensity, TranscriptFilterMode, TranscriptItem } from './types';

type StopHandle = { stop?: () => void } | null;

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

export function useStreamingDemo() {
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
  const followLatest = ref(true);
  const selectedItem = ref<TranscriptItem | null>(null);

  let patchQueue = Promise.resolve();
  let latestPatchedMessage = '';
  let generationStops: StopHandle[] = [];
  let historyStops: StopHandle[] = [];
  let hidePolicyTimer = 0;
  let hidePolicyRunning = false;
  let hidePolicyRerun = false;

  const visibleTranscript = computed(() => {
    if (filterMode.value === 'all') return transcript.value;
    return transcript.value.filter(item => item.role === 'assistant' || item.isOpening);
  });

  const transcriptStats = computed(() => ({
    total: transcript.value.length,
    assistant: transcript.value.filter(item => item.role === 'assistant').length,
  }));

  const latestUserItem = computed(() => {
    for (let i = transcript.value.length - 1; i >= 0; i -= 1) {
      const item = transcript.value[i];
      if (item.role === 'user') return item;
    }
    return null;
  });

  const inputHasText = computed(() => String(input.value ?? '').trim().length > 0);

  function closeDetail() {
    selectedItem.value = null;
  }

  function openDetail(item: TranscriptItem) {
    selectedItem.value = item;
  }

  function clearGenerationListeners() {
    generationStops.forEach(stop => stop?.stop?.());
    generationStops = [];
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

  async function applyHidePolicy(reason: string) {
    if (hidePolicyRunning) {
      hidePolicyRerun = true;
      return;
    }
    hidePolicyRunning = true;
    try {
      do {
        hidePolicyRerun = false;
        const patch = readMessagesAfterContainer()
          .filter(item => item.is_hidden !== true)
          .map(item => ({ message_id: item.message_id, is_hidden: true }));
        if (patch.length === 0) continue;
        await setChatMessages(patch, { refresh: 'affected' });
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
    }, 80);
  }

  function rebuildTranscript() {
    const containerId = readCurrentContainerMessageId();
    try {
      const list = getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' }) as any[];
      const all = Array.isArray(list) ? list : [];
      const normalized: TranscriptItem[] = [];

      if (containerId != null) {
        const opening = all.find(message => Math.trunc(Number(message?.message_id)) === containerId);
        if (opening) {
          normalized.push(
            buildTranscriptItem({
              id: containerId,
              role: ((opening?.role as string) || 'assistant') as TranscriptItem['role'],
              raw: String(opening?.message ?? ''),
              hidden: opening?.is_hidden === true,
              isOpening: true,
              latestAssistantId: assistantMessageId.value,
              status: status.value,
            }),
          );
        }
      }

      for (const message of all) {
        const message_id = Number(message?.message_id);
        if (!Number.isFinite(message_id)) continue;
        const id = Math.trunc(message_id);
        if (containerId != null && id <= containerId) continue;

        normalized.push(
          buildTranscriptItem({
            id,
            role: ((message?.role as string) || 'assistant') as TranscriptItem['role'],
            raw: String(message?.message ?? ''),
            hidden: message?.is_hidden === true,
            latestAssistantId: assistantMessageId.value,
            status: status.value,
          }),
        );
      }

      transcript.value = normalized;
      if (selectedItem.value) {
        selectedItem.value = normalized.find(item => item.message_id === selectedItem.value?.message_id) ?? null;
      }
    } catch {
      transcript.value = [];
    }
    queueHidePolicy('rebuild');
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
      await setChatMessages([{ message_id: messageId, message: nextMessage, is_hidden: true }], { refresh: 'none' });
      rebuildTranscript();
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
    rebuildTranscript();
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
        await createChatMessages([{ role: 'user', message: prompt, is_hidden: true }], { refresh: 'affected' });
        rebuildTranscript();
      }

      const generatePromise = generate({ should_stream: true });
      await createAssistantPlaceholder();
      followLatest.value = true;

      const result = String(await generatePromise).trim();
      finalText.value = result;
      status.value = 'persisting';
      await patchAssistantMessage('done');
      status.value = 'done';
      rebuildTranscript();
      queueHidePolicy('generation_done');
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
      rebuildTranscript();
      toastr?.error?.(`流式 demo 失败：${errorText.value}`);
    } finally {
      clearGenerationListeners();
      busy.value = false;
    }
  }

  async function regenerateLatest() {
    const latestUser = latestUserItem.value;
    if (!latestUser || latestUser.role !== 'user') {
      toastr?.warning?.('未找到可用于重生的最近用户输入');
      return;
    }
    const ids = readMessagesAfterContainer()
      .map(item => item.message_id)
      .filter(id => id > latestUser.message_id)
      .sort((a, b) => a - b);
    if (ids.length > 0) {
      await deleteChatMessages(ids, { refresh: 'all' });
    }
    await runGenerationFlow({ prompt: latestUser.raw, createUser: false });
  }

  async function regenerateWithEditedInput() {
    const edited = String(input.value ?? '').trim();
    if (!edited) {
      toastr?.warning?.('请输入修改后的提示词');
      return;
    }
    const latestUser = latestUserItem.value;
    if (latestUser?.role === 'user') {
      await deleteFromMessageId(latestUser.message_id);
    }
    await runGenerationFlow({ prompt: edited, createUser: true });
    input.value = '';
  }

  function bindHistoryRefreshEvents() {
    if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') return;
    const names = [
      tavern_events.CHAT_CHANGED,
      tavern_events.MESSAGE_UPDATED,
      tavern_events.MESSAGE_RECEIVED,
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MESSAGE_DELETED,
    ];
    historyStops = names.map(name => {
      try {
        return eventOn(name as any, () => {
          rebuildTranscript();
          queueHidePolicy(`event:${String(name)}`);
        });
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
          rebuildTranscript();
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
    await createChatMessages([{ role: 'assistant', is_hidden: true, message: buildStreamDemoMessage('', 'stream') }], {
      refresh: 'none',
    });
    const id = Number(getLastMessageId?.());
    assistantMessageId.value = Number.isFinite(id) ? Math.trunc(id) : null;
    latestPatchedMessage = '';
    rebuildTranscript();
    await patchAssistantMessage('stream');
  }

  async function runDemo() {
    const prompt = String(input.value ?? '').trim();
    await runGenerationFlow({ prompt, createUser: true });
    input.value = '';
  }

  onMounted(() => {
    rebuildTranscript();
    bindHistoryRefreshEvents();
    queueHidePolicy('mounted');
  });

  onBeforeUnmount(() => {
    clearGenerationListeners();
    historyStops.forEach(stop => stop?.stop?.());
    historyStops = [];
    if (hidePolicyTimer) {
      window.clearTimeout(hidePolicyTimer);
      hidePolicyTimer = 0;
    }
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
    followLatest,
    selectedItem,
    transcript,
    visibleTranscript,
    transcriptStats,
    latestUserItem,
    inputHasText,
    runDemo,
    regenerateLatest,
    regenerateWithEditedInput,
    deleteFromMessageId,
    rebuildTranscript,
    openDetail,
    closeDetail,
  };
}

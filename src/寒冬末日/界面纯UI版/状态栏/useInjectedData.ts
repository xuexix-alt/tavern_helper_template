import { SAMELAYER_EVENTS, type SameLayerCommandResponsePayload, type SameLayerPayload } from '../../samelayer_events';
import { requestEventPayload } from '@util/requestEvent';
import { parseOptionsFromRaw } from './optionParser';

type InjectedData = {
  raw: string;
  options: string[];
};

type StopHandle = { stop?: () => void } | null;

const SNAPSHOT_TIMEOUT_MS = 1200;
const EVENT_SNAPSHOT_THROTTLE_MS = 260;
const HIDDEN_BLOCK_TAGS = ['imgthink', 'drawprompt'];

function stripHiddenBlocks(raw: string): string {
  let cleaned = raw;
  for (const tag of HIDDEN_BLOCK_TAGS) {
    cleaned = cleaned.replace(new RegExp('<' + tag + '(?:\\s[^>]*)?>[\\s\\S]*?<\\/' + tag + '>', 'gi'), '');
  }
  return cleaned;
}

function parseInjectedText(raw: string): InjectedData {
  const cleaned = stripHiddenBlocks(raw);
  const options = parseOptionsFromRaw(cleaned);

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

function getMockData(): InjectedData {
  return {
    raw: `
<content>
  <p><strong>开发模式示例正文：</strong>当前界面已切换到 mock 数据。</p>
  <p>你可以在 URL 加上 <code>?debug</code> 查看桥接请求日志。</p>
</content>
<option>
继续前进
检查状态
</option>
`,
    options: ['继续前进', '检查状态'],
  };
}

export function useInjectedData() {
  const raw = ref<string>('');
  const options = ref<string[]>([]);
  const stopHandles: StopHandle[] = [];
  let lastBridgeTxSeq = -1;
  let lastBridgeTxId = '';
  let lastBridgeChatId: string | null = null;
  let eventSnapshotTimer = 0;
  let eventSnapshotReason = '';

  const search = new URLSearchParams(window.location.search);
  const isDevMode = search.has('dev');
  const isDebug = isDevMode || search.has('debug');

  const clearData = () => {
    raw.value = '';
    options.value = [];
  };

  const applyBridgePayload = (payload: SameLayerPayload) => {
    if (!payload || typeof payload !== 'object') return;
    if (!isPayloadForCurrentChat(payload)) return;

    const payloadChatId = payload?.chat_id == null ? null : String(payload.chat_id);
    const payloadTxSeq = Number(payload?.tx_seq);
    const payloadTxId = String(payload?.tx_id ?? '');

    if (payloadChatId && lastBridgeChatId && payloadChatId !== lastBridgeChatId) {
      lastBridgeTxSeq = -1;
      lastBridgeTxId = '';
    }

    if (Number.isFinite(payloadTxSeq)) {
      const normalizedSeq = Math.trunc(payloadTxSeq);
      if (normalizedSeq === lastBridgeTxSeq && payloadTxId && payloadTxId === lastBridgeTxId) return;
      if (normalizedSeq < lastBridgeTxSeq) {
        if (isDebug) {
          console.debug('[状态栏][InjectedData] drop outdated snapshot', {
            txSeq: normalizedSeq,
            lastTxSeq: lastBridgeTxSeq,
            txId: payloadTxId || null,
            lastTxId: lastBridgeTxId || null,
            phase: payload.phase,
          });
        }
        return;
      }

      lastBridgeTxSeq = normalizedSeq;
      lastBridgeTxId = payloadTxId || lastBridgeTxId;
      lastBridgeChatId = payloadChatId;
    }

    const rawText = String(payload.raw ?? '');
    const parsed = parseInjectedText(rawText);
    raw.value = rawText;
    options.value = parsed.options;

    if (isDebug) {
      console.debug('[状态栏][InjectedData] apply show payload', {
        messageId: payload.message_id,
        phase: payload.phase,
        rawLen: rawText.length,
        optionsCount: parsed.options.length,
      });
    }
  };

  const requestCommandSnapshot = async (reason: string): Promise<boolean> => {
    if (typeof eventOn !== 'function' || typeof eventEmit !== 'function') return false;
    try {
      const result = await requestEventPayload<Record<string, unknown>, SameLayerPayload>({
        requestEvent: SAMELAYER_EVENTS.COMMAND_REQUEST,
        responseEvent: SAMELAYER_EVENTS.COMMAND_RESPONSE,
        payload: {
          command: 'get_snapshot',
          source: 'ui',
        },
        timeoutMs: SNAPSHOT_TIMEOUT_MS,
        concurrency: 'join',
        concurrencyKey: 'eden:statusbar:get_snapshot',
        transformResponse: rawPayload => {
          const response = rawPayload as SameLayerCommandResponsePayload;
          if (!response || typeof response !== 'object') throw new Error('invalid response payload');
          if (response.command !== 'get_snapshot') throw new Error('unexpected command response');
          if (response.ok !== true) throw new Error(String(response.error ?? 'snapshot request failed'));
          const data = (response.data ?? {}) as Record<string, unknown>;
          const snapshot = data.snapshot;
          if (!snapshot || typeof snapshot !== 'object') throw new Error('missing snapshot');
          return snapshot as SameLayerPayload;
        },
      });

      applyBridgePayload(result.data);
      if (isDebug) {
        console.debug('[状态栏][InjectedData] use command snapshot', {
          reason,
          messageId: result.data.message_id,
          txSeq: result.data.tx_seq ?? null,
          phase: result.data.phase ?? null,
        });
      }
      return true;
    } catch (error) {
      if (isDebug) {
        console.debug('[状态栏][InjectedData] command snapshot failed', {
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return false;
    }
  };

  const refresh = () => {
    if (isDevMode) {
      const mockData = getMockData();
      raw.value = mockData.raw;
      options.value = mockData.options;
      return;
    }

    void requestCommandSnapshot('manual_refresh').then(ok => {
      if (!ok) clearData();
    });
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

  const bindSnapshotOnChatChanged = () => {
    if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') return;
    try {
      const stop = eventOn(tavern_events.CHAT_CHANGED as any, () => {
        lastBridgeTxSeq = -1;
        lastBridgeTxId = '';
        lastBridgeChatId = null;
        void requestCommandSnapshot('event:chat_changed').then(ok => {
          if (!ok) clearData();
        });
      });
      stopHandles.push(stop);
    } catch {
      // ignore
    }
  };

  const queueEventSnapshot = (reason: string) => {
    if (isDevMode) return;
    eventSnapshotReason = reason;
    if (eventSnapshotTimer) return;
    eventSnapshotTimer = window.setTimeout(() => {
      eventSnapshotTimer = 0;
      const nextReason = eventSnapshotReason || 'event:fallback';
      eventSnapshotReason = '';
      // 事件兜底刷新：失败时不清空 UI，避免短时桥接抖动导致正文闪空。
      void requestCommandSnapshot(nextReason);
    }, EVENT_SNAPSHOT_THROTTLE_MS);
  };

  const bindSnapshotOnMessageMutations = () => {
    if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') return;
    const bindings: Array<{ eventName: any; reason: string }> = [
      { eventName: tavern_events.STREAM_TOKEN_RECEIVED, reason: 'event:stream_token' },
      { eventName: tavern_events.MESSAGE_UPDATED, reason: 'event:message_updated' },
      { eventName: tavern_events.MESSAGE_RECEIVED, reason: 'event:message_received' },
      { eventName: tavern_events.MESSAGE_SWIPED, reason: 'event:message_swiped' },
    ];

    for (const binding of bindings) {
      try {
        const stop = eventOn(binding.eventName as any, () => {
          queueEventSnapshot(binding.reason);
        });
        stopHandles.push(stop);
      } catch {
        // ignore
      }
    }
  };

  onMounted(() => {
    onAnyEvent(SAMELAYER_EVENTS.SHOW, applyBridgePayload);

    if (isDevMode) {
      refresh();
      return;
    }

    void requestCommandSnapshot('mounted').then(ok => {
      if (!ok) clearData();
    });
    bindSnapshotOnChatChanged();
    bindSnapshotOnMessageMutations();
  });

  onBeforeUnmount(() => {
    stopHandles.forEach(s => s?.stop?.());
    stopHandles.length = 0;
    if (eventSnapshotTimer) {
      window.clearTimeout(eventSnapshotTimer);
      eventSnapshotTimer = 0;
    }
    eventSnapshotReason = '';
  });

  return { raw, options, refresh };
}

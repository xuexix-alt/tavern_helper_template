import { useIntervalFn } from '@vueuse/core';

import { Schema } from '../../../schema';
import { normalizeRoomTag, parseRoomTag } from '../../../util/room';
import { resolveMvuSnapshotState } from './mvuSnapshotPolicy';

type SchemaType = z.output<typeof Schema>;
type RoleLike = SchemaType[string & keyof SchemaType] | Record<string, any>;

const RESERVED_TOP_LEVEL_KEYS = new Set([
  '世界',
  '庇护所',
  '房间',
  '主线任务',
  '楼层其他住户',
  '临时NPC',
  '伊甸一次性指令',
]);
const initialData: SchemaType = Schema.parse({});
const MVU_REFRESH_DEBOUNCE_MS = 80;
const MVU_TRANSIENT_RETRY_MS = 180;

function isObjectRecord(val: unknown): val is Record<string, any> {
  return !!val && typeof val === 'object' && !Array.isArray(val);
}

function sanitizeRoleObjectInPlace(role: any) {
  if (!isObjectRecord(role)) return;
  const roomRaw = String(_.get(role, '所在房间', '') ?? '');
  const normalized = normalizeRoomTag(roomRaw);
  _.set(role, '所在房间', parseRoomTag(normalized).kind === 'none' ? '' : normalized);
}

function sanitizeStatDataForUi(raw: any): Record<string, any> {
  if (!isObjectRecord(raw)) return {};
  const next = _.cloneDeep(raw) as Record<string, any>;

  for (const key of Object.keys(next)) {
    const val = next[key];
    if (RESERVED_TOP_LEVEL_KEYS.has(key)) {
      if (key === '临时NPC') {
        if (!isObjectRecord(val)) {
          next[key] = {};
          continue;
        }
        for (const npcName of Object.keys(val)) {
          if (!isObjectRecord(val[npcName])) {
            delete val[npcName];
            continue;
          }
          sanitizeRoleObjectInPlace(val[npcName]);
        }
      } else if (!isObjectRecord(val)) {
        next[key] = {};
      }
      continue;
    }

    if (!isObjectRecord(val)) {
      delete next[key];
      continue;
    }
    sanitizeRoleObjectInPlace(val);
  }

  return next;
}

function hasDisplayableRoles(data: SchemaType): boolean {
  const hasMainRoles = Object.entries(data).some(
    ([key, value]) => !RESERVED_TOP_LEVEL_KEYS.has(key) && isObjectRecord(value),
  );
  if (hasMainRoles) return true;

  const tempNpc = _.get(data, '临时NPC', {});
  return isObjectRecord(tempNpc) && Object.values(tempNpc).some(value => isObjectRecord(value));
}

function mergeSystemStatDataFallback(statData: Record<string, any>): SchemaType {
  const fallback = _.cloneDeep(initialData) as Record<string, any>;

  for (const key of RESERVED_TOP_LEVEL_KEYS) {
    if (_.has(statData, key)) {
      fallback[key] = _.cloneDeep(statData[key]);
    }
  }

  return fallback as SchemaType;
}

type ReadMvuStatDataOptions = {
  allowSystemOnly?: boolean;
};

export function readMvuStatData(
  messageId: number | 'latest',
  options?: ReadMvuStatDataOptions,
): { ok: true; data: SchemaType; messageId: number | 'latest' } | { ok: false } {
  try {
    const allowSystemOnly = options?.allowSystemOnly === true;
    const mvuData = Mvu.getMvuData({ type: 'message', message_id: messageId });
    const rawStatData = _.get(mvuData, 'stat_data', null);
    if (!isObjectRecord(rawStatData) || Object.keys(rawStatData).length === 0) {
      return { ok: false };
    }

    const statData = sanitizeStatDataForUi(rawStatData);
    const result = Schema.safeParse(statData);
    if (result.success && (allowSystemOnly || hasDisplayableRoles(result.data))) {
      return { ok: true, data: result.data, messageId };
    }
    if (allowSystemOnly) {
      return { ok: true, data: mergeSystemStatDataFallback(statData), messageId };
    }
  } catch {
    // ignore
  }
  return { ok: false };
}

function readLatestMvuStatData(
  options?: ReadMvuStatDataOptions,
): { ok: true; data: SchemaType; messageId: number | 'latest' } | { ok: false } {
  // JS-Slash-Runner / Tavern Helper 的 message_id:'latest' 会解析为 latest non-system message。
  // same-layer 的系统更新结果可能落在真正最新的 system 楼层，因此系统面板先读物理最新楼层 -1。
  const physicalLatest = readMvuStatData(-1, options);
  if (physicalLatest.ok) return physicalLatest;
  return readMvuStatData('latest', options);
}

function resolveTargetMessageId(rawTarget: number | 'latest' | null | undefined): number | 'latest' | null {
  if (rawTarget == null) return null;
  if (rawTarget === 'latest') return 'latest';
  const numeric = Number(rawTarget);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
}

function readExtraAnalysisFlag(): boolean {
  try {
    return (
      (typeof Mvu?.isDuringExtraAnalysis === 'function' && Mvu.isDuringExtraAnalysis() === true) ||
      _.get(getVariables({ type: 'global' }) ?? {}, 'extra_analysis', false) === true
    );
  } catch {
    return false;
  }
}

export function useMvuRoleStore(targetMessageId: Ref<number | 'latest' | null | undefined>) {
  const data = ref<SchemaType>(initialData);
  const ready = ref(false);
  const source = ref<'current' | 'latest' | 'default'>('default');
  const resolvedMessageId = ref<number | 'latest'>('latest');
  const isDuringExtraAnalysis = ref(false);
  const isRetrying = ref(false);
  const refreshTicket = ref(0);
  const stopHandles: EventOnReturn[] = [];
  let refreshTimer = 0;
  let transientRetryTimer = 0;

  const { pause: pausePolling, resume: resumePolling } = useIntervalFn(
    () => {
      queueRefresh(0);
    },
    1500,
    { immediate: false },
  );

  function clearRefreshTimer() {
    if (!refreshTimer) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = 0;
  }

  function clearTransientRetryTimer() {
    if (!transientRetryTimer) return;
    window.clearTimeout(transientRetryTimer);
    transientRetryTimer = 0;
  }

  function queueRefresh(delay = MVU_REFRESH_DEBOUNCE_MS) {
    clearRefreshTimer();
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      refresh();
    }, delay);
  }

  function queueTransientRetry() {
    clearTransientRetryTimer();
    transientRetryTimer = window.setTimeout(() => {
      transientRetryTimer = 0;
      refresh();
    }, MVU_TRANSIENT_RETRY_MS);
  }

  function refresh() {
    const ticket = refreshTicket.value + 1;
    refreshTicket.value = ticket;

    const target = resolveTargetMessageId(targetMessageId.value);
    const extraAnalysis = readExtraAnalysisFlag();
    if (target == null) {
      if (refreshTicket.value !== ticket) return;
      data.value = initialData;
      source.value = 'default';
      resolvedMessageId.value = 'latest';
      ready.value = false;
      isDuringExtraAnalysis.value = extraAnalysis;
      isRetrying.value = false;
      clearTransientRetryTimer();
      return;
    }

    const current = readMvuStatData(target);
    const nextState = resolveMvuSnapshotState({
      target,
      current,
      ready: ready.value,
      previousSource: source.value,
      previousResolvedMessageId: resolvedMessageId.value,
      extraAnalysis,
    });

    if (refreshTicket.value !== ticket) return;

    isDuringExtraAnalysis.value = extraAnalysis;
    isRetrying.value = nextState.isRetrying;

    if (nextState.mode === 'resolved') {
      data.value = nextState.data;
      source.value = nextState.source;
      resolvedMessageId.value = nextState.resolvedMessageId;
      ready.value = nextState.ready;
      clearTransientRetryTimer();
      return;
    }

    data.value = initialData;
    source.value = nextState.source;
    resolvedMessageId.value = nextState.resolvedMessageId;
    ready.value = nextState.ready;
    if (nextState.isRetrying) queueTransientRetry();
    else clearTransientRetryTimer();
  }

  const mainRoleEntries = computed(() =>
    Object.entries(data.value)
      .filter(([key, value]) => !RESERVED_TOP_LEVEL_KEYS.has(key) && isObjectRecord(value))
      .map(([key, value]) => ({ key, role: value as RoleLike }))
      .sort((a, b) => {
        const aActive = String((a.role as any)?.登场状态 ?? '').trim() === '登场' ? 0 : 1;
        const bActive = String((b.role as any)?.登场状态 ?? '').trim() === '登场' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const aName = String((a.role as any)?.姓名 ?? a.key ?? '').trim() || String(a.key);
        const bName = String((b.role as any)?.姓名 ?? b.key ?? '').trim() || String(b.key);
        return aName.localeCompare(bName, 'zh-Hans-CN');
      }),
  );

  const tempNpcEntries = computed(() => {
    const tempNpc = _.get(data.value, '临时NPC', {});
    if (!isObjectRecord(tempNpc)) return [] as Array<{ key: string; role: RoleLike }>;
    return Object.entries(tempNpc)
      .filter(([, value]) => isObjectRecord(value))
      .map(([key, value]) => ({ key, role: value as RoleLike }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key), 'zh-Hans-CN'));
  });

  const hasAnyRole = computed(() => mainRoleEntries.value.length > 0 || tempNpcEntries.value.length > 0);

  onMounted(() => {
    (async () => {
      await waitGlobalInitialized('Mvu');
      refresh();
      resumePolling();

      stopHandles.push(
        eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => queueRefresh(0)),
        eventOn(Mvu.events.VARIABLE_INITIALIZED, () => queueRefresh(0)),
        eventOn(Mvu.events.VARIABLE_UPDATE_STARTED, () => {
          isDuringExtraAnalysis.value = readExtraAnalysisFlag();
        }),
      );

      if (typeof tavern_events !== 'undefined') {
        stopHandles.push(eventOn(tavern_events.CHAT_CHANGED as any, (() => queueRefresh(0)) as any));
      }
    })();
  });

  onBeforeUnmount(() => {
    pausePolling();
    clearRefreshTimer();
    clearTransientRetryTimer();
    stopHandles.forEach(stopHandle => stopHandle?.stop?.());
  });

  watch(targetMessageId, () => {
    queueRefresh(0);
  });

  return {
    data,
    ready,
    source,
    resolvedMessageId,
    isDuringExtraAnalysis,
    isRetrying,
    hasAnyRole,
    mainRoleEntries,
    tempNpcEntries,
    refresh,
  };
}

export function useMvuSystemStore() {
  const data = ref<SchemaType>(initialData);
  const ready = ref(false);
  const resolvedMessageId = ref<number | 'latest'>('latest');
  const isDuringExtraAnalysis = ref(false);
  const isRetrying = ref(false);
  const refreshTicket = ref(0);
  const stopHandles: EventOnReturn[] = [];
  let refreshTimer = 0;
  let transientRetryTimer = 0;

  const { pause: pausePolling, resume: resumePolling } = useIntervalFn(
    () => {
      queueRefresh(0);
    },
    1500,
    { immediate: false },
  );

  function clearRefreshTimer() {
    if (!refreshTimer) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = 0;
  }

  function clearTransientRetryTimer() {
    if (!transientRetryTimer) return;
    window.clearTimeout(transientRetryTimer);
    transientRetryTimer = 0;
  }

  function queueRefresh(delay = MVU_REFRESH_DEBOUNCE_MS) {
    clearRefreshTimer();
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0;
      refresh();
    }, delay);
  }

  function queueTransientRetry() {
    clearTransientRetryTimer();
    transientRetryTimer = window.setTimeout(() => {
      transientRetryTimer = 0;
      refresh();
    }, MVU_TRANSIENT_RETRY_MS);
  }

  function refresh() {
    const ticket = refreshTicket.value + 1;
    refreshTicket.value = ticket;

    const extraAnalysis = readExtraAnalysisFlag();
    const current = readLatestMvuStatData({ allowSystemOnly: true });
    if (refreshTicket.value !== ticket) return;

    isDuringExtraAnalysis.value = extraAnalysis;

    if (current.ok) {
      data.value = current.data;
      resolvedMessageId.value = current.messageId;
      ready.value = true;
      isRetrying.value = false;
      clearTransientRetryTimer();
      return;
    }

    data.value = initialData;
    resolvedMessageId.value = 'latest';
    ready.value = false;
    isRetrying.value = extraAnalysis;
    if (extraAnalysis) queueTransientRetry();
    else clearTransientRetryTimer();
  }

  onMounted(() => {
    (async () => {
      await waitGlobalInitialized('Mvu');
      refresh();
      resumePolling();

      stopHandles.push(
        eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => queueRefresh(0)),
        eventOn(Mvu.events.VARIABLE_INITIALIZED, () => queueRefresh(0)),
        eventOn(Mvu.events.VARIABLE_UPDATE_STARTED, () => {
          isDuringExtraAnalysis.value = readExtraAnalysisFlag();
        }),
      );

      if (typeof tavern_events !== 'undefined') {
        stopHandles.push(eventOn(tavern_events.CHAT_CHANGED as any, (() => queueRefresh(0)) as any));
      }
    })();
  });

  onBeforeUnmount(() => {
    pausePolling();
    clearRefreshTimer();
    clearTransientRetryTimer();
    stopHandles.forEach(stopHandle => stopHandle?.stop?.());
  });

  return {
    data,
    ready,
    resolvedMessageId,
    isDuringExtraAnalysis,
    isRetrying,
    refresh,
  };
}

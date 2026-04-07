export type DebugTracePayload = Record<string, unknown> | undefined;

export type DebugComponentActivitySummary = {
  scope: string;
  messageId: number | null;
  variant: string;
  mounts: number;
  updates: number;
  unmounts: number;
  effects: number;
  totalEvents: number;
  lastEvent: string;
  lastTs: string;
};

export type DebugTraceEvent = {
  ts: string;
  traceId: string;
  scope: string;
  event: string;
  payload?: DebugTracePayload;
};

export type DebugTraceRuntime = {
  enabled: boolean;
  maxEvents: number;
  events: DebugTraceEvent[];
  clear: () => void;
  groupByTrace: () => Map<string, DebugTraceEvent[]>;
  dump: () => DebugTraceEvent[];
  summarizeComponentActivity: () => DebugComponentActivitySummary[];
  printComponentActivity: () => DebugComponentActivitySummary[];
  record: (entry: Omit<DebugTraceEvent, 'ts' | 'traceId'> & { traceId?: string }) => DebugTraceEvent | null;
};

export type DebugTraceTarget = {
  __STREAM_DEMO_DEBUG__?: Partial<DebugTraceRuntime> & {
    enabled?: boolean;
  };
  localStorage?: {
    getItem?: (key: string) => string | null;
  };
};

export type CreateDebugTraceStoreOptions = {
  enabled?: boolean;
  maxEvents?: number;
  target?: DebugTraceTarget | null;
  now?: () => string;
};

const DEFAULT_MAX_EVENTS = 400;
const DEBUG_KEY = 'stream_demo_debug';

function clampMaxEvents(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_EVENTS;
  return Math.min(parsed, 2_000);
}

function resolveTarget(target?: DebugTraceTarget | null): DebugTraceTarget {
  return (target ?? (globalThis as DebugTraceTarget)) as DebugTraceTarget;
}

function readLocalStorageDebugFlag(target: DebugTraceTarget): boolean {
  try {
    const value = target.localStorage?.getItem?.(DEBUG_KEY);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

function resolveEnabled(options: CreateDebugTraceStoreOptions, target: DebugTraceTarget): boolean {
  if (typeof options.enabled === 'boolean') return options.enabled;
  if (target.__STREAM_DEMO_DEBUG__?.enabled === true) return true;
  return readLocalStorageDebugFlag(target);
}

function createGroupByTrace(events: DebugTraceEvent[]): Map<string, DebugTraceEvent[]> {
  const grouped = new Map<string, DebugTraceEvent[]>();
  for (const event of events) {
    const bucket = grouped.get(event.traceId) ?? [];
    bucket.push(event);
    grouped.set(event.traceId, bucket);
  }
  return grouped;
}

function pushBoundedEvent(events: DebugTraceEvent[], next: DebugTraceEvent, maxEvents: number) {
  events.push(next);
  while (events.length > maxEvents) {
    events.shift();
  }
}

function normalizeSummaryText(value: unknown, fallback = ''): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeSummaryMessageId(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return null;
  return Math.trunc(normalized);
}

function isComponentActivityPayload(payload: DebugTracePayload): payload is Record<string, unknown> {
  return Boolean(payload && typeof payload === 'object' && payload.debugKind === 'component_activity');
}

function createComponentActivityKey(scope: string, messageId: number | null, variant: string): string {
  return `${scope}::${messageId == null ? 'global' : messageId}::${variant}`;
}

export function summarizeComponentActivity(events: DebugTraceEvent[]): DebugComponentActivitySummary[] {
  const buckets = new Map<string, DebugComponentActivitySummary>();

  for (const event of Array.isArray(events) ? events : []) {
    if (!isComponentActivityPayload(event.payload)) continue;

    const scope = normalizeSummaryText(event.scope, 'unknown');
    const messageId = normalizeSummaryMessageId(event.payload.messageId);
    const variant = normalizeSummaryText(event.payload.variant, 'default');
    const key = createComponentActivityKey(scope, messageId, variant);
    const current =
      buckets.get(key) ??
      ({
        scope,
        messageId,
        variant,
        mounts: 0,
        updates: 0,
        unmounts: 0,
        effects: 0,
        totalEvents: 0,
        lastEvent: '',
        lastTs: '',
      } as DebugComponentActivitySummary);

    if (event.event === 'mount') current.mounts += 1;
    else if (event.event === 'update') current.updates += 1;
    else if (event.event === 'unmount') current.unmounts += 1;
    else current.effects += 1;

    current.totalEvents += 1;
    current.lastEvent = normalizeSummaryText(event.event, 'unknown');
    current.lastTs = normalizeSummaryText(event.ts);

    buckets.set(key, current);
  }

  return [...buckets.values()].sort((a, b) => {
    if (b.totalEvents !== a.totalEvents) return b.totalEvents - a.totalEvents;
    if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
    if (a.messageId == null && b.messageId != null) return 1;
    if (a.messageId != null && b.messageId == null) return -1;
    return (a.messageId ?? 0) - (b.messageId ?? 0);
  });
}

export function createTraceId(prefix = 'trace'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${String(prefix || 'trace')}-${timestamp}-${random}`;
}

export function createDebugTraceStore(options: CreateDebugTraceStoreOptions = {}): DebugTraceRuntime {
  const target = resolveTarget(options.target);
  const events: DebugTraceEvent[] = [];
  const runtime: DebugTraceRuntime = {
    enabled: resolveEnabled(options, target),
    maxEvents: clampMaxEvents(options.maxEvents),
    events,
    clear() {
      events.length = 0;
    },
    groupByTrace() {
      return createGroupByTrace(events);
    },
    dump() {
      return [...events];
    },
    summarizeComponentActivity() {
      return summarizeComponentActivity(events);
    },
    printComponentActivity() {
      const summary = runtime.summarizeComponentActivity();
      if (typeof console !== 'undefined' && typeof console.table === 'function') {
        console.table(summary);
      }
      return summary;
    },
    record(entry) {
      if (!runtime.enabled) return null;
      const nextEvent: DebugTraceEvent = {
        ts: (options.now ?? (() => new Date().toISOString()))(),
        traceId: String(entry.traceId ?? 'trace-missing'),
        scope: String(entry.scope ?? 'unknown'),
        event: String(entry.event ?? 'unknown'),
        payload: entry.payload,
      };
      pushBoundedEvent(events, nextEvent, runtime.maxEvents);
      return nextEvent;
    },
  };
  return runtime;
}

export function installDebugTraceRuntime(options: CreateDebugTraceStoreOptions = {}): DebugTraceRuntime {
  const target = resolveTarget(options.target);
  const runtime = createDebugTraceStore({ ...options, target });
  target.__STREAM_DEMO_DEBUG__ = runtime;
  return runtime;
}

export function resolveDebugTraceRuntime(target?: DebugTraceTarget | null): DebugTraceRuntime | null {
  const resolvedTarget = resolveTarget(target);
  const runtime = resolvedTarget.__STREAM_DEMO_DEBUG__;
  if (!runtime || typeof runtime.record !== 'function') return null;
  return runtime as DebugTraceRuntime;
}

export function recordDebugTrace(
  runtime: DebugTraceRuntime | null | undefined,
  entry: Omit<DebugTraceEvent, 'ts' | 'traceId'> & { traceId?: string },
): DebugTraceEvent | null {
  if (!runtime) return null;
  return runtime.record(entry);
}

export function recordComponentDebugTrace(input: {
  scope: string;
  event: string;
  traceId?: string;
  payload?: Record<string, unknown>;
  target?: DebugTraceTarget | null;
}): DebugTraceEvent | null {
  const runtime = resolveDebugTraceRuntime(input.target);
  const normalizedScope = normalizeSummaryText(input.scope, 'component');
  const messageId = normalizeSummaryMessageId(input.payload?.messageId);
  const traceId = normalizeSummaryText(
    input.traceId,
    `${normalizedScope}:${messageId == null ? 'global' : String(messageId)}`,
  );
  const entry = recordDebugTrace(runtime, {
    traceId,
    scope: normalizedScope,
    event: normalizeSummaryText(input.event, 'update'),
    payload: {
      debugKind: 'component_activity',
      ...(input.payload ?? {}),
    },
  });
  if (entry) {
    console.debug(`[stream-demo:component] ${normalizedScope}.${entry.event}`, entry);
  }
  return entry;
}

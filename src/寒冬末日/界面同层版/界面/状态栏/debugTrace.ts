export type DebugTracePayload = Record<string, unknown> | undefined;

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

export function recordDebugTrace(
  runtime: DebugTraceRuntime | null | undefined,
  entry: Omit<DebugTraceEvent, 'ts' | 'traceId'> & { traceId?: string },
): DebugTraceEvent | null {
  if (!runtime) return null;
  return runtime.record(entry);
}

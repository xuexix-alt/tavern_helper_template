import { uuidv4 } from '@util/common';

export type RequestEventConcurrencyMode = 'allow' | 'join' | 'reject';

export type RequestEventErrorCode =
  | 'INVALID_CONFIG'
  | 'EVENT_API_UNAVAILABLE'
  | 'TOO_MANY_PENDING'
  | 'DUPLICATE_PENDING'
  | 'EMIT_FAILED'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'RESPONSE_ERROR'
  | 'CANCELED';

export class RequestEventError extends Error {
  readonly code: RequestEventErrorCode;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: RequestEventErrorCode;
      requestId?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'RequestEventError';
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export type RequestEventOptions<TRaw = unknown, TData = TRaw> = {
  requestEvent: string;
  responseEvent: string;
  payload: Record<string, unknown>;
  requestId?: string;
  requestIdField?: string;
  responseIdField?: string;
  responseIdResolver?: (raw: unknown) => string | null;
  transformResponse?: (raw: TRaw) => TData;
  timeoutMs?: number;
  concurrency?: RequestEventConcurrencyMode;
  concurrencyKey?: string;
  maxConcurrent?: number;
};

export type RequestEventResult<TRaw = unknown, TData = TRaw> = {
  id: string;
  data: TData;
  raw: TRaw;
  requestEvent: string;
  responseEvent: string;
};

type PendingRecord = {
  id: string;
  key: string | null;
  promise: Promise<RequestEventResult>;
  reject: (error: RequestEventError) => void;
};

const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 300;
const DEFAULT_REQUEST_ID_FIELD = 'id';
const DEFAULT_RESPONSE_ID_FIELD = 'id';
const pendingById = new Map<string, PendingRecord>();
const pendingByKey = new Map<string, PendingRecord>();

function normalizeOptionalString(input: unknown): string | null {
  const value = String(input ?? '').trim();
  return value ? value : null;
}

function normalizeTimeoutMs(input: unknown): number {
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.max(MIN_TIMEOUT_MS, Math.trunc(value));
}

function normalizeMaxConcurrent(input: unknown): number {
  if (input === null || input === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(1, Math.trunc(value));
}

function ensureEventApisAvailable() {
  if (typeof eventOn !== 'function' || typeof eventEmit !== 'function') {
    throw new RequestEventError('eventOn/eventEmit is not available in current runtime', {
      code: 'EVENT_API_UNAVAILABLE',
    });
  }
}

function removePendingRecord(requestId: string, pendingKey: string | null) {
  pendingById.delete(requestId);
  if (!pendingKey) return;
  const current = pendingByKey.get(pendingKey);
  if (current?.id === requestId) {
    pendingByKey.delete(pendingKey);
  }
}

function buildRequestId(input?: string): string {
  const normalized = normalizeOptionalString(input);
  if (normalized) {
    return normalized;
  }
  return `evt-${Date.now()}-${uuidv4()}`;
}

function buildPendingKey(
  mode: RequestEventConcurrencyMode,
  explicitKey: string | undefined,
  requestEvent: string,
  responseEvent: string,
): string | null {
  if (mode === 'allow') {
    return null;
  }
  const key = normalizeOptionalString(explicitKey) ?? 'default';
  return `${requestEvent}|${responseEvent}|${key}`;
}

function resolveResponseId(raw: unknown, options: { responseIdField: string; resolver?: (raw: unknown) => string | null }) {
  if (options.resolver) {
    return normalizeOptionalString(options.resolver(raw));
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const value = (raw as Record<string, unknown>)[options.responseIdField];
  return normalizeOptionalString(value);
}

export function getPendingEventRequestCount(): number {
  return pendingById.size;
}

export function cancelPendingEventRequests(reason = 'Event request canceled by caller') {
  for (const pending of Array.from(pendingById.values())) {
    pending.reject(
      new RequestEventError(reason, {
        code: 'CANCELED',
        requestId: pending.id,
      }),
    );
  }
}

export async function requestEventPayload<TRaw = unknown, TData = TRaw>(
  options: RequestEventOptions<TRaw, TData>,
): Promise<RequestEventResult<TRaw, TData>> {
  ensureEventApisAvailable();

  const requestEvent = normalizeOptionalString(options.requestEvent);
  const responseEvent = normalizeOptionalString(options.responseEvent);
  if (!requestEvent || !responseEvent) {
    throw new RequestEventError('requestEvent/responseEvent must not be empty', { code: 'INVALID_CONFIG' });
  }

  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const maxConcurrent = normalizeMaxConcurrent(options.maxConcurrent);
  const mode: RequestEventConcurrencyMode = options.concurrency ?? 'allow';
  const pendingKey = buildPendingKey(mode, options.concurrencyKey, requestEvent, responseEvent);

  if (pendingKey) {
    const existing = pendingByKey.get(pendingKey);
    if (existing) {
      if (mode === 'join') {
        return existing.promise as Promise<RequestEventResult<TRaw, TData>>;
      }
      throw new RequestEventError('Another request with the same concurrency key is still pending', {
        code: 'DUPLICATE_PENDING',
        requestId: existing.id,
        details: { pendingKey, mode },
      });
    }
  }

  if (pendingById.size >= maxConcurrent) {
    throw new RequestEventError(`Too many pending event requests (${pendingById.size})`, {
      code: 'TOO_MANY_PENDING',
      details: {
        maxConcurrent,
        pending: pendingById.size,
      },
    });
  }

  const requestIdField = normalizeOptionalString(options.requestIdField) ?? DEFAULT_REQUEST_ID_FIELD;
  const responseIdField = normalizeOptionalString(options.responseIdField) ?? DEFAULT_RESPONSE_ID_FIELD;
  const requestId = buildRequestId(options.requestId);
  if (pendingById.has(requestId)) {
    throw new RequestEventError(`Request id '${requestId}' is already pending`, {
      code: 'DUPLICATE_PENDING',
      requestId,
    });
  }

  const payload = {
    ...(options.payload ?? {}),
    [requestIdField]: requestId,
  };

  let rejectPending: (error: RequestEventError) => void = () => {};
  const pending: PendingRecord = {
    id: requestId,
    key: pendingKey,
    promise: Promise.resolve(undefined as never),
    reject: error => rejectPending(error),
  };
  pendingById.set(requestId, pending);
  if (pendingKey) {
    pendingByKey.set(pendingKey, pending);
  }

  pending.promise = new Promise<RequestEventResult<TRaw, TData>>((resolve, reject) => {
    let settled = false;
    let timeoutId = 0;
    let stopHandle: EventOnReturn | null = null;

    const finalize = () => {
      window.clearTimeout(timeoutId);
      if (stopHandle?.stop) {
        stopHandle.stop();
      }
      if (typeof eventRemoveListener === 'function') {
        try {
          eventRemoveListener(responseEvent as any, listener as any);
        } catch {
          // ignore duplicate removal
        }
      }
      removePendingRecord(requestId, pendingKey);
    };

    const fail = (error: RequestEventError) => {
      if (settled) return;
      settled = true;
      finalize();
      reject(error);
    };

    const succeed = (raw: TRaw, data: TData) => {
      if (settled) return;
      settled = true;
      finalize();
      resolve({
        id: requestId,
        data,
        raw,
        requestEvent,
        responseEvent,
      });
    };

    rejectPending = fail;

    const listener = (...args: unknown[]) => {
      const raw = args[0] as TRaw;
      const responseId = resolveResponseId(raw, {
        responseIdField,
        resolver: options.responseIdResolver,
      });
      if (responseId !== requestId) {
        return;
      }

      try {
        const data = options.transformResponse ? options.transformResponse(raw) : (raw as unknown as TData);
        succeed(raw, data);
      } catch (error) {
        if (error instanceof RequestEventError) {
          fail(error);
          return;
        }
        fail(
          new RequestEventError('Response payload is malformed', {
            code: 'MALFORMED_RESPONSE',
            requestId,
            details: { requestEvent, responseEvent },
            cause: error,
          }),
        );
      }
    };

    try {
      stopHandle = eventOn(responseEvent as any, listener as any);
    } catch (error) {
      fail(
        new RequestEventError(`Failed to subscribe response event '${responseEvent}'`, {
          code: 'EVENT_API_UNAVAILABLE',
          requestId,
          details: { responseEvent },
          cause: error,
        }),
      );
      return;
    }

    timeoutId = window.setTimeout(() => {
      fail(
        new RequestEventError(`Event request timed out after ${timeoutMs}ms`, {
          code: 'TIMEOUT',
          requestId,
          details: { timeoutMs, requestEvent, responseEvent },
        }),
      );
    }, timeoutMs);
  });

  try {
    await eventEmit(requestEvent as any, payload as any);
  } catch (error) {
    pending.reject(
      new RequestEventError(`Failed to emit request event '${requestEvent}'`, {
        code: 'EMIT_FAILED',
        requestId,
        details: { requestEvent, payload },
        cause: error,
      }),
    );
  }

  return pending.promise as Promise<RequestEventResult<TRaw, TData>>;
}


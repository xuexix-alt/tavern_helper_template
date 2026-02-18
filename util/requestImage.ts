import { uuidv4 } from '@util/common';
import { z } from 'zod';

export const IMAGE_EVENT_TYPE = {
  GENERATE_IMAGE_REQUEST: 'generate-image-request',
  GENERATE_IMAGE_RESPONSE: 'generate-image-response',
} as const;

export type RequestImageConcurrencyMode = 'allow' | 'join' | 'reject';

export type RequestImageOptions = {
  id?: string;
  change?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  timeoutMs?: number;
  requestEvent?: string;
  responseEvent?: string;
  extraPayload?: Record<string, unknown>;
  concurrency?: RequestImageConcurrencyMode;
  concurrencyKey?: string;
  maxConcurrent?: number;
};

export type RequestImageResult = {
  id: string;
  prompt: string;
  change: string | null;
  imageData: string;
  requestEvent: string;
  responseEvent: string;
  raw: Record<string, unknown>;
};

export type RequestImageErrorCode =
  | 'INVALID_PROMPT'
  | 'EVENT_API_UNAVAILABLE'
  | 'TOO_MANY_PENDING'
  | 'DUPLICATE_PENDING'
  | 'EMIT_FAILED'
  | 'TIMEOUT'
  | 'GENERATION_FAILED'
  | 'MALFORMED_RESPONSE'
  | 'CANCELED';

export class RequestImageError extends Error {
  readonly code: RequestImageErrorCode;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: RequestImageErrorCode;
      requestId?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'RequestImageError';
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

type PendingRecord = {
  id: string;
  key: string | null;
  promise: Promise<RequestImageResult>;
  reject: (error: RequestImageError) => void;
};

type NormalizedImageResponse = {
  id: string;
  success: boolean;
  error: string;
  prompt: string | null;
  change: string | null;
  imageData: string;
  raw: Record<string, unknown>;
};

const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 300;
const pendingById = new Map<string, PendingRecord>();
const pendingByKey = new Map<string, PendingRecord>();

const RawImageResponseSchema = z
  .object({
    id: z.unknown().optional(),
    success: z.boolean().optional(),
    imageData: z.unknown().optional(),
    image: z.unknown().optional(),
    error: z.unknown().optional(),
    reason: z.unknown().optional(),
    prompt: z.unknown().optional(),
    change: z.unknown().optional(),
  })
  .passthrough();

function normalizeOptionalString(input: unknown): string | null {
  const text = String(input ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeDimension(input: number | string | null | undefined): number | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.trunc(value);
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

function normalizeImageData(input: unknown): string {
  const text = String(input ?? '').trim();
  if (!text) {
    return '';
  }
  if (text.startsWith('data:')) {
    return text;
  }
  if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
    return text;
  }
  return `data:image/png;base64,${text}`;
}

function normalizeImageResponse(raw: unknown): NormalizedImageResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const parsed = RawImageResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const data = parsed.data;
  const id = String(data.id ?? '').trim();
  if (!id) {
    return null;
  }

  const imageData = normalizeImageData(data.imageData ?? data.image);
  const success = data.success === true || (data.success !== false && Boolean(imageData));

  return {
    id,
    success,
    error: String(data.error ?? data.reason ?? '').trim(),
    prompt: normalizeOptionalString(data.prompt),
    change: normalizeOptionalString(data.change),
    imageData,
    raw: data as Record<string, unknown>,
  };
}

function ensureEventApisAvailable() {
  if (typeof eventOn !== 'function' || typeof eventEmit !== 'function') {
    throw new RequestImageError('eventOn/eventEmit is not available in current runtime', {
      code: 'EVENT_API_UNAVAILABLE',
    });
  }
}

function buildRequestId(input?: string): string {
  const existing = String(input ?? '').trim();
  if (existing) {
    return existing;
  }
  return `img-${Date.now()}-${uuidv4()}`;
}

function buildPendingKey(
  mode: RequestImageConcurrencyMode,
  explicitKey: string | undefined,
  requestEvent: string,
  responseEvent: string,
  prompt: string,
): string | null {
  if (mode === 'allow') {
    return null;
  }
  const key = normalizeOptionalString(explicitKey) ?? prompt;
  return `${requestEvent}|${responseEvent}|${key}`;
}

function removePendingRecord(requestId: string, pendingKey: string | null) {
  pendingById.delete(requestId);
  if (!pendingKey) {
    return;
  }
  const current = pendingByKey.get(pendingKey);
  if (current?.id === requestId) {
    pendingByKey.delete(pendingKey);
  }
}

export function getPendingImageRequestCount(): number {
  return pendingById.size;
}

export function cancelPendingImageRequests(reason = 'Image request canceled by caller') {
  for (const pending of Array.from(pendingById.values())) {
    pending.reject(
      new RequestImageError(reason, {
        code: 'CANCELED',
        requestId: pending.id,
      }),
    );
  }
}

export async function requestImage(prompt: string, opts: RequestImageOptions = {}): Promise<RequestImageResult> {
  const normalizedPrompt = String(prompt ?? '').trim();
  if (!normalizedPrompt) {
    throw new RequestImageError('Prompt must not be empty', { code: 'INVALID_PROMPT' });
  }

  ensureEventApisAvailable();

  const requestEvent = normalizeOptionalString(opts.requestEvent) ?? IMAGE_EVENT_TYPE.GENERATE_IMAGE_REQUEST;
  const responseEvent = normalizeOptionalString(opts.responseEvent) ?? IMAGE_EVENT_TYPE.GENERATE_IMAGE_RESPONSE;
  const timeoutMs = normalizeTimeoutMs(opts.timeoutMs);
  const maxConcurrent = normalizeMaxConcurrent(opts.maxConcurrent);
  const mode: RequestImageConcurrencyMode = opts.concurrency ?? 'allow';
  const pendingKey = buildPendingKey(mode, opts.concurrencyKey, requestEvent, responseEvent, normalizedPrompt);

  if (pendingKey) {
    const existing = pendingByKey.get(pendingKey);
    if (existing) {
      if (mode === 'join') {
        return existing.promise;
      }
      throw new RequestImageError('Another request with the same concurrency key is still pending', {
        code: 'DUPLICATE_PENDING',
        requestId: existing.id,
        details: {
          pendingKey,
          mode,
        },
      });
    }
  }

  if (pendingById.size >= maxConcurrent) {
    throw new RequestImageError(`Too many pending image requests (${pendingById.size})`, {
      code: 'TOO_MANY_PENDING',
      details: {
        maxConcurrent,
        pending: pendingById.size,
      },
    });
  }

  const requestId = buildRequestId(opts.id);
  if (pendingById.has(requestId)) {
    throw new RequestImageError(`Request id '${requestId}' is already pending`, {
      code: 'DUPLICATE_PENDING',
      requestId,
    });
  }

  const payload = {
    ...(opts.extraPayload ?? {}),
    id: requestId,
    prompt: normalizedPrompt,
    change: normalizeOptionalString(opts.change),
    width: normalizeDimension(opts.width),
    height: normalizeDimension(opts.height),
  };

  let rejectPending: (error: RequestImageError) => void = () => {};
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

  pending.promise = new Promise<RequestImageResult>((resolve, reject) => {
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

    const fail = (error: RequestImageError) => {
      if (settled) {
        return;
      }
      settled = true;
      finalize();
      reject(error);
    };

    const succeed = (result: RequestImageResult) => {
      if (settled) {
        return;
      }
      settled = true;
      finalize();
      resolve(result);
    };

    rejectPending = fail;

    const listener = (...args: unknown[]) => {
      const normalized = normalizeImageResponse(args[0]);
      if (!normalized || normalized.id !== requestId) {
        return;
      }

      if (!normalized.success) {
        fail(
          new RequestImageError(normalized.error || 'Image generation failed', {
            code: 'GENERATION_FAILED',
            requestId,
            details: {
              requestEvent,
              responseEvent,
              response: normalized.raw,
            },
          }),
        );
        return;
      }

      if (!normalized.imageData) {
        fail(
          new RequestImageError('Response does not contain image data', {
            code: 'MALFORMED_RESPONSE',
            requestId,
            details: {
              requestEvent,
              responseEvent,
              response: normalized.raw,
            },
          }),
        );
        return;
      }

      succeed({
        id: requestId,
        prompt: normalized.prompt ?? normalizedPrompt,
        change: normalized.change ?? normalizeOptionalString(payload.change),
        imageData: normalized.imageData,
        requestEvent,
        responseEvent,
        raw: normalized.raw,
      });
    };

    try {
      stopHandle = eventOn(responseEvent as any, listener as any);
    } catch (error) {
      fail(
        new RequestImageError(`Failed to subscribe response event '${responseEvent}'`, {
          code: 'EVENT_API_UNAVAILABLE',
          requestId,
          details: {
            responseEvent,
          },
          cause: error,
        }),
      );
      return;
    }

    timeoutId = window.setTimeout(() => {
      fail(
        new RequestImageError(`Image request timed out after ${timeoutMs}ms`, {
          code: 'TIMEOUT',
          requestId,
          details: {
            timeoutMs,
            requestEvent,
            responseEvent,
          },
        }),
      );
    }, timeoutMs);
  });

  try {
    await eventEmit(requestEvent as any, payload as any);
  } catch (error) {
    pending.reject(
      new RequestImageError(`Failed to emit request event '${requestEvent}'`, {
        code: 'EMIT_FAILED',
        requestId,
        details: {
          requestEvent,
          payload,
        },
        cause: error,
      }),
    );
  }

  return pending.promise;
}


export type PostDoneSideEffectStage =
  | 'mvu'
  | 'lifecycle'
  | 'host-message-update'
  | 'auto-image'
  | 'image-refresh'
  | (string & {});

export type PostDoneSideEffectTask<T> = () => Promise<T> | T;

export const DEFAULT_POST_DONE_STAGE_TIMEOUT_MS: Record<string, number> = {
  mvu: 45_000,
  lifecycle: 15_000,
  'host-message-update': 30_000,
  'auto-image': 180_000,
  'image-refresh': 30_000,
  default: 60_000,
};

export type PostDoneSideEffectsQueueOptions = {
  stageTimeoutMs?: Partial<Record<string, number>>;
};

export type PostDoneSideEffectsQueue = {
  enqueue<T>(messageId: number, stage: PostDoneSideEffectStage, task: PostDoneSideEffectTask<T>): Promise<T>;
  isBusy(messageId: number): boolean;
};

export class PostDoneSideEffectTimeoutError extends Error {
  readonly messageId: number;
  readonly stage: PostDoneSideEffectStage;
  readonly timeoutMs: number;

  constructor(input: { messageId: number; stage: PostDoneSideEffectStage; timeoutMs: number }) {
    super(
      `Post-done side effect timed out after ${input.timeoutMs}ms: messageId=${input.messageId}, stage=${input.stage}`,
    );
    this.name = 'PostDoneSideEffectTimeoutError';
    this.messageId = input.messageId;
    this.stage = input.stage;
    this.timeoutMs = input.timeoutMs;
  }
}

export type PostDoneMvuReprocessResult = {
  status: string;
  [key: string]: unknown;
};

export type PostDoneAssistantLifecycleKind = 'normal' | 'regenerate';

export type RunQueuedPostDoneAssistantSideEffectsInput = {
  queue: PostDoneSideEffectsQueue;
  messageId: number | null | undefined;
  lifecycleKind: PostDoneAssistantLifecycleKind;
  traceId: string;
  emitOfficialGenerationLifecycle: (
    messageId: number | null | undefined,
    kind: PostDoneAssistantLifecycleKind,
  ) => Promise<void>;
  waitForNativeMvuMessageWriteback?: (messageId: number) => Promise<PostDoneMvuReprocessResult>;
  recordLifecycleTrace: (scope: string, event: string, payload: Record<string, unknown>, traceId: string) => unknown;
  warn?: (message: string, detail: unknown) => void;
};

export type RunQueuedHostMessageUpdateInput<T> = {
  queue: PostDoneSideEffectsQueue;
  messageId: number | null | undefined;
  stage: PostDoneSideEffectStage;
  task: PostDoneSideEffectTask<T>;
};

export function createPostDoneSideEffectsQueue(
  options: PostDoneSideEffectsQueueOptions = {},
): PostDoneSideEffectsQueue {
  const tailsByMessageId = new Map<number, Promise<unknown>>();
  const stageTimeoutMs = {
    ...DEFAULT_POST_DONE_STAGE_TIMEOUT_MS,
    ...(options.stageTimeoutMs ?? {}),
  };

  function normalizeMessageId(messageId: number): number {
    const normalized = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new Error(`Invalid post-done side effect message id: ${messageId}`);
    }
    return normalized;
  }

  function enqueue<T>(messageId: number, stage: PostDoneSideEffectStage, task: PostDoneSideEffectTask<T>): Promise<T> {
    const normalizedId = normalizeMessageId(messageId);
    const previousTail = tailsByMessageId.get(normalizedId) ?? Promise.resolve();

    const run = previousTail.then(() => runTaskWithStageTimeout(normalizedId, stage, task));
    const nextTail = run.catch(() => undefined);
    tailsByMessageId.set(normalizedId, nextTail);

    nextTail.finally(() => {
      if (tailsByMessageId.get(normalizedId) === nextTail) {
        tailsByMessageId.delete(normalizedId);
      }
    });

    return run;
  }

  function isBusy(messageId: number): boolean {
    try {
      return tailsByMessageId.has(normalizeMessageId(messageId));
    } catch {
      return false;
    }
  }

  return {
    enqueue,
    isBusy,
  };

  function resolveTimeoutMs(stage: PostDoneSideEffectStage): number {
    const configured = Number(stageTimeoutMs[String(stage)] ?? stageTimeoutMs.default);
    if (!Number.isFinite(configured) || configured <= 0) return 0;
    return Math.trunc(configured);
  }

  function runTaskWithStageTimeout<T>(
    messageId: number,
    stage: PostDoneSideEffectStage,
    task: PostDoneSideEffectTask<T>,
  ): Promise<T> {
    const timeoutMs = resolveTimeoutMs(stage);
    if (timeoutMs <= 0) {
      return Promise.resolve().then(task);
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const taskPromise = Promise.resolve().then(task);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new PostDoneSideEffectTimeoutError({ messageId, stage, timeoutMs }));
      }, timeoutMs);
    });

    return Promise.race([taskPromise, timeoutPromise]).finally(() => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
    });
  }
}

export async function runQueuedPostDoneAssistantSideEffects(input: RunQueuedPostDoneAssistantSideEffectsInput) {
  const normalizedId = Number(input.messageId);
  if (!Number.isFinite(normalizedId) || normalizedId < 0) {
    await input.emitOfficialGenerationLifecycle(input.messageId, input.lifecycleKind);
    return;
  }

  const messageId = Math.trunc(normalizedId);
  const writebackPromise = input.waitForNativeMvuMessageWriteback?.(messageId);

  try {
    await input.queue.enqueue(messageId, 'lifecycle', async () => {
      await input.emitOfficialGenerationLifecycle(messageId, input.lifecycleKind);
    });
  } catch (error) {
    if (!(error instanceof PostDoneSideEffectTimeoutError)) {
      throw error;
    }

    input.warn?.('[stream-demo] official lifecycle timed out', {
      messageId,
      stage: error.stage,
      timeoutMs: error.timeoutMs,
    });
    input.recordLifecycleTrace(
      'runGenerationFlow',
      'lifecycle_timeout',
      {
        assistantMessageId: messageId,
        stage: error.stage,
      },
      input.traceId,
    );
  }

  if (!writebackPromise) return;

  try {
    await input.queue.enqueue(messageId, 'mvu', async () => {
      const writebackResult = await writebackPromise;
      if (writebackResult.status === 'error') {
        input.warn?.('[stream-demo] native MVU message writeback failed', writebackResult);
      }
      input.recordLifecycleTrace(
        'runGenerationFlow',
        'mvu_message_writeback_completed',
        {
          assistantMessageId: messageId,
          writebackStatus: writebackResult.status,
        },
        input.traceId,
      );
    });
  } catch (error) {
    if (!(error instanceof PostDoneSideEffectTimeoutError)) {
      throw error;
    }

    input.warn?.('[stream-demo] native MVU message writeback timed out', {
      messageId,
      stage: error.stage,
      timeoutMs: error.timeoutMs,
    });
    input.recordLifecycleTrace(
      'runGenerationFlow',
      'mvu_message_writeback_timeout',
      {
        assistantMessageId: messageId,
        stage: error.stage,
      },
      input.traceId,
    );
  }
}

export async function runQueuedHostMessageUpdate<T>(input: RunQueuedHostMessageUpdateInput<T>): Promise<T> {
  const normalizedId = Number(input.messageId);
  if (!Number.isFinite(normalizedId) || normalizedId < 0) {
    return await input.task();
  }

  return await input.queue.enqueue(Math.trunc(normalizedId), input.stage, input.task);
}

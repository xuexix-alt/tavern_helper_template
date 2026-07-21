import { buildLoreSummary } from './loreSummary';
import type { PhoneDb, PhoneMessage, PhoneMessageType } from './phoneDb';

export type LoreSyncType = PhoneMessageType;

export interface LoreEntryDefinition {
  type: LoreSyncType;
  name: string;
  strategy: { type: 'constant' };
  position: { type: 'at_depth'; role: 'system'; depth: 4; order: 100 };
  probability: 100;
}

export interface LoreWriteEntry extends LoreEntryDefinition {
  content: string;
}

export const LORE_ENTRY_DEFINITIONS: readonly LoreEntryDefinition[] = [
  {
    type: 'private',
    name: '[手机通讯]私聊记录',
    strategy: { type: 'constant' },
    position: { type: 'at_depth', role: 'system', depth: 4, order: 100 },
    probability: 100,
  },
  {
    type: 'group',
    name: '[手机通讯]伊甸住户群',
    strategy: { type: 'constant' },
    position: { type: 'at_depth', role: 'system', depth: 4, order: 100 },
    probability: 100,
  },
  {
    type: 'broadcast',
    name: '[手机情报]广播摘要',
    strategy: { type: 'constant' },
    position: { type: 'at_depth', role: 'system', depth: 4, order: 100 },
    probability: 100,
  },
] as const;

export interface LoreSyncRequest {
  sessionKey: string;
  worldbookName: string;
  type: LoreSyncType;
  conversationId?: string;
}

export interface ChatLoreSyncOptions {
  db: PhoneDb;
  writer(worldbookName: string, entry: LoreWriteEntry): Promise<void>;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  clearSchedule?: (timer: unknown) => void;
  onError?(error: unknown, request: Readonly<LoreSyncRequest>): void;
}

interface CapturedBatch {
  request: Readonly<LoreSyncRequest>;
  messageIds: readonly string[];
  messages: readonly PhoneMessage[];
}

interface PendingTimer {
  timer?: unknown;
  hasTimer: boolean;
  active: boolean;
  sessionKey: string;
  request: Readonly<LoreSyncRequest>;
  settle: () => void;
  fail: (error: unknown) => void;
}

let sharedWorldbookQueue: Promise<void> = Promise.resolve();

function captureRequest(request: LoreSyncRequest): Readonly<LoreSyncRequest> {
  if (!request.sessionKey.trim()) throw new Error('sessionKey 不能为空');
  if (!request.worldbookName.trim()) throw new Error('worldbookName 不能为空');
  return Object.freeze({ ...request });
}

function definitionFor(type: LoreSyncType): LoreEntryDefinition {
  const definition = LORE_ENTRY_DEFINITIONS.find(item => item.type === type);
  if (!definition) throw new Error(`不支持的同步类型: ${type}`);
  return definition;
}

export class ChatLoreSync {
  private readonly timers = new Map<string, PendingTimer>();
  private readonly outstanding = new Set<Promise<void>>();
  private readonly scheduleCallback: (callback: () => void, delayMs: number) => unknown;
  private readonly clearCallback: (timer: unknown) => void;
  private closed = false;
  private disposePromise: Promise<void> | undefined;

  constructor(private readonly options: ChatLoreSyncOptions) {
    this.scheduleCallback = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearCallback = options.clearSchedule ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  schedule(request: LoreSyncRequest): void {
    this.assertOpen();
    const captured = captureRequest(request);
    const key = this.timerKey(captured.sessionKey, captured.type);
    const previous = this.timers.get(key);
    if (previous) {
      const clearError = this.cancelPending(key, previous);
      if (clearError !== undefined) throw new AggregateError([clearError], '替换 debounce timer 失败');
    }
    let settle!: () => void;
    let fail!: (error: unknown) => void;
    const work = new Promise<void>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    this.track(work);
    const pending: PendingTimer = {
      hasTimer: false,
      active: true,
      sessionKey: captured.sessionKey,
      request: captured,
      settle,
      fail,
    };
    this.timers.set(key, pending);
    try {
      const timer = this.scheduleCallback(() => {
        if (!pending.active || this.timers.get(key) !== pending) return;
        pending.active = false;
        this.timers.delete(key);
        this.execute(captured).then(settle, fail);
      }, 500);
      pending.timer = timer;
      pending.hasTimer = true;
    } catch (error) {
      if (pending.active) {
        pending.active = false;
        if (this.timers.get(key) === pending) this.timers.delete(key);
        pending.fail(error);
      }
      this.reportFailure(error, captured);
      throw error;
    }
  }

  cancelSession(sessionKey: string): void {
    const errors: unknown[] = [];
    for (const [key, pending] of this.timers) {
      if (pending.sessionKey !== sessionKey) continue;
      const error = this.cancelPending(key, pending);
      if (error !== undefined) errors.push(error);
    }
    if (errors.length > 0) throw new AggregateError(errors, `取消 session ${sessionKey} 的 debounce timer 失败`);
  }

  flushNow(request: LoreSyncRequest): Promise<void> {
    if (this.closed) return Promise.reject(new Error('ChatLoreSync 已关闭 (disposed)'));
    const captured = captureRequest(request);
    return this.track(this.execute(captured));
  }

  async whenIdle(): Promise<void> {
    const errors: unknown[] = [];
    while (this.outstanding.size > 0) {
      const results = await Promise.allSettled([...this.outstanding]);
      for (const result of results) {
        if (result.status === 'rejected') errors.push(result.reason);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'ChatLoreSync 工作失败');
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    let resolveDispose!: () => void;
    let rejectDispose!: (error: unknown) => void;
    const stablePromise = new Promise<void>((resolve, reject) => {
      resolveDispose = resolve;
      rejectDispose = reject;
    });
    this.disposePromise = stablePromise;
    this.closed = true;
    const clearErrors: unknown[] = [];
    for (const [key, pending] of [...this.timers]) {
      const error = this.cancelPending(key, pending);
      if (error !== undefined) clearErrors.push(error);
    }
    void (async () => {
      const errors = [...clearErrors];
      try {
        await this.whenIdle();
      } catch (error) {
        if (error instanceof AggregateError) errors.push(...error.errors);
        else errors.push(error);
      }
      if (errors.length > 0) throw new AggregateError(errors, 'ChatLoreSync 关闭失败');
    })().then(resolveDispose, rejectDispose);
    return stablePromise;
  }

  private timerKey(sessionKey: string, type: LoreSyncType): string {
    return `${sessionKey}\u0000${type}`;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('ChatLoreSync 已关闭 (disposed)');
  }

  private cancelPending(key: string, pending: PendingTimer): unknown | undefined {
    if (!pending.active) return undefined;
    pending.active = false;
    if (this.timers.get(key) === pending) this.timers.delete(key);
    let clearError: unknown | undefined;
    try {
      if (pending.hasTimer) this.clearCallback(pending.timer);
    } catch (error) {
      clearError = error;
      this.reportFailure(error, pending.request);
    } finally {
      pending.settle();
    }
    return clearError;
  }

  private track(operation: Promise<void>): Promise<void> {
    this.outstanding.add(operation);
    void operation.finally(() => this.outstanding.delete(operation)).catch(() => undefined);
    return operation;
  }

  private async captureBatch(request: Readonly<LoreSyncRequest>): Promise<CapturedBatch | null> {
    const query = {
      sessionKey: request.sessionKey,
      type: request.type,
      ...(request.type === 'group' && request.conversationId ? { conversationId: request.conversationId } : {}),
    };
    const messages = await this.options.db.listMessages(query);
    const messageIds = messages.filter(message => !message.syncedToLore).map(message => message.id);
    if (messageIds.length === 0) return null;
    return Object.freeze({ request, messageIds: Object.freeze(messageIds), messages: Object.freeze(messages) });
  }

  private enqueue(request: Readonly<LoreSyncRequest>): Promise<void> {
    const operation = sharedWorldbookQueue
      .catch(() => undefined)
      .then(async () => {
        const batch = await this.captureBatch(request);
        if (!batch) return;
        const definition = definitionFor(batch.request.type);
        const content = buildLoreSummary({
          type: batch.request.type,
          conversationId: batch.request.conversationId,
          messages: batch.messages,
        });
        await this.options.writer(batch.request.worldbookName, { ...definition, content });
        await this.options.db.markSynced(batch.request.sessionKey, batch.messageIds);
      });
    sharedWorldbookQueue = operation.catch(() => undefined);
    return operation;
  }

  private execute(request: Readonly<LoreSyncRequest>): Promise<void> {
    return this.enqueue(request).catch(error => {
      this.reportFailure(error, request);
      throw error;
    });
  }

  private reportFailure(error: unknown, request: Readonly<LoreSyncRequest>): void {
    try {
      this.options.onError?.(error, request);
    } catch {
      // Diagnostics must not replace the original sync failure.
    }
  }
}

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
}

interface CapturedBatch {
  request: Readonly<LoreSyncRequest>;
  messageIds: readonly string[];
  messages: readonly PhoneMessage[];
}

interface PendingTimer {
  timer: unknown;
  sessionKey: string;
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
      this.clearCallback(previous.timer);
      this.timers.delete(key);
      previous.settle();
    }
    let settle!: () => void;
    let fail!: (error: unknown) => void;
    const work = new Promise<void>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    this.track(work);
    const timer = this.scheduleCallback(() => {
      this.timers.delete(key);
      const operation = this.enqueue(captured);
      operation.then(settle, fail);
    }, 500);
    this.timers.set(key, { timer, sessionKey: captured.sessionKey, settle, fail });
  }

  cancelSession(sessionKey: string): void {
    for (const [key, pending] of this.timers) {
      if (pending.sessionKey !== sessionKey) continue;
      this.clearCallback(pending.timer);
      this.timers.delete(key);
      pending.settle();
    }
  }

  flushNow(request: LoreSyncRequest): Promise<void> {
    if (this.closed) return Promise.reject(new Error('ChatLoreSync 已关闭 (disposed)'));
    return this.track(this.enqueue(captureRequest(request)));
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
    this.closed = true;
    for (const [key, pending] of this.timers) {
      this.clearCallback(pending.timer);
      this.timers.delete(key);
      pending.settle();
    }
    this.disposePromise = this.whenIdle();
    return this.disposePromise;
  }

  private timerKey(sessionKey: string, type: LoreSyncType): string {
    return `${sessionKey}\u0000${type}`;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('ChatLoreSync 已关闭 (disposed)');
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
}

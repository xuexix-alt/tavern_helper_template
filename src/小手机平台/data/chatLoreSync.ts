import { buildLoreSummary } from './loreSummary';
import type { PhoneDb, PhoneMessage, PhoneMessageType } from './phoneDb';

export type LoreSyncType = PhoneMessageType;

/**
 * 聊天摘要世界书条目用绿灯（selective）按正文关键词触发，而非蓝灯（constant）每楼常驻：
 * 正文提到相关人物或手机/微信时才注入，避免无关楼层持续占用主聊天上下文。
 */
export type LoreEntryStrategy = { type: 'constant' } | { type: 'selective'; keys: readonly string[] };

/** 通用触发词：正文出现即视为"正在使用手机"的信号 */
const PHONE_TRIGGER_KEYS = ['微信', '手机'] as const;

export interface LoreEntryDefinition {
  type: LoreSyncType;
  name: string;
  strategy: LoreEntryStrategy;
  position: { type: 'at_depth'; role: 'system'; depth: 4; order: 100 };
  probability: 100;
}

export interface LoreWriteEntry extends LoreEntryDefinition {
  content: string;
}

/**
 * 广播等与具体会话无关的静态条目定义。
 * 群聊/私聊条目名与触发词随请求动态生成（见 definitionFor/loreEntryNameFor）。
 */
export const LORE_ENTRY_DEFINITIONS: readonly LoreEntryDefinition[] = [
  {
    type: 'broadcast',
    name: '[微信-广播]情报摘要',
    strategy: { type: 'selective', keys: ['广播', '情报', ...PHONE_TRIGGER_KEYS] },
    position: { type: 'at_depth', role: 'system', depth: 4, order: 100 },
    probability: 100,
  },
] as const;

export interface LoreSyncRequest {
  sessionKey: string;
  worldbookName: string;
  type: LoreSyncType;
  conversationId?: string;
  /** 群聊显示名（如 伊甸住户群）：决定群聊摘要条目名与触发词；缺省用平台默认群名 */
  groupName?: string;
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

/** 平台默认群名：适配器未提供 groupName 时的兜底（向后兼容旧会话数据） */
export const DEFAULT_GROUP_NAME = '伊甸住户群';

export function loreEntryNameFor(type: LoreSyncType, conversationId?: string, groupName?: string): string {
  if (type === 'private') {
    if (!conversationId) throw new Error('私聊类型必须提供 conversationId');
    return `[微信-私聊]${conversationId.replace(/^private:/, '')}`;
  }
  if (type === 'group') return `[微信-群聊]${(groupName ?? '').trim() || DEFAULT_GROUP_NAME}`;
  const definition = LORE_ENTRY_DEFINITIONS.find(item => item.type === type);
  if (!definition) throw new Error(`不支持的同步类型: ${type}`);
  return definition.name;
}

function definitionFor(type: LoreSyncType, conversationId?: string, groupName?: string): LoreEntryDefinition {
  if (type === 'private') {
    // 私聊摘要 keys 含完整身份、剥掉作用域前缀的人物名与通用触发词：
    // 正文提到该人物或正在用手机时，其私聊记录才会注入主聊天上下文
    const identity = conversationId!.replace(/^private:/, '');
    const name = identity.slice(identity.indexOf(':') + 1);
    return {
      type: 'private',
      name: loreEntryNameFor(type, conversationId),
      strategy: {
        type: 'selective',
        keys: [identity, ...(identity.includes(':') ? [name] : []), ...PHONE_TRIGGER_KEYS],
      },
      position: { type: 'at_depth', role: 'system', depth: 4, order: 100 },
      probability: 100,
    };
  }
  if (type === 'group') {
    const resolved = (groupName ?? '').trim() || DEFAULT_GROUP_NAME;
    return {
      type: 'group',
      name: `[微信-群聊]${resolved}`,
      strategy: { type: 'selective', keys: [resolved, ...PHONE_TRIGGER_KEYS] },
      position: { type: 'at_depth', role: 'system', depth: 4, order: 100 },
      probability: 100,
    };
  }
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
    const key = this.timerKey(captured);
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

  private timerKey(request: Readonly<LoreSyncRequest>): string {
    return `${request.sessionKey}\u0000${request.type}\u0000${request.conversationId ?? ''}`;
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
      // 私聊和群聊都需要按 conversationId 筛选
      ...((request.type === 'private' || request.type === 'group') && request.conversationId
        ? { conversationId: request.conversationId }
        : {}),
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
        const definition = definitionFor(batch.request.type, batch.request.conversationId, batch.request.groupName);
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

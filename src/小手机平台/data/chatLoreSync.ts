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
  private readonly timers = new Map<string, unknown>();
  private readonly active = new Set<Promise<void>>();
  private readonly scheduleCallback: (callback: () => void, delayMs: number) => unknown;
  private readonly clearCallback: (timer: unknown) => void;

  constructor(private readonly options: ChatLoreSyncOptions) {
    this.scheduleCallback = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearCallback = options.clearSchedule ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  schedule(request: LoreSyncRequest): void {
    const captured = captureRequest(request);
    const key = this.timerKey(captured.sessionKey, captured.type);
    const previous = this.timers.get(key);
    if (previous !== undefined) this.clearCallback(previous);
    const timer = this.scheduleCallback(() => {
      this.timers.delete(key);
      const operation = this.enqueue(captured);
      void operation.catch(() => undefined);
    }, 500);
    this.timers.set(key, timer);
  }

  cancelSession(sessionKey: string): void {
    const prefix = `${sessionKey}\u0000`;
    for (const [key, timer] of this.timers) {
      if (!key.startsWith(prefix)) continue;
      this.clearCallback(timer);
      this.timers.delete(key);
    }
  }

  flushNow(request: LoreSyncRequest): Promise<void> {
    return this.enqueue(captureRequest(request));
  }

  async whenIdle(): Promise<void> {
    while (this.active.size > 0) await Promise.all([...this.active]);
  }

  private timerKey(sessionKey: string, type: LoreSyncType): string {
    return `${sessionKey}\u0000${type}`;
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
    const capturedBatch = this.captureBatch(request);
    const operation = sharedWorldbookQueue
      .catch(() => undefined)
      .then(async () => {
        const batch = await capturedBatch;
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
    this.active.add(operation);
    void operation.finally(() => this.active.delete(operation)).catch(() => undefined);
    return operation;
  }
}

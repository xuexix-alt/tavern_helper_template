export type PhoneMessageType = 'private' | 'group' | 'broadcast';
export type BroadcastTrust = 'confirmed' | 'unverified';

export interface PhoneMessageInput {
  id: string;
  sessionKey: string;
  conversationId: string;
  type: PhoneMessageType;
  sender: string;
  content: string;
  createdAt: number;
  groupName?: string;
  participants?: string[];
  gameDate?: string;
  gameTime?: string;
  source?: string;
  trust?: BroadcastTrust;
}

export interface PhoneMessage extends PhoneMessageInput {
  syncedToLore: boolean;
}

export interface MessageQuery {
  sessionKey: string;
  type?: PhoneMessageType;
  conversationId?: string;
  syncedToLore?: boolean;
  createdAfter?: number;
  createdBefore?: number;
}

export type PhoneBusinessStore = 'conversations' | 'contactPrefs' | 'inbox' | 'proactiveJobs';

export type PhoneBusinessRecord = {
  id: string;
  sessionKey: string;
  [key: string]: unknown;
};

export interface PhoneDb {
  addMessage(input: PhoneMessageInput): Promise<PhoneMessage>;
  listMessages(query: MessageQuery): Promise<PhoneMessage[]>;
  markSynced(sessionKey: string, messageIds: readonly string[]): Promise<void>;
  putRecord(store: PhoneBusinessStore, record: PhoneBusinessRecord): Promise<void>;
  listRecords(store: PhoneBusinessStore, sessionKey: string): Promise<PhoneBusinessRecord[]>;
}

const DATABASE_NAME = 'tavern-phone';
const DATABASE_VERSION = 1;
const ALL_STORES = ['messages', 'conversations', 'contactPrefs', 'inbox', 'proactiveJobs'] as const;

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} 不能为空`);
}

function containsApiKey(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(
    ([key, nested]) => /^api[_-]?key$/i.test(key) || /api\s+key/i.test(key) || containsApiKey(nested, seen),
  );
}

function validateMessage(input: PhoneMessageInput): void {
  assertNonEmpty(input.id, 'message.id');
  assertNonEmpty(input.sessionKey, 'message.sessionKey');
  assertNonEmpty(input.conversationId, 'message.conversationId');
  assertNonEmpty(input.sender, 'message.sender');
  if (!Number.isFinite(input.createdAt)) throw new Error('message.createdAt 必须是有限数字');
  if (!['private', 'group', 'broadcast'].includes(input.type)) throw new Error(`不支持的消息类型: ${input.type}`);
  if (input.type !== 'group' && (input.groupName !== undefined || input.participants !== undefined)) {
    throw new Error('群名和参与者只能用于 group 消息');
  }
  if (input.type !== 'broadcast' && (input.source !== undefined || input.trust !== undefined)) {
    throw new Error('source 和 trust 只能用于 broadcast 消息');
  }
  if (input.trust !== undefined && input.trust !== 'confirmed' && input.trust !== 'unverified') {
    throw new Error('broadcast trust 必须是 confirmed 或 unverified');
  }
  if (containsApiKey(input)) throw new Error('PhoneDB 不得存储或复制 API key');
}

function cloneMessage(input: PhoneMessageInput | PhoneMessage): PhoneMessage {
  return {
    ...input,
    participants: input.participants ? [...input.participants] : undefined,
    syncedToLore: 'syncedToLore' in input ? input.syncedToLore : false,
  };
}

function cloneRecord(record: PhoneBusinessRecord): PhoneBusinessRecord {
  return { ...record };
}

function matches(message: PhoneMessage, query: MessageQuery): boolean {
  return (
    message.sessionKey === query.sessionKey &&
    (query.type === undefined || message.type === query.type) &&
    (query.conversationId === undefined || message.conversationId === query.conversationId) &&
    (query.syncedToLore === undefined || message.syncedToLore === query.syncedToLore) &&
    (query.createdAfter === undefined || message.createdAt >= query.createdAfter) &&
    (query.createdBefore === undefined || message.createdAt <= query.createdBefore)
  );
}

export function createMemoryPhoneDb(): PhoneDb {
  const messages = new Map<string, PhoneMessage>();
  const records = new Map<PhoneBusinessStore, Map<string, PhoneBusinessRecord>>(
    ALL_STORES.filter(store => store !== 'messages').map(store => [store, new Map()]),
  );
  const keyOf = (sessionKey: string, id: string) => `${sessionKey}\u0000${id}`;

  return {
    async addMessage(input) {
      validateMessage(input);
      const stored = cloneMessage(input);
      messages.set(keyOf(stored.sessionKey, stored.id), stored);
      return cloneMessage(stored);
    },
    async listMessages(query) {
      return [...messages.values()]
        .filter(item => matches(item, query))
        .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
        .map(cloneMessage);
    },
    async markSynced(sessionKey, messageIds) {
      for (const id of new Set(messageIds)) {
        const key = keyOf(sessionKey, id);
        const existing = messages.get(key);
        if (existing) messages.set(key, { ...existing, syncedToLore: true });
      }
    },
    async putRecord(store, record) {
      assertNonEmpty(record.id, 'record.id');
      assertNonEmpty(record.sessionKey, 'record.sessionKey');
      if (containsApiKey(record)) throw new Error('PhoneDB 不得存储或复制 API key');
      records.get(store)?.set(keyOf(record.sessionKey, record.id), cloneRecord(record));
    },
    async listRecords(store, sessionKey) {
      return [...(records.get(store)?.values() ?? [])]
        .filter(record => record.sessionKey === sessionKey)
        .map(cloneRecord);
    },
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    for (const storeName of ALL_STORES) {
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: ['sessionKey', 'id'] });
      }
    }
  };
  return requestResult(request);
}

class IndexedDbPhoneDb implements PhoneDb {
  constructor(private readonly database: IDBDatabase) {}

  async addMessage(input: PhoneMessageInput): Promise<PhoneMessage> {
    validateMessage(input);
    const message = cloneMessage(input);
    const transaction = this.database.transaction('messages', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('messages').put(message);
    await done;
    return cloneMessage(message);
  }

  async listMessages(query: MessageQuery): Promise<PhoneMessage[]> {
    const transaction = this.database.transaction('messages', 'readonly');
    const done = transactionDone(transaction);
    const result = await requestResult(transaction.objectStore('messages').getAll() as IDBRequest<PhoneMessage[]>);
    await done;
    return result
      .filter(message => matches(message, query))
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
      .map(cloneMessage);
  }

  async markSynced(sessionKey: string, messageIds: readonly string[]): Promise<void> {
    const transaction = this.database.transaction('messages', 'readwrite');
    const store = transaction.objectStore('messages');
    const done = transactionDone(transaction);
    for (const id of new Set(messageIds)) {
      const request = store.get([sessionKey, id]) as IDBRequest<PhoneMessage | undefined>;
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, syncedToLore: true });
      };
    }
    await done;
  }

  async putRecord(storeName: PhoneBusinessStore, record: PhoneBusinessRecord): Promise<void> {
    assertNonEmpty(record.id, 'record.id');
    assertNonEmpty(record.sessionKey, 'record.sessionKey');
    if (containsApiKey(record)) throw new Error('PhoneDB 不得存储或复制 API key');
    const transaction = this.database.transaction(storeName, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(storeName).put(cloneRecord(record));
    await done;
  }

  async listRecords(storeName: PhoneBusinessStore, sessionKey: string): Promise<PhoneBusinessRecord[]> {
    const transaction = this.database.transaction(storeName, 'readonly');
    const done = transactionDone(transaction);
    const result = await requestResult(
      transaction.objectStore(storeName).getAll() as IDBRequest<PhoneBusinessRecord[]>,
    );
    await done;
    return result.filter(record => record.sessionKey === sessionKey).map(cloneRecord);
  }
}

export async function createIndexedDbPhoneDb(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): Promise<PhoneDb> {
  if (!factory) throw new Error('IndexedDB 不可用 (unavailable)');
  return new IndexedDbPhoneDb(await openDatabase(factory));
}

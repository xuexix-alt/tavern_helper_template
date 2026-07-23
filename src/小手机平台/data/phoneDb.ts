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

export const PHONE_BUSINESS_STORES = [
  'conversations',
  'contactPrefs',
  'inbox',
  'proactiveJobs',
  'profileSettings',
  'storyRefresh',
  'profileAnalysis',
  'profileViews',
  'profileRuns',
  'broadcastIssues',
] as const;

export type PhoneBusinessStore = (typeof PHONE_BUSINESS_STORES)[number];

export type PhoneBusinessRecord = {
  id: string;
  sessionKey: string;
  [key: string]: unknown;
};

export interface PhoneIdentityMigration {
  from: string;
  to: string;
}

export interface PhoneDb {
  addMessage(input: PhoneMessageInput): Promise<PhoneMessage>;
  addMessageWithInbox(input: PhoneMessageInput, inbox: PhoneBusinessRecord): Promise<PhoneMessage>;
  listMessages(query: MessageQuery): Promise<PhoneMessage[]>;
  markSynced(sessionKey: string, messageIds: readonly string[]): Promise<void>;
  putRecord(store: PhoneBusinessStore, record: PhoneBusinessRecord): Promise<void>;
  listRecords(store: PhoneBusinessStore, sessionKey: string): Promise<PhoneBusinessRecord[]>;
  migrateIdentities(sessionKey: string, migrations: readonly PhoneIdentityMigration[]): Promise<void>;
}

const DATABASE_NAME = 'tavern-phone';
const DATABASE_VERSION = 2;
const ALL_STORES = ['messages', ...PHONE_BUSINESS_STORES] as const;

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
  if (input.type === 'broadcast' && !input.source?.trim()) {
    throw new Error('broadcast source（来源）不能为空');
  }
  if (input.type === 'broadcast' && input.trust === undefined) {
    throw new Error('broadcast trust（可信度）不能为空');
  }
  if (input.trust !== undefined && input.trust !== 'confirmed' && input.trust !== 'unverified') {
    throw new Error('broadcast trust 必须是 confirmed 或 unverified');
  }
  if (containsApiKey(input)) throw new Error('PhoneDB 不得存储或复制 API key');
}

function validatePendingInbox(input: PhoneMessageInput, inbox: PhoneBusinessRecord): void {
  assertNonEmpty(inbox.id, 'inbox.id');
  assertNonEmpty(inbox.sessionKey, 'inbox.sessionKey');
  if (inbox.id !== input.id || inbox.sessionKey !== input.sessionKey || inbox.conversationId !== input.conversationId) {
    throw new Error('outgoing message 与 inbox 必须指向同一消息、会话和聊天');
  }
  if (inbox.status !== 'pending') throw new Error('原子 outgoing inbox 的初始状态必须是 pending');
  if (containsApiKey(inbox)) throw new Error('PhoneDB 不得存储或复制 API key');
}

function cloneMessage(input: PhoneMessageInput | PhoneMessage): PhoneMessage {
  return {
    ...input,
    participants: input.participants ? [...input.participants] : undefined,
    syncedToLore: 'syncedToLore' in input ? input.syncedToLore : false,
  };
}

function cloneRecord(record: PhoneBusinessRecord): PhoneBusinessRecord {
  return structuredClone(record);
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

function identityReplacements(
  sessionKey: string,
  migrations: readonly PhoneIdentityMigration[],
): ReadonlyMap<string, string> {
  assertNonEmpty(sessionKey, 'migration.sessionKey');
  const replacements = new Map<string, string>();
  const targets = new Set<string>();
  for (const migration of migrations) {
    assertNonEmpty(migration.from, 'migration.from');
    assertNonEmpty(migration.to, 'migration.to');
    if (migration.from === migration.to) throw new Error('migration.from 与 migration.to 不得相同');
    if (replacements.has(migration.from) || targets.has(migration.to)) throw new Error('身份迁移存在重复或歧义');
    replacements.set(migration.from, migration.to);
    targets.add(migration.to);
  }
  return replacements;
}

function migrateMessage(message: PhoneMessage, replacements: ReadonlyMap<string, string>): PhoneMessage {
  return {
    ...message,
    conversationId: migrateConversationId(message.conversationId, replacements),
    sender: replacements.get(message.sender) ?? message.sender,
    participants: message.participants?.map(identity => replacements.get(identity) ?? identity),
  };
}

function migrateConversationId(conversationId: string, replacements: ReadonlyMap<string, string>): string {
  for (const [from, to] of replacements) {
    if (conversationId === `private:${from}`) return `private:${to}`;
  }
  return conversationId;
}

function migrateConversation(
  record: PhoneBusinessRecord,
  replacements: ReadonlyMap<string, string>,
): PhoneBusinessRecord {
  return {
    ...record,
    id: migrateConversationId(record.id, replacements),
    ...(Array.isArray(record.participants)
      ? {
          participants: record.participants.map(identity =>
            typeof identity === 'string' ? (replacements.get(identity) ?? identity) : identity,
          ),
        }
      : {}),
  };
}

function migrateConversationReference(
  record: PhoneBusinessRecord,
  replacements: ReadonlyMap<string, string>,
): PhoneBusinessRecord {
  return typeof record.conversationId === 'string'
    ? { ...record, conversationId: migrateConversationId(record.conversationId, replacements) }
    : record;
}

function migrateConversationRecords(
  records: readonly PhoneBusinessRecord[],
  sessionKey: string,
  replacements: ReadonlyMap<string, string>,
): PhoneBusinessRecord[] {
  const candidates = records
    .filter(record => record.sessionKey === sessionKey)
    .map(record => ({ originalId: record.id, migrated: migrateConversation(record, replacements) }))
    .sort(
      (left, right) => Number(left.originalId === left.migrated.id) - Number(right.originalId === right.migrated.id),
    );
  const byId = new Map<string, PhoneBusinessRecord>();
  for (const { migrated } of candidates) {
    const existing = byId.get(migrated.id);
    const participants = [
      ...(Array.isArray(existing?.participants) ? existing.participants : []),
      ...(Array.isArray(migrated.participants) ? migrated.participants : []),
    ].filter((identity, index, all) => typeof identity === 'string' && all.indexOf(identity) === index);
    byId.set(migrated.id, {
      ...existing,
      ...migrated,
      ...(participants.length > 0 ? { participants } : {}),
    });
  }
  return [...byId.values()];
}

function migratePersonRecord(
  record: PhoneBusinessRecord,
  replacements: ReadonlyMap<string, string>,
): PhoneBusinessRecord {
  const identity = typeof record.personId === 'string' ? record.personId : record.id;
  const replacement = replacements.get(identity);
  return replacement ? { ...record, id: replacement, personId: replacement } : record;
}

function migratePersonRecords(
  records: readonly PhoneBusinessRecord[],
  sessionKey: string,
  replacements: ReadonlyMap<string, string>,
): PhoneBusinessRecord[] {
  const byId = new Map<string, PhoneBusinessRecord>();
  for (const record of records.filter(record => record.sessionKey === sessionKey)) {
    const migrated = migratePersonRecord(record, replacements);
    byId.set(migrated.id, { ...byId.get(migrated.id), ...migrated });
  }
  return [...byId.values()];
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
    async addMessageWithInbox(input, inbox) {
      validateMessage(input);
      validatePendingInbox(input, inbox);
      const storedMessage = cloneMessage(input);
      const storedInbox = cloneRecord(inbox);
      messages.set(keyOf(storedMessage.sessionKey, storedMessage.id), storedMessage);
      records.get('inbox')!.set(keyOf(storedInbox.sessionKey, storedInbox.id), storedInbox);
      return cloneMessage(storedMessage);
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
    async migrateIdentities(sessionKey, migrations) {
      const replacements = identityReplacements(sessionKey, migrations);
      if (replacements.size === 0) return;
      const nextMessages = new Map(messages);
      for (const [key, message] of messages) {
        if (message.sessionKey === sessionKey) nextMessages.set(key, migrateMessage(message, replacements));
      }
      const nextRecords = new Map<PhoneBusinessStore, Map<string, PhoneBusinessRecord>>();
      for (const [store, values] of records) nextRecords.set(store, new Map(values));
      const conversations = nextRecords.get('conversations')!;
      const migratedConversations = migrateConversationRecords([...conversations.values()], sessionKey, replacements);
      for (const [key, record] of [...conversations]) {
        if (record.sessionKey === sessionKey) conversations.delete(key);
      }
      for (const record of migratedConversations) conversations.set(keyOf(sessionKey, record.id), cloneRecord(record));
      const inbox = nextRecords.get('inbox')!;
      for (const [key, record] of inbox) {
        if (record.sessionKey === sessionKey) inbox.set(key, migrateConversationReference(record, replacements));
      }
      const preferences = nextRecords.get('contactPrefs')!;
      for (const [key, record] of [...preferences]) {
        if (record.sessionKey !== sessionKey) continue;
        const identity = typeof record.identity === 'string' ? record.identity : record.id;
        const replacement = replacements.get(identity);
        if (!replacement) continue;
        const targetKey = keyOf(sessionKey, replacement);
        const existing = preferences.get(targetKey);
        preferences.delete(key);
        preferences.set(targetKey, cloneRecord({ ...record, ...existing, id: replacement, identity: replacement }));
      }
      for (const storeName of ['profileAnalysis', 'profileViews'] as const) {
        const store = nextRecords.get(storeName)!;
        const migrated = migratePersonRecords([...store.values()], sessionKey, replacements);
        for (const [key, record] of [...store]) {
          if (record.sessionKey === sessionKey) store.delete(key);
        }
        for (const record of migrated) store.set(keyOf(sessionKey, record.id), cloneRecord(record));
      }
      messages.clear();
      for (const [key, value] of nextMessages) messages.set(key, value);
      for (const [store, values] of nextRecords) {
        const target = records.get(store)!;
        target.clear();
        for (const [key, value] of values) target.set(key, value);
      }
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

  async addMessageWithInbox(input: PhoneMessageInput, inbox: PhoneBusinessRecord): Promise<PhoneMessage> {
    validateMessage(input);
    validatePendingInbox(input, inbox);
    const message = cloneMessage(input);
    const storedInbox = cloneRecord(inbox);
    const transaction = this.database.transaction(['messages', 'inbox'], 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('messages').put(message);
    transaction.objectStore('inbox').put(storedInbox);
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
    const stored = cloneRecord(record);
    const transaction = this.database.transaction(storeName, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(storeName).put(stored);
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

  async migrateIdentities(sessionKey: string, migrations: readonly PhoneIdentityMigration[]): Promise<void> {
    const replacements = identityReplacements(sessionKey, migrations);
    if (replacements.size === 0) return;
    const transaction = this.database.transaction(
      ['messages', 'conversations', 'contactPrefs', 'inbox', 'profileAnalysis', 'profileViews'],
      'readwrite',
    );
    const done = transactionDone(transaction);
    const messageStore = transaction.objectStore('messages');
    const conversationStore = transaction.objectStore('conversations');
    const contactPrefs = transaction.objectStore('contactPrefs');
    const inboxStore = transaction.objectStore('inbox');
    const profileAnalysisStore = transaction.objectStore('profileAnalysis');
    const profileViewsStore = transaction.objectStore('profileViews');
    const messageRequest = messageStore.getAll() as IDBRequest<PhoneMessage[]>;
    const conversationRequest = conversationStore.getAll() as IDBRequest<PhoneBusinessRecord[]>;
    const preferenceRequest = contactPrefs.getAll() as IDBRequest<PhoneBusinessRecord[]>;
    const inboxRequest = inboxStore.getAll() as IDBRequest<PhoneBusinessRecord[]>;
    const profileAnalysisRequest = profileAnalysisStore.getAll() as IDBRequest<PhoneBusinessRecord[]>;
    const profileViewsRequest = profileViewsStore.getAll() as IDBRequest<PhoneBusinessRecord[]>;
    let messages: PhoneMessage[] | undefined;
    let conversations: PhoneBusinessRecord[] | undefined;
    let preferences: PhoneBusinessRecord[] | undefined;
    let inbox: PhoneBusinessRecord[] | undefined;
    let profileAnalysis: PhoneBusinessRecord[] | undefined;
    let profileViews: PhoneBusinessRecord[] | undefined;
    let writesQueued = false;
    let writePreparationError: unknown;
    const queueWritesWhileActive = (): void => {
      if (
        writesQueued ||
        !messages ||
        !conversations ||
        !preferences ||
        !inbox ||
        !profileAnalysis ||
        !profileViews
      ) {
        return;
      }
      writesQueued = true;
      try {
        for (const message of messages) {
          if (message.sessionKey === sessionKey) messageStore.put(migrateMessage(message, replacements));
        }
        for (const conversation of conversations) {
          if (conversation.sessionKey === sessionKey) conversationStore.delete([sessionKey, conversation.id]);
        }
        for (const conversation of migrateConversationRecords(conversations, sessionKey, replacements)) {
          conversationStore.put(conversation);
        }
        for (const record of inbox) {
          if (record.sessionKey === sessionKey) inboxStore.put(migrateConversationReference(record, replacements));
        }
        const preferenceById = new Map(preferences.map(record => [`${record.sessionKey}\u0000${record.id}`, record]));
        for (const preference of preferences) {
          if (preference.sessionKey !== sessionKey) continue;
          const identity = typeof preference.identity === 'string' ? preference.identity : preference.id;
          const replacement = replacements.get(identity);
          if (!replacement) continue;
          const migration = { from: identity, to: replacement };
          const existing = preferenceById.get(`${sessionKey}\u0000${replacement}`);
          contactPrefs.delete([sessionKey, migration.from]);
          contactPrefs.put({ ...preference, ...existing, id: migration.to, identity: migration.to });
        }
        for (const [store, records] of [
          [profileAnalysisStore, profileAnalysis],
          [profileViewsStore, profileViews],
        ] as const) {
          for (const record of records) {
            if (record.sessionKey === sessionKey) store.delete([sessionKey, record.id]);
          }
          for (const record of migratePersonRecords(records, sessionKey, replacements)) {
            store.put(record);
          }
        }
      } catch (error) {
        writePreparationError = error;
        transaction.abort();
      }
    };
    messageRequest.onsuccess = () => {
      messages = messageRequest.result;
      queueWritesWhileActive();
    };
    conversationRequest.onsuccess = () => {
      conversations = conversationRequest.result;
      queueWritesWhileActive();
    };
    preferenceRequest.onsuccess = () => {
      preferences = preferenceRequest.result;
      queueWritesWhileActive();
    };
    inboxRequest.onsuccess = () => {
      inbox = inboxRequest.result;
      queueWritesWhileActive();
    };
    profileAnalysisRequest.onsuccess = () => {
      profileAnalysis = profileAnalysisRequest.result;
      queueWritesWhileActive();
    };
    profileViewsRequest.onsuccess = () => {
      profileViews = profileViewsRequest.result;
      queueWritesWhileActive();
    };
    try {
      await done;
    } catch (error) {
      throw writePreparationError ?? error;
    }
  }
}

export async function createIndexedDbPhoneDb(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): Promise<PhoneDb> {
  if (!factory) throw new Error('IndexedDB 不可用 (unavailable)');
  return new IndexedDbPhoneDb(await openDatabase(factory));
}

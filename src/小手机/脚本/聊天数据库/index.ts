// ==================== 小手机聊天数据库 (ChatDB) ====================
// IndexedDB: TenantChatDB — 手机聊天的完整本地记录
// 按酒馆 chatId 隔离，切换聊天自动指向对应数据
// 导出到 window.parent.ChatDB

import {
  buildConversationRecord,
  createConversationForOperation,
  queryConversationsForOperation,
  type ConversationCreationData,
} from './chatPartitionOperations';
import { createChatOperationContextFactory, type ChatOperationContext } from './chatOperationContext';

interface ChatConversation {
  id: string;
  chatId: string;
  type: 'private' | 'group';
  name: string;
  members: string[];
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  id?: number;
  conversationId: string;
  sender: string;
  content: string;
  extras?: Record<string, any>;
  gameTime: {
    年份: number;
    日期: string;
    星期: string;
    时间: string;
  } | null;
  syncedToLore: boolean;
  createdAt: number;
}

interface GameTime {
  年份: number;
  日期: string;
  星期: string;
  时间: string;
}

type CreateConversationInput = Partial<ChatConversation> & ConversationCreationData;

$(() => {
  const DB_NAME = 'TenantChatDB';
  const DB_VERSION = 1;

  let latestDatabase: IDBDatabase | null = null;
  let currentChatId: string | null = null;

  // ==================== 数据库初始化 ====================

  function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains('conversations')) {
          const convStore = database.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('chatId', 'chatId', { unique: false });
          convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!database.objectStoreNames.contains('messages')) {
          const msgStore = database.createObjectStore('messages', {
            keyPath: 'id',
            autoIncrement: true,
          });
          msgStore.createIndex('conversationId', 'conversationId', { unique: false });
          msgStore.createIndex('syncedToLore', 'syncedToLore', { unique: false });
        }
      };

      request.onsuccess = event => {
        latestDatabase = (event.target as IDBOpenDBRequest).result;
        resolve(latestDatabase);
      };

      request.onerror = event => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  // ==================== 游戏时间 ====================

  function getGameTime(chat: string = 'current'): GameTime {
    try {
      // 优先从 MVU 读取
      const parentWindow = window.parent as any;
      if (parentWindow.Mvu?.getMvuData) {
        const mvuData = parentWindow.Mvu.getMvuData({ type: 'message', message_id: -1 });
        if (mvuData?.stat_data?.世界) {
          return mvuData.stat_data.世界 as GameTime;
        }
      }
    } catch {
      /* 静默回退 */
    }

    // 回退：当前系统时间
    const now = new Date();
    return {
      年份: now.getFullYear(),
      日期: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      星期: ['日', '一', '二', '三', '四', '五', '六'][now.getDay()],
      时间: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    };
  }

  function formatGameTime(gt: GameTime): string {
    return `${gt.日期} 周${gt.星期} ${gt.时间}`;
  }

  // ==================== ChatId 检测与操作上下文 ====================

  function readCurrentChatId(): string {
    try {
      const parentWindow = window.parent as any;
      if (parentWindow.SillyTavern?.getContext) {
        const ctx = parentWindow.SillyTavern.getContext();
        return String(ctx.chatId || 'default');
      }
    } catch {
      /* 静默忽略 */
    }
    return 'default';
  }

  const beginOperation = createChatOperationContextFactory({
    readChatId: readCurrentChatId,
    openDatabase: openDB,
    onDiagnosticChatId: chatId => {
      currentChatId = chatId;
    },
  });

  async function getChatId(): Promise<string> {
    return readCurrentChatId();
  }

  async function ensureConnection(): Promise<void> {
    const operation = beginOperation();
    await operation.dbPromise;
    console.log(`[ChatDB] 已连接 TenantChatDB, chatId: ${operation.chatId}`);
  }

  function readConversationById(database: IDBDatabase, conversationId: string): Promise<ChatConversation | undefined> {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['conversations'], 'readonly');
      const request = tx.objectStore('conversations').get(conversationId);
      request.onsuccess = () => resolve(request.result as ChatConversation | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async function getConversationInContext(
    operation: ChatOperationContext<IDBDatabase>,
    id: string,
  ): Promise<ChatConversation | undefined> {
    const database = await operation.dbPromise;
    const record = await readConversationById(database, id);
    return record?.chatId === operation.chatId ? record : undefined;
  }

  async function requireConversationInContext(
    operation: ChatOperationContext<IDBDatabase>,
    id: string,
  ): Promise<ChatConversation> {
    const conversation = await getConversationInContext(operation, id);
    if (!conversation) throw new Error(`会话不存在于当前聊天分区: ${id}`);
    return conversation;
  }

  function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  // ==================== 会话 CRUD ====================

  async function createConversation(data: CreateConversationInput): Promise<ChatConversation> {
    const operation = beginOperation();
    return createConversationForOperation(operation, data, Date.now(), async (database, record) => {
      const conversation: ChatConversation = record;
      const transaction = database.transaction(['conversations'], 'readwrite');
      transaction.objectStore('conversations').add(conversation);
      await waitForTransaction(transaction);
      return conversation;
    });
  }

  async function getConversation(conversationId: string): Promise<ChatConversation | undefined> {
    const operation = beginOperation();
    return getConversationInContext(operation, conversationId);
  }

  async function getConversations(): Promise<ChatConversation[]> {
    const operation = beginOperation();
    return queryConversationsForOperation(operation, database => ({
      getAll: chatId =>
        new Promise<ChatConversation[]>((resolve, reject) => {
          const transaction = database.transaction(['conversations'], 'readonly');
          const request = transaction.objectStore('conversations').index('chatId').getAll(chatId);
          request.onsuccess = () => resolve((request.result || []) as ChatConversation[]);
          request.onerror = () => reject(request.error);
        }),
    }));
  }

  async function updateConversation(conversationId: string, updates: Partial<ChatConversation>): Promise<void> {
    const operation = beginOperation();
    const database = await operation.dbPromise;
    const conversation = await getConversationInContext(operation, conversationId);
    if (!conversation) throw new Error(`会话不存在于当前聊天分区: ${conversationId}`);
    const updated: ChatConversation = {
      ...conversation,
      ...updates,
      id: conversation.id,
      chatId: operation.chatId,
      updatedAt: Date.now(),
    };
    const transaction = database.transaction(['conversations'], 'readwrite');
    transaction.objectStore('conversations').put(updated);
    await waitForTransaction(transaction);
  }

  async function validateMessageIdsInContext(
    operation: ChatOperationContext<IDBDatabase>,
    database: IDBDatabase,
    messageIds: number[],
  ): Promise<ChatMessage[]> {
    const messages = await new Promise<ChatMessage[]>((resolve, reject) => {
      const transaction = database.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const records: ChatMessage[] = [];
      for (const id of messageIds) {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) records.push(request.result as ChatMessage);
        };
      }
      transaction.oncomplete = () => resolve(records);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });

    for (const conversationId of new Set(messages.map(message => message.conversationId))) {
      if (!(await getConversationInContext(operation, conversationId))) {
        throw new Error(`消息不属于当前聊天分区: ${conversationId}`);
      }
    }
    return messages;
  }

  // ==================== 消息 CRUD ====================

  async function addMessage(
    conversationId: string,
    sender: string,
    content: string,
    extras?: Record<string, any>,
  ): Promise<ChatMessage> {
    const operation = beginOperation();
    const database = await operation.dbPromise;
    const conversation = await requireConversationInContext(operation, conversationId);

    const msg: Omit<ChatMessage, 'id'> = {
      conversationId,
      sender,
      content,
      extras,
      gameTime: getGameTime(),
      syncedToLore: false,
      createdAt: Date.now(),
    };

    return new Promise<ChatMessage>((resolve, reject) => {
      const transaction = database.transaction(['messages', 'conversations'], 'readwrite');
      const messageRequest = transaction.objectStore('messages').add(msg as ChatMessage);
      const updatedConversation = { ...conversation, updatedAt: Date.now() };
      transaction.objectStore('conversations').put(updatedConversation);
      let messageId: number | undefined;
      messageRequest.onsuccess = () => {
        messageId = messageRequest.result as number;
      };
      transaction.oncomplete = () => resolve({ ...msg, id: messageId });
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function getRecentMessages(conversationId: string, count: number = 30): Promise<ChatMessage[]> {
    const operation = beginOperation();
    const database = await operation.dbPromise;
    await requireConversationInContext(operation, conversationId);
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['messages'], 'readonly');
      const index = tx.objectStore('messages').index('conversationId');
      const req = index.openCursor(IDBKeyRange.only(conversationId), 'prev');
      const messages: ChatMessage[] = [];

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && messages.length < count) {
          messages.push(cursor.value);
          cursor.continue();
        } else {
          resolve(messages.reverse());
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function markSyncedToLore(messageIds: number[]): Promise<void> {
    const operation = beginOperation();
    const database = await operation.dbPromise;
    const messages = await validateMessageIdsInContext(operation, database, messageIds);
    const tx = database.transaction(['messages'], 'readwrite');
    const store = tx.objectStore('messages');

    for (const message of messages) {
      store.put({ ...message, syncedToLore: true });
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // ==================== 导出到全局 ====================

  const ChatDB = {
    get db() {
      return latestDatabase;
    },
    get currentChatId() {
      return currentChatId;
    },
    openDB,
    ensureConnection,
    createConversation,
    getConversation,
    getConversations,
    updateConversation,
    addMessage,
    getRecentMessages,
    markSyncedToLore,
    getGameTime,
    formatGameTime,
    getChatId,
  };

  (window.parent as any).ChatDB = ChatDB;

  // 注册到酒馆助手的全局初始化系统
  if (typeof (window as any).initializeGlobal === 'function') {
    (window as any).initializeGlobal('ChatDB', ChatDB);
  }

  console.log('✅ [聊天数据库] ChatDB 已加载 → window.parent.ChatDB');
});

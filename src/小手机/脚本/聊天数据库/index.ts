// ==================== 小手机聊天数据库 (ChatDB) ====================
// IndexedDB: TenantChatDB — 手机聊天的完整本地记录
// 按酒馆 chatId 隔离，切换聊天自动指向对应数据
// 导出到 window.parent.ChatDB

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

$(() => {
  const DB_NAME = 'TenantChatDB';
  const DB_VERSION = 1;

  let db: IDBDatabase | null = null;
  let currentChatId: string | null = null;

  // ==================== 数据库初始化 ====================

  function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
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

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  // ==================== 游戏时间 ====================

  function getGameTime(chat: string = 'current'): GameTime {
    try {
      // 优先从 MVU 读取
      if (window.parent.Mvu?.getMvuData) {
        const mvuData = window.parent.Mvu.getMvuData({ type: 'message', message_id: -1 });
        if (mvuData?.stat_data?.世界) {
          return mvuData.stat_data.世界 as GameTime;
        }
      }
    } catch { /* 静默回退 */ }

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

  // ==================== ChatId 检测与重连 ====================

  async function getChatId(): Promise<string> {
    try {
      if (window.parent.SillyTavern?.getContext) {
        const ctx = window.parent.SillyTavern.getContext();
        return ctx.chatId || 'default';
      }
    } catch { /* 静默忽略 */ }
    return 'default';
  }

  async function ensureConnection(): Promise<void> {
    const chatId = await getChatId();
    if (db && currentChatId === chatId) return;
    currentChatId = chatId;
    db = await openDB();
    console.log(`[ChatDB] 已连接 TenantChatDB, chatId: ${chatId}`);
  }

  // ==================== 会话 CRUD ====================

  async function createConversation(data: Partial<ChatConversation> & { type: 'private' | 'group'; members: string[]; name?: string }): Promise<ChatConversation> {
    await ensureConnection();
    const chatId = currentChatId!;
    const name = data.name || (data.type === 'private' ? data.members[0] : `群聊_${Date.now()}`);
    const id = `conv_${chatId}_${data.type}_${name}_${Date.now()}`;

    const conv: ChatConversation = {
      id,
      chatId,
      type: data.type,
      name,
      members: data.members,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db!.transaction(['conversations'], 'readwrite');
      tx.objectStore('conversations').add(conv);
      tx.oncomplete = () => resolve(conv);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getConversation(conversationId: string): Promise<ChatConversation | undefined> {
    await ensureConnection();
    return new Promise((resolve, reject) => {
      const tx = db!.transaction(['conversations'], 'readonly');
      const req = tx.objectStore('conversations').get(conversationId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getConversations(): Promise<ChatConversation[]> {
    await ensureConnection();
    return new Promise((resolve, reject) => {
      const tx = db!.transaction(['conversations'], 'readonly');
      const index = tx.objectStore('conversations').index('chatId');
      const req = index.getAll(currentChatId!);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function updateConversation(conversationId: string, updates: Partial<ChatConversation>): Promise<void> {
    await ensureConnection();
    const conv = await getConversation(conversationId);
    if (!conv) throw new Error(`会话不存在: ${conversationId}`);
    const updated = { ...conv, ...updates, updatedAt: Date.now() };
    return new Promise((resolve, reject) => {
      const tx = db!.transaction(['conversations'], 'readwrite');
      tx.objectStore('conversations').put(updated);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==================== 消息 CRUD ====================

  async function addMessage(
    conversationId: string,
    sender: string,
    content: string,
    extras?: Record<string, any>,
  ): Promise<ChatMessage> {
    await ensureConnection();

    const msg: Omit<ChatMessage, 'id'> = {
      conversationId,
      sender,
      content,
      extras,
      gameTime: getGameTime(),
      syncedToLore: false,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db!.transaction(['messages', 'conversations'], 'readwrite');
      const msgReq = tx.objectStore('messages').add(msg as any);

      msgReq.onsuccess = () => {
        // 同步更新会话的 updatedAt
        const convReq = tx.objectStore('conversations').get(conversationId);
        convReq.onsuccess = () => {
          const conv = convReq.result;
          if (conv) {
            conv.updatedAt = Date.now();
            tx.objectStore('conversations').put(conv);
          }
        };
        resolve({ ...msg, id: msgReq.result as number });
      };
      msgReq.onerror = () => reject(msgReq.error);
      tx.oncomplete = () => { /* 事务完成 */ };
    });
  }

  async function getRecentMessages(conversationId: string, count: number = 30): Promise<ChatMessage[]> {
    await ensureConnection();
    return new Promise((resolve, reject) => {
      const tx = db!.transaction(['messages'], 'readonly');
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
    await ensureConnection();
    const tx = db!.transaction(['messages'], 'readwrite');
    const store = tx.objectStore('messages');

    for (const id of messageIds) {
      const req = store.get(id);
      req.onsuccess = () => {
        const msg = req.result;
        if (msg) {
          msg.syncedToLore = true;
          store.put(msg);
        }
      };
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==================== 导出到全局 ====================

  const ChatDB = {
    get db() { return db; },
    get currentChatId() { return currentChatId; },
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

  window.parent.ChatDB = ChatDB;

  // 注册到酒馆助手的全局初始化系统
  if (typeof (window as any).initializeGlobal === 'function') {
    (window as any).initializeGlobal('ChatDB', ChatDB);
  }

  console.log('✅ [聊天数据库] ChatDB 已加载 → window.parent.ChatDB');
});

/**
 * IndexedDB 图片存储
 * 将生成的图片 base64 存入浏览器本地 IndexedDB，避免写入聊天 JSON 导致文件膨胀。
 * 同设备同浏览器持久化，无需跨设备。
 */

const DB_NAME = 'chatu8-ui-image-store';
const DB_VERSION = 1;
const STORE_NAME = 'images';

type StoredImage = {
  /** 主键: `${chatId}:${messageId}:${requestId}` */
  key: string;
  chatId: string;
  messageId: number;
  requestId: string;
  promptToken: string;
  prompt: string;
  /** base64 data URL */
  imageData: string;
  createdAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('chatId', 'chatId', { unique: false });
        store.createIndex('messageId_chatId', ['chatId', 'messageId'], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function buildKey(chatId: string, messageId: number, requestId: string): string {
  return `${chatId}:${messageId}:${requestId}`;
}

function readCurrentChatId(): string {
  try {
    for (const w of [window, window.parent, window.top]) {
      try {
        const id = (w as any)?.SillyTavern?.getCurrentChatId?.();
        if (id) return String(id);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return 'unknown';
}

// --- 公开 API ---

export async function storeImage(input: {
  messageId: number;
  requestId: string;
  promptToken: string;
  prompt: string;
  imageData: string;
}): Promise<string> {
  const chatId = readCurrentChatId();
  const key = buildKey(chatId, input.messageId, input.requestId);
  const record: StoredImage = {
    key,
    chatId,
    messageId: input.messageId,
    requestId: input.requestId,
    promptToken: input.promptToken,
    prompt: input.prompt,
    imageData: input.imageData,
    createdAt: Date.now(),
  };
  const db = await openDb();
  return new Promise<string>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve(key);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadImage(
  messageId: number,
  requestId: string,
): Promise<string | null> {
  const chatId = readCurrentChatId();
  const key = buildKey(chatId, messageId, requestId);
  const db = await openDb();
  return new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as StoredImage | undefined)?.imageData ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function loadImagesByMessage(messageId: number): Promise<StoredImage[]> {
  const chatId = readCurrentChatId();
  const db = await openDb();
  return new Promise<StoredImage[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('messageId_chatId');
    const req = index.getAll([chatId, messageId]);
    req.onsuccess = () => resolve((req.result as StoredImage[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllImagesForChat(): Promise<StoredImage[]> {
  const chatId = readCurrentChatId();
  const db = await openDb();
  return new Promise<StoredImage[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('chatId');
    const req = index.getAll(chatId);
    req.onsuccess = () => resolve((req.result as StoredImage[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImage(messageId: number, requestId: string): Promise<void> {
  const chatId = readCurrentChatId();
  const key = buildKey(chatId, messageId, requestId);
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

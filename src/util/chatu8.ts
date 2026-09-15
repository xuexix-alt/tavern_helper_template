/**
 * st-chatu8 生图插件适配层（一劳永逸方案）
 *
 * === 依赖的插件契约（适配自 st-chatu8 v3.0.7，源码镜像见 /插件仓库/st-chatu8）===
 * 插件升级后请按本清单逐项核对（详见 寒冬末日/开发记录.md 的 chatu8 章节）：
 *
 * C1 标记格式：`image###<prompt>###`（默认 startTag/endTag；插件设置里可自定义，此处只支持默认）
 * C2 标签归一化（data-link 口径）：提取 image### 与 ### 之间内容 → trim → 《》→ <> → 去除换行
 * C3 图片缓存：IndexedDB `chatu8_gallery`（v6）/ objectStore `tupianhuancun`
 *    - 媒体记录：{ id: uuid, data: ArrayBuffer }
 *    - 元数据记录：id === 'tupianshuju'，value = { [md5(归一化tag)]: {
 *        images: [{ uuid, thumbnail_uuid, date, isVideo, originalUrl, size, ... }],
 *        index, change, video, activeMode } }
 *    - 注：开启「保存到酒馆服务器」模式时元数据在 extensionSettings，iframe 读不到，走 DOM 兜底
 * C4 标签位置：chat[messageId].extra.images[swipe_id] = [{ regex, tag, locked? }]
 *    （iframe 场景的历史数据在 chatMetadata['st-chatu8'].data.image_groups）
 * C5 DOM 注入（iframe 内）：button.image-tag-button.st-chatu8-image-button[data-link]
 *    + div.st-chatu8-image-container > img|video、.st-chatu8-collapse-wrapper
 * C6 事件：酒馆 eventSource 'st_chatu8_auto_click_complete'，载荷 { taskId, success }
 *
 * === 防脱节设计 ===
 * - 全部读取带能力探测与优雅降级：任何一层契约失效只 console.warn 一次，不影响 UI 主流程
 * - probeChatu8() 可随时输出能力报告，插件升级后自检定位断点
 * - md5 多变体匹配：消息原文 tag / 归一化 tag / 全角标点清洗 tag，覆盖插件不同存库口径
 */

/* ------------------------------- MD5 实现 ------------------------------- */
// 标准 MD5（RFC 1321，小写 hex）。不引第三方库：算法本身 30 年不变，
// 依赖「MD5(tag) 十六进制」这个数学事实而非任何库的打包链路。

function toUtf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        i++;
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

function md5Cycle(x: Int32Array, k: number[]): void {
  let a = x[0], b = x[1], c = x[2], d = x[3];

  const ff = (a2: number, b2: number, c2: number, d2: number, sx: number, s: number, t: number) =>
    cmn((b2 & c2) | (~b2 & d2), a2, b2, sx, s, t);
  const gg = (a2: number, b2: number, c2: number, d2: number, sx: number, s: number, t: number) =>
    cmn((b2 & d2) | (c2 & ~d2), a2, b2, sx, s, t);
  const hh = (a2: number, b2: number, c2: number, d2: number, sx: number, s: number, t: number) =>
    cmn(b2 ^ c2 ^ d2, a2, b2, sx, s, t);
  const ii = (a2: number, b2: number, c2: number, d2: number, sx: number, s: number, t: number) =>
    cmn(c2 ^ (b2 | ~d2), a2, b2, sx, s, t);
  function cmn(q: number, a2: number, b2: number, sx: number, s: number, t: number) {
    a2 = (((a2 + q) | 0) + ((sx + t) | 0)) | 0;
    return (((a2 << s) | (a2 >>> (32 - s))) + b2) | 0;
  }

  a = ff(a, b, c, d, k[0], 7, -680876936);
  d = ff(d, a, b, c, k[1], 12, -389564586);
  c = ff(c, d, a, b, k[2], 17, 606105819);
  b = ff(b, c, d, a, k[3], 22, -1044525330);
  a = ff(a, b, c, d, k[4], 7, -176418897);
  d = ff(d, a, b, c, k[5], 12, 1200080426);
  c = ff(c, d, a, b, k[6], 17, -1473231341);
  b = ff(b, c, d, a, k[7], 22, -45705983);
  a = ff(a, b, c, d, k[8], 7, 1770035416);
  d = ff(d, a, b, c, k[9], 12, -1958414417);
  c = ff(c, d, a, b, k[10], 17, -42063);
  b = ff(b, c, d, a, k[11], 22, -1990404162);
  a = ff(a, b, c, d, k[12], 7, 1804603682);
  d = ff(d, a, b, c, k[13], 12, -40341101);
  c = ff(c, d, a, b, k[14], 17, -1502002290);
  b = ff(b, c, d, a, k[15], 22, 1236535329);

  a = gg(a, b, c, d, k[1], 5, -165796510);
  d = gg(d, a, b, c, k[6], 9, -1069501632);
  c = gg(c, d, a, b, k[11], 14, 643717713);
  b = gg(b, c, d, a, k[0], 20, -373897302);
  a = gg(a, b, c, d, k[5], 5, -701558691);
  d = gg(d, a, b, c, k[10], 9, 38016083);
  c = gg(c, d, a, b, k[15], 14, -660478335);
  b = gg(b, c, d, a, k[4], 20, -405537848);
  a = gg(a, b, c, d, k[9], 5, 568446438);
  d = gg(d, a, b, c, k[14], 9, -1019803690);
  c = gg(c, d, a, b, k[3], 14, -187363961);
  b = gg(b, c, d, a, k[8], 20, 1163531501);
  a = gg(a, b, c, d, k[13], 5, -1444681467);
  d = gg(d, a, b, c, k[2], 9, -51403784);
  c = gg(c, d, a, b, k[7], 14, 1735328473);
  b = gg(b, c, d, a, k[12], 20, -1926607734);

  a = hh(a, b, c, d, k[5], 4, -378558);
  d = hh(d, a, b, c, k[8], 11, -2022574463);
  c = hh(c, d, a, b, k[11], 16, 1839030562);
  b = hh(b, c, d, a, k[14], 23, -35309556);
  a = hh(a, b, c, d, k[1], 4, -1530992060);
  d = hh(d, a, b, c, k[4], 11, 1272893353);
  c = hh(c, d, a, b, k[7], 16, -155497632);
  b = hh(b, c, d, a, k[10], 23, -1094730640);
  a = hh(a, b, c, d, k[13], 4, 681279174);
  d = hh(d, a, b, c, k[0], 11, -358537222);
  c = hh(c, d, a, b, k[3], 16, -722521979);
  b = hh(b, c, d, a, k[6], 23, 76029189);
  a = hh(a, b, c, d, k[9], 4, -640364487);
  d = hh(d, a, b, c, k[12], 11, -421815835);
  c = hh(c, d, a, b, k[15], 16, 530742520);
  b = hh(b, c, d, a, k[2], 23, -995338651);

  a = ii(a, b, c, d, k[0], 6, -198630844);
  d = ii(d, a, b, c, k[7], 10, 1126891415);
  c = ii(c, d, a, b, k[14], 15, -1416354905);
  b = ii(b, c, d, a, k[5], 21, -57434055);
  a = ii(a, b, c, d, k[12], 6, 1700485571);
  d = ii(d, a, b, c, k[3], 10, -1894986606);
  c = ii(c, d, a, b, k[10], 15, -1051523);
  b = ii(b, c, d, a, k[1], 21, -2054922799);
  a = ii(a, b, c, d, k[8], 6, 1873313359);
  d = ii(d, a, b, c, k[15], 10, -30611744);
  c = ii(c, d, a, b, k[6], 15, -1560198380);
  b = ii(b, c, d, a, k[13], 21, 1309151649);
  a = ii(a, b, c, d, k[4], 6, -145523070);
  d = ii(d, a, b, c, k[11], 10, -1120210379);
  c = ii(c, d, a, b, k[2], 15, 718787259);
  b = ii(b, c, d, a, k[9], 21, -343485551);

  x[0] = (x[0] + a) | 0;
  x[1] = (x[1] + b) | 0;
  x[2] = (x[2] + c) | 0;
  x[3] = (x[3] + d) | 0;
}

export function md5(input: string): string {
  // 注意：长度必须按 UTF-8 字节数计算（中文 prompt 场景），与 CryptoJS.MD5 口径一致
  const bytes = toUtf8Bytes(input);
  const state = new Int32Array([1732584193, -271733879, -1732584194, 271733878]);

  // md5Cycle 的入参是 16 个 32 位小端字，必须先打包（不能直接传字节数组）
  const packWords = (bytesIn: number[]): number[] => {
    const words = new Array(16).fill(0);
    for (let j = 0; j < bytesIn.length; j++) words[j >> 2] |= bytesIn[j] << ((j % 4) << 3);
    return words;
  };

  let i: number;
  for (i = 64; i <= bytes.length; i += 64) {
    md5Cycle(state, packWords(bytes.slice(i - 64, i)));
  }
  const tail = bytes.slice(i - 64);
  const block = packWords(tail);
  const j = tail.length;
  block[j >> 2] |= 0x80 << ((j % 4) << 3);
  if (j > 55) {
    md5Cycle(state, block);
    block.fill(0);
  }
  block[14] = bytes.length * 8;
  md5Cycle(state, block);

  const hex = (num: number) => {
    let s = '';
    for (let k = 0; k < 4; k++) {
      s += ((num >> (k * 8 + 4)) & 0x0f).toString(16) + ((num >> (k * 8)) & 0x0f).toString(16);
    }
    return s;
  };
  return hex(state[0]) + hex(state[1]) + hex(state[2]) + hex(state[3]);
}

/* ---------------------------- 契约常量与类型 ---------------------------- */

/** C3：图片缓存 IndexedDB */
const CHATU8_DB_NAME = 'chatu8_gallery';
const CHATU8_STORE_NAME = 'tupianhuancun';
const CHATU8_METADATA_ID = 'tupianshuju';
/** C5：iframe 内插件注入的 DOM 选择器 */
export const CHATU8_DOM_SELECTORS = {
  button: 'button.image-tag-button.st-chatu8-image-button',
  container: '.st-chatu8-image-container',
  managed: '.image-tag-button, .st-chatu8-image-button, .st-chatu8-image-span, .st-chatu8-image-container, .st-chatu8-collapse-wrapper',
} as const;
/** C6：生图完成事件名（酒馆 eventSource） */
const CHATU8_EVENT = 'st_chatu8_auto_click_complete';

type Chatu8ImageEntry = {
  uuid?: string;
  thumbnail_uuid?: string;
  date?: number;
  isVideo?: boolean;
  originalUrl?: string;
};

type Chatu8MetadataGroup = {
  images?: Chatu8ImageEntry[];
  index?: number;
};

type Chatu8Metadata = Record<string, Chatu8MetadataGroup>;

export type Chatu8ResolvedImage = {
  /** 可直接用于 <img src> / <video src> 的 blob: URL（适配层内部缓存并管理生命周期，调用方无需 revoke） */
  objectUrl: string;
  isVideo: boolean;
  date: number;
  /** 命中的元数据组内图片总数（>1 时可切换） */
  total: number;
  index: number;
};

/* ------------------------------ Tag 归一化 ------------------------------ */

/**
 * 从任意输入提取 chatu8 纯 tag 并按 C2 契约归一化。
 * 输入兼容：`image###xxx###`、`###xxx###`、裸 prompt。
 */
export function normalizeChatu8Tag(raw: string): string {
  let s = (raw ?? '').trim();
  const wrapped = s.match(/image###([\s\S]*?)###/i) ?? s.match(/^###([\s\S]*?)###$/);
  if (wrapped) s = wrapped[1] ?? '';
  return s
    .trim()
    .replaceAll('《', '<')
    .replaceAll('》', '>')
    .replaceAll('\n', '');
}

/** 插件 parseImagesFromPrompt 的全角标点清洗口径（存库 tag 变体） */
function cleanFullWidth(s: string): string {
  return s.replace(/，/g, ',').replace(/；/g, ';').replace(/：/g, ':').replace(/,\s*/g, ', ');
}

/** 生成 md5 候选键（覆盖插件不同存库口径），去重保序 */
function md5Candidates(tag: string): string[] {
  const base = normalizeChatu8Tag(tag);
  const variants = [base, cleanFullWidth(base), base.replace(/\s+/g, ' ')];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const h = md5(v);
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}

/* --------------------------- IndexedDB 读取层 --------------------------- */

let dbPromise: Promise<IDBDatabase | null> | null = null;
let dbWarned = false;

function warnOnce(msg: string): void {
  if (dbWarned) return;
  dbWarned = true;
  console.warn(`[chatu8适配层] ${msg}`);
}

async function openChatu8Db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      if (typeof indexedDB === 'undefined') return null;
      // 先探测存在性，避免在非酒馆环境误建空库
      if (typeof indexedDB.databases === 'function') {
        const names = await indexedDB.databases();
        if (!names.some(d => d.name === CHATU8_DB_NAME)) {
          warnOnce(`未发现 ${CHATU8_DB_NAME} 数据库（插件未安装/未生成过图片），图片解析将走降级路径`);
          return null;
        }
      }
      return await new Promise<IDBDatabase | null>((resolve, reject) => {
        const req = indexedDB.open(CHATU8_DB_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('db blocked'));
      });
    } catch (e) {
      warnOnce(`打开 ${CHATU8_DB_NAME} 失败：${String(e)}`);
      return null;
    }
  })();
  return dbPromise;
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains(store)) {
        reject(new Error(`objectStore "${store}" 不存在（插件结构可能已变更）`));
        return;
      }
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

let metadataCache: { at: number; data: Chatu8Metadata } | null = null;
const METADATA_TTL = 5_000;

/**
 * objectUrl 缓存（uuid → blob: URL）：同一 uuid 的媒体记录不可变，
 * 重复解析复用同一 URL，调用方无需 revoke、也不会内存泄漏。
 * LRU 上限防止超长会话无限增长；被逐出的 URL 若仍被 <img> 引用，
 * 浏览器会保持其存活直到元素卸载，安全。
 */
const objectUrlCache = new Map<string, string>();
const OBJECT_URL_CACHE_MAX = 64;

function cacheObjectUrl(uuid: string, url: string): string {
  const hit = objectUrlCache.get(uuid);
  if (hit) {
    objectUrlCache.delete(uuid);
    objectUrlCache.set(uuid, hit);
    return hit;
  }
  objectUrlCache.set(uuid, url);
  if (objectUrlCache.size > OBJECT_URL_CACHE_MAX) {
    const oldest = objectUrlCache.keys().next().value;
    if (oldest !== undefined) {
      const stale = objectUrlCache.get(oldest);
      objectUrlCache.delete(oldest);
      if (stale) URL.revokeObjectURL(stale);
    }
  }
  return url;
}

async function readMetadata(force = false): Promise<Chatu8Metadata | null> {
  const db = await openChatu8Db();
  if (!db) return null;
  if (!force && metadataCache && Date.now() - metadataCache.at < METADATA_TTL) {
    return metadataCache.data;
  }
  try {
    const data = (await idbGet<Chatu8Metadata>(db, CHATU8_STORE_NAME, CHATU8_METADATA_ID)) ?? {};
    metadataCache = { at: Date.now(), data };
    return data;
  } catch (e) {
    warnOnce(`读取图片缓存元数据失败：${String(e)}`);
    return null;
  }
}

/** 供外部主动失效缓存（生成完成后调用，保证下次读到新图） */
export function invalidateChatu8Cache(): void {
  metadataCache = null;
}

async function readMediaBlob(uuid: string, isVideo: boolean): Promise<string | null> {
  const cached = objectUrlCache.get(uuid);
  if (cached) {
    // LRU touch
    objectUrlCache.delete(uuid);
    objectUrlCache.set(uuid, cached);
    return cached;
  }
  const db = await openChatu8Db();
  if (!db) return null;
  try {
    const rec = await idbGet<{ data?: ArrayBuffer }>(db, CHATU8_STORE_NAME, uuid);
    if (!rec?.data) return null;
    const blob = new Blob([rec.data], { type: isVideo ? 'video/mp4' : 'image/png' });
    return cacheObjectUrl(uuid, URL.createObjectURL(blob));
  } catch (e) {
    warnOnce(`读取图片数据失败（uuid=${uuid.slice(0, 8)}…）：${String(e)}`);
    return null;
  }
}

/**
 * 解析一个 chatu8 tag（或包含 image###...### 的原文）对应的已生成图片。
 * 策略：md5 多变体 → 元数据组 → 组内当前 index（越界回退最后一张）→ blob: URL。
 * 返回 null 表示该 tag 尚无已生成图片（正常业务态，不告警）。
 */
export async function resolveChatu8Image(tag: string): Promise<Chatu8ResolvedImage | null> {
  const normalized = normalizeChatu8Tag(tag);
  if (!normalized) return null;
  const metadata = await readMetadata();
  if (!metadata) return null;

  const keys = md5Candidates(tag);
  let group: Chatu8MetadataGroup | null = null;
  for (const k of keys) {
    const g = metadata[k];
    if (g && Array.isArray(g.images) && g.images.length > 0) {
      group = g;
      break;
    }
  }
  if (!group || !group.images) return null;

  const total = group.images.length;
  const index = typeof group.index === 'number' && group.index >= 0 && group.index < total ? group.index : total - 1;
  const entry = group.images[index];
  if (!entry?.uuid) return null;

  const objectUrl = await readMediaBlob(entry.uuid, entry.isVideo === true);
  if (!objectUrl) return null;
  return {
    objectUrl,
    isVideo: entry.isVideo === true,
    date: entry.date ?? 0,
    total,
    index,
  };
}

/** 批量解析：raw prompt（含 image###...### 原文）→ 已生成图片 */
export async function resolveChatu8Images(tags: string[]): Promise<Record<string, Chatu8ResolvedImage>> {
  const out: Record<string, Chatu8ResolvedImage> = {};
  await Promise.all(
    Array.from(new Set(tags.filter(Boolean))).map(async tag => {
      const hit = await resolveChatu8Image(tag);
      if (hit) out[tag] = hit;
    }),
  );
  return out;
}

/* --------------------------- 活动监听（C6+DOM） --------------------------- */

/**
 * 订阅 chatu8 生图活动（生成完成 / 图片插入 iframe）。
 * 双保险：酒馆 eventSource 事件 + iframe 内 MutationObserver，
 * 任何一个信号到达都会（去抖后）回调 —— 事件名或 DOM 类名单一失效不影响通知。
 * @returns 取消订阅函数
 */
export function watchChatu8Activity(onActivity: () => void): () => void {
  let disposed = false;
  let timer: number | null = null;
  const notify = () => {
    if (disposed) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      invalidateChatu8Cache();
      onActivity();
    }, 400);
  };

  const stops: Array<() => void> = [];

  // 信号 1：插件在酒馆 eventSource 上发出的完成事件
  try {
    if (typeof eventOn === 'function') {
      const ret = eventOn(CHATU8_EVENT, notify);
      stops.push(() => ret.stop());
    }
  } catch {
    /* 环境无酒馆事件系统时忽略 */
  }

  // 信号 2：插件向本 iframe 插入按钮/图片容器（DOM 契约兜底）
  try {
    const target = document.body;
    if (target) {
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            const el = node as Element;
            if (
              el.matches?.(CHATU8_DOM_SELECTORS.managed) ||
              el.querySelector?.(CHATU8_DOM_SELECTORS.managed)
            ) {
              notify();
              return;
            }
          }
        }
      });
      observer.observe(target, { childList: true, subtree: true });
      stops.push(() => observer.disconnect());
    }
  } catch {
    /* ignore */
  }

  return () => {
    disposed = true;
    if (timer !== null) window.clearTimeout(timer);
    for (const stop of stops) {
      try {
        stop();
      } catch {
        /* ignore */
      }
    }
  };
}

/** 在本 iframe 内查找插件注入的生成按钮（供代理触发：拿到后调用 .click()） */
export function findChatu8Button(tag: string): HTMLButtonElement | null {
  const link = normalizeChatu8Tag(tag);
  if (!link || typeof document === 'undefined') return null;
  const buttons = document.querySelectorAll<HTMLButtonElement>(CHATU8_DOM_SELECTORS.button);
  for (const btn of buttons) {
    if (btn.dataset.link === link || btn.dataset.imageTag === link) return btn;
  }
  return null;
}

/* ------------------------------ 能力探测 ------------------------------ */

export type Chatu8Capabilities = {
  /** C3 IndexedDB 存在且结构符合契约 */
  galleryDb: 'ok' | 'missing' | 'schema-changed';
  /** C4 消息楼层 extra.images 结构可见 */
  messageExtraImages: 'ok' | 'empty' | 'unavailable';
  /** C5 iframe 内检测到插件 DOM 注入 */
  domInjection: boolean;
  /** C6 事件系统可订阅 */
  eventSystem: boolean;
  /** 总体判断：核心数据层是否可用 */
  dataLayerUsable: boolean;
};

/**
 * chatu8 兼容性自检：插件升级后调用（控制台或调试入口），
 * 输出各契约项状态，快速定位「版本脱节」断点。
 */
export async function probeChatu8(messageId?: number): Promise<Chatu8Capabilities> {
  const caps: Chatu8Capabilities = {
    galleryDb: 'missing',
    messageExtraImages: 'unavailable',
    domInjection: false,
    eventSystem: false,
    dataLayerUsable: false,
  };

  // C3
  try {
    const db = await openChatu8Db();
    if (db) {
      caps.galleryDb = db.objectStoreNames.contains(CHATU8_STORE_NAME) ? 'ok' : 'schema-changed';
    }
  } catch {
    caps.galleryDb = 'missing';
  }

  // C4
  try {
    if (typeof SillyTavern !== 'undefined' && Array.isArray(SillyTavern.chat)) {
      const id = messageId ?? (typeof getCurrentMessageId === 'function' ? Number(getCurrentMessageId()) : NaN);
      const mes = Number.isFinite(id) ? SillyTavern.chat[id] : undefined;
      const images = mes?.extra?.images;
      caps.messageExtraImages = images && Object.keys(images).length > 0 ? 'ok' : 'empty';
    }
  } catch {
    /* keep unavailable */
  }

  // C5
  try {
    caps.domInjection = !!document.querySelector(CHATU8_DOM_SELECTORS.managed);
  } catch {
    /* ignore */
  }

  // C6
  caps.eventSystem = typeof eventOn === 'function';

  caps.dataLayerUsable = caps.galleryDb === 'ok';
  return caps;
}

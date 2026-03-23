/**
 * hostMesTextRender.ts
 *
 * 确保宿主 #chat 中存在指定 mesid 的 .mes_text DOM 节点，
 * 供插件的 getElContext() 读取正文内容。
 *
 * 背景：
 *   UI 通过 createChatMessages({ refresh: 'none' }) 写入消息数据，
 *   宿主不会渲染对应的 .mes DOM 节点。
 *   插件扫描宿主 DOM 时找不到目标楼层，回退到 mesid:0（EDEN-STAR 占位符），
 *   导致 LLM 拿到空正文，生图失败。
 *
 * 方案：
 *   在生图触发前，直接向宿主 #chat 注入一个离屏的 .mes 节点，
 *   写入真实正文，生图完成后由调用方清理（或保留供后续复用）。
 *   完全绕开 SillyTavern 的 refresh 渲染机制，不影响其他楼层。
 */

export interface EnsureHostMesTextDeps {
  /** iframe 自身的 document，用于排除非宿主文档 */
  currentDocument: Document;
  /** 返回所有可达的宿主文档列表 */
  collectHostDocuments: () => Document[];
  /** 读取 chat 数据层的消息详情 */
  readChatMessageDetail: (messageId: number) => any | null;
  /** setChatMessages —— 保留签名兼容，本实现不再调用它 */
  setChatMessages?: (...args: any[]) => Promise<any>;
}

export interface EnsureHostMesTextOptions {
  /** 注入节点后等待插件扫描的时间（ms），默认 50 */
  delayMs?: number;
  /** 已废弃，保留兼容性，不再使用 */
  attempts?: number;
}

/** 注入节点的 data 属性，用于标记和清理 */
const INJECTED_ATTR = 'data-ui-injected-mes';

/**
 * 找到宿主文档（非 iframe 自身的那个）
 */
function resolveHostDocument(currentDocument: Document, collectHostDocuments: () => Document[]): Document {
  const docs = collectHostDocuments();
  return docs.find(d => d !== currentDocument) ?? currentDocument;
}

/**
 * 从 message 数据里提取可读正文。
 * 插件读的是 mes_text.textContent，所以只需纯文本，不需要 HTML 格式化。
 */
function extractRawText(message: any): string {
  // SillyTavern chat 对象用 mes 字段，兼容 message 字段
  const raw = String(message?.mes ?? message?.message ?? '').trim();
  if (!raw) return '';
  return raw;
}

/**
 * 向宿主 #chat 注入离屏 .mes 节点。
 *
 * 节点样式：position:absolute; left:-9999px，完全不可见但 textContent 可读。
 * mesid 属性与数据层一致，供插件选择器 `.mes[mesid="N"] .mes_text` 命中。
 */
function injectMesNode(hostDoc: Document, messageId: number, rawText: string): HTMLElement | null {
  const chat = hostDoc.querySelector('#chat');
  if (!chat) return null;

  // 复用已有注入节点（避免重复注入）
  let mesEl = hostDoc.querySelector(`.mes[mesid="${messageId}"][${INJECTED_ATTR}]`) as HTMLElement | null;

  if (!mesEl) {
    mesEl = hostDoc.createElement('div');
    mesEl.className = 'mes';
    mesEl.setAttribute('mesid', String(messageId));
    mesEl.setAttribute(INJECTED_ATTR, 'true');
    // 离屏隐藏：不用 display:none（textContent 仍可读），不用 visibility:hidden（同上）
    // 用绝对定位推出视口，和宿主隐藏策略保持一致的方式
    mesEl.style.cssText =
      [
        'position: absolute',
        'left: -9999px',
        'top: 0',
        'width: 1px',
        'height: 1px',
        'overflow: hidden',
        'pointer-events: none',
        'opacity: 0',
      ].join(' !important; ') + ' !important;';

    const mesBlock = hostDoc.createElement('div');
    mesBlock.className = 'mes_block';

    const mesText = hostDoc.createElement('div');
    mesText.className = 'mes_text';

    mesBlock.appendChild(mesText);
    mesEl.appendChild(mesBlock);
    chat.appendChild(mesEl);
  }

  // 写入正文（textContent 赋值，不做 HTML 解析，安全且够用）
  const mesText = mesEl.querySelector('.mes_text') as HTMLElement | null;
  if (!mesText) return null;
  mesText.textContent = rawText;

  return mesEl;
}

/**
 * 清理由本模块注入的临时节点。
 * 调用方可在生图完成后调用，也可以选择保留供后续复用。
 */
export function cleanupInjectedMesNodes(currentDocument: Document, collectHostDocuments: () => Document[]): void {
  const hostDoc = resolveHostDocument(currentDocument, collectHostDocuments);
  const nodes = Array.from(hostDoc.querySelectorAll(`.mes[${INJECTED_ATTR}]`));
  for (const node of nodes) {
    if (typeof (node as any).remove === 'function') {
      (node as any).remove();
      continue;
    }
    const parent = (node as any)?.parentNode;
    if (parent && typeof parent.removeChild === 'function') {
      parent.removeChild(node);
      continue;
    }
    if (parent && Array.isArray((parent as any).children)) {
      (parent as any).children = (parent as any).children.filter((child: unknown) => child !== node);
      (node as any).parentNode = null;
    }
  }
}

/**
 * 主入口：确保宿主 DOM 中存在可被插件读取的 .mes[mesid] .mes_text 节点。
 *
 * 策略优先级：
 * 1. 宿主已有该节点且内容充足 → 直接返回 true（无副作用）
 * 2. 节点不存在或内容过短 → 读取数据层正文，手动注入离屏节点
 * 3. 数据层也没有内容 → 返回 false
 *
 * @returns true 表示节点已就绪（可能是已有或新注入），false 表示无法保证
 */
export async function ensureHostMesTextRendered(
  messageId: number,
  deps: EnsureHostMesTextDeps,
  options: EnsureHostMesTextOptions = {},
): Promise<boolean> {
  const { delayMs = 50 } = options;
  const hostDoc = resolveHostDocument(deps.currentDocument, deps.collectHostDocuments);

  // Step 1：检查是否已有充足内容的节点
  const existing = hostDoc.querySelector(`.mes[mesid="${messageId}"] .mes_text`) as HTMLElement | null;
  if (existing) {
    const len = (existing.textContent ?? '').trim().length;
    if (len > 100) {
      // 已有真实内容，直接可用
      return true;
    }
  }

  // Step 2：从数据层读取正文
  const message = deps.readChatMessageDetail(messageId);
  if (!message) return false;

  const rawText = extractRawText(message);
  if (!rawText || rawText.length < 10) return false;

  // Step 3：先清理旧 injected 节点，确保宿主里最多只保留当前目标楼层的一个代理节点
  cleanupInjectedMesNodes(deps.currentDocument, deps.collectHostDocuments);

  // Step 4：注入离屏节点
  const injected = injectMesNode(hostDoc, messageId, rawText);
  if (!injected) return false;

  // Step 5：给插件一个 tick 感知到 DOM 变化（MutationObserver 异步）
  if (delayMs > 0) {
    await new Promise<void>(resolve => setTimeout(resolve, delayMs));
  }

  // Step 6：验证节点已可查
  const verified = hostDoc.querySelector(`.mes[mesid="${messageId}"] .mes_text`) as HTMLElement | null;
  return !!(verified && (verified.textContent ?? '').trim().length > 0);
}

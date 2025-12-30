/**
 * 通用工具函数
 */

/**
 * 安全获取嵌套值
 * @param obj 目标对象
 * @param path 路径字符串，例如 'a.b.c' 或 'a[0].b'
 * @param fallback 默认值
 * @returns 找到的值或默认值
 */
export function getNestedValue<T = any>(obj: any, path: string, fallback: T = '--' as any): T {
  if (!obj) return fallback;
  const keys = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let current = obj;
  for (const key of keys) {
    if (current == null) return fallback;
    current = current[key];
  }
  return current ?? fallback;
}

/**
 * 深拷贝对象
 * @param obj 要拷贝的对象
 * @returns 深拷贝后的对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone) as any;
  const cloned: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * 防抖函数
 * @param fn 要执行的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

/**
 * 节流函数
 * @param fn 要执行的函数
 * @param limit 限制时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(fn: T, limit: number): T {
  let inThrottle: boolean = false;
  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }) as T;
}

/**
 * 生成随机ID
 * @param length ID长度
 * @returns 随机ID字符串
 */
export function generateId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 让“楼层消息 iframe”尽量占满酒馆聊天区域高度。
 * - 仅在 iframe 环境尝试（不影响本地独立调试）
 * - 通过修改 window.frameElement 的样式来设置高度
 */
export function enableIframeFullHeight(options?: { minHeightPx?: number }) {
  const minHeightPx = options?.minHeightPx ?? 480;

  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  if (!isInIframe) return () => {};

  const iframe = window.frameElement as HTMLIFrameElement | null;
  if (!iframe) return () => {};

  const pickHostHeight = () => {
    try {
      const doc = window.parent?.document;
      if (!doc) return window.innerHeight;

      const candidates = [
        '#chat',
        '#chat-wrapper',
        '#chat-container',
        '#chat-messages',
        '.chat',
        '.chat-wrapper',
        '.chat-content',
      ];

      for (const sel of candidates) {
        const el = doc.querySelector(sel) as HTMLElement | null;
        if (el && el.clientHeight > 0) return el.clientHeight;
      }

      return doc.documentElement?.clientHeight || window.parent.innerHeight || window.innerHeight;
    } catch {
      return window.innerHeight;
    }
  };

  let rafId = 0;
  const apply = () => {
    rafId = 0;
    const h = Math.max(minHeightPx, pickHostHeight());
    const next = `${h}px`;
    if (iframe.style.height !== next) {
      iframe.style.height = next;
      iframe.style.maxHeight = next;
      iframe.style.display = 'block';
    }
  };

  const schedule = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(apply);
  };

  // 初始化一次
  schedule();

  window.addEventListener('resize', schedule);
  // 宿主滚动/布局变化也可能影响可用高度
  try {
    window.parent?.addEventListener?.('resize', schedule);
  } catch {
    // ignore
  }

  return () => {
    window.removeEventListener('resize', schedule);
    try {
      window.parent?.removeEventListener?.('resize', schedule);
    } catch {
      // ignore
    }
    if (rafId) window.cancelAnimationFrame(rafId);
  };
}

/**
 * 智能导航函数 - 根据服务状态决定默认页面
 */
export async function navigateToDefaultPage() {
  try {
    // 等待MVU初始化 (最多等待2秒)
    await Promise.race([
      waitGlobalInitialized('Mvu'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MVU初始化超时')), 2000)),
    ]);

    // 获取MVU数据
    const mvuData = Mvu.getMvuData({ type: 'message', message_id: 'latest' }) as any;

    if (!mvuData) {
      // 使用 console.debug 避免生产环境噪音，或引入 logger
      return '/home';
    }

    // 检查订单数据
    const orders = mvuData.stat_data?.['服务中的订单'] || mvuData['服务中的订单'];

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return '/home';
    }

    // 过滤出服务中的订单（排除服务结束的）
    const activeOrders = orders.filter((order: any) => {
      const orderStatus = order.订单状态 || '';
      return !orderStatus.includes('服务结束');
    });

    if (activeOrders.length === 0) {
      return '/home';
    }

    return '/play';
  } catch (error) {
    console.error('[智能导航] 检查服务状态失败:', error);
    return '/home';
  }
}

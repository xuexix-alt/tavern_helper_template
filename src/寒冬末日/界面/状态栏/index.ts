import App from './App.vue';
import './global.css';

// 声明全局类型
declare const Mvu: {
  events: {
    VARIABLE_UPDATE_ENDED: string;
    VARIABLE_INITIALIZED: string;
  };
  getMvuData: (options: { type: 'message'; message_id: number }) => { stat_data: Record<string, any> };
};
declare const eventOn: <T extends string>(event_type: T, listener: (...args: any[]) => void) => { stop: () => void };

// 等待依赖注入的辅助函数
async function waitForDependencies(maxWait = 15000): Promise<void> {
  const checkInterval = 100;
  const startTime = Date.now();

  // 检查关键依赖是否可用
  const getMissingDeps = (): string[] => {
    const missing: string[] = [];
    if (typeof getCurrentMessageId !== 'function') missing.push('getCurrentMessageId');
    if (typeof getChatMessages !== 'function') missing.push('getChatMessages');
    if (typeof eventOn !== 'function') missing.push('eventOn');
    return missing;
  };

  const checkDeps = (): boolean => getMissingDeps().length === 0;

  // 先快速检查一次
  if (checkDeps()) return;

  // 等待依赖注入
  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    if (checkDeps()) return;
  }

  const missing = getMissingDeps();
  console.warn('[状态栏] 等待依赖注入超时，部分功能可能不可用', {
    missing,
    href: window.location?.href,
    referrer: document.referrer,
    hasFrameElement: !!(window as any).frameElement,
  });
}

async function waitForMvuReady(maxWait = 15000): Promise<boolean> {
  if (typeof Mvu !== 'undefined') return true;

  try {
    const topMvu = (window.top as any)?.Mvu;
    if (typeof topMvu !== 'undefined' && typeof initializeGlobal === 'function') {
      initializeGlobal('Mvu', topMvu);
    }
  } catch {
    // ignore
  }

  if (typeof waitGlobalInitialized === 'function') {
    try {
      await Promise.race([
        waitGlobalInitialized('Mvu'),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), maxWait);
        }),
      ]);
    } catch {
      // ignore
    }
  } else {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (typeof Mvu !== 'undefined') return true;
    }
  }

  return typeof Mvu !== 'undefined';
}

function createHostFrameHeightSync(options?: { minHeightPx?: number }) {
  const minHeightPx = options?.minHeightPx ?? 320;
  const frameEl = window.frameElement as HTMLIFrameElement | null;
  if (!frameEl) return () => {};

  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  if (!inIframe) return () => {};

  const chatSelectors = [
    '#chat',
    '#chat-wrapper',
    '#chat-container',
    '.chat',
    '.chat-wrapper',
    '.chat-content',
  ] as const;

  const findParentChatElement = (): HTMLElement | null => {
    try {
      const parentDoc = window.parent?.document;
      if (!parentDoc) return null;
      for (const sel of chatSelectors) {
        const el = parentDoc.querySelector(sel) as HTMLElement | null;
        if (el && el.clientHeight > 0) return el;
      }
      return null;
    } catch {
      return null;
    }
  };

  const getChatHeight = () => {
    const chatEl = findParentChatElement();
    if (chatEl) return chatEl.clientHeight;

    try {
      const parentDoc = window.parent?.document;
      return parentDoc?.documentElement?.clientHeight || window.parent.innerHeight || window.innerHeight;
    } catch {
      return window.innerHeight;
    }
  };

  const getContentHeight = () => {
    const app = document.getElementById('app');
    const body = document.body;
    const root = document.documentElement;
    const heights = [
      app?.scrollHeight,
      app?.offsetHeight,
      body?.scrollHeight,
      body?.offsetHeight,
      root?.scrollHeight,
      root?.offsetHeight,
    ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    return heights.length ? Math.max(...heights) : 0;
  };

  let rafId = 0;
  const apply = () => {
    rafId = 0;
    const chatHeight = Math.floor(getChatHeight());
    const contentHeight = Math.floor(getContentHeight());

    // 酒馆可视聊天区存在时，严格贴齐其高度，避免“一屏不够两屏又多”。
    const nextHeight =
      Number.isFinite(chatHeight) && chatHeight > 0
        ? Math.max(minHeightPx, chatHeight)
        : Math.max(minHeightPx, contentHeight);
    const next = `${nextHeight}px`;
    if (frameEl.style.height !== next) {
      frameEl.style.height = next;
      frameEl.style.maxHeight = next;
      frameEl.style.display = 'block';
    }
  };

  const schedule = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(apply);
  };

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule);

  let removeParentResize: (() => void) | null = null;
  try {
    const onParentResize = () => schedule();
    window.parent?.addEventListener?.('resize', onParentResize, { passive: true });
    removeParentResize = () => window.parent?.removeEventListener?.('resize', onParentResize);
  } catch {
    removeParentResize = null;
  }

  let resizeObserver: ResizeObserver | null = null;
  try {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => schedule());
      resizeObserver.observe(document.body);
      const app = document.getElementById('app');
      if (app) resizeObserver.observe(app);
      const chatEl = findParentChatElement();
      if (chatEl) resizeObserver.observe(chatEl);
    }
  } catch {
    resizeObserver = null;
  }

  let stopRenderEnded: (() => void) | null = null;
  try {
    if (typeof eventOn === 'function' && typeof iframe_events !== 'undefined' && typeof getIframeName === 'function') {
      const iframeName = getIframeName();
      const handle = eventOn(iframe_events.MESSAGE_IFRAME_RENDER_ENDED, (name: string) => {
        if (!name || name === iframeName) schedule();
      });
      stopRenderEnded = () => handle.stop();
    }
  } catch {
    stopRenderEnded = null;
  }

  schedule();
  for (const ms of [30, 90, 180, 360, 720, 1200]) {
    window.setTimeout(schedule, ms);
  }

  return () => {
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    if (removeParentResize) removeParentResize();
    if (resizeObserver) resizeObserver.disconnect();
    if (stopRenderEnded) stopRenderEnded();
    if (rafId) window.cancelAnimationFrame(rafId);
  };
}

let stopHostFrameHeightSync: (() => void) | null = null;
const ENABLE_LEGACY_HOST_FRAME_HEIGHT_SYNC = false;

$(async () => {
  // 等待所有依赖注入完成
  await waitForDependencies();

  // 再等待 MVU 框架初始化完成（单独等待，避免把 Mvu 误判为“前置注入失败”）
  const mvuReady = await waitForMvuReady();
  if (!mvuReady) {
    console.warn('[状态栏] 未检测到 Mvu 全局对象，请确认脚本库中的 MVU 脚本已启用', {
      missing: ['Mvu'],
      href: window.location?.href,
      referrer: document.referrer,
      hasFrameElement: !!(window as any).frameElement,
    });
  }

  const scrollToTopOnce = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;

      const run = () => {
        try {
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        } catch {
          // ignore
        }
      };

      // 多次尝试：覆盖浏览器/iframe恢复滚动、以及首帧布局抖动
      run();
      requestAnimationFrame(run);
      setTimeout(run, 150);
    };
  })();

  // 挂载 Vue 应用
  const app = createApp(App);
  app.use(createPinia());
  app.mount('#app');

  // 对齐楼层 iframe 高度，避免异步加载时被初始占位高度卡住。
  if (ENABLE_LEGACY_HOST_FRAME_HEIGHT_SYNC) {
    stopHostFrameHeightSync = createHostFrameHeightSync({ minHeightPx: 320 });
  }

  // 进入楼层 iframe 时，总是从顶部开始，避免出现“加载后停在最后一行”
  scrollToTopOnce();

  // BFCache/页面恢复时也强制回到顶部
  window.addEventListener(
    'pageshow',
    () => {
      scrollToTopOnce();
    },
    { once: true },
  );
});

// 卸载时清理资源
$(window).on('pagehide', () => {
  if (stopHostFrameHeightSync) {
    stopHostFrameHeightSync();
    stopHostFrameHeightSync = null;
  }
  eventClearAll();
});

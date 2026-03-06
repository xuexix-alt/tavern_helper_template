import App from './App.vue';
import './global.css';

// Declare globals injected by Tavern Helper runtime.
declare const Mvu: {
  events: {
    VARIABLE_UPDATE_ENDED: string;
    VARIABLE_INITIALIZED: string;
  };
  getMvuData: (options: { type: 'message'; message_id: number }) => { stat_data: Record<string, any> };
};
declare const eventOn: <T extends string>(event_type: T, listener: (...args: any[]) => void) => { stop: () => void };

// Wait until injected helpers are available in this iframe context.
async function waitForDependencies(maxWait = 15000): Promise<void> {
  const checkInterval = 100;
  const startTime = Date.now();

  // Collect missing dependencies for diagnostics.
  const getMissingDeps = (): string[] => {
    const missing: string[] = [];
    if (typeof getCurrentMessageId !== 'function') missing.push('getCurrentMessageId');
    if (typeof getChatMessages !== 'function') missing.push('getChatMessages');
    if (typeof eventOn !== 'function') missing.push('eventOn');
    return missing;
  };

  const checkDeps = (): boolean => getMissingDeps().length === 0;

  // Fast path: dependencies are already present.
  if (checkDeps()) return;

  // Wait for dependency injection from host runtime.
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

function createHostFrameHeightSync(options?: { minHeightPx?: number; maxHeightPx?: number }) {
  const minHeightPx = options?.minHeightPx ?? 360;
  const maxHeightPx = options?.maxHeightPx ?? 4096;
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

  const viewHeight = () => {
    const vv = window.visualViewport;
    if (vv?.height && Number.isFinite(vv.height) && vv.height > 0) return vv.height;
    return window.innerHeight || document.documentElement.clientHeight || minHeightPx;
  };

  const viewWidth = () => {
    const vv = window.visualViewport;
    if (vv?.width && Number.isFinite(vv.width) && vv.width > 0) return vv.width;
    return window.innerWidth || document.documentElement.clientWidth || 0;
  };

  const isMobileTouchViewport = (viewportWidth: number) => {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return false;
    if (viewportWidth > 920) return false;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const hasTouch = (navigator?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
    return coarsePointer || hasTouch;
  };

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
    const shellRoot = document.getElementById('eden-shell');
    const pageScrollNodes = Array.from(document.querySelectorAll<HTMLElement>('.eden-page-scroll'));
    const storyPaneNodes = Array.from(document.querySelectorAll<HTMLElement>('.story-pane'));
    const roleGenerateModal = document.querySelector<HTMLElement>('.role-generate-modal');
    const roleModal = document.querySelector<HTMLElement>('.role-modal');
    const measureNodeHeight = (node: HTMLElement) => {
      const rectHeight = node.getBoundingClientRect().height;
      const clientHeight = node.clientHeight;
      const scrollHeight = node.scrollHeight;
      const style = window.getComputedStyle(node);
      const hasInnerScroll = style.overflowY === 'auto' || style.overflowY === 'scroll';
      // Scrollable containers should use visible height; using scrollHeight would
      // incorrectly expand outer iframe and create large blank space in chat.
      if (hasInnerScroll) {
        return Math.max(clientHeight, rectHeight);
      }
      return Math.max(scrollHeight, clientHeight, rectHeight);
    };
    const measuredPageHeights = pageScrollNodes.map(measureNodeHeight);
    const measuredStoryPaneHeights = storyPaneNodes.map(measureNodeHeight);
    const shellHeight = shellRoot ? Math.max(shellRoot.getBoundingClientRect().height, shellRoot.clientHeight) : 0;
    const heights = [
      shellHeight,
      ...measuredPageHeights,
      ...measuredStoryPaneHeights,
      roleGenerateModal
        ? Math.max(roleGenerateModal.scrollHeight, roleGenerateModal.getBoundingClientRect().height) + 36
        : 0,
      roleModal ? Math.max(roleModal.scrollHeight, roleModal.getBoundingClientRect().height) + 24 : 0,
    ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    return heights.length ? Math.ceil(Math.max(...heights) + 8) : 0;
  };

  let rafId = 0;
  const apply = () => {
    rafId = 0;
    const chatHeight = Math.floor(getChatHeight());
    const viewportHeight = Math.floor(viewHeight());
    const viewportWidth = Math.floor(viewWidth());
    const contentHeight = Math.floor(getContentHeight());
    const hasStoryPane = !!document.querySelector('.story-pane');
    const baseline = Math.max(chatHeight, viewportHeight);

    const commitHeight = (nextHeight: number, stableMinHeight: number) => {
      const next = `${nextHeight}px`;
      const nextMin = `${stableMinHeight}px`;
      const nextMax = `${maxHeightPx}px`;
      if (frameEl.style.minHeight !== nextMin) frameEl.style.minHeight = nextMin;
      if (frameEl.style.maxHeight !== nextMax) frameEl.style.maxHeight = nextMax;
      if (frameEl.style.height !== next) {
        frameEl.style.height = next;
        frameEl.style.display = 'block';
      }
    };

    if (isMobileTouchViewport(viewportWidth)) {
      const candidates = [chatHeight, viewportHeight].filter(v => Number.isFinite(v) && v > 0);
      const oneScreenHeight = candidates.length > 0 ? Math.min(...candidates) : Math.max(chatHeight, viewportHeight, 0);
      const keyboardLikelyOpen = Number(window.innerHeight || 0) - viewportHeight >= 90;
      const mobileMinHeight = keyboardLikelyOpen ? Math.min(minHeightPx, 240) : Math.min(minHeightPx, hasStoryPane ? 320 : 280);
      const nextHeight = Math.min(maxHeightPx, Math.max(mobileMinHeight, oneScreenHeight));
      commitHeight(nextHeight, mobileMinHeight);
      return;
    }

    let stableMinHeight = minHeightPx;
    if (hasStoryPane) stableMinHeight = Math.max(stableMinHeight, 360);
    if (baseline > 0) stableMinHeight = Math.max(stableMinHeight, Math.floor(baseline * 0.36));
    stableMinHeight = Math.min(stableMinHeight, 720);

    // Content-driven iframe height: avoid pinning to full host chat height.
    let nextHeight = Math.max(stableMinHeight, contentHeight);
    nextHeight = Math.min(maxHeightPx, nextHeight);
    commitHeight(nextHeight, stableMinHeight);
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

  let mutationObserver: MutationObserver | null = null;
  try {
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => schedule());
      mutationObserver.observe(document.getElementById('app') ?? document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    }
  } catch {
    mutationObserver = null;
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
    if (mutationObserver) mutationObserver.disconnect();
    if (stopRenderEnded) stopRenderEnded();
    if (rafId) window.cancelAnimationFrame(rafId);
  };
}

let stopHostFrameHeightSync: (() => void) | null = null;
const ENABLE_LEGACY_HOST_FRAME_HEIGHT_SYNC = true;

$(async () => {
  // Wait for all injected helpers to become available.
  await waitForDependencies();

  // Wait for MVU initialization; this is independent from helper injection timing.
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

      // Retry several times to defeat BFCache/initial layout jitter.
      run();
      requestAnimationFrame(run);
      setTimeout(run, 150);
    };
  })();

  // Mount Vue app
  const app = createApp(App);
  app.use(createPinia());
  app.mount('#app');

  // Keep iframe height in sync with content + host chat area.
  if (ENABLE_LEGACY_HOST_FRAME_HEIGHT_SYNC) {
    stopHostFrameHeightSync = createHostFrameHeightSync({ minHeightPx: 360, maxHeightPx: 4096 });
  }

  // Always start from the top when entering this iframe.
  scrollToTopOnce();

  // Restore-top on BFCache resume as well.
  window.addEventListener(
    'pageshow',
    () => {
      scrollToTopOnce();
    },
    { once: true },
  );
});

// Cleanup on unload
$(window).on('pagehide', () => {
  if (stopHostFrameHeightSync) {
    stopHostFrameHeightSync();
    stopHostFrameHeightSync = null;
  }
  eventClearAll();
});

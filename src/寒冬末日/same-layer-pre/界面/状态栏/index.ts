// 接手前请先读：src/流式最小Demo/项目说明-背景业务链与Token约定.md
import '../../../界面/shared/theme-tokens.css';
import '../../../界面同层版/界面/状态栏/theme-tokens.css';
import App from './App.vue';
import './global.css';
import { requestPluginImage } from './pluginImageClient';

declare global {
  interface Window {
    EdenSameLayerPre?: {
      requestPluginImage: typeof requestPluginImage;
    };
  }
}

window.EdenSameLayerPre = {
  requestPluginImage,
};

// Wait until injected helpers are available in this iframe context.
async function waitForDependencies(maxWait = 15000): Promise<void> {
  const checkInterval = 100;
  const startTime = Date.now();

  const getMissingDeps = (): string[] => {
    const missing: string[] = [];
    if (typeof getCurrentMessageId !== 'function') missing.push('getCurrentMessageId');
    if (typeof getChatMessages !== 'function') missing.push('getChatMessages');
    if (typeof eventOn !== 'function') missing.push('eventOn');
    return missing;
  };

  const checkDeps = (): boolean => getMissingDeps().length === 0;
  if (checkDeps()) return;

  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    if (checkDeps()) return;
  }

  const missing = getMissingDeps();
  console.warn('[状态栏同层版] 等待依赖注入超时，部分功能可能不可用', {
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
          setTimeout(() => reject(new Error('Mvu init timeout')), maxWait);
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

  const available = typeof Mvu !== 'undefined';
  if (!available) {
    console.warn('[状态栏同层版] Mvu 全局未就绪，部分功能可能不可用', {
      windowTopMvu: typeof (window.top as any)?.Mvu,
      waitGlobalInitializedType: typeof waitGlobalInitialized,
    });
  }
  return available;
}

$(() => {
  (async () => {
    await waitForMvuReady();
    await waitForDependencies();
    const app = createApp(App);
    app.use(createPinia());
    app.mount('#app');
    $(window).on('pagehide', () => {
      app.unmount();
    });
  })();
});

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
    if (typeof Mvu === 'undefined') missing.push('Mvu');
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

$(async () => {
  // 等待所有依赖注入完成
  await waitForDependencies();

  // 再等待 MVU 框架初始化完成
  if (typeof waitGlobalInitialized === 'function') {
    await waitGlobalInitialized('Mvu');
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
  eventClearAll();
});

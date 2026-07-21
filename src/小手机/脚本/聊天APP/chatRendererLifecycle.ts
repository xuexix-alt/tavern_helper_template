import type * as VueRuntime from 'vue';

export function mountChatRenderer(options: {
  container: Element;
  vue: typeof VueRuntime;
  component: object;
}): () => void {
  const app = options.vue.createApp(options.component);
  try {
    app.mount(options.container);
  } catch (error) {
    try {
      app.unmount();
    } catch {
      // Preserve the mount failure as the primary error.
    }
    throw error;
  }

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    app.unmount();
  };
}

export function waitForPhoneSystem<T, TTimer>(options: {
  read(): T | null | undefined;
  schedule(run: () => void): TTimer;
  cancel(timer: TTimer): void;
  onReady(value: T): void;
}): () => void {
  let disposed = false;
  let timer: TTimer | null = null;
  const tick = () => {
    if (disposed) return;
    const value = options.read();
    if (value) {
      timer = null;
      disposed = true;
      options.onReady(value);
      return;
    }
    timer = options.schedule(tick);
  };
  tick();

  return () => {
    if (disposed) return;
    disposed = true;
    if (timer !== null) options.cancel(timer);
    timer = null;
  };
}

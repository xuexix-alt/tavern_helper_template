export interface PhoneRendererContext {
  container: HTMLElement;
  vue: typeof import('vue');
}

export type PhoneAppCleanup = () => void;

export type PhoneAppRenderer = (context: PhoneRendererContext) => PhoneAppCleanup | void;

export interface PhoneAppControllerDeps {
  vue: typeof import('vue');
  scheduleMount(callback: () => void): void;
  getContainer(appId: string): HTMLElement | null;
  ensurePhoneVisible(): void;
  isRegisteredApp(appId: string): boolean;
  setCurrentApp(appId: string | null): void;
  showPlaceholder(container: HTMLElement, message: string): void;
  showError(container: HTMLElement, error: unknown): void;
  logError(error: unknown): void;
}

export interface PhoneAppController {
  registerRenderer(appId: string, renderer: PhoneAppRenderer): void;
  unregisterRenderer(appId: string): void;
  openApp(appId: string): boolean;
  goHome(): void;
  refreshCurrent(): void;
  destroy(): void;
  getCurrentAppId(): string | null;
}

export function createPhoneAppController(deps: PhoneAppControllerDeps): PhoneAppController {
  const renderers = new Map<string, PhoneAppRenderer>();
  let currentAppId: string | null = null;
  let activeRenderer: PhoneAppRenderer | null = null;
  let activeCleanup: PhoneAppCleanup | null = null;
  let mountGeneration = 0;
  let destroyed = false;

  function scheduleCurrentMount(): void {
    if (destroyed || currentAppId === null) return;

    const appId = currentAppId;
    const renderer = renderers.get(appId);
    const generation = ++mountGeneration;

    deps.scheduleMount(() => {
      if (destroyed || generation !== mountGeneration || currentAppId !== appId) return;

      const container = deps.getContainer(appId);
      if (!container || !container.isConnected) return;

      if (!renderer || renderers.get(appId) !== renderer) {
        deps.showPlaceholder(container, 'APP 尚未就绪');
        return;
      }

      try {
        const cleanup = renderer({ container, vue: deps.vue });
        activeRenderer = renderer;
        activeCleanup = cleanup ?? null;
      } catch (error) {
        activeRenderer = null;
        activeCleanup = null;
        deps.showError(container, error);
        deps.logError(error);
      }
    });
  }

  return {
    registerRenderer(appId, renderer) {
      if (destroyed) return;
      renderers.set(appId, renderer);
      if (currentAppId === appId) scheduleCurrentMount();
    },

    unregisterRenderer(appId) {
      renderers.delete(appId);
    },

    openApp(appId) {
      if (destroyed || !deps.isRegisteredApp(appId)) return false;

      deps.ensurePhoneVisible();
      const renderer = renderers.get(appId);
      if (currentAppId === appId && renderer !== undefined && activeRenderer === renderer) return true;

      currentAppId = appId;
      activeRenderer = null;
      activeCleanup = null;
      deps.setCurrentApp(appId);
      scheduleCurrentMount();
      return true;
    },

    goHome() {
      currentAppId = null;
      activeRenderer = null;
      activeCleanup = null;
      mountGeneration += 1;
      deps.setCurrentApp(null);
    },

    refreshCurrent() {
      if (currentAppId !== null) scheduleCurrentMount();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      mountGeneration += 1;
      currentAppId = null;
      activeRenderer = null;
      activeCleanup = null;
      renderers.clear();
      deps.setCurrentApp(null);
    },

    getCurrentAppId() {
      return currentAppId;
    },
  };
}

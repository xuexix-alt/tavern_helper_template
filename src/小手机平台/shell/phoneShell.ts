import type { PhoneAppDefinition, PhoneAppRenderContext, PhoneRoute } from '../apps/phoneApps';

export interface PhoneShellOptions {
  apps: readonly PhoneAppDefinition[];
  document?: Document;
  styles: string;
  returnFocus?: HTMLElement | null;
  initialRoute?: PhoneRoute;
  theme?: 'system' | 'light' | 'dark';
}

export interface PhoneShellApi {
  open(route?: PhoneRoute, returnFocus?: HTMLElement | null): Promise<void>;
  close(): void;
  toggle(returnFocus?: HTMLElement | null): Promise<void>;
  back(): void;
  getRoute(): PhoneRoute;
  isOpen(): boolean;
  setTheme(theme: 'system' | 'light' | 'dark'): void;
  dispose(): void;
}

export class PhoneRouteHistory {
  private readonly routes: PhoneRoute[];

  constructor(initialRoute: PhoneRoute = 'home') {
    this.routes = [initialRoute];
  }

  current(): PhoneRoute {
    return this.routes[this.routes.length - 1] ?? 'home';
  }

  push(route: PhoneRoute): void {
    if (route !== this.current()) this.routes.push(route);
  }

  back(): PhoneRoute {
    if (this.routes.length > 1) this.routes.pop();
    else this.routes[0] = 'home';
    return this.current();
  }
}

function text<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, value: string) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function resolveTopDocument(): Document {
  try {
    if (window.top?.document) return window.top.document;
  } catch {
    throw new Error('PhoneShell 无法访问 top document');
  }
  throw new Error('PhoneShell 需要可访问的 top document');
}

export class PhoneShell implements PhoneShellApi {
  private readonly document: Document;
  private readonly root: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly backButton: HTMLButtonElement;
  private readonly content: HTMLElement;
  private readonly liveRegion: HTMLElement;
  private readonly apps: ReadonlyMap<PhoneRoute, PhoneAppDefinition>;
  private readonly disposers: Array<() => void> = [];
  private viewDisposers: Array<() => void> = [];
  private readonly routes: PhoneRouteHistory;
  private opened = false;
  private disposed = false;
  private returnFocus: HTMLElement | null;
  private renderVersion = 0;

  constructor(options: PhoneShellOptions) {
    this.document = options.document ?? resolveTopDocument();
    if (this.document.querySelector('[data-tavern-phone-root]')) {
      throw new Error('PhoneShell root already exists in top document');
    }
    this.apps = new Map(options.apps.map(app => [app.route, app]));
    this.routes = new PhoneRouteHistory(options.initialRoute);
    this.returnFocus = options.returnFocus ?? null;

    this.root = this.document.createElement('div');
    this.root.dataset.tavernPhoneRoot = '';
    this.root.hidden = true;
    this.setTheme(options.theme ?? 'system');
    this.shadow = this.root.attachShadow({ mode: 'open' });

    const style = this.document.createElement('style');
    style.textContent = options.styles;
    const overlay = this.document.createElement('div');
    overlay.className = 'phone-overlay';
    overlay.setAttribute('role', 'presentation');
    this.panel = this.document.createElement('section');
    this.panel.className = 'phone-shell';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', '小手机');
    this.panel.tabIndex = -1;

    const status = this.document.createElement('div');
    status.className = 'phone-status';
    status.append(text(this.document, 'span', '星穹通信'), text(this.document, 'span', '已加密'));
    const navigation = this.document.createElement('header');
    navigation.className = 'phone-navigation';
    this.backButton = text(this.document, 'button', '返回');
    this.backButton.className = 'phone-navigation__button';
    this.backButton.type = 'button';
    this.title = text(this.document, 'h1', '小手机');
    const closeButton = text(this.document, 'button', '关闭');
    closeButton.className = 'phone-navigation__button phone-navigation__button--close';
    closeButton.type = 'button';
    navigation.append(this.backButton, this.title, closeButton);
    this.content = this.document.createElement('main');
    this.content.className = 'phone-content';
    this.liveRegion = this.document.createElement('p');
    this.liveRegion.className = 'phone-live';
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.panel.append(status, navigation, this.content, this.liveRegion);
    overlay.append(this.panel);
    this.shadow.append(style, overlay);
    this.document.body.append(this.root);

    this.listen(this.backButton, 'click', () => this.back());
    this.listen(closeButton, 'click', () => this.close());
    this.listen(overlay, 'click', event => {
      if (event.target === overlay) this.close();
    });
    this.listen(this.document, 'keydown', event => {
      if ('key' in event && event.key === 'Escape' && this.opened) {
        event.preventDefault();
        this.close();
      }
    });
  }

  async open(route?: PhoneRoute, returnFocus?: HTMLElement | null): Promise<void> {
    this.assertActive();
    if (returnFocus !== undefined) this.returnFocus = returnFocus;
    if (route !== undefined) this.routes.push(route);
    this.opened = true;
    this.root.hidden = false;
    await this.render();
    this.panel.focus();
  }

  close(): void {
    if (this.disposed || !this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    if (this.returnFocus && this.returnFocus.isConnected !== false) this.returnFocus.focus();
  }

  async toggle(returnFocus?: HTMLElement | null): Promise<void> {
    if (this.opened) this.close();
    else await this.open(undefined, returnFocus);
  }

  back(): void {
    this.assertActive();
    this.routes.back();
    void this.render();
  }

  getRoute(): PhoneRoute {
    return this.routes.current();
  }

  isOpen(): boolean {
    return this.opened;
  }

  setTheme(theme: 'system' | 'light' | 'dark'): void {
    this.assertActive();
    if (theme === 'system') delete this.root.dataset.theme;
    else this.root.dataset.theme = theme;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.opened = false;
    this.renderVersion += 1;
    this.disposeView();
    for (const dispose of this.disposers.splice(0).reverse()) dispose();
    this.root.remove();
  }

  private listen(target: EventTarget, event: string, listener: EventListener): void {
    target.addEventListener(event, listener);
    this.disposers.push(() => target.removeEventListener(event, listener));
  }

  private listenInView(target: EventTarget, event: string, listener: EventListener): void {
    target.addEventListener(event, listener);
    this.viewDisposers.push(() => target.removeEventListener(event, listener));
  }

  private disposeView(): void {
    for (const dispose of this.viewDisposers.splice(0).reverse()) dispose();
  }

  private async render(): Promise<void> {
    const renderVersion = ++this.renderVersion;
    this.disposeView();
    this.content.replaceChildren();
    const route = this.getRoute();
    this.backButton.hidden = route === 'home';

    if (route === 'home') {
      this.title.textContent = '小手机';
      this.content.append(this.renderHome());
      return;
    }

    const app = this.apps.get(route);
    if (!app) {
      this.renderError(`无法打开页面：${route}`);
      return;
    }
    this.title.textContent = app.title;
    const loading = text(this.document, 'p', '载入中…');
    loading.className = 'phone-empty';
    this.content.append(loading);
    const context: PhoneAppRenderContext = {
      document: this.document,
      listen: (target, event, listener) => this.listenInView(target, event, listener),
      announce: (message, kind = 'info') => {
        this.liveRegion.dataset.kind = kind;
        this.liveRegion.textContent = message;
      },
    };
    try {
      const page = await app.render(context);
      if (this.disposed || renderVersion !== this.renderVersion) return;
      this.content.replaceChildren(page);
    } catch (error) {
      if (this.disposed || renderVersion !== this.renderVersion) return;
      this.renderError(error instanceof Error ? error.message : String(error));
    }
  }

  private renderHome(): HTMLElement {
    const desktop = this.document.createElement('div');
    desktop.className = 'phone-desktop';
    for (const app of this.apps.values()) {
      const button = this.document.createElement('button');
      button.className = 'phone-app';
      button.type = 'button';
      const glyph = text(this.document, 'span', app.glyph);
      glyph.className = `phone-app__glyph phone-app__glyph--${app.route}`;
      const label = text(this.document, 'span', app.title);
      button.append(glyph, label);
      this.listenInView(button, 'click', () => {
        this.routes.push(app.route);
        void this.render();
      });
      desktop.append(button);
    }
    return desktop;
  }

  private renderError(message: string): void {
    this.content.replaceChildren();
    const error = text(this.document, 'section', '');
    error.className = 'phone-error';
    error.append(text(this.document, 'strong', '此页暂时不可用'), text(this.document, 'p', message));
    this.content.append(error);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('PhoneShell has been disposed');
  }
}

export function createPhoneShell(options: PhoneShellOptions): PhoneShellApi {
  return new PhoneShell(options);
}

import type { PhoneAppDefinition, PhoneAppRenderContext, PhoneRoute } from '../apps/phoneApps';

export interface PhoneShellOptions {
  apps: readonly PhoneAppDefinition[];
  document?: Document;
  styles: string;
  returnFocus?: HTMLElement | null;
  initialRoute?: PhoneRoute;
  theme?: 'system' | 'light' | 'dark';
  productName?: string;
  statusName?: string;
  onRequestClose?: () => void;
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

export class PhoneOpenFocusGuard {
  private version = 0;

  begin(): number {
    this.version += 1;
    return this.version;
  }

  invalidate(): void {
    this.version += 1;
  }

  isCurrent(token: number): boolean {
    return token === this.version;
  }
}

export class PhoneViewScope {
  private active = true;
  private readonly disposers: Array<() => void> = [];

  isActive(): boolean {
    return this.active;
  }

  listen(target: EventTarget, event: string, listener: EventListener): void {
    if (!this.active) return;
    target.addEventListener(event, listener);
    this.disposers.push(() => target.removeEventListener(event, listener));
  }

  onDispose(disposer: () => void): void {
    if (!this.active) {
      disposer();
      return;
    }
    this.disposers.push(disposer);
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    for (const dispose of this.disposers.splice(0).reverse()) dispose();
  }
}

export function getFocusTrapTarget<T>(focusable: readonly T[], current: T | null, backwards: boolean): T | null {
  if (focusable.length === 0) return null;
  if (backwards && current === focusable[0]) return focusable[focusable.length - 1] ?? null;
  if (!backwards && current === focusable[focusable.length - 1]) return focusable[0] ?? null;
  if (!focusable.includes(current as T))
    return backwards ? (focusable[focusable.length - 1] ?? null) : (focusable[0] ?? null);
  return null;
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

export function createPhoneAppIcon(
  document: Document,
  app: Pick<PhoneAppDefinition, 'route' | 'glyph' | 'iconSrc'>,
): HTMLElement {
  const icon = text(document, 'span', app.iconSrc ? '' : app.glyph);
  icon.className = `phone-app__glyph phone-app__glyph--${app.route}${app.iconSrc ? ' phone-app__glyph--icon' : ''}`;
  if (app.iconSrc) {
    const image = document.createElement('img');
    image.className = 'phone-app__icon';
    image.src = app.iconSrc;
    image.setAttribute('alt', '');
    image.setAttribute('aria-hidden', 'true');
    icon.append(image);
  }
  return icon;
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
  private viewScope: PhoneViewScope | null = null;
  private readonly routes: PhoneRouteHistory;
  private readonly openFocus = new PhoneOpenFocusGuard();
  private opened = false;
  private disposed = false;
  private returnFocus: HTMLElement | null;
  private readonly onRequestClose?: () => void;
  private readonly productName: string;
  private renderVersion = 0;

  constructor(options: PhoneShellOptions) {
    this.document = options.document ?? resolveTopDocument();
    if (this.document.querySelector('[data-tavern-phone-root]')) {
      throw new Error('PhoneShell root already exists in top document');
    }
    this.apps = new Map(options.apps.map(app => [app.route, app]));
    this.routes = new PhoneRouteHistory(options.initialRoute);
    this.returnFocus = options.returnFocus ?? null;
    this.onRequestClose = options.onRequestClose;
    this.productName = options.productName ?? '小手机';
    const statusName = options.statusName ?? '星穹通信';

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
    this.panel.setAttribute('aria-label', this.productName);
    this.panel.tabIndex = -1;

    const status = this.document.createElement('div');
    status.className = 'phone-status';
    status.append(text(this.document, 'span', statusName), text(this.document, 'span', '已加密'));
    const navigation = this.document.createElement('header');
    navigation.className = 'phone-navigation';
    this.backButton = text(this.document, 'button', '返回');
    this.backButton.className = 'phone-navigation__button';
    this.backButton.type = 'button';
    this.title = text(this.document, 'h1', this.productName);
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
    this.listen(closeButton, 'click', () => this.requestClose());
    this.listen(overlay, 'click', event => {
      if (event.target === overlay) this.requestClose();
    });
    this.listen(this.document, 'keydown', event => {
      if (!('key' in event) || !this.opened) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.requestClose();
      } else if (event.key === 'Tab') {
        this.trapFocus(event as KeyboardEvent);
      }
    });
  }

  async open(route?: PhoneRoute, returnFocus?: HTMLElement | null): Promise<void> {
    this.assertActive();
    if (returnFocus !== undefined) this.returnFocus = returnFocus;
    if (route !== undefined) this.routes.push(route);
    const focusToken = this.openFocus.begin();
    this.opened = true;
    this.root.hidden = false;
    this.panel.focus();
    await this.render();
    if (this.opened && !this.disposed && this.openFocus.isCurrent(focusToken)) this.panel.focus();
  }

  close(): void {
    if (this.disposed || !this.opened) return;
    this.opened = false;
    this.openFocus.invalidate();
    this.root.hidden = true;
    if (this.returnFocus && this.returnFocus.isConnected !== false) this.returnFocus.focus();
  }

  private requestClose(): void {
    if (this.onRequestClose) {
      this.onRequestClose?.();
      return;
    }
    this.close();
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
    this.openFocus.invalidate();
    this.renderVersion += 1;
    this.disposeView();
    for (const dispose of this.disposers.splice(0).reverse()) dispose();
    this.root.remove();
  }

  private listen(target: EventTarget, event: string, listener: EventListener): void {
    target.addEventListener(event, listener);
    this.disposers.push(() => target.removeEventListener(event, listener));
  }

  private disposeView(): void {
    this.viewScope?.dispose();
    this.viewScope = null;
  }

  private async render(): Promise<void> {
    const renderVersion = ++this.renderVersion;
    this.disposeView();
    const scope = new PhoneViewScope();
    this.viewScope = scope;
    this.content.replaceChildren();
    const route = this.getRoute();
    this.backButton.hidden = route === 'home';

    if (route === 'home') {
      this.title.textContent = this.productName;
      this.content.append(this.renderHome(scope));
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
      listen: (target, event, listener) => scope.listen(target, event, listener),
      announce: (message, kind = 'info') => {
        if (!scope.isActive() || renderVersion !== this.renderVersion) return;
        this.liveRegion.dataset.kind = kind;
        this.liveRegion.textContent = message;
      },
      requestRender: () => {
        if (scope.isActive() && renderVersion === this.renderVersion) void this.render();
      },
      navigate: route => {
        if (!scope.isActive() || renderVersion !== this.renderVersion) return;
        this.routes.push(route);
        void this.render();
      },
      onDispose: disposer => scope.onDispose(disposer),
      isActive: () => scope.isActive() && renderVersion === this.renderVersion && !this.disposed,
    };
    try {
      const page = await app.render(context);
      if (this.disposed || !scope.isActive() || renderVersion !== this.renderVersion) {
        scope.dispose();
        return;
      }
      this.content.replaceChildren(page);
    } catch (error) {
      if (this.disposed || !scope.isActive() || renderVersion !== this.renderVersion) {
        scope.dispose();
        return;
      }
      this.renderError(error instanceof Error ? error.message : String(error));
    }
  }

  private renderHome(scope: PhoneViewScope): HTMLElement {
    const desktop = this.document.createElement('div');
    desktop.className = 'phone-desktop';
    for (const app of this.apps.values()) {
      const button = this.document.createElement('button');
      button.className = 'phone-app';
      button.type = 'button';
      const glyph = createPhoneAppIcon(this.document, app);
      const label = text(this.document, 'span', app.title);
      button.append(glyph, label);
      scope.listen(button, 'click', () => {
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

  private trapFocus(event: KeyboardEvent): void {
    const focusable = Array.from(
      this.shadow.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]'),
    ).filter(element => !element.hasAttribute('disabled') && !element.hidden && element.tabIndex !== -1);
    const target = getFocusTrapTarget(focusable, this.shadow.activeElement as HTMLElement | null, event.shiftKey);
    if (target) {
      event.preventDefault();
      target.focus();
    } else if (focusable.length === 0) {
      event.preventDefault();
      this.panel.focus();
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('PhoneShell has been disposed');
  }
}

export function createPhoneShell(options: PhoneShellOptions): PhoneShellApi {
  return new PhoneShell(options);
}

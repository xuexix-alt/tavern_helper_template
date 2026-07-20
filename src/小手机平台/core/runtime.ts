import { EventBus } from './eventBus';
import { ModuleRegistry } from './moduleRegistry';
import { getPhoneTopWindow } from './register';
import type {
  PhoneHostAction,
  PhoneHostBridge,
  PhoneModuleContext,
  PhoneModuleRegistration,
  PhoneOwner,
  PhoneRuntimeEventMap,
  PhoneRuntimeStatus,
  PhoneSession,
  TavernPhonePublicApi,
} from './types';

interface AttachedBridge {
  bridge: PhoneHostBridge;
  owner: PhoneOwner;
  sessionKey: string;
  stale: boolean;
}

export function makeSessionKey(owner: PhoneOwner, chatId: string): string {
  return `${owner.characterName}::${chatId}`;
}

export class PhoneRuntime implements TavernPhonePublicApi {
  private readonly events = new EventBus<PhoneRuntimeEventMap>();
  private readonly registry = new ModuleRegistry();
  private owner: PhoneOwner | null = null;
  private session: PhoneSession | null = null;
  private hostBridge: AttachedBridge | null = null;
  private state: PhoneRuntimeStatus['state'] = 'WAITING';
  private isOpen = false;
  private unreadCount = 0;
  private diagnostics: string[] = [];

  registerModule(registration: PhoneModuleRegistration): void {
    this.registry.register(registration);
  }

  setOwner(owner: PhoneOwner | null): void {
    if (!sameOwner(this.owner, owner)) this.invalidateHostBridge();
    this.owner = owner ? { ...owner } : null;
    this.session = null;
    this.state = 'WAITING';
    this.emitStatus();
  }

  setSession(chatId: string | null): void {
    const normalizedChatId = chatId?.trim() ?? '';
    const nextSession =
      this.owner && normalizedChatId
        ? {
            owner: { ...this.owner },
            chatId: normalizedChatId,
            sessionKey: makeSessionKey(this.owner, normalizedChatId),
          }
        : null;
    if (this.session?.sessionKey !== nextSession?.sessionKey) this.invalidateHostBridge();
    this.session = nextSession;
    this.state = nextSession ? 'READY' : 'WAITING';
    this.emitStatus();
    if (nextSession) this.events.emit('ready');
  }

  getOwner(): PhoneOwner | null {
    return this.owner ? { ...this.owner } : null;
  }

  getSession(): PhoneSession | null {
    return this.session ? { ...this.session, owner: { ...this.session.owner } } : null;
  }

  async initializeModules(requiredIds: readonly string[] = []): Promise<void> {
    const context: PhoneModuleContext = {
      runtime: this,
      getOwner: () => this.getOwner(),
      getSession: () => this.getSession(),
    };
    await this.registry.initialize(context, requiredIds);
  }

  async open(): Promise<void> {
    if (!this.session) throw new Error('TavernPhone cannot open without an active owner/session');
    this.isOpen = true;
    this.emitStatus();
  }

  close(): void {
    this.isOpen = false;
    this.emitStatus();
  }

  async toggle(): Promise<void> {
    if (this.isOpen) this.close();
    else await this.open();
  }

  getStatus(): PhoneRuntimeStatus {
    return {
      state: this.state,
      owner: this.getOwner(),
      sessionKey: this.session?.sessionKey ?? null,
      isOpen: this.isOpen,
      diagnostics: [...this.diagnostics],
    };
  }

  getUnreadCount(): number {
    return this.unreadCount;
  }

  on<K extends keyof PhoneRuntimeEventMap>(event: K, listener: (...args: PhoneRuntimeEventMap[K]) => void): () => void {
    return this.events.on(event, listener);
  }

  attachHostBridge(bridge: PhoneHostBridge): () => void {
    if (!this.owner || !this.session) throw new Error('Cannot attach host bridge without an active owner/session');
    const attachment: AttachedBridge = {
      bridge,
      owner: { ...this.owner },
      sessionKey: this.session.sessionKey,
      stale: false,
    };
    this.hostBridge = attachment;

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.hostBridge === attachment) this.hostBridge = null;
    };
  }

  async submitActionToHost(action: PhoneHostAction): Promise<void> {
    if (!action || action.kind !== 'composer.insert') throw new Error('Unsupported phone host action kind');
    if (typeof action.text !== 'string' || !action.text.trim())
      throw new Error('Phone host action text cannot be empty');
    if (action.mode !== 'replace' && action.mode !== 'append') throw new Error('Unsupported phone host action mode');

    const attachment = this.hostBridge;
    if (!attachment) throw new Error('No active host bridge');
    if (
      attachment.stale ||
      !this.owner ||
      !this.session ||
      !sameOwner(attachment.owner, this.owner) ||
      attachment.sessionKey !== this.session.sessionKey
    ) {
      throw new Error('Host bridge owner/session no longer matches the runtime');
    }
    await attachment.bridge.submitAction(action);
  }

  async dispose(reason = 'runtime disposed'): Promise<void> {
    this.hostBridge = null;
    await this.registry.dispose(reason);
    this.events.dispose();
    this.owner = null;
    this.session = null;
    this.isOpen = false;
    this.state = 'DISPOSED';
  }

  private invalidateHostBridge(): void {
    if (this.hostBridge) this.hostBridge.stale = true;
  }

  private emitStatus(): void {
    this.events.emit('status', this.getStatus());
  }
}

function sameOwner(left: PhoneOwner | null, right: PhoneOwner | null): boolean {
  return Boolean(
    left &&
    right &&
    left.characterName === right.characterName &&
    left.adapterId === right.adapterId &&
    left.runtimeMajor === right.runtimeMajor,
  );
}

export function createPhoneRuntime(): PhoneRuntime {
  return new PhoneRuntime();
}

export function installPhoneRuntime(): TavernPhonePublicApi {
  const topWindow = getPhoneTopWindow();
  if (topWindow.TavernPhone) return topWindow.TavernPhone;

  const runtime = createPhoneRuntime();
  topWindow.TavernPhone = runtime;
  const pending = topWindow.__TAVERN_PHONE_PENDING_MODULES__ ?? [];
  pending.forEach(registration => runtime.registerModule(registration));
  topWindow.__TAVERN_PHONE_PENDING_MODULES__ = [];
  return runtime;
}

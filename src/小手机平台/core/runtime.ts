import { EventBus } from './eventBus';
import { ModuleRegistry } from './moduleRegistry';
import { getPhoneTopWindow } from './register';
import { InternalPhoneServiceRegistry } from './serviceRegistry';
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
  private diagnostics: string[] = [];
  private readonly events = new EventBus<PhoneRuntimeEventMap>((error, event) => {
    this.diagnostics.push(`${String(event)}: ${getErrorMessage(error)}`);
  });
  private readonly registry = new ModuleRegistry();
  private readonly services = new InternalPhoneServiceRegistry();
  private owner: PhoneOwner | null = null;
  private session: PhoneSession | null = null;
  private hostBridge: AttachedBridge | null = null;
  private state: PhoneRuntimeStatus['state'] = 'WAITING';
  private isOpen = false;
  private unreadCount = 0;
  private automaticInitializationQueued = false;
  private initializationPromise: Promise<void> | null = null;
  private modulesInitialized = false;

  registerModule(registration: PhoneModuleRegistration): void {
    this.registry.register(registration);
    this.scheduleAutomaticInitialization();
  }

  setOwner(owner: PhoneOwner | null): void {
    if (owner && this.owner) {
      if (!sameOwner(this.owner, owner)) {
        throw new Error(`TavernPhone is already owned by ${this.owner.adapterId}; conflicting owner cannot take over`);
      }
      return;
    }
    if (!owner && !this.owner) return;

    this.invalidateHostBridge();
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
    if (this.modulesInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = this.initializeRegisteredModules(requiredIds, false);
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
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
    if (typeof action.sourceKey !== 'string' || !action.sourceKey.trim())
      throw new Error('Phone host action sourceKey cannot be empty');
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
    try {
      if (this.initializationPromise) await this.initializationPromise.catch(() => undefined);
      await this.registry.dispose(reason);
    } finally {
      this.events.dispose();
      this.owner = null;
      this.session = null;
      this.isOpen = false;
      this.modulesInitialized = false;
      this.state = 'DISPOSED';
    }
  }

  private invalidateHostBridge(): void {
    if (this.hostBridge) this.hostBridge.stale = true;
  }

  private emitStatus(): void {
    this.events.emit('status', this.getStatus());
  }

  private scheduleAutomaticInitialization(): void {
    if (this.modulesInitialized || this.automaticInitializationQueued || this.state === 'DISPOSED') return;
    this.automaticInitializationQueued = true;
    queueMicrotask(() => {
      this.automaticInitializationQueued = false;
      void this.tryAutomaticInitialization();
    });
  }

  private async tryAutomaticInitialization(): Promise<void> {
    if (this.modulesInitialized || this.initializationPromise || this.state === 'DISPOSED') return;
    const roots = this.registry.findByCapability('phone.adapter');
    if (roots.length === 0) return;
    try {
      this.registry.resolveOrder(roots);
    } catch (error) {
      if (/Missing phone module dependency/i.test(getErrorMessage(error))) {
        this.state = 'WAITING';
        this.emitStatus();
        return;
      }
      this.diagnostics.push(`automatic module validation failed: ${getErrorMessage(error)}`);
      this.state = 'ERROR';
      this.emitStatus();
      return;
    }

    this.initializationPromise = this.initializeRegisteredModules(roots, true);
    try {
      await this.initializationPromise;
    } catch {
      // initializeRegisteredModules records a redacted public diagnostic.
    } finally {
      this.initializationPromise = null;
    }
  }

  private async initializeRegisteredModules(requiredIds: readonly string[], automatic: boolean): Promise<void> {
    const context: PhoneModuleContext = {
      runtime: this,
      services: this.services,
      getOwner: () => this.getOwner(),
      getSession: () => this.getSession(),
    };
    this.state = 'RESOLVE';
    this.emitStatus();
    try {
      await this.registry.initialize(context, requiredIds);
      this.modulesInitialized = true;
      this.state = this.session ? 'READY' : 'WAITING';
      this.emitStatus();
    } catch (error) {
      if (automatic) this.diagnostics.push(`automatic module initialization failed: ${getErrorMessage(error)}`);
      this.state = 'ERROR';
      this.emitStatus();
      throw error;
    }
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createPhoneRuntime(): PhoneRuntime {
  return new PhoneRuntime();
}

export function installPhoneRuntime(expectedOwner?: PhoneOwner): TavernPhonePublicApi {
  const topWindow = getPhoneTopWindow();
  if (topWindow.TavernPhone) {
    if (expectedOwner) topWindow.TavernPhone.setOwner(expectedOwner);
    return topWindow.TavernPhone;
  }

  const runtime = createPhoneRuntime();
  if (expectedOwner) runtime.setOwner(expectedOwner);
  const pending = topWindow.__TAVERN_PHONE_PENDING_MODULES__ ?? [];
  pending.forEach(registration => runtime.registerModule(registration));
  topWindow.TavernPhone = runtime;
  topWindow.__TAVERN_PHONE_PENDING_MODULES__ = [];
  return runtime;
}

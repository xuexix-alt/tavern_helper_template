export interface PhoneOwner {
  characterName: string;
  adapterId: string;
  runtimeMajor: number;
}

export interface PhoneSession {
  owner: PhoneOwner;
  chatId: string;
  sessionKey: string;
}

export interface PhoneHostAction {
  kind: 'composer.insert';
  text: string;
  sourceKey: string;
  mode: 'replace' | 'append';
}

export interface PhoneHostBridge {
  id: 'same-layer-pre';
  submitAction(action: PhoneHostAction): Promise<void> | void;
}

export interface PhoneModuleManifest {
  id: string;
  version: string;
  required: boolean;
  dependsOn: string[];
  capabilities: string[];
}

export type PhoneModuleStatus = 'REGISTERED' | 'INITIALIZING' | 'READY' | 'ERROR' | 'DISPOSED';

export interface PhoneModule {
  init(context: PhoneModuleContext): Promise<void> | void;
  dispose(reason: string): Promise<void> | void;
  getStatus(): PhoneModuleStatus;
}

export type PhoneRuntimeState =
  | 'DISCOVER'
  | 'VALIDATE'
  | 'RESOLVE'
  | 'INIT_CORE'
  | 'INIT_ADAPTER'
  | 'INIT_SHELL'
  | 'INIT_APPS'
  | 'WAITING'
  | 'READY'
  | 'DEGRADED'
  | 'ERROR'
  | 'DISPOSED';

export interface PhoneRuntimeStatus {
  state: PhoneRuntimeState;
  owner: PhoneOwner | null;
  sessionKey: string | null;
  isOpen: boolean;
  diagnostics: readonly string[];
}

export interface PhoneRuntimeEventMap {
  ready: [];
  status: [PhoneRuntimeStatus];
  unread: [number];
}

export interface PhoneModuleContext {
  runtime: TavernPhonePublicApi;
  getOwner(): PhoneOwner | null;
  getSession(): PhoneSession | null;
}

export type PhoneModuleFactory = () => PhoneModule;

export interface PhoneModuleRegistration {
  manifest: PhoneModuleManifest;
  factory: PhoneModuleFactory;
}

export interface TavernPhonePublicApi {
  registerModule(registration: PhoneModuleRegistration): void;
  setOwner(owner: PhoneOwner | null): void;
  getOwner(): PhoneOwner | null;
  setSession(chatId: string | null): void;
  getSession(): PhoneSession | null;
  open(): Promise<void>;
  close(): void;
  toggle(): Promise<void>;
  getStatus(): PhoneRuntimeStatus;
  getUnreadCount(): number;
  on<K extends keyof PhoneRuntimeEventMap>(event: K, listener: (...args: PhoneRuntimeEventMap[K]) => void): () => void;
  attachHostBridge(bridge: PhoneHostBridge): () => void;
  submitActionToHost(action: PhoneHostAction): Promise<void>;
}

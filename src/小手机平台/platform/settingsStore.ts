export type SettingsProvider = 'tavern' | 'openai-compatible';
export type SettingsTheme = 'system' | 'light' | 'dark';

export interface PublicSettings {
  readonly provider: SettingsProvider;
  readonly apiUrl: string;
  readonly model: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly theme: SettingsTheme;
  readonly notifications: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SettingsStore {
  getPublic(): PublicSettings;
  updatePublic(patch: Partial<PublicSettings>): PublicSettings;
  subscribe(listener: (settings: PublicSettings) => void): () => void;
  setSecret(apiKey: string): void;
  clearSecret(): void;
  withApiKey<T>(callback: (apiKey: string | undefined) => T): T;
}

export interface SettingsStoreOptions {
  onError?: (error: unknown) => void;
}

function createSafeErrorReporter(onError?: (error: unknown) => void): (error: unknown) => void {
  return error => {
    if (!onError) return;
    try {
      onError(error);
    } catch {
      // Public-setting notifications must remain committed even if diagnostics fail.
    }
  };
}

const DEFAULT_SETTINGS: PublicSettings = Object.freeze({
  provider: 'tavern',
  apiUrl: '',
  model: '',
  parameters: Object.freeze({}),
  theme: 'system',
  notifications: true,
});

function normalizeApiUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('API URL must be a string');
  const normalized = value.trim();
  if (normalized === '') return '';

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Invalid API URL: only absolute http/https URLs are allowed');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid API URL: only http/https protocols are allowed');
  }
  return normalized;
}

function normalizeParameters(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid generation parameters');
  const validate = (candidate: unknown, seen = new Set<object>()): void => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return;
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) throw new Error('Generation parameters contain a non-finite number');
      return;
    }
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) {
      throw new Error('Generation parameters must be finite JSON data');
    }
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      candidate.forEach(item => validate(item, seen));
      return;
    }
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== null && Object.getPrototypeOf(prototype) !== null) {
      throw new Error('Generation parameters must be a plain object');
    }
    for (const [key, nested] of Object.entries(candidate)) {
      if (
        /^(?:api[_-]?key|x[_-]?api[_-]?key|authorization|access[_-]?token|bearer[_-]?token|token|password|secret)$/i.test(
          key,
        )
      ) {
        throw new Error('Generation parameters must not contain credentials');
      }
      validate(nested, seen);
    }
  };
  validate(value);
  const cloned = structuredClone(value) as Record<string, unknown>;
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return;
    Object.values(candidate).forEach(freeze);
    Object.freeze(candidate);
  };
  freeze(cloned);
  return cloned;
}

function normalizePublicSettings(value: unknown): PublicSettings {
  if (!value || typeof value !== 'object') throw new Error('Invalid public settings');
  const input = value as Partial<PublicSettings>;
  if (input.provider !== 'tavern' && input.provider !== 'openai-compatible') {
    throw new Error('Invalid settings provider');
  }
  if (input.theme !== 'system' && input.theme !== 'light' && input.theme !== 'dark') {
    throw new Error('Invalid settings theme');
  }
  if (typeof input.model !== 'string') throw new Error('Invalid settings model');
  if (typeof input.notifications !== 'boolean') throw new Error('Invalid notifications setting');

  return Object.freeze({
    provider: input.provider,
    apiUrl: normalizeApiUrl(input.apiUrl),
    model: input.model,
    parameters: normalizeParameters(input.parameters ?? {}),
    theme: input.theme,
    notifications: input.notifications,
  });
}

function sameSettings(left: PublicSettings, right: PublicSettings): boolean {
  return (
    left.provider === right.provider &&
    left.apiUrl === right.apiUrl &&
    left.model === right.model &&
    JSON.stringify(left.parameters) === JSON.stringify(right.parameters) &&
    left.theme === right.theme &&
    left.notifications === right.notifications
  );
}

export function createSettingsStore(
  characterName: string,
  storage: StorageLike,
  options: SettingsStoreOptions = {},
): SettingsStore {
  const normalizedCharacterName = characterName.trim();
  if (normalizedCharacterName === '') throw new Error('Character name cannot be empty');
  if (!storage) throw new Error('Storage is unavailable');

  const namespace = 'tavern-phone:local';
  const legacyNamespace = `tavern-phone:${encodeURIComponent(normalizedCharacterName)}`;
  const publicKey = `${namespace}:public`;
  const secretKey = `${namespace}:secret`;
  const legacyPublicKey = `${legacyNamespace}:public`;
  const legacySecretKey = `${legacyNamespace}:secret`;
  const listeners = new Set<(settings: PublicSettings) => void>();
  const reportError = createSafeErrorReporter(options.onError);

  let settings: PublicSettings;
  try {
    const serialized = storage.getItem(publicKey) ?? storage.getItem(legacyPublicKey);
    settings = serialized === null ? DEFAULT_SETTINGS : normalizePublicSettings(JSON.parse(serialized));
  } catch {
    settings = DEFAULT_SETTINGS;
  }
  storage.setItem(publicKey, JSON.stringify(settings));
  if (storage.getItem(secretKey) === null) {
    const legacySecret = storage.getItem(legacySecretKey);
    if (legacySecret !== null) storage.setItem(secretKey, legacySecret);
  }

  return {
    getPublic: () => settings,
    updatePublic(patch) {
      const next = normalizePublicSettings({ ...settings, ...patch });
      if (sameSettings(settings, next)) return settings;
      storage.setItem(publicKey, JSON.stringify(next));
      settings = next;
      for (const listener of [...listeners]) {
        try {
          listener(settings);
        } catch (error) {
          reportError(error);
        }
      }
      return settings;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSecret(apiKey) {
      if (typeof apiKey !== 'string') throw new Error('API secret must be a string');
      storage.setItem(secretKey, apiKey);
    },
    clearSecret() {
      storage.removeItem(secretKey);
    },
    withApiKey(callback) {
      const secret = storage.getItem(secretKey) ?? undefined;
      return callback(secret);
    },
  };
}

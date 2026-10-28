const STORAGE_KEY = 'eden.sameLayerPre.streamingEnabled';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(storage?: PreferenceStorage | null): PreferenceStorage | null {
  if (storage) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPreStreamingPreference(storage?: PreferenceStorage | null): boolean {
  try {
    return resolveStorage(storage)?.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writePreStreamingPreference(value: boolean, storage?: PreferenceStorage | null): boolean {
  try {
    resolveStorage(storage)?.setItem(STORAGE_KEY, String(value));
  } catch {
    // Keep the current session usable when storage is unavailable.
  }
  return value;
}

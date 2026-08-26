export const PRE_TRANSCRIPT_DISPLAY_MIN = 6;
export const PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY = 'eden.sameLayerPre.transcriptDisplayCount';

type PreTranscriptStorage = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(storage?: PreTranscriptStorage | null): PreTranscriptStorage | null {
  if (storage) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function normalizePreTranscriptDisplayPreference(value: unknown): number {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric >= PRE_TRANSCRIPT_DISPLAY_MIN ? numeric : PRE_TRANSCRIPT_DISPLAY_MIN;
}

export function resolvePreTranscriptDisplayCount(preference: unknown, totalReadableCount: unknown): number {
  const total = Math.max(0, Math.trunc(Number(totalReadableCount) || 0));
  return total === 0 ? 0 : Math.min(normalizePreTranscriptDisplayPreference(preference), total);
}

export function readPreTranscriptDisplayPreference(storage?: PreTranscriptStorage | null): number {
  try {
    return normalizePreTranscriptDisplayPreference(
      resolveStorage(storage)?.getItem(PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY),
    );
  } catch {
    return PRE_TRANSCRIPT_DISPLAY_MIN;
  }
}

export function writePreTranscriptDisplayPreference(value: unknown, storage?: PreTranscriptStorage | null): number {
  const normalized = normalizePreTranscriptDisplayPreference(value);
  try {
    resolveStorage(storage)?.setItem(PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY, String(normalized));
  } catch {
    // Restricted iframe storage must not break the PRE reader.
  }
  return normalized;
}

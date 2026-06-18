export type TranscriptImageHydrationMode = 'compat' | 'host-rendered-only';

export const TRANSCRIPT_IMAGE_HYDRATION_MODE_STORAGE_KEY = 'eden.transcriptImageHydrationMode';

export function normalizeTranscriptImageHydrationMode(value: unknown): TranscriptImageHydrationMode {
  return value === 'compat' ? 'compat' : 'host-rendered-only';
}

export function resolveTranscriptImageHydrationMode(): TranscriptImageHydrationMode {
  if (typeof window === 'undefined') return 'host-rendered-only';
  try {
    return normalizeTranscriptImageHydrationMode(window.localStorage.getItem('eden.transcriptImageHydrationMode'));
  } catch {
    return 'host-rendered-only';
  }
}

export function persistTranscriptImageHydrationMode(mode: TranscriptImageHydrationMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(TRANSCRIPT_IMAGE_HYDRATION_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage can be unavailable in restricted iframe contexts.
  }
}

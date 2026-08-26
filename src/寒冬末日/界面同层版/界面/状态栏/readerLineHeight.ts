import type { TranscriptDensity } from './types';

export const READER_BODY_LINE_HEIGHT_MIN = 1.3;
export const READER_BODY_LINE_HEIGHT_MAX = 2.1;
export const READER_BODY_LINE_HEIGHT_STEP = 0.05;

const READER_BODY_LINE_HEIGHT_DEFAULTS: Record<TranscriptDensity, number> = {
  comfortable: 1.9,
  minimal: 1.7,
};

export function normalizeReaderBodyLineHeight(input: unknown): number | null {
  if (input == null || (typeof input === 'string' && input.trim() === '')) return null;

  const numeric = Number(input);
  if (!Number.isFinite(numeric)) return null;

  const clamped = Math.min(READER_BODY_LINE_HEIGHT_MAX, Math.max(READER_BODY_LINE_HEIGHT_MIN, numeric));
  const stepped =
    READER_BODY_LINE_HEIGHT_MIN +
    Math.round((clamped - READER_BODY_LINE_HEIGHT_MIN) / READER_BODY_LINE_HEIGHT_STEP) * READER_BODY_LINE_HEIGHT_STEP;
  return Number(stepped.toFixed(2));
}

export function resolveReaderBodyLineHeight(density: TranscriptDensity, custom: unknown): number {
  return normalizeReaderBodyLineHeight(custom) ?? READER_BODY_LINE_HEIGHT_DEFAULTS[density];
}

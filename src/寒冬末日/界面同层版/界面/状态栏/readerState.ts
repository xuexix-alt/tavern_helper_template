import type { DemoTheme, ReaderChatState, ReaderFontMode, ReadingMode, TranscriptDensity } from './types';

export const READER_CHAT_STATE_PATH = 'stream_demo.reader_state';
export const READER_CHAT_STATE_VERSION = 3;

export function normalizeReadingMode(input: unknown): ReadingMode | null {
  return input === 'following_latest' || input === 'browsing_history' ? input : null;
}

export function normalizeDensity(input: unknown): TranscriptDensity | null {
  if (input === 'comfortable' || input === 'minimal') return input;
  if (input === 'compact') return 'minimal';
  return null;
}

export function normalizeTheme(input: unknown): DemoTheme | null {
  return input === 'tech' ||
    input === 'dark' ||
    input === 'gold' ||
    input === 'ios' ||
    input === 'ipod' ||
    input === 'amber'
    ? input
    : null;
}

export function normalizeFontMode(input: unknown): ReaderFontMode | null {
  return input === 'hud' || input === 'reading' ? input : null;
}

export function migrateReaderChatState(raw: Partial<ReaderChatState>): Partial<ReaderChatState> {
  return {
    version: READER_CHAT_STATE_VERSION,
    reading_mode: normalizeReadingMode(raw?.reading_mode) ?? 'following_latest',
    density: normalizeDensity(raw?.density) ?? 'comfortable',
    theme: normalizeTheme(raw?.theme) ?? 'tech',
    font_mode: normalizeFontMode(raw?.font_mode) ?? 'hud',
    opening_expanded: typeof raw?.opening_expanded === 'boolean' ? raw.opening_expanded : true,
  };
}

export function readReaderChatState(): Partial<ReaderChatState> {
  try {
    const vars = getVariables?.({ type: 'chat' }) ?? {};
    const raw = (_.get(vars, READER_CHAT_STATE_PATH, {}) ?? {}) as Partial<ReaderChatState>;
    return migrateReaderChatState(raw);
  } catch {
    return {};
  }
}

export function patchReaderChatState(patch: Partial<ReaderChatState>) {
  try {
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        const current = migrateReaderChatState(
          (_.get(vars, READER_CHAT_STATE_PATH, {}) ?? {}) as Partial<ReaderChatState>,
        );
        _.set(vars, READER_CHAT_STATE_PATH, {
          version: READER_CHAT_STATE_VERSION,
          reading_mode:
            normalizeReadingMode(patch.reading_mode) ??
            normalizeReadingMode(current.reading_mode) ??
            'following_latest',
          density: normalizeDensity(patch.density) ?? normalizeDensity(current.density) ?? 'comfortable',
          theme: normalizeTheme(patch.theme) ?? normalizeTheme(current.theme) ?? 'tech',
          font_mode: normalizeFontMode(patch.font_mode) ?? normalizeFontMode(current.font_mode) ?? 'hud',
          opening_expanded:
            typeof patch.opening_expanded === 'boolean'
              ? patch.opening_expanded
              : typeof current.opening_expanded === 'boolean'
                ? current.opening_expanded
                : true,
        });
        return vars;
      },
      { type: 'chat' },
    );
  } catch {}
}

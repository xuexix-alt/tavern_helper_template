import type { ReaderChatState, ReadingMode, TranscriptDensity } from './types';

export const READER_CHAT_STATE_PATH = 'stream_demo.reader_state';
export const READER_CHAT_STATE_VERSION = 1;

export function normalizeMessageId(input: unknown): number | null {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

export function normalizeReadingMode(input: unknown): ReadingMode | null {
  return input === 'following_latest' || input === 'browsing_history' ? input : null;
}

export function normalizeDensity(input: unknown): TranscriptDensity | null {
  return input === 'comfortable' || input === 'compact' || input === 'minimal' ? input : null;
}

export function migrateReaderChatState(raw: Partial<ReaderChatState>): Partial<ReaderChatState> {
  const version = Number(raw?.version);

  if (!Number.isFinite(version) || version < 1) {
    return {
      version: READER_CHAT_STATE_VERSION,
      initialized: raw?.initialized === true,
      opening_message_id: normalizeMessageId(raw?.opening_message_id),
      latest_user_message_id: normalizeMessageId(raw?.latest_user_message_id),
      latest_assistant_message_id: normalizeMessageId(raw?.latest_assistant_message_id),
      reading_mode: normalizeReadingMode(raw?.reading_mode) ?? 'following_latest',
      density: normalizeDensity(raw?.density) ?? 'comfortable',
      opening_expanded: typeof raw?.opening_expanded === 'boolean' ? raw.opening_expanded : true,
      updated_at: Number(raw?.updated_at) || Date.now(),
    };
  }

  return {
    ...raw,
    version: READER_CHAT_STATE_VERSION,
    opening_message_id: normalizeMessageId(raw?.opening_message_id),
    latest_user_message_id: normalizeMessageId(raw?.latest_user_message_id),
    latest_assistant_message_id: normalizeMessageId(raw?.latest_assistant_message_id),
    reading_mode: normalizeReadingMode(raw?.reading_mode) ?? 'following_latest',
    density: normalizeDensity(raw?.density) ?? 'comfortable',
    opening_expanded: typeof raw?.opening_expanded === 'boolean' ? raw.opening_expanded : true,
    updated_at: Number(raw?.updated_at) || Date.now(),
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
        const current = (_.get(vars, READER_CHAT_STATE_PATH, {}) ?? {}) as Partial<ReaderChatState>;
        _.set(vars, READER_CHAT_STATE_PATH, {
          ...current,
          ...patch,
          version: READER_CHAT_STATE_VERSION,
          updated_at: Date.now(),
        });
        return vars;
      },
      { type: 'chat' },
    );
  } catch {
    // ignore
  }
}

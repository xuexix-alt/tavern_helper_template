import type { TranscriptItem } from './types';

export function normalizeBooleanFlag(input: unknown): boolean | undefined {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return Number.isFinite(input) ? input !== 0 : undefined;
  if (typeof input === 'string') {
    const value = input.trim().toLowerCase();
    if (!value) return undefined;
    if (['true', '1', 'yes', 'on', 'user', 'human', 'usr'].includes(value)) return true;
    if (['false', '0', 'no', 'off', 'assistant', 'ai', 'bot', 'system', 'sys'].includes(value)) return false;
  }
  return undefined;
}

export function resolveHostMessageRole(message: any): TranscriptItem['role'] {
  const role = String(message?.role ?? message?.type ?? '')
    .trim()
    .toLowerCase();
  const name = String(message?.name ?? '').trim();
  const normalizedName = name.toLowerCase();
  const hintUser = normalizeBooleanFlag(message?.is_user);
  const hintSystem = normalizeBooleanFlag(message?.is_system);
  const isSmallSys = message?.extra?.isSmallSys === true;
  const hasSystemType = typeof message?.extra?.type === 'string' && String(message.extra.type).trim().length > 0;
  const hasExplicitSystemIdentity =
    normalizedName === 'system' || normalizedName === 'sillytavern system' || normalizedName === 'comment';

  const isUser =
    hintUser ??
    (role === 'user' ? true : undefined) ??
    (role === 'assistant' ? false : undefined) ??
    (hintSystem === true ? false : undefined);

  if (isUser === true) return 'user';
  if (isSmallSys || hasSystemType || hasExplicitSystemIdentity) return 'system';
  if (role === 'assistant') return 'assistant';
  if (role === 'system' && !name) return 'system';
  if (role === 'system' && !hasExplicitSystemIdentity && !hasSystemType && !isSmallSys) return 'assistant';
  if (hintSystem === true) return 'assistant';
  if (role === 'system') return 'system';
  return 'assistant';
}

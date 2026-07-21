import { parse } from 'yaml';

export const STAT_DATA_MACRO = '{{format_message_variable::stat_data}}';
const OUTER_FENCE = /^\s*```(?:ya?ml|json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i;

export type StatDataRootNameFailure = 'source-error' | 'macro-unexpanded' | 'parse-error' | 'not-object' | 'empty';
export type StatDataRootNameResult = { ok: true; names: string[] } | { ok: false; reason: StatDataRootNameFailure };

export function parseStatDataRootNames(expanded: string): StatDataRootNameResult {
  const trimmed = String(expanded ?? '').trim();
  if (!trimmed || trimmed.includes(STAT_DATA_MACRO)) return { ok: false, reason: 'macro-unexpanded' };
  const fenced = trimmed.match(OUTER_FENCE);
  const source = fenced ? fenced[1] : trimmed;
  let value: unknown;
  try {
    value = parse(source);
  } catch {
    return { ok: false, reason: 'parse-error' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'not-object' };
  const names = [
    ...new Set(
      Object.keys(value)
        .map(name => name.trim())
        .filter(Boolean),
    ),
  ];
  return names.length ? { ok: true, names } : { ok: false, reason: 'empty' };
}

export function loadStatDataRootNames(expandMacro: (source: string) => string): StatDataRootNameResult {
  try {
    return parseStatDataRootNames(expandMacro(STAT_DATA_MACRO));
  } catch {
    return { ok: false, reason: 'source-error' };
  }
}

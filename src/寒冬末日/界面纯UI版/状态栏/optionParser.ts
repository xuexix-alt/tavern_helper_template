const OPTION_BLOCK_RE = /<option(?:\s[^>]*)?>([\s\S]*?)(?:<\/option>|$)/gi;
const OPTION_TAG_RE = /<\/?[^>]+>/g;
const OPTION_LI_RE = /<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi;
const OPTION_LINE_MARKER_RE = /^(?:[-*•]+|\d+[.)、]|[（(]?\d+[)）、])\s*/;

function normalizeOptionText(input: string): string {
  return String(input ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p(?:\s[^>]*)?>/gi, '\n')
    .replace(OPTION_TAG_RE, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(OPTION_LINE_MARKER_RE, '')
    .trim();
}

function uniquePush(target: string[], value: string) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

export function extractLastOptionBody(raw: string): string {
  const source = String(raw ?? '');
  if (!source.trim()) return '';

  let last = '';
  for (const match of source.matchAll(OPTION_BLOCK_RE)) {
    const body = String(match[1] ?? '').trim();
    if (body) last = body;
  }
  return last;
}

export function parseOptionsFromRaw(raw: string): string[] {
  const body = extractLastOptionBody(raw);
  if (!body) return [];

  const options: string[] = [];
  const liItems = Array.from(body.matchAll(OPTION_LI_RE))
    .map(match => normalizeOptionText(String(match[1] ?? '')))
    .filter(Boolean);

  if (liItems.length > 0) {
    for (const item of liItems) uniquePush(options, item);
    return options;
  }

  const normalizedBody = body.replace(/<br\s*\/?>/gi, '\n').replace(/\r\n/g, '\n');
  const lines = normalizedBody
    .split('\n')
    .map(line => normalizeOptionText(line))
    .filter(Boolean);

  for (const line of lines) uniquePush(options, line);
  return options;
}

export function stripOptionBlocks(raw: string): string {
  return String(raw ?? '').replace(/<option(?:\s[^>]*)?>[\s\S]*?(?:<\/option>|$)/gi, '');
}

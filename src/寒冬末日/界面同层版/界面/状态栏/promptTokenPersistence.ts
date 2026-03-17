type PromptTokenInput =
  | string
  | {
      promptToken?: string;
      anchorText?: string;
    };

const CONTENT_BLOCK_RE = /<content(?:\s[^>]*)?>([\s\S]*?)<\/content>/i;
const PROMPT_TOKEN_RE = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;

function normalizeLine(input: string): string {
  return String(input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePromptToken(input: PromptTokenInput): { promptToken: string; anchorText: string } | null {
  if (typeof input === 'string') {
    const promptToken = String(input).trim();
    return promptToken ? { promptToken, anchorText: '' } : null;
  }

  const promptToken = String(input?.promptToken ?? '').trim();
  const anchorText = String(input?.anchorText ?? '').trim();
  if (!promptToken) return null;
  return { promptToken, anchorText };
}

function stripExistingPromptTokens(content: string): string {
  return String(content ?? '')
    .replace(PROMPT_TOKEN_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function insertPromptTokenIntoContent(content: string, promptToken: string, anchorText: string): string {
  const lines = String(content ?? '')
    .split('\n')
    .map(line => line.trimEnd());

  const normalizedAnchor = normalizeLine(anchorText);
  if (normalizedAnchor) {
    const anchorIndex = lines.findIndex(line => {
      const normalizedLine = normalizeLine(line);
      return normalizedLine && (normalizedLine.includes(normalizedAnchor) || normalizedAnchor.includes(normalizedLine));
    });
    if (anchorIndex >= 0) {
      lines.splice(anchorIndex + 1, 0, promptToken);
      return lines.join('\n');
    }
  }

  lines.push(promptToken);
  return lines.join('\n');
}

export function mergePromptTokensIntoRawMessage(raw: string, promptTokens: PromptTokenInput[]): string {
  const source = String(raw ?? '');
  const normalizedEntries = (Array.isArray(promptTokens) ? promptTokens : [])
    .map(normalizePromptToken)
    .filter(Boolean) as Array<{ promptToken: string; anchorText: string }>;

  if (normalizedEntries.length === 0) return source;

  const dedupedEntries: Array<{ promptToken: string; anchorText: string }> = [];
  const seen = new Set<string>();
  for (const entry of normalizedEntries) {
    if (seen.has(entry.promptToken)) continue;
    seen.add(entry.promptToken);
    dedupedEntries.push(entry);
  }

  const contentMatch = source.match(CONTENT_BLOCK_RE);
  if (!contentMatch?.[1]) {
    let next = stripExistingPromptTokens(source);
    for (const entry of dedupedEntries) {
      next = `${next}${next ? '\n' : ''}${entry.promptToken}`;
    }
    return next;
  }

  let nextContent = stripExistingPromptTokens(contentMatch[1]);
  for (const entry of dedupedEntries) {
    nextContent = insertPromptTokenIntoContent(nextContent, entry.promptToken, entry.anchorText);
  }

  return source.replace(CONTENT_BLOCK_RE, `<content>\n${nextContent}\n</content>`);
}

type NodeLike = {
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => {
    dataset?: Record<string, unknown>;
    getAttribute?: (name: string) => string | null;
  } | null;
  textContent?: string | null;
};

type ResolveImageRequestTargetMessageIdInput = {
  prompt: string;
  listButtons: () => NodeLike[];
  listTokenMarkers?: () => NodeLike[];
};

function collectPromptTokens(input: string): string[] {
  const out: string[] = [];
  const regex = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(String(input ?? '')))) {
    out.push(String(match[0] ?? '').trim());
  }
  return out;
}

function normalizePromptToken(input: string): string {
  const token = collectPromptTokens(String(input ?? '').trim())[0] || String(input ?? '').trim();
  return token
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toFiniteMessageId(input: unknown): number | null {
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.trunc(numeric);
}

function pickFirstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function readPromptPayload(node: NodeLike): string {
  return pickFirstNonEmpty(
    node?.getAttribute?.('data-image-tag'),
    node?.getAttribute?.('data-link'),
    node?.getAttribute?.('data-prompt-token'),
    node?.textContent,
  );
}

function resolveCarrierMessageId(node: NodeLike): number | null {
  const carrier = node.closest?.(
    '.assistant-body[data-message-id], .assistant-card[data-message-id], .transcript-entry[data-message-id]',
  );
  const directMessageId =
    toFiniteMessageId(carrier?.dataset?.messageId) ??
    toFiniteMessageId(carrier?.getAttribute?.('data-message-id')) ??
    toFiniteMessageId(node.closest?.('.assistant-body[data-message-id]')?.dataset?.messageId);
  if (directMessageId != null) return directMessageId;

  const mesCarrier = node.closest?.('.mes[mesid]');
  return toFiniteMessageId(mesCarrier?.getAttribute?.('mesid'));
}

export function resolveImageRequestTargetMessageId(input: ResolveImageRequestTargetMessageIdInput): number | null {
  const needle = normalizePromptToken(input.prompt);
  if (!needle) return null;

  for (const button of input.listButtons()) {
    const payload = readPromptPayload(button);
    if (!payload) continue;
    if (normalizePromptToken(payload) !== needle) continue;
    const messageId = resolveCarrierMessageId(button);
    if (messageId != null) return messageId;
  }

  for (const marker of input.listTokenMarkers?.() ?? []) {
    const payload = readPromptPayload(marker);
    if (!payload) continue;
    if (normalizePromptToken(payload) !== needle) continue;
    const messageId = resolveCarrierMessageId(marker);
    if (messageId != null) return messageId;
  }

  return null;
}

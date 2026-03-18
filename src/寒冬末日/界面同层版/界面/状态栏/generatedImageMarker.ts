export type GeneratedImageMarkerIdentityInput = {
  messageId: number;
  markerId?: string;
  imageId?: string;
  requestId?: string;
  promptToken?: string;
  anchorText?: string;
  order?: number;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildGeneratedImageMarkerId(input: GeneratedImageMarkerIdentityInput): string {
  const explicitMarkerId = normalizeText(input.markerId);
  if (explicitMarkerId) return explicitMarkerId;

  const messageId = Number.isFinite(Number(input.messageId)) ? Math.trunc(Number(input.messageId)) : 0;
  const requestId = normalizeText(input.requestId);
  const imageId = normalizeText(input.imageId);
  const promptToken = normalizeText(input.promptToken);
  const anchorText = normalizeText(input.anchorText);
  const order = Number.isFinite(Number(input.order)) ? Math.trunc(Number(input.order)) : 0;

  const identitySeed =
    (requestId && `request:${requestId}`) ||
    (imageId && `image:${imageId}`) ||
    (promptToken && `prompt:${promptToken}`) ||
    (anchorText && `anchor:${anchorText}`) ||
    `order:${order}`;

  return `gm:${messageId}:${hashText(identitySeed)}`;
}

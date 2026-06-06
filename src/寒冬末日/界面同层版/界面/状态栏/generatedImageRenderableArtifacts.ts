export type RenderableGeneratedImageArtifact = {
  markerId?: string;
  imageId?: string;
  src: string;
  alt: string;
  promptToken?: string;
  requestId?: string;
  anchorText?: string;
  title?: string;
  characterName?: string;
};

function hasText(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

function pickExistingText(current: string | undefined, incoming: string | undefined): string | undefined {
  if (hasText(current)) return current;
  if (hasText(incoming)) return incoming;
  return current;
}

export function mergeRenderableGeneratedImageArtifact<T extends RenderableGeneratedImageArtifact>(
  current: T,
  incoming: RenderableGeneratedImageArtifact,
): T {
  return {
    ...current,
    markerId: pickExistingText(current.markerId, incoming.markerId),
    imageId: pickExistingText(current.imageId, incoming.imageId),
    src: pickExistingText(current.src, incoming.src) ?? current.src,
    alt: pickExistingText(current.alt, incoming.alt) ?? 'generated image',
    promptToken: pickExistingText(current.promptToken, incoming.promptToken),
    requestId: pickExistingText(current.requestId, incoming.requestId),
    anchorText: pickExistingText(current.anchorText, incoming.anchorText),
    title: pickExistingText(current.title, incoming.title),
    characterName: pickExistingText(current.characterName, incoming.characterName),
  };
}

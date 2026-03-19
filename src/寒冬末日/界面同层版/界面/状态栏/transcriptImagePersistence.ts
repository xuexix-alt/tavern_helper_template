export type TranscriptArtifactAppender = (html: string, renderSource: string, messageId: number) => string;

export type PersistedImageLike = {
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
};

export function applyTranscriptArtifacts(input: {
  html: string;
  renderSource: string;
  messageId: number;
  appendArtifacts?: TranscriptArtifactAppender | null;
}): string {
  const { html, renderSource, messageId, appendArtifacts } = input;
  if (typeof appendArtifacts !== 'function') return html;
  return appendArtifacts(html, renderSource, messageId);
}

export async function hydratePersistedImageElements(input: {
  elements: PersistedImageLike[];
  resolveSrc: (src: string, element: PersistedImageLike) => Promise<string | null> | string | null;
}): Promise<void> {
  const { elements, resolveSrc } = input;
  const targets = Array.isArray(elements) ? elements : [];

  await Promise.all(
    targets.map(async element => {
      const currentSrc = String(element.getAttribute('src') ?? '').trim();
      if (!currentSrc.startsWith('idb://')) return;

      element.setAttribute('data-persisted-image-src', currentSrc);
      element.setAttribute('data-persisted-image-status', 'loading');

      const resolvedSrc = await resolveSrc(currentSrc, element);
      const latestSrc = String(element.getAttribute('src') ?? '').trim();
      if (latestSrc !== currentSrc) return;

      if (!resolvedSrc) {
        element.setAttribute('data-persisted-image-status', 'missing');
        return;
      }

      element.setAttribute('src', resolvedSrc);
      element.setAttribute('data-persisted-image-status', 'ready');
    }),
  );
}

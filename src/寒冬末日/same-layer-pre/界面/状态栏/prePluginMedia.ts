/** Shared by transcript snapshots, host gesture routing and the gallery. */
export const PLUGIN_MEDIA_SELECTOR =
  'button.image-tag-button,.st-chatu8-image-button,.st-chatu8-image-span,.st-chatu8-image-container,.ai-image-container,span.image-tag-placeholder';

const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function usableMediaSrc(value: unknown): string {
  const src = String(value ?? '').trim();
  return !src || src === BLANK_IMAGE || src === 'about:blank' ? '' : src;
}

/** Avoid instanceof: host and pre belong to different JavaScript realms. */
export function readPluginMediaSrc(element: Element | null | undefined): string {
  const media = element?.matches?.('img,video') ? element : element?.querySelector?.('img,video');
  if (!media) return '';
  const full = usableMediaSrc(media.getAttribute('data-full-src'));
  if (full) return full;
  // .src on a node without a src attribute can resolve to the page URL.
  if (!media.getAttribute('src')) return '';
  return usableMediaSrc((media as HTMLImageElement).currentSrc) || usableMediaSrc(media.getAttribute('src'));
}

/** Read each field independently, stopping at its message boundary. */
export function readPluginField(element: Element | null | undefined, keys: string[]): string {
  const read = (node: Element) => {
    for (const key of keys) {
      const value = String(
        (node as HTMLElement).dataset?.[key] ??
          node.getAttribute?.(`data-${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`) ??
          '',
      ).trim();
      if (value) return value;
    }
    return '';
  };
  let node = element;
  while (node) {
    const value = read(node);
    if (value) return value;
    if (node.matches?.('.pre-message-card,.mes,.pre-message-card__body,.mes_text')) break;
    if (node.matches?.('.st-chatu8-image-span,span.image-tag-placeholder')) {
      const button = node.previousElementSibling;
      if (button?.matches('button.image-tag-button,.st-chatu8-image-button')) {
        const siblingValue = read(button);
        if (siblingValue) return siblingValue;
      }
    }
    node = node.parentElement;
  }
  return '';
}

/**
 * The plugin inserts block divs into a span inside a paragraph through DOM APIs.
 * Serializing that tree verbatim makes the HTML parser close the paragraph/span.
 * Convert plugin-only block wrappers to styled spans BEFORE serializing; retain
 * native request identities and eagerly resolve the snapshot's lazy media URL.
 * Interactions on these snapshots are delegated to the real host controls.
 */
export function serializePreHostHtml(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  for (const div of Array.from(copy.querySelectorAll('div'))) {
    if (!div.closest(PLUGIN_MEDIA_SELECTOR)) continue;
    const span = copy.ownerDocument.createElement('span');
    for (const attr of Array.from(div.attributes)) span.setAttribute(attr.name, attr.value);
    span.style.display = div.style.display || 'block';
    span.replaceChildren(...Array.from(div.childNodes));
    div.replaceWith(span);
  }
  for (const media of Array.from(copy.querySelectorAll('img[data-full-src]'))) {
    const src = readPluginMediaSrc(media);
    if (src) media.setAttribute('src', src);
  }
  return copy.innerHTML;
}

const PLACEHOLDER_SELECTOR = '.assistant-image-prompt-list';

export function stripPluginNativePlaceholderHtml(html: string): string {
  const source = String(html ?? '').trim();
  if (!source) return '';

  if (typeof document === 'undefined' || !document?.implementation?.createHTMLDocument) {
    return source
      .replace(/<section\b[^>]*class="[^"]*\bassistant-image-prompt-list\b[^"]*"[^>]*>[\s\S]*?<\/section>/gi, '')
      .trim();
  }

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = source;
  for (const node of Array.from(doc.body.querySelectorAll(PLACEHOLDER_SELECTOR))) {
    node.remove();
  }

  return doc.body.innerHTML;
}

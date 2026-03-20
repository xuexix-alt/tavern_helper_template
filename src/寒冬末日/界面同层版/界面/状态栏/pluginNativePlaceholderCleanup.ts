const PLACEHOLDER_SELECTOR =
  '.image-tag-button, .image-tag-placeholder, .image-tag-container, .ai-image-container';

export function stripPluginNativePlaceholderHtml(html: string): string {
  const source = String(html ?? '').trim();
  if (!source) return '';

  if (typeof document === 'undefined' || !document?.implementation?.createHTMLDocument) {
    return source
      .replace(/<button\b[^>]*class="[^"]*\bimage-tag-button\b[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '')
      .replace(/<span\b[^>]*class="[^"]*\bimage-tag-placeholder\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<span\b[^>]*class="[^"]*\bimage-tag-container\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<div\b[^>]*class="[^"]*\bai-image-container\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .trim();
  }

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = source;
  for (const node of Array.from(doc.body.querySelectorAll(PLACEHOLDER_SELECTOR))) {
    node.remove();
  }

  return doc.body.innerHTML;
}

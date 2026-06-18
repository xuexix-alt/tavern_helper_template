const PLACEHOLDER_SELECTOR = '.assistant-image-prompt-list';
const NATIVE_READY_SELECTOR =
  '.st-chatu8-image-span, span.image-tag-placeholder, .st-chatu8-image-container, .ai-image-container';
const NATIVE_BUTTON_SELECTOR = '.st-chatu8-image-button, button.image-tag-button';
const NATIVE_RUNTIME_SELECTOR = `${PLACEHOLDER_SELECTOR}, ${NATIVE_READY_SELECTOR}, ${NATIVE_BUTTON_SELECTOR}`;

function stripNativePromptAttributes(element: Element) {
  const attrs = Array.from(element.attributes);
  for (const attr of attrs) {
    if (
      attr.name === 'data-link' ||
      attr.name === 'data-image-tag' ||
      attr.name === 'data-stable-id' ||
      attr.name === 'data-loading' ||
      attr.name === 'data-prompt-token'
    ) {
      element.removeAttribute(attr.name);
    }
  }
}

function createFallbackFigure(doc: Document, nativeNode: Element): HTMLElement | null {
  const image = nativeNode.querySelector('img') as HTMLImageElement | null;
  const src = image?.getAttribute('src') ?? image?.currentSrc ?? '';
  if (!image || !src) return null;

  const figure = doc.createElement('figure');
  figure.className = 'assistant-fallback-inline-image';

  const clonedImage = image.cloneNode(true) as HTMLImageElement;
  stripNativePromptAttributes(clonedImage);
  clonedImage.setAttribute('src', src);
  clonedImage.setAttribute('loading', clonedImage.getAttribute('loading') || 'lazy');
  if (!clonedImage.getAttribute('alt')) clonedImage.setAttribute('alt', 'generated image');
  figure.append(clonedImage);
  return figure;
}

function stripNativeRuntimeHtmlWithoutDom(html: string): string {
  return String(html ?? '')
    .replace(/<section\b[^>]*class="[^"]*\bassistant-image-prompt-list\b[^"]*"[^>]*>[\s\S]*?<\/section>/gi, '')
    .replace(
      /<(span|div)\b(?=[^>]*class="[^"]*\b(?:st-chatu8-image-span|image-tag-placeholder|st-chatu8-image-container|ai-image-container)\b[^"]*"[^>]*>)[^>]*>([\s\S]*?<img\b[^>]*>[\s\S]*?)<\/\1>/gi,
      (_match, _tag, innerHtml) => {
        const image = String(innerHtml ?? '')
          .match(/<img\b[^>]*>/i)?.[0]
          ?.replace(/\sdata-(?:link|image-tag|stable-id|loading|prompt-token)=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        return image ? `<figure class="assistant-fallback-inline-image">${image}</figure>` : '';
      },
    )
    .replace(
      /<button\b[^>]*class="[^"]*\b(?:st-chatu8-image-button|image-tag-button)\b[^"]*"[^>]*>[\s\S]*?<\/button>/gi,
      '',
    )
    .replace(
      /<(span|div)\b[^>]*class="[^"]*\b(?:st-chatu8-image-span|image-tag-placeholder|st-chatu8-image-container|ai-image-container)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
      '',
    )
    .trim();
}

export function stripPluginNativePlaceholderHtml(html: string): string {
  const source = String(html ?? '').trim();
  if (!source) return '';

  if (typeof document === 'undefined' || !document?.implementation?.createHTMLDocument) {
    return stripNativeRuntimeHtmlWithoutDom(source);
  }

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = source;

  for (const node of Array.from(doc.body.querySelectorAll(PLACEHOLDER_SELECTOR))) {
    node.remove();
  }

  for (const node of Array.from(doc.body.querySelectorAll(NATIVE_READY_SELECTOR))) {
    if (node.closest(NATIVE_RUNTIME_SELECTOR) !== node && node.closest(NATIVE_READY_SELECTOR)) continue;
    // 如果节点包含实际的图片（插件已渲染），保持原样，不转换为fallback
    const hasRenderedImage = node.querySelector('img[src^="data:image"], img[src^="blob:"]');
    if (hasRenderedImage) {
      // 插件已经渲染了实际图片，保持原样，不创建fallback
      continue;
    }
    // 只有当没有实际图片时，才创建fallback或移除
    const figure = createFallbackFigure(doc, node);
    if (figure) {
      node.replaceWith(figure);
    } else {
      node.remove();
    }
  }

  for (const node of Array.from(doc.body.querySelectorAll(NATIVE_BUTTON_SELECTOR))) {
    node.remove();
  }

  return doc.body.innerHTML;
}

const PLUGIN_NATIVE_IMAGE_SELECTOR =
  '.st-chatu8-image-span img, .st-chatu8-image-container img, .ai-image-container img';
const PLUGIN_NATIVE_MUTATION_SELECTOR =
  '.mes_text, .st-chatu8-image-span, .st-chatu8-image-button, span.image-tag-placeholder, button.image-tag-button, .ai-image-container';
const PLUGIN_NATIVE_READY_MUTATION_SELECTOR =
  '.st-chatu8-image-span img, .st-chatu8-image-container img, .ai-image-container img';
const PLUGIN_NATIVE_RESPONSE_TARGET_SELECTOR =
  '.st-chatu8-image-span, span.image-tag-placeholder, .st-chatu8-image-button, button.image-tag-button';
export const SAME_LAYER_REQUEST_ID_ATTR = 'data-samelayer-request-id';

type RootLike = {
  querySelectorAll?: (selector: string) => ArrayLike<unknown>;
};

type ElementLike = {
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
};

type MutationNodeLike = {
  matches?: (selector: string) => boolean;
  querySelector?: (selector: string) => unknown;
  parentElement?: MutationNodeLike | null;
  parentNode?: MutationNodeLike | null;
};

export function countPluginNativeImageArtifacts(roots: RootLike[]): number {
  let count = 0;
  for (const root of Array.isArray(roots) ? roots : []) {
    if (!root || typeof root.querySelectorAll !== 'function') continue;
    count += Array.from(root.querySelectorAll(PLUGIN_NATIVE_IMAGE_SELECTOR)).length;
  }
  return count;
}

export function isPluginNativeMutationNode(node: unknown): boolean {
  const current = node as MutationNodeLike | null | undefined;
  if (!current || typeof current !== 'object') return false;

  if (typeof current.matches === 'function' && current.matches(PLUGIN_NATIVE_MUTATION_SELECTOR)) {
    return true;
  }

  if (typeof current.querySelector === 'function' && current.querySelector(PLUGIN_NATIVE_MUTATION_SELECTOR)) {
    return true;
  }

  const parent = current.parentElement ?? current.parentNode ?? null;
  if (parent && typeof parent.matches === 'function' && parent.matches(PLUGIN_NATIVE_MUTATION_SELECTOR)) {
    return true;
  }

  return false;
}

export function isReadyPluginNativeMutationNode(node: unknown): boolean {
  const current = node as MutationNodeLike | null | undefined;
  if (!current || typeof current !== 'object') return false;

  if (typeof current.matches === 'function' && current.matches(PLUGIN_NATIVE_READY_MUTATION_SELECTOR)) {
    return true;
  }

  if (typeof current.querySelector === 'function' && current.querySelector(PLUGIN_NATIVE_READY_MUTATION_SELECTOR)) {
    return true;
  }

  const parent = current.parentElement ?? current.parentNode ?? null;
  if (parent && typeof parent.matches === 'function' && parent.matches(PLUGIN_NATIVE_READY_MUTATION_SELECTOR)) {
    return true;
  }

  return false;
}

export function sanitizeSameLayerPluginNativeRequestIds(html: string): string {
  const source = String(html ?? '');
  if (!source || !source.includes('data-request-id')) return source;
  if (typeof document === 'undefined' || !document.implementation?.createHTMLDocument) {
    return source;
  }

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = source;

  for (const element of Array.from(doc.body.querySelectorAll(PLUGIN_NATIVE_RESPONSE_TARGET_SELECTOR))) {
    const requestId = element.getAttribute('data-request-id');
    if (requestId == null) continue;
    element.setAttribute(SAME_LAYER_REQUEST_ID_ATTR, requestId);
    element.removeAttribute('data-request-id');
  }

  return doc.body.innerHTML;
}

export function sanitizeSameLayerPluginNativeRequestIdElements(root: RootLike | null | undefined): number {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  let count = 0;
  for (const element of Array.from(root.querySelectorAll(PLUGIN_NATIVE_RESPONSE_TARGET_SELECTOR)) as ElementLike[]) {
    const requestId = element.getAttribute?.('data-request-id');
    if (requestId == null) continue;
    element.setAttribute?.(SAME_LAYER_REQUEST_ID_ATTR, requestId);
    element.removeAttribute?.('data-request-id');
    count += 1;
  }
  return count;
}

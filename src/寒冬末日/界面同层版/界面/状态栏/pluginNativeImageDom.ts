const PLUGIN_NATIVE_IMAGE_SELECTOR = '.st-chatu8-image-span img';
const PLUGIN_NATIVE_MUTATION_SELECTOR = '.mes_text, .st-chatu8-image-span, .st-chatu8-image-button';
const PLUGIN_NATIVE_READY_MUTATION_SELECTOR = '.st-chatu8-image-span img, .st-chatu8-image-container img';

type RootLike = {
  querySelectorAll?: (selector: string) => ArrayLike<unknown>;
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

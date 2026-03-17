const PLUGIN_NATIVE_IMAGE_SELECTOR = '.st-chatu8-image-span img, .st-chatu8-image-button';

type RootLike = {
  querySelectorAll?: (selector: string) => ArrayLike<unknown>;
};

export function countPluginNativeImageArtifacts(roots: RootLike[]): number {
  let count = 0;
  for (const root of Array.isArray(roots) ? roots : []) {
    if (!root || typeof root.querySelectorAll !== 'function') continue;
    count += Array.from(root.querySelectorAll(PLUGIN_NATIVE_IMAGE_SELECTOR)).length;
  }
  return count;
}

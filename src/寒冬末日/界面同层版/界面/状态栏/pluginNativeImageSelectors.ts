export const PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR =
  '.st-chatu8-image-span, .assistant-gallery-image, .assistant-fallback-inline-image, .assistant-fallback-generated-image';

export function isPluginNativeImageElement(target: Element | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR));
}

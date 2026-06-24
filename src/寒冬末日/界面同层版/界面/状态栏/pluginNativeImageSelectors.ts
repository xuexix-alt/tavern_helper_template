export const PLUGIN_NATIVE_IMAGE_BUTTON_SELECTOR =
  'button.image-tag-button, button.st-chatu8-image-button, .st-chatu8-image-button[role="button"]';

export const PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR =
  '.st-chatu8-image-span, span.image-tag-placeholder, .assistant-gallery-image, .assistant-fallback-inline-image, .assistant-fallback-generated-image';

export const PLUGIN_NATIVE_IMAGE_INTERACTION_SELECTOR = `${PLUGIN_NATIVE_IMAGE_BUTTON_SELECTOR}, ${PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR}`;

export function isPluginNativeImageElement(target: Element | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(PLUGIN_NATIVE_IMAGE_INTERACTION_SELECTOR));
}

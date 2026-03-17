export function getFallbackImageClasses() {
  return {
    gallery: 'assistant-fallback-generated-gallery',
    item: 'assistant-fallback-generated-image',
    inline: 'assistant-fallback-inline-image',
  } as const;
}

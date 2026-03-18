require('ts-node/register/transpile-only');

const {
  isPluginNativeImageElement,
} = require('../src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageSelectors.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

class FakeElement {
  constructor(mode) {
    this.mode = mode;
  }

  closest(selector) {
    if (selector === '.st-chatu8-image-span, .assistant-gallery-image') {
      if (this.mode === 'native' || this.mode === 'gallery') return this;
    }
    if (selector === '.st-chatu8-image-span, .assistant-gallery-image, .assistant-fallback-inline-image, .assistant-fallback-generated-image') {
      if (this.mode === 'native' || this.mode === 'gallery' || this.mode === 'inline' || this.mode === 'generated')
        return this;
    }
    return null;
  }
}

global.Element = FakeElement;

assertEqual(
  isPluginNativeImageElement(new FakeElement('native')),
  true,
  'plugin-native selector helper should match native image carrier nodes',
);

assertEqual(
  isPluginNativeImageElement(new FakeElement('gallery')),
  true,
  'plugin-native selector helper should also match gallery image carrier nodes for host-action forwarding',
);

assertEqual(
  isPluginNativeImageElement(new FakeElement('inline')),
  true,
  'plugin-native selector helper should match inline generated image carriers in transcript body',
);

assertEqual(
  isPluginNativeImageElement(new FakeElement('generated')),
  true,
  'plugin-native selector helper should match generated gallery/image carriers restored from persisted data',
);

assertEqual(
  isPluginNativeImageElement(new FakeElement('other')),
  false,
  'plugin-native selector helper should reject fallback-only image nodes',
);

console.log('plugin native image selectors test passed');

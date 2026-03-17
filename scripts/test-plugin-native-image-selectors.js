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
  constructor(isNative) {
    this.isNative = isNative;
  }

  closest(selector) {
    if (selector === '.st-chatu8-image-span' && this.isNative) return this;
    return null;
  }
}

global.Element = FakeElement;

assertEqual(
  isPluginNativeImageElement(new FakeElement(true)),
  true,
  'plugin-native selector helper should match native image carrier nodes',
);

assertEqual(
  isPluginNativeImageElement(new FakeElement(false)),
  false,
  'plugin-native selector helper should reject fallback-only image nodes',
);

console.log('plugin native image selectors test passed');

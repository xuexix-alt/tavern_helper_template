require('ts-node/register/transpile-only');

const { chooseImageRenderMode } = require('../src/寒冬末日/界面同层版/界面/状态栏/imageRenderPriority.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

assertEqual(
  chooseImageRenderMode({ hasPluginNativeDom: true, pluginNativeCount: 1, compatibilityCount: 3 }),
  'plugin-native',
  'plugin-native DOM should always win over compatibility image data when both exist',
);

assertEqual(
  chooseImageRenderMode({ hasPluginNativeDom: false, pluginNativeCount: 2, compatibilityCount: 2 }),
  'plugin-native-data',
  'plugin-native message data should win over compatibility data when restored DOM is absent',
);

assertEqual(
  chooseImageRenderMode({ hasPluginNativeDom: false, pluginNativeCount: 0, compatibilityCount: 2 }),
  'compatibility',
  'compatibility rendering should only be used when plugin-native data is absent',
);

assertEqual(
  chooseImageRenderMode({ hasPluginNativeDom: false, pluginNativeCount: 0, compatibilityCount: 0 }),
  'none',
  'no images should render when neither plugin-native DOM nor compatibility images exist',
);

console.log('plugin native image chain priority test passed');

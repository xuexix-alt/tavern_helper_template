const test = require('node:test');
const assert = require('node:assert/strict');

const { chooseImageRenderMode } = require('../imageRenderPriority.ts');

test('chooseImageRenderMode backfills when host plugin-native DOM is partial', () => {
  assert.equal(
    chooseImageRenderMode({
      hasPluginNativeDom: true,
      hostPluginNativeDomArtifactCount: 4,
      pluginNativeCount: 8,
      compatibilityCount: 0,
    }),
    'plugin-native-data',
  );
});

test('chooseImageRenderMode keeps plugin-native when host plugin-native DOM is complete', () => {
  assert.equal(
    chooseImageRenderMode({
      hasPluginNativeDom: true,
      hostPluginNativeDomArtifactCount: 4,
      pluginNativeCount: 4,
      compatibilityCount: 0,
    }),
    'plugin-native',
  );
});

test('chooseImageRenderMode falls back to data sources without host plugin-native DOM', () => {
  assert.equal(
    chooseImageRenderMode({
      hasPluginNativeDom: false,
      hostPluginNativeDomArtifactCount: 0,
      pluginNativeCount: 4,
      compatibilityCount: 0,
    }),
    'plugin-native-data',
  );
  assert.equal(
    chooseImageRenderMode({
      hasPluginNativeDom: false,
      hostPluginNativeDomArtifactCount: 0,
      pluginNativeCount: 0,
      compatibilityCount: 1,
    }),
    'compatibility',
  );
});

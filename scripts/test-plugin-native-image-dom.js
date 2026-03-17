require('ts-node/register/transpile-only');

const { countPluginNativeImageArtifacts } = require('../src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageDom.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const makeRoot = count => ({
  querySelectorAll() {
    return new Array(count).fill({});
  },
});

assertEqual(
  countPluginNativeImageArtifacts([makeRoot(2), makeRoot(1)]),
  3,
  'plugin-native DOM counter should sum artifacts across all roots',
);

assertEqual(
  countPluginNativeImageArtifacts([{}, null, makeRoot(0)]),
  0,
  'plugin-native DOM counter should ignore invalid roots and return zero when nothing exists',
);

console.log('plugin native image dom test passed');

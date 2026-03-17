require('ts-node/register/transpile-only');

const { getFallbackImageClasses } = require('../src/寒冬末日/界面同层版/界面/状态栏/imageFallbackClasses.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const classes = getFallbackImageClasses();

assertEqual(
  classes.inline,
  'assistant-fallback-inline-image',
  'fallback inline images should use a compatibility-only class name',
);
assertEqual(
  classes.item,
  'assistant-fallback-generated-image',
  'fallback gallery items should use a compatibility-only class name',
);

console.log('image fallback classes test passed');

const test = require('node:test');
const assert = require('node:assert/strict');

const { isPluginNativeMutationNode } = require('../pluginNativeImageDom.ts');

test('isPluginNativeMutationNode matches native mes_text and st-chatu8 artifacts', () => {
  const mesTextNode = {
    matches(selector) {
      return selector === '.mes_text, .st-chatu8-image-span, .st-chatu8-image-button';
    },
  };

  const nestedNode = {
    matches() {
      return false;
    },
    querySelector() {
      return null;
    },
    parentElement: {
      matches(selector) {
        return selector === '.mes_text, .st-chatu8-image-span, .st-chatu8-image-button';
      },
    },
  };

  const unrelatedNode = {
    matches() {
      return false;
    },
    querySelector() {
      return null;
    },
    parentElement: null,
  };

  assert.equal(isPluginNativeMutationNode(mesTextNode), true);
  assert.equal(isPluginNativeMutationNode(nestedNode), true);
  assert.equal(isPluginNativeMutationNode(unrelatedNode), false);
});

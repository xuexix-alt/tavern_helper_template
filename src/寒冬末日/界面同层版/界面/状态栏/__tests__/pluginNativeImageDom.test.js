const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countPluginNativeImageArtifacts,
  isPluginNativeMutationNode,
  isReadyPluginNativeMutationNode,
} = require('../pluginNativeImageDom.ts');

test('countPluginNativeImageArtifacts only counts ready img nodes and ignores button placeholders', () => {
  const root = {
    querySelectorAll(selector) {
      if (selector === '.st-chatu8-image-span img') {
        return [{ tagName: 'IMG' }, { tagName: 'IMG' }];
      }
      return [];
    },
  };

  assert.equal(countPluginNativeImageArtifacts([root]), 2);
});

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

test('isReadyPluginNativeMutationNode ignores button placeholders but matches ready image nodes', () => {
  const readyImageNode = {
    matches(selector) {
      return selector === '.st-chatu8-image-span img, .st-chatu8-image-container img';
    },
  };

  const buttonPlaceholderNode = {
    matches() {
      return false;
    },
    querySelector() {
      return null;
    },
    parentElement: {
      matches(selector) {
        return selector === '.st-chatu8-image-button';
      },
    },
  };

  assert.equal(isReadyPluginNativeMutationNode(readyImageNode), true);
  assert.equal(isReadyPluginNativeMutationNode(buttonPlaceholderNode), false);
});

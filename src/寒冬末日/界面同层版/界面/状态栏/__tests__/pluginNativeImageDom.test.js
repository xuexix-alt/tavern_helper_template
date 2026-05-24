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
      if (selector.includes('.st-chatu8-image-span img') && selector.includes('.ai-image-container img')) {
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
      return selector.includes('.mes_text') && selector.includes('button.image-tag-button');
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
        return selector.includes('.st-chatu8-image-span') && selector.includes('span.image-tag-placeholder');
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
      return selector.includes('.st-chatu8-image-span img') && selector.includes('.ai-image-container img');
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

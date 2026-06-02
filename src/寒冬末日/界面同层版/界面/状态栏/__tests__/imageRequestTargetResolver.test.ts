const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveImageRequestTargetMessageId } = require('../imageRequestTargetResolver.ts');

test('resolveImageRequestTargetMessageId accepts plugin-native mes_text data-message-index carriers', () => {
  const carrier = {
    dataset: {
      messageIndex: '11',
    },
    getAttribute(name) {
      return name === 'data-message-index' ? '11' : null;
    },
  };
  const button = {
    getAttribute(name) {
      if (name === 'data-image-tag') return 'image###same layer portrait###';
      return null;
    },
    closest(selector) {
      if (String(selector).includes('data-message-index')) return carrier;
      return null;
    },
  };

  const messageId = resolveImageRequestTargetMessageId({
    prompt: 'image###same layer portrait###',
    listButtons: () => [button],
  });

  assert.equal(messageId, 11);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseGeneratedImageActivationPayload } = require('../generatedImageActivation.ts');

test('parseGeneratedImageActivationPayload reads plugin-native data-link as prompt token', () => {
  const payload = parseGeneratedImageActivationPayload({
    carrierDataset: {
      messageId: '12',
      link: encodeURIComponent('image###1girl, snow###'),
    },
    targetDataset: {},
    targetAttrSrc: 'data:image/png;base64,abc',
  });

  assert.equal(payload.messageId, 12);
  assert.equal(payload.promptToken, 'image###1girl, snow###');
  assert.equal(payload.imageSrc, 'data:image/png;base64,abc');
});

test('parseGeneratedImageActivationPayload reads plugin-native data-image-tag as prompt token', () => {
  const payload = parseGeneratedImageActivationPayload({
    carrierDataset: {
      messageId: '7',
      imageTag: encodeURIComponent('image###portrait###'),
    },
    targetDataset: {},
  });

  assert.equal(payload.messageId, 7);
  assert.equal(payload.promptToken, 'image###portrait###');
});

test('parseGeneratedImageActivationPayload preserves transcript or gallery source markers', () => {
  const payload = parseGeneratedImageActivationPayload({
    carrierDataset: {
      messageId: '9',
      source: 'gallery',
      promptToken: 'image###reroll###',
    },
    targetDataset: {},
  });

  assert.equal(payload.source, 'gallery');
});

test('parseGeneratedImageActivationPayload accepts plugin-native data-message-index carriers', () => {
  const payload = parseGeneratedImageActivationPayload({
    carrierDataset: {
      messageId: '',
      messageIndex: '11',
      requestId: 'chatu8-id-ezh7uj',
      imageTag: 'image###scene###',
    },
    targetDataset: {},
  });

  assert.equal(payload.messageId, 11);
  assert.equal(payload.requestId, 'chatu8-id-ezh7uj');
});

test('parseGeneratedImageActivationPayload marks same-layer-only request ids', () => {
  const payload = parseGeneratedImageActivationPayload({
    carrierDataset: {
      messageId: '13',
      samelayerRequestId: 'chatu8-id-y804aw',
      imageTag: 'image###same layer copy###',
    },
    targetDataset: {},
  });

  assert.equal(payload.requestId, 'chatu8-id-y804aw');
  assert.equal(payload.sameLayerOnly, true);
});

test('parseGeneratedImageActivationPayload keeps native request ids as plugin-backed', () => {
  const payload = parseGeneratedImageActivationPayload({
    carrierDataset: {
      messageId: '13',
      requestId: 'chatu8-id-native',
      samelayerRequestId: 'chatu8-id-native',
      imageTag: 'image###native copy###',
    },
    targetDataset: {},
  });

  assert.equal(payload.requestId, 'chatu8-id-native');
  assert.equal(payload.sameLayerOnly, false);
});

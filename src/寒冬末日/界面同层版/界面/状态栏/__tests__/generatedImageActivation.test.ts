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

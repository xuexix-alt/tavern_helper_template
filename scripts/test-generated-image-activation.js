require('ts-node/register/transpile-only');

const {
  parseGeneratedImageActivationPayload,
} = require('../src/寒冬末日/界面同层版/界面/状态栏/generatedImageActivation.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const payload = parseGeneratedImageActivationPayload({
  carrierDataset: {
    messageId: '2',
    promptToken: 'image%23%23%23%E5%9B%BE%E4%B8%80%23%23%23',
    requestId: 'req-1',
    imageSrc: 'data%3Aimage%2Fpng%3Bbase64%2Caaa',
  },
  targetDataset: {},
  targetAttrSrc: 'data:image/png;base64,bbb',
});

assertEqual(payload.messageId, 2, 'activation payload should parse numeric message id');
assertEqual(payload.promptToken, 'image###图一###', 'activation payload should decode prompt token');
assertEqual(payload.requestId, 'req-1', 'activation payload should preserve request id');
assertEqual(payload.imageSrc, 'data:image/png;base64,aaa', 'activation payload should prefer carrier image src');

console.log('generated image activation test passed');

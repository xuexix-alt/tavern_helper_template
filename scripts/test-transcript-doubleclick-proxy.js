require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const { resolveTranscriptDoubleClickMessageId } = require('../src/寒冬末日/界面同层版/界面/状态栏/transcriptDoubleClick.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

function createMockNode(options) {
  const chain = options.chain ?? {};
  return {
    dataset: options.dataset ?? {},
    closest(selector) {
      return chain[selector] ?? null;
    },
  };
}

const proxyHost = { dataset: { messageId: '6' } };
const bodyHost = { dataset: { messageId: '6' } };
const imageCarrier = { dataset: { messageId: '6' } };

const proxyButton = createMockNode({
  chain: {
    '.assistant-generated-image, .assistant-inline-generated-image, .assistant-gallery-image': null,
    '.assistant-body-proxy[data-message-id], .assistant-body[data-message-id]': proxyHost,
  },
});

const bodyText = createMockNode({
  chain: {
    '.assistant-generated-image, .assistant-inline-generated-image, .assistant-gallery-image': null,
    '.assistant-body-proxy[data-message-id], .assistant-body[data-message-id]': bodyHost,
  },
});

const generatedImage = createMockNode({
  chain: {
    '.assistant-generated-image, .assistant-inline-generated-image, .assistant-gallery-image': imageCarrier,
    '.assistant-body-proxy[data-message-id], .assistant-body[data-message-id]': bodyHost,
  },
});

assertEqual(
  resolveTranscriptDoubleClickMessageId(proxyButton),
  6,
  'proxy button should resolve message id for transcript double click',
);

assertEqual(
  resolveTranscriptDoubleClickMessageId(bodyText),
  6,
  'assistant body text should still resolve message id as fallback',
);

assertEqual(
  resolveTranscriptDoubleClickMessageId(generatedImage),
  null,
  'generated image should not be consumed by transcript double click proxy',
);

const componentSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'src',
    '寒冬末日',
    '界面同层版',
    '界面',
    '状态栏',
    'components',
    'TranscriptMessageCard.vue',
  ),
  'utf8',
);

if (!componentSource.includes('assistant-body-proxy')) {
  throw new Error('TranscriptMessageCard.vue should render assistant-body-proxy overlay');
}

if (!componentSource.includes('.assistant-body {\n  position: relative;\n  z-index: 1;\n  pointer-events: none;')) {
  throw new Error('TranscriptMessageCard.vue should disable pointer events on assistant-body text layer');
}

if (!componentSource.includes('.assistant-body-wrap :deep(*) {\n  pointer-events: none;')) {
  throw new Error('TranscriptMessageCard.vue should disable pointer events on assistant body descendants');
}

if (
  !componentSource.includes(':deep(.assistant-generated-image) {\n  position: relative;\n  z-index: 3;\n  pointer-events: auto;')
) {
  throw new Error('TranscriptMessageCard.vue should keep generated image layer interactive');
}

console.log('transcript double click proxy test passed');

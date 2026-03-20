const test = require('node:test');
const assert = require('node:assert/strict');

const { buildIframeMessageRootSelectors } = require('../generatedImageDom');

test('buildIframeMessageRootSelectors includes assistant body wrap before body-only fallbacks', () => {
  const selectors = buildIframeMessageRootSelectors(4);

  assert.deepEqual(selectors, [
    ".assistant-body-wrap[data-message-id='4']",
    ".assistant-body[data-message-id='4']",
    ".transcript-entry[data-message-id='4'] .assistant-body-wrap",
    ".transcript-entry[data-message-id='4'] .assistant-body",
  ]);
});

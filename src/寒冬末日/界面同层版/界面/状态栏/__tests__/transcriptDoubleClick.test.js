const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveTranscriptDoubleClickMessageId } = require('../transcriptDoubleClick.ts');

test('resolveTranscriptDoubleClickMessageId falls back to assistant-card carriers for assistant-body-wrap targets', () => {
  const assistantCard = {
    dataset: {
      messageId: '6',
    },
  };

  const target = {
    closest(selector) {
      if (
        selector ===
        '.st-chatu8-image-span, .assistant-gallery-image, .assistant-fallback-inline-image, .assistant-fallback-generated-image'
      ) {
        return null;
      }

      if (
        selector ===
        '.assistant-body-proxy[data-message-id], .assistant-body[data-message-id], .assistant-card[data-message-id], .transcript-entry[data-message-id]'
      ) {
        return assistantCard;
      }

      return null;
    },
  };

  assert.equal(resolveTranscriptDoubleClickMessageId(target), 6);
});

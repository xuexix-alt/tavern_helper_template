const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldInjectTranscriptImages,
  pickGeneratedImageActivationTarget,
  resolveGeneratedImageActivationTarget,
} = require('../generatedImageInteraction');

test('shouldInjectTranscriptImages only injects fallback images for compatibility mode', () => {
  assert.equal(shouldInjectTranscriptImages('compatibility'), true);
  assert.equal(shouldInjectTranscriptImages('plugin-native'), false);
  assert.equal(shouldInjectTranscriptImages('plugin-native-data'), false);
  assert.equal(shouldInjectTranscriptImages('none'), false);
});

test('pickGeneratedImageActivationTarget prefers image nodes for viewer actions', () => {
  const hostImage = { id: 'host-image' };
  const hostButton = { id: 'host-button' };

  assert.equal(
    pickGeneratedImageActivationTarget('view', {
      hostImage,
      hostButton,
      iframeImage: null,
      iframeButton: null,
    }),
    hostImage,
  );
});

test('pickGeneratedImageActivationTarget prefers buttons for regenerate actions', () => {
  const hostImage = { id: 'host-image' };
  const hostButton = { id: 'host-button' };

  assert.equal(
    pickGeneratedImageActivationTarget('regenerate', {
      hostImage,
      hostButton,
      iframeImage: null,
      iframeButton: null,
    }),
    hostButton,
  );
});

test('resolveGeneratedImageActivationTarget retries until a target appears', async () => {
  let attempts = 0;
  const target = { id: 'late-target' };

  const resolved = await resolveGeneratedImageActivationTarget('view', {
    attempts: 3,
    delayMs: 0,
    resolveNodes() {
      attempts += 1;
      if (attempts < 3) {
        return {
          hostImage: null,
          hostButton: null,
          iframeImage: null,
          iframeButton: null,
        };
      }
      return {
        hostImage: target,
        hostButton: null,
        iframeImage: null,
        iframeButton: null,
      };
    },
  });

  assert.equal(attempts, 3);
  assert.equal(resolved, target);
});

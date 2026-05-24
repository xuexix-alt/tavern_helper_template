const test = require('node:test');
const assert = require('node:assert/strict');

const { selectGeneratedImageTriggerTarget } = require('../generatedImageTriggerTarget.ts');

test('regenerate prefers the plugin image button so native stableId metadata receives the click trigger', () => {
  const hostButton = { id: 'host-button' };
  const hostImage = { id: 'host-image' };

  assert.equal(
    selectGeneratedImageTriggerTarget(
      {
        hostButton,
        hostImage,
        hostMessageRoot: { id: 'host-message-root' },
        iframeButton: { id: 'iframe-button' },
        iframeImage: { id: 'iframe-image' },
      },
      'regenerate',
    ),
    hostButton,
  );
});

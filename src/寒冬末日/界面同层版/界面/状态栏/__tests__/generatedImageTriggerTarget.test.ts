const test = require('node:test');
const assert = require('node:assert/strict');

const { selectGeneratedImageTriggerTarget } = require('../generatedImageTriggerTarget.ts');

test('regenerate prefers the real image node over the prompt button so plugin preview click does not steal dblclick', () => {
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
    hostImage,
  );
});

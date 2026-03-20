const test = require('node:test');
const assert = require('node:assert/strict');

const { createHostTranscriptVisibilityController } = require('../hostTranscriptVisibility.ts');

test('host transcript visibility controller suspends and restores hide state with nesting support', () => {
  const controller = createHostTranscriptVisibilityController();

  assert.equal(controller.isSuspended(), false);

  const releaseA = controller.suspend();
  assert.equal(controller.isSuspended(), true);

  const releaseB = controller.suspend();
  assert.equal(controller.isSuspended(), true);

  releaseA();
  assert.equal(controller.isSuspended(), true);

  releaseB();
  assert.equal(controller.isSuspended(), false);
});

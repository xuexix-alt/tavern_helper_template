const test = require('node:test');
const assert = require('node:assert/strict');

const { createGeneratedImageGestureController } = require('../generatedImageGestureController.ts');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('touch double tap cancels the pending view and triggers regenerate once', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 80,
    longPressMs: 40,
    onView() {
      events.push('view');
    },
    onRegenerate() {
      events.push('regenerate');
    },
  });

  controller.handleTouchStart();
  await wait(10);
  controller.handleTouchEnd();
  await wait(30);
  controller.handleTouchStart();
  await wait(10);
  controller.handleTouchEnd();
  await wait(120);

  assert.deepEqual(events, ['regenerate']);
  controller.dispose();
});

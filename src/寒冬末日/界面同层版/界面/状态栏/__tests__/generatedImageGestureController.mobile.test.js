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

test('touch single tap keeps gallery and transcript images on the same view action', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 60,
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
  await wait(90);

  assert.deepEqual(events, ['view']);
  controller.dispose();
});

test('touch long press keeps gallery and transcript images on the same view action', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 60,
    longPressMs: 25,
    onView() {
      events.push('view');
    },
    onRegenerate() {
      events.push('regenerate');
    },
  });

  controller.handleTouchStart();
  await wait(40);
  controller.handleTouchEnd();
  await wait(80);

  assert.deepEqual(events, ['view']);
  controller.dispose();
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { createGeneratedImageGestureController } = require('../generatedImageGestureController');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('single click triggers view after delay', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 10,
    longPressMs: 20,
    onView() {
      events.push('view');
    },
    onRegenerate() {
      events.push('regenerate');
    },
  });

  controller.handleClick();
  await wait(20);

  assert.deepEqual(events, ['view']);
  controller.dispose();
});

test('double click cancels pending view and triggers regenerate', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 20,
    longPressMs: 20,
    onView() {
      events.push('view');
    },
    onRegenerate() {
      events.push('regenerate');
    },
  });

  controller.handleClick();
  controller.handleDoubleClick();
  await wait(30);

  assert.deepEqual(events, ['regenerate']);
  controller.dispose();
});

test('touch tap triggers view once on pointer up', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 10,
    longPressMs: 30,
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
  await wait(10);

  assert.deepEqual(events, ['view']);
  controller.dispose();
});

test('touch long press triggers view once and suppresses tap fallback', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 10,
    longPressMs: 15,
    onView() {
      events.push('view');
    },
    onRegenerate() {
      events.push('regenerate');
    },
  });

  controller.handleTouchStart();
  await wait(25);
  controller.handleTouchEnd();
  await wait(10);

  assert.deepEqual(events, ['view']);
  controller.dispose();
});

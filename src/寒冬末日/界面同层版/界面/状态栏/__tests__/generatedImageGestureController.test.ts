const test = require('node:test');
const assert = require('node:assert/strict');

const { createGeneratedImageGestureController } = require('../generatedImageGestureController.ts');

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

test('touch long press triggers tag once and suppresses tap fallback', async () => {
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
    onTag() {
      events.push('tag');
    },
  });

  controller.handleTouchStart();
  await wait(25);
  controller.handleTouchEnd();
  await wait(10);

  assert.deepEqual(events, ['tag']);
  controller.dispose();
});

test('double click within extended delay window still triggers regenerate', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 100,
    longPressMs: 20,
    onView() {
      events.push('view');
    },
    onRegenerate() {
      events.push('regenerate');
    },
  });

  controller.handleClick();
  await wait(50);
  controller.handleDoubleClick();
  await wait(30);

  assert.deepEqual(events, ['regenerate']);
  controller.dispose();
});

test('suppressClickUntil blocks duplicate ghost click after touch view', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 100,
    longPressMs: 20,
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
  controller.handleClick();
  await wait(120);

  assert.deepEqual(events, ['view']);
  controller.dispose();
});

test('touch movement beyond tap threshold does not trigger view or ghost click', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 10,
    longPressMs: 50,
    maxTapMovePx: 8,
    onView() {
      events.push('view');
    },
    onRegenerate() {
      events.push('regenerate');
    },
    onTag() {
      events.push('tag');
    },
  });

  controller.handleTouchStart({ clientX: 10, clientY: 10 });
  controller.handleTouchMove({ clientX: 11, clientY: 28 });
  controller.handleTouchEnd({ clientX: 11, clientY: 28 });
  controller.handleClick();
  await wait(30);

  assert.deepEqual(events, []);
  controller.dispose();
});

test('small touch movement still counts as a tap', async () => {
  const events = [];
  const controller = createGeneratedImageGestureController({
    clickDelayMs: 10,
    longPressMs: 50,
    maxTapMovePx: 8,
    onView() {
      events.push('view');
    },
    onRegenerate() {
      events.push('regenerate');
    },
  });

  controller.handleTouchStart({ clientX: 10, clientY: 10 });
  controller.handleTouchMove({ clientX: 13, clientY: 14 });
  controller.handleTouchEnd({ clientX: 13, clientY: 14 });
  await wait(20);

  assert.deepEqual(events, ['view']);
  controller.dispose();
});

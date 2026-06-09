const test = require('node:test');
const assert = require('node:assert/strict');

const { createImagePendingTaskManager } = require('../imagePendingTaskManager.ts');

test('imagePendingTaskManager can match response from DOM hint before request registration arrives', () => {
  let currentTime = 1_000;
  const manager = createImagePendingTaskManager({
    now: () => currentTime,
  });

  manager.registerHint({
    messageId: 4,
    requestId: 'req-1',
    prompt: 'Scene Composition:sfw,1girl',
  });

  const matched = manager.consumeResponse({
    id: 'req-1',
    prompt: 'Scene Composition:sfw,1girl',
    imageData: 'data:image/png;base64,abc',
  });

  assert.deepEqual(matched, {
    messageId: 4,
    requestId: 'req-1',
    prompt: 'Scene Composition:sfw,1girl',
    promptToken: 'image###Scene Composition:sfw,1girl###',
    imageData: 'data:image/png;base64,abc',
  });

  currentTime += 10;
  const requestBinding = manager.registerRequest({
    id: 'req-1',
    prompt: 'Scene Composition:sfw,1girl',
  });

  assert.equal(requestBinding?.messageId, 4);
});

test('imagePendingTaskManager flushes buffered response when plugin DOM hint arrives after response', () => {
  let currentTime = 2_000;
  const manager = createImagePendingTaskManager({
    now: () => currentTime,
  });

  assert.equal(
    manager.consumeResponse({
      id: 'req-late-hint',
      prompt: 'Scene Composition:sfw,1girl',
      imageData: 'data:image/png;base64,late',
    }),
    null,
  );

  currentTime += 10;
  const hintBinding = manager.registerHint({
    messageId: 8,
    requestId: 'req-late-hint',
    prompt: 'Scene Composition:sfw,1girl',
  });

  assert.deepEqual(hintBinding, {
    messageId: 8,
    bufferedResponse: {
      messageId: 8,
      requestId: 'req-late-hint',
      prompt: 'Scene Composition:sfw,1girl',
      promptToken: 'image###Scene Composition:sfw,1girl###',
      imageData: 'data:image/png;base64,late',
    },
  });
});

test('imagePendingTaskManager matches anonymous plugin ids by prompt hint', () => {
  let currentTime = 2_500;
  const manager = createImagePendingTaskManager({
    now: () => currentTime,
  });

  manager.registerHint({
    messageId: 12,
    requestId: 'undefined',
    prompt: 'Scene Composition:restaurant close-up',
  });

  currentTime += 10;
  const requestBinding = manager.registerRequest({
    id: 'undefined',
    prompt: 'Scene Composition:restaurant close-up',
  });
  assert.equal(requestBinding?.messageId, 12);

  const matched = manager.consumeResponse({
    id: 'undefined',
    prompt: 'Scene Composition:restaurant close-up',
    imageData: 'data:image/png;base64,anon',
  });

  assert.deepEqual(matched, {
    messageId: 12,
    requestId: '',
    prompt: 'Scene Composition:restaurant close-up',
    promptToken: 'image###Scene Composition:restaurant close-up###',
    imageData: 'data:image/png;base64,anon',
  });
});

test('imagePendingTaskManager prioritizes DOM hint messageId over an older collecting task', () => {
  let currentTime = 3_000;
  const manager = createImagePendingTaskManager({
    now: () => currentTime,
    collectingWindowMs: 10 * 60_000,
  });

  manager.startTask(3);

  currentTime += 100;
  manager.registerHint({
    messageId: 9,
    requestId: 'req-new-floor',
    prompt: 'Scene Composition:new floor',
  });

  const requestBinding = manager.registerRequest({
    id: 'req-new-floor',
    prompt: 'Scene Composition:new floor',
  });

  assert.equal(requestBinding?.messageId, 9);

  const matched = manager.consumeResponse({
    id: 'req-new-floor',
    prompt: 'Scene Composition:new floor',
    imageData: 'data:image/png;base64,new-floor',
  });

  assert.equal(matched?.messageId, 9);
});

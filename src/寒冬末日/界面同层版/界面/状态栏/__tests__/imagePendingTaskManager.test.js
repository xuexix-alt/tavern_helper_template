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

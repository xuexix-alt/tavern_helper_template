require('ts-node/register/transpile-only');

const { createImagePendingTaskManager } = require('../src/寒冬末日/界面同层版/界面/状态栏/imagePendingTaskManager.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const manager = createImagePendingTaskManager({
  now: (() => {
    let current = 1_000;
    return () => current;
  })(),
});

manager.startTask(6);
manager.registerRequest({ id: 'req-1', prompt: 'image###角色A###' });
manager.registerRequest({ id: 'req-2', prompt: 'image###角色B###' });

const resolvedById = manager.consumeResponse({
  id: 'req-2',
  prompt: 'image###角色B###',
  imageData: 'data:image/png;base64,bbb',
});

assertEqual(resolvedById?.messageId, 6, 'response should resolve back to original target message id');
assertEqual(resolvedById?.requestId, 'req-2', 'response should keep request id');

const resolvedByPrompt = manager.consumeResponse({
  id: 'req-x',
  prompt: 'image###角色A###',
  imageData: 'data:image/png;base64,aaa',
});

assertEqual(resolvedByPrompt?.messageId, 6, 'response should fallback to prompt match when request id is unknown');
assertEqual(resolvedByPrompt?.promptToken, 'image###角色A###', 'response should preserve prompt token');

let reverseNow = 2_000;
const reverseManager = createImagePendingTaskManager({
  now: () => reverseNow,
});

reverseManager.startTask(8);
const earlyResponse = reverseManager.consumeResponse({
  id: 'req-late',
  prompt: 'image###角色C###',
  imageData: 'data:image/png;base64,ccc',
});
assertEqual(earlyResponse, null, 'response arriving before request should be buffered instead of matched immediately');

const rebound = reverseManager.registerRequest({
  id: 'req-late',
  prompt: 'image###角色C###',
});
assertEqual(rebound?.messageId, 8, 'late request should still bind to original message id');
assertEqual(
  rebound?.bufferedResponse?.requestId,
  'req-late',
  'buffered response should be replayed once request arrives',
);

reverseNow += 5_000;
const secondEarlyResponse = reverseManager.consumeResponse({
  id: 'req-late-2',
  prompt: 'image###角色D###',
  imageData: 'data:image/png;base64,ddd',
});
assertEqual(secondEarlyResponse, null, 'later batch response should also be buffered when request is still late');

const secondRebound = reverseManager.registerRequest({
  id: 'req-late-2',
  prompt: 'image###角色D###',
});
assertEqual(
  secondRebound?.messageId,
  8,
  'same batch should continue binding later requests back to original message id even after the short collection window',
);
assertEqual(
  secondRebound?.bufferedResponse?.requestId,
  'req-late-2',
  'later buffered response should also be replayed once request arrives',
);

let slowNow = 5_000;
const slowLlmManager = createImagePendingTaskManager({
  now: () => slowNow,
});

slowLlmManager.startTask(9);
slowNow += 65_000;
const slowRequest = slowLlmManager.registerRequest({
  id: 'req-slow-llm',
  prompt: 'image###慢速LLM规划后的真实生图###',
});
assertEqual(slowRequest?.messageId, 9, 'request should still bind after slow plugin LLM image prompt generation');

console.log('image pending task manager test passed');

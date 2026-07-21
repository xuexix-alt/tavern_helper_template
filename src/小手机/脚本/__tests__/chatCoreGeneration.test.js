require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatGenerationController } = require('../聊天核心/chatGenerationController.ts');

test('aborted stale operation cannot clear or abort its replacement', () => {
  const generation = createChatGenerationController();

  const operationA = generation.start();
  assert.ok(operationA);
  assert.equal(generation.getStatus().isGenerating, true);

  generation.abort();
  assert.equal(operationA.signal.aborted, true);
  assert.equal(generation.getStatus().isGenerating, false);

  const operationB = generation.start();
  assert.ok(operationB);
  assert.notEqual(operationB, operationA);

  generation.finish(operationA);
  assert.equal(generation.getStatus().isGenerating, true);
  assert.equal(operationB.signal.aborted, false);

  generation.abort();
  assert.equal(operationB.signal.aborted, true);
  assert.equal(generation.getStatus().isGenerating, false);
});

test('stale operation token cannot clear the current operation', () => {
  const generation = createChatGenerationController();
  const staleOperation = generation.start();

  generation.abort();
  const currentOperation = generation.start();
  generation.finish(staleOperation);

  assert.equal(generation.getStatus().isGenerating, true);
  generation.abort();
  assert.equal(currentOperation.signal.aborted, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');
const source = fs.readFileSync(sourcePath, 'utf8');

function extractFunctionBody(text, functionName) {
  const start = text.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const parenStart = text.indexOf('(', start);
  assert.notEqual(parenStart, -1, `${functionName} should have a parameter list`);
  let parenDepth = 0;
  let searchStart = parenStart;
  for (let index = parenStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        searchStart = index + 1;
        break;
      }
    }
  }
  const braceStart = text.indexOf('{', searchStart);
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(braceStart + 1, index);
    }
  }
  throw new Error(`failed to extract ${functionName}`);
}

test('runGenerationFlow queues post-done MVU and lifecycle side effects per assistant message id', () => {
  const body = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(
    source,
    /import \{\s*createPostDoneSideEffectsQueue,\s*runQueuedHostMessageUpdate,\s*runQueuedPostDoneAssistantSideEffects,\s*\} from '\.\/postDoneSideEffectsQueue';/,
    'useStreamingDemo should import the post-done side effect queue and assistant helper',
  );
  assert.match(
    source,
    /const postDoneSideEffectsQueue = createPostDoneSideEffectsQueue\(\);/,
    'useStreamingDemo should create one queue instance for done-side effects',
  );
  assert.match(
    body,
    /await runQueuedPostDoneAssistantSideEffects\(\{/,
    'done-side effect orchestration should live in the dedicated post-done helper',
  );
  assert.match(
    body,
    /queue: postDoneSideEffectsQueue,[\s\S]*messageId: finalizedAssistantMessageId,[\s\S]*reprocessMessageVariablesById,[\s\S]*emitOfficialGenerationLifecycle,/,
    'runGenerationFlow should pass the real MVU and lifecycle dependencies into the helper',
  );
  assert.match(
    body,
    /const finalizedAssistantMessageId = assistantMessageId\.value;/,
    'done side effects should use one stable assistant message id snapshot',
  );
});

test('host message writes and image refreshes enter the post-done queue by message id', () => {
  const patchBody = extractFunctionBody(source, 'patchAssistantMessage');
  const imageTriggerBody = extractFunctionBody(source, 'triggerImageGenerationForMessage');
  const imageRefreshBody = extractFunctionBody(source, 'queueGeneratedImageEntityRefresh');

  assert.match(
    source,
    /import \{\s*createPostDoneSideEffectsQueue,\s*runQueuedHostMessageUpdate,\s*runQueuedPostDoneAssistantSideEffects,\s*\} from '\.\/postDoneSideEffectsQueue';/,
    'useStreamingDemo should import the host message update queue helper',
  );
  assert.match(
    patchBody,
    /await runQueuedHostMessageUpdate\(\{[\s\S]*queue: postDoneSideEffectsQueue,[\s\S]*messageId,[\s\S]*stage: 'host-message-update',[\s\S]*setChatMessages\(/,
    'assistant message setChatMessages commits should run through the post-done queue',
  );
  assert.match(
    imageTriggerBody,
    /await runQueuedHostMessageUpdate\(\{[\s\S]*queue: postDoneSideEffectsQueue,[\s\S]*messageId: normalizedId,[\s\S]*stage: 'auto-image',[\s\S]*withHostTranscriptVisible/,
    'image trigger host visibility and mes_text preparation should run through the same message queue',
  );
  assert.match(
    imageRefreshBody,
    /runQueuedHostMessageUpdate\(\{[\s\S]*queue: postDoneSideEffectsQueue,[\s\S]*messageId,[\s\S]*stage: 'image-refresh',[\s\S]*bumpGeneratedImageEntityRevision\(messageId\)/,
    'plugin-native image ready refreshes should run through the same message queue',
  );
});

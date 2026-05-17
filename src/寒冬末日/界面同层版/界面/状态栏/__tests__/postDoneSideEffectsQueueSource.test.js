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

test('runGenerationFlow queues post-done official lifecycle side effects per assistant message id', () => {
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
    /queue: postDoneSideEffectsQueue,[\s\S]*messageId: finalizedAssistantMessageId,[\s\S]*emitOfficialGenerationLifecycle,[\s\S]*waitForNativeMvuMessageWriteback,/,
    'runGenerationFlow should pass the official lifecycle and native MVU writeback dependencies into the helper',
  );
  assert.doesNotMatch(
    body,
    /runQueuedPostDoneAssistantSideEffects\(\{[\s\S]*reprocessMessageVariablesById/,
    'normal post-done flow should not manually call Mvu.parseMessage before the official lifecycle',
  );
  assert.match(
    source,
    /async function waitForNativeMvuMessageWriteback\(/,
    'same-layer should wait for native MVU extra-analysis text writeback after the official lifecycle',
  );
  assert.match(
    source,
    /Mvu\.events\.BEFORE_MESSAGE_UPDATE/,
    'native MVU message writeback should be captured from the before-message-update event',
  );
  assert.match(
    body,
    /const finalizedAssistantMessageId = assistantMessageId\.value;/,
    'done side effects should use one stable assistant message id snapshot',
  );
});

test('emitOfficialGenerationLifecycle mirrors native Tavern assistant event order', () => {
  const body = extractFunctionBody(source, 'emitOfficialGenerationLifecycle');
  const generationEndedIndex = body.indexOf('eventEmit(tavern_events.GENERATION_ENDED');
  const messageReceivedIndex = body.indexOf('eventEmit(tavern_events.MESSAGE_RECEIVED');
  const messageUpdatedIndex = body.indexOf('eventEmit(tavern_events.MESSAGE_UPDATED');

  assert.notEqual(generationEndedIndex, -1, 'same-layer should emit GENERATION_ENDED for native plugin consumers');
  assert.notEqual(messageReceivedIndex, -1, 'same-layer should emit MESSAGE_RECEIVED after generation end');
  assert.notEqual(messageUpdatedIndex, -1, 'same-layer should emit MESSAGE_UPDATED after message receipt');
  assert.ok(
    generationEndedIndex < messageReceivedIndex && messageReceivedIndex < messageUpdatedIndex,
    'same-layer lifecycle should follow native Tavern order: GENERATION_ENDED -> MESSAGE_RECEIVED -> MESSAGE_UPDATED',
  );
});

test('host message writes and image trigger preparation enter the post-done queue by message id', () => {
  const patchBody = extractFunctionBody(source, 'patchAssistantMessage');
  const imageTriggerBody = extractFunctionBody(source, 'triggerImageGenerationForMessage');

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
});

test('image mutation debounce accumulates message ids instead of keeping only the last mutation batch', () => {
  const imageRefreshBody = extractFunctionBody(source, 'queueGeneratedImageEntityRefresh');

  assert.match(
    source,
    /const pendingGeneratedImageRefreshMessageIds = new Set<number>\(\);/,
    'image refresh debounce should keep a shared pending id set across rapid plugin DOM mutations',
  );
  assert.match(
    imageRefreshBody,
    /normalizedMessageIds\.forEach\(id => pendingGeneratedImageRefreshMessageIds\.add\(id\)\);/,
    'each mutation batch should merge its ids into the pending set before resetting the debounce timer',
  );
  assert.match(
    imageRefreshBody,
    /const pendingMessageIds = \[\.\.\.pendingGeneratedImageRefreshMessageIds\];[\s\S]*pendingGeneratedImageRefreshMessageIds\.clear\(\);/,
    'the queued refresh should consume the accumulated ids once the debounce fires',
  );
  assert.doesNotMatch(
    imageRefreshBody,
    /if \(normalizedMessageIds\.length === 0\) \{[\s\S]*bumpGeneratedImageEntityRevision\(\);[\s\S]*return;/,
    'a trailing empty mutation batch must not discard earlier message ids and skip transcript refresh',
  );
});

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
  assert.match(
    body,
    /const shouldWaitForPluginNativeHandoff =[\s\S]*collectChatu8PromptTokens\(messageText\)\.length > 0[\s\S]*isChatu8AutoLlmImageGenerationEnabled\(\);/,
    'same-layer should wait for st-chatu8 handoff both for existing image### prompts and for autoLLMImageGen plugin handoff',
  );
  assert.match(
    body,
    /if \(shouldWaitForPluginNativeHandoff\) \{[\s\S]*await waitForPluginImageGenerationHandoff\(Math\.trunc\(normalizedId\)\);/,
    'the official lifecycle should keep the host message available until plugin-native handoff is observed or times out',
  );
  assert.match(
    source,
    /function collectPluginNativeHandoffDiagnostics\(messageId: number\)/,
    'same-layer should expose a compact diagnostic snapshot for plugin-native handoff failures',
  );
  assert.match(
    body,
    /collectPluginNativeHandoffDiagnostics\(Math\.trunc\(normalizedId\)\)/,
    'official lifecycle traces should include the host/plugin diagnostic snapshot around the handoff boundary',
  );
});

test('runGenerationFlow primes native autoLLMClick before same-layer generate call', () => {
  const body = extractFunctionBody(source, 'runGenerationFlow');
  const startLifecycleIndex = body.indexOf('await emitOfficialGenerationStartLifecycle');
  const generateCallIndex = body.indexOf('const generatePromise = generate(');
  const detachedPlaceholderIndex = body.indexOf("await ensureAssistantPlaceholderReady('first_token')");

  assert.notEqual(
    source.indexOf('async function emitOfficialGenerationStartLifecycle'),
    -1,
    'same-layer should have a dedicated GENERATION_STARTED lifecycle shim for native plugin consumers',
  );
  assert.notEqual(startLifecycleIndex, -1, 'same-layer should emit host GENERATION_STARTED during runGenerationFlow');
  assert.notEqual(generateCallIndex, -1, 'same-layer should call generate() after preparation');
  assert.ok(
    startLifecycleIndex < generateCallIndex,
    'st-chatu8 autoLLMClick must see GENERATION_STARTED before the assistant message/swipe is produced',
  );
  assert.notEqual(
    detachedPlaceholderIndex,
    -1,
    'detached opening generation should still create a stable assistant placeholder',
  );
  assert.ok(
    startLifecycleIndex < detachedPlaceholderIndex,
    'st-chatu8 autoLLMClick snapshots chat length on GENERATION_STARTED, so detached assistant placeholders must be created after that event',
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
    /await runQueuedHostMessageUpdate\(\{[\s\S]*queue: postDoneSideEffectsQueue,[\s\S]*messageId: normalizedId,[\s\S]*stage: 'auto-image',[\s\S]*withPluginNativeMessageLease/,
    'image trigger host message lease and mes_text preparation should run through the same message queue',
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

test('plugin-native handoff wait records probe diagnostics before timing out', () => {
  const body = extractFunctionBody(source, 'waitForPluginImageGenerationHandoff');

  assert.match(
    body,
    /const probeDelaysMs = \[0, 400, 1200, 2400, 3600, 7500, 15000, 30000, 60000\] as const;/,
    'handoff wait should probe a bounded set of timings instead of logging every poll',
  );
  assert.match(
    body,
    /recordLifecycleTrace\('imageGenerationHandoff', 'probe'[\s\S]*collectPluginNativeHandoffDiagnostics\(normalizedId\)/,
    'handoff wait probes should include DOM/chat/plugin diagnostics',
  );
  assert.match(
    body,
    /recordLifecycleTrace\('imageGenerationHandoff', 'timeout'[\s\S]*diagnostics: collectPluginNativeHandoffDiagnostics\(normalizedId\)/,
    'handoff timeout should carry a final diagnostic snapshot',
  );
});

test('plugin-native handoff wait follows st-chatu8 LLM image-generation stage before releasing host DOM', () => {
  const waitBody = extractFunctionBody(source, 'waitForPluginImageGenerationHandoff');
  const bindBody = extractFunctionBody(source, 'bindPluginNativeLlmImageGenerationEvents');

  assert.match(
    source,
    /const CHATU8_LLM_IMAGE_GEN_REQUEST_EVENT = 'ch-llm-image-gen-request';/,
    'same-layer should know the st-chatu8 LLM-image request event that precedes image### placeholder insertion',
  );
  assert.match(
    source,
    /const activePluginNativeLlmImageGenerationRequests = new Set<string>\(\);/,
    'same-layer should track active st-chatu8 LLM-image requests while waiting for handoff',
  );
  assert.match(
    bindBody,
    /eventOn\(CHATU8_LLM_IMAGE_GEN_REQUEST_EVENT as any,[\s\S]*markPluginNativeLlmImageGenerationStarted/,
    'same-layer should mark the plugin LLM-image stage as active when st-chatu8 starts rewriting the story into image tags',
  );
  assert.match(
    bindBody,
    /eventOn\(CHATU8_LLM_IMAGE_GEN_RESPONSE_EVENT as any,[\s\S]*markPluginNativeLlmImageGenerationFinished/,
    'same-layer should clear the active LLM-image stage after st-chatu8 receives the rewritten image tags',
  );
  assert.match(
    waitBody,
    /shouldContinuePluginNativeHandoffWait\(shortDeadline, extendedDeadline\)/,
    'handoff wait should use the stage-aware wait contract instead of a fixed short DOM placeholder timeout',
  );
  assert.match(
    source,
    /const IMAGE_GENERATION_LLM_RESPONSE_HANDOFF_GRACE_MS = 8000;/,
    'same-layer should keep the host DOM leased briefly after the st-chatu8 LLM response while image tags are inserted',
  );
  assert.match(
    source,
    /Date\.now\(\) - lastPluginNativeLlmImageGenerationSettledAt < IMAGE_GENERATION_LLM_RESPONSE_HANDOFF_GRACE_MS/,
    'handoff wait should not release immediately when the LLM-image response fires before plugin DOM/message insertion finishes',
  );
});

test('plugin-native request bridge records request and response binding diagnostics', () => {
  assert.match(
    source,
    /recordLifecycleTrace\('imageGenerationEventBridge', 'on_request'[\s\S]*requestBinding[\s\S]*collectPluginNativeHandoffDiagnostics/,
    'generate-image-request should log whether the request was bound to a target message',
  );
  assert.match(
    source,
    /recordLifecycleTrace\('imageGenerationEventBridge', 'on_response_success'[\s\S]*matchedResponse[\s\S]*targetMessageIds[\s\S]*collectPluginNativeHandoffDiagnostics/,
    'generate-image-response should log matched response and target message diagnostics',
  );
});

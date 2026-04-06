const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAssistantRenderSource,
  buildDemoAssistantFinalBodySource,
  buildDebugMessageSignature,
  createGenerationListenerEpochController,
  resolveAssistantDisplayRenderSource,
  resolveTranscriptRole,
  shouldCreateAssistantPlaceholderOnFirstToken,
  shouldEnsureAssistantPlaceholderBeforeFinalize,
  shouldPrewarmHostMesTextAfterPatch,
  shouldSuppressLifecycleEchoHostRefresh,
  summarizeTranscriptForDebug,
  shouldIgnoreHostRefreshDuringBusy,
} = require('../debugTraceLifecycle.ts');

test('buildDebugMessageSignature is stable for identical content and changes when text changes', () => {
  const first = buildDebugMessageSignature('alpha beta gamma');
  const second = buildDebugMessageSignature('alpha beta gamma');
  const third = buildDebugMessageSignature('alpha beta gamma!');

  assert.equal(first, second);
  assert.notEqual(first, third);
});

test('summarizeTranscriptForDebug keeps compact assistant snapshots', () => {
  const summary = summarizeTranscriptForDebug([
    {
      message_id: 1,
      role: 'user',
      raw: 'user',
      phase: 'done',
    },
    {
      message_id: 2,
      role: 'assistant',
      raw: 'first assistant reply',
      phase: 'stream',
    },
    {
      message_id: 3,
      role: 'assistant',
      raw: 'second assistant reply',
      phase: 'done',
    },
  ]);

  assert.deepEqual(summary, [
    {
      messageId: 2,
      role: 'assistant',
      phase: 'stream',
      signature: buildDebugMessageSignature('first assistant reply'),
    },
    {
      messageId: 3,
      role: 'assistant',
      phase: 'done',
      signature: buildDebugMessageSignature('second assistant reply'),
    },
  ]);
});

test('shouldIgnoreHostRefreshDuringBusy only suppresses busy token-like events', () => {
  assert.equal(
    shouldIgnoreHostRefreshDuringBusy({
      busy: true,
      eventName: 'STREAM_TOKEN_RECEIVED',
      generationStartedEventName: 'GENERATION_STARTED',
      generationEndedEventName: 'GENERATION_ENDED',
      streamTokenEventName: 'STREAM_TOKEN_RECEIVED',
      smoothStreamTokenEventName: 'SMOOTH_STREAM_TOKEN_RECEIVED',
    }),
    true,
  );

  assert.equal(
    shouldIgnoreHostRefreshDuringBusy({
      busy: true,
      eventName: 'MESSAGE_RECEIVED',
      generationStartedEventName: 'GENERATION_STARTED',
      generationEndedEventName: 'GENERATION_ENDED',
      streamTokenEventName: 'STREAM_TOKEN_RECEIVED',
      smoothStreamTokenEventName: 'SMOOTH_STREAM_TOKEN_RECEIVED',
    }),
    false,
  );

  assert.equal(
    shouldIgnoreHostRefreshDuringBusy({
      busy: false,
      eventName: 'STREAM_TOKEN_RECEIVED',
      generationStartedEventName: 'GENERATION_STARTED',
      generationEndedEventName: 'GENERATION_ENDED',
      streamTokenEventName: 'STREAM_TOKEN_RECEIVED',
      smoothStreamTokenEventName: 'SMOOTH_STREAM_TOKEN_RECEIVED',
    }),
    false,
  );

  assert.equal(
    shouldIgnoreHostRefreshDuringBusy({
      busy: true,
      eventName: 'GENERATION_ENDED',
      generationStartedEventName: 'GENERATION_STARTED',
      generationEndedEventName: 'GENERATION_ENDED',
      streamTokenEventName: 'STREAM_TOKEN_RECEIVED',
      smoothStreamTokenEventName: 'SMOOTH_STREAM_TOKEN_RECEIVED',
    }),
    true,
  );
});

test('createGenerationListenerEpochController invalidates stale listeners after a new generation bind', () => {
  const controller = createGenerationListenerEpochController();
  const firstEpoch = controller.activateNext();
  const secondEpoch = controller.activateNext();

  assert.equal(controller.isCurrent(firstEpoch), false);
  assert.equal(controller.isCurrent(secondEpoch), true);

  controller.invalidate();
  assert.equal(controller.isCurrent(secondEpoch), false);
});

test('buildDemoAssistantFinalBodySource prefers extracted content over stripped raw wrapper text', () => {
  assert.equal(
    buildDemoAssistantFinalBodySource({
      content: '真正正文',
      strippedRenderSource: '</thinking>\n真正正文\n[metacognition]',
    }),
    '真正正文',
  );

  assert.equal(
    buildDemoAssistantFinalBodySource({
      content: '',
      strippedRenderSource: '兜底正文',
    }),
    '兜底正文',
  );
});

test('buildAssistantRenderSource prefers extracted opening content for structured non-stream assistants', () => {
  assert.equal(
    buildAssistantRenderSource({
      isDemoAssistant: false,
      hasStructuredContent: true,
      content: '窗外的天空呈现出一种病态的铅灰色。',
      strippedRenderSource: '[metacognition]\\n<content>窗外的天空呈现出一种病态的铅灰色。</content>\\n<option>A</option>',
    }),
    '窗外的天空呈现出一种病态的铅灰色。',
  );
});

test('resolveAssistantDisplayRenderSource keeps full structured assistant source for tavern beautification', () => {
  assert.equal(
    resolveAssistantDisplayRenderSource({
      isDemoAssistant: false,
      hasStructuredContent: true,
      renderSource: '窗外的天空呈现出一种病态的铅灰色。',
      strippedRenderSource:
        '[metacognition]\n<content>窗外的天空呈现出一种病态的铅灰色。</content>\n<option>【A】观察</option>\n<UpdateVariable><Analysis>...</Analysis></UpdateVariable>',
    }),
    '[metacognition]\n<content>窗外的天空呈现出一种病态的铅灰色。</content>\n<option>【A】观察</option>\n<UpdateVariable><Analysis>...</Analysis></UpdateVariable>',
  );
});

test('resolveTranscriptRole forces opening result floors to render as assistant even if host role drifts', () => {
  assert.equal(
    resolveTranscriptRole({
      rawRole: 'system',
      rawMessage: '',
      isOpeningResult: true,
    }),
    'assistant',
  );

  assert.equal(
    resolveTranscriptRole({
      rawRole: 'system',
      rawMessage: '',
      isOpeningResult: false,
    }),
    'system',
  );
});

test('resolveTranscriptRole forces stream-demo wrapped floors to render as assistant even if host role drifts', () => {
  assert.equal(
    resolveTranscriptRole({
      rawRole: 'system',
      rawMessage: '[stream-demo:minimal]\n<demo_phase>done</demo_phase>\n<content>正文</content>',
      isOpeningResult: false,
    }),
    'assistant',
  );
});

test('shouldSuppressLifecycleEchoHostRefresh only ignores configured host echoes inside the suppress window', () => {
  assert.equal(
    shouldSuppressLifecycleEchoHostRefresh({
      eventName: 'MESSAGE_RECEIVED',
      nowMs: 1000,
      suppressUntilMs: 1200,
      suppressedEventNames: ['MESSAGE_RECEIVED', 'GENERATION_ENDED', 'MESSAGE_UPDATED'],
    }),
    true,
  );

  assert.equal(
    shouldSuppressLifecycleEchoHostRefresh({
      eventName: 'MESSAGE_RECEIVED',
      nowMs: 1301,
      suppressUntilMs: 1200,
      suppressedEventNames: ['MESSAGE_RECEIVED', 'GENERATION_ENDED', 'MESSAGE_UPDATED'],
    }),
    false,
  );

  assert.equal(
    shouldSuppressLifecycleEchoHostRefresh({
      eventName: 'MESSAGE_SENT',
      nowMs: 1000,
      suppressUntilMs: 1200,
      suppressedEventNames: ['MESSAGE_RECEIVED', 'GENERATION_ENDED', 'MESSAGE_UPDATED'],
    }),
    false,
  );
});

test('shouldCreateAssistantPlaceholderOnFirstToken only allows deferred creation for the first real token', () => {
  assert.equal(
    shouldCreateAssistantPlaceholderOnFirstToken({
      assistantMessageId: null,
      placeholderCreating: false,
      token: 'A',
    }),
    true,
  );

  assert.equal(
    shouldCreateAssistantPlaceholderOnFirstToken({
      assistantMessageId: 12,
      placeholderCreating: false,
      token: 'A',
    }),
    false,
  );

  assert.equal(
    shouldCreateAssistantPlaceholderOnFirstToken({
      assistantMessageId: null,
      placeholderCreating: true,
      token: 'A',
    }),
    false,
  );
});

test('shouldEnsureAssistantPlaceholderBeforeFinalize adds a fallback placeholder only when finalize has content and none exists', () => {
  assert.equal(
    shouldEnsureAssistantPlaceholderBeforeFinalize({
      assistantMessageId: null,
      placeholderCreating: false,
      finalText: 'final reply',
    }),
    true,
  );

  assert.equal(
    shouldEnsureAssistantPlaceholderBeforeFinalize({
      assistantMessageId: 12,
      placeholderCreating: false,
      finalText: 'final reply',
    }),
    false,
  );

  assert.equal(
    shouldEnsureAssistantPlaceholderBeforeFinalize({
      assistantMessageId: null,
      placeholderCreating: false,
      finalText: '   ',
    }),
    false,
  );
});

test('shouldPrewarmHostMesTextAfterPatch prewarms once for stream and always for done when assistant exists', () => {
  assert.equal(
    shouldPrewarmHostMesTextAfterPatch({
      phase: 'stream',
      assistantMessageId: 14,
      hostMesTextPrimed: false,
    }),
    true,
  );

  assert.equal(
    shouldPrewarmHostMesTextAfterPatch({
      phase: 'stream',
      assistantMessageId: 14,
      hostMesTextPrimed: true,
    }),
    false,
  );

  assert.equal(
    shouldPrewarmHostMesTextAfterPatch({
      phase: 'done',
      assistantMessageId: 14,
      hostMesTextPrimed: true,
    }),
    true,
  );

  assert.equal(
    shouldPrewarmHostMesTextAfterPatch({
      phase: 'done',
      assistantMessageId: null,
      hostMesTextPrimed: false,
    }),
    false,
  );
});

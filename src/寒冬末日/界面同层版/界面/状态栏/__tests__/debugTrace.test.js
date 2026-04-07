const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDebugTraceStore,
  createTraceId,
  installDebugTraceRuntime,
  recordDebugTrace,
} = require('../debugTrace.ts');

test('debugTrace does not record events when disabled', () => {
  const runtime = installDebugTraceRuntime({
    enabled: false,
    maxEvents: 5,
    target: {},
  });

  recordDebugTrace(runtime, {
    scope: 'runGenerationFlow',
    event: 'generation.start',
  });

  assert.equal(runtime.events.length, 0);
  assert.equal(runtime.groupByTrace().size, 0);
});

test('debugTrace records bounded events and groups them by trace id', () => {
  const runtime = installDebugTraceRuntime({
    enabled: true,
    maxEvents: 2,
    target: {},
  });
  const traceId = createTraceId('send');

  recordDebugTrace(runtime, {
    traceId,
    scope: 'runGenerationFlow',
    event: 'generation.start',
    payload: { messageId: 1, prompt: 'hello world' },
  });
  recordDebugTrace(runtime, {
    traceId,
    scope: 'patchAssistantMessage',
    event: 'generation.patch',
    payload: { messageId: 2, phase: 'stream' },
  });
  recordDebugTrace(runtime, {
    traceId,
    scope: 'rebuildTranscript',
    event: 'transcript.rebuild',
    payload: { count: 3 },
  });

  assert.equal(runtime.events.length, 2);
  assert.equal(runtime.events[0].event, 'generation.patch');
  assert.equal(runtime.events[1].event, 'transcript.rebuild');

  const grouped = runtime.groupByTrace();
  assert.equal(grouped.get(traceId)?.length, 2);
});

test('installDebugTraceRuntime exposes reusable runtime API on target object', () => {
  const target = {};
  const runtime = installDebugTraceRuntime({
    enabled: true,
    maxEvents: 3,
    target,
  });

  assert.equal(target.__STREAM_DEMO_DEBUG__, runtime);
  assert.equal(typeof runtime.clear, 'function');
  assert.equal(typeof runtime.groupByTrace, 'function');

  recordDebugTrace(runtime, {
    traceId: 'trace-1',
    scope: 'handleHostRefreshEvent',
    event: 'host.refresh',
  });
  assert.equal(runtime.events.length, 1);

  runtime.clear();
  assert.equal(runtime.events.length, 0);
});

test('createDebugTraceStore reads enabled flag from target runtime hint', () => {
  const target = {
    __STREAM_DEMO_DEBUG__: {
      enabled: true,
    },
  };

  const runtime = createDebugTraceStore({
    target,
    maxEvents: 4,
  });

  recordDebugTrace(runtime, {
    traceId: 'trace-2',
    scope: 'bindGenerationEvents',
    event: 'iframe.token',
  });

  assert.equal(runtime.enabled, true);
  assert.equal(runtime.events.length, 1);
});

test('debugTrace summarizes component activity by scope and message id', () => {
  const runtime = installDebugTraceRuntime({
    enabled: true,
    maxEvents: 10,
    target: {},
  });

  recordDebugTrace(runtime, {
    traceId: 'trace-component',
    scope: 'TranscriptMessageCard',
    event: 'mount',
    payload: {
      debugKind: 'component_activity',
      messageId: 7,
      variant: 'assistant',
    },
  });
  recordDebugTrace(runtime, {
    traceId: 'trace-component',
    scope: 'TranscriptMessageCard',
    event: 'update',
    payload: {
      debugKind: 'component_activity',
      messageId: 7,
      variant: 'assistant',
    },
  });
  recordDebugTrace(runtime, {
    traceId: 'trace-component',
    scope: 'GeneratedImageAsset',
    event: 'resolve_source',
    payload: {
      debugKind: 'component_activity',
      messageId: 7,
      variant: 'gallery',
    },
  });

  const summary = runtime.summarizeComponentActivity();
  assert.equal(Array.isArray(summary), true);

  const transcriptRow = summary.find(entry => entry.scope === 'TranscriptMessageCard' && entry.messageId === 7);
  assert.ok(transcriptRow);
  assert.equal(transcriptRow.mounts, 1);
  assert.equal(transcriptRow.updates, 1);
  assert.equal(transcriptRow.totalEvents, 2);

  const imageRow = summary.find(entry => entry.scope === 'GeneratedImageAsset' && entry.messageId === 7);
  assert.ok(imageRow);
  assert.equal(imageRow.effects, 1);
  assert.equal(imageRow.totalEvents, 1);
});

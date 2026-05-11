const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPostDoneSideEffectsQueue,
  PostDoneSideEffectTimeoutError,
  runQueuedHostMessageUpdate,
  runQueuedPostDoneAssistantSideEffects,
} = require('../postDoneSideEffectsQueue.ts');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settleMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test('post-done side effects for the same message id run one at a time in enqueue order', async () => {
  const queue = createPostDoneSideEffectsQueue();
  const firstGate = deferred();
  const order = [];
  let active = 0;
  let maxActive = 0;

  const first = queue.enqueue(12, 'mvu', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push('mvu:start');
    await firstGate.promise;
    order.push('mvu:end');
    active -= 1;
    return 'mvu';
  });

  const second = queue.enqueue(12, 'lifecycle', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push('lifecycle:start');
    order.push('lifecycle:end');
    active -= 1;
    return 'lifecycle';
  });

  await settleMicrotasks();
  assert.deepEqual(order, ['mvu:start']);

  firstGate.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['mvu', 'lifecycle']);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['mvu:start', 'mvu:end', 'lifecycle:start', 'lifecycle:end']);
});

test('post-done side effects for different message ids may run concurrently', async () => {
  const queue = createPostDoneSideEffectsQueue();
  const firstGate = deferred();
  const secondGate = deferred();
  const order = [];
  let active = 0;
  let maxActive = 0;

  const first = queue.enqueue(12, 'mvu', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push('message-12:start');
    await firstGate.promise;
    order.push('message-12:end');
    active -= 1;
  });

  const second = queue.enqueue(13, 'mvu', async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push('message-13:start');
    await secondGate.promise;
    order.push('message-13:end');
    active -= 1;
  });

  await settleMicrotasks();
  assert.deepEqual(order, ['message-12:start', 'message-13:start']);
  assert.equal(maxActive, 2);

  firstGate.resolve();
  secondGate.resolve();
  await Promise.all([first, second]);
});

test('runQueuedPostDoneAssistantSideEffects runs MVU reprocess before lifecycle for one assistant message', async () => {
  const queue = createPostDoneSideEffectsQueue();
  const mvuGate = deferred();
  const order = [];
  const traceEntries = [];
  const reprocessCalls = [];

  const run = runQueuedPostDoneAssistantSideEffects({
    queue,
    messageId: 12,
    lifecycleKind: 'normal',
    traceId: 'trace-1',
    reprocessMessageVariablesById: async (messageId, options) => {
      reprocessCalls.push({ messageId, options });
      order.push('mvu:start');
      await mvuGate.promise;
      order.push('mvu:end');
      return { status: 'applied' };
    },
    emitOfficialGenerationLifecycle: async (messageId, kind) => {
      order.push(`lifecycle:${messageId}:${kind}`);
    },
    recordLifecycleTrace: (scope, event, payload, traceId) => {
      traceEntries.push({ scope, event, payload, traceId });
    },
    warn: () => {
      throw new Error('warn should not be called for an applied reprocess');
    },
  });

  await settleMicrotasks();
  assert.deepEqual(order, ['mvu:start']);

  mvuGate.resolve();
  await run;

  assert.deepEqual(order, ['mvu:start', 'mvu:end', 'lifecycle:12:normal']);
  assert.deepEqual(reprocessCalls, [
    {
      messageId: 12,
      options: { force: true, refreshMessage: true },
    },
  ]);
  assert.deepEqual(traceEntries, [
    {
      scope: 'runGenerationFlow',
      event: 'mvu_reprocess_completed',
      payload: {
        assistantMessageId: 12,
        reprocessStatus: 'applied',
      },
      traceId: 'trace-1',
    },
  ]);
});

test('runQueuedHostMessageUpdate waits for earlier post-done stages for the same message', async () => {
  const queue = createPostDoneSideEffectsQueue();
  const mvuGate = deferred();
  const order = [];

  const mvu = queue.enqueue(12, 'mvu', async () => {
    order.push('mvu:start');
    await mvuGate.promise;
    order.push('mvu:end');
  });

  const hostUpdate = runQueuedHostMessageUpdate({
    queue,
    messageId: 12,
    stage: 'host-message-update',
    task: async () => {
      order.push('host-update');
      return 'updated';
    },
  });

  await settleMicrotasks();
  assert.deepEqual(order, ['mvu:start']);

  mvuGate.resolve();
  assert.deepEqual(await Promise.all([mvu, hostUpdate]), [undefined, 'updated']);
  assert.deepEqual(order, ['mvu:start', 'mvu:end', 'host-update']);
});

test('timed out stages release the same message queue for later stages', async () => {
  const queue = createPostDoneSideEffectsQueue({
    stageTimeoutMs: {
      mvu: 5,
    },
  });
  const order = [];

  const stuck = queue.enqueue(12, 'mvu', async () => {
    order.push('mvu:start');
    await new Promise(() => {});
  });

  const hostUpdate = runQueuedHostMessageUpdate({
    queue,
    messageId: 12,
    stage: 'host-message-update',
    task: async () => {
      order.push('host-update');
      return 'updated';
    },
  });

  await assert.rejects(stuck, error => {
    assert.ok(error instanceof PostDoneSideEffectTimeoutError);
    assert.equal(error.messageId, 12);
    assert.equal(error.stage, 'mvu');
    return true;
  });
  assert.equal(await hostUpdate, 'updated');
  assert.deepEqual(order, ['mvu:start', 'host-update']);
  assert.equal(queue.isBusy(12), false);
});

test('post-done assistant timeout records a warning and continues to lifecycle', async () => {
  const queue = createPostDoneSideEffectsQueue({
    stageTimeoutMs: {
      mvu: 5,
      lifecycle: 100,
    },
  });
  const order = [];
  const traceEntries = [];
  const warnings = [];

  await runQueuedPostDoneAssistantSideEffects({
    queue,
    messageId: 12,
    lifecycleKind: 'normal',
    traceId: 'trace-timeout',
    reprocessMessageVariablesById: async () => {
      order.push('mvu:start');
      await new Promise(() => {});
      return { status: 'applied' };
    },
    emitOfficialGenerationLifecycle: async (messageId, kind) => {
      order.push(`lifecycle:${messageId}:${kind}`);
    },
    recordLifecycleTrace: (scope, event, payload, traceId) => {
      traceEntries.push({ scope, event, payload, traceId });
    },
    warn: (message, detail) => {
      warnings.push({ message, detail });
    },
  });

  assert.deepEqual(order, ['mvu:start', 'lifecycle:12:normal']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /timed out/);
  assert.deepEqual(traceEntries, [
    {
      scope: 'runGenerationFlow',
      event: 'mvu_reprocess_timeout',
      payload: {
        assistantMessageId: 12,
        stage: 'mvu',
      },
      traceId: 'trace-timeout',
    },
  ]);
});

test('post-done assistant lifecycle timeout is recorded without failing finalization', async () => {
  const queue = createPostDoneSideEffectsQueue({
    stageTimeoutMs: {
      lifecycle: 5,
    },
  });
  const traceEntries = [];
  const warnings = [];

  await runQueuedPostDoneAssistantSideEffects({
    queue,
    messageId: 12,
    lifecycleKind: 'normal',
    traceId: 'trace-lifecycle-timeout',
    reprocessMessageVariablesById: async () => ({ status: 'applied' }),
    emitOfficialGenerationLifecycle: async () => {
      await new Promise(() => {});
    },
    recordLifecycleTrace: (scope, event, payload, traceId) => {
      traceEntries.push({ scope, event, payload, traceId });
    },
    warn: (message, detail) => {
      warnings.push({ message, detail });
    },
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /lifecycle timed out/);
  assert.deepEqual(traceEntries.at(-1), {
    scope: 'runGenerationFlow',
    event: 'lifecycle_timeout',
    payload: {
      assistantMessageId: 12,
      stage: 'lifecycle',
    },
    traceId: 'trace-lifecycle-timeout',
  });
  assert.equal(queue.isBusy(12), false);
});

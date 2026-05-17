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

test('runQueuedPostDoneAssistantSideEffects emits only the official lifecycle for one assistant message', async () => {
  const queue = createPostDoneSideEffectsQueue();
  const lifecycleGate = deferred();
  const order = [];

  const run = runQueuedPostDoneAssistantSideEffects({
    queue,
    messageId: 12,
    lifecycleKind: 'normal',
    traceId: 'trace-1',
    emitOfficialGenerationLifecycle: async (messageId, kind) => {
      order.push(`lifecycle:start:${messageId}:${kind}`);
      await lifecycleGate.promise;
      order.push(`lifecycle:end:${messageId}:${kind}`);
    },
    recordLifecycleTrace: () => {},
  });

  await settleMicrotasks();
  assert.deepEqual(order, ['lifecycle:start:12:normal']);
  assert.equal(queue.isBusy(12), true);

  lifecycleGate.resolve();
  await run;

  assert.deepEqual(order, ['lifecycle:start:12:normal', 'lifecycle:end:12:normal']);
  assert.equal(queue.isBusy(12), false);
});

test('runQueuedPostDoneAssistantSideEffects waits for native MVU message writeback after lifecycle', async () => {
  const queue = createPostDoneSideEffectsQueue();
  const order = [];
  const writebackCalls = [];
  const writebackGate = deferred();

  await runQueuedPostDoneAssistantSideEffects({
    queue,
    messageId: 12,
    lifecycleKind: 'normal',
    traceId: 'trace-writeback',
    emitOfficialGenerationLifecycle: async (messageId, kind) => {
      order.push(`lifecycle:${messageId}:${kind}`);
      writebackGate.resolve();
    },
    waitForNativeMvuMessageWriteback: async messageId => {
      writebackCalls.push(messageId);
      order.push(`mvu-writeback-armed:${messageId}`);
      await writebackGate.promise;
      order.push(`mvu-writeback:${messageId}`);
      return { status: 'applied' };
    },
    recordLifecycleTrace: () => {},
  });

  assert.deepEqual(order, ['mvu-writeback-armed:12', 'lifecycle:12:normal', 'mvu-writeback:12']);
  assert.deepEqual(writebackCalls, [12]);
  assert.equal(queue.isBusy(12), false);
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

test('post-done assistant side effects do not run direct MVU parsing before lifecycle', async () => {
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

  assert.deepEqual(order, ['lifecycle:12:normal']);
  assert.deepEqual(warnings, []);
  assert.deepEqual(traceEntries, []);
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

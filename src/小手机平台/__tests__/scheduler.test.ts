import assert from 'node:assert/strict';
import vm from 'node:vm';

import {
  ControlledPhoneScheduler,
  type PhoneSchedulerJob,
  type StableSchedulerSnapshot,
} from '../scheduler/phoneScheduler';

function snapshot(sessionKey = 'session-a', snapshotKey = 'snapshot-1', storyTurn = 10): StableSchedulerSnapshot {
  return { sessionKey, snapshotKey, storyTurn };
}

function job(overrides: Record<string, unknown> = {}): PhoneSchedulerJob {
  return {
    triggerKey: 'trigger-a',
    sessionKey: 'session-a',
    snapshotKey: 'snapshot-1',
    conversationId: 'conversation-a',
    contactKey: 'contact-a',
    topicKey: 'topic-a',
    topicVersion: '1',
    priority: 'P1',
    source: 'network_change',
    requiresAi: true,
    payload: { networkRevision: 'network-2' },
    ...overrides,
  } as unknown as PhoneSchedulerJob;
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function testPriorityOrder(): Promise<void> {
  const calls: string[] = [];
  const pending: Array<ReturnType<typeof deferred>> = [];
  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: current => {
        calls.push(current.triggerKey);
        const request = deferred();
        pending.push(request);
        return request.promise;
      },
      deliverDeterministic: async () => undefined,
    },
    { maxAIConversationsPerSnapshot: 4 },
  );
  scheduler.setSnapshot(snapshot());
  for (const priority of ['P3', 'P1', 'P2', 'P0'] as const) {
    assert.equal(
      scheduler.enqueue(
        job({
          triggerKey: priority,
          priority,
          conversationId: `conversation-${priority}`,
          contactKey: `contact-${priority}`,
          topicKey: `topic-${priority}`,
        }),
      ),
      true,
    );
  }
  scheduler.runAvailable();
  assert.deepEqual(calls, ['P0', 'P1', 'P2', 'P3'], '四级优先级必须稳定排序');
  pending.forEach(request => request.resolve(undefined));
  await scheduler.whenIdle();
}

async function testEligibilityAndTopicDedup(): Promise<void> {
  let eligible = true;
  const calls: string[] = [];
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => eligible,
    dispatchAi: async current => {
      calls.push(current.triggerKey);
    },
    deliverDeterministic: async current => {
      calls.push(current.triggerKey);
    },
  });
  scheduler.setSnapshot(snapshot());

  assert.equal(scheduler.enqueue(job()), true);
  assert.equal(scheduler.enqueue(job()), false, '刷新重复 triggerKey 不得重复创建');
  eligible = false;
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.deepEqual(calls, [], '投递前资格变化为 false 时不得调用 AI');

  eligible = true;
  assert.equal(scheduler.enqueue(job({ triggerKey: 'topic-v1' })), true);
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(
    scheduler.enqueue(job({ triggerKey: 'same-topic-v1' })),
    false,
    '同 topicKey + topicVersion 已投递后必须抑制',
  );
  assert.equal(
    scheduler.enqueue(
      job({ triggerKey: 'topic-v2', topicVersion: '2', conversationId: 'conversation-b', contactKey: 'contact-b' }),
    ),
    true,
  );
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.deepEqual(calls, ['topic-v1', 'topic-v2']);
}

async function testQuotaAndDeterministicDoesNotConsumeIt(): Promise<void> {
  const aiCalls: string[] = [];
  const cards: string[] = [];
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: async current => {
      aiCalls.push(current.conversationId);
    },
    deliverDeterministic: async current => {
      cards.push(current.triggerKey);
    },
  });
  scheduler.setSnapshot(snapshot());
  scheduler.enqueue(
    job({
      triggerKey: 'notice',
      source: 'deterministic_notice',
      requiresAi: false,
      payload: { noticeCode: 'network-restored' },
      topicKey: 'notice-topic',
    }),
  );
  for (const index of [1, 2, 3]) {
    scheduler.enqueue(
      job({
        triggerKey: `ai-${index}`,
        conversationId: `conversation-${index}`,
        contactKey: `contact-${index}`,
        topicKey: `topic-${index}`,
      }),
    );
  }
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.deepEqual(cards, ['notice']);
  assert.deepEqual(aiCalls, ['conversation-1', 'conversation-2'], '默认每快照最多两个不同 AI 会话');
}

async function testStoryTurnCooldownBoundary(): Promise<void> {
  const calls: string[] = [];
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: async current => {
      calls.push(current.triggerKey);
    },
    deliverDeterministic: async () => undefined,
  });
  scheduler.setSnapshot(snapshot('session-a', 'snapshot-1', 10));
  scheduler.enqueue(job({ triggerKey: 'turn-10' }));
  scheduler.runAvailable();
  await scheduler.whenIdle();

  scheduler.setSnapshot(snapshot('session-a', 'snapshot-2', 11));
  scheduler.enqueue(job({ triggerKey: 'turn-11', snapshotKey: 'snapshot-2', topicVersion: '2' }));
  scheduler.runAvailable();
  await scheduler.whenIdle();

  scheduler.setSnapshot(snapshot('session-a', 'snapshot-3', 12));
  scheduler.enqueue(job({ triggerKey: 'turn-12', snapshotKey: 'snapshot-3', topicVersion: '3' }));
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.deepEqual(calls, ['turn-10', 'turn-12'], '差 1 楼禁止，恰好跨 2 个完成楼层允许');
}

async function testInflightPerConversationAndParallelConversations(): Promise<void> {
  const calls: string[] = [];
  const first = deferred();
  const other = deferred();
  const sameLater = deferred();
  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: current => {
        calls.push(current.triggerKey);
        if (current.triggerKey === 'first') return first.promise;
        if (current.triggerKey === 'other') return other.promise;
        return sameLater.promise;
      },
      deliverDeterministic: async () => undefined,
    },
    { contactCooldownInStoryTurns: 0 },
  );
  scheduler.setSnapshot(snapshot());
  scheduler.enqueue(job({ triggerKey: 'first', topicKey: 'first-topic' }));
  scheduler.enqueue(job({ triggerKey: 'same-later', topicKey: 'later-topic', contactKey: 'contact-b' }));
  scheduler.enqueue(
    job({
      triggerKey: 'other',
      conversationId: 'conversation-b',
      contactKey: 'contact-c',
      topicKey: 'other-topic',
    }),
  );
  scheduler.runAvailable();
  assert.deepEqual(calls, ['first', 'other'], '同会话 pending 时阻塞后续，但其他会话必须并发启动');
  first.resolve(undefined);
  await settle();
  assert.deepEqual(calls, ['first', 'other', 'same-later']);
  other.resolve(undefined);
  sameLater.resolve(undefined);
  await scheduler.whenIdle();
}

async function testSnapshotSwitchCancelsUnstarted(): Promise<void> {
  const calls: Array<{ trigger: string; session: string; snapshot: string }> = [];
  const oldPending = deferred();
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: current => {
      calls.push({ trigger: current.triggerKey, session: current.sessionKey, snapshot: current.snapshotKey });
      return current.triggerKey === 'old-started' ? oldPending.promise : Promise.resolve();
    },
    deliverDeterministic: async () => undefined,
  });
  scheduler.setSnapshot(snapshot());
  scheduler.enqueue(job({ triggerKey: 'old-unstarted' }));
  scheduler.setSnapshot(snapshot('session-b', 'snapshot-b', 11));
  scheduler.runAvailable();
  assert.deepEqual(calls, [], '切换必须取消旧快照未开始 job');

  scheduler.setSnapshot(snapshot());
  scheduler.enqueue(job({ triggerKey: 'old-started', topicKey: 'old-started-topic' }));
  scheduler.runAvailable();
  scheduler.setSnapshot(snapshot('session-b', 'snapshot-b', 11));
  scheduler.enqueue(
    job({
      triggerKey: 'new-job',
      sessionKey: 'session-b',
      snapshotKey: 'snapshot-b',
      topicKey: 'new-topic',
    }),
  );
  scheduler.runAvailable();
  assert.deepEqual(calls, [
    { trigger: 'old-started', session: 'session-a', snapshot: 'snapshot-1' },
    { trigger: 'new-job', session: 'session-b', snapshot: 'snapshot-b' },
  ]);
  oldPending.resolve(undefined);
  await scheduler.whenIdle();
}

async function testSourcesAndWaitingReportValidation(): Promise<void> {
  const aiSources: string[] = [];
  const deterministic: string[] = [];
  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: async current => {
        aiSources.push(current.source);
      },
      deliverDeterministic: async current => {
        deterministic.push(current.source);
      },
    },
    { maxAIConversationsPerSnapshot: 5, contactCooldownInStoryTurns: 0 },
  );
  scheduler.setSnapshot(snapshot());
  const sources = [
    'network_change',
    'task_intel_change',
    'role_threshold',
    'waiting_report',
    'low_frequency_daily',
  ] as const;
  sources.forEach((source, index) => {
    const payload = source === 'waiting_report' ? { recordId: 'record-1' } : { revision: index };
    assert.equal(
      scheduler.enqueue(
        job({
          source,
          payload,
          triggerKey: source,
          conversationId: `source-conversation-${index}`,
          contactKey: `source-contact-${index}`,
          topicKey: `source-topic-${index}`,
        }) as PhoneSchedulerJob,
      ),
      true,
    );
  });
  assert.equal(
    scheduler.enqueue(
      job({
        source: 'deterministic_notice',
        requiresAi: false,
        payload: { noticeCode: 'daily-reset' },
        triggerKey: 'deterministic',
        topicKey: 'deterministic-topic',
      }),
    ),
    true,
  );
  assert.equal(scheduler.enqueue({ ...job(), source: 'natural_language' } as unknown as PhoneSchedulerJob), false);
  assert.equal(
    scheduler.enqueue({
      ...job(),
      source: 'waiting_report',
      payload: { promise: 'later' },
    } as unknown as PhoneSchedulerJob),
    false,
    'waiting_report 必须提供结构化 recordId',
  );
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.deepEqual(aiSources, sources);
  assert.deepEqual(deterministic, ['deterministic_notice']);
}

async function testRejectsPrototypeAndEmptyPriorities(): Promise<void> {
  let dispatches = 0;
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: async () => {
      dispatches += 1;
    },
    deliverDeterministic: async () => {
      dispatches += 1;
    },
  });
  scheduler.setSnapshot(snapshot());
  for (const priority of ['toString', 'constructor', '']) {
    assert.equal(
      scheduler.enqueue(job({ triggerKey: `invalid-${priority}`, priority }) as PhoneSchedulerJob),
      false,
      `必须拒绝非法 priority: ${priority}`,
    );
  }
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(dispatches, 0, '非法 priority 不得进入任何投递路径');
}

async function testRuntimeOptionAndSnapshotValidation(): Promise<void> {
  const dependencies = {
    isEligible: () => true,
    dispatchAi: async () => undefined,
    deliverDeterministic: async () => undefined,
  };
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
    assert.throws(
      () => new ControlledPhoneScheduler(dependencies, { maxAIConversationsPerSnapshot: value }),
      /maxAIConversationsPerSnapshot|safe|integer|有限|非负/i,
    );
    assert.throws(
      () => new ControlledPhoneScheduler(dependencies, { contactCooldownInStoryTurns: value }),
      /contactCooldownInStoryTurns|safe|integer|有限|非负/i,
    );
  }
  for (const [key, value] of [
    ['oneInflightRequestPerConversation', 'true'],
    ['suppressSameTopicUntilChanged', 1],
  ] as const) {
    assert.throws(
      () => new ControlledPhoneScheduler(dependencies, { [key]: value } as never),
      /boolean|布尔|oneInflight|suppressSameTopic/i,
    );
  }
  assert.doesNotThrow(
    () =>
      new ControlledPhoneScheduler(dependencies, {
        maxAIConversationsPerSnapshot: 0,
        contactCooldownInStoryTurns: 0,
      }),
    '两个计数配置必须明确允许 0',
  );

  let dispatches = 0;
  const scheduler = new ControlledPhoneScheduler({
    ...dependencies,
    dispatchAi: async () => {
      dispatches += 1;
    },
  });
  scheduler.setSnapshot(snapshot());
  scheduler.enqueue(job());
  for (const invalid of [
    snapshot('', 'snapshot-x', 11),
    snapshot('session-x', '', 11),
    snapshot('session-x', 'snapshot-x', Number.NaN),
    snapshot('session-x', 'snapshot-x', Number.POSITIVE_INFINITY),
    snapshot('session-x', 'snapshot-x', -1),
    snapshot('session-x', 'snapshot-x', 1.5),
  ]) {
    assert.throws(() => scheduler.setSnapshot(invalid), /snapshot|session|storyTurn|safe|integer|有限|非负|空/i);
  }
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(dispatches, 1, '非法快照不得替换或清空此前有效快照');
}

async function testJobDeepCloneAndRecursiveFreeze(): Promise<void> {
  const cyclic: { label: string; self?: unknown } = { label: 'original' };
  cyclic.self = cyclic;
  const nested = { list: [{ value: 'original' }], cyclic };
  let observedPayload: Record<string, unknown> | undefined;
  const scheduler = new ControlledPhoneScheduler({
    isEligible: current => {
      observedPayload = current.payload as Record<string, unknown>;
      return true;
    },
    dispatchAi: async current => {
      observedPayload = current.payload as Record<string, unknown>;
    },
    deliverDeterministic: async () => undefined,
  });
  scheduler.setSnapshot(snapshot());
  const mutableJob = job({ payload: nested });
  assert.equal(scheduler.enqueue(mutableJob), true);
  nested.list[0].value = 'mutated';
  cyclic.label = 'mutated';
  scheduler.runAvailable();
  await scheduler.whenIdle();

  const cloned = observedPayload as {
    list: Array<{ value: string }>;
    cyclic: { label: string; self: unknown };
  };
  assert.equal(cloned.list[0].value, 'original');
  assert.equal(cloned.cyclic.label, 'original');
  assert.equal(cloned.cyclic.self, cloned.cyclic, 'structured clone 必须保留循环结构');
  assert.equal(Object.isFrozen(cloned), true);
  assert.equal(Object.isFrozen(cloned.list), true);
  assert.equal(Object.isFrozen(cloned.list[0]), true);
  assert.equal(Object.isFrozen(cloned.cyclic), true);

  assert.equal(
    scheduler.enqueue(
      job({
        triggerKey: 'uncloneable',
        topicKey: 'uncloneable-topic',
        payload: { callback: () => undefined },
      }),
    ),
    false,
    '不可 structuredClone 的 payload 必须拒绝且不入队',
  );

  let rejectedDispatches = 0;
  const rejecting = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: async () => {
      rejectedDispatches += 1;
    },
    deliverDeterministic: async () => {
      rejectedDispatches += 1;
    },
  });
  rejecting.setSnapshot(snapshot());
  class PayloadInstance {
    value = 'class';
  }
  const dangerousPrototype = Object.create({ inherited: true }) as Record<string, unknown>;
  dangerousPrototype.value = 'custom-prototype';
  const rejectedPayloads: unknown[] = [
    new Map([['key', 'value']]),
    new Set(['value']),
    new Date(),
    /value/,
    new Uint8Array([1, 2]),
    new PayloadInstance(),
    dangerousPrototype,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ];
  rejectedPayloads.forEach((payload, index) => {
    assert.equal(
      rejecting.enqueue(job({ triggerKey: `rejected-payload-${index}`, topicKey: `rejected-topic-${index}`, payload })),
      false,
    );
  });
  rejecting.runAvailable();
  await rejecting.whenIdle();
  assert.equal(rejectedDispatches, 0, '非 plain structured payload 不得 dispatch');

  const nullPrototype = Object.create(null) as Record<string, unknown>;
  nullPrototype.value = ['plain', 1, true, null];
  for (const [index, payload] of [null, 'plain', true, 1, ['plain'], nullPrototype].entries()) {
    assert.equal(
      rejecting.enqueue(job({ triggerKey: `plain-payload-${index}`, topicKey: `plain-topic-${index}`, payload })),
      true,
      `应接受 plain structured payload #${index}`,
    );
  }
  rejecting.dispose();
}

async function testOlderFailureCannotRollbackNewerCooldown(): Promise<void> {
  const oldRequest = deferred();
  const calls: string[] = [];
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: async current => {
      calls.push(current.triggerKey);
      if (current.triggerKey === 'old-turn-10') return oldRequest.promise;
    },
    deliverDeterministic: async () => undefined,
    onError: () => undefined,
  });
  scheduler.setSnapshot(snapshot('session-a', 'snapshot-10', 10));
  scheduler.enqueue(job({ triggerKey: 'old-turn-10', snapshotKey: 'snapshot-10', topicKey: 'race-topic' }));
  scheduler.runAvailable();

  scheduler.setSnapshot(snapshot('session-a', 'snapshot-12', 12));
  scheduler.enqueue(
    job({
      triggerKey: 'new-turn-12',
      snapshotKey: 'snapshot-12',
      conversationId: 'conversation-new',
      topicKey: 'race-topic',
      topicVersion: '2',
    }),
  );
  scheduler.runAvailable();
  await settle();
  oldRequest.reject(new Error('old request failed after newer success'));
  await scheduler.whenIdle();

  scheduler.setSnapshot(snapshot('session-a', 'snapshot-13', 13));
  scheduler.enqueue(
    job({
      triggerKey: 'turn-13',
      snapshotKey: 'snapshot-13',
      conversationId: 'conversation-third',
      topicKey: 'race-topic',
      topicVersion: '3',
    }),
  );
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.deepEqual(calls, ['old-turn-10', 'new-turn-12'], '旧失败不得抹掉 turn12 的较新冷却记录');
}

async function testBoundedDedupAndSessionStateCleanup(): Promise<void> {
  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: async () => undefined,
      deliverDeterministic: async () => undefined,
    },
    {
      maxAIConversationsPerSnapshot: 10,
      contactCooldownInStoryTurns: 0,
      deduplicationCacheSize: 2,
    },
  );
  scheduler.setSnapshot(snapshot());
  for (const suffix of ['a', 'b', 'c']) {
    scheduler.enqueue(
      job({
        triggerKey: `bounded-trigger-${suffix}`,
        conversationId: `bounded-conversation-${suffix}`,
        contactKey: `bounded-contact-${suffix}`,
        topicKey: `bounded-topic-${suffix}`,
      }),
    );
  }
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(
    scheduler.enqueue(
      job({
        triggerKey: 'bounded-trigger-a',
        topicKey: 'fresh-topic',
        topicVersion: '2',
        contactKey: 'fresh-contact-a',
      }),
    ),
    true,
    'trigger LRU 超限后必须淘汰最旧项',
  );
  assert.equal(
    scheduler.enqueue(
      job({
        triggerKey: 'fresh-trigger',
        topicKey: 'bounded-topic-a',
        contactKey: 'fresh-contact-b',
      }),
    ),
    true,
    'topic LRU 超限后必须淘汰最旧项',
  );
  assert.equal(
    scheduler.enqueue(
      job({ triggerKey: 'bounded-trigger-b', topicKey: 'another-topic', contactKey: 'fresh-contact-c' }),
    ),
    false,
    '较新的 trigger 仍应保留',
  );
  assert.equal(
    scheduler.enqueue(
      job({ triggerKey: 'another-trigger', topicKey: 'bounded-topic-b', contactKey: 'fresh-contact-d' }),
    ),
    false,
    '较新的 topic 仍应保留',
  );

  let reuseDispatches = 0;
  const reusable = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: async () => {
        reuseDispatches += 1;
      },
      deliverDeterministic: async () => undefined,
    },
    { maxAIConversationsPerSnapshot: 1, contactCooldownInStoryTurns: 2 },
  );
  reusable.setSnapshot(snapshot());
  reusable.enqueue(job({ triggerKey: 'reused', topicKey: 'reused-topic' }));
  reusable.runAvailable();
  await reusable.whenIdle();
  reusable.cancelSession('session-a');
  reusable.setSnapshot(snapshot());
  assert.equal(reusable.enqueue(job({ triggerKey: 'reused', topicKey: 'reused-topic' })), true);
  reusable.runAvailable();
  await reusable.whenIdle();
  assert.equal(reuseDispatches, 2, 'cancelSession 后复用同键不得继承去重、quota 或冷却状态');

  const quota = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: async () => {
        reuseDispatches += 1;
      },
      deliverDeterministic: async () => undefined,
    },
    { maxAIConversationsPerSnapshot: 1, contactCooldownInStoryTurns: 0 },
  );
  quota.setSnapshot(snapshot('session-q', 'snapshot-old', 1));
  quota.enqueue(
    job({
      sessionKey: 'session-q',
      snapshotKey: 'snapshot-old',
      triggerKey: 'quota-old',
      conversationId: 'quota-conversation-old',
      contactKey: 'quota-contact-old',
      topicKey: 'quota-topic-old',
    }),
  );
  quota.runAvailable();
  await quota.whenIdle();
  quota.setSnapshot(snapshot('session-q', 'snapshot-new', 2));
  quota.setSnapshot(snapshot('session-q', 'snapshot-old', 3));
  quota.enqueue(
    job({
      sessionKey: 'session-q',
      snapshotKey: 'snapshot-old',
      triggerKey: 'quota-returned',
      conversationId: 'quota-conversation-returned',
      contactKey: 'quota-contact-returned',
      topicKey: 'quota-topic-returned',
    }),
  );
  quota.runAvailable();
  await quota.whenIdle();
  assert.equal(reuseDispatches, 4, '离开快照后旧 quota scope 必须清理，返回时可重新计数');
}

async function testActiveSnapshotQuotaSurvivesSwitches(): Promise<void> {
  const pendingSuccess = deferred();
  const successCalls: string[] = [];
  const successful = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: current => {
        successCalls.push(current.triggerKey);
        return current.triggerKey === 'active-success' ? pendingSuccess.promise : Promise.resolve();
      },
      deliverDeterministic: async () => undefined,
    },
    { maxAIConversationsPerSnapshot: 1, contactCooldownInStoryTurns: 0 },
  );
  successful.setSnapshot(snapshot('quota-session', 'snapshot-a', 10));
  successful.enqueue(
    job({
      sessionKey: 'quota-session',
      snapshotKey: 'snapshot-a',
      triggerKey: 'active-success',
      conversationId: 'conversation-1',
      contactKey: 'contact-1',
      topicKey: 'active-success-topic',
    }),
  );
  successful.runAvailable();
  successful.setSnapshot(snapshot('quota-session', 'snapshot-b', 11));
  successful.setSnapshot(snapshot('quota-session', 'snapshot-a', 12));
  successful.enqueue(
    job({
      sessionKey: 'quota-session',
      snapshotKey: 'snapshot-a',
      triggerKey: 'blocked-while-active',
      conversationId: 'conversation-2',
      contactKey: 'contact-2',
      topicKey: 'blocked-active-topic',
    }),
  );
  successful.runAvailable();
  assert.deepEqual(successCalls, ['active-success'], '切回旧快照后 pending 会话仍必须占用 quota');
  pendingSuccess.resolve(undefined);
  await successful.whenIdle();
  successful.enqueue(
    job({
      sessionKey: 'quota-session',
      snapshotKey: 'snapshot-a',
      triggerKey: 'blocked-after-success',
      conversationId: 'conversation-3',
      contactKey: 'contact-3',
      topicKey: 'blocked-success-topic',
    }),
  );
  successful.runAvailable();
  await successful.whenIdle();
  assert.deepEqual(successCalls, ['active-success'], '旧 active 成功后仍应提交并持续占用当前快照 quota');

  const pendingFailure = deferred();
  const failureCalls: string[] = [];
  const failed = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: current => {
        failureCalls.push(current.triggerKey);
        return current.triggerKey === 'active-failure' ? pendingFailure.promise : Promise.resolve();
      },
      deliverDeterministic: async () => undefined,
      onError: () => undefined,
    },
    { maxAIConversationsPerSnapshot: 1, contactCooldownInStoryTurns: 0 },
  );
  failed.setSnapshot(snapshot('failure-session', 'snapshot-a', 10));
  failed.enqueue(
    job({
      sessionKey: 'failure-session',
      snapshotKey: 'snapshot-a',
      triggerKey: 'active-failure',
      conversationId: 'conversation-1',
      contactKey: 'contact-1',
      topicKey: 'active-failure-topic',
    }),
  );
  failed.runAvailable();
  failed.setSnapshot(snapshot('failure-session', 'snapshot-b', 11));
  failed.setSnapshot(snapshot('failure-session', 'snapshot-a', 12));
  failed.enqueue(
    job({
      sessionKey: 'failure-session',
      snapshotKey: 'snapshot-a',
      triggerKey: 'blocked-before-failure',
      conversationId: 'conversation-2',
      contactKey: 'contact-2',
      topicKey: 'blocked-before-failure-topic',
    }),
  );
  failed.runAvailable();
  assert.deepEqual(failureCalls, ['active-failure']);
  pendingFailure.reject(new Error('expected old active failure'));
  await failed.whenIdle();
  assert.equal(
    failed.enqueue(
      job({
        sessionKey: 'failure-session',
        snapshotKey: 'snapshot-a',
        triggerKey: 'retry-after-failure',
        conversationId: 'conversation-2',
        contactKey: 'contact-2',
        topicKey: 'retry-after-failure-topic',
      }),
    ),
    true,
  );
  failed.runAvailable();
  await failed.whenIdle();
  assert.deepEqual(failureCalls, ['active-failure', 'retry-after-failure']);
}

async function testConcurrentSameConversationFailuresHoldQuotaUntilLastSettle(): Promise<void> {
  const first = deferred();
  const second = deferred();
  const calls: string[] = [];
  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: current => {
        calls.push(current.triggerKey);
        if (current.triggerKey === 'same-conversation-first') return first.promise;
        if (current.triggerKey === 'same-conversation-second') return second.promise;
        return Promise.resolve();
      },
      deliverDeterministic: async () => undefined,
      onError: () => undefined,
    },
    {
      maxAIConversationsPerSnapshot: 1,
      contactCooldownInStoryTurns: 0,
      oneInflightRequestPerConversation: false,
    },
  );
  scheduler.setSnapshot(snapshot());
  scheduler.enqueue(
    job({
      triggerKey: 'same-conversation-first',
      conversationId: 'shared-conversation',
      contactKey: 'contact-first',
      topicKey: 'topic-first',
    }),
  );
  scheduler.enqueue(
    job({
      triggerKey: 'same-conversation-second',
      conversationId: 'shared-conversation',
      contactKey: 'contact-second',
      topicKey: 'topic-second',
    }),
  );
  scheduler.runAvailable();
  assert.deepEqual(calls, ['same-conversation-first', 'same-conversation-second']);

  first.reject(new Error('first concurrent request failed'));
  await settle();
  const thirdConversation = job({
    triggerKey: 'different-conversation',
    conversationId: 'different-conversation',
    contactKey: 'contact-third',
    topicKey: 'topic-third',
  });
  assert.equal(scheduler.enqueue(thirdConversation), true);
  scheduler.runAvailable();
  assert.deepEqual(
    calls,
    ['same-conversation-first', 'same-conversation-second'],
    '同 conversation 仍有 active 请求时，一次失败不得释放 admitted quota',
  );

  second.reject(new Error('last concurrent request failed'));
  await scheduler.whenIdle();
  assert.equal(scheduler.enqueue(thirdConversation), true, '最后一个同 conversation 请求失败后应允许显式重试');
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.deepEqual(calls, ['same-conversation-first', 'same-conversation-second', 'different-conversation']);
}

async function testDiscardingUnreservedQueuedJobDoesNotReleaseActiveQuota(): Promise<void> {
  const active = deferred();
  const calls: string[] = [];
  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: current => {
        calls.push(current.triggerKey);
        return current.triggerKey === 'active-reservation' ? active.promise : Promise.resolve();
      },
      deliverDeterministic: async () => undefined,
    },
    { maxAIConversationsPerSnapshot: 1, contactCooldownInStoryTurns: 2 },
  );
  scheduler.setSnapshot(snapshot());
  scheduler.enqueue(
    job({
      triggerKey: 'active-reservation',
      conversationId: 'shared-conversation',
      contactKey: 'shared-contact',
      topicKey: 'active-reservation-topic',
    }),
  );
  scheduler.enqueue(
    job({
      triggerKey: 'cooldown-discarded',
      conversationId: 'shared-conversation',
      contactKey: 'shared-contact',
      topicKey: 'cooldown-discarded-topic',
    }),
  );
  scheduler.enqueue(
    job({
      triggerKey: 'different-conversation-after-discard',
      conversationId: 'different-conversation',
      contactKey: 'different-contact',
      topicKey: 'different-topic',
    }),
  );
  scheduler.runAvailable();
  assert.deepEqual(calls, ['active-reservation'], '淘汰从未 reserve 的同会话 queued job 不得释放 active reservation');
  active.resolve(undefined);
  await scheduler.whenIdle();
}

async function testCancelSessionImmediatelyReleasesActiveScopeTracking(): Promise<void> {
  const abandoned = deferred();
  const calls: string[] = [];
  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: current => {
        calls.push(current.triggerKey);
        return current.triggerKey === 'abandoned-active' ? abandoned.promise : Promise.resolve();
      },
      deliverDeterministic: async () => undefined,
    },
    { maxAIConversationsPerSnapshot: 1, contactCooldownInStoryTurns: 0 },
  );
  scheduler.setSnapshot(snapshot('session-a', 'snapshot-a', 10));
  scheduler.enqueue(
    job({
      sessionKey: 'session-a',
      snapshotKey: 'snapshot-a',
      triggerKey: 'abandoned-active',
      conversationId: 'abandoned-conversation',
      contactKey: 'abandoned-contact',
      topicKey: 'abandoned-topic',
    }),
  );
  scheduler.runAvailable();

  scheduler.setSnapshot(snapshot('session-b', 'snapshot-b', 11));
  scheduler.setSnapshot(snapshot('session-a', 'snapshot-a', 12));
  scheduler.enqueue(
    job({
      sessionKey: 'session-a',
      snapshotKey: 'snapshot-a',
      triggerKey: 'new-lifecycle-success',
      conversationId: 'new-lifecycle-conversation',
      contactKey: 'new-lifecycle-contact',
      topicKey: 'new-lifecycle-topic',
    }),
  );
  scheduler.runAvailable();
  await settle();

  scheduler.setSnapshot(snapshot('session-a', 'snapshot-other', 13));
  scheduler.setSnapshot(snapshot('session-a', 'snapshot-a', 14));
  scheduler.enqueue(
    job({
      sessionKey: 'session-a',
      snapshotKey: 'snapshot-a',
      triggerKey: 'after-scope-prune',
      conversationId: 'after-scope-prune-conversation',
      contactKey: 'after-scope-prune-contact',
      topicKey: 'after-scope-prune-topic',
    }),
  );
  scheduler.runAvailable();
  await settle();
  assert.deepEqual(
    calls,
    ['abandoned-active', 'new-lifecycle-success', 'after-scope-prune'],
    '已取消且不 settle 的旧请求不得让 active scope 泄漏到重入生命周期',
  );

  abandoned.resolve(undefined);
  await scheduler.whenIdle();
}

async function testFailureReleaseRetryAndDisposeSafety(): Promise<void> {
  const errors: unknown[] = [];
  let attempts = 0;
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('expected dispatch failure');
    },
    deliverDeterministic: async () => undefined,
    onError: error => errors.push(error),
  });
  scheduler.setSnapshot(snapshot());
  scheduler.enqueue(job({ triggerKey: 'retryable' }));
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(errors.length, 1);
  assert.equal(scheduler.enqueue(job({ triggerKey: 'retryable' })), true, '失败不得提交 trigger/topic/cooldown');
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(attempts, 2, '失败必须释放 inflight 并允许显式重试');

  const pending = deferred();
  const disposeErrors: unknown[] = [];
  const disposed = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: () => pending.promise,
    deliverDeterministic: async () => undefined,
    onError: error => disposeErrors.push(error),
  });
  disposed.setSnapshot(snapshot());
  disposed.enqueue(job({ triggerKey: 'dispose-pending' }));
  disposed.runAvailable();
  disposed.dispose();
  assert.equal(disposed.enqueue(job({ triggerKey: 'after-dispose' })), false);
  pending.reject(new Error('settled after dispose'));
  await disposed.whenIdle();
  assert.equal(disposeErrors.length, 1, '已开始 Promise 在 dispose 后拒绝也必须被安全处理');
}

async function testNoSnapshotDoesNotDispatch(): Promise<void> {
  let calls = 0;
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: async () => {
      calls += 1;
    },
    deliverDeterministic: async () => undefined,
  });
  scheduler.enqueue(job());
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(calls, 0);
  scheduler.cancelSession('session-a');
}

async function testProfileInflightLimit(): Promise<void> {
  let active = 0;
  let maxActive = 0;
  let delivered = 0;
  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 2));
        active -= 1;
        delivered += 1;
      },
      deliverDeterministic: async () => undefined,
    },
    {
      maxAIConversationsPerSnapshot: 10,
      contactCooldownInStoryTurns: 0,
      maxInflightAIRequests: 2,
    },
  );
  scheduler.setSnapshot(snapshot());
  for (let index = 0; index < 5; index += 1) {
    scheduler.enqueue(
      job({
        triggerKey: `profile-${index}`,
        conversationId: `profile-conversation-${index}`,
        contactKey: `profile-contact-${index}`,
        topicKey: `profile-topic-${index}`,
        source: 'profile_refresh',
      }),
    );
  }
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(maxActive, 2);
  assert.equal(delivered, 5);
}

async function testCrossRealmProfilePayload(): Promise<void> {
  const dispatched: PhoneSchedulerJob[] = [];
  const scheduler = new ControlledPhoneScheduler({
    isEligible: () => true,
    dispatchAi: async current => {
      dispatched.push(current);
    },
    deliverDeterministic: async () => undefined,
  });
  scheduler.setSnapshot(snapshot());
  const payload = vm.runInNewContext(`({
    workKey: 'profile-run:1\\u0000main:纪宁',
    runId: 'profile-run:1',
    personId: 'main:纪宁',
    trigger: 'person-manual',
    evidence: ['story:12', 'wechat:new']
  })`);

  assert.equal(
    scheduler.enqueue(
      job({
        triggerKey: 'cross-realm-profile',
        source: 'profile_refresh',
        payload,
      }),
    ),
    true,
    '独立 iframe 创建的 plain object/array 必须可进入档案调度器',
  );
  scheduler.runAvailable();
  await scheduler.whenIdle();
  assert.equal(dispatched.length, 1);
  assert.deepEqual(dispatched[0].payload, {
    workKey: 'profile-run:1\u0000main:纪宁',
    runId: 'profile-run:1',
    personId: 'main:纪宁',
    trigger: 'person-manual',
    evidence: ['story:12', 'wechat:new'],
  });
}

async function main(): Promise<void> {
  await testPriorityOrder();
  await testEligibilityAndTopicDedup();
  await testQuotaAndDeterministicDoesNotConsumeIt();
  await testStoryTurnCooldownBoundary();
  await testInflightPerConversationAndParallelConversations();
  await testSnapshotSwitchCancelsUnstarted();
  await testSourcesAndWaitingReportValidation();
  await testRejectsPrototypeAndEmptyPriorities();
  await testRuntimeOptionAndSnapshotValidation();
  await testJobDeepCloneAndRecursiveFreeze();
  await testOlderFailureCannotRollbackNewerCooldown();
  await testBoundedDedupAndSessionStateCleanup();
  await testActiveSnapshotQuotaSurvivesSwitches();
  await testConcurrentSameConversationFailuresHoldQuotaUntilLastSettle();
  await testDiscardingUnreservedQueuedJobDoesNotReleaseActiveQuota();
  await testCancelSessionImmediatelyReleasesActiveScopeTracking();
  await testFailureReleaseRetryAndDisposeSafety();
  await testNoSnapshotDoesNotDispatch();
  await testProfileInflightLimit();
  await testCrossRealmProfilePayload();
  console.log('scheduler tests passed');
}

void main();

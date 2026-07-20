import assert from 'node:assert/strict';

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

async function main(): Promise<void> {
  await testPriorityOrder();
  await testEligibilityAndTopicDedup();
  await testQuotaAndDeterministicDoesNotConsumeIt();
  await testStoryTurnCooldownBoundary();
  await testInflightPerConversationAndParallelConversations();
  await testSnapshotSwitchCancelsUnstarted();
  await testSourcesAndWaitingReportValidation();
  await testRejectsPrototypeAndEmptyPriorities();
  await testFailureReleaseRetryAndDisposeSafety();
  await testNoSnapshotDoesNotDispatch();
  console.log('scheduler tests passed');
}

void main();

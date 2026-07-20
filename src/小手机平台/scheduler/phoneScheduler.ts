export type SchedulerPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface StableSchedulerSnapshot {
  sessionKey: string;
  snapshotKey: string;
  storyTurn: number;
}

interface JobFields {
  triggerKey: string;
  sessionKey: string;
  snapshotKey: string;
  conversationId: string;
  contactKey: string;
  topicKey: string;
  topicVersion: string;
  priority: SchedulerPriority;
}

export type AiSchedulerSource =
  | 'network_change'
  | 'task_intel_change'
  | 'role_threshold'
  | 'waiting_report'
  | 'low_frequency_daily';

export type SchedulerPayload =
  | null
  | string
  | boolean
  | number
  | SchedulerPayload[]
  | { [key: string]: SchedulerPayload };

export type PhoneSchedulerJob =
  | (JobFields & {
      source: Exclude<AiSchedulerSource, 'waiting_report'>;
      requiresAi: true;
      payload: SchedulerPayload;
    })
  | (JobFields & {
      source: 'waiting_report';
      requiresAi: true;
      payload: { [key: string]: SchedulerPayload; recordId: string };
    })
  | (JobFields & {
      source: 'deterministic_notice';
      requiresAi: false;
      payload: SchedulerPayload;
    });

export interface PhoneSchedulerDependencies {
  isEligible(job: PhoneSchedulerJob, latestSnapshot: StableSchedulerSnapshot): boolean;
  dispatchAi(job: PhoneSchedulerJob): Promise<unknown> | unknown;
  deliverDeterministic(job: PhoneSchedulerJob): Promise<unknown> | unknown;
  onError?(error: unknown, job: PhoneSchedulerJob): void;
}

export interface PhoneSchedulerOptions {
  maxAIConversationsPerSnapshot?: number;
  contactCooldownInStoryTurns?: number;
  oneInflightRequestPerConversation?: boolean;
  suppressSameTopicUntilChanged?: boolean;
  deduplicationCacheSize?: number;
}

interface QueuedJob {
  job: PhoneSchedulerJob;
  sequence: number;
  cancelled: boolean;
  activityToken: number;
}

interface ContactCooldownRecord {
  turn: number;
  token: number;
}

const PRIORITY_ORDER: Record<SchedulerPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const AI_SOURCES = new Set<string>([
  'network_change',
  'task_intel_change',
  'role_threshold',
  'waiting_report',
  'low_frequency_daily',
]);

function nonNegativeSafeInteger(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a finite non-negative safe integer`);
  }
  return resolved;
}

function booleanOption(name: string, value: boolean | undefined, fallback: boolean): boolean {
  if (value !== undefined && typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value ?? fallback;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key), seen);
  return Object.freeze(value);
}

function isPlainStructuredData(value: unknown, seen = new WeakSet<object>()): value is SchedulerPayload {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return true;

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue;
      if (typeof key !== 'string') return false;
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || String(index) !== key || index >= value.length) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
      if (!isPlainStructuredData(descriptor.value, seen)) return false;
    }
    return true;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
    if (!isPlainStructuredData(descriptor.value, seen)) return false;
  }
  return true;
}

export class ControlledPhoneScheduler {
  private readonly maxAIConversationsPerSnapshot: number;
  private readonly contactCooldownInStoryTurns: number;
  private readonly oneInflightRequestPerConversation: boolean;
  private readonly suppressSameTopicUntilChanged: boolean;
  private readonly deduplicationCacheSize: number;
  private currentSnapshot: StableSchedulerSnapshot | undefined;
  private queue: QueuedJob[] = [];
  private sequence = 0;
  private disposed = false;
  private running = false;
  private readonly queuedTriggers = new Set<string>();
  private readonly activeTriggers = new Map<string, number>();
  private readonly deliveredTriggers = new Map<string, Map<string, true>>();
  private readonly queuedTopics = new Set<string>();
  private readonly activeTopics = new Map<string, number>();
  private readonly deliveredTopics = new Map<string, Map<string, string>>();
  private readonly inflightConversations = new Map<string, number>();
  private readonly activeTasks = new Set<Promise<void>>();
  private readonly activeItems = new Set<QueuedJob>();
  private readonly admittedAiConversations = new Map<string, Set<string>>();
  private readonly committedAiConversations = new Map<string, Set<string>>();
  private readonly activeAiScopes = new Map<string, number>();
  private readonly contactLastStartedTurn = new Map<string, ContactCooldownRecord>();
  private cooldownToken = 0;
  private activityToken = 0;

  constructor(
    private readonly dependencies: PhoneSchedulerDependencies,
    options: PhoneSchedulerOptions = {},
  ) {
    this.maxAIConversationsPerSnapshot = nonNegativeSafeInteger(
      'maxAIConversationsPerSnapshot',
      options.maxAIConversationsPerSnapshot,
      2,
    );
    this.contactCooldownInStoryTurns = nonNegativeSafeInteger(
      'contactCooldownInStoryTurns',
      options.contactCooldownInStoryTurns,
      2,
    );
    this.deduplicationCacheSize = nonNegativeSafeInteger('deduplicationCacheSize', options.deduplicationCacheSize, 512);
    this.oneInflightRequestPerConversation = booleanOption(
      'oneInflightRequestPerConversation',
      options.oneInflightRequestPerConversation,
      true,
    );
    this.suppressSameTopicUntilChanged = booleanOption(
      'suppressSameTopicUntilChanged',
      options.suppressSameTopicUntilChanged,
      true,
    );
  }

  setSnapshot(snapshot: StableSchedulerSnapshot | undefined): void {
    if (this.disposed) return;
    const validated = snapshot ? this.copySnapshot(snapshot) : undefined;
    const previousSession = this.currentSnapshot?.sessionKey;
    if (previousSession && previousSession !== validated?.sessionKey) this.cancelSession(previousSession);
    this.currentSnapshot = validated;
    this.cancelQueued(item => !validated || !this.matchesSnapshot(item.job, validated));
    this.pruneQuotaScopes();
  }

  updateSnapshot(snapshot: StableSchedulerSnapshot | undefined): void {
    this.setSnapshot(snapshot);
  }

  enqueue(job: PhoneSchedulerJob): boolean {
    if (this.disposed || !this.isSupportedJob(job)) return false;
    const copied = this.copyJob(job);
    if (!copied) return false;
    const trigger = this.triggerKey(copied);
    const topic = this.topicKey(copied);
    if (
      this.queuedTriggers.has(trigger) ||
      this.activeTriggers.has(trigger) ||
      this.hasDeliveredTrigger(copied) ||
      (this.suppressSameTopicUntilChanged &&
        (this.queuedTopics.has(topic) || this.activeTopics.has(topic) || this.hasDeliveredTopic(copied)))
    ) {
      return false;
    }
    this.queue.push({ job: copied, sequence: this.sequence++, cancelled: false, activityToken: 0 });
    this.queuedTriggers.add(trigger);
    this.queuedTopics.add(topic);
    return true;
  }

  runAvailable(): void {
    if (this.disposed || this.running || !this.currentSnapshot) return;
    this.running = true;
    try {
      const ordered = [...this.queue].sort(
        (left, right) =>
          PRIORITY_ORDER[left.job.priority] - PRIORITY_ORDER[right.job.priority] || left.sequence - right.sequence,
      );
      for (const item of ordered) {
        if (!this.queue.includes(item)) continue;
        const latest = this.currentSnapshot;
        if (!latest || !this.matchesSnapshot(item.job, latest)) {
          this.removeQueued(item);
          continue;
        }
        if (!this.checkEligibility(item.job, latest)) {
          this.removeQueued(item);
          continue;
        }
        if (!item.job.requiresAi) {
          this.start(item, () => this.dependencies.deliverDeterministic(item.job));
          continue;
        }
        if (this.isCoolingDown(item.job, latest)) {
          this.removeQueued(item);
          continue;
        }
        const inflightKey = this.conversationKey(item.job);
        if (this.oneInflightRequestPerConversation && this.inflightConversations.has(inflightKey)) continue;
        if (!this.reserveAiConversation(item.job)) {
          this.removeQueued(item);
          continue;
        }
        this.startAi(item, latest.storyTurn, inflightKey);
      }
    } finally {
      this.running = false;
    }
  }

  cancelSession(sessionKey: string): void {
    for (const item of this.activeItems) {
      if (item.job.sessionKey === sessionKey) item.cancelled = true;
    }
    this.cancelQueued(item => item.job.sessionKey === sessionKey);
    this.deleteSessionKeys(this.queuedTriggers, sessionKey);
    this.deleteSessionMapKeys(this.activeTriggers, sessionKey);
    this.deleteSessionKeys(this.queuedTopics, sessionKey);
    this.deleteSessionMapKeys(this.activeTopics, sessionKey);
    this.deleteSessionMapKeys(this.inflightConversations, sessionKey);
    this.deliveredTriggers.delete(sessionKey);
    this.deliveredTopics.delete(sessionKey);
    this.deleteSessionMapKeys(this.admittedAiConversations, sessionKey);
    this.deleteSessionMapKeys(this.committedAiConversations, sessionKey);
    this.deleteSessionMapKeys(this.contactLastStartedTurn, sessionKey);
    if (this.currentSnapshot?.sessionKey === sessionKey) this.currentSnapshot = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.currentSnapshot = undefined;
    for (const item of this.activeItems) item.cancelled = true;
    this.cancelQueued(() => true);
    this.queuedTriggers.clear();
    this.activeTriggers.clear();
    this.deliveredTriggers.clear();
    this.queuedTopics.clear();
    this.activeTopics.clear();
    this.deliveredTopics.clear();
    this.inflightConversations.clear();
    this.admittedAiConversations.clear();
    this.committedAiConversations.clear();
    this.activeAiScopes.clear();
    this.contactLastStartedTurn.clear();
  }

  async whenIdle(): Promise<void> {
    while (this.activeTasks.size > 0) {
      await Promise.all([...this.activeTasks]);
      await Promise.resolve();
    }
  }

  private startAi(item: QueuedJob, storyTurn: number, inflightKey: string): void {
    const scope = this.snapshotScope(item.job);
    this.activeAiScopes.set(scope, (this.activeAiScopes.get(scope) ?? 0) + 1);
    const contact = this.contactKey(item.job);
    const previousContactTurn = this.contactLastStartedTurn.get(contact);
    const cooldown = { turn: storyTurn, token: ++this.cooldownToken };
    this.contactLastStartedTurn.set(contact, cooldown);
    item.activityToken = ++this.activityToken;
    this.inflightConversations.set(inflightKey, item.activityToken);
    this.start(
      item,
      () => this.dependencies.dispatchAi(item.job),
      success => {
        if (this.inflightConversations.get(inflightKey) === item.activityToken) {
          this.inflightConversations.delete(inflightKey);
        }
        if (!item.cancelled && !this.disposed) {
          if (success) {
            this.committedAiConversations.get(scope)?.add(item.job.conversationId);
          } else {
            this.releaseAiConversation(item.job);
            if (this.contactLastStartedTurn.get(contact)?.token === cooldown.token) {
              if (previousContactTurn === undefined) this.contactLastStartedTurn.delete(contact);
              else this.contactLastStartedTurn.set(contact, previousContactTurn);
            }
          }
        }
        this.decrementActiveScope(scope);
        this.pruneQuotaScopes();
      },
    );
  }

  private start(
    item: QueuedJob,
    operation: () => Promise<unknown> | unknown,
    afterSettle: (success: boolean) => void = () => undefined,
  ): void {
    this.removeQueued(item, true);
    const trigger = this.triggerKey(item.job);
    const topic = this.topicKey(item.job);
    if (item.activityToken === 0) item.activityToken = ++this.activityToken;
    this.activeTriggers.set(trigger, item.activityToken);
    this.activeTopics.set(topic, item.activityToken);
    this.activeItems.add(item);

    let result: Promise<unknown>;
    try {
      result = Promise.resolve(operation());
    } catch (error) {
      result = Promise.reject(error);
    }
    const task = result.then(
      () => {
        if (!this.disposed && !item.cancelled) {
          this.rememberDeliveredTrigger(item.job);
          this.rememberDeliveredTopic(item.job);
        }
        afterSettle(true);
      },
      error => {
        afterSettle(false);
        this.reportError(error, item.job);
      },
    );
    this.activeTasks.add(task);
    void task.finally(() => {
      this.activeTasks.delete(task);
      this.activeItems.delete(item);
      if (this.activeTriggers.get(trigger) === item.activityToken) this.activeTriggers.delete(trigger);
      if (this.activeTopics.get(topic) === item.activityToken) this.activeTopics.delete(topic);
      if (!this.disposed) this.runAvailable();
    });
  }

  private checkEligibility(job: PhoneSchedulerJob, snapshot: StableSchedulerSnapshot): boolean {
    try {
      return this.dependencies.isEligible(job, snapshot);
    } catch (error) {
      this.reportError(error, job);
      return false;
    }
  }

  private reportError(error: unknown, job: PhoneSchedulerJob): void {
    try {
      this.dependencies.onError?.(error, job);
    } catch {
      // Error reporting must never create a second rejected control path.
    }
  }

  private isCoolingDown(job: PhoneSchedulerJob, snapshot: StableSchedulerSnapshot): boolean {
    const lastTurn = this.contactLastStartedTurn.get(this.contactKey(job));
    return lastTurn !== undefined && snapshot.storyTurn - lastTurn.turn < this.contactCooldownInStoryTurns;
  }

  private reserveAiConversation(job: PhoneSchedulerJob): boolean {
    const scope = this.snapshotScope(job);
    const admitted = this.admittedAiConversations.get(scope) ?? new Set<string>();
    if (!admitted.has(job.conversationId) && admitted.size >= this.maxAIConversationsPerSnapshot) return false;
    admitted.add(job.conversationId);
    this.admittedAiConversations.set(scope, admitted);
    if (!this.committedAiConversations.has(scope)) this.committedAiConversations.set(scope, new Set());
    return true;
  }

  private releaseAiConversation(job: PhoneSchedulerJob): void {
    const scope = this.snapshotScope(job);
    if (!this.committedAiConversations.get(scope)?.has(job.conversationId)) {
      this.admittedAiConversations.get(scope)?.delete(job.conversationId);
    }
  }

  private cancelQueued(predicate: (item: QueuedJob) => boolean): void {
    for (const item of [...this.queue]) {
      if (predicate(item)) this.removeQueued(item);
    }
  }

  private removeQueued(item: QueuedJob, starting = false): void {
    const index = this.queue.indexOf(item);
    if (index === -1) return;
    this.queue.splice(index, 1);
    this.queuedTriggers.delete(this.triggerKey(item.job));
    this.queuedTopics.delete(this.topicKey(item.job));
    if (!starting) this.releaseAiConversation(item.job);
  }

  private isSupportedJob(job: PhoneSchedulerJob): boolean {
    if (!job || typeof job !== 'object') return false;
    const candidate = job as PhoneSchedulerJob;
    const strings = [
      candidate.triggerKey,
      candidate.sessionKey,
      candidate.snapshotKey,
      candidate.conversationId,
      candidate.contactKey,
      candidate.topicKey,
      candidate.topicVersion,
    ];
    if (strings.some(value => typeof value !== 'string' || value.length === 0)) return false;
    if (!Object.hasOwn(PRIORITY_ORDER, candidate.priority) || !isPlainStructuredData(candidate.payload)) return false;
    if (candidate.source === 'deterministic_notice') return candidate.requiresAi === false;
    if (!AI_SOURCES.has(candidate.source) || candidate.requiresAi !== true) return false;
    return candidate.source !== 'waiting_report' || this.hasWaitingReportRecord(candidate.payload);
  }

  private copyJob(job: PhoneSchedulerJob): PhoneSchedulerJob | undefined {
    try {
      return deepFreeze(structuredClone(job));
    } catch {
      return undefined;
    }
  }

  private copySnapshot(snapshot: StableSchedulerSnapshot): StableSchedulerSnapshot {
    if (typeof snapshot.sessionKey !== 'string' || snapshot.sessionKey.trim().length === 0) {
      throw new TypeError('snapshot sessionKey must be a non-empty string');
    }
    if (typeof snapshot.snapshotKey !== 'string' || snapshot.snapshotKey.trim().length === 0) {
      throw new TypeError('snapshot snapshotKey must be a non-empty string');
    }
    nonNegativeSafeInteger('snapshot storyTurn', snapshot.storyTurn, Number.NaN);
    return Object.freeze({ ...snapshot });
  }

  private hasDeliveredTrigger(job: PhoneSchedulerJob): boolean {
    return this.deliveredTriggers.get(job.sessionKey)?.has(job.triggerKey) ?? false;
  }

  private hasDeliveredTopic(job: PhoneSchedulerJob): boolean {
    return this.deliveredTopics.get(job.sessionKey)?.get(job.topicKey) === job.topicVersion;
  }

  private rememberDeliveredTrigger(job: PhoneSchedulerJob): void {
    const cache = this.deliveredTriggers.get(job.sessionKey) ?? new Map<string, true>();
    cache.delete(job.triggerKey);
    cache.set(job.triggerKey, true);
    this.trimCache(cache);
    if (cache.size > 0) this.deliveredTriggers.set(job.sessionKey, cache);
  }

  private rememberDeliveredTopic(job: PhoneSchedulerJob): void {
    const cache = this.deliveredTopics.get(job.sessionKey) ?? new Map<string, string>();
    cache.delete(job.topicKey);
    cache.set(job.topicKey, job.topicVersion);
    this.trimCache(cache);
    if (cache.size > 0) this.deliveredTopics.set(job.sessionKey, cache);
  }

  private trimCache<T>(cache: Map<string, T>): void {
    while (cache.size > this.deduplicationCacheSize) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      cache.delete(oldest);
    }
  }

  private hasWaitingReportRecord(payload: SchedulerPayload): boolean {
    return (
      payload !== null &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof payload.recordId === 'string' &&
      payload.recordId.length > 0
    );
  }

  private decrementActiveScope(scope: string): void {
    const remaining = (this.activeAiScopes.get(scope) ?? 1) - 1;
    if (remaining <= 0) this.activeAiScopes.delete(scope);
    else this.activeAiScopes.set(scope, remaining);
  }

  private pruneQuotaScopes(): void {
    const scope = this.currentSnapshot ? this.snapshotScope(this.currentSnapshot) : undefined;
    for (const key of this.admittedAiConversations.keys()) {
      if (key !== scope && !this.activeAiScopes.has(key)) this.admittedAiConversations.delete(key);
    }
    for (const key of this.committedAiConversations.keys()) {
      if (key !== scope && !this.activeAiScopes.has(key)) this.committedAiConversations.delete(key);
    }
  }

  private deleteSessionKeys(values: Set<string>, sessionKey: string): void {
    const prefix = `${sessionKey}\u0000`;
    for (const value of values) if (value.startsWith(prefix)) values.delete(value);
  }

  private deleteSessionMapKeys<T>(values: Map<string, T>, sessionKey: string): void {
    const prefix = `${sessionKey}\u0000`;
    for (const value of values.keys()) if (value.startsWith(prefix)) values.delete(value);
  }

  private matchesSnapshot(job: PhoneSchedulerJob, snapshot: StableSchedulerSnapshot): boolean {
    return job.sessionKey === snapshot.sessionKey && job.snapshotKey === snapshot.snapshotKey;
  }

  private triggerKey(job: PhoneSchedulerJob): string {
    return `${job.sessionKey}\u0000${job.triggerKey}`;
  }

  private topicKey(job: PhoneSchedulerJob): string {
    return `${job.sessionKey}\u0000${job.topicKey}\u0000${job.topicVersion}`;
  }

  private snapshotScope(job: Pick<PhoneSchedulerJob, 'sessionKey' | 'snapshotKey'>): string {
    return `${job.sessionKey}\u0000${job.snapshotKey}`;
  }

  private conversationKey(job: PhoneSchedulerJob): string {
    return `${this.snapshotScope(job)}\u0000${job.conversationId}`;
  }

  private contactKey(job: PhoneSchedulerJob): string {
    return `${job.sessionKey}\u0000${job.contactKey}`;
  }
}

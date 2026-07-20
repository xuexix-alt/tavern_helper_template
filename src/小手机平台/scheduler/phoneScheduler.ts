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

export type PhoneSchedulerJob =
  | (JobFields & {
      source: Exclude<AiSchedulerSource, 'waiting_report'>;
      requiresAi: true;
      payload: Record<string, unknown>;
    })
  | (JobFields & {
      source: 'waiting_report';
      requiresAi: true;
      payload: Record<string, unknown> & { recordId: string };
    })
  | (JobFields & {
      source: 'deterministic_notice';
      requiresAi: false;
      payload: Record<string, unknown>;
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
}

interface QueuedJob {
  job: PhoneSchedulerJob;
  sequence: number;
}

const PRIORITY_ORDER: Record<SchedulerPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const AI_SOURCES = new Set<string>([
  'network_change',
  'task_intel_change',
  'role_threshold',
  'waiting_report',
  'low_frequency_daily',
]);

export class ControlledPhoneScheduler {
  private readonly maxAIConversationsPerSnapshot: number;
  private readonly contactCooldownInStoryTurns: number;
  private readonly oneInflightRequestPerConversation: boolean;
  private readonly suppressSameTopicUntilChanged: boolean;
  private currentSnapshot: StableSchedulerSnapshot | undefined;
  private queue: QueuedJob[] = [];
  private sequence = 0;
  private disposed = false;
  private running = false;
  private readonly queuedTriggers = new Set<string>();
  private readonly activeTriggers = new Set<string>();
  private readonly deliveredTriggers = new Set<string>();
  private readonly queuedTopics = new Set<string>();
  private readonly activeTopics = new Set<string>();
  private readonly deliveredTopics = new Set<string>();
  private readonly inflightConversations = new Set<string>();
  private readonly activeTasks = new Set<Promise<void>>();
  private readonly admittedAiConversations = new Map<string, Set<string>>();
  private readonly committedAiConversations = new Map<string, Set<string>>();
  private readonly contactLastStartedTurn = new Map<string, number>();

  constructor(
    private readonly dependencies: PhoneSchedulerDependencies,
    options: PhoneSchedulerOptions = {},
  ) {
    this.maxAIConversationsPerSnapshot = Math.max(0, options.maxAIConversationsPerSnapshot ?? 2);
    this.contactCooldownInStoryTurns = Math.max(0, options.contactCooldownInStoryTurns ?? 2);
    this.oneInflightRequestPerConversation = options.oneInflightRequestPerConversation ?? true;
    this.suppressSameTopicUntilChanged = options.suppressSameTopicUntilChanged ?? true;
  }

  setSnapshot(snapshot: StableSchedulerSnapshot | undefined): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot ? Object.freeze({ ...snapshot }) : undefined;
    this.cancelQueued(item => !snapshot || !this.matchesSnapshot(item.job, snapshot));
  }

  updateSnapshot(snapshot: StableSchedulerSnapshot | undefined): void {
    this.setSnapshot(snapshot);
  }

  enqueue(job: PhoneSchedulerJob): boolean {
    if (this.disposed || !this.isSupportedJob(job)) return false;
    const trigger = this.triggerKey(job);
    const topic = this.topicKey(job);
    if (
      this.queuedTriggers.has(trigger) ||
      this.activeTriggers.has(trigger) ||
      this.deliveredTriggers.has(trigger) ||
      (this.suppressSameTopicUntilChanged &&
        (this.queuedTopics.has(topic) || this.activeTopics.has(topic) || this.deliveredTopics.has(topic)))
    ) {
      return false;
    }
    this.queue.push({ job: this.copyJob(job), sequence: this.sequence++ });
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
    this.cancelQueued(item => item.job.sessionKey === sessionKey);
    if (this.currentSnapshot?.sessionKey === sessionKey) this.currentSnapshot = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.currentSnapshot = undefined;
    this.cancelQueued(() => true);
  }

  async whenIdle(): Promise<void> {
    while (this.activeTasks.size > 0) {
      await Promise.all([...this.activeTasks]);
      await Promise.resolve();
    }
  }

  private startAi(item: QueuedJob, storyTurn: number, inflightKey: string): void {
    const contact = this.contactKey(item.job);
    const previousContactTurn = this.contactLastStartedTurn.get(contact);
    this.contactLastStartedTurn.set(contact, storyTurn);
    this.inflightConversations.add(inflightKey);
    this.start(
      item,
      () => this.dependencies.dispatchAi(item.job),
      success => {
        this.inflightConversations.delete(inflightKey);
        if (success) {
          this.committedAiConversations.get(this.snapshotScope(item.job))?.add(item.job.conversationId);
        } else {
          this.releaseAiConversation(item.job);
          if (previousContactTurn === undefined) this.contactLastStartedTurn.delete(contact);
          else this.contactLastStartedTurn.set(contact, previousContactTurn);
        }
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
    this.activeTriggers.add(trigger);
    this.activeTopics.add(topic);

    let result: Promise<unknown>;
    try {
      result = Promise.resolve(operation());
    } catch (error) {
      result = Promise.reject(error);
    }
    const task = result.then(
      () => {
        this.deliveredTriggers.add(trigger);
        this.deliveredTopics.add(topic);
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
      this.activeTriggers.delete(trigger);
      this.activeTopics.delete(topic);
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
    return lastTurn !== undefined && snapshot.storyTurn - lastTurn < this.contactCooldownInStoryTurns;
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
    if (!(candidate.priority in PRIORITY_ORDER) || !candidate.payload || typeof candidate.payload !== 'object')
      return false;
    if (candidate.source === 'deterministic_notice') return candidate.requiresAi === false;
    if (!AI_SOURCES.has(candidate.source) || candidate.requiresAi !== true) return false;
    return (
      candidate.source !== 'waiting_report' ||
      (typeof candidate.payload.recordId === 'string' && candidate.payload.recordId.length > 0)
    );
  }

  private copyJob(job: PhoneSchedulerJob): PhoneSchedulerJob {
    return Object.freeze({ ...job, payload: Object.freeze({ ...job.payload }) }) as unknown as PhoneSchedulerJob;
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

  private snapshotScope(job: PhoneSchedulerJob): string {
    return `${job.sessionKey}\u0000${job.snapshotKey}`;
  }

  private conversationKey(job: PhoneSchedulerJob): string {
    return `${this.snapshotScope(job)}\u0000${job.conversationId}`;
  }

  private contactKey(job: PhoneSchedulerJob): string {
    return `${job.sessionKey}\u0000${job.contactKey}`;
  }
}

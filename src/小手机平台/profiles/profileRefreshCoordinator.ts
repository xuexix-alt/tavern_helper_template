import type { PhoneBusinessRecord, PhoneDb } from '../data/phoneDb';
import type { ControlledPhoneScheduler, PhoneSchedulerJob } from '../scheduler/phoneScheduler';
import type { AiDetailedResponse } from '../ai/providers';
import {
  buildProfileAnalysisPrompt,
  buildProfileViewRecord,
  mergeDynamicProfile,
  parseProfileAnalysisOutput,
} from './profileAnalysis';
import { commitStoryCounter, reconcileStoryCounter, type StoryCounterState } from './profileSources';
import type {
  DynamicProfileDocument,
  ProfileAnalysisSource,
  ProfileAnalysisState,
  ProfilePerson,
  ProfileRefreshRunResult,
  ProfileRefreshTrigger,
  ProfileStoryMessage,
  ProfileViewRecordData,
  ProfileEditPatch,
  ProfileStateEvent,
  ProfileVersion,
} from './profileTypes';

export interface ProfileRefreshSettings {
  autoRefreshEvery: number;
  promptProfileMaxChars: number;
}

export interface ProfileRefreshDependencies {
  db: PhoneDb;
  scheduler: ControlledPhoneScheduler;
  now(): number;
  getSessionKey(): string;
  getSnapshotKey(): string;
  getStoryMessages(): readonly ProfileStoryMessage[];
  listAddedPeople(): Promise<readonly ProfilePerson[]>;
  collectSource(person: ProfilePerson, state: ProfileAnalysisState | null): Promise<ProfileAnalysisSource>;
  requestAnalysis(prompt: string): Promise<string | AiDetailedResponse>;
  writeWorldbook(document: DynamicProfileDocument, aliases: readonly string[], maxCharacters: number): Promise<void>;
  onAllRunComplete?(run: ProfileRefreshRunResult): Promise<void>;
}

export type ProfileStateListener = (event: ProfileStateEvent) => void;

interface ScheduledRefresh {
  runId: string;
  trigger: ProfileRefreshTrigger;
  person: ProfilePerson;
  sessionKey: string;
}

interface StoredRun extends PhoneBusinessRecord {
  trigger: ProfileRefreshTrigger;
  people: Array<{ personId: string; status: 'refreshing' | 'success' | 'failed'; error?: string }>;
}

interface StoredStoryState extends PhoneBusinessRecord, StoryCounterState {}

const SETTINGS_ID = 'dynamic-profile-settings';
const STORY_STATE_ID = 'dynamic-profile-story';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAnalysisState(record: PhoneBusinessRecord): record is PhoneBusinessRecord & ProfileAnalysisState {
  return (
    typeof record.personId === 'string' &&
    (record.status === 'idle' ||
      record.status === 'refreshing' ||
      record.status === 'success' ||
      record.status === 'failed')
  );
}

function isStoredRun(record: PhoneBusinessRecord): record is StoredRun {
  return Array.isArray(record.people) && typeof record.trigger === 'string';
}

function validateSettings(settings: ProfileRefreshSettings): ProfileRefreshSettings {
  if (
    !Number.isSafeInteger(settings.autoRefreshEvery) ||
    settings.autoRefreshEvery < 1 ||
    settings.autoRefreshEvery > 50
  ) {
    throw new RangeError('档案自动刷新阈值必须是 1 到 50 的整数');
  }
  if (!Number.isSafeInteger(settings.promptProfileMaxChars) || settings.promptProfileMaxChars <= 0) {
    throw new RangeError('档案提示词字符上限必须是正安全整数');
  }
  return { ...settings };
}

export class ProfileRefreshCoordinator {
  private readonly defaults: ProfileRefreshSettings;
  private readonly scheduled = new Map<string, ScheduledRefresh>();
  private readonly runUpdateTails = new Map<string, Promise<void>>();
  private batchSequence = 0;
  private batchTail: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private readonly stateListeners = new Set<ProfileStateListener>();

  constructor(
    private readonly dependencies: ProfileRefreshDependencies,
    defaults: ProfileRefreshSettings = { autoRefreshEvery: 20, promptProfileMaxChars: 2_000 },
  ) {
    this.defaults = validateSettings(defaults);
  }

  async getSettings(): Promise<ProfileRefreshSettings> {
    const sessionKey = this.dependencies.getSessionKey();
    const record = (await this.dependencies.db.listRecords('profileSettings', sessionKey)).find(
      item => item.id === SETTINGS_ID,
    );
    if (!record) return { ...this.defaults };
    return validateSettings({
      autoRefreshEvery: Number(record.autoRefreshEvery),
      promptProfileMaxChars: Number(record.promptProfileMaxChars),
    });
  }

  async saveSettings(settings: ProfileRefreshSettings): Promise<void> {
    const validated = validateSettings(settings);
    const sessionKey = this.dependencies.getSessionKey();
    await this.dependencies.db.putRecord('profileSettings', {
      id: SETTINGS_ID,
      sessionKey,
      ...validated,
    });
  }

  async getStoryProgress(): Promise<number> {
    const sessionKey = this.dependencies.getSessionKey();
    return (await this.readStoryState(sessionKey))?.count ?? 0;
  }

  async getAnalysisState(personId: string): Promise<ProfileAnalysisState | null> {
    const sessionKey = this.dependencies.getSessionKey();
    const record = (await this.dependencies.db.listRecords('profileAnalysis', sessionKey)).find(
      item => item.id === personId,
    );
    if (!record || !isAnalysisState(record)) return null;
    return {
      sessionKey,
      personId,
      ...(typeof record.lastWechatMessageId === 'string' ? { lastWechatMessageId: record.lastWechatMessageId } : {}),
      ...(typeof record.lastWechatCreatedAt === 'number' ? { lastWechatCreatedAt: record.lastWechatCreatedAt } : {}),
      ...(typeof record.lastSuccessfulRefreshAt === 'number'
        ? { lastSuccessfulRefreshAt: record.lastSuccessfulRefreshAt }
        : {}),
      status: record.status,
      ...(typeof record.lastError === 'string' ? { lastError: record.lastError } : {}),
      ...(typeof record.lastFallbackReason === 'string' ? { lastFallbackReason: record.lastFallbackReason } : {}),
      ...(typeof record.lastRawResponse === 'string' ? { lastRawResponse: record.lastRawResponse } : {}),
      ...(typeof record.lastReasoningContent === 'string' ? { lastReasoningContent: record.lastReasoningContent } : {}),
    };
  }

  watchProfiles(listener: ProfileStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  async listProfiles(): Promise<
    readonly (ProfileViewRecordData & {
      personId: string;
      status: ProfileAnalysisState['status'];
      lastError?: string;
    })[]
  > {
    const sessionKey = this.dependencies.getSessionKey();
    const [views, states] = await Promise.all([
      this.dependencies.db.listRecords('profileViews', sessionKey),
      this.dependencies.db.listRecords('profileAnalysis', sessionKey),
    ]);
    const stateByPerson = new Map(states.filter(isAnalysisState).map(state => [state.personId, state] as const));
    return views.flatMap(record => {
      const personId = typeof record.personId === 'string' ? record.personId : record.id;
      if (!record.document || typeof record.document !== 'object') return [];
      const state = stateByPerson.get(personId);
      return [
        {
          document: structuredClone(record.document) as DynamicProfileDocument,
          playerActionAdvice: typeof record.playerActionAdvice === 'string' ? record.playerActionAdvice : '',
          sourceStoryIds: Array.isArray(record.sourceStoryIds)
            ? record.sourceStoryIds.filter((item): item is string => typeof item === 'string')
            : [],
          newWechatMessageIds: Array.isArray(record.newWechatMessageIds)
            ? record.newWechatMessageIds.filter((item): item is string => typeof item === 'string')
            : [],
          analysisNarrative:
            typeof record.analysisNarrative === 'string' ? record.analysisNarrative : '暂无额外分析说明',
          changes: Array.isArray(record.changes) ? record.changes : [],
          rawResponse: typeof record.rawResponse === 'string' ? record.rawResponse : undefined,
          reasoningContent: typeof record.reasoningContent === 'string' ? record.reasoningContent : undefined,
          versions: Array.isArray(record.versions) ? record.versions : [],
          personId,
          status: state?.status ?? 'idle',
          ...(typeof state?.lastError === 'string' ? { lastError: state.lastError } : {}),
        },
      ];
    });
  }

  async getProfileView(personId: string): Promise<(ProfileViewRecordData & { personId: string }) | null> {
    const sessionKey = this.dependencies.getSessionKey();
    const record = (await this.dependencies.db.listRecords('profileViews', sessionKey)).find(
      item => item.id === personId || item.personId === personId,
    );
    if (!record || !record.document || typeof record.document !== 'object') return null;
    return {
      document: structuredClone(record.document) as DynamicProfileDocument,
      playerActionAdvice: typeof record.playerActionAdvice === 'string' ? record.playerActionAdvice : '',
      sourceStoryIds: Array.isArray(record.sourceStoryIds)
        ? record.sourceStoryIds.filter((item): item is string => typeof item === 'string')
        : [],
      newWechatMessageIds: Array.isArray(record.newWechatMessageIds)
        ? record.newWechatMessageIds.filter((item): item is string => typeof item === 'string')
        : [],
      analysisNarrative: typeof record.analysisNarrative === 'string' ? record.analysisNarrative : '暂无额外分析说明',
      changes: Array.isArray(record.changes) ? structuredClone(record.changes) : [],
      ...(typeof record.rawResponse === 'string' ? { rawResponse: record.rawResponse } : {}),
      ...(typeof record.reasoningContent === 'string' ? { reasoningContent: record.reasoningContent } : {}),
      versions: Array.isArray(record.versions) ? structuredClone(record.versions) : [],
      personId,
    };
  }

  async saveProfileEdit(personId: string, patch: ProfileEditPatch): Promise<void> {
    const view = await this.getProfileView(personId);
    if (!view) throw new Error(`未找到人物档案：${personId}`);
    const person = (await this.dependencies.listAddedPeople()).find(item => item.id === personId);
    if (!person) throw new Error(`未找到已添加联系人：${personId}`);
    const document: DynamicProfileDocument = {
      ...view.document,
      ...(patch.basicInfoAdditions ? { basicInfoAdditions: Object.freeze([...patch.basicInfoAdditions]) } : {}),
      ...(patch.behaviorTuning !== undefined ? { behaviorTuning: patch.behaviorTuning.trim() } : {}),
      ...(patch.personalityTuning !== undefined ? { personalityTuning: patch.personalityTuning.trim() } : {}),
      ...(patch.speechStyleTuning !== undefined ? { speechStyleTuning: patch.speechStyleTuning.trim() } : {}),
      ...(patch.currentGoals !== undefined ? { currentGoals: patch.currentGoals.trim() } : {}),
      ...(patch.currentSituationSummary !== undefined
        ? { currentSituationSummary: patch.currentSituationSummary.trim() }
        : {}),
      ...(patch.relationshipInterpretation !== undefined
        ? { relationshipInterpretation: patch.relationshipInterpretation.trim() }
        : {}),
      ...(patch.storyInteractionSummary !== undefined
        ? { storyInteractionSummary: patch.storyInteractionSummary.trim() }
        : {}),
      ...(patch.chatInteractionSummary !== undefined
        ? { chatInteractionSummary: patch.chatInteractionSummary.trim() }
        : {}),
      updatedAt: this.dependencies.now(),
    };
    const savedAt = this.dependencies.now();
    await this.dependencies.writeWorldbook(document, person.aliases, (await this.getSettings()).promptProfileMaxChars);
    const nextVersion = this.makeVersion(
      view,
      document,
      patch.playerActionAdvice ?? view.playerActionAdvice,
      'player',
      savedAt,
    );
    await this.writeView(personId, view, {
      document,
      playerActionAdvice: patch.playerActionAdvice ?? view.playerActionAdvice,
      versions: [...view.versions, nextVersion].slice(-10),
    });
    this.notify({ personId, status: 'success' });
  }

  async restoreProfileVersion(personId: string, versionId: string): Promise<void> {
    const view = await this.getProfileView(personId);
    if (!view) throw new Error(`未找到人物档案：${personId}`);
    const target = view.versions.find(version => version.id === versionId);
    if (!target) throw new Error(`未找到档案版本：${versionId}`);
    const person = (await this.dependencies.listAddedPeople()).find(item => item.id === personId);
    if (!person) throw new Error(`未找到已添加联系人：${personId}`);
    const document = { ...structuredClone(target.document), updatedAt: this.dependencies.now() };
    await this.dependencies.writeWorldbook(document, person.aliases, (await this.getSettings()).promptProfileMaxChars);
    const savedAt = this.dependencies.now();
    const nextVersion = this.makeVersion(view, document, target.playerActionAdvice, 'restore', savedAt);
    await this.writeView(personId, view, {
      document,
      playerActionAdvice: target.playerActionAdvice,
      analysisNarrative: target.analysisNarrative,
      changes: target.changes,
      versions: [...view.versions, nextVersion].slice(-10),
    });
    this.notify({ personId, status: 'success' });
  }

  async reconcileStory(
    storyMessages: readonly ProfileStoryMessage[] = this.dependencies.getStoryMessages(),
  ): Promise<ProfileRefreshRunResult | null> {
    this.assertActive();
    const sessionKey = this.dependencies.getSessionKey();
    const previous = await this.readStoryState(sessionKey);
    const reconciled = reconcileStoryCounter(previous ?? undefined, storyMessages);
    await this.writeStoryState(sessionKey, reconciled);
    const settings = await this.getSettings();
    if (reconciled.count < settings.autoRefreshEvery) return null;

    const result = await this.refreshAll('auto');
    await this.writeStoryState(sessionKey, commitStoryCounter(reconciled));
    return result;
  }

  async refreshPerson(
    personId: string,
    trigger: Extract<ProfileRefreshTrigger, 'person-manual'> = 'person-manual',
  ): Promise<void> {
    const people = await this.dependencies.listAddedPeople();
    const person = people.find(item => item.id === personId);
    if (!person) throw new Error(`未找到已添加联系人：${personId}`);
    const execute = () => this.runManualPerson(person, trigger);
    const result = this.batchTail.then(execute, execute);
    this.batchTail = result.catch(() => undefined);
    await result;
  }

  async refreshAll(
    trigger: Extract<ProfileRefreshTrigger, 'auto' | 'all-manual'> = 'all-manual',
  ): Promise<ProfileRefreshRunResult> {
    return this.queueBatch(await this.dependencies.listAddedPeople(), trigger);
  }

  async retryFailed(): Promise<ProfileRefreshRunResult> {
    const people = await this.dependencies.listAddedPeople();
    const states = await Promise.all(people.map(person => this.getAnalysisState(person.id)));
    return this.queueBatch(
      people.filter((_, index) => states[index]?.status === 'failed'),
      'retry-failed',
    );
  }

  async dispatchScheduledRefresh(job: PhoneSchedulerJob): Promise<void> {
    if (
      job.source !== 'profile_refresh' ||
      !job.requiresAi ||
      !job.payload ||
      typeof job.payload !== 'object' ||
      Array.isArray(job.payload)
    ) {
      throw new Error('收到非档案刷新调度任务');
    }
    const key = typeof job.payload.workKey === 'string' ? job.payload.workKey : '';
    const scheduled = this.scheduled.get(key);
    if (!scheduled) throw new Error(`档案刷新任务已失效：${key || job.triggerKey}`);
    await this.refreshScheduledPerson(scheduled);
  }

  cancelSession(sessionKey: string): void {
    this.dependencies.scheduler.cancelSession(sessionKey);
    for (const [key, item] of this.scheduled) {
      if (item.sessionKey === sessionKey) this.scheduled.delete(key);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.scheduled.clear();
    this.dependencies.scheduler.dispose();
  }

  private queueBatch(
    people: readonly ProfilePerson[],
    trigger: ProfileRefreshTrigger,
  ): Promise<ProfileRefreshRunResult> {
    const execute = () => this.runBatch(people, trigger);
    const result = this.batchTail.then(execute, execute);
    this.batchTail = result.catch(() => undefined);
    return result;
  }

  private async runManualPerson(person: ProfilePerson, trigger: 'person-manual'): Promise<void> {
    this.assertActive();
    const sessionKey = this.dependencies.getSessionKey();
    const runId = `profile-run:${this.dependencies.now()}:${++this.batchSequence}`;
    await this.dependencies.db.putRecord('profileRuns', {
      id: runId,
      sessionKey,
      trigger,
      people: [{ personId: person.id, status: 'refreshing' }],
    } satisfies StoredRun);
    await this.refreshScheduledPerson({ runId, trigger, person, sessionKey });
  }

  private async runBatch(
    people: readonly ProfilePerson[],
    trigger: ProfileRefreshTrigger,
  ): Promise<ProfileRefreshRunResult> {
    this.assertActive();
    const sessionKey = this.dependencies.getSessionKey();
    const snapshotKey = this.dependencies.getSnapshotKey();
    const now = this.dependencies.now();
    const runId = `profile-run:${now}:${++this.batchSequence}`;
    const run: StoredRun = {
      id: runId,
      sessionKey,
      trigger,
      people: people.map(person => ({ personId: person.id, status: 'refreshing' })),
    };
    await this.dependencies.db.putRecord('profileRuns', run);
    this.dependencies.scheduler.setSnapshot({
      sessionKey,
      snapshotKey,
      storyTurn: this.storyTurn(),
    });

    for (const person of people) {
      const workKey = `${runId}\u0000${person.id}`;
      this.scheduled.set(workKey, { runId, trigger, person, sessionKey });
      const accepted = this.dependencies.scheduler.enqueue({
        triggerKey: workKey,
        sessionKey,
        snapshotKey,
        conversationId: `private:${person.id}`,
        contactKey: person.id,
        topicKey: `profile:${person.id}:${runId}`,
        topicVersion: runId,
        priority: 'P1',
        source: 'profile_refresh',
        requiresAi: true,
        payload: { workKey, runId, personId: person.id, trigger },
      });
      if (!accepted) {
        this.scheduled.delete(workKey);
        await this.updateRunPerson(runId, sessionKey, person.id, 'failed', '档案刷新任务未被调度器接受');
      }
    }
    this.dependencies.scheduler.runAvailable();
    await this.dependencies.scheduler.whenIdle();

    for (const key of [...this.scheduled.keys()]) {
      if (key.startsWith(`${runId}\u0000`)) this.scheduled.delete(key);
    }
    const stored = await this.readRun(runId, sessionKey);
    const result: ProfileRefreshRunResult = {
      runId,
      trigger,
      people: stored.people.map(person =>
        person.status === 'success'
          ? { personId: person.personId, status: 'success' as const }
          : {
              personId: person.personId,
              status: 'failed' as const,
              error: person.error || '档案刷新未完成',
            },
      ),
    };
    if ((trigger === 'auto' || trigger === 'all-manual') && result.people.some(person => person.status === 'success')) {
      await this.dependencies.onAllRunComplete?.(result);
    }
    return result;
  }

  private async refreshScheduledPerson(scheduled: ScheduledRefresh): Promise<void> {
    const oldState = await this.getAnalysisState(scheduled.person.id);
    await this.writeAnalysisState({
      ...(oldState ?? {
        sessionKey: scheduled.sessionKey,
        personId: scheduled.person.id,
        status: 'idle' as const,
      }),
      status: 'refreshing',
      lastError: undefined,
    });
    this.notify({ personId: scheduled.person.id, status: 'refreshing' });
    let detailedResponse: AiDetailedResponse | undefined;
    try {
      this.assertCapturedSession(scheduled.sessionKey);
      const source = await this.dependencies.collectSource(scheduled.person, oldState);
      this.assertCapturedSession(scheduled.sessionKey);
      const prompt = buildProfileAnalysisPrompt(source);
      const response = await this.dependencies.requestAnalysis(prompt);
      const detailed: AiDetailedResponse = typeof response === 'string' ? { content: response } : response;
      detailedResponse = detailed;
      let output;
      try {
        output = parseProfileAnalysisOutput(detailed.content, source);
      } catch (error) {
        if (error && typeof error === 'object') Object.assign(error, { profileResponse: detailed });
        throw error;
      }
      this.assertCapturedSession(scheduled.sessionKey);
      const document = mergeDynamicProfile(
        source,
        output,
        source.wechatNew.slice(-4).map(message => `${message.sender}: ${message.content}`),
        this.dependencies.now(),
      );
      const settings = await this.getSettings();
      await this.dependencies.writeWorldbook(document, scheduled.person.aliases, settings.promptProfileMaxChars);
      this.assertCapturedSession(scheduled.sessionKey);

      const previousView = await this.getProfileView(scheduled.person.id);
      const view = buildProfileViewRecord(source, output, document);
      const version = this.makeVersion(
        previousView ?? ({ ...view, versions: [] } as ProfileViewRecordData & { personId: string }),
        document,
        output.playerActionAdvice,
        'ai',
        this.dependencies.now(),
      );
      await this.writeView(scheduled.person.id, previousView, {
        ...view,
        rawResponse: detailed.content,
        ...(detailed.reasoningContent ? { reasoningContent: detailed.reasoningContent } : {}),
        versions: [...(previousView?.versions ?? []), version].slice(-10),
      });
      const lastWechatMessageId = source.wechatNew.at(-1)?.id ?? oldState?.lastWechatMessageId;
      await this.writeAnalysisState({
        sessionKey: scheduled.sessionKey,
        personId: scheduled.person.id,
        ...(lastWechatMessageId ? { lastWechatMessageId } : {}),
        lastSuccessfulRefreshAt: this.dependencies.now(),
        status: 'success',
        lastRawResponse: detailed.content,
        ...(detailed.reasoningContent ? { lastReasoningContent: detailed.reasoningContent } : {}),
      });
      this.notify({ personId: scheduled.person.id, status: 'success' });
      await this.updateRunPerson(scheduled.runId, scheduled.sessionKey, scheduled.person.id, 'success');
    } catch (error) {
      const message = errorMessage(error);
      const response =
        error && typeof error === 'object' && 'profileResponse' in error
          ? (error as { profileResponse?: AiDetailedResponse }).profileResponse
          : detailedResponse;
      await this.writeAnalysisState({
        ...(oldState ?? {
          sessionKey: scheduled.sessionKey,
          personId: scheduled.person.id,
          status: 'idle' as const,
        }),
        status: 'failed',
        lastError: message,
        ...(response?.content ? { lastRawResponse: response.content } : {}),
        ...(response?.reasoningContent ? { lastReasoningContent: response.reasoningContent } : {}),
      });
      this.notify({ personId: scheduled.person.id, status: 'failed', lastError: message });
      await this.updateRunPerson(scheduled.runId, scheduled.sessionKey, scheduled.person.id, 'failed', message);
      throw error;
    }
  }

  private async readStoryState(sessionKey: string): Promise<StoryCounterState | null> {
    const record = (await this.dependencies.db.listRecords('storyRefresh', sessionKey)).find(
      item => item.id === STORY_STATE_ID,
    ) as StoredStoryState | undefined;
    if (!record) return null;
    return {
      count: Number(record.count) || 0,
      committedFingerprints:
        record.committedFingerprints && typeof record.committedFingerprints === 'object'
          ? (record.committedFingerprints as Readonly<Record<string, string>>)
          : {},
      pendingFingerprints:
        record.pendingFingerprints && typeof record.pendingFingerprints === 'object'
          ? (record.pendingFingerprints as Readonly<Record<string, string>>)
          : {},
      changedMessageKeys: Array.isArray(record.changedMessageKeys)
        ? record.changedMessageKeys.filter((item): item is string => typeof item === 'string')
        : [],
    };
  }

  private async writeStoryState(sessionKey: string, state: StoryCounterState): Promise<void> {
    await this.dependencies.db.putRecord('storyRefresh', {
      id: STORY_STATE_ID,
      sessionKey,
      ...structuredClone(state),
    });
  }

  private async writeAnalysisState(state: ProfileAnalysisState): Promise<void> {
    const record: PhoneBusinessRecord = {
      id: state.personId,
      sessionKey: state.sessionKey,
      personId: state.personId,
      status: state.status,
    };
    if (state.lastWechatMessageId !== undefined) record.lastWechatMessageId = state.lastWechatMessageId;
    if (state.lastWechatCreatedAt !== undefined) record.lastWechatCreatedAt = state.lastWechatCreatedAt;
    if (state.lastSuccessfulRefreshAt !== undefined) record.lastSuccessfulRefreshAt = state.lastSuccessfulRefreshAt;
    if (state.lastError !== undefined) record.lastError = state.lastError;
    if (state.lastFallbackReason !== undefined) record.lastFallbackReason = state.lastFallbackReason;
    if (state.lastRawResponse !== undefined) record.lastRawResponse = state.lastRawResponse;
    if (state.lastReasoningContent !== undefined) record.lastReasoningContent = state.lastReasoningContent;
    await this.dependencies.db.putRecord('profileAnalysis', record);
  }

  private async writeView(
    personId: string,
    previous: (ProfileViewRecordData & { personId: string }) | null,
    patch: Partial<ProfileViewRecordData>,
  ): Promise<void> {
    const sessionKey = this.dependencies.getSessionKey();
    const current = previous ?? (await this.getProfileView(personId));
    await this.dependencies.db.putRecord('profileViews', {
      id: personId,
      sessionKey,
      personId,
      ...(current ?? {}),
      ...patch,
    });
  }

  private makeVersion(
    view: ProfileViewRecordData,
    document: DynamicProfileDocument,
    playerActionAdvice: string,
    source: ProfileVersion['source'],
    savedAt: number,
  ): ProfileVersion {
    return {
      id: `profile-version:${savedAt}:${document.personId}`,
      source,
      savedAt,
      document: structuredClone(document),
      playerActionAdvice,
      analysisNarrative: view.analysisNarrative,
      changes: structuredClone(view.changes),
      evidenceRefs: Object.freeze([...document.evidenceRefs]),
    };
  }

  private notify(event: ProfileStateEvent): void {
    for (const listener of this.stateListeners) {
      try {
        listener(event);
      } catch {
        // A UI listener must not break refresh persistence.
      }
    }
  }

  private async readRun(runId: string, sessionKey: string): Promise<StoredRun> {
    const record = (await this.dependencies.db.listRecords('profileRuns', sessionKey)).find(item => item.id === runId);
    if (!record || !isStoredRun(record)) throw new Error(`档案刷新批次记录丢失：${runId}`);
    return record;
  }

  private async updateRunPerson(
    runId: string,
    sessionKey: string,
    personId: string,
    status: 'success' | 'failed',
    error?: string,
  ): Promise<void> {
    const previous = this.runUpdateTails.get(runId) ?? Promise.resolve();
    const update = previous
      .catch(() => undefined)
      .then(async () => {
        const run = await this.readRun(runId, sessionKey);
        run.people = run.people.map(person =>
          person.personId === personId ? { personId, status, ...(error ? { error } : {}) } : person,
        );
        await this.dependencies.db.putRecord('profileRuns', run);
      });
    this.runUpdateTails.set(runId, update);
    try {
      await update;
    } finally {
      if (this.runUpdateTails.get(runId) === update) this.runUpdateTails.delete(runId);
    }
  }

  private storyTurn(): number {
    const value = Number(this.dependencies.getStoryMessages().at(-1)?.id);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  private assertCapturedSession(sessionKey: string): void {
    if (this.dependencies.getSessionKey() !== sessionKey) throw new Error('档案刷新已因会话切换失效');
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('档案刷新协调器已停用');
  }
}

import assert from 'node:assert/strict';

import { createMemoryPhoneDb, type PhoneDb } from '../data/phoneDb';
import { ProfileRefreshCoordinator, type ProfileRefreshDependencies } from '../profiles/profileRefreshCoordinator';
import type {
  DynamicProfileDocument,
  ProfileAnalysisSource,
  ProfileAnalysisState,
  ProfilePerson,
  ProfileStoryMessage,
} from '../profiles/profileTypes';
import { ControlledPhoneScheduler, type PhoneSchedulerJob } from '../scheduler/phoneScheduler';

const PEOPLE: readonly ProfilePerson[] = [
  { id: 'main:纪宁', name: '纪宁', aliases: ['纪医生'], temporary: false },
  { id: 'main:赵卫国', name: '赵卫国', aliases: [], temporary: false },
  { id: 'main:苏倩', name: '苏倩', aliases: [], temporary: false },
];

const STORY: readonly ProfileStoryMessage[] = Array.from({ length: 20 }, (_, index) => ({
  id: String(index + 1),
  role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
  content: `正文消息 ${index + 1}`,
}));

function analysisJson(personName: string): string {
  return JSON.stringify({
    basicInfoAdditions: [`${personName}近期参与庇护所工作`],
    personalityTuning: '近期表达更加直接',
    currentSituationSummary: '目前位于公共区域',
    relationshipInterpretation: '与玩家保持协作关系',
    storyInteractionSummary: '最近在正文中完成一次协作',
    chatInteractionSummary: '聊天小结：确认了近期安排',
    playerActionAdvice: '可以继续确认物资安排',
    evidenceRefs: ['story:20', 'wechat:new'],
  });
}

interface Fixture {
  coordinator: ProfileRefreshCoordinator;
  db: PhoneDb;
  written: Map<string, DynamicProfileDocument>;
  analysisCalls: string[];
  setRejectNext(error: Error): void;
  setAlwaysFail(personId: string | null): void;
  maxConcurrency(): number;
}

function createFixture(
  people: readonly ProfilePerson[] = PEOPLE,
  options: { delayRunUpdates?: boolean } = {},
): Fixture {
  const memoryDb = createMemoryPhoneDb();
  const db: PhoneDb = options.delayRunUpdates
    ? {
        ...memoryDb,
        async putRecord(store, record) {
          if (
            store === 'profileRuns' &&
            Array.isArray(record.people) &&
            record.people.some(
              item => item && typeof item === 'object' && 'status' in item && item.status !== 'refreshing',
            )
          ) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          await memoryDb.putRecord(store, record);
        },
      }
    : memoryDb;
  const written = new Map<string, DynamicProfileDocument>();
  const analysisCalls: string[] = [];
  let rejectNext: Error | null = null;
  let alwaysFail: string | null = null;
  let active = 0;
  let maxActive = 0;
  let coordinator: ProfileRefreshCoordinator;

  const scheduler = new ControlledPhoneScheduler(
    {
      isEligible: () => true,
      dispatchAi: (job: PhoneSchedulerJob) => coordinator.dispatchScheduledRefresh(job),
      deliverDeterministic: async () => undefined,
      onError: () => undefined,
    },
    {
      maxAIConversationsPerSnapshot: Number.MAX_SAFE_INTEGER,
      contactCooldownInStoryTurns: 0,
      maxInflightAIRequests: 2,
    },
  );

  const dependencies: ProfileRefreshDependencies = {
    db,
    scheduler,
    now: (() => {
      let value = 1_000;
      return () => ++value;
    })(),
    getSessionKey: () => 'session-a',
    getSnapshotKey: () => 'snapshot-a',
    getStoryMessages: () => STORY,
    listAddedPeople: async () => people,
    collectSource: async (person, state) => sourceFor(person, state),
    requestAnalysis: async prompt => {
      const person = people.find(item => prompt.includes(`"personId":"${item.id}"`)) ?? people[0];
      analysisCalls.push(person.id);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return analysisJson(person.name);
    },
    writeWorldbook: async (document: DynamicProfileDocument) => {
      if (rejectNext) {
        const error = rejectNext;
        rejectNext = null;
        throw error;
      }
      if (alwaysFail === document.personId) throw new Error(`write failed: ${document.personId}`);
      written.set(document.personId, structuredClone(document));
    },
  };

  coordinator = new ProfileRefreshCoordinator(dependencies, {
    autoRefreshEvery: 20,
    promptProfileMaxChars: 2_000,
  });

  return {
    coordinator,
    db,
    written,
    analysisCalls,
    setRejectNext(error) {
      rejectNext = error;
    },
    setAlwaysFail(personId) {
      alwaysFail = personId;
    },
    maxConcurrency: () => maxActive,
  };
}

function sourceFor(person: ProfilePerson, state: ProfileAnalysisState | null): ProfileAnalysisSource {
  return {
    sessionKey: 'session-a',
    personId: person.id,
    personName: person.name,
    fixedProfile: `${person.name}的固定档案`,
    mvuFacts: { 关系: '协作', 位置: '公共区域' },
    story: STORY,
    wechatContext: state?.lastWechatMessageId
      ? [{ id: state.lastWechatMessageId, sender: person.name, content: '上一条消息', isNew: false }]
      : [],
    wechatNew: [{ id: 'new', sender: person.name, content: '确认近期安排', isNew: true }],
    previous: null,
  };
}

async function testWorldbookFailureDoesNotAdvanceAnchor(): Promise<void> {
  const fixture = createFixture([PEOPLE[0]]);
  fixture.setRejectNext(new Error('write failed'));

  await assert.rejects(() => fixture.coordinator.refreshPerson('main:纪宁', 'person-manual'), /write failed/);
  assert.equal((await fixture.coordinator.getAnalysisState('main:纪宁'))?.lastWechatMessageId, undefined);

  await fixture.coordinator.refreshPerson('main:纪宁', 'person-manual');
  assert.equal((await fixture.coordinator.getAnalysisState('main:纪宁'))?.lastWechatMessageId, 'new');
  assert.match(fixture.written.get('main:纪宁')?.chatInteractionSummary ?? '', /聊天小结/);
}

async function testBatchAllowsPartialSuccessAndLimitsConcurrency(): Promise<void> {
  const fixture = createFixture();
  fixture.setAlwaysFail('main:赵卫国');

  const result = await fixture.coordinator.refreshAll('all-manual');

  assert.equal(result.people.length, 3);
  assert.equal(result.people.filter(item => item.status === 'success').length, 2);
  assert.equal(result.people.filter(item => item.status === 'failed').length, 1);
  assert.ok(fixture.maxConcurrency() <= 2);
}

async function testConcurrentRunUpdatesDoNotOverwriteOtherPeople(): Promise<void> {
  const fixture = createFixture(PEOPLE, { delayRunUpdates: true });

  const result = await fixture.coordinator.refreshAll('all-manual');

  assert.equal(result.people.filter(item => item.status === 'success').length, PEOPLE.length);
}

async function testAutoRefreshAtConfiguredThreshold(): Promise<void> {
  const fixture = createFixture();

  const beforeThreshold = await fixture.coordinator.reconcileStory(STORY.slice(0, 19));
  assert.equal(beforeThreshold, null);
  assert.equal(fixture.analysisCalls.length, 0);
  assert.equal(await fixture.coordinator.getStoryProgress(), 19);

  const thresholdRun = await fixture.coordinator.reconcileStory(STORY);
  assert.ok(thresholdRun);
  assert.equal(fixture.analysisCalls.length, PEOPLE.length);
  assert.equal(await fixture.coordinator.getStoryProgress(), 0);

  await fixture.coordinator.reconcileStory(STORY);
  assert.equal(fixture.analysisCalls.length, PEOPLE.length, '已提交正文不得重复触发');
}

async function main(): Promise<void> {
  await testWorldbookFailureDoesNotAdvanceAnchor();
  await testBatchAllowsPartialSuccessAndLimitsConcurrency();
  await testConcurrentRunUpdatesDoNotOverwriteOtherPeople();
  await testAutoRefreshAtConfiguredThreshold();
  console.log('profile coordinator tests passed');
}

void main();

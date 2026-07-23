# Winter Dynamic Profile And Radio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build per-person dynamic profiles that summarize fixed lore, MVU facts, the latest 20 completed story messages, and incremental private WeChat history; feed the committed profile back into that person's WeChat and selective story lore; and generate an isolated entertainment-only apocalypse radio issue.

**Architecture:** The committed `[人物动态]<personId>` entry in the current chat worldbook is the prompt-facing authority. Dedicated PhoneDB v2 stores hold refresh settings, story and WeChat cursors, full APP view records, run status, and radio history. Pure profile modules validate and merge AI output before the winter adapter writes worldbook state or advances cursors.

**Tech Stack:** TypeScript, Zod 4, IndexedDB/fake-indexeddb, existing PhoneRuntime/PhoneDB/prompt assembler/provider/scheduler APIs, SillyTavern worldbook APIs, Node assert tests, webpack/pnpm.

## Global Constraints

- Automatic refresh defaults to 20 completed story messages; each completed `user` and `assistant` message counts as 1.
- Users can set the automatic threshold from 1 through 50.
- Automatic refresh and “refresh all” analyze every added contact; a single-person refresh analyzes only that person.
- The story input window is the latest 20 completed visible `user`/`assistant` messages.
- First WeChat analysis reads the latest 20 private messages; later analyses read all messages after the stable message-ID anchor plus 4 messages before it as context.
- Fixed character lore is immutable personality baseline; MVU relationship, health, location, task, and other confirmed state are hard facts.
- The prompt-facing dynamic profile defaults to a 2,000-Chinese-character limit.
- Player action advice is APP-only and must never enter worldbook, WeChat prompts, story prompts, ChatLore, or radio.
- Dynamic worldbook entries use `strategy.type = 'selective'`, person name/aliases as keys, and are never constant.
- Radio is entertainment-only: save it in PhoneDB and show it in the radio APP; never write it to worldbook, ChatLore, WeChat prompts, story prompts, or later profile analysis.
- Preserve all existing WeChat icon, per-person ChatLore, source-test, dist, Playwright, and unrelated dirty-worktree changes.
- Do not reconnect legacy `src/小手机平台/apps/profileAnalyzer.ts` or the old `src/小手机平台/intelligence/**` storage path.

---

### Task 1: Add Dedicated PhoneDB V2 Profile Stores

**Files:**
- Modify: `src/小手机平台/data/phoneDb.ts`
- Modify: `src/小手机平台/__tests__/data.test.ts`

**Interfaces:**
- Consumes: existing `PhoneDb.putRecord()` and `PhoneDb.listRecords()` callers.
- Produces: `PhoneBusinessStore` values `profileSettings`, `storyRefresh`, `profileAnalysis`, `profileViews`, `profileRuns`, and `broadcastIssues`; IndexedDB schema version 2; identity migration for person-scoped profile records.

- [ ] **Step 1: Write failing memory and IndexedDB schema tests**

Add tests that use each new store and reopen a v1 database as v2:

```ts
const PROFILE_STORES = [
  'profileSettings',
  'storyRefresh',
  'profileAnalysis',
  'profileViews',
  'profileRuns',
  'broadcastIssues',
] as const;

async function testProfileBusinessStores(): Promise<void> {
  const memory = createMemoryPhoneDb();
  for (const store of PROFILE_STORES) {
    await memory.putRecord(store, { id: `${store}:id`, sessionKey: sessionA, kind: store });
    assert.equal((await memory.listRecords(store, sessionA))[0].kind, store);
  }

  const indexed = await createIndexedDbPhoneDb(new IDBFactory());
  for (const store of PROFILE_STORES) {
    await indexed.putRecord(store, { id: `${store}:id`, sessionKey: sessionA, kind: store });
    assert.equal((await indexed.listRecords(store, sessionA))[0].kind, store);
  }
}
```

Add an identity-migration assertion:

```ts
await db.putRecord('profileAnalysis', {
  id: 'temporary:纪宁',
  personId: 'temporary:纪宁',
  sessionKey: sessionA,
  lastWechatMessageId: 'reply-1',
});
await db.migrateIdentities(sessionA, [{ from: 'temporary:纪宁', to: 'main:纪宁' }]);
assert.deepEqual(await db.listRecords('profileAnalysis', sessionA), [
  {
    id: 'main:纪宁',
    personId: 'main:纪宁',
    sessionKey: sessionA,
    lastWechatMessageId: 'reply-1',
  },
]);
```

- [ ] **Step 2: Run the data test and verify the new stores are rejected**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/data.test.ts
```

Expected: TypeScript/runtime failure because the new `PhoneBusinessStore` values and IndexedDB stores do not exist.

- [ ] **Step 3: Upgrade the schema without changing existing store behavior**

Change the store declarations:

```ts
export const PHONE_BUSINESS_STORES = [
  'conversations',
  'contactPrefs',
  'inbox',
  'proactiveJobs',
  'profileSettings',
  'storyRefresh',
  'profileAnalysis',
  'profileViews',
  'profileRuns',
  'broadcastIssues',
] as const;

export type PhoneBusinessStore = (typeof PHONE_BUSINESS_STORES)[number];

const DATABASE_VERSION = 2;
const ALL_STORES = ['messages', ...PHONE_BUSINESS_STORES] as const;
```

Keep the existing `onupgradeneeded` loop so opening v1 creates only the missing stores. Extend identity migration for `profileAnalysis` and `profileViews`:

```ts
function migratePersonRecord(
  record: PhoneBusinessRecord,
  replacements: ReadonlyMap<string, string>,
): PhoneBusinessRecord {
  const current = typeof record.personId === 'string' ? record.personId : record.id;
  const personId = replacements.get(current) ?? current;
  return { ...record, id: personId, personId };
}
```

Re-key only records belonging to the captured `sessionKey`; do not mutate radio issues or other sessions.

- [ ] **Step 4: Run the data test**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/data.test.ts
```

Expected final line: `data tests passed`.

- [ ] **Step 5: Commit the PhoneDB upgrade**

```powershell
git add src/小手机平台/data/phoneDb.ts src/小手机平台/__tests__/data.test.ts
git commit -m "feat: add dynamic profile phone stores"
```

---

### Task 2: Implement The Typed Profile Analysis And Merge Core

**Files:**
- Create: `src/小手机平台/profiles/profileTypes.ts`
- Create: `src/小手机平台/profiles/profileAnalysis.ts`
- Create: `src/小手机平台/__tests__/profileAnalysis.test.ts`

**Interfaces:**
- Consumes: normalized source strings and records supplied by the winter adapter.
- Produces: `DynamicProfileDocument`, `ProfileViewRecordData`, `buildProfileAnalysisPrompt()`, `parseProfileAnalysisOutput()`, `mergeDynamicProfile()`, and `renderPromptProfile()`.

- [ ] **Step 1: Write failing schema, priority, and leakage tests**

Create tests using these required cases:

```ts
const source: ProfileAnalysisSource = {
  sessionKey: 'session-a',
  personId: 'main:纪宁',
  personName: '纪宁',
  fixedProfile: '冷静谨慎，职业为医生。',
  mvuFacts: { 关系: '协作', 位置: '诊疗室', 健康: 83 },
  story: [{ id: '12', role: 'assistant', content: '纪宁回到诊疗室。' }],
  wechatContext: [{ id: 'old', sender: '纪宁', content: '之前说过药品。', isNew: false }],
  wechatNew: [{ id: 'new', sender: '纪宁', content: '药品快用完了。', isNew: true }],
  previous: null,
};

const parsed = parseProfileAnalysisOutput(JSON.stringify({
  basicInfoAdditions: ['近期负责诊疗室'],
  personalityTuning: '近期更直接地确认补给风险',
  currentSituationSummary: '关系已提升到忠诚，人在仓库',
  relationshipInterpretation: '愿意在协作范围内提供医疗支持',
  storyInteractionSummary: '回到诊疗室继续工作',
  chatInteractionSummary: '提醒药品即将耗尽',
  playerActionAdvice: '尽快确认药品补给',
  evidenceRefs: ['story:12', 'wechat:new'],
}));

const merged = mergeDynamicProfile(source, parsed, {
  lastWechatRound: ['纪宁: 药品快用完了。'],
});
assert.equal(merged.hardFacts.关系, '协作');
assert.equal(merged.hardFacts.位置, '诊疗室');
assert.match(merged.personalityTuning, /补给风险/);
assert.doesNotMatch(renderPromptProfile(merged, 2_000), /尽快确认药品补给/);
```

Also reject extra keys and prototype-pollution-shaped objects:

```ts
assert.throws(
  () => parseProfileAnalysisOutput('{"personalityTuning":"x","mvuRelation":"忠诚"}'),
  /结构|字段/,
);
assert.throws(
  () => parseProfileAnalysisOutput('{"__proto__":{"polluted":true}}'),
  /危险|结构/,
);
```

- [ ] **Step 2: Run the new analysis test and verify imports fail**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileAnalysis.test.ts
```

Expected: FAIL because `profiles/profileTypes` and `profiles/profileAnalysis` do not exist.

- [ ] **Step 3: Define the exact domain types**

Create `profileTypes.ts` with:

```ts
export type ProfileEvidenceRef =
  | 'fixed-profile'
  | 'previous-dynamic'
  | `mvu:${string}`
  | `story:${string}`
  | `wechat:${string}`;

export interface ProfileStoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ProfileWechatMessage {
  id: string;
  sender: string;
  content: string;
  isNew: boolean;
}

export interface ProfileAnalysisSource {
  sessionKey: string;
  personId: string;
  personName: string;
  fixedProfile: string;
  mvuFacts: Readonly<Record<string, unknown>>;
  story: readonly ProfileStoryMessage[];
  wechatContext: readonly ProfileWechatMessage[];
  wechatNew: readonly ProfileWechatMessage[];
  previous: DynamicProfileDocument | null;
}

export interface ProfilePerson {
  id: string;
  name: string;
  aliases: readonly string[];
  temporary: boolean;
}

export interface ProfileAnalysisState {
  sessionKey: string;
  personId: string;
  lastWechatMessageId?: string;
  lastWechatCreatedAt?: number;
  lastSuccessfulRefreshAt?: number;
  status: 'idle' | 'refreshing' | 'success' | 'failed';
  lastError?: string;
  lastFallbackReason?: string;
}

export interface ProfileRefreshRunResult {
  runId: string;
  trigger: 'auto' | 'person-manual' | 'all-manual' | 'retry-failed';
  people: readonly { personId: string; status: 'success' | 'failed'; error?: string }[];
}

export interface ProfileAnalysisOutput {
  basicInfoAdditions: readonly string[];
  personalityTuning: string;
  currentSituationSummary: string;
  relationshipInterpretation: string;
  storyInteractionSummary: string;
  chatInteractionSummary: string;
  playerActionAdvice: string;
  evidenceRefs: readonly ProfileEvidenceRef[];
}

export interface DynamicProfileDocument {
  version: 1;
  sessionKey: string;
  personId: string;
  personName: string;
  fixedBaseline: string;
  hardFacts: Readonly<Record<string, unknown>>;
  basicInfoAdditions: readonly string[];
  personalityTuning: string;
  currentSituationSummary: string;
  relationshipInterpretation: string;
  storyInteractionSummary: string;
  chatInteractionSummary: string;
  lastWechatRound: readonly string[];
  evidenceRefs: readonly ProfileEvidenceRef[];
  updatedAt: number;
}

export interface ProfileViewRecordData {
  document: DynamicProfileDocument;
  playerActionAdvice: string;
  sourceStoryIds: readonly string[];
  newWechatMessageIds: readonly string[];
}
```

- [ ] **Step 4: Implement strict parsing, deterministic merge, and prompt rendering**

Use a strict Zod schema:

```ts
const ProfileAnalysisOutputSchema = z
  .object({
    basicInfoAdditions: z.array(z.string().trim().min(1).max(240)).max(8),
    personalityTuning: z.string().trim().min(1).max(800),
    currentSituationSummary: z.string().trim().min(1).max(800),
    relationshipInterpretation: z.string().trim().min(1).max(800),
    storyInteractionSummary: z.string().trim().min(1).max(1_200),
    chatInteractionSummary: z.string().trim().min(1).max(1_200),
    playerActionAdvice: z.string().trim().min(1).max(800),
    evidenceRefs: z.array(z.string().trim().min(1).max(160)).max(32),
  })
  .strict();
```

`mergeDynamicProfile()` must copy `source.mvuFacts` directly into `hardFacts`; it must never derive hard facts from AI prose. `renderPromptProfile()` must render these sections and omit advice:

```ts
const sections = [
  `[人物身份] ${document.personName} (${document.personId})`,
  `[固定本色] ${document.fixedBaseline}`,
  `[MVU硬事实] ${JSON.stringify(document.hardFacts)}`,
  `[基本信息补充] ${document.basicInfoAdditions.join('；') || '暂无新增'}`,
  `[性格微调] ${document.personalityTuning}`,
  `[当前处境] ${document.currentSituationSummary}`,
  `[与玩家关系] ${document.relationshipInterpretation}`,
  `[正文互动小结] ${document.storyInteractionSummary}`,
  `[微信聊天小结] ${document.chatInteractionSummary}`,
  `[最后一轮消息] ${document.lastWechatRound.join('\n') || '暂无'}`,
  `[私密范围] 仅${document.personName}可将本条目的私聊信息作为认知与行动依据；其他人物不得知情、转述或据此行动，除非相关事实已在正文或MVU中公开。`,
];
```

Trim dynamic prose before fixed baseline or hard facts. Throw if immutable sections alone exceed the configured limit.

- [ ] **Step 5: Run the analysis test**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileAnalysis.test.ts
```

Expected final line: `profile analysis tests passed`.

- [ ] **Step 6: Commit the analysis core**

```powershell
git add src/小手机平台/profiles/profileTypes.ts src/小手机平台/profiles/profileAnalysis.ts src/小手机平台/__tests__/profileAnalysis.test.ts
git commit -m "feat: add guarded dynamic profile analysis"
```

---

### Task 3: Implement Story Reconciliation And WeChat Increment Selection

**Files:**
- Create: `src/小手机平台/profiles/profileSources.ts`
- Create: `src/小手机平台/__tests__/profileSources.test.ts`
- Modify: `src/小手机平台/platform/storyExtractor.ts`
- Modify: `src/小手机平台/__tests__/storyExtractor.test.ts`

**Interfaces:**
- Consumes: current visible completed host messages and sorted `PhoneMessage[]`.
- Produces: `reconcileStoryCounter()`, `extractRecentCompletedMessages()`, `selectWechatIncrement()`, and stable source ranges for refresh records.

- [ ] **Step 1: Write failing story and WeChat boundary tests**

Test user and assistant counting, deletion, replacement, and hidden/unfinished exclusion:

```ts
const first = reconcileStoryCounter(undefined, [
  { id: '10', role: 'user', content: '进入诊疗室' },
  { id: '11', role: 'assistant', content: '纪宁抬头。' },
]);
assert.equal(first.count, 2);

const regenerated = reconcileStoryCounter(first, [
  { id: '10', role: 'user', content: '进入诊疗室' },
  { id: '11', role: 'assistant', content: '纪宁放下记录板。' },
]);
assert.equal(regenerated.count, 2);

const deleted = reconcileStoryCounter(regenerated, [
  { id: '11', role: 'assistant', content: '纪宁放下记录板。' },
]);
assert.equal(deleted.count, 1);
```

Test message-ID anchoring and fallback:

```ts
const selected = selectWechatIncrement(messages, 'm2', 20, 4);
assert.deepEqual(selected.newMessages.map(item => item.id), ['m3', 'm4']);
assert.deepEqual(selected.contextMessages.map(item => item.id), ['m1', 'm2']);

const fallback = selectWechatIncrement(messages, 'missing', 2, 4);
assert.equal(fallback.fallbackReason, 'anchor-missing');
assert.deepEqual(fallback.newMessages.map(item => item.id), ['m3', 'm4']);
```

- [ ] **Step 2: Run both source tests and verify failure**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileSources.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/storyExtractor.test.ts
```

Expected: the first command fails on missing exports; the existing story extractor test still passes before its new assertions are added.

- [ ] **Step 3: Implement pure source selection**

Use stable keys and a simple content fingerprint:

```ts
export interface StoryCounterState {
  count: number;
  committedMessageKeys: readonly string[];
  pendingMessages: Readonly<Record<string, string>>;
}

export function reconcileStoryCounter(
  previous: StoryCounterState | undefined,
  current: readonly ProfileStoryMessage[],
): StoryCounterState {
  const committed = new Set(previous?.committedMessageKeys ?? []);
  const pendingMessages = Object.fromEntries(
    current
      .map(item => [`${item.role}:${item.id}`, fingerprint(item.content)] as const)
      .filter(([key]) => !committed.has(key)),
  );
  return {
    count: Object.keys(pendingMessages).length,
    committedMessageKeys: Object.freeze([...committed]),
    pendingMessages: Object.freeze(pendingMessages),
  };
}
```

Add `commitStoryCounter(state)` which appends the current pending keys to a bounded committed-key list and clears `pendingMessages`. The list must retain at least the latest 200 keys so the next 20-message window cannot immediately retrigger on the same messages:

```ts
export function commitStoryCounter(state: StoryCounterState): StoryCounterState {
  const committedMessageKeys = [
    ...new Set([...state.committedMessageKeys, ...Object.keys(state.pendingMessages)]),
  ].slice(-200);
  return { count: 0, committedMessageKeys: Object.freeze(committedMessageKeys), pendingMessages: Object.freeze({}) };
}
```

`selectWechatIncrement()` must sort by `createdAt || id`, find the anchor by exact ID, and return separate context/new arrays. With no anchor it treats the latest `firstWindow` messages as new. With a missing anchor it uses the same bounded fallback and returns `fallbackReason: 'anchor-missing'`.

- [ ] **Step 4: Add a 20-message extractor without breaking existing callers**

Keep `extractRecentCompletedStory()` intact. Add:

```ts
export function extractRecentCompletedMessages(
  storyMessageId: number | null,
  limit = 20,
): ProfileStoryMessage[] {
  if (!Number.isSafeInteger(storyMessageId) || (storyMessageId ?? -1) < 0) return [];
  return getChatMessages('0-{{lastMessageId}}', { include_swipes: false })
    .filter(message =>
      message.message_id <= storyMessageId! &&
      !message.is_hidden &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.message === 'string' &&
      message.message.trim() !== '',
    )
    .slice(-limit)
    .map(message => ({ id: String(message.message_id), role: message.role, content: message.message }));
}
```

- [ ] **Step 5: Run source tests**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileSources.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/storyExtractor.test.ts
```

Expected final lines: `profile source tests passed` and `storyExtractor tests passed`.

- [ ] **Step 6: Commit source extraction**

```powershell
git add src/小手机平台/profiles/profileSources.ts src/小手机平台/__tests__/profileSources.test.ts src/小手机平台/platform/storyExtractor.ts src/小手机平台/__tests__/storyExtractor.test.ts
git commit -m "feat: track profile story and chat increments"
```

---

### Task 4: Implement Selective Dynamic Lore And Prompt Macros

**Files:**
- Create: `src/小手机平台/profiles/profileWorldbook.ts`
- Create: `src/小手机平台/profiles/profileMacro.ts`
- Create: `src/小手机平台/__tests__/profileWorldbook.test.ts`

**Interfaces:**
- Consumes: committed `DynamicProfileDocument`, `getWorldbook()`, `updateWorldbookWith()`, and the current chat worldbook name.
- Produces: `dynamicProfileEntryName()`, `buildDynamicProfileEntry()`, `readDynamicProfileEntry()`, `writeDynamicProfileEntry()`, and `resolveProfilePromptMacros()`.

- [ ] **Step 1: Write failing selective-entry and macro-isolation tests**

```ts
const entry = buildDynamicProfileEntry(document, ['纪宁', '宁医生'], 2_000);
assert.equal(entry.name, '[人物动态]main:纪宁');
assert.equal(entry.strategy.type, 'selective');
assert.deepEqual(entry.strategy.keys, ['纪宁', '宁医生']);
assert.equal(entry.content.includes('playerActionAdvice'), false);
assert.match(entry.content, /私密范围/);

const expanded = resolveProfilePromptMacros(
  'A={{TAVERN_PHONE_PROFILE}} B={{TAVERN_PHONE_PROFILE:main:赵卫国}}',
  {
    currentPersonId: 'main:纪宁',
    sessionKey: 'session-a',
    read: personId => personId === 'main:纪宁' ? entry.content : undefined,
  },
);
assert.match(expanded, /A=.+纪宁/s);
assert.match(expanded, /B=$/);
```

- [ ] **Step 2: Run the worldbook test**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileWorldbook.test.ts
```

Expected: FAIL because the worldbook and macro modules do not exist.

- [ ] **Step 3: Implement exact entry creation and upsert**

Create selective entry data:

```ts
export function buildDynamicProfileEntry(
  document: DynamicProfileDocument,
  aliases: readonly string[],
  maxCharacters: number,
): Omit<WorldbookEntry, 'uid'> {
  return {
    name: dynamicProfileEntryName(document.personId),
    enabled: true,
    content: renderPromptProfile(document, maxCharacters),
    strategy: {
      type: 'selective',
      keys: [...new Set([document.personName, ...aliases].map(item => item.trim()).filter(Boolean))],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: { type: 'before_character_definition', role: 'system', depth: 4, order: 101 },
    probability: 100,
    recursion: { prevent_incoming: false, prevent_outgoing: true, delay_until: null },
    effect: { sticky: null, cooldown: null, delay: null },
    extra: {
      tavernPhoneKind: 'dynamic-profile',
      personId: document.personId,
      schemaVersion: 1,
      dynamicProfileDocument: structuredClone(document),
    },
  };
}
```

`writeDynamicProfileEntry()` must capture `sessionKey` and worldbook name before writing, update exactly one matching entry, preserve its `uid`, and reject a write if the session guard fails.

`readDynamicProfileEntry()` must return both `content` and the validated `extra.dynamicProfileDocument`. Profile refresh uses that worldbook document as `previous`; the PhoneDB view is a cache for APP-only fields such as action advice, not a second prompt authority.

- [ ] **Step 4: Implement local prompt macro expansion**

Support only the two documented forms:

```ts
const PROFILE_MACRO = /\{\{TAVERN_PHONE_PROFILE(?::([^{}]+))?\}\}/g;
```

Trim the explicit person ID and return an empty string when the captured-session `read()` callback finds no exact entry. Add a code comment stating that this resolver is local to phone prompt assembly and does not register a SillyTavern global macro.

- [ ] **Step 5: Run the worldbook test**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileWorldbook.test.ts
```

Expected final line: `profile worldbook tests passed`.

- [ ] **Step 6: Commit selective lore and macros**

```powershell
git add src/小手机平台/profiles/profileWorldbook.ts src/小手机平台/profiles/profileMacro.ts src/小手机平台/__tests__/profileWorldbook.test.ts
git commit -m "feat: add selective profile lore and macros"
```

---

### Task 5: Build The Refresh Coordinator And Wire The Winter Adapter

**Files:**
- Create: `src/小手机平台/profiles/profileRefreshCoordinator.ts`
- Create: `src/小手机平台/__tests__/profileCoordinator.test.ts`
- Modify: `src/小手机平台/scheduler/phoneScheduler.ts`
- Modify: `src/小手机平台/__tests__/scheduler.test.ts`
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/winterAdapterCore.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`

**Interfaces:**
- Consumes: `PhoneDb`, current stable winter snapshot, added contacts, exact fixed character lore, per-person MVU data, provider factory, and selective worldbook writer.
- Produces: `ProfileRefreshCoordinator.reconcileStory()`, `.refreshPerson()`, `.refreshAll()`, `.retryFailed()`, `.listProfiles()`, `.getSettings()`, and `.saveSettings()`; scheduler sources `profile_refresh` and `profile_radio`; a reusable `maxInflightAIRequests` limit.

- [ ] **Step 1: Write failing coordinator transaction tests**

Build in-memory dependencies and assert cursor commit order:

```ts
const coordinator = new ProfileRefreshCoordinator(dependencies, {
  autoRefreshEvery: 20,
  promptProfileMaxChars: 2_000,
});

dependencies.worldbookWriter.rejectNext(new Error('write failed'));
await assert.rejects(() => coordinator.refreshPerson('main:纪宁', 'person-manual'), /write failed/);
assert.equal((await coordinator.getAnalysisState('main:纪宁')).lastWechatMessageId, undefined);

await coordinator.refreshPerson('main:纪宁', 'person-manual');
assert.equal((await coordinator.getAnalysisState('main:纪宁')).lastWechatMessageId, 'new');
assert.match(dependencies.worldbookEntries.get('[人物动态]main:纪宁')!.content, /聊天小结/);
```

Assert all-person partial success and finite concurrency:

```ts
const result = await coordinator.refreshAll('all-manual');
assert.equal(result.people.length, 3);
assert.equal(result.people.filter(item => item.status === 'success').length, 2);
assert.equal(result.people.filter(item => item.status === 'failed').length, 1);
assert.ok(dependencies.maxObservedConcurrency <= 2);
```

Assert threshold behavior:

```ts
await coordinator.reconcileStory(storyMessages.slice(0, 19));
assert.equal(dependencies.analysisCalls.length, 0);
await coordinator.reconcileStory(storyMessages.slice(0, 20));
assert.equal(dependencies.analysisCalls.length, addedContacts.length);
```

- [ ] **Step 2: Run coordinator tests and verify failure**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileCoordinator.test.ts
```

Expected: FAIL because `ProfileRefreshCoordinator` does not exist.

- [ ] **Step 3: Extend the existing scheduler with a real in-flight limit**

Add scheduler sources:

```ts
export type AiSchedulerSource =
  | 'network_change'
  | 'task_intel_change'
  | 'role_threshold'
  | 'waiting_report'
  | 'low_frequency_daily'
  | 'profile_refresh'
  | 'profile_radio';
```

Add `maxInflightAIRequests?: number` to `PhoneSchedulerOptions`. The default must preserve current behavior by using `Number.MAX_SAFE_INTEGER`. Before `startAi()`, stop scanning new AI jobs when the number of active AI items reaches the limit; leave them queued rather than deleting them. Update `whenIdle()` to wait until both `queue.length === 0` and `activeTasks.size === 0`.

Add a scheduler test:

```ts
const scheduler = new ControlledPhoneScheduler(dependencies, {
  maxAIConversationsPerSnapshot: 10,
  contactCooldownInStoryTurns: 0,
  maxInflightAIRequests: 2,
});
for (let index = 0; index < 5; index += 1) scheduler.enqueue(profileJob(index));
scheduler.runAvailable();
assert.equal(maxObservedInflight, 2);
await scheduler.whenIdle();
assert.equal(delivered.length, 5);
```

- [ ] **Step 4: Implement the coordinator on a dedicated scheduler instance**

Use explicit dependency callbacks:

```ts
export interface ProfileRefreshDependencies {
  db: PhoneDb;
  scheduler: ControlledPhoneScheduler;
  now(): number;
  getSessionKey(): string;
  getStoryMessages(): readonly ProfileStoryMessage[];
  listAddedPeople(): Promise<readonly ProfilePerson[]>;
  collectSource(person: ProfilePerson, state: ProfileAnalysisState | null): Promise<ProfileAnalysisSource>;
  requestAnalysis(prompt: string): Promise<string>;
  writeWorldbook(document: DynamicProfileDocument, aliases: readonly string[], maxCharacters: number): Promise<void>;
  onAllRunComplete?(run: ProfileRefreshRunResult): Promise<void>;
}
```

For each batch, enqueue every person as a `profile_refresh` job with `conversationId = private:${personId}`, `contactKey = personId`, and a payload containing `runId`, `personId`, and trigger. Configure the dedicated profile scheduler with:

```ts
{
  maxAIConversationsPerSnapshot: Number.MAX_SAFE_INTEGER,
  contactCooldownInStoryTurns: 0,
  maxInflightAIRequests: 2,
}
```

The adapter's profile-scheduler `dispatchAi` callback calls the coordinator's captured person worker. No contact may be discarded by the proactive scheduler's normal two-conversation quota. Each person follows:

```ts
source -> prompt -> provider -> strict parse -> deterministic merge
-> selective worldbook write -> profileViews state write
-> profileAnalysis state write with new anchor
```

The worldbook write must precede the anchor update. Store failed state and old anchor on any exception. Await the profile scheduler becoming idle, then read person statuses from the run record.

- [ ] **Step 5: Wire stable story snapshots and APP services**

In the winter adapter:

- Add `recentCompletedMessages` to `WinterSnapshot`.
- Populate it with `extractRecentCompletedMessages(assistantMessageId, 20)`.
- Construct the coordinator after DB/settings/worldbook capture.
- Call `reconcileStory()` only after the stable assistant/MVU snapshot is published.
- Dispose/cancel the coordinator on session switch and adapter deactivation.
- Implement `listProfiles`, `refreshProfile`, `refreshAllProfiles`, `retryFailedProfiles`, `getProfileSettings`, and `saveProfileSettings` in `createAppServices()`.
- Capture `sessionKey`, host epoch, snapshot identity, and worldbook name for each refresh; reject stale writes after a chat switch.

Use exact fixed lore loading through existing `角色档案 - ${name}` lookup. Resolve each person's MVU object with the same `main:`/`temporary:` identity path used by `conversationMembers()`.

- [ ] **Step 6: Run scheduler, coordinator, and winter adapter tests**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileCoordinator.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/scheduler.test.ts
pnpm exec ts-node --transpile-only src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
```

Expected final lines: `profile coordinator tests passed`, `scheduler tests passed`, and `winter phone adapter tests passed`.

- [ ] **Step 7: Commit refresh orchestration**

```powershell
git add src/小手机平台/profiles/profileRefreshCoordinator.ts src/小手机平台/__tests__/profileCoordinator.test.ts src/小手机平台/scheduler/phoneScheduler.ts src/小手机平台/__tests__/scheduler.test.ts src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts src/寒冬末日/脚本/小手机-90寒冬适配器/winterAdapterCore.ts src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
git commit -m "feat: orchestrate winter profile refreshes"
```

---

### Task 6: Inject The Exact Committed Profile Into WeChat Prompts

**Files:**
- Modify: `src/小手机平台/ai/promptAssembler.ts`
- Modify: `src/小手机平台/__tests__/ai.test.ts`
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`

**Interfaces:**
- Consumes: exact committed dynamic entry returned by `readDynamicProfileEntry(chatWorldbook, personId)`.
- Produces: `PromptMember.dynamicProfile?: string` and WeChat prompts where each member receives only their own committed profile.

- [ ] **Step 1: Write failing prompt isolation tests**

Add two members with distinctive private summaries:

```ts
const prompt = assemblePrompt(createPromptContextSnapshot({
  ...promptInput(),
  members: [
    { name: '纪宁', identity: 'main:纪宁', profile: '医生', dynamicProfile: '纪宁私聊: 药品不足' },
    { name: '赵卫国', identity: 'main:赵卫国', profile: '保安', dynamicProfile: '赵卫国私聊: 北门异常' },
  ],
}));
assert.match(prompt, /main:纪宁[\s\S]*药品不足/);
assert.match(prompt, /main:赵卫国[\s\S]*北门异常/);
assert.match(prompt, /每份动态档案只属于其identity对应人物/);
```

Add an adapter-core test for exact lookup:

```ts
assert.equal(
  selectDynamicProfile('main:纪宁', [
    { name: '[人物动态]main:纪宁', content: '纪宁动态' },
    { name: '[人物动态]main:赵卫国', content: '赵卫国动态' },
  ]),
  '纪宁动态',
);
```

Implement and export the tested selector in `winterAdapterCore.ts`:

```ts
export function selectDynamicProfile(
  personId: string,
  entries: readonly { name: string; content: string }[],
): string | undefined {
  return entries.find(entry => entry.name === `[人物动态]${personId}`)?.content;
}
```

- [ ] **Step 2: Run AI and winter adapter tests**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/ai.test.ts
pnpm exec ts-node --transpile-only src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
```

Expected: FAIL on the missing `dynamicProfile` property and exact selector.

- [ ] **Step 3: Extend member prompt data without changing hard-fact priority**

Change:

```ts
export interface PromptMember {
  name: string;
  identity: string;
  profile: string;
  dynamicProfile?: string;
}
```

Render a guard immediately before member data:

```ts
'每份动态档案只属于其 identity 对应人物；其他人物不得知道、转述或据此行动，除非相关事实已在正文或MVU中公开。',
readonlyData({ members: snapshot.members, worldbook: selected.worldbook }),
```

Keep MVU in its existing immutable facts section and preserve character-budget trimming behavior.

- [ ] **Step 4: Load exact profiles during private and group WeChat assembly**

In `launchAiRequest()`, read the captured chat worldbook once, then construct each member:

```ts
const dynamicProfile = selectDynamicProfile(member.id, chatWorldbookEntries);
return {
  name: member.name,
  identity: member.id,
  profile: buildBoundedMemberContext(...),
  ...(dynamicProfile ? { dynamicProfile: dynamicProfile.slice(0, profileSettings.promptProfileMaxChars) } : {}),
};
```

Do not scan all `[人物动态]` entries into `chatLore`. Do not include `ProfileViewRecord.playerActionAdvice`.

- [ ] **Step 5: Run AI and winter adapter tests**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/ai.test.ts
pnpm exec ts-node --transpile-only src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
```

Expected final lines: `ai tests passed` and `winter phone adapter tests passed`.

- [ ] **Step 6: Commit WeChat profile injection**

```powershell
git add src/小手机平台/ai/promptAssembler.ts src/小手机平台/__tests__/ai.test.ts src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
git commit -m "feat: inject exact profiles into WeChat prompts"
```

---

### Task 7: Replace The Placeholder Profile UI And Add Isolated Radio Generation

**Files:**
- Create: `src/小手机平台/profiles/profileBroadcast.ts`
- Create: `src/小手机平台/__tests__/profileBroadcast.test.ts`
- Modify: `src/小手机平台/apps/phoneApps.ts`
- Modify: `src/小手机平台/apps/profileHelper.ts`
- Modify: `src/小手机平台/shell/phoneShell.css`
- Modify: `src/小手机平台/__tests__/shellSource.test.js`
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`

**Interfaces:**
- Consumes: coordinator profile views/settings/run status and public-only story/MVU/profile deltas.
- Produces: complete profile APP controls, `buildProfileBroadcastPrompt()`, `parseProfileBroadcastOutput()`, PhoneDB `broadcastIssues` history, and radio APP regeneration.

- [ ] **Step 1: Write failing radio isolation tests**

```ts
const prompt = buildProfileBroadcastPrompt({
  publicStory: ['北门在正文中确认关闭。'],
  publicMvuFacts: { 通讯网络: { 状态: '不稳定' } },
  publicProfileChanges: [
    { content: '纪宁公开接管诊疗室。', evidenceRefs: ['story:12', 'mvu:位置'] },
  ],
});
assert.doesNotMatch(prompt, /私聊原文|playerActionAdvice/);

const issue = parseProfileBroadcastOutput(JSON.stringify({
  sections: [
    { title: '秩序与局势', body: '北门暂时关闭。' },
    { title: '生存与资源', body: '暂无重大变化。' },
    { title: '人物与社会', body: '诊疗室恢复值守。' },
  ],
}));
assert.equal(issue.sections.length, 3);
```

Add a source test asserting `writeChatLoreEntry`, `createWorldbookEntries`, and `updateWorldbookWith` are absent from `profileBroadcast.ts`.

- [ ] **Step 2: Run the radio and shell source tests**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileBroadcast.test.ts
node src/小手机平台/__tests__/shellSource.test.js
```

Expected: radio test fails because the module does not exist.

- [ ] **Step 3: Implement a strict three-section radio service**

Use this output contract:

```ts
const BroadcastOutputSchema = z.object({
  sections: z.tuple([
    z.object({ title: z.literal('秩序与局势'), body: z.string().trim().min(1).max(1_500) }).strict(),
    z.object({ title: z.literal('生存与资源'), body: z.string().trim().min(1).max(1_500) }).strict(),
    z.object({ title: z.literal('人物与社会'), body: z.string().trim().min(1).max(1_500) }).strict(),
  ]),
}).strict();
```

The prompt must state that absent evidence yields `暂无重大变化`, private chat cannot be quoted, and private-only facts cannot become news. Save successful issues only with:

`buildProfileBroadcastPrompt()` must discard any profile change whose evidence references include `wechat:` or `previous-dynamic`; only changes supported entirely by `story:` and `mvu:` references may enter `publicProfileChanges`.

```ts
await db.putRecord('broadcastIssues', {
  id: issueId,
  sessionKey,
  kind: 'profile-radio',
  sourceStoryCursor,
  generatedAt,
  sections,
  rawText,
});
```

Never call ChatLore or worldbook APIs from the radio module.

- [ ] **Step 4: Expand the APP service contracts and views**

Replace `PhoneProfileView` with fields matching the spec:

```ts
export interface PhoneProfileView {
  id: string;
  name: string;
  basicInfo: string;
  personalityBaseline: string;
  personalityTuning: string;
  currentStatus: string;
  relationship: string;
  storyInteractionSummary: string;
  chatInteractionSummary: string;
  playerActionAdvice: string;
  lastWechatRound: readonly string[];
  sourceRange: string;
  refreshStatus: 'idle' | 'refreshing' | 'success' | 'failed';
  lastError?: string;
  lastUpdated: number;
}
```

Add:

```ts
getProfileSettings(): Promise<PhoneProfileSettingsView>;
saveProfileSettings(settings: PhoneProfileSettingsView): Promise<void>;
retryFailedProfiles(): Promise<void>;
regenerateProfileRadio(): Promise<void>;
```

Make `collectProfiles()` use `services.listProfiles()` when available; retain its current read-only fallback only for adapters without dynamic-profile services.

- [ ] **Step 5: Build feature-complete profile and radio controls**

The profile APP must render:

- Progress `正文进度 n / N`.
- Numeric threshold input constrained to 1 through 50, default 20.
- Prompt budget input default 2000.
- “刷新全部人物” and “重试失败人物”.
- Per-person refresh icon button with an accessible label.
- Separate labeled sections for all requested profile fields.
- Status, source range, last update, and failure reason.

The radio APP must render stored profile-radio issues and a “重新生成本期广播” command. It must not replace existing deterministic winter notices; render both groups with distinct sources.

Use existing button/card/list primitives and add scoped CSS classes instead of inline style strings.

- [ ] **Step 6: Wire batch completion to radio generation**

In the winter adapter:

- Automatic and `all-manual` runs call radio generation after person tasks settle.
- `person-manual` and `retry-failed` do not generate radio.
- Radio failure records a diagnostic but does not roll back profiles.
- `listBroadcasts()` merges deterministic notices with PhoneDB `broadcastIssues`, newest first.
- `regenerateProfileRadio()` uses the current stable public snapshot and replaces no prior history.

- [ ] **Step 7: Run radio, shell, coordinator, and winter tests**

Run:

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileBroadcast.test.ts
node src/小手机平台/__tests__/shellSource.test.js
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileCoordinator.test.ts
pnpm exec ts-node --transpile-only src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
```

Expected all commands exit 0 with their corresponding `tests passed` final line.

- [ ] **Step 8: Commit APP and radio behavior**

```powershell
git add src/小手机平台/profiles/profileBroadcast.ts src/小手机平台/__tests__/profileBroadcast.test.ts src/小手机平台/apps/phoneApps.ts src/小手机平台/apps/profileHelper.ts src/小手机平台/shell/phoneShell.css src/小手机平台/__tests__/shellSource.test.js src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
git commit -m "feat: add dynamic profile and radio apps"
```

---

### Task 8: Run The Full Verification Matrix And Review Generated Artifacts

**Files:**
- Modify if generated by build: `dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js`
- Modify if generated by build: `dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js.map`
- Modify if generated by build: `dist/小手机平台/脚本/20数据与同步/index.js`
- Modify if generated by build: `dist/小手机平台/脚本/20数据与同步/index.js.map`
- Modify if generated by build: `dist/小手机平台/脚本/30AI与调度/index.js`
- Modify if generated by build: `dist/小手机平台/脚本/30AI与调度/index.js.map`
- Modify if generated by build: `dist/小手机平台/脚本/40手机外壳/index.js`
- Modify if generated by build: `dist/小手机平台/脚本/40手机外壳/index.js.map`
- Modify if generated by build: `dist/小手机平台/脚本/50通信与情报APP/index.js`
- Modify if generated by build: `dist/小手机平台/脚本/50通信与情报APP/index.js.map`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: tested source, production bundles, desktop/mobile runtime evidence, and a final scoped diff.

- [ ] **Step 1: Run the focused profile test suite**

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileAnalysis.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileSources.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileWorldbook.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileCoordinator.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/profileBroadcast.test.ts
```

Expected: every command exits 0.

- [ ] **Step 2: Run affected platform regression tests**

```powershell
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/data.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/ai.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/scheduler.test.ts
pnpm exec ts-node --transpile-only src/小手机平台/__tests__/storyExtractor.test.ts
pnpm exec ts-node --transpile-only src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
node src/小手机平台/__tests__/shellSource.test.js
```

Expected: every command exits 0.

- [ ] **Step 3: Run production build**

```powershell
pnpm build
```

Expected: webpack exits 0 without TypeScript or asset errors.

- [ ] **Step 4: Inspect the final source and generated diff**

```powershell
git status --short
git diff --check
git diff --stat
git diff -- src/小手机平台/profiles src/小手机平台/data/phoneDb.ts src/小手机平台/apps src/小手机平台/ai/promptAssembler.ts src/寒冬末日/脚本/小手机-90寒冬适配器
```

Expected:

- No whitespace errors.
- No deletion or overwrite of the existing WeChat PNG asset.
- No reconnection of legacy `profileAnalyzer.ts`.
- No radio path calling worldbook or ChatLore APIs.
- No profile advice text in committed dynamic lore.

- [ ] **Step 5: Verify desktop and Android-sized UI**

Use the repository Playwright workflow to open the running phone shell and verify at desktop and `390x844`:

- Profile APP shows progress and all requested fields.
- Threshold accepts 1 and 50 and rejects 0 and 51.
- Per-person and all-person refresh buttons remain inside their containers.
- Long Chinese summaries wrap without overlapping controls.
- Radio APP shows three sections and history.
- WeChat home icon remains the supplied PNG.

Capture screenshots under `.playwright-cli/` without staging unrelated existing screenshots.

- [ ] **Step 6: Verify real runtime data boundaries**

In a current winter chat:

1. Add at least two contacts.
2. Give each contact a distinct private-chat fact.
3. Refresh all profiles.
4. Inspect the current chat worldbook.
5. Confirm two separate selective `[人物动态]<personId>` entries exist.
6. Confirm neither entry is constant.
7. Confirm each entry includes its own private scope and no player advice.
8. Generate a WeChat response for each person and inspect assembled diagnostics/source tests for exact-person profile use.
9. Generate a radio issue and confirm no new radio worldbook or ChatLore entry appears.

- [ ] **Step 7: Commit generated bundles and final test adjustments**

Stage only files that belong to this feature and its build outputs:

```powershell
git add -- src/小手机平台/profiles src/小手机平台/data/phoneDb.ts src/小手机平台/platform/storyExtractor.ts src/小手机平台/ai/promptAssembler.ts src/小手机平台/scheduler/phoneScheduler.ts src/小手机平台/apps/profileHelper.ts src/小手机平台/apps/phoneApps.ts src/小手机平台/shell/phoneShell.css src/小手机平台/__tests__/data.test.ts src/小手机平台/__tests__/ai.test.ts src/小手机平台/__tests__/scheduler.test.ts src/小手机平台/__tests__/storyExtractor.test.ts src/小手机平台/__tests__/shellSource.test.js src/小手机平台/__tests__/profileAnalysis.test.ts src/小手机平台/__tests__/profileSources.test.ts src/小手机平台/__tests__/profileWorldbook.test.ts src/小手机平台/__tests__/profileCoordinator.test.ts src/小手机平台/__tests__/profileBroadcast.test.ts src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts src/寒冬末日/脚本/小手机-90寒冬适配器/winterAdapterCore.ts src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
git add -- dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js.map dist/小手机平台/脚本/20数据与同步/index.js dist/小手机平台/脚本/20数据与同步/index.js.map dist/小手机平台/脚本/30AI与调度/index.js dist/小手机平台/脚本/30AI与调度/index.js.map dist/小手机平台/脚本/40手机外壳/index.js dist/小手机平台/脚本/40手机外壳/index.js.map dist/小手机平台/脚本/50通信与情报APP/index.js dist/小手机平台/脚本/50通信与情报APP/index.js.map
git commit -m "build: publish winter dynamic profiles"
```

Before committing, inspect `git diff --cached --name-only`. If any listed path contains pre-existing changes unrelated to this feature, preserve those hunks and commit only after reviewing the combined file diff. Do not stage `st-chatu8`, Playwright history, `示例/聊天核心.txt`, or unrelated untracked files.

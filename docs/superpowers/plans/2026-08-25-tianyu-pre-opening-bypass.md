# Tianyu PRE Opening Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure the `天欲太和录` worldbook for TavernSync and make its existing variable script create the approved
visible assistant prologue as `mes=1` on otherwise-new chats, without editing same-layer-pre.

**Architecture:** Put the one-shot, dependency-injected bootstrap in a focused `openingBootstrap.ts` module so its
guard, MVU inheritance, and message payload can be tested without Tavern. The existing variable entry registers the
Schema, waits for MVU, and invokes that module initially and on chat changes. TavernSync receives one new worldbook
configuration.

**Tech Stack:** TypeScript, Zod 4, Tavern Helper globals, MVU, Node assert, ts-node, YAML, webpack, tavern_sync.

## Global Constraints

- Do not modify any file under `src/寒冬末日/same-layer-pre`.
- Only create a prologue when `getLastMessageId() === 0`.
- The new `mes=1` is a visible assistant message containing the user-approved `阴阳江湖序章` text verbatim.
- Carry a deep-cloned, Schema-parsed `stat_data` and `initialized_lorebooks` forward from `mes=0`.
- Existing chats remain untouched and concurrent/re-entrant calls cannot create duplicate prologues.
- TavernSync config name and Tavern worldbook name are both exactly `天欲太和录`.

---

### Task 1: Testable Tianyu prologue bootstrap

**Files:**

- Create: `src/天欲太和录/脚本/变量结构/openingBootstrap.ts`
- Create: `src/天欲太和录/__tests__/openingBootstrap.test.ts`

**Interfaces:**

- Produces: `TIANYU_PROLOGUE: string`
- Produces: `ensureTianyuPrologue(deps: TianyuPrologueDependencies): Promise<'created' | 'skipped'>`
- Consumes: `Schema.parse`, dependency functions for last message ID, MVU read, deep clone, and message creation.

- [ ] **Step 1: Write the failing test**

The test sets the global lodash binding, imports `openingBootstrap.ts`, and proves that a new chat creates one visible
assistant message, carries normalized MVU data, uses the exact prologue beginning
`阴阳江湖序章\n太和山入冬以后，常有雾。` and ending `太和山的钟声。\n因此响了一夜。`, skips existing chats, and
suppresses a concurrent second call.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm exec ts-node --prefer-ts-exts --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"Node"}' src/天欲太和录/__tests__/openingBootstrap.test.ts
```

Expected: FAIL because `openingBootstrap.ts` does not exist.

- [ ] **Step 3: Implement the minimal bootstrap**

Implement a module-scoped `creating` lock. Return `skipped` when the lock is held or the last message ID is not zero.
Clone the `mes=0` MVU payload, replace `stat_data` with `Schema.parse(source.stat_data ?? {})`, and call the injected
creator with:

```ts
{
  role: 'assistant',
  message: TIANYU_PROLOGUE,
  is_hidden: false,
  data: source,
}
```

Always release the lock in `finally`; let creation errors propagate so the entry script can log them.

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command. Expected: `天欲太和录 opening bootstrap test passed` and exit code 0.

### Task 2: Wire the bootstrap into the existing variable entry

**Files:**

- Modify: `src/天欲太和录/脚本/变量结构/index.ts`
- Test: `src/天欲太和录/__tests__/openingBootstrap.test.ts`

**Interfaces:**

- Consumes: `ensureTianyuPrologue(...)` from Task 1.
- Produces: initial and `tavern_events.CHAT_CHANGED` calls that use `Mvu.getMvuData`, `createChatMessages`, and
  `getLastMessageId`.

- [ ] **Step 1: Add a failing source-contract assertion**

Assert that `index.ts` imports and invokes `ensureTianyuPrologue`, waits for `Mvu`, listens for `CHAT_CHANGED`, reads
MVU data from message 0, and creates with `{ refresh: 'all' }`.

- [ ] **Step 2: Run the test and verify the contract fails**

Run the Task 1 test command. Expected: FAIL because `index.ts` has not wired the bootstrap.

- [ ] **Step 3: Implement the entry wiring**

Keep `registerMvuSchema(Schema)`. Add an async runner that waits for `Mvu`, invokes the bootstrap with Tavern globals,
and logs `[天欲太和录] 自动序章创建失败` on rejection. Run it once on DOM ready and again on `CHAT_CHANGED`; the
bootstrap guard makes re-entry safe.

- [ ] **Step 4: Run the test and verify it passes**

Run the Task 1 test command. Expected: exit code 0.

### Task 3: Add TavernSync worldbook configuration

**Files:**

- Modify: `tavern_sync.yaml`
- Create: `src/天欲太和录/__tests__/tavernSyncConfig.test.ts`

**Interfaces:**

- Produces: configuration key `配置.天欲太和录` with type/name/path/export fields required by TavernSync.

- [ ] **Step 1: Write a failing YAML assertion**

Parse `tavern_sync.yaml` and assert deep equality with:

```ts
{
  类型: '世界书',
  酒馆中的名称: '天欲太和录',
  本地文件路径: 'src/天欲太和录/世界书/index.yaml',
  导出文件路径: 'src/天欲太和录',
}
```

- [ ] **Step 2: Run and verify failure**

Run the test with the same ts-node flags. Expected: FAIL because the key is absent.

- [ ] **Step 3: Add the exact YAML mapping**

Add the four fields beneath `配置.天欲太和录` without changing existing configurations.

- [ ] **Step 4: Run and verify success**

Run the test again. Expected: `天欲太和录 tavern_sync config test passed` and exit code 0.

### Task 4: Build, synchronize, verify, and deliver

**Files:**

- Regenerate: `src/天欲太和录/schema.json`
- Regenerate: `dist/天欲太和录/脚本/变量结构/index.js`
- Bundle: `src/天欲太和录/天欲太和录.json`

- [ ] **Step 1: Run scoped verification**

Run both Tianyu tests, scoped Prettier check, `TAVERN_SCHEMA_PREFIXES=src/天欲太和录 pnpm dump`, and
`TAVERN_BUILD_PREFIXES=src/天欲太和录 pnpm build`. Expected: all exit code 0 and webpack only lists the Tianyu variable
entry.

- [ ] **Step 2: Validate and push the worldbook**

Run:

```powershell
node tavern_sync.mjs bundle 天欲太和录
node tavern_sync.mjs push 天欲太和录 -f
```

Expected: bundle succeeds and Tavern reports the `天欲太和录` worldbook push succeeded.

- [ ] **Step 3: Verify live Tavern behavior**

Create a new Tianyu chat, verify message IDs `0, 1`, confirm `mes=1` is visible and begins with `阴阳江湖序章`, confirm
its MVU `stat_data` parses, and confirm the PRE opening modal is absent.

- [ ] **Step 4: Commit only scoped files and push**

Stage the Tianyu source/tests/generated output, `tavern_sync.yaml`, and this plan. Exclude unrelated dirty files. Commit
with `feat: add tianyu automatic prologue` and push the current `20260211` branch.

# Same-layer Debug Trace and Send Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable DEBUG trace facility for the same-layer streaming workbench, wire it into the send/patch/rebuild/host-refresh lifecycle, and document the two follow-up architecture paths for making UI send behave more like native host send.

**Architecture:** Add one focused runtime tracing module that is inert by default, enabled through runtime flags, and stores a bounded in-memory event timeline on `window`. Integrate this module into `useStreamingDemo.ts` at the exact lifecycle chokepoints where duplicate transcript content could be caused by double patching or double rebuilding, then verify it with small node-based regression tests and a build.

**Tech Stack:** TypeScript, Vue 3 composition code, node:test, webpack build, existing same-layer streaming workbench modules.

---

## Chunk 1: Reusable DEBUG trace core

### Task 1: Add a focused trace utility module

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/debugTrace.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTrace.test.js`

- [x] **Step 1: Write the failing test**

Cover:
- disabled mode does not record events
- enabled mode records bounded events
- trace ids can be created and grouped
- runtime API exposes `events`, `clear()`, and `groupByTrace()`

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTrace.test.js
```

Expected: FAIL because `debugTrace.ts` does not exist yet.

- [x] **Step 3: Write minimal implementation**

Implement:
- runtime flag detection (`localStorage['stream_demo_debug']`, `window.__STREAM_DEMO_DEBUG__?.enabled`)
- bounded ring buffer
- `createTraceId()`
- `recordTraceEvent()`
- `installTraceRuntime()` / `getTraceRuntime()`
- compact payload summarization helpers safe for console reuse

- [x] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTrace.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/寒冬末日/界面同层版/界面/状态栏/debugTrace.ts src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTrace.test.js
git commit -m "test: add same-layer debug trace core"
```

## Chunk 2: Instrument the send/patch/rebuild/refresh lifecycle

### Task 2: Wire trace points into the generation lifecycle

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue` (only if runtime bootstrap helpers or UI-triggered trace actions are needed)
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTraceLifecycle.test.js` (if extracting pure helpers is needed)

- [ ] **Step 1: Write the failing test**

Prefer a pure-helper regression test for any extracted lifecycle summarizer/helper rather than trying to mount the whole Vue runtime. Cover at least:
- patch skip when content hash/signature matches
- rebuild signature calculation
- host refresh early-return tagging for busy+token events

- [ ] **Step 2: Run test to verify it fails**

Run the new targeted node test:

```powershell
node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTraceLifecycle.test.js
```

Expected: FAIL because the helper or exported function does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add trace events in:
- `runGenerationFlow()`
- `patchAssistantMessage()`
- `rebuildTranscript()`
- `handleHostRefreshEvent()`
- `bindGenerationEvents()`
- `emitOfficialGenerationLifecycle()`

Each event should capture:
- current trace id
- stage name
- message ids
- status / busy state
- whether patch/rebuild was skipped
- message signature/hash/length summaries
- refresh reason/domain summaries

- [ ] **Step 4: Run targeted tests to verify they pass**

Run:

```powershell
node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTrace.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTraceLifecycle.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTraceLifecycle.test.js
git commit -m "feat: trace same-layer generation lifecycle"
```

## Chunk 3: Verification and architecture comparison

### Task 3: Verify build/test health and capture the architecture comparison

**Files:**
- Modify: `src/寒冬末日/界面同层版/开发文档.md` (only if a short reusable debug section is worth preserving now)
- Optional Create: `docs/superpowers/specs/2026-03-23-samelayer-send-architecture-notes.md`

- [ ] **Step 1: Run focused node tests**

```powershell
node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTrace.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTraceLifecycle.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/hostMesTextRender.test.js
```

Expected: PASS.

- [ ] **Step 2: Run build verification**

```powershell
pnpm build:dev
```

Expected: exit code 0; note any unrelated warnings separately.

- [ ] **Step 3: Summarize architecture comparison**

Write a concise comparison covering:
- Route A: UI send delegates toward native host send
- Route B: UI send remains custom but fills in the full host-equivalent lifecycle
- files likely touched
- operational and maintenance risks
- recommendation criteria after trace evidence is collected

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/plans/2026-03-23-samelayer-debug-trace-and-send-architecture.md src/寒冬末日/界面同层版/开发文档.md docs/superpowers/specs/2026-03-23-samelayer-send-architecture-notes.md
git commit -m "docs: capture same-layer debug trace rollout notes"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-23-samelayer-debug-trace-and-send-architecture.md`.

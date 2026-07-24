# Profile App Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a readable two-level profile UI whose task-specific AI analysis is visible, reusable, editable, versioned, and synchronized with the dynamic worldbook.

**Architecture:** Keep `profileViews` as the current-profile source of truth and extend it with structured change analysis, raw model details, and a bounded version list. Route profile requests through a structured Provider mode, emit profile-change notifications from the winter adapter, and expose a hidden `profile-detail` app route for the independent person detail screen.

**Tech Stack:** TypeScript, Zod, DOM APIs, IndexedDB-backed `PhoneDb`, SillyTavern `generateRaw`, OpenAI-compatible chat completions, Node test runner, ts-node, webpack/pnpm build.

---

### Task 1: Task-specific Provider responses

**Files:**
- Modify: `src/小手机平台/ai/jailbreakLayers.ts`
- Modify: `src/小手机平台/ai/providers.ts`
- Test: `src/小手机平台/__tests__/ai.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests which request `mode: 'structured'` and assert that `ordered_prompts/messages` contain the supplied profile prompt but none of `微信模拟聊天接口`, `成人聊天模式`, or `开始生成聊天回复`. Add a complete OpenAI response fixture containing both `message.content` and `message.reasoning_content`, then assert `requestDetailed(...).promise` returns both strings.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
pnpm exec ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' src/小手机平台/__tests__/ai.test.ts
```

Expected: compilation or assertion failure because structured mode and `requestDetailed` do not exist.

- [ ] **Step 3: Implement the Provider contract**

Add:

```ts
export type AiPromptMode = 'chat' | 'structured';
export interface AiDetailedResponse {
  content: string;
  reasoningContent?: string;
}
```

Make prompt building select chat layers only for `chat`; `structured` uses the assembled prompt without chat identity or assistant prefill. Preserve `request(prompt)` for existing callers and add `requestDetailed(prompt, { mode })`, with Tavern returning only `content` and OpenAI-compatible parsing optional `reasoning_content`.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 1 command and expect `ai tests passed`.

### Task 2: Structured profile analysis and persisted versions

**Files:**
- Modify: `src/小手机平台/profiles/profileTypes.ts`
- Modify: `src/小手机平台/profiles/profileAnalysis.ts`
- Modify: `src/小手机平台/profiles/profileRefreshCoordinator.ts`
- Test: `src/小手机平台/__tests__/profileAnalysis.test.ts`
- Test: `src/小手机平台/__tests__/profileCoordinator.test.ts`

- [ ] **Step 1: Write failing parser and coordinator tests**

Use a legal response containing:

```ts
{
  analysisNarrative: '陈宇的直接追问来自沟通风格变化，并非关系恶化。',
  changes: [{
    field: 'personalityTuning',
    before: '表达克制',
    after: '表达更直接',
    reason: '对含义不明的微信消息直接追问',
    evidenceRefs: ['wechat:new'],
  }],
}
```

Assert parsing, storage of content/reasoning, automatic worldbook application, a new `ai` version, and notification at refreshing/success. Add a parse-failure case asserting raw content survives while the prior view remains current.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
pnpm exec ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' src/小手机平台/__tests__/profileAnalysis.test.ts
pnpm exec ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' src/小手机平台/__tests__/profileCoordinator.test.ts
```

Expected: failures for missing analysis, changes, versions, detailed response, and notification fields.

- [ ] **Step 3: Implement schema, persistence, and failure capture**

Extend the output schema with `analysisNarrative` and typed change items. Extend `ProfileViewRecordData` with current analysis metadata and `versions`, retaining at most 10 entries. Change `requestAnalysis` to return `AiDetailedResponse`; store raw content and reasoning on success, and store the failed raw response in `ProfileAnalysisState` on parse failure without replacing the current view.

- [ ] **Step 4: Run tests and verify GREEN**

Run both Task 2 commands and expect both suites to pass.

### Task 3: Winter adapter services, profile notifications, edit, and restore

**Files:**
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Modify: `src/小手机平台/apps/phoneApps.ts`
- Test: `src/寒冬末日/__tests__/winterPhoneSource.test.js`
- Test: `src/小手机平台/__tests__/shellSource.test.js`

- [ ] **Step 1: Write failing service-contract tests**

Assert the adapter requests profile analysis through `requestDetailed(..., { mode: 'structured' })`, exposes `watchProfiles`, `saveProfile`, and `restorePreviousProfile`, notifies after state/view changes, and returns the coordinator's per-person batch result instead of discarding it.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test src/寒冬末日/__tests__/winterPhoneSource.test.js src/小手机平台/__tests__/shellSource.test.js
```

Expected: assertions fail because the new service contract is absent.

- [ ] **Step 3: Implement adapter behavior**

Add a profile listener set mirroring `watchConversation`. Normalize detailed Provider results in `requestProfileAnalysis`. Implement player edits by validating editable dynamic fields, writing the updated document to the captured chat worldbook, appending a `player` version, and notifying listeners only after success. Restore by copying the previous version into a new `restore` version and applying it through the same worldbook-first path.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Task 3 command and expect both suites to pass.

### Task 4: Two-level profile UI

**Files:**
- Modify: `src/小手机平台/apps/phoneApps.ts`
- Modify: `src/小手机平台/shell/phoneShell.ts`
- Modify: `src/小手机平台/shell/phoneShell.css`
- Test: `src/小手机平台/__tests__/shellSource.test.js`

- [ ] **Step 1: Write failing UI tests**

Assert the profile list renders one full-width row per person, navigates to hidden route `profile-detail`, subscribes with `watchProfiles`, renders tabs for `变化/档案/依据/分析`, exposes editable dynamic fields and save/restore buttons, renders raw reasoning through text-only DOM APIs, and requests rendering on success and failure. Assert hidden routes are absent from the home grid.

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
node --test src/小手机平台/__tests__/shellSource.test.js
```

Expected: failures because the detail route, subscription, edit controls, and new layout do not exist.

- [ ] **Step 3: Implement list and detail views**

Add `profile-detail` to `PhoneRoute`, add `showOnHome?: boolean` to app definitions, and skip hidden apps in `PhoneShell.renderHome`. Keep selected person, selected segment, and edit draft in the `createPhoneApps` closure. Render compact progress/actions/settings on the list and an independent detail app with four segments, edit/save, previous-version restore, loading/error status, and `watchProfiles` subscriptions.

- [ ] **Step 4: Implement responsive Apple-style CSS**

Make profile content single-column by default inside the fixed 390px shell, use full-width list rows, 44px controls, restrained system colors, sticky detail actions, 0 letter spacing, and reduced-motion/transparency/contrast fallbacks. Avoid nested cards and viewport-dependent profile columns.

- [ ] **Step 5: Run test and verify GREEN**

Run the Task 4 command and expect all shell source tests to pass.

### Task 5: Build and real Tavern verification

**Files:**
- Generated: `dist/小手机/脚本/小手机主程序/index.js`
- Generated: `dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js`

- [ ] **Step 1: Run focused tests**

Run all commands from Tasks 1-4 and require zero failures.

- [ ] **Step 2: Build**

Run:

```powershell
pnpm build
```

Expected: exit code 0. Inspect `git diff` and keep only profile-related generated bundles, preserving unrelated user changes.

- [ ] **Step 3: Verify in SillyTavern**

Open `http://127.0.0.1:8000`, confirm the loaded chat is `末世寒冬-星穹秩序`, open 伊甸终端, run one人物 analysis, and verify list status, independent detail screen, visible analysis/reasoning, edit-save worldbook update, and restore. Capture desktop and 390px screenshots and verify no horizontal overflow or overlapping controls.

- [ ] **Step 4: Commit and push**

Stage only the implementation, focused tests, plan, and matching generated bundles. Commit with `feat: redesign dynamic profile workflow`, rebase on the upstream branch if needed, rerun focused tests after any rebase, push, and verify `HEAD` equals the upstream ref.

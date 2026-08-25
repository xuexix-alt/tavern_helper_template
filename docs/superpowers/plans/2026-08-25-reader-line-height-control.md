# Reader Line Height Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live, per-chat正文行距 slider to the existing same-layer PRE typography panel without changing unrelated UI text spacing.

**Architecture:** A pure helper owns line-height normalization and density defaults, while a focused Vue component owns the slider UI. Existing reader state persists the nullable custom value; `StoryPage` publishes it as a CSS variable consumed only by normal and opening assistant prose.

**Tech Stack:** Vue 3 Composition API, TypeScript, scoped CSS, Node test runner, Tavern Helper chat variables.

## Global Constraints

- Slider range is exactly `1.30–2.10` with step `0.05`.
- `null` means automatic: comfortable density uses `1.90`, minimal density uses `1.70`.
- Custom line height affects only assistant prose and opening prose; paragraph margin and user-message line height remain unchanged.
- State persists in `stream_demo.reader_state.body_line_height` and old states migrate without changing their appearance.
- Do not modify unrelated dirty-worktree files or broad generated output in the source commit.

---

### Task 1: Line-height domain and reader-state migration

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/readerLineHeight.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/types.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/readerState.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/readerLineHeightControl.test.js`

**Interfaces:**
- Produces: `normalizeReaderBodyLineHeight(input: unknown): number | null`.
- Produces: `resolveReaderBodyLineHeight(density: TranscriptDensity, custom: unknown): number`.
- Produces: nullable `ReaderChatState.body_line_height`.

- [ ] **Step 1: Write failing normalization and migration tests**

Add tests that require `readerLineHeight.ts` through `ts-node/register/transpile-only`, then assert:

```js
assert.equal(normalizeReaderBodyLineHeight(null), null);
assert.equal(normalizeReaderBodyLineHeight(1.34), 1.35);
assert.equal(normalizeReaderBodyLineHeight(9), 2.1);
assert.equal(resolveReaderBodyLineHeight('comfortable', null), 1.9);
assert.equal(resolveReaderBodyLineHeight('minimal', null), 1.7);
```

Also inspect `types.ts` and `readerState.ts` and require `body_line_height`, state version `5`, migration normalization, and patch preservation/reset logic.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/readerLineHeightControl.test.js"
```

Expected: FAIL because `readerLineHeight.ts` and `body_line_height` do not exist.

- [ ] **Step 3: Implement the pure line-height domain**

Create constants for `1.3`, `2.1`, and `0.05`; reject null/blank/non-finite input, clamp finite values, align to the step, and return two-decimal numbers. Resolve null custom values from density defaults.

Add this state field:

```ts
body_line_height: number | null;
```

Bump `READER_CHAT_STATE_VERSION` to `5`. Migration writes the normalized value. Patch logic uses an own-property check so an explicit `null` resets to automatic while an omitted field preserves the current value.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 1 test command. Expected: all domain and migration tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- "src/寒冬末日/界面同层版/界面/状态栏/readerLineHeight.ts" "src/寒冬末日/界面同层版/界面/状态栏/types.ts" "src/寒冬末日/界面同层版/界面/状态栏/readerState.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/readerLineHeightControl.test.js"
git commit -m "feat: persist reader body line height"
```

### Task 2: Slider component and live正文 wiring

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/components/ReaderLineHeightControl.vue`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TopToolbar.vue`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptOpeningCard.vue`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/readerLineHeightControl.test.js`

**Interfaces:**
- Consumes: Task 1 normalization helpers and nullable state field.
- Produces: `ReaderLineHeightControl` with `modelValue`, `density`, and `update:modelValue`.
- Produces: root CSS variable `--reader-body-line-height` only for custom values.

- [ ] **Step 1: Write failing component integration tests**

Extend the source-contract test to require:

```js
assert.match(controlSource, /type="range"/);
assert.match(controlSource, /min="1\.3"/);
assert.match(controlSource, /max="2\.1"/);
assert.match(controlSource, /step="0\.05"/);
assert.match(toolbarSource, /ReaderLineHeightControl/);
assert.match(storySource, /--reader-body-line-height/);
assert.match(messageSource, /var\(--reader-body-line-height, 1\.9\)/);
assert.match(openingSource, /var\(--reader-body-line-height, 1\.6\)/);
```

Require `useStreamingDemo.ts` to create, restore, watch, persist, and return `bodyLineHeight`.

- [ ] **Step 2: Run the test and verify RED**

Run the Task 1 test command. Expected: FAIL because the component and integration are absent.

- [ ] **Step 3: Implement the focused slider component**

Render a labeled range input, current numeric value, automatic/custom status, and a “恢复自动” button. The range displays the density-resolved value when `modelValue` is null and emits a normalized number on input; reset emits `null`.

- [ ] **Step 4: Wire state and CSS scope**

Pass the nullable model through `TopToolbar` and `StoryPage`. In `useStreamingDemo`, initialize to null, restore from chat state, persist on change, and expose the ref. In `shellStyleVars`, add the CSS variable only when custom. Replace only assistant/opening prose line-height declarations with `var(--reader-body-line-height, <existing-default>)`; preserve user-message and paragraph-margin rules.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```powershell
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/readerLineHeightControl.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptReadingLayoutContracts.test.js"
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- "src/寒冬末日/界面同层版/界面/状态栏/components/ReaderLineHeightControl.vue" "src/寒冬末日/界面同层版/界面/状态栏/components/TopToolbar.vue" "src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue" "src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts" "src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue" "src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptOpeningCard.vue" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/readerLineHeightControl.test.js"
git commit -m "feat: add正文 line height slider"
```

### Task 3: Formatting, regression, build, and delivery

**Files:**
- Verify all files from Tasks 1–2.
- Generated by CI after push: `dist/寒冬末日/same-layer-pre/界面/状态栏/index.html`
- Generated by CI after push: `dist/寒冬末日/界面同层版/界面/状态栏/index.html`

**Interfaces:**
- Consumes: completed source and tests.
- Produces: pushed source commit plus automated bundle commit.

- [ ] **Step 1: Format and inspect scoped diff**

```powershell
pnpm prettier --write "src/寒冬末日/界面同层版/界面/状态栏/readerLineHeight.ts" "src/寒冬末日/界面同层版/界面/状态栏/readerState.ts" "src/寒冬末日/界面同层版/界面/状态栏/types.ts" "src/寒冬末日/界面同层版/界面/状态栏/components/ReaderLineHeightControl.vue" "src/寒冬末日/界面同层版/界面/状态栏/components/TopToolbar.vue" "src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue" "src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptOpeningCard.vue" "src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue" "src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/readerLineHeightControl.test.js"
git diff --check
```

Expected: no formatting or whitespace errors.

- [ ] **Step 2: Run regressions and targeted build**

```powershell
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/readerLineHeightControl.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptReadingLayoutContracts.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/sameLayerPreSource.test.js"
pnpm build
```

Expected: tests and build finish successfully.

- [ ] **Step 3: Commit any formatter-only source changes**

Stage only the feature files and plan, then commit with `chore: format reader line height control` only if a diff remains.

- [ ] **Step 4: Push and verify automation**

```powershell
git push origin HEAD:20260211
git fetch origin 20260211
git log -3 --oneline origin/20260211
```

Expected: the source commits are followed by a `[bot] bundle` commit that updates both same-layer PRE and full same-layer status-bar bundles.

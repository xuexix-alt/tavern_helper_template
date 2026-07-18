# PRE APPLE Reader Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor all PRE APPLE theme slots into a content-first reader where the latest assistant body is the only persistent full transcript, the related user message is an accordion summary, and history opens in an independent Liquid Glass reading overlay.

**Architecture:** Keep `useSameLayerPre.ts` and all business events untouched. `StoryPagePre.vue` selects an APPLE-only presentation path while non-APPLE themes continue rendering the existing transcript components. Three focused APPLE components share the existing `TranscriptItem[]`: a body renderer, the current reader, and a teleported history overlay.

**Tech Stack:** Vue 3 Composition API, TypeScript, scoped CSS, existing Tavern Helper globals, Node test runner, webpack, Playwright CLI.

**Design spec:** `docs/superpowers/specs/2026-07-18-pre-apple-reader-design.md`

---

## File map

- Create `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleMessageBody.vue`
  - Own the single rendering path for streaming and completed APPLE message bodies.
- Create `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleReader.vue`
  - Select the latest assistant and related user from the already-loaded items; render the Paper reading surface and USER accordion.
- Create `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue`
  - Present the already-loaded transcript in a one-item-expanded modal; own focus trapping, scroll lock, history selection, and item action menus.
- Modify `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
  - Branch APPLE vs non-APPLE presentation, wire history open/close and existing events, preserve scroll/focus, and simplify APPLE chrome.
- Modify `src/寒冬末日/界面同层版/界面/状态栏/theme-tokens.css`
  - Replace old APPLE neutral values with the approved B brightness baselines and shared semantic material tokens.
- Modify `src/寒冬末日/__tests__/sameLayerPreSource.test.js`
  - Replace obsolete APPLE card-style contracts with the reader/history/material contracts.
- Regenerate only tracked PRE output when the full build runs:
  - `dist/寒冬末日/same-layer-pre/界面/状态栏/index.html`
  - `dist/寒冬末日/same-layer-pre/界面/状态栏/index.js.map`
  - `dist/寒冬末日/same-layer-pre/界面/状态栏/main.css.map`

## Task 1: Lock the new APPLE presentation contract with failing tests

**Files:**
- Modify: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`
- Read: `docs/superpowers/specs/2026-07-18-pre-apple-reader-design.md`

- [ ] **Step 1: Record the pre-change Vue/TypeScript baseline**

Run before changing source code:

```powershell
pnpm dlx vue-tsc --noEmit --pretty false 2>&1 | Tee-Object -FilePath '.tmp/pre-apple-vue-tsc-baseline.txt'
```

Do not commit the baseline file. A nonzero exit is allowed only for errors already present outside the PRE APPLE target files; final verification must show that the implementation introduces no additional errors and no errors in the changed Vue files.

- [ ] **Step 2: Replace the obsolete APPLE assertions**

Keep the theme enumeration/default-amber assertions, then require:

```js
const readerSource = readPre(path.join('components', 'PreAppleReader.vue'));
const historySource = readPre(path.join('components', 'PreAppleHistoryOverlay.vue'));
const bodySource = readPre(path.join('components', 'PreAppleMessageBody.vue'));

assert.match(storySource, /const isAppleTheme = computed/);
assert.match(storySource, /<PreAppleReader\s+v-if="isAppleTheme"/);
assert.match(storySource, /<PreTranscriptList\s+v-else/);
assert.match(storySource, /<PreAppleHistoryOverlay/);
assert.match(storySource, /openAppleHistory/);
assert.match(storySource, /restoreAppleReaderPosition/);
assert.match(readerSource, /latestAssistant/);
assert.match(readerSource, /relatedUser/);
assert.match(readerSource, /aria-expanded/);
assert.match(readerSource, /PreAppleMessageBody/);
assert.doesNotMatch(readerSource, /v-for="item in items"/);
assert.match(historySource, /role="dialog"/);
assert.match(historySource, /aria-modal="true"/);
assert.match(historySource, /Teleport to="body"/);
assert.match(historySource, /Escape|event\.key === 'Escape'/);
assert.match(historySource, /focusable|FOCUSABLE/);
assert.match(historySource, /document\.body\.style\.overflow/);
assert.match(historySource, /expandedMessageId/);
assert.match(historySource, /canReroll/);
assert.match(historySource, /canDeleteFrom/);
assert.match(bodySource, /StreamRenderer/);
assert.match(bodySource, /item\.isStreaming/);
assert.match(bodySource, /v-html="item\.finalHtml \|\| item\.preview"/);
assert.match(readerSource, /installPreHostImageGestureForwarder/);
assert.match(readerSource, /useEventListener\(window,\s*'dblclick'/);
assert.match(readerSource, /useEventListener\(window,\s*'touchend'/);
assert.match(bodySource, /pre-message-card__body/);
assert.match(readerSource, /pre-message-card[^\n]*data-message-id|data-message-id[^\n]*pre-message-card/);
assert.match(historySource, /pre-message-card[^\n]*data-message-id|data-message-id[^\n]*pre-message-card/);
```

Update token assertions to require the B baselines:

```js
assert.match(themeTokenSource, /\.theme-apple\s*\{[\s\S]*?--background:\s*#161618/i);
assert.match(themeTokenSource, /\.theme-apple\s*\{[\s\S]*?--surface:\s*#222225/i);
for (const name of ['sky', 'mint', 'lavender', 'sand', 'rose']) {
  assert.match(themeTokenSource, new RegExp(`\\.theme-apple-${name}\\s*\\{[\\s\\S]*?--background:\\s*#edeef2`, 'i'));
  assert.match(themeTokenSource, new RegExp(`\\.theme-apple-${name}\\s*\\{[\\s\\S]*?--surface:\\s*#f9f9fb`, 'i'));
}
assert.match(themeTokenSource, /--apple-paper/);
assert.match(themeTokenSource, /--apple-glass/);
assert.match(themeTokenSource, /--apple-recessed/);
```

- [ ] **Step 3: Add non-regression assertions**

Require that `PreTranscriptList.vue` and `PreTranscriptMessageCard.vue` remain present and that the APPLE branch is the only place using the new components. Retain existing assertions for default `amber`, floating handles, reduced preferences, and original theme enum values.

- [ ] **Step 4: Run the source test and verify RED**

Run `node --test "src/寒冬末日/__tests__/sameLayerPreSource.test.js"`.

Expected: FAIL because the three APPLE components and new token values do not exist yet. Existing non-APPLE/business tests should remain green up to the first new assertion.

- [ ] **Step 5: Commit the failing contract**

```powershell
git add -- "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
git commit -m "test: define PRE Apple reader presentation contract"
```

## Task 2: Build the current APPLE reading surface

**Files:**
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleMessageBody.vue`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleReader.vue`
- Test: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`

- [ ] **Step 1: Implement the shared message body renderer**

`PreAppleMessageBody.vue` accepts one `TranscriptItem`. It uses `StreamRenderer` for `item.isStreaming`, otherwise the existing trusted `finalHtml || preview` path. Move the existing safe wrapping/media/table/code rules into this component and use `17px/1.8` desktop, `16px/1.78` mobile. Keep the `pre-message-card__body` class because `preHostImageGestureForwarder.ts` uses it to resolve the source message. Do not change formatter, image gesture, or HTML generation logic.

```vue
<StreamRenderer
  v-if="item.isStreaming"
  :message="item.content"
  :role="item.role"
  :active="true"
  :message-id="item.message_id"
  class="pre-apple-message-body pre-message-card__body"
/>
<!-- eslint-disable-next-line vue/no-v-html -->
<div v-else class="pre-apple-message-body pre-message-card__body" v-html="item.finalHtml || item.preview"></div>
```

- [ ] **Step 2: Implement latest-assistant and related-user selection**

In `PreAppleReader.vue`, compute:

```ts
const latestAssistant = computed(() => [...props.items].reverse().find(item => item.role === 'assistant') ?? null);
const relatedUser = computed(() => {
  const assistant = latestAssistant.value;
  if (!assistant) return [...props.items].reverse().find(item => item.role === 'user') ?? null;
  const assistantIndex = props.items.findIndex(item => item.message_id === assistant.message_id);
  return [...props.items.slice(0, assistantIndex)].reverse().find(item => item.role === 'user') ?? null;
});
```

Use existing `preview`/`raw` content to build a whitespace-collapsed one-line summary. Expansion is local UI state and resets only when the related user message id changes.

- [ ] **Step 3: Render USER accordion, Paper body, empty/error states, and contextual actions**

- USER trigger: semantic `button`, `aria-expanded`, `aria-controls`, chevron rotation, one-line ellipsis.
- ASSISTANT: stable Paper surface, metadata at 12–13px, shared body renderer, no glass.
- Current action menu: rollback lives under “更多”; existing bottom “重生” remains the persistent regenerate entry. Confirmation reuses the parent `rollbackConfirmMessageId` and existing confirm/cancel emits.
- No assistant: show “等待回复” when a user exists, otherwise “等待聊天记录”.
- Error: render after the Paper/empty state with existing error text.
- Wrap every rendered current/expanded message body in an ancestor carrying `class="pre-message-card"` and `:data-message-id="item.message_id"`. These compatibility hooks are behavioral selectors, not permission to reuse the old card visuals.

- [ ] **Step 4: Preserve the existing host image gesture bridge**

Install the existing bridge once in `PreAppleReader.vue` while the APPLE presentation is mounted:

```ts
const hostImageGestureForwarder = installPreHostImageGestureForwarder();
useEventListener(window, 'dblclick', hostImageGestureForwarder.handleDoubleClick, { capture: true });
useEventListener(window, 'touchend', hostImageGestureForwarder.handleTouchEnd, { capture: true, passive: false });
```

The reader remains mounted behind the teleported history overlay, so this single listener also serves expanded history bodies. Do not install a second copy in `PreAppleHistoryOverlay.vue`.

- [ ] **Step 5: Expose scroll restoration methods**

```ts
defineExpose({
  getScrollTop: () => readerRef.value?.scrollTop ?? 0,
  setScrollTop: (value: number) => {
    if (readerRef.value) readerRef.value.scrollTop = value;
  },
});
```

- [ ] **Step 6: Run the source test**

Run the same Node test. Expected: reader/body assertions pass; history and page wiring assertions still fail.

- [ ] **Step 7: Commit**

```powershell
git add -- "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleMessageBody.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleReader.vue"
git commit -m "feat: add focused PRE Apple reading surface"
```

## Task 3: Add the APPLE history overlay and page wiring

**Files:**
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
- Test: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`

- [ ] **Step 1: Implement the overlay state model**

The overlay receives `open`, `items`, `busy`, and `rollbackConfirmMessageId`. On first open, choose the assistant immediately before the latest assistant; fall back to the latest displayable item. On later opens, retain the selected id only if it still exists. Keep a single `expandedMessageId`.

Do not fetch history, mutate `transcriptWindowLabel`, or modify `useSameLayerPre.ts`.

- [ ] **Step 2: Implement accessible modal behavior**

- Teleport to `body` and use `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
- On open: save body overflow, set it to `hidden`, focus the close button after `nextTick`.
- On `Tab`: wrap focus between the first and last enabled focusable descendants.
- On `Escape`: emit `close`.
- On close/unmount: restore the exact previous body overflow.
- Backdrop closes only while `rollbackConfirmMessageId == null`.
- The parent restores trigger focus because the trigger lives in `StoryPagePre.vue`.

- [ ] **Step 3: Implement one-expanded-item history reading**

Rows show role, `#message_id`, flags, and a one-line summary. Clicking a row sets the single expanded id. Expanded body uses `PreAppleMessageBody` inside a `pre-message-card[data-message-id]` compatibility wrapper so the reader-owned image gesture listener can resolve its host floor. A local “更多” menu reveals regenerate/rollback only when existing item permissions allow them; all actions emit the existing `TranscriptItem` unchanged.

- [ ] **Step 4: Wire the APPLE branch in StoryPagePre**

```ts
const isAppleTheme = computed(() => theme.value === 'apple' || theme.value.startsWith('apple-'));
const appleHistoryOpen = ref(false);
const appleReaderRef = ref<AppleReaderExpose | null>(null);
const appleReaderScrollTop = ref(0);
const appleHistoryTriggerRef = ref<HTMLButtonElement | null>(null);
```

APPLE “楼层” opens history; non-APPLE keeps `toggleTranscriptWindowMenu`. Before opening, save reader scroll. On close, `nextTick`, restore saved scroll and focus the trigger.

```vue
<PreAppleReader v-if="isAppleTheme" ref="appleReaderRef" :items="transcriptItems" ... />
<PreTranscriptList v-else :items="transcriptItems" ... />
<PreAppleHistoryOverlay :open="isAppleTheme && appleHistoryOpen" :items="transcriptItems" ... />
```

All regenerate/rollback emits call the existing page functions. Switching away from APPLE closes history without mutating transcript/business state.

- [ ] **Step 5: Run tests and verify GREEN for structure**

Run `node --test "src/寒冬末日/__tests__/sameLayerPreSource.test.js"`.

Expected: new structure/history assertions pass. Any remaining failures should be obsolete APPLE style/token assertions intentionally replaced in Task 1, not business assertions.

- [ ] **Step 6: Commit**

```powershell
git add -- "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue"
git commit -m "feat: add PRE Apple history reading overlay"
```

## Task 4: Rebuild the APPLE material and color system

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/theme-tokens.css`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
- Modify: APPLE component styles created in Tasks 2–3
- Test: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`

- [ ] **Step 1: Replace old APPLE neutral values with semantic B-baseline tokens**

Deep APPLE:

```css
.theme-apple {
  --background: #161618;
  --surface: #222225;
  --surface-hover: #2c2c2e;
  --foreground: #f5f5f7;
  --muted-foreground: #aeaeb2;
  --primary: #0a84ff;
  --apple-canvas: #161618;
  --apple-paper: #222225;
  --apple-elevated: #2c2c2e;
  --apple-recessed: #1c1c1e;
  --apple-glass: rgba(44, 44, 46, 0.72);
}
```

Each light APPLE variant shares:

```css
--background: #edeef2;
--surface: #f9f9fb;
--surface-hover: #ffffff;
--foreground: #1d1d1f;
--muted-foreground: #6e6e73;
--apple-canvas: #edeef2;
--apple-paper: #f9f9fb;
--apple-elevated: #ffffff;
--apple-recessed: #e4e5ea;
--apple-glass: rgba(249, 249, 251, 0.72);
```

Only `--primary` and a 2%–4% `--apple-wash` differ among Sky/Mint/Lavender/Sand/Rose. Keep `color-scheme` correct.

- [ ] **Step 2: Replace the duplicated APPLE override block in StoryPagePre**

Remove obsolete APPLE `.pre-message-card` styling and repeated per-color component selector lists. Keep one `.theme-apple` chrome block that uses semantic tokens, makes a continuous canvas, limits reading measure, uses Regular Glass only for chrome/floating panels, keeps edge handles out of flow, removes hard separators/terminal meters, and leaves all non-APPLE rules unchanged.

- [ ] **Step 3: Finish component material styles**

- `PreAppleReader`: Paper body, recessed USER accordion, 720–780px reading column.
- `PreAppleHistoryOverlay`: desktop 1040px/88vh glass overlay, inner 720–780px reading column; mobile `96dvh` bottom sheet.
- No glass-on-glass. Inner buttons use neutral fills; Accent only for selected/primary/focus.
- Use concentric radii, 8pt spacing, and one soft scroll-edge gradient.

- [ ] **Step 4: Add preference fallbacks**

- `prefers-reduced-motion`: remove sheet translation and spring overshoot; <=160ms opacity.
- `prefers-reduced-transparency`: glass alpha >=0.92 and no backdrop filter.
- `prefers-contrast: more`: stronger separators/text/focus without restoring card-wall borders.

- [ ] **Step 5: Run tests and token check**

```powershell
node --test "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
pnpm check:component-tokens
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- "src/寒冬末日/界面同层版/界面/状态栏/theme-tokens.css" "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleMessageBody.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleReader.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue" "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
git commit -m "style: rebuild PRE Apple material hierarchy"
```

## Task 5: Harden interaction and regression behavior

**Files:**
- Modify: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`
- Modify as needed: the three APPLE components and `StoryPagePre.vue`

- [ ] **Step 1: Add source contracts for edge cases and isolation**

Assert USER selection precedes the latest assistant and falls back to the latest user when no assistant exists; empty states exist; the current reader has no transcript loop; history contains no `getChatMessages`, `refreshTranscript`, or `transcriptWindowLabel`; leaving APPLE closes history; the non-APPLE menu/list branch remains; focus/scroll/body overflow/Escape/Tab handling exists; floating handles stay out of layout flow; the APPLE reader owns exactly one host image gesture listener; current USER/ASSISTANT and expanded history bodies keep `.pre-message-card__body` beneath `.pre-message-card[data-message-id]`.

- [ ] **Step 2: Run RED if any contract is missing**

Run `node --test "src/寒冬末日/__tests__/sameLayerPreSource.test.js"`.

Expected: FAIL only for newly identified missing behavior.

- [ ] **Step 3: Implement the smallest corrections**

Do not broaden scope. Fix only reader/history/chrome behavior required by the failing contract.

- [ ] **Step 4: Run targeted lint and tests**

```powershell
pnpm exec eslint "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleMessageBody.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleReader.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue" "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
node --test "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
pnpm check:component-tokens
pnpm dlx vue-tsc --noEmit --pretty false
```

Expected: lint, Node tests, and token check exit 0. Compare `vue-tsc` with the Task 1 baseline: it may retain unrelated pre-existing diagnostics, but it must add no diagnostic and must report no diagnostic for the changed PRE APPLE files.

- [ ] **Step 5: Commit**

```powershell
git add -- "src/寒冬末日/__tests__/sameLayerPreSource.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleMessageBody.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleReader.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue"
git commit -m "test: harden PRE Apple reader interactions"
```

## Task 6: Build and perform real-browser visual verification

**Files:**
- Regenerate: the three tracked PRE dist files listed in the file map
- Do not stage: unrelated existing dirty files or unrelated build outputs

- [ ] **Step 1: Record the dirty-worktree baseline**

Run `git status --short`. Preserve every unrelated pre-existing modification. Do not reset, clean, or stage broad paths.

- [ ] **Step 2: Run the production build**

Run `pnpm build`.

Expected: webpack exits 0. The build may touch unrelated `dist/**`; stage only the three PRE artifacts.

- [ ] **Step 3: Start a hidden local server for the built PRE page**

```powershell
Start-Process python -ArgumentList '-m','http.server','4173','--directory','dist/寒冬末日/same-layer-pre/界面/状态栏' -WindowStyle Hidden -PassThru
```

Verify `http://127.0.0.1:4173/` responds before browser automation. Stop only the exact returned process after verification.

- [ ] **Step 4: Verify with Playwright CLI**

Use the repository `playwright-cli` skill. If Tavern globals are absent, inject minimal read-only stubs before navigation so the UI can mount; do not alter product code for the harness.

Check all six APPLE variants at 375, 768, 1024, and 1440 widths: latest assistant is the sole full body; USER expands in place; 楼层 opens history without replacing the main body; only one history item expands; Escape closes and focus returns; handles do not change reader bounds; no horizontal overflow; composer does not cover content; B-baseline brightness is balanced; glass is visible on controls and absent from Paper; accessibility fallbacks remain legible.

Capture representative desktop dark, desktop light, and mobile screenshots for inspection. Screenshots are QA artifacts and need not be committed.

- [ ] **Step 5: Run final verification**

```powershell
node --test "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
pnpm check:component-tokens
pnpm exec eslint "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleMessageBody.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleReader.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue" "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
pnpm dlx vue-tsc --noEmit --pretty false
git diff --check
```

Expected: tests, token check, targeted lint, and build exit 0. For `vue-tsc`, compare against `.tmp/pre-apple-vue-tsc-baseline.txt`: the final run must add no diagnostic and must contain no diagnostic for the changed PRE APPLE files. Report unrelated pre-existing type or `git diff --check` failures separately rather than modifying user files.

- [ ] **Step 6: Commit only PRE generated output and verified final corrections**

```powershell
git add -- "dist/寒冬末日/same-layer-pre/界面/状态栏/index.html" "dist/寒冬末日/same-layer-pre/界面/状态栏/index.js.map" "dist/寒冬末日/same-layer-pre/界面/状态栏/main.css.map"
git commit -m "build: refresh PRE Apple reader output"
```

If those files are unchanged, skip the empty commit. Do not push unless explicitly requested.

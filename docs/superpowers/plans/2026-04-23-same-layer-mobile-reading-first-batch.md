# Same-layer Mobile Reading First Batch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the same-layer mobile shell prioritize reading and composition by shrinking always-on chrome, keeping the composer in the first viewport, and removing persistent FAB pressure from the transcript rail.

**Architecture:** Keep the change set inside the existing `StoryPage.vue`, `BottomComposer.vue`, and `TranscriptList.vue` contracts. Use source-based tests to lock the mobile layout policy first, then make the smallest template and CSS updates needed to satisfy those contracts without touching send-path, MVU, or image business logic.

**Tech Stack:** Vue 3 SFC, scoped CSS, node:test source assertions, webpack build.

---

## Chunk 1: Mobile shell policy

### Task 1: Lock the StoryPage and TranscriptList mobile contracts

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/storyPageResponsiveLayoutSource.test.js`
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptMobileFabPolicySource.test.js`

- [ ] **Step 1: Write the failing tests**

Add assertions for:
- compact mobile top bar hiding the brand copy and keeping the action row unwrapped
- compact mobile bottom console strip collapsing the role rack and utility row into a tighter one-column stack
- compact mobile sidebar toggles being hidden so the shell stops pinning both screen edges
- mobile transcript FAB stack changing from always-visible rail to pointer-events-disabled hidden state unless an explicit reveal class is present

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/storyPageResponsiveLayoutSource.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptMobileFabPolicySource.test.js`
Expected: FAIL with missing source pattern assertions for the new mobile contracts.

### Task 2: Implement the minimal StoryPage mobile shell changes

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`

- [ ] **Step 1: Reduce mobile top chrome**

Hide the decorative brand copy in compact layout, keep the transcript window and more menu on a single row, and avoid wrapping that pushes the composer below the fold.

- [ ] **Step 2: Collapse the bottom console strip**

On compact layout, stack the role rack and utility row with tighter gap/padding, and keep the strip visually subordinate to the composer.

- [ ] **Step 3: Remove edge-pinned mobile drawer toggles**

Hide the side toggle tabs in compact layout so mobile navigation flows through the top-bar more menu and existing drawer open actions instead of two persistent edge handles.

- [ ] **Step 4: Run targeted tests to verify StoryPage passes**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/storyPageResponsiveLayoutSource.test.js`
Expected: PASS.

## Chunk 2: Transcript rail and composer reachability

### Task 3: Lock and implement the mobile FAB policy

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptMobileFabPolicySource.test.js`

- [ ] **Step 1: Implement hidden-by-default mobile FAB rail**

Keep the desktop and reader-desktop rail behavior intact, but in compact mobile mode make the FAB stack visually hidden and non-interactive until an explicit reveal class is applied later.

- [ ] **Step 2: Preserve the image FAB contract**

Ensure the image trigger still exists in source, but follows the same compact mobile visibility policy so it no longer crowds the prose edge.

- [ ] **Step 3: Run the targeted FAB test**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptMobileFabPolicySource.test.js`
Expected: PASS.

### Task 4: Verify composer touch-target regression coverage stays green

**Files:**
- Verify: `src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/bottomComposerResponsiveSource.test.js`

- [ ] **Step 1: Re-run the existing narrow-layout composer test**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/bottomComposerResponsiveSource.test.js`
Expected: PASS.

- [ ] **Step 2: Run the combined first-batch verification**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/storyPageResponsiveLayoutSource.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptMobileFabPolicySource.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/bottomComposerResponsiveSource.test.js`
Expected: PASS.

- [ ] **Step 3: Run a focused production build**

Run: `pnpm build`
Expected: exit code 0.

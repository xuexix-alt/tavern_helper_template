# Same-layer Reader Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the same-layer reader use iframe actual width for layout decisions, keep the send button at least 44x44, and simplify top actions in narrow iframe widths.

**Architecture:** Add a small layout-mode state in `StoryPage.vue` driven by the host shell actual width, then branch the top-bar rendering and pass the mode into child components for focused styling. Keep the DOM and behavior changes minimal so existing same-layer flows remain intact.

**Tech Stack:** Vue 3 SFC, existing scoped CSS, VueUse-friendly resize handling, node:test source assertions, Playwright CLI regression checks.

---

### Task 1: Lock failing tests for the layout contract

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptHistoryUiSource.test.js`
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/storyPageResponsiveLayoutSource.test.js`
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/bottomComposerResponsiveSource.test.js`

- [ ] Write failing source tests for iframe-width layout mode, top-bar more-menu, and 44x44 send button minimum.
- [ ] Run those tests and confirm they fail for the expected missing patterns.

### Task 2: Add minimal iframe-width responsive layout state

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`

- [ ] Add host-shell width tracking and derive `compact / reader_desktop / wide` layout modes from actual iframe width.
- [ ] Replace narrow-layout top bar with primary actions plus a more menu that holds secondary actions.
- [ ] Use the new layout mode instead of browser width checks where this feature depends on iframe width.
- [ ] Run targeted source tests and confirm they pass.

### Task 3: Raise touch targets and type scale in children

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue`

- [ ] Add a layout-mode prop where needed for compact vs reader-desktop behavior.
- [ ] Keep `send-btn` at or above 44x44 in narrow modes.
- [ ] Raise high-frequency control text into the 12-14px range and increase FAB hit targets.
- [ ] Run targeted tests and confirm they pass.

### Task 4: Verify with project tests and Playwright

**Files:**
- Verify only

- [ ] Run the targeted node:test commands for the new/changed source tests.
- [ ] Run the relevant broader test command for the same-layer status-bar tests if practical.
- [ ] Use Playwright CLI on `http://127.0.0.1:8000` to reopen `末世寒冬-星穹秩序` and verify the updated layout at 375, around 700, and 1920 widths.
- [ ] Report the actual verification evidence, not assumptions.

# Preview Removal and Opening Raw Preservation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove preview-summary fallback logic and preserve opening payload content/options extraction without meta sanitization, while keeping assistant final rendering on the full raw -> Tavern regex -> displayed-message pipeline.

**Architecture:** Keep `TranscriptItem.preview` as a compatibility field for now but stop producing/consuming meaningful preview data in the same-layer UI. Preserve assistant full-raw rendering by leaving `finalHtml`/`regexText` on the complete display source, and narrow opening payload extraction helpers so they no longer strip meta blocks before extracting content/options.

**Tech Stack:** Vue 3, TypeScript, Node test runner, SillyTavern runtime globals

---

### Task 1: Lock behavior with failing tests

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/previewRemovalSource.test.js`
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/openingExtraction.test.js`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run the tests to verify they fail**
- [ ] **Step 3: Confirm the failures match preview fallback + opening sanitization assumptions**

### Task 2: Remove preview-generation / preview-fallback usage

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue`

- [ ] **Step 1: Stop generating transcript preview text from `stripTagsForPreview(...)`**
- [ ] **Step 2: Remove preview fallback from user/system message card rendering**
- [ ] **Step 3: Ensure reader summary no longer depends on preview fields**
- [ ] **Step 4: Keep assistant final render path untouched**

### Task 3: Preserve opening payload content/options raw extraction

**Files:**
- Modify: `src/寒冬末日/界面同层版/shared/opening.ts`

- [ ] **Step 1: Remove `stripOpeningMetaBlocks(...)` from `extractOpeningContent*` / `extractOpeningOptions` call chain**
- [ ] **Step 2: Keep tag-based extraction behavior but stop pre-cleaning raw text**
- [ ] **Step 3: Leave opening final display path unchanged**

### Task 4: Verify

**Files:**
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/previewRemovalSource.test.js`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/openingExtraction.test.js`
- Test: existing same-layer regression suite

- [ ] **Step 1: Run targeted tests**
- [ ] **Step 2: Run the existing same-layer regression suite**
- [ ] **Step 3: Run `pnpm build`**

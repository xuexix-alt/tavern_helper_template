# Same-Layer Image Bridge Alignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `src/寒冬末日/界面同层版` image generation and gallery behavior with `st-chatu8`, keeping only bridge, single-response persistence, and read-only display.

**Architecture:** Keep host-node click and double-click forwarding as the interaction backbone, but collapse the persistence path to a single official event flow: request/response bind -> one message patch -> targeted UI refresh. Remove DOM-observer-driven message rewrites, bulk image sanitize writes, and any gallery/transcript logic that turns rendered image DOM back into source-of-truth data.

**Tech Stack:** TypeScript, Vue 3 SFC, Tavern Helper event bridge, existing `st-chatu8` host DOM integration.

---

## File Map

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
  - Remove DOM-observer persistence and bulk sanitize write-back paths
  - Keep official image request/response persistence path
  - Keep read-only gallery/transcript image extraction
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
  - Confirm image click/double-click forwarding semantics remain:
    - single click -> original host image viewer
    - double click -> original host regenerate
  - Ensure gallery images follow the same forwarding rules
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts`
  - Tighten patch logic to minimal single-message persistence and cheaper dedupe
- Modify: `src/寒冬末日/界面同层版/开发文档.md`
  - Document the new “plugin-driven, UI-bridge-only” image behavior

## Chunk 1: Remove self-triggered persistence loop

### Task 1: Freeze the current persistence entry points in a failing/guarded check

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`

- [ ] **Step 1: Add a temporary developer-facing guard comment block around the image persistence section**

Document in code which functions are being retired:
- `persistDisplayedImagePrompts`
- `queuePersistDisplayedImagePrompts`
- `bindDisplayedImagePromptObserver`
- `sanitizePluginImageExtrasInCurrentChat`
- `sanitizePluginImageCacheMeta`

- [ ] **Step 2: Run a targeted search to ensure all call sites are known**

Run: `rg -n "persistDisplayedImagePrompts|queuePersistDisplayedImagePrompts|bindDisplayedImagePromptObserver|sanitizePluginImageExtrasInCurrentChat|sanitizePluginImageCacheMeta" "src/寒冬末日/界面同层版/界面/状态栏"`
Expected: only known image loop call sites are returned.

- [ ] **Step 3: Remove the retired functions and their mounted/sync call sites**

Delete the DOM observer flow and sanitize-on-mount/write-back flow without touching the official image request/response bridge.

- [ ] **Step 4: Run a second search to confirm loop entry points are gone**

Run: `rg -n "persistDisplayedImagePrompts|queuePersistDisplayedImagePrompts|bindDisplayedImagePromptObserver|sanitizePluginImageExtrasInCurrentChat|sanitizePluginImageCacheMeta" "src/寒冬末日/界面同层版/界面/状态栏"`
Expected: no matches.

## Chunk 2: Keep only official-event single-message persistence

### Task 2: Tighten response persistence and dedupe

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`

- [ ] **Step 1: Review `buildGeneratedImagePersistencePatch` and simplify dedupe rules**

Ensure dedupe prefers `requestId`, then falls back to normalized `src`, without whole-array string comparison.

- [ ] **Step 2: Keep response persistence as a one-message patch only**

Make sure `persistGeneratedImageResponse` only reads one target message and writes one target message.

- [ ] **Step 3: Ensure response success only triggers targeted UI refresh**

Keep `scheduleUiRefresh(['transcript', 'gallery'], ...)` or equivalent local refresh, but do not re-enter any image write-back flow.

- [ ] **Step 4: Run a targeted search for `setChatMessages(` in the image bridge section**

Run: `rg -n "setChatMessages\\(" "src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts"`
Expected: image-related writes are limited to direct response persistence and other non-image core flows.

## Chunk 3: Preserve original plugin interaction semantics

### Task 3: Lock click and double-click semantics to host-original actions

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`

- [ ] **Step 1: Verify host target resolution order remains requestId -> promptToken -> imageSrc**

Keep the existing resolution helpers but avoid adding fallback behaviors that simulate plugin actions without a host node.

- [ ] **Step 2: Confirm single-click on generated images forwards to host image node**

`handleGeneratedImageClickCapture` should only forward click to the resolved host image for the original “more images viewer” behavior.

- [ ] **Step 3: Confirm double-click on generated images forwards to host image/button**

`handleGeneratedImageDoubleClickCapture` should start pending task tracking, mark recent intent, and dispatch a host-side double-click only when a host node is resolved.

- [ ] **Step 4: Confirm transcript-body double-click still routes to the original host trigger**

Keep `handleTranscriptDoubleClickCapture` and `proxyImageMenuToHost` aligned with the original host-node trigger path.

## Chunk 4: Keep gallery and body rendering read-only

### Task 4: Audit gallery/body image reads so they never become write-back sources

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`

- [ ] **Step 1: Review `extractRenderedImagesFromRoots` usage**

Remove any remaining persistence coupling. It may still be used for display-side extraction if needed, but not to rewrite message truth.

- [ ] **Step 2: Review `buildGalleryEntriesForMessage` input sources**

Keep reads from:
- `data.stream_demo.generated_images`
- `extra.images`
- plugin cache

Do not add any backflow into raw message/data/extra from gallery construction.

- [ ] **Step 3: Rebuild the gallery from persisted/read-only sources only**

Ensure gallery rendering still survives reload by reading persisted message data first and cache second.

## Chunk 5: Document and verify behavior

### Task 5: Update docs and run manual verification

**Files:**
- Modify: `src/寒冬末日/界面同层版/开发文档.md`

- [ ] **Step 1: Document the new image bridge contract**

Add a short section explaining:
- `st-chatu8` owns generation and original interactions
- same-layer UI only bridges, persists once, and displays
- gallery is a collector, not image truth

- [ ] **Step 2: Run a repo build**

Run: `pnpm build`
Expected: build succeeds without TypeScript or bundling errors.

- [ ] **Step 3: Run targeted searches for removed loop mechanisms**

Run:
- `rg -n "MutationObserver|bindDisplayedImagePromptObserver" "src/寒冬末日/界面同层版/界面/状态栏"`
- `rg -n "persistDisplayedImagePrompts|sanitizePluginImageExtrasInCurrentChat|sanitizePluginImageCacheMeta" "src/寒冬末日/界面同层版/界面/状态栏"`

Expected: removed or intentionally retained-only non-write-back matches.

- [ ] **Step 4: Manual verification in Tavern**

Verify:
- double-click transcript body triggers original plugin image generation
- single-click generated image opens original “more images” viewer
- double-click generated image regenerates through original plugin path
- image response persists once and survives UI reload
- gallery and body both render persisted images
- no repeated full-message write-back loop appears in console behavior


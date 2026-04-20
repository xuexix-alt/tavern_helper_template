# Same-Layer Image Entity Unification and Gallery Catalog Persistence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify same-layer generated-image identity and readiness so transcript and gallery share one image-entity path, while the gallery persists a stable ready-only catalog through chat metadata plus a local cache mirror.

**Architecture:** Add a small canonical image-entity helper that merges prompt-token, mes-tag, `extra.images`, host DOM, and cache signals into one per-message entity list. Then layer a gallery-owned persisted catalog projection on top of those ready entities, persisting it primarily through chat metadata with a local cache mirror, while splitting placeholder-vs-ready DOM checks so button placeholders no longer force native-ready rendering.

**Tech Stack:** TypeScript, Vue 3, lodash, node:test, localStorage, existing same-layer native-first image helpers

---

## Chunk 1: Red Tests

### Task 1: Add collector-focused regression tests

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageEntities.test.js`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js`

- [ ] **Step 1: Write the failing tests**

Add cases for:

- placeholder buttons do not count as ready native images
- prompt-token-only plus ready native image collapses to one ready entity
- gallery filtering excludes placeholder-only entities
- later ready source upgrades an existing placeholder entity instead of duplicating it

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageEntities.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js`

Expected: FAIL because the new collector API and ready-only DOM semantics do not exist yet.

## Chunk 2: Image Entity Helper

### Task 2: Add canonical image-entity collector

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageEntities.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageEntities.test.js`

- [ ] **Step 1: Write the minimal collector implementation**

Implement:

- per-message canonical entity merge
- ready-vs-placeholder state
- stable key generation with explicit-id-first alias matching
- gallery-ready filtering helper

- [ ] **Step 2: Run tests to verify the helper passes**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageEntities.test.js`

Expected: PASS

## Chunk 3: Wire Transcript and Gallery

### Task 3: Split placeholder-vs-ready DOM checks

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageDom.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js`

- [ ] **Step 1: Implement ready-only native image counting**

Keep placeholder mutation detection, but expose ready-only counting for render-mode decisions.

- [ ] **Step 2: Run DOM helper tests**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js`

Expected: PASS

### Task 4: Move gallery and transcript image paths onto canonical entities

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/types.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageEntities.test.js`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js`

- [ ] **Step 1: Read canonical entities where transcript/gallery currently rebuild native refs**

Replace duplicate membership/native-image assignment where practical with canonical entity reads.

- [ ] **Step 2: Ensure gallery only emits ready entities**

Skip prompt-only and button-only states in gallery output.

- [ ] **Step 3: Preserve ready transcript images across placeholder-only refreshes**

Do not regress from ready image entity back to placeholder-only render decisions.

- [ ] **Step 4: Run focused same-layer tests**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageEntities.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js`

Expected: PASS

## Chunk 4: Gallery Catalog Persistence

### Task 5: Add a persisted gallery catalog helper

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/galleryCatalogPersistence.ts`
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/galleryCatalogPersistence.test.js`

- [ ] **Step 1: Write the failing persistence tests**

Add cases for:

- ready-only entries are normalized into catalog records
- metadata entries and local cache entries merge by canonical image id
- live ready entries upgrade existing persisted records instead of duplicating them
- oversized or placeholder-only entries are excluded from persistence payloads

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/galleryCatalogPersistence.test.js`

Expected: FAIL because the catalog persistence helper does not exist yet.

### Task 6: Implement metadata-plus-local-cache gallery catalog persistence

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/galleryCatalogPersistence.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/types.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/galleryCatalogPersistence.test.js`

- [ ] **Step 1: Add normalized catalog record types and merge helpers**

Implement:

- ready-only catalog normalization
- metadata/local cache merge
- live-entry upsert semantics
- runtime-safe metadata write probing with local cache mirror

- [ ] **Step 2: Run persistence helper tests**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/galleryCatalogPersistence.test.js`

Expected: PASS

## Chunk 5: Wire Persisted Catalog into the UI

### Task 7: Hydrate and persist gallery catalog from `useStreamingDemo`

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js`

- [ ] **Step 1: Add failing integration/source assertions**

Assert that:

- `useStreamingDemo` imports the catalog helper
- gallery output merges persisted catalog entries with live ready entities
- chat change / host refresh rehydrates the persisted catalog

- [ ] **Step 2: Run focused integration/source tests and confirm failure**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/galleryCatalogPersistence.test.js`

Expected: FAIL before the wiring exists.

- [ ] **Step 3: Implement hydration, merge, and debounced persistence**

Keep gallery rendering ready-only, but let persisted catalog entries survive reloads and transient DOM loss.

- [ ] **Step 4: Re-run focused gallery tests**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageEntities.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/galleryCatalogPersistence.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js`

Expected: PASS

## Chunk 6: Verification

### Task 8: Verify the integrated path

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageEntities.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/galleryCatalogPersistence.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageDom.ts`

- [ ] **Step 1: Run a broader quality check**

Run: `node --test src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageEntities.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/galleryCatalogPersistence.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/componentTraceInstrumentation.test.js`

Expected: PASS

- [ ] **Step 2: Inspect git diff and summarize residual runtime-only risks**

Call out any remaining MCP/live-page validation still needed for host-specific timing.

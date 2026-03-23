# Same-layer plugin-native full compatibility A1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove runtime `stream_demo.generated_images` legacy read/write paths and make same-layer image reads rely only on plugin-native sources plus `chatMetadata['st-chatu8']` fallback.

**Architecture:** Keep host-bridge and native-first read flow, but delete the UI-owned legacy persistence branch. Re-introduce a small shared cache reader for `chatMetadata['st-chatu8']`, then route transcript/gallery/resolver reads through `extra.images -> mes tags -> chatMetadata fallback`.

**Tech Stack:** TypeScript, Vue same-layer UI, Node test runner, plugin-native `st-chatu8` structures.

---

## Chunk 1: Lock deletion boundaries with tests

### Task 1: Update artifact tests to ban legacy stream_demo fallback

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`

- [ ] **Step 1: Rewrite legacy-related tests**
- [ ] **Step 2: Assert no `legacy_stream_demo` source remains**
- [ ] **Step 3: Run targeted test to verify failure**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

### Task 2: Add runtime static assertions for removed symbols

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`

- [ ] **Step 1: Add source-level assertions for removed runtime symbols**
- [ ] **Step 2: Verify test fails before implementation**

---

## Chunk 2: Remove runtime legacy reads and restore cache fallback

### Task 3: Introduce shared chatMetadata fallback reader

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeCacheArtifacts.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts`

- [ ] **Step 1: Add minimal cache artifact collector for `chatMetadata['st-chatu8']`**
- [ ] **Step 2: Wire `useStreamingDemo.ts` to use shared cache fallback**
- [ ] **Step 3: Wire resolver cache fallback without resurrecting stream_demo**
- [ ] **Step 4: Run targeted artifact tests**

### Task 4: Delete stream_demo legacy runtime branches

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageArtifacts.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts`

- [ ] **Step 1: Remove `readPersistedGeneratedImages()`**
- [ ] **Step 2: Remove `legacyGeneratedImages` input and collector**
- [ ] **Step 3: Remove resolver `stream_demo.generated_images` fallback**
- [ ] **Step 4: Keep priority as `host_dom -> extra -> mes_tag -> cache`**
- [ ] **Step 5: Run targeted tests**

---

## Chunk 3: Remove dead legacy write paths and update docs

### Task 5: Remove dead runtime persistence bridge entry points

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts`

- [ ] **Step 1: Remove/retire `persistGeneratedImageResponse()` references**
- [ ] **Step 2: Remove remaining runtime `stream_demo.generated_images` write code**
- [ ] **Step 3: Run static grep verification**

Run:

```bash
rg -n --hidden -S "stream_demo.generated_images|readPersistedGeneratedImages|legacyGeneratedImages|persistGeneratedImageResponse" src
```

Expected: no runtime hits in active code paths.

### Task 6: Sync docs to A1 wording

**Files:**
- Modify: `src/寒冬末日/界面同层版/开发文档.md`

- [ ] **Step 1: Replace remaining legacy stream_demo image-chain wording**
- [ ] **Step 2: Keep docs aligned with `extra.images / mes / chatMetadata fallback`**

---

## Verification

- [ ] `node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"`
- [ ] `node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeMesTag.test.js"`
- [ ] `node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/hostMesTextRender.test.js"`
- [ ] `rg -n --hidden -S "stream_demo.generated_images|readPersistedGeneratedImages|legacyGeneratedImages|persistGeneratedImageResponse" src`

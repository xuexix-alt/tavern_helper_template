# Same-layer Native-first image chain convergence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the same-layer image flow to a Native-first model that reads plugin-native results (`extra.images`, `chat[mesId].mes`, host DOM, Stego PNG) and stops writing UI-owned `extra.images`, `stream_demo.generated_images`, and `idb://` references.

**Architecture:** Keep the host interaction bridge, but move image-source truth toward plugin-native structures. Add a dedicated mes image-tag parser, refactor source priority into a Native-first aggregator, downgrade the old request/response persistence bridge to non-runtime or remove it from active flow, and retire IndexedDB-based image persistence.

**Tech Stack:** TypeScript, Vue same-layer UI, Node built-in test runner, `st-chatu8` native structures (`extra.images`, `mes_text`, Stego PNG assumptions), existing same-layer image bridge utilities.

---

## File structure and responsibilities

### New files

- `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeMesTag.ts`
  - Parse `message.message` / `chat[mesId].mes` for native `image###...###` tags.
  - Return ordered tag entries with prompt token, raw tag, anchor text, and entity hints.
- `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageArtifacts.ts`
  - Aggregate native-first readable image artifacts from host DOM, `extra.images`, mes-tag parser results, and fallback cache.
  - Provide one stable read path for transcript/gallery rendering.
- `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeMesTag.test.js`
  - Focused parser tests for native mes tags and anchor extraction.
- `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`
  - Priority tests for `extra.images -> mes tags -> cache fallback`.

### Modified files

- `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
  - Remove active reliance on `chatMetadata` as a primary source.
  - Route transcript/gallery image reads through the new Native-first artifact reader.
  - Stop using `persistGeneratedImageResponse()` as runtime image-write logic.
- `src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts`
  - Reorder source priority to `extra -> mes_tag -> cache_fallback -> legacy_stream_demo`.
  - Remove runtime `idb://` handling from the main path.
- `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
  - Tighten “first generate” bridge resolution so host `mes_text` is preferred before iframe targets.
- `src/寒冬末日/界面同层版/界面/状态栏/imageStore.ts`
  - Mark as deprecated or remove from runtime imports.
- `src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts`
  - Mark as deprecated or remove from runtime imports.
- `src/寒冬末日/界面同层版/界面/状态栏/components/GeneratedImageAsset.vue`
  - Only if needed to consume new resolver metadata without assuming `idb://`.

### Existing tests to keep running as smoke coverage

- `src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageDom.test.ts`
- `src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageInteraction.test.ts`
- `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js`
- `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptDoubleClick.test.js`

---

## Chunk 1: Lock in the native source priority with tests

### Task 1: Add failing parser tests for mes-native image tags

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeMesTag.test.js`
- Create: `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeMesTag.ts`

- [ ] **Step 1: Write the failing parser test**

Test cases must assert all of the following:

- `image###...###` tokens are extracted in message order.
- Each parsed entry includes:
  - `messageId`
  - `order`
  - `promptToken`
  - `rawTag`
  - `anchorText`
- Anchor text is derived from nearby正文 rather than from `chatMetadata`.

Suggested assertions:

```js
assert.equal(entries.length, 2);
assert.equal(entries[0].messageId, 4);
assert.equal(entries[0].order, 0);
assert.match(entries[0].promptToken, /^image###/);
assert.ok(entries[0].anchorText.includes('她这种目中无人的性格'));
```

- [ ] **Step 2: Run the parser test to verify it fails**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeMesTag.test.js"
```

Expected: FAIL because `pluginNativeMesTag.ts` or exported functions do not exist yet.

- [ ] **Step 3: Implement the minimal mes-tag parser**

Implement exports with focused responsibilities only:

- `parseNativeMesImageTags({ messageId, rawMessage })`
- `extractNativeMesAnchorText(...)`
- `mergeNativeMesTagsWithExtraEntries(...)`

Do not add DOM queries, message writes, or Stego reads here.

- [ ] **Step 4: Run the parser test again**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeMesTag.test.js"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/寒冬末日/界面同层版/界面/状态栏/pluginNativeMesTag.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeMesTag.test.js"
git commit -m "test: add native mes image tag parser coverage"
```

### Task 2: Add failing priority tests for Native-first artifact aggregation

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageArtifacts.ts`
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`

- [ ] **Step 1: Write the failing aggregation test**

Cover these priority expectations:

1. `extra.images` beats cache fallback
2. mes-tag parser beats cache fallback when `extra.images` is absent
3. `chatMetadata['st-chatu8']` is only used as last fallback
4. legacy `stream_demo.generated_images` is not selected when native data exists

Suggested assertion shape:

```js
assert.deepEqual(result.map(item => item.source), ['extra']);
assert.equal(result[0].promptToken, 'image###foo###');
```

- [ ] **Step 2: Run the aggregation test to verify it fails**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: FAIL because the aggregator does not exist yet.

- [ ] **Step 3: Implement the minimal Native-first artifact reader**

Implement a pure reader that accepts already-read message data and optional host/cache data, then returns one deduped list in this order:

1. host DOM artifacts
2. `extra.images`
3. mes-tag parser results
4. cache fallback
5. legacy `stream_demo.generated_images`

- [ ] **Step 4: Run the aggregation test again**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageArtifacts.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
git commit -m "feat: add native-first image artifact reader"
```

---

## Chunk 2: Refactor runtime reads to Native-first

### Task 3: Switch `generatedImageSourceResolver.ts` to Native-first priority

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`

- [ ] **Step 1: Write or extend a failing resolver test**

Add coverage that verifies:

- `extra.images` is returned before cache
- mes-tag derived entries are returned before cache
- cache fallback still works if native sources are empty
- `idb://` is no longer required for a successful native read

- [ ] **Step 2: Run the resolver-related test to verify it fails**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: FAIL because current resolver still prefers legacy paths.

- [ ] **Step 3: Rework resolver source order**

Update `generatedImageSourceResolver.ts` so the main path is:

1. `extra.images`
2. mes-tag artifacts
3. cache fallback
4. legacy stream-demo entries

Stop treating `chatMetadata` as a peer of native sources.

- [ ] **Step 4: Run the resolver-related test again**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: PASS.

- [ ] **Step 5: Run one existing smoke test**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
git commit -m "refactor: prioritize native image sources in resolver"
```

### Task 4: Route transcript and gallery reads through the Native-first artifact reader

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageArtifacts.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`

- [ ] **Step 1: Write a failing test for `useStreamingDemo.ts` helper-level priority**

Do not try to integration-test the whole composable first. Extract or target the helper that decides which image artifacts feed transcript/gallery, then assert:

- `readChatu8CacheEntries()` is no longer the first fallback
- `readChatu8ExtraImages()` and mes-tag parser results appear before cache
- legacy `stream_demo.generated_images` is only used if native sources are absent

- [ ] **Step 2: Run the focused helper test to verify it fails**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: FAIL until `useStreamingDemo.ts` stops using cache-first fallbacks.

- [ ] **Step 3: Refactor `useStreamingDemo.ts` to use the new reader**

Replace direct uses of:

- `readChatu8CacheEntries()`
- `readPersistedGeneratedImages()`
- cache-token-only fallbacks

with one Native-first artifact read path for:

- `appendChatu8ArtifactsToHtml()`
- prompt-token fallback for displayed messages
- rendered image extraction for gallery/transcript

- [ ] **Step 4: Run the focused helper test again**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: PASS.

- [ ] **Step 5: Run an adjacent smoke test**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageDom.test.ts"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts" "src/寒冬末日/界面同层版/界面/状态栏/pluginNativeImageArtifacts.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
git commit -m "refactor: use native-first image artifacts in same-layer reader"
```

---

## Chunk 3: Fix first-generation targeting and stop UI-owned writes

### Task 5: Prefer host `mes_text` before iframe bodies for first-generation targeting

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/hostCoordinateTarget.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageTriggerTarget.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageInteraction.test.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptDoubleClick.test.js`

- [ ] **Step 1: Add a failing regression test for host-first targeting**

Assert that when both exist:

- `hostMessageRoot` / host `mes_text`
- iframe `.assistant-body`

the first-generation trigger resolves to the host side first.

- [ ] **Step 2: Run the focused regression test to verify it fails**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageInteraction.test.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptDoubleClick.test.js"
```

Expected: FAIL because iframe targets are still too easy to hit first.

- [ ] **Step 3: Implement the smallest host-first targeting change**

Make the bridge resolve:

1. host `.mes[mesid]`
2. host `.mes_text`
3. only then iframe `.assistant-body` / `.html-body`

Do not expand into a global response bridge.

- [ ] **Step 4: Re-run the focused regression tests**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageInteraction.test.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptDoubleClick.test.js"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue" "src/寒冬末日/界面同层版/界面/状态栏/hostCoordinateTarget.ts" "src/寒冬末日/界面同层版/界面/状态栏/generatedImageTriggerTarget.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageInteraction.test.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptDoubleClick.test.js"
git commit -m "fix: prefer host mes_text for first image generation"
```

### Task 6: Disable UI-owned image persistence writes and retire IndexedDB runtime usage

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/imageStore.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`

- [ ] **Step 1: Write a failing regression test that ensures UI no longer writes legacy image persistence**

Assert that the active runtime path does not call or rely on:

- `persistGeneratedImageResponse()`
- `storeImage()`
- `buildGeneratedImagePersistencePatch()`

Suggested approach: test a helper flag / exported branch chooser / observable log path rather than trying to mock the whole composable.

- [ ] **Step 2: Run the regression test to verify it fails**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: FAIL because the old persistence code is still reachable.

- [ ] **Step 3: Remove old persistence from the active runtime path**

Concretely:

- stop mounting `bindImagePersistenceEvents()` as an active persistence bridge
- stop invoking `persistGeneratedImageResponse()` in normal image flow
- stop using `imageStore.ts` in runtime reads/writes
- stop building `idb://` references
- keep legacy modules only as deprecated compatibility code if immediate deletion is risky

- [ ] **Step 4: Re-run the regression test**

Run:

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: PASS.

- [ ] **Step 5: Run a build smoke check**

Run:

```bash
pnpm build:dev
```

Expected: successful webpack development build with no new TypeScript errors introduced by the refactor.

- [ ] **Step 6: Commit**

```bash
git add "src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts" "src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts" "src/寒冬末日/界面同层版/界面/状态栏/imageStore.ts" "src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts"
git commit -m "refactor: retire ui-owned image persistence runtime"
```

---

## Chunk 4: Final verification and cleanup

### Task 7: Verify Native-first behavior with focused regression and smoke tests

**Files:**
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeMesTag.test.js`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageInteraction.test.ts`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js`
- Test: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptDoubleClick.test.js`

- [ ] **Step 1: Run the new parser test**

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeMesTag.test.js"
```

Expected: PASS.

- [ ] **Step 2: Run the new Native-first aggregation test**

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"
```

Expected: PASS.

- [ ] **Step 3: Run the bridge interaction smoke tests**

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/generatedImageInteraction.test.ts" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageDom.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptDoubleClick.test.js"
```

Expected: PASS.

- [ ] **Step 4: Run a final dev build**

```bash
pnpm build:dev
```

Expected: PASS.

- [ ] **Step 5: Commit the verification-ready refactor**

```bash
git add docs/superpowers/specs/2026-03-20-samelayer-native-first-image-design.md docs/superpowers/plans/2026-03-20-samelayer-native-first-image-plan.md
git commit -m "docs: add native-first image convergence spec and plan"
```

---

## Follow-up issue log: opening/workbench persistent-UI mode still collapses first-generation context to `EDEN-STAR`

### Symptom snapshot

In a fresh chat where the same-layer UI stays mounted continuously inside the workbench container (`messageId = 0`):

- The transcript inside UI shows real story turns such as `2#` and `4#`.
- The user triggers first-generation from those UI-rendered turns.
- The plugin-side debug log still records the actual clicked host element as:
  - `mes_text`
  - `mesId = 0`
  - text content = the loader HTML for the iframe shell
- After regex processing, plugin-side prompt text collapses to `EDEN-STAR`.
- The image LLM therefore receives only `EDEN-STAR`, not the real story body.

### What this means

This issue strongly suggests the bug is **not** “chat data was never generated”, but rather:

1. real chat messages **do** exist in host data (`chatLength` increases in logs),
2. yet the plugin still anchors its context to the host-visible `mes_text` DOM,
3. and under persistent-UI mode, the host-visible / in-viewport DOM still biases toward the container `0#` loader node.

### Important inference for future fixes

The plugin likely does **not** operate from chat data alone. It appears to require some combination of:

- real host `mes_text` DOM,
- visibility / viewport eligibility,
- point-based or event-target-based resolution,
- and then `getElContext(...)` / regex processing on that resolved host element.

Therefore, future fixes must keep testing the assumption:

> “Can plugin-native first-generation work if the real host chat is not visible as `mes_text` in the host DOM?”

Current evidence suggests the answer is **probably no**.

### Follow-up design questions (not yet solved)

1. Can the UI layer surface or mirror the host chat in a way that still counts as real plugin-consumable `mes_text`, rather than only rendering an internal transcript copy?
2. Does `st-chatu8` require the real host `mes_text` to remain visible / in viewport for `processMesTextElements()` / `findAndReplaceInElement()` / `getElContext()` to behave correctly?
3. Is the right long-term solution:
   - temporarily revealing host transcript DOM during first-generation bridging,
   - or teaching the bridge to route directly to the host message node and keep plugin scanning logic satisfied,
   - or both?

### Next recommended investigation

Before further architectural changes, run targeted experiments that isolate each factor:

1. **Host transcript visible vs hidden**
   - Trigger first-generation once with host transcript forced visible.
   - Trigger once with host transcript hidden.
   - Compare whether plugin still anchors to `mesId = 0`.

2. **Direct host target without point coordinates**
   - Verify whether plugin still re-anchors to `0#` if synthetic dblclick is dispatched directly to the correct host `mes_text`.

3. **Rendered host DOM existence**
   - Confirm whether `div.mes[mesid='2'] .mes_text` / `div.mes[mesid='4'] .mes_text` actually exist in the host DOM at trigger time when UI is continuously mounted.

Until these experiments are resolved, treat persistent workbench-UI mode as an open risk for first-generation correctness.

# SameLayer Plugin-Native Image Chain Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the same-layer image feature so `st-chatu8` plugin-native `extra.images + token + restored DOM` becomes the only business source of truth for正文图片, 图库, and image interaction.

**Architecture:** The same-layer UI will stop treating `data.stream_demo.generated_images` as the primary image chain and instead act as a bridge into plugin-native request, storage, restore, and interaction paths. The implementation is split into three layers: plugin-native storage writeback, plugin-native restore/read priority, and plugin-native interaction routing. Legacy malformed `extra.images` data will be sanitized on chat load before plugin restore scans run.

**Tech Stack:** Vue 3, TypeScript, Tavern Helper APIs (`eventOn`, `setChatMessages`, `getChatMessages`), existing `st-chatu8` plugin event/storage conventions, lightweight Node script tests, ESLint.

---

## File Map

### Primary files to modify

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
  - Make plugin-native `extra.images + lockedTags + raw token` the primary persisted chain.
  - Sanitize legacy plugin image data on mount.
  - Remove business dependence on `data.stream_demo.generated_images`, leaving it only as compatibility output.

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts`
  - Centralize plugin-native image entry shaping and sanitation.
  - Ensure every stored entry has safe `regex/tag/requestId/request_id/src/image/imageData`.

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/promptTokenPersistence.ts`
  - Keep raw message token writeback aligned with plugin-native restore expectations.
  - Ensure token insertion is deterministic and idempotent.

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
  - Route image interaction only through plugin-native host DOM targets.
  - Remove dependence on same-layer fallback image nodes for business interaction success.

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/ImageGalleryPanel.vue`
  - Prefer plugin-native image identifiers and host targets when jumping or interacting.

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue`
  - Reduce same-layer custom image rendering to a compatibility display path only.
  - Ensure custom image nodes do not masquerade as the primary interactive chain.

### Supporting files to keep or adjust

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageActivation.ts`
  - Keep a single parser for image activation payload extraction.

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/imagePendingTaskManager.ts`
  - Keep request/response batch matching only as a bridge into plugin-native writeback.

- Keep for reference only:
  - `st-chatu8/utils/imageInserter.js`
  - `st-chatu8/utils/iframe/placeholder.js`
  - `st-chatu8/utils/database.js`
  - `st-chatu8/utils/settings/ClickTrigger.js`

### Tests to modify or add

- Modify: `scripts/test-image-persistence-patch.js`
- Modify: `scripts/test-prompt-token-persistence.js`
- Modify: `scripts/test-generated-image-activation.js`
- Add: `scripts/test-plugin-native-image-chain-priority.js`
- Add: `scripts/test-plugin-native-image-extra-sanitize.js`

---

## Chunk 1: Storage Truth Reversal

### Task 1: Lock plugin-native image entry shape

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts`
- Test: `scripts/test-image-persistence-patch.js`
- Test: `scripts/test-plugin-native-image-extra-sanitize.js`

- [ ] **Step 1: Extend the failing test for plugin-native entry completeness**

Add assertions proving a persisted plugin-native image entry always contains:

```js
{
  requestId: 'req-1',
  request_id: 'req-1',
  prompt: '角色B',
  tag: '角色B',
  regex: '声音的目标，似乎是2002室的房门。',
  src: 'data:image/png;base64,aaa',
  image: 'data:image/png;base64,aaa',
  imageData: 'data:image/png;base64,aaa',
  alt: 'generated image',
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-image-persistence-patch.js`
Expected: FAIL because current shape or sanitize path is incomplete.

- [ ] **Step 3: Implement a single plugin-native entry normalizer**

In `imagePersistencePatch.ts`, keep one normalizer that:

- shapes fresh response payloads
- sanitizes legacy `extra.images`
- produces safe string defaults for `regex`, `tag`, `prompt`

Do not introduce a second image entity model.

- [ ] **Step 4: Add legacy sanitize test**

Create `scripts/test-plugin-native-image-extra-sanitize.js` with a malformed `extra.images` fixture missing:

- `regex`
- `tag`
- `request_id`

Expected sanitized result:

- all missing fields are backfilled
- no field remains `undefined`

- [ ] **Step 5: Run the focused tests**

Run:

```bash
node scripts/test-image-persistence-patch.js
node scripts/test-plugin-native-image-extra-sanitize.js
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts scripts/test-image-persistence-patch.js scripts/test-plugin-native-image-extra-sanitize.js
git commit -m "refactor: normalize plugin-native image entry storage"
```

### Task 2: Sanitize current chat before plugin restore runs

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Test: `scripts/test-plugin-native-image-extra-sanitize.js`

- [ ] **Step 1: Write or extend a failing sanitize-on-mount test**

Add a test fixture representing a chat with malformed `extra.images`, then verify a sanitation function produces a `setChatMessages` patch only for dirty messages.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-plugin-native-image-extra-sanitize.js`
Expected: FAIL if sanitation-on-load behavior is not yet represented.

- [ ] **Step 3: Implement pre-restore sanitation in `useStreamingDemo.ts`**

Add one function:

- scans current chat messages
- runs `sanitizePluginImageExtra`
- patches only changed messages

Call it inside `onMounted()` before image prompt observer work begins.

- [ ] **Step 4: Verify the test passes**

Run: `node scripts/test-plugin-native-image-extra-sanitize.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts scripts/test-plugin-native-image-extra-sanitize.js
git commit -m "fix: sanitize plugin-native image extras before restore"
```

## Chunk 2: Restore Chain Rebuild

### Task 3: Make raw message token writeback plugin-native first

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/promptTokenPersistence.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Test: `scripts/test-prompt-token-persistence.js`

- [ ] **Step 1: Extend the token test to cover plugin-native placement rules**

Add cases for:

- anchor-based insertion after matching text line
- fallback insertion at end of `<content>`
- no duplicate token writes
- prompt body remains compatible with plugin-native `tag`

- [ ] **Step 2: Run the token test to verify failure**

Run: `node scripts/test-prompt-token-persistence.js`
Expected: FAIL if any new placement rule is missing.

- [ ] **Step 3: Implement token merge without same-layer image business semantics**

Keep `mergePromptTokensIntoRawMessage()` focused on raw text only:

- no gallery concerns
- no UI DOM concerns
- only token idempotency and placement

- [ ] **Step 4: Update `useStreamingDemo.ts` to treat token writeback as the message truth**

During `persistDisplayedImagePrompts()`:

- derive prompt tokens from rendered images
- write tokenized raw message
- sync plugin-native `extra.images`

Do not decide正文成功与否 from `data.stream_demo.generated_images`.

- [ ] **Step 5: Run the token test**

Run: `node scripts/test-prompt-token-persistence.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/promptTokenPersistence.ts src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts scripts/test-prompt-token-persistence.js
git commit -m "refactor: make raw token writeback plugin-native first"
```

### Task 4: Reverse正文显示优先级 to plugin-native DOM

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue`
- Test: `scripts/test-plugin-native-image-chain-priority.js`

- [ ] **Step 1: Write a failing priority test**

Create `scripts/test-plugin-native-image-chain-priority.js` that models:

- plugin-native DOM available
- same-layer compatibility image data also available

Expected result:

- same-layer rendering path chooses plugin-native DOM-backed image chain first
- fallback path is only used when plugin-native DOM is absent

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/test-plugin-native-image-chain-priority.js`
Expected: FAIL because current logic still treats same-layer extracted data as primary.

- [ ] **Step 3: Refactor `useStreamingDemo.ts` restore/read helpers**

Change priority:

1. plugin-native restored DOM (`.st-chatu8-image-span`, `.st-chatu8-image-button`)
2. plugin-native message fields (`extra.images`, token)
3. compatibility fallback (`data.stream_demo.generated_images`)

- [ ] **Step 4: Reduce custom image nodes in `TranscriptMessageCard.vue`**

Keep compatibility rendering minimal:

- avoid presenting fallback nodes as if they are the primary interactive chain
- keep visible fallback only when plugin-native restoration is absent

- [ ] **Step 5: Run the priority test**

Run: `node scripts/test-plugin-native-image-chain-priority.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue scripts/test-plugin-native-image-chain-priority.js
git commit -m "refactor: prioritize plugin-native image restore chain"
```

## Chunk 3: Interaction Chain Rebuild

### Task 5: Make image interaction resolve only through plugin-native nodes

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageActivation.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/ImageGalleryPanel.vue`
- Test: `scripts/test-generated-image-activation.js`

- [ ] **Step 1: Extend activation parsing test**

Add cases proving activation payload extraction works for:

- prompt-token based image
- request-id based image
- src-only fallback image

- [ ] **Step 2: Run the test to verify failure**

Run: `node scripts/test-generated-image-activation.js`
Expected: FAIL if the resolver cannot support all intended bridge sources.

- [ ] **Step 3: Refactor `StoryPage.vue` image interaction handlers**

Ensure:

- mobile touch uses `pointerdown/pointerup`
- desktop uses `click/dblclick`
- all paths resolve a plugin-native host node first
- if plugin-native host node is absent, the interaction is treated as unresolved, not silently “successful”

- [ ] **Step 4: Update `ImageGalleryPanel.vue` jump/interaction hooks**

When a gallery item is used:

- prefer `requestId`
- then `promptToken`
- then normalized `src`

All should resolve into plugin-native host nodes only.

- [ ] **Step 5: Run the activation test**

Run: `node scripts/test-generated-image-activation.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/generatedImageActivation.ts src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue src/寒冬末日/界面同层版/界面/状态栏/components/ImageGalleryPanel.vue scripts/test-generated-image-activation.js
git commit -m "refactor: route image interaction through plugin-native nodes"
```

### Task 6: Verification sweep

**Files:**
- Modify if needed: `docs/superpowers/specs/2026-03-17-samelayer-plugin-native-image-chain-design.md`
- Optional notes: `docs/前端接入插件的说明.txt`

- [ ] **Step 1: Run all focused tests**

Run:

```bash
node scripts/test-image-persistence-patch.js
node scripts/test-plugin-native-image-extra-sanitize.js
node scripts/test-prompt-token-persistence.js
node scripts/test-plugin-native-image-chain-priority.js
node scripts/test-generated-image-activation.js
node scripts/test-image-pending-task-manager.js
node scripts/test-image-request-target-resolver.js
```

Expected: all PASS.

- [ ] **Step 2: Run focused lint**

Run:

```bash
pnpm eslint "src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts" "src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts" "src/寒冬末日/界面同层版/界面/状态栏/promptTokenPersistence.ts" "src/寒冬末日/界面同层版/界面/状态栏/generatedImageActivation.ts" "src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue" "src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue" "src/寒冬末日/界面同层版/界面/状态栏/components/ImageGalleryPanel.vue"
```

Expected: PASS with no errors.

- [ ] **Step 3: Manual browser verification checklist**

Verify on `127.0.0.1:8000`:

- entering the first chat no longer spams `getSavedImageMatches`
- generated images enter chat native chain, not just UI compatibility layer
- images restore into original正文位置, not only at the end
- gallery still shows images
- mobile tap on image reaches plugin-native interaction path

- [ ] **Step 4: Update docs if implementation details changed**

If field names or restore assumptions changed, update:

- `docs/前端接入插件的说明.txt`

- [ ] **Step 5: Final commit**

```bash
git add docs/前端接入插件的说明.txt src/寒冬末日/界面同层版/界面/状态栏 scripts
git commit -m "refactor: rebuild same-layer image flow on plugin-native chain"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-03-17-samelayer-plugin-native-image-chain.md`. Ready to execute? 

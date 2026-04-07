# Same-Layer Streaming Repair Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore visible incremental streaming for both opening and normal story turns in the same-layer UI, so new content appears during generation instead of only after final rebuild.

**Architecture:** Reconnect the visible UI to a real per-token state source instead of relying on final transcript rebuilds. For normal story turns, route the primary send path back onto the existing controlled streaming pipeline. For opening, keep the visible card sourced from `openingPayload` while generation is in progress, and listen on the same incremental event bus as the controlled generation path.

**Tech Stack:** Vue 3, same-layer `useStreamingDemo`, SillyTavern `generate()`, `iframe_events`, local source-based node tests, webpack build

---

### Task 1: Lock The Broken Behaviors With Tests

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js`
- Verify: `node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js"`

- [ ] **Step 1: Add a failing test for the normal send entry path**

Assert that `runDemo()` no longer routes directly into `runNativeSendProxy()` and instead uses the controlled generation path.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```powershell
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js"
```

Expected: failure showing the normal send path still points at `runNativeSendProxy` and opening still does not force payload-backed rendering during generation.

- [ ] **Step 3: Add a failing test for opening streaming source selection**

Assert that when `openingPayload.state === 'generating'`, `rebuildTranscript()` must continue to use `buildOpeningTranscriptItem(...)` even if `opening_result_message_id` is already populated.

- [ ] **Step 4: Add a failing test for opening token listener bus**

Assert that opening streaming binds to the incremental `iframe_events` token bus used by the controlled `generate()` path, rather than relying only on host `tavern_events`.

- [ ] **Step 5: Commit the red test baseline**

```powershell
git add src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js
git commit -m "test: capture same-layer streaming regressions"
```

### Task 2: Restore Normal Story Streaming

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Reference: `src/寒冬末日/界面同层版/界面/状态栏/nativeSendProxy.ts`
- Verify: `node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js"`

- [ ] **Step 1: Change the primary send entry to the controlled streaming pipeline**

Update `runDemo()` so the main same-layer send path uses `runGenerationFlow({ prompt, createUser: true })`.

Rationale: `runGenerationFlow()` already owns `bindGenerationEvents()`, `ensureAssistantPlaceholderReady()`, `patchAssistantMessage('stream')`, and the local `assistantMessageId` / `streamText` flow that the UI cards know how to render.

- [ ] **Step 2: Keep `runNativeSendProxy()` as a non-default fallback**

Do not delete `runNativeSendProxy()` yet. Keep it available for future compatibility work, but remove it from the default same-layer interactive send path.

- [ ] **Step 3: Verify the normal send path now has a local incremental renderer**

Check that the send entry path now guarantees:

```ts
bindGenerationEvents();
await ensureAssistantPlaceholderReady('first_token');
await patchAssistantMessage('stream');
```

- [ ] **Step 4: Run focused tests and confirm green**

Run:

```powershell
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js"
```

Expected: PASS

- [ ] **Step 5: Commit the normal streaming repair**

```powershell
git add src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts
git commit -m "fix: restore same-layer story streaming path"
```

### Task 3: Restore Opening Streaming

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Verify: `node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js"`

- [ ] **Step 1: Force payload-backed opening rendering while generating**

In `rebuildTranscript()`, change the opening branch so that container `0` uses `buildOpeningTranscriptItem(openingPayload.value, ...)` whenever `openingPayload.value.state === 'generating'`.

Target rule:

```ts
const shouldRenderOpeningFromPayload =
  openingPayload.value.state === 'generating' ||
  (openingPayload.value.state !== 'placeholder' && !hasPersistedOpeningResult);
```

- [ ] **Step 2: Keep persisted opening result ids out of the visible source selection until finalization**

Do not let `opening_result_message_id` force the UI onto the host persisted result card during active streaming. The payload-backed opening card should remain the visible source until the final result is committed.

- [ ] **Step 3: Move opening token listeners onto the incremental generation bus**

Refactor `bindOpeningGenerationListeners()` to consume the same incremental `iframe_events` stream bus used by the controlled `generate()` path. Host `tavern_events` can remain as a fallback only if they are proven necessary.

- [ ] **Step 4: Reduce token-time rebuild churn if possible**

Preferred: update the visible opening transcript item directly from `openingPayload` and only rebuild transcript structure when generation starts or ends.

Minimum acceptable: keep token-time `rebuildTranscript()` only after the payload-backed rendering rule is corrected.

- [ ] **Step 5: Run focused tests and confirm green**

Run:

```powershell
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js"
```

Expected: PASS

- [ ] **Step 6: Commit the opening streaming repair**

```powershell
git add src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts
git commit -m "fix: restore opening streaming rendering"
```

### Task 4: Verify End-To-End Behavior

**Files:**
- Verify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Verify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue`
- Verify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptOpeningCard.vue`

- [ ] **Step 1: Run the full same-layer focused test set**

```powershell
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/debugTrace.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/componentTraceInstrumentation.test.js"
```

- [ ] **Step 2: Run the dev build**

```powershell
pnpm build:dev
```

- [ ] **Step 3: Manual acceptance check for normal story turns**

Confirm:

- A user send shows an assistant placeholder immediately
- The latest assistant card stays on `item.streamHtml` during generation
- Tokens visibly accumulate before final completion
- Final completion swaps to `item.finalHtml` without a full transcript rebuild

- [ ] **Step 4: Manual acceptance check for opening**

Confirm:

- Opening card enters `item.isStreaming === true` while generating
- Opening body updates before `generate()` resolves
- `opening_result_message_id` no longer suppresses the payload-backed streaming card
- Final result still persists and survives a later rebuild

- [ ] **Step 5: Commit the verification pass**

```powershell
git add src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptRenderIsolation.test.js
git commit -m "test: verify same-layer streaming restoration"
```

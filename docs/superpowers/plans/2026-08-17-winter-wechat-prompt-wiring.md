# Winter WeChat Prompt Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each winter WeChat send use only the current participants' fixed profiles and exact MVU paths, the latest five main-chat user/assistant messages, the current conversation's latest thirty messages, and the current `playerMessage`.

**Architecture:** Capture and sanitize the five-message main-chat window when publishing a stable winter snapshot. Keep the platform prompt assembler responsible for immutable prompt structure and trimming, while the winter adapter supplies exact per-conversation business data and expands MVU macros from the captured snapshot immediately before provider dispatch.

**Tech Stack:** TypeScript, SillyTavern/酒馆助手 typed APIs, Node `assert`, `ts-node`, Node test runner, webpack.

## Global Constraints

- Do not inject whole `{{format_message_variable::stat_data}}`, `stat_data.通讯网络`, ChatLore, generic role worldbook entries, `[微信-*]`, or `[人物动态]*` into normal WeChat sends.
- Use five total main-chat messages, including both player and AI, not five turns and not five AI-only messages.
- Use at most thirty messages from the current PhoneDB conversation.
- Preserve the existing direct `playerMessage` path for OpenAI-compatible providers.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Main-chat extraction and control-block cleaning

**Files:**
- Modify: `src/小手机平台/platform/storyExtractor.ts`
- Test: `src/小手机平台/__tests__/storyExtractor.test.ts`

**Interfaces:**
- Produces: `extractRecentMainChatMessages(storyMessageId: number | null, limit?: number): PromptMainChatEntry[]`
- Produces entries with `id`, `role`, `sender`, and cleaned `content`, ordered oldest to newest.

- [ ] **Step 1: Write the failing extraction test**

Add a fixture containing more than five user/assistant messages, a hidden message, a system message, and all three control blocks. Assert that the function returns the last five eligible messages, includes the current completed assistant floor, preserves role/sender order, and contains none of `UpdateVariable`, `Analysis`, or `JSONPatch`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm exec ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' src/小手机平台/__tests__/storyExtractor.test.ts
```

Expected: failure because `extractRecentMainChatMessages` is not exported.

- [ ] **Step 3: Implement the minimal extractor**

Add a deterministic control-block cleaner and query `getChatMessages("0-${storyMessageId}", { hide_state: 'unhidden', include_swipes: false })`. Keep only non-empty `user`/`assistant` entries at or before the completed floor, clean them, remove newly empty entries, then `slice(-limit)`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2 and require exit code 0.

### Task 2: Prompt structure and exact member MVU references

**Files:**
- Modify: `src/小手机平台/ai/promptAssembler.ts`
- Modify: `src/小手机平台/__tests__/ai.test.ts`

**Interfaces:**
- `PromptMember` gains `mvuReference: string` and no longer accepts `dynamicProfile`.
- `PromptContextSnapshotInput.recentMainChat` replaces `recentCompletedStory` for normal WeChat generation.
- `assemblePrompt()` renders six sequential sections and never emits a whole-root stat-data macro or broadcast priority.

- [ ] **Step 1: Write failing prompt-structure tests**

Change the fixture to include a fixed profile, `{{format_message_variable::stat_data.爱丽丝}}`, user/assistant main-chat entries, and phone history. Assert six headings in order, exact member reference presence, and absence of whole-root stat-data macro, communications network, broadcast, ChatLore, and dynamic profile language.

- [ ] **Step 2: Write failing budget-order test**

Assert that an oversized prompt removes the oldest main-chat entry before role-lore compatibility entries, and removes the oldest PhoneDB history only after those sources.

- [ ] **Step 3: Run the AI test and verify RED**

Run:

```powershell
pnpm exec ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' src/小手机平台/__tests__/ai.test.ts
```

Expected: failures for the old eight-layer headings, old whole-root macro, and missing `mvuReference` rendering.

- [ ] **Step 4: Implement the six-section renderer**

Render fixed member metadata as single-line read-only JSON and render each exact MVU reference on its own labelled read-only line so macro expansion cannot corrupt JSON quoting. Set fact guidance to current-member MVU, recent main-chat messages, and current WeChat history; remove the unverified-broadcast reference.

- [ ] **Step 5: Implement trimming and immutable snapshot updates**

Freeze `recentMainChat`, trim it oldest-first, retain optional role-lore support only for non-winter callers, then trim PhoneDB history oldest-first. Keep members, exact references, current message, protocol, and output contract protected.

- [ ] **Step 6: Run the AI test and verify GREEN**

Run the command from Step 3 and require `ai tests passed` with exit code 0.

### Task 3: Winter adapter exact business wiring

**Files:**
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/winterAdapterCore.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneSource.test.js`

**Interfaces:**
- Produces: `buildCharacterMvuReference(name: string, temporaryNpc?: boolean): string`.
- `WinterSnapshot` stores `recentMainChat` from Task 1.
- Normal `launchAiRequest()` loads only exact fixed profiles, creates exact member MVU references, slices current conversation history to thirty, and does not read chat-worldbook entries for prompt generation.

- [ ] **Step 1: Write failing MVU-reference unit tests**

Assert main role `纪宁` becomes `{{format_message_variable::stat_data.纪宁}}`, temporary NPC `工程师` becomes `{{format_message_variable::stat_data.临时NPC.工程师}}`, and unsafe path separators/braces are rejected.

- [ ] **Step 2: Write failing adapter source contract test**

Assert normal send calls `extractRecentMainChatMessages(..., 5)`, uses `history.slice(-30)`, supplies `mvuReference`, and does not call `buildRoleLoreEntries`, `selectDynamicProfile`, or read `stat_data.通讯网络` inside the normal prompt path. Assert the source contains the explicit future `[人物动态]` entry-point comment.

- [ ] **Step 3: Run winter tests and verify RED**

Run:

```powershell
pnpm exec ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
node --test src/寒冬末日/__tests__/winterPhoneSource.test.js
```

Expected: failures for missing exact-reference helper and old 3-AI/20-WeChat/worldbook/dynamic-profile wiring.

- [ ] **Step 4: Implement exact winter wiring**

Replace the snapshot's three AI-only entries with the five-message extractor. Build each prompt member from exact fixed profile plus `buildCharacterMvuReference`; use `暂无固定档案` when absent. Remove normal-send chat-worldbook/profile-settings reads and add the future dynamic-profile comment. Pass `recentMainChat` and `history.slice(-30)` to the assembler.

- [ ] **Step 5: Run winter tests and verify GREEN**

Run both commands from Step 3 and require exit code 0.

### Task 4: Regression and build verification

**Files:**
- Verify: `src/小手机平台/ai/jailbreakLayers.ts`
- Verify: `src/小手机平台/ai/providers.ts`
- Verify all files modified in Tasks 1-3.

**Interfaces:**
- OpenAI-compatible requests must receive the concrete current `playerMessage` and no raw `{{lastUserMessage}}`.

- [ ] **Step 1: Run all focused tests**

Run the story extractor, AI, winter adapter, winter source, and role-lore tests. Require every command to exit 0.

- [ ] **Step 2: Run formatting and static checks**

Run Prettier check on the touched TypeScript files, `git diff --check`, and a targeted TypeScript compile when available. Record any repository-wide pre-existing TypeScript failures separately from task regressions.

- [ ] **Step 3: Build the affected webpack entries**

Run the repository production build. If it rewrites unrelated `dist` artifacts, do not stage or alter their ownership; report source/build evidence separately from live Tavern deployment.

- [ ] **Step 4: Review the final diff**

Confirm the diff contains no whole-root stat-data macro in the normal assembled prompt, no 20-message history slice, no three-assistant snapshot logic, and no normal-send dynamic-profile/worldbook injection.

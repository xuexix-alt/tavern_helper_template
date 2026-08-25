# Runtime Character Opening Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let same-layer-pre read a validated opening preset from current-character variables at runtime and create the generated opening directly as visible assistant `mes=1`, with a Tianyu preset replacing its fixed prologue bootstrap.

**Architecture:** Add a focused v2 runtime-preset schema/compiler beside the existing legacy opening module. PRE selects the runtime engine only when `same_layer_pre.opening_preset` exists and validates; legacy winter/generic flows remain intact. Tianyu authors its preset in YAML and its existing role script installs that data into character variables without creating chat messages.

**Tech Stack:** TypeScript, Vue 3, Zod 4, YAML, Tavern Helper character/chat variables, webpack, Node test runner.

## Global Constraints

- `mes=0` remains the PRE regex carrier and is never overwritten by opening.
- Runtime preset is read from `getVariables({ type: 'character' })` path `same_layer_pre.opening_preset`.
- Opening generation does not persist a user seed message; the first generated assistant story is `mes=1`.
- Invalid configured presets surface an error and do not silently fall back to winter.
- Cards without runtime preset retain the existing winter and generic-story behavior.
- Do not stage unrelated user changes or broad generated output.

---

### Task 1: Runtime preset schema and prompt compiler

**Files:**
- Create: `src/寒冬末日/界面同层版/shared/runtimeOpeningPreset.schema.ts`
- Create: `src/寒冬末日/界面同层版/shared/runtimeOpeningPreset.ts`
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/runtimeOpeningPreset.test.ts`

**Interfaces:**
- Produces: `RuntimeOpeningPresetSchema`, `RuntimeOpeningPreset`, `readRuntimeOpeningPresetFromCharacterVariables`, `toLegacyOpeningPreset`, `getRuntimeOpeningDefaultPayload`, `buildRuntimeOpeningGeneratePrompt`.
- Consumes: character-variable records and existing `OpeningPayload`/`OpeningPreset` types.

- [ ] Write tests proving a valid v2 preset parses, defaults populate, every field is serialized by label, directives/forbidden/output contract are included, and an invalid configured preset returns a path-rich error.
- [ ] Run the test and confirm RED because the runtime preset modules do not exist.
- [ ] Implement the minimal strict Zod schema, safe reader, legacy-view adapter, default payload builder, and deterministic structured prompt compiler.
- [ ] Run the focused test and confirm GREEN.
- [ ] Commit the schema/compiler slice.

### Task 2: PRE runtime form selection

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/OpeningSetupPanel.vue`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
- Modify: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`

**Interfaces:**
- Consumes: runtime preset reader/adapters from Task 1.
- Produces: runtime-configured form branch with preset title, intro, submit label, metadata labels, and fields.

- [ ] Add failing source-contract assertions for character-variable loading, explicit invalid-preset state, runtime component props, and absence of winter world/route validation in the runtime branch.
- [ ] Run the focused source test and confirm RED.
- [ ] Load runtime preset before initializing payload; pass it to the panel; render runtime fields without the winter/generic story selector; preserve legacy rendering when absent.
- [ ] Run the focused source and runtime-preset tests and confirm GREEN.
- [ ] Commit the runtime-form slice.

### Task 3: Assistant-only opening generation and regeneration

**Files:**
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
- Modify: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`

**Interfaces:**
- Produces: `submitAssistantOnlyPrompt(prompt): Promise<number | null>` from `useSameLayerPre`.
- Consumes: runtime prompt compiler and chat payload snapshot.

- [ ] Add failing assertions that runtime opening calls the assistant-only method, that method never creates a user message, and it returns the created assistant ID.
- [ ] Run the source test and confirm RED.
- [ ] Implement generation without user persistence, create one visible assistant message, return its ID, restore configuring state on failure, and reuse the snapshot for opening regeneration.
- [ ] Run focused tests and confirm GREEN.
- [ ] Commit the message-floor slice.

### Task 4: Tianyu preset and bootstrap replacement

**Files:**
- Create: `src/天欲太和录/opening-preset.yaml`
- Replace: `src/天欲太和录/脚本/变量结构/openingBootstrap.ts`
- Modify: `src/天欲太和录/脚本/变量结构/index.ts`
- Modify: `src/天欲太和录/__tests__/openingBootstrap.test.ts`

**Interfaces:**
- Produces: Tianyu v2 preset and `installTianyuOpeningPreset` character-variable installer.
- Consumes: `getVariables`/`replaceVariables` with `{ type: 'character' }`.

- [ ] Rewrite the test first to require preset installation, idempotence, no `createChatMessages`, and Tianyu field/directive coverage; run it and confirm RED.
- [ ] Add the approved Tianyu fields and structured prompt directives in YAML.
- [ ] Replace the fixed-story bootstrap with a validated character-variable installer and wire it at script startup.
- [ ] Run Tianyu and runtime-preset tests and confirm GREEN.
- [ ] Commit the Tianyu slice.

### Task 5: Build, live sync, runtime proof, and delivery

**Files:**
- Generated for verification only unless release workflow requires them: `dist/寒冬末日/same-layer-pre/界面/状态栏/index.html`, `dist/天欲太和录/脚本/变量结构/index.js`

**Interfaces:**
- Produces: tested source commits, updated live role-card variables/script, and pushed branch.

- [ ] Run Prettier check on scoped files, all focused opening tests, Tianyu schema validation, and targeted production builds.
- [ ] Inspect `git diff --check`, scoped diff, and worktree status; stage only task files.
- [ ] Push source commits, wait for any repository bundle automation, and confirm remote branch state.
- [ ] Update the live Tianyu role-card script/character preset using the existing Tavern session without touching `mes=0`.
- [ ] Create a fresh Tianyu chat, verify runtime form labels, submit once, and prove `mes0=PRE carrier`, `mes1=visible assistant dynamic story`, with no opening user floor.
- [ ] Fast-forward `20260211` only if the original dirty worktree can preserve its unrelated changes; push and report exact commit and live evidence.

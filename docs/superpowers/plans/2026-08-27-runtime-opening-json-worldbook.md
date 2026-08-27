# PRE Runtime Opening JSON and Chat Worldbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned JSON import/export and explicit per-chat worldbook synchronization to same-layer-pre runtime
opening forms.

**Architecture:** Keep the character variable preset as the default for new chats, persist a runtime preset snapshot per
chat, and turn the filled opening configuration into one idempotent constant entry in the current chat worldbook. Pure
transfer and worldbook modules own validation and content construction; `StoryPagePre.vue` orchestrates Tavern Helper
side effects.

**Tech Stack:** TypeScript, Vue 3, Zod 4, Tavern Helper worldbook/variable APIs, Node test runner, webpack.

## Global Constraints

- The worldbook entry name is `[同层PRE]自定义开局上下文`.
- The entry is constant, `before_character_definition`, order `90`, probability `100`, with incoming and outgoing
  recursion disabled.
- Persist a character default at `same_layer_pre.opening_preset` and a chat snapshot at
  `stream_demo.runtime_opening_preset_snapshot`.
- Import/export includes the v2 preset plus `meta/form_values`, but excludes generation state, stream mode, prompt
  snapshot, and message IDs.
- Legacy winter/generic forms are normalized to a portable v2 preset before export; empty answer keys remain in the
  JSON.
- Worldbook content excludes output tags and includes task, meta, filled fields, directives, and forbidden rules.
- No edits under `src/小手机平台` or `src/寒冬末日/脚本/小手机-90寒冬适配器`.
- Do not touch the nested `st-chatu8` repository.

---

### Task 1: Pure JSON transfer and chat snapshot helpers

**Files:**

- Create: `src/寒冬末日/界面同层版/shared/runtimeOpeningPresetTransfer.ts`
- Modify: `src/寒冬末日/界面同层版/shared/runtimeOpeningPreset.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/runtimeOpeningPreset.test.ts`

**Interfaces:**

- Consumes: `RuntimeOpeningPresetSchema`, `OpeningPayload`, `getRuntimeOpeningDefaultPayload`.
- Produces: `parseRuntimeOpeningImport`, `buildRuntimeOpeningExport`, `buildRuntimeOpeningLoreContent`,
  `toPortableRuntimeOpeningPreset`, `readRuntimeOpeningPresetFromChatVariables`, `withRuntimeOpeningPresetAtPath`.

- [ ] **Step 1: Write the failing transfer tests.**

Add assertions for a full `same-layer-pre-opening` v1 bundle, a bare v2 preset, legacy generic-form normalization,
default-answer merging, invalid select answers, `&<>` escaping, empty answer preservation, edited field labels surviving
round-trip import, and exclusion of transient generation state.

```ts
const imported = parseRuntimeOpeningImport({
  format: 'same-layer-pre-opening',
  version: 1,
  preset: rawPreset,
  answers: { meta: { character: '林秋' }, form_values: { path: '天欲之道' } },
});
assert.equal(imported.payload.meta.character, '林秋');
assert.equal(imported.payload.meta.location, rawPreset.default_meta.location);
assert.equal(imported.payload.form_values.path, '天欲之道');
assert.throws(() => parseRuntimeOpeningImport(invalidSelectBundle), /阴阳道路/);
assert.match(buildRuntimeOpeningLoreContent(imported.preset, imported.payload), /&lt;危险&gt; &amp;/);
```

- [ ] **Step 2: Run the test and verify RED.**

```powershell
$env:TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","types":["node"]}'
& '.\node_modules\.bin\ts-node.cmd' --transpile-only 'src/寒冬末日/界面同层版/界面/状态栏/__tests__/runtimeOpeningPreset.test.ts'
Remove-Item Env:TS_NODE_COMPILER_OPTIONS
```

Expected: FAIL because the transfer exports do not exist.

- [ ] **Step 3: Implement the minimal transfer and snapshot helpers.**

Define a strict Zod envelope, parse envelope-or-bare-preset, construct a fresh runtime payload from defaults, copy only
known field keys, reject invalid select values, export a serializable envelope, and build escaped structured lore
content without the `output` section.

```ts
export type RuntimeOpeningImportResult = {
  preset: RuntimeOpeningPreset;
  payload: OpeningPayload;
  source: 'bundle' | 'bare-preset';
};

export function parseRuntimeOpeningImport(raw: unknown): RuntimeOpeningImportResult;
export function buildRuntimeOpeningExport(
  preset: RuntimeOpeningPreset,
  payload: OpeningPayload,
): RuntimeOpeningExportBundle;
export function buildRuntimeOpeningLoreContent(preset: RuntimeOpeningPreset, payload: OpeningPayload): string;
```

Add pure variable helpers that clone the supplied record before `_.set`:

```ts
export const RUNTIME_OPENING_CHAT_SNAPSHOT_PATH = 'stream_demo.runtime_opening_preset_snapshot';
export function readRuntimeOpeningPresetFromChatVariables(
  variables: Record<string, unknown> | null | undefined,
): RuntimeOpeningPresetReadResult;
export function withRuntimeOpeningPresetAtPath(
  variables: Record<string, unknown> | null | undefined,
  path: string,
  preset: RuntimeOpeningPreset,
): Record<string, unknown>;
```

- [ ] **Step 4: Run the focused test and verify GREEN.**

Expected: exit `0` and `runtime opening preset test passed`.

### Task 2: Idempotent current-chat worldbook synchronization

**Files:**

- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/runtimeOpeningWorldbookSync.ts`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/runtimeOpeningWorldbookSync.test.ts`

**Interfaces:**

- Consumes: `buildRuntimeOpeningLoreContent`, runtime preset, opening payload.
- Produces: `RUNTIME_OPENING_WORLDBOOK_ENTRY_NAME`, `buildRuntimeOpeningWorldbookEntry`, `syncRuntimeOpeningWorldbook`.

- [ ] **Step 1: Write failing behavior tests with an in-memory dependency.**

Test missing-entry creation, existing-entry update, duplicate collapse, unrelated-entry preservation, the exact entry
contract, and chat-switch rejection.

```ts
const entry = buildRuntimeOpeningWorldbookEntry(rawPreset, payload);
assert.equal(entry.name, '[同层PRE]自定义开局上下文');
assert.equal(entry.strategy.type, 'constant');
assert.equal(entry.position.type, 'before_character_definition');
assert.equal(entry.position.order, 90);
assert.equal(entry.probability, 100);
```

- [ ] **Step 2: Run the test and verify RED.**

```powershell
$env:TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","types":["node"]}'
& '.\node_modules\.bin\ts-node.cmd' --transpile-only 'src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/runtimeOpeningWorldbookSync.test.ts'
Remove-Item Env:TS_NODE_COMPILER_OPTIONS
```

Expected: FAIL because the sync module does not exist.

- [ ] **Step 3: Implement the minimal entry and sync function.**

Use injected dependencies matching Tavern Helper globals:

```ts
export interface RuntimeOpeningWorldbookDeps {
  getCurrentChatId(): string | null;
  getOrCreateChatWorldbook(chat: 'current'): Promise<string>;
  getWorldbook(name: string): Promise<WorldbookEntry[]>;
  updateWorldbookWith(name: string, updater: WorldbookUpdater, options: { render: 'debounced' }): Promise<unknown>;
  createWorldbookEntries(
    name: string,
    entries: PartialDeep<WorldbookEntry>[],
    options: { render: 'debounced' },
  ): Promise<unknown>;
}

export async function syncRuntimeOpeningWorldbook(
  input: { expectedChatId: string; preset: RuntimeOpeningPreset; payload: OpeningPayload },
  deps: RuntimeOpeningWorldbookDeps,
): Promise<{ worldbookName: string }>;
```

Compare chat ID before resolving the worldbook and immediately before mutation. Update the first fixed-name entry and
remove later duplicates, or create one when absent. Preserve every unrelated entry.

- [ ] **Step 4: Run the focused test and verify GREEN.**

Expected: exit `0`, zero failed tests.

### Task 3: Add controls and PRE orchestration

**Files:**

- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/OpeningSetupPanel.vue`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
- Modify: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`

**Interfaces:**

- Consumes: Tasks 1-2 helpers.
- Produces: `import-json`, `export-json`, `sync-worldbook` UI events and ordered parent handlers.

- [ ] **Step 1: Write failing source-contract assertions.**

Assert the JSON file input and three buttons exist; the panel emits the three events; StoryPage wires them, prefers a
chat snapshot, writes both variable layers on import, and awaits sync before assistant submission.

```js
assert.match(panelSource, /accept="application\/json,\.json"/);
assert.match(panelSource, />导入 JSON</);
assert.match(panelSource, />导出 JSON</);
assert.match(panelSource, />同步世界书</);
const submitBlock = extractFunction(storySource, 'async function handleOpeningSubmit()');
assert.ok(submitBlock.indexOf('await syncCurrentOpeningWorldbook') < submitBlock.indexOf('submitAssistantOnlyPrompt'));
```

- [ ] **Step 2: Run the source test and verify RED.**

```powershell
node --test "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
```

Expected: new import/export/sync assertions fail.

- [ ] **Step 3: Implement presentation controls.**

Add a hidden file input with `accept="application/json,.json"`, compact secondary buttons, `transferBusy?: boolean`, and
these events:

```ts
(event: 'import-json', file: File): void;
(event: 'export-json'): void;
(event: 'sync-worldbook'): void;
```

Reset the file input after selection. Disable transfer controls while generating or transferring. Export remains enabled
for legacy winter/generic forms; sync remains disabled until a runtime preset is active.

- [ ] **Step 4: Implement StoryPage orchestration.**

Resolve a valid chat snapshot before the character default. Persist a character preset into the chat snapshot when no
snapshot exists. Add:

```ts
async function handleRuntimeOpeningImport(file: File): Promise<void>;
function handleRuntimeOpeningExport(): void;
async function syncCurrentOpeningWorldbook(): Promise<void>;
```

Import reads and parses the file, confirms overwrite, builds all next state before mutation, writes character preset,
chat snapshot and opening payload, then syncs the worldbook. Export creates formatted JSON through a Blob and revokes
the URL. Manual sync reports through toastr. Opening submit validates required fields, awaits worldbook sync, then
compiles and submits the assistant prompt; sync failure keeps `state: 'configuring'`, opens the modal, and never calls
generation.

- [ ] **Step 5: Run behavior and source tests and verify GREEN.**

```powershell
node --test 'src/寒冬末日/__tests__/sameLayerPreSource.test.js'
$env:TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","types":["node"]}'
& '.\node_modules\.bin\ts-node.cmd' --transpile-only 'src/寒冬末日/界面同层版/界面/状态栏/__tests__/runtimeOpeningPreset.test.ts'
& '.\node_modules\.bin\ts-node.cmd' --transpile-only 'src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/runtimeOpeningWorldbookSync.test.ts'
Remove-Item Env:TS_NODE_COMPILER_OPTIONS
```

Expected: exit `0`, zero failures.

### Task 4: Format, regress, and build PRE

**Files:**

- Format: source and tests changed by Tasks 1-3.
- Build outputs: selected files under `dist/寒冬末日/same-layer-pre/界面/状态栏/`.

**Interfaces:**

- Consumes: completed source implementation.
- Produces: verified source and production bundle.

- [ ] **Step 1: Format only scoped files.**

```powershell
pnpm exec prettier --write "src/寒冬末日/界面同层版/shared/runtimeOpeningPreset.ts" "src/寒冬末日/界面同层版/shared/runtimeOpeningPresetTransfer.ts" "src/寒冬末日/界面同层版/界面/状态栏/components/OpeningSetupPanel.vue" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/runtimeOpeningPreset.test.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/runtimeOpeningWorldbookSync.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/runtimeOpeningWorldbookSync.test.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue" "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
```

- [ ] **Step 2: Run all PRE tests and the runtime preset test.**

```powershell
$preJsTests = Get-ChildItem 'src/寒冬末日/same-layer-pre/界面/状态栏/__tests__' -Filter '*.js' -File | ForEach-Object { $_.FullName }
node --test $preJsTests 'src/寒冬末日/__tests__/sameLayerPreSource.test.js'
$env:TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","types":["node"]}'
& '.\node_modules\.bin\ts-node.cmd' --transpile-only 'src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/runtimeOpeningWorldbookSync.test.ts'
& '.\node_modules\.bin\ts-node.cmd' --transpile-only 'src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/streamRenderer.test.ts'
& '.\node_modules\.bin\ts-node.cmd' --transpile-only 'src/寒冬末日/界面同层版/界面/状态栏/__tests__/runtimeOpeningPreset.test.ts'
Remove-Item Env:TS_NODE_COMPILER_OPTIONS
```

Expected: exit `0`, zero failed tests.

- [ ] **Step 3: Run scoped lint.**

```powershell
pnpm exec eslint "src/寒冬末日/界面同层版/shared/runtimeOpeningPreset.ts" "src/寒冬末日/界面同层版/shared/runtimeOpeningPresetTransfer.ts" "src/寒冬末日/界面同层版/界面/状态栏/components/OpeningSetupPanel.vue" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/runtimeOpeningPreset.test.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/runtimeOpeningWorldbookSync.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/runtimeOpeningWorldbookSync.test.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue" "src/寒冬末日/__tests__/sameLayerPreSource.test.js"
```

Expected: exit `0` with no lint errors.

- [ ] **Step 4: Run the targeted production build.**

```powershell
$env:TAVERN_BUILD_PREFIXES='src/寒冬末日/same-layer-pre/界面/状态栏'
$env:TAVERN_SKIP_GENERATORS='1'
pnpm exec webpack --mode production
Remove-Item Env:TAVERN_BUILD_PREFIXES
Remove-Item Env:TAVERN_SKIP_GENERATORS
```

Expected: webpack exits `0` and lists only the selected PRE entry.

- [ ] **Step 5: Inspect final scope.**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: only design/plan docs, scoped PRE/shared source and tests, and selected PRE build outputs are changed;
`st-chatu8` remains unrelated and untouched.

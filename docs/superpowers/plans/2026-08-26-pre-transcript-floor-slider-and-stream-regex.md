# PRE Transcript Floor Slider and Stream Regex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global local-storage-backed PRE transcript floor slider that only changes正文 history display, while fixing Tavern display regex processing during PRE streaming.

**Architecture:** Put numeric preference normalization and readable-message window selection in small pure TypeScript modules. `useSameLayerPre` owns the reactive preference and dynamic transcript window, while a reusable Vue range component renders the control in both the normal toolbar and Apple history overlay. Keep MVU on a separately sliced six-message window and leave gallery inputs unchanged; make the streaming renderer use the existing role-aware Tavern display-regex helper.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tavern Helper globals from `@types`, browser `localStorage`, Node `node:test`, Prettier, webpack/pnpm.

## Global Constraints

- The slider only affects PRE正文 and the Apple story-history正文 list.
- Minimum preference is exactly 6 readable user/assistant message floors; the dynamic maximum is the current chat's complete readable floor count.
- Chats with fewer than 6 readable floors show all floors and disable the slider.
- Store the numeric preference under `eden.sameLayerPre.transcriptDisplayCount`; all character cards and chats share it.
- Clamping in a short chat must not overwrite a larger saved global preference.
- MVU role source candidates remain limited to the latest 6 readable transcript items.
- `PreGalleryPanel` receives no slider prop and its `scanLimitValue` behavior remains unchanged.
- A transient streaming assistant item is always appended and does not consume the persisted-floor quota.
- Streaming regex uses Tavern `display` processing with `ai_output`, `user_input`, or `world_info`; it never invents closing tags.
- Do not add APIs absent from the repository `@types` declarations or new runtime dependencies.
- Preserve unrelated dirty-worktree changes; stage only files listed by the active task.

---

## File Structure

- Create `src/寒冬末日/same-layer-pre/界面/状态栏/preTranscriptDisplaySetting.ts`: normalize, read, write, and clamp the shared numeric preference.
- Create `src/寒冬末日/same-layer-pre/界面/状态栏/preTranscriptWindow.ts`: count/filter readable message floors and produce正文/MVU tail windows.
- Create `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreTranscriptFloorSlider.vue`: accessible presentation-only range control.
- Modify `src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts`: own preference state, calculate total/effective counts, read the selected window, and expose the fixed MVU window.
- Modify `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`: replace the inert normal-theme menu and wire shared state to both theme paths.
- Modify `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue`: mount the shared slider in the Apple history header.
- Modify `src/寒冬末日/same-layer-pre/界面/状态栏/streamRendererDisplay.ts`: route streaming snapshots through PRE's existing `applyRegexForDisplay` helper.
- Create focused tests under `src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/`.

---

### Task 1: Fix PRE Streaming Display Regex

**Files:**
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/streamRendererDisplay.ts`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/useTranscriptRebuild.ts`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/streamRenderer.test.ts`

**Interfaces:**
- Consumes: `applyRegexForDisplay(text: string, role: TranscriptItem['role']): string` and `escapeHtml(input: string): string` from `useTranscriptRebuild.ts`.
- Produces: unchanged `buildStreamRendererHtml(message, role, messageId): string`; `messageId` remains accepted for component compatibility but is not passed to `formatAsDisplayedMessage` during streaming.

- [ ] **Step 1: Write the failing role/display-regex tests**

Create `__tests__/streamRenderer.test.ts` with:

```ts
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStreamRendererHtml, STREAM_RENDERER_PENDING_HTML } = require('../streamRendererDisplay.ts');

function withTavernRegex(impl, run) {
  const previousRegex = globalThis.formatAsTavernRegexedString;
  const previousFormatter = globalThis.formatAsDisplayedMessage;
  globalThis.formatAsTavernRegexedString = impl;
  globalThis.formatAsDisplayedMessage = () => {
    throw new Error('streaming must not require an existing message floor');
  };
  try {
    run();
  } finally {
    if (previousRegex === undefined) delete globalThis.formatAsTavernRegexedString;
    else globalThis.formatAsTavernRegexedString = previousRegex;
    if (previousFormatter === undefined) delete globalThis.formatAsDisplayedMessage;
    else globalThis.formatAsDisplayedMessage = previousFormatter;
  }
}

test('returns the pending marker for an empty streaming snapshot', () => {
  assert.equal(buildStreamRendererHtml('   ', 'assistant', 12), STREAM_RENDERER_PENDING_HTML);
});

test('uses ai_output display regex HTML without an existing message floor', () => {
  const calls = [];
  withTavernRegex(
    (text, source, destination, options) => {
      calls.push({ text, source, destination, options });
      return `<section class="beautified">${text}</section>`;
    },
    () => {
      assert.equal(
        buildStreamRendererHtml('<scene>雪夜</scene>', 'assistant', 999),
        '<section class="beautified"><scene>雪夜</scene></section>',
      );
    },
  );
  assert.deepEqual(calls, [
    {
      text: '<scene>雪夜</scene>',
      source: 'ai_output',
      destination: 'display',
      options: { depth: 0 },
    },
  ]);
});

test('maps user and system streaming roles to Tavern regex sources', () => {
  const sources = [];
  withTavernRegex(
    (text, source) => {
      sources.push(source);
      return text;
    },
    () => {
      buildStreamRendererHtml('玩家输入', 'user', 8);
      buildStreamRendererHtml('世界信息', 'system', 9);
    },
  );
  assert.deepEqual(sources, ['user_input', 'world_info']);
});

test('escapes the snapshot when Tavern display regex returns an empty string', () => {
  withTavernRegex(
    () => '',
    () => {
      assert.equal(buildStreamRendererHtml('<script>alert(1)</script>', 'assistant', 10), '&lt;script&gt;alert(1)&lt;/script&gt;');
    },
  );
});

test('escapes the snapshot when Tavern display regex throws', () => {
  withTavernRegex(
    () => {
      throw new Error('regex unavailable');
    },
    () => {
      assert.equal(buildStreamRendererHtml('<b>unfinished</b>', 'assistant', 11), '&lt;b&gt;unfinished&lt;/b&gt;');
    },
  );
});
```

- [ ] **Step 2: Run the test and verify the correct failure**

Run:

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/streamRenderer.test.ts"
```

Expected: the `ai_output display regex HTML` test fails because the current PRE renderer calls `formatAsDisplayedMessage` with predicted floor `999` instead of `formatAsTavernRegexedString`.

- [ ] **Step 3: Implement the minimal streaming renderer fix**

In `useTranscriptRebuild.ts`, replace `applyRegexForDisplay` with the exact safe contract:

```ts
export function applyRegexForDisplay(text: string, role: TranscriptItem['role']): string {
  if (!text) return '';
  try {
    if (typeof formatAsTavernRegexedString !== 'function') return '';
    const source = role === 'user' ? 'user_input' : role === 'system' ? 'world_info' : 'ai_output';
    const out = formatAsTavernRegexedString(text, source, 'display', { depth: 0 });
    return typeof out === 'string' ? out : '';
  } catch {
    return '';
  }
}
```

Replace the imports and body of `buildStreamRendererHtml` with:

```ts
import { applyRegexForDisplay, escapeHtml } from './useTranscriptRebuild.ts';
import type { TranscriptItem } from './types';

export const STREAM_RENDERER_PENDING_HTML = '<span class="stream-renderer__pending">等待 token…</span>';

export function buildStreamRendererHtml(message: string, role: TranscriptItem['role'], messageId: number): string {
  const source = String(message ?? '').trim();
  if (!source) return STREAM_RENDERER_PENDING_HTML;

  void messageId;
  const regexed = applyRegexForDisplay(source, role);
  return typeof regexed === 'string' && regexed.trim() ? regexed : escapeHtml(source);
}
```

Replace the renderer documentation sentence with: `流式阶段使用 role-aware Tavern display 正则，不依赖尚未落盘的预测 message_id。`

- [ ] **Step 4: Run the focused test and existing gallery regression test**

Run:

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/streamRenderer.test.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preGalleryImageRefs.test.js"
```

Expected: all tests pass; no `formatAsDisplayedMessage` error appears.

- [ ] **Step 5: Commit the isolated fix**

```powershell
git add -- "src/寒冬末日/same-layer-pre/界面/状态栏/streamRendererDisplay.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/useTranscriptRebuild.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/streamRenderer.test.ts"
git commit -m "fix: apply Tavern regex during PRE streaming"
```

---

### Task 2: Add Pure Transcript Preference and Window Modules

**Files:**
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/preTranscriptDisplaySetting.ts`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/preTranscriptWindow.ts`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptDisplaySetting.test.js`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptWindow.test.js`

**Interfaces:**
- Produces: `PRE_TRANSCRIPT_DISPLAY_MIN`, `PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY`, `normalizePreTranscriptDisplayPreference`, `resolvePreTranscriptDisplayCount`, `readPreTranscriptDisplayPreference`, `writePreTranscriptDisplayPreference`.
- Produces: `countPreReadableMessages`, `selectPreTranscriptWindow`, `selectPreMvuTranscriptItems`.

- [ ] **Step 1: Write failing preference tests**

Create `preTranscriptDisplaySetting.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PRE_TRANSCRIPT_DISPLAY_MIN,
  PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY,
  normalizePreTranscriptDisplayPreference,
  readPreTranscriptDisplayPreference,
  resolvePreTranscriptDisplayCount,
  writePreTranscriptDisplayPreference,
} = require('../preTranscriptDisplaySetting.ts');

function createStorage(initialValue) {
  let value = initialValue;
  return {
    getItem(key) {
      assert.equal(key, PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY);
      return value;
    },
    setItem(key, next) {
      assert.equal(key, PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY);
      value = next;
    },
    value() {
      return value;
    },
  };
}

test('normalizes missing, invalid, fractional, and too-small preferences to six', () => {
  assert.equal(PRE_TRANSCRIPT_DISPLAY_MIN, 6);
  assert.equal(normalizePreTranscriptDisplayPreference(null), 6);
  assert.equal(normalizePreTranscriptDisplayPreference('bad'), 6);
  assert.equal(normalizePreTranscriptDisplayPreference(5), 6);
  assert.equal(normalizePreTranscriptDisplayPreference(12.9), 12);
});

test('reads and writes one shared local-storage key', () => {
  const storage = createStorage('18');
  assert.equal(readPreTranscriptDisplayPreference(storage), 18);
  assert.equal(writePreTranscriptDisplayPreference(24, storage), 24);
  assert.equal(storage.value(), '24');
});

test('short chats clamp the effective count without overwriting the saved preference', () => {
  const storage = createStorage('30');
  const saved = readPreTranscriptDisplayPreference(storage);
  assert.equal(resolvePreTranscriptDisplayCount(saved, 10), 10);
  assert.equal(storage.value(), '30');
  assert.equal(resolvePreTranscriptDisplayCount(saved, 0), 0);
});

test('storage failures fall back to six without throwing', () => {
  const broken = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readPreTranscriptDisplayPreference(broken), 6);
  assert.equal(writePreTranscriptDisplayPreference(20, broken), 20);
});
```

- [ ] **Step 2: Write failing readable-window tests**

Create `preTranscriptWindow.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countPreReadableMessages,
  selectPreMvuTranscriptItems,
  selectPreTranscriptWindow,
} = require('../preTranscriptWindow.ts');

const messages = [
  { message_id: 0, role: 'assistant' },
  { message_id: 1, role: 'user' },
  { message_id: 2, role: 'assistant' },
  { message_id: 3, role: 'system' },
  { message_id: 4, role: 'user' },
  { message_id: 5, role: 'assistant' },
  { message_id: 6, role: 'user' },
  { message_id: 7, role: 'assistant' },
  { message_id: 8, role: 'user' },
  { message_id: 9, role: 'assistant' },
];

test('counts only positive user and assistant正文 floors', () => {
  assert.equal(countPreReadableMessages(messages), 8);
});

test('selects the requested readable tail while preserving order', () => {
  assert.deepEqual(selectPreTranscriptWindow(messages, 6).map(item => item.message_id), [4, 5, 6, 7, 8, 9]);
  assert.deepEqual(selectPreTranscriptWindow(messages, 8).map(item => item.message_id), [1, 2, 4, 5, 6, 7, 8, 9]);
});

test('keeps MVU candidates fixed to the latest six readable items', () => {
  assert.deepEqual(selectPreMvuTranscriptItems(messages).map(item => item.message_id), [4, 5, 6, 7, 8, 9]);
});
```

- [ ] **Step 3: Run both test files and verify missing-module failures**

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptDisplaySetting.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptWindow.test.js"
```

Expected: both files fail with `MODULE_NOT_FOUND` because the pure modules do not exist.

- [ ] **Step 4: Implement the preference module**

Create `preTranscriptDisplaySetting.ts`:

```ts
export const PRE_TRANSCRIPT_DISPLAY_MIN = 6;
export const PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY = 'eden.sameLayerPre.transcriptDisplayCount';

type PreTranscriptStorage = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(storage?: PreTranscriptStorage | null): PreTranscriptStorage | null {
  if (storage) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function normalizePreTranscriptDisplayPreference(value: unknown): number {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric >= PRE_TRANSCRIPT_DISPLAY_MIN
    ? numeric
    : PRE_TRANSCRIPT_DISPLAY_MIN;
}

export function resolvePreTranscriptDisplayCount(preference: unknown, totalReadableCount: unknown): number {
  const total = Math.max(0, Math.trunc(Number(totalReadableCount) || 0));
  return total === 0 ? 0 : Math.min(normalizePreTranscriptDisplayPreference(preference), total);
}

export function readPreTranscriptDisplayPreference(storage?: PreTranscriptStorage | null): number {
  try {
    return normalizePreTranscriptDisplayPreference(resolveStorage(storage)?.getItem(PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY));
  } catch {
    return PRE_TRANSCRIPT_DISPLAY_MIN;
  }
}

export function writePreTranscriptDisplayPreference(
  value: unknown,
  storage?: PreTranscriptStorage | null,
): number {
  const normalized = normalizePreTranscriptDisplayPreference(value);
  try {
    resolveStorage(storage)?.setItem(PRE_TRANSCRIPT_DISPLAY_STORAGE_KEY, String(normalized));
  } catch {
    // Restricted iframe storage must not break the PRE reader.
  }
  return normalized;
}
```

- [ ] **Step 5: Implement the readable-window module**

Create `preTranscriptWindow.ts`:

```ts
import { PRE_TRANSCRIPT_DISPLAY_MIN } from './preTranscriptDisplaySetting';

type PreTranscriptLike = {
  message_id: number;
  role?: string;
};

function isPreReadableMessage<T extends PreTranscriptLike>(item: T): boolean {
  const messageId = Math.trunc(Number(item?.message_id));
  return Number.isFinite(messageId) && messageId > 0 && (item.role === 'user' || item.role === 'assistant');
}

export function countPreReadableMessages<T extends PreTranscriptLike>(items: T[]): number {
  return (Array.isArray(items) ? items : []).filter(isPreReadableMessage).length;
}

export function selectPreTranscriptWindow<T extends PreTranscriptLike>(items: T[], count: number): T[] {
  const normalizedCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (normalizedCount === 0) return [];
  return (Array.isArray(items) ? items : []).filter(isPreReadableMessage).slice(-normalizedCount);
}

export function selectPreMvuTranscriptItems<T extends PreTranscriptLike>(items: T[]): T[] {
  return selectPreTranscriptWindow(items, PRE_TRANSCRIPT_DISPLAY_MIN);
}
```

- [ ] **Step 6: Run tests and commit the pure modules**

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptDisplaySetting.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptWindow.test.js"
git add -- "src/寒冬末日/same-layer-pre/界面/状态栏/preTranscriptDisplaySetting.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/preTranscriptWindow.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptDisplaySetting.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptWindow.test.js"
git commit -m "feat: add PRE transcript display preference"
```

Expected: all four tests pass and the commit contains only the four listed files.

---

### Task 3: Integrate the Dynamic Window into `useSameLayerPre`

**Files:**
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptIntegrationSource.test.js`

**Interfaces:**
- Consumes: all pure functions from Task 2.
- Produces from `useSameLayerPre()`: `mvuTranscriptItems`, `transcriptTotalCount`, `transcriptDisplayMinimum`, `transcriptDisplayCount`, `transcriptDisplayPreference`, and `setTranscriptDisplayPreference(value: number): void`.

- [ ] **Step 1: Write a failing source-contract test for state and MVU isolation**

Create `preTranscriptIntegrationSource.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../useSameLayerPre.ts'), 'utf8');

test('PRE transcript state uses the shared preference and dynamic readable count', () => {
  assert.match(source, /readPreTranscriptDisplayPreference/);
  assert.match(source, /resolvePreTranscriptDisplayCount/);
  assert.match(source, /writePreTranscriptDisplayPreference/);
  assert.match(source, /const transcriptTotalCount = ref\(0\)/);
  assert.match(source, /const transcriptDisplayCount = computed/);
  assert.match(source, /function setTranscriptDisplayPreference\(value: number\)/);
});

test('PRE exposes a separately bounded six-floor MVU window', () => {
  assert.match(source, /const mvuTranscriptItems = computed\([\s\S]*selectPreMvuTranscriptItems\(transcriptItems\.value\)/);
  assert.match(source, /mvuTranscriptItems,/);
});

test('streaming remains appended outside the persisted-floor quota', () => {
  assert.match(source, /return item \? \[\.\.\.transcriptItems\.value, item\] : transcriptItems\.value/);
});
```

- [ ] **Step 2: Run the source test and verify it fails on missing state**

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptIntegrationSource.test.js"
```

Expected: failures report missing preference/count/MVU-window declarations.

- [ ] **Step 3: Import Task 2 helpers and declare reactive state**

Add these imports near the existing Vue/type imports:

```ts
import {
  PRE_TRANSCRIPT_DISPLAY_MIN,
  readPreTranscriptDisplayPreference,
  resolvePreTranscriptDisplayCount,
  writePreTranscriptDisplayPreference,
} from './preTranscriptDisplaySetting';
import {
  countPreReadableMessages,
  selectPreMvuTranscriptItems,
  selectPreTranscriptWindow,
} from './preTranscriptWindow';
```

Remove `PRE_TRANSCRIPT_TAIL_PAIR_COUNT` and `PRE_TRANSCRIPT_WINDOW_SIZE`. Inside `useSameLayerPre`, immediately after `const transcriptItems = ref<TranscriptItem[]>([])`, add:

```ts
const transcriptDisplayPreference = ref(readPreTranscriptDisplayPreference());
const transcriptTotalCount = ref(0);
const transcriptDisplayMinimum = computed(() => Math.min(PRE_TRANSCRIPT_DISPLAY_MIN, transcriptTotalCount.value));
const transcriptDisplayCount = computed(() =>
  resolvePreTranscriptDisplayCount(transcriptDisplayPreference.value, transcriptTotalCount.value),
);
const mvuTranscriptItems = computed(() => selectPreMvuTranscriptItems(transcriptItems.value));
```

- [ ] **Step 4: Replace the fixed bounded reader with dynamic selection**

Replace `readRecentChatMessagesForUi` with:

```ts
function readRecentChatMessagesForUi() {
  const lastId = getTrueChatLength();
  if (lastId <= 0) {
    transcriptTotalCount.value = 0;
    return [];
  }

  const hostMessages = readHostChatWindow(1, lastId);
  if (hostMessages.length > 0) {
    const total = countPreReadableMessages(hostMessages);
    const effectiveCount = resolvePreTranscriptDisplayCount(transcriptDisplayPreference.value, total);
    const selectedHostMessages = selectPreTranscriptWindow(hostMessages, effectiveCount);
    const startId = selectedHostMessages.at(0)?.message_id ?? lastId;
    transcriptTotalCount.value = total;

    try {
      const list = getChatMessages(`${startId}-${lastId}`, { hide_state: 'all' });
      if (Array.isArray(list)) {
        return selectPreTranscriptWindow(normalizeChatMessages(list, startId), effectiveCount);
      }
    } catch (error) {
      console.warn('[same-layer-pre] dynamic getChatMessages failed', { startId, lastId, error });
    }

    return selectedHostMessages;
  }

  try {
    const list = getChatMessages(`1-${lastId}`, { hide_state: 'all' });
    const normalized = Array.isArray(list) ? normalizeChatMessages(list, 1) : [];
    const total = countPreReadableMessages(normalized);
    transcriptTotalCount.value = total;
    return selectPreTranscriptWindow(
      normalized,
      resolvePreTranscriptDisplayCount(transcriptDisplayPreference.value, total),
    );
  } catch (error) {
    transcriptTotalCount.value = 0;
    console.warn('[same-layer-pre] full getChatMessages fallback failed', { lastId, error });
    return [];
  }
}
```

Delete the old file-level `selectPreTranscriptWindow(messages)` implementation so there is only one selector.

- [ ] **Step 5: Add the preference setter and return fields**

Add beside `refreshTranscript`:

```ts
function setTranscriptDisplayPreference(value: number) {
  transcriptDisplayPreference.value = writePreTranscriptDisplayPreference(value);
  refreshTranscript('transcript_window_changed');
}
```

Add the following entries to the returned object:

```ts
mvuTranscriptItems,
transcriptTotalCount,
transcriptDisplayMinimum,
transcriptDisplayCount,
setTranscriptDisplayPreference,
```

- [ ] **Step 6: Run focused tests and commit the integration**

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptDisplaySetting.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptWindow.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptIntegrationSource.test.js"
git add -- "src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptIntegrationSource.test.js"
git commit -m "feat: make PRE transcript window configurable"
```

Expected: all tests pass; the fixed six-item MVU computed remains present.

---

### Task 4: Build the Reusable Floor Slider Component

**Files:**
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreTranscriptFloorSlider.vue`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderSource.test.js`

**Interfaces:**
- Consumes props: `modelValue: number`, `minimum: number`, `maximum: number`, `disabled?: boolean`.
- Produces events: `update:modelValue(value: number)` during input and `change(value: number)` on commit.

- [ ] **Step 1: Write the failing component source-contract test**

Create `preTranscriptFloorSliderSource.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../components/PreTranscriptFloorSlider.vue'), 'utf8');

test('floor slider exposes bounded native range semantics', () => {
  assert.match(source, /type="range"/);
  assert.match(source, /:min="effectiveMinimum"/);
  assert.match(source, /:max="effectiveMaximum"/);
  assert.match(source, /:aria-valuetext="displayLabel"/);
  assert.match(source, /emit\('update:modelValue', next\)/);
  assert.match(source, /emit\('change', draftValue\.value\)/);
});

test('floor slider distinguishes recent and complete transcript labels', () => {
  assert.match(source, /全部 \$\{effectiveMaximum\.value\} 层/);
  assert.match(source, /最近 \$\{draftValue\.value\} 层 \/ 共 \$\{effectiveMaximum\.value\} 层/);
});
```

- [ ] **Step 2: Run the test and verify the missing-file failure**

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderSource.test.js"
```

Expected: `ENOENT` for `PreTranscriptFloorSlider.vue`.

- [ ] **Step 3: Create the accessible range component**

Create `PreTranscriptFloorSlider.vue` with this script behavior:

```ts
<script setup lang="ts">
const props = defineProps<{
  modelValue: number;
  minimum: number;
  maximum: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void;
  (event: 'change', value: number): void;
}>();

const effectiveMaximum = computed(() => Math.max(0, Math.trunc(Number(props.maximum) || 0)));
const effectiveMinimum = computed(() => Math.min(effectiveMaximum.value, Math.max(0, Math.trunc(Number(props.minimum) || 0))));
const draftValue = ref(0);
const isDisabled = computed(() => props.disabled === true || effectiveMaximum.value <= effectiveMinimum.value);
const displayLabel = computed(() =>
  draftValue.value >= effectiveMaximum.value
    ? `全部 ${effectiveMaximum.value} 层`
    : `最近 ${draftValue.value} 层 / 共 ${effectiveMaximum.value} 层`,
);

function clampValue(value: unknown) {
  const numeric = Math.trunc(Number(value) || 0);
  return Math.min(effectiveMaximum.value, Math.max(effectiveMinimum.value, numeric));
}

function syncDraft() {
  draftValue.value = clampValue(props.modelValue);
}

function handleInput(event: Event) {
  const next = clampValue((event.target as HTMLInputElement).value);
  draftValue.value = next;
  emit('update:modelValue', next);
}

function handleChange() {
  emit('change', draftValue.value);
}

watch([() => props.modelValue, effectiveMinimum, effectiveMaximum], syncDraft, { immediate: true });
</script>
```

Use this template:

```vue
<template>
  <label class="pre-floor-slider">
    <span class="pre-floor-slider__copy">
      <strong>正文楼层</strong>
      <small>{{ displayLabel }}</small>
    </span>
    <input
      type="range"
      :value="draftValue"
      :min="effectiveMinimum"
      :max="effectiveMaximum"
      step="1"
      :disabled="isDisabled"
      aria-label="正文显示楼层数"
      :aria-valuetext="displayLabel"
      @input="handleInput"
      @change="handleChange"
    />
  </label>
</template>
```

Add the following exact scoped style block:

```vue
<style scoped>
.pre-floor-slider {
  display: grid;
  min-width: 220px;
  gap: 8px;
  padding: 10px 12px;
  color: var(--demo-text-primary);
}

.pre-floor-slider__copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.pre-floor-slider__copy strong,
.pre-floor-slider__copy small {
  font-size: 12px;
}

.pre-floor-slider__copy small {
  color: var(--demo-text-tertiary);
}

.pre-floor-slider input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  margin: 0;
  accent-color: var(--primary);
  cursor: pointer;
}

.pre-floor-slider input:focus-visible {
  outline: 2px solid var(--demo-border-accent-active);
  outline-offset: 2px;
}

.pre-floor-slider input:disabled {
  cursor: default;
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .pre-floor-slider input {
    scroll-behavior: auto;
  }
}
</style>
```

- [ ] **Step 4: Run the source test, format, and commit**

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderSource.test.js"
pnpm prettier --write "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreTranscriptFloorSlider.vue"
git add -- "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreTranscriptFloorSlider.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderSource.test.js"
git commit -m "feat: add PRE transcript floor slider"
```

Expected: source-contract tests pass and Prettier reports the component formatted.

---

### Task 5: Wire Both Theme Paths and Preserve MVU/Gallery Boundaries

**Files:**
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue`
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderWiringSource.test.js`

**Interfaces:**
- Consumes: Task 3 `useSameLayerPre` fields and Task 4 `PreTranscriptFloorSlider`.
- Produces: normal-theme toolbar popover and Apple-history header control; `MvuRolePanel` receives `mvuTranscriptItems`; gallery interface remains unchanged.

- [ ] **Step 1: Write failing wiring and isolation contracts**

Create `preTranscriptFloorSliderWiringSource.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relative) {
  return fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
}

const page = read('pages/StoryPagePre.vue');
const appleHistory = read('components/PreAppleHistoryOverlay.vue');

test('normal PRE toolbar renders the shared floor slider', () => {
  assert.match(page, /import PreTranscriptFloorSlider from/);
  assert.match(page, /<PreTranscriptFloorSlider/);
  assert.match(page, /:minimum="transcriptDisplayMinimum"/);
  assert.match(page, /:maximum="transcriptTotalCount"/);
  assert.match(page, /@change="commitTranscriptFloorCount"/);
});

test('Apple history renders the same shared floor slider', () => {
  assert.match(appleHistory, /import PreTranscriptFloorSlider from/);
  assert.match(appleHistory, /<PreTranscriptFloorSlider/);
  assert.match(appleHistory, /emit\('floor-change', value\)/);
  assert.match(page, /@floor-change="commitTranscriptFloorCount"/);
});

test('MVU remains six-floor isolated and gallery receives no transcript floor prop', () => {
  assert.match(page, /<MvuRolePanel[\s\S]*:transcript-items="mvuTranscriptItems"/);
  const galleryTag = page.match(/<PreGalleryPanel[\s\S]*?\/>/)?.[0] ?? '';
  assert.doesNotMatch(galleryTag, /transcript|floor|display-count/);
});

test('the inert latest/all label menu is removed', () => {
  assert.doesNotMatch(page, /const transcriptWindowPages/);
  assert.doesNotMatch(page, /function selectTranscriptWindowPage/);
  assert.doesNotMatch(page, /transcriptWindowLabel/);
});
```

- [ ] **Step 2: Run the wiring test and verify missing slider wiring**

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderWiringSource.test.js"
```

Expected: failures identify the old menu, missing Apple slider, and `baseTranscriptItems` still passed to MVU.

- [ ] **Step 3: Wire the normal toolbar in `StoryPagePre.vue`**

Import `PreTranscriptFloorSlider`. Destructure these five Task 3 fields/methods from `useSameLayerPre`:

```ts
mvuTranscriptItems,
transcriptTotalCount,
transcriptDisplayMinimum,
transcriptDisplayCount,
transcriptDisplayPreference,
setTranscriptDisplayPreference,
```

Replace `transcriptWindowLabel` with a draft synchronized to the effective count:

```ts
const transcriptFloorDraft = ref(transcriptDisplayCount.value);

watch(
  transcriptDisplayCount,
  value => {
    transcriptFloorDraft.value = value;
  },
  { immediate: true },
);

function commitTranscriptFloorCount(value: number) {
  setTranscriptDisplayPreference(value);
  transcriptWindowMenuOpen.value = false;
}
```

Replace the non-Apple menu list with:

```vue
<transition name="toolbar-menu-fade">
  <div v-if="!isAppleTheme && transcriptWindowMenuOpen" class="ui-page-menu-list ui-floor-slider-menu clip-corner-sm">
    <PreTranscriptFloorSlider
      v-model="transcriptFloorDraft"
      :minimum="transcriptDisplayMinimum"
      :maximum="transcriptTotalCount"
      :disabled="transcriptTotalCount <= transcriptDisplayMinimum"
      @change="commitTranscriptFloorCount"
    />
  </div>
</transition>
```

Replace both topbar value spans with:

```vue
<span class="ui-page-menu-value">{{ transcriptDisplayCount }}</span>
```

Remove `transcriptWindowPages`, `selectTranscriptWindowPage`, and all `transcriptWindowLabel` uses. Add this exact popover rule without changing the right gallery sidebar:

```css
.ui-floor-slider-menu {
  width: min(82vw, 320px);
  padding: 4px;
}
```

- [ ] **Step 4: Wire Apple history and the MVU boundary**

Change the MVU prop to:

```vue
:transcript-items="mvuTranscriptItems"
```

Pass the slider state to `PreAppleHistoryOverlay`:

```vue
:floor-count="transcriptFloorDraft"
:floor-minimum="transcriptDisplayMinimum"
:floor-maximum="transcriptTotalCount"
@update:floor-count="transcriptFloorDraft = $event"
@floor-change="commitTranscriptFloorCount"
```

In `PreAppleHistoryOverlay.vue`, add props and events:

```ts
floorCount: number;
floorMinimum: number;
floorMaximum: number;
```

```ts
(event: 'update:floor-count', value: number): void;
(event: 'floor-change', value: number): void;
```

Import `PreTranscriptFloorSlider` and add it between the heading and close button:

```vue
<PreTranscriptFloorSlider
  class="pre-apple-history__floor-slider"
  :model-value="floorCount"
  :minimum="floorMinimum"
  :maximum="floorMaximum"
  :disabled="floorMaximum <= floorMinimum"
  @update:model-value="emit('update:floor-count', $event)"
  @change="value => emit('floor-change', value)"
/>
```

Add these exact Apple layout rules and do not modify the history message card logic:

```css
.pre-apple-history__floor-slider {
  min-width: min(320px, 42vw);
  margin-left: auto;
}

@media (max-width: 760px) {
  .pre-apple-history__header {
    flex-wrap: wrap;
  }

  .pre-apple-history__floor-slider {
    order: 3;
    width: 100%;
    min-width: 0;
    margin-left: 0;
  }
}
```

- [ ] **Step 5: Run wiring, pure, stream, and gallery tests**

```powershell
node --test "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptDisplaySetting.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptWindow.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptIntegrationSource.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderSource.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderWiringSource.test.js" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/streamRenderer.test.ts" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preGalleryImageRefs.test.js"
```

Expected: all tests pass; gallery tests confirm its existing interface and behavior remain intact.

- [ ] **Step 6: Format and commit UI wiring**

```powershell
pnpm prettier --write "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue"
git add -- "src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/components/PreAppleHistoryOverlay.vue" "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preTranscriptFloorSliderWiringSource.test.js"
git commit -m "feat: wire PRE transcript floor control"
```

---

### Task 6: Final Verification and Targeted Build

**Files:**
- Verify source/test files from Tasks 1-5.
- Build output: `dist/寒冬末日/same-layer-pre/界面/状态栏/index.html` in the isolated execution worktree only.

**Interfaces:**
- Consumes the completed implementation.
- Produces verification evidence; does not claim live Tavern behavior without browser proof.

- [ ] **Step 1: Run every PRE focused test from a clean command**

```powershell
$preTestFiles = Get-ChildItem "src/寒冬末日/same-layer-pre/界面/状态栏/__tests__" -File |
  Where-Object { $_.Name -match '\.test\.(js|ts)$' } |
  Select-Object -ExpandProperty FullName
node --test $preTestFiles
```

Expected: all PRE tests pass with zero failures.

- [ ] **Step 2: Run targeted formatting checks without rewriting unrelated files**

```powershell
pnpm prettier --check "src/寒冬末日/same-layer-pre/界面/状态栏/**/*.{ts,js,vue}"
git diff --check
```

Expected: Prettier reports all matched files formatted and `git diff --check` produces no output.

- [ ] **Step 3: Run the isolated PRE production build**

In the isolated execution worktree:

```powershell
$env:TAVERN_BUILD_PREFIXES='src/寒冬末日/same-layer-pre/界面/状态栏'
$env:TAVERN_SKIP_GENERATORS='1'
pnpm build
Remove-Item Env:TAVERN_BUILD_PREFIXES
Remove-Item Env:TAVERN_SKIP_GENERATORS
```

Expected: webpack exits 0 and writes the PRE `index.html`. Do not run this command in the user's original dirty checkout because that target artifact was already modified before this feature.

- [ ] **Step 4: Inspect the final scoped diff and build markers**

```powershell
git status --short
git diff --stat HEAD~5..HEAD
rg -n "eden\.sameLayerPre\.transcriptDisplayCount|ai_output|正文楼层" "dist/寒冬末日/same-layer-pre/界面/状态栏/index.html"
```

Expected: source diff is limited to the planned PRE files/tests; the built HTML contains the storage key, stream regex source marker, and slider copy. Dist output remains unstaged unless the user separately requests release-artifact delivery.

- [ ] **Step 5: Record the evidence boundary**

Report separately:

- Node/source-contract tests passed.
- Targeted webpack build passed.
- `localStorage` and dynamic floor window behavior are source/build verified.
- Live Tavern iframe streaming HTML replacement remains unverified until tested at `127.0.0.1:8000` with an enabled beautification regex.

Do not create a verification-only commit when no source changes remain.

# same-layer-pre APPLE Theme Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable, non-default seventh `APPLE` theme to same-layer-pre with scoped frost reading visuals, floating edge handles, and restrained spring motion while preserving all existing business behavior and the six existing themes.

**Architecture:** Extend the existing `DemoTheme`/theme-class pipeline with `apple`, then add the complete derived token cascade in the post-import same-layer token file. Keep all new presentation rules behind `.theme-apple` and the pre root; reuse existing drawer/menu buttons and event handlers, changing only CSS and the theme menu list.

**Tech Stack:** Vue 3 SFC, TypeScript, scoped CSS, CSS custom properties, Node `node:test`, pnpm/Vite production build, browser visual checks.

---

### Task 1: Add failing APPLE source-contract coverage

**Files:**
- Modify: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`
- Read: `src/寒冬末日/same-layer-pre/界面/状态栏/types.ts`
- Read: `src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts`
- Read: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`

- [ ] **Step 1: Add assertions for the seventh theme and invariants**

  Assert that `DemoTheme` includes `apple`, the hook whitelist includes `theme-apple`, the hook default remains `ref<DemoTheme>('amber')`, the page menu contains `APPLE`, and APPLE styles include scoped selectors, floating handles, reduced-motion/transparency/contrast branches, and no layout-width contribution.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `node --test src/寒冬末日/__tests__/sameLayerPreSource.test.js`

  Expected: FAIL because `apple` and its selectors do not yet exist.

### Task 2: Wire APPLE into the existing theme pipeline

**Files:**
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/types.ts:9`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts:13-35`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue:496-504`

- [ ] **Step 1: Extend the union and DOM class whitelist**

  Add `apple` to `DemoTheme` and `theme-apple` to `DEMO_THEME_CLASS_NAMES`; leave `theme = ref<DemoTheme>('amber')` unchanged.

- [ ] **Step 2: Add the menu item without changing selection behavior**

  Append `{ label: 'APPLE', value: 'apple' }` after the existing six items. Keep `selectTheme` and all existing click handlers unchanged.

- [ ] **Step 3: Re-run the focused test**

  Run: `node --test src/寒冬末日/__tests__/sameLayerPreSource.test.js`

  Expected: the theme wiring assertions pass; visual assertions still fail until Tasks 3–4.

### Task 3: Add the APPLE token cascade

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/theme-tokens.css`

- [ ] **Step 1: Add APPLE base variables and dark color scheme**

  Add a `.theme-apple` block with the approved cold black, soft white, ice-gray accent, stable surface, focus, shadow, and system font values; include `color-scheme: dark`.

- [ ] **Step 2: Add the complete derived `--demo-*` block**

  Include APPLE in the existing derived-token selector group so all `--demo-text-*`, `--demo-surface-*`, `--demo-border-*`, gradients, shadows, and `--demo-bg-gradient` resolve from APPLE variables. Do not edit the existing six theme declarations.

- [ ] **Step 3: Add only APPLE-specific material/accessibility overrides**

  Scope frost surfaces, focus rings, and reduced-transparency/contrast fallbacks to `.theme-apple`; do not alter global reduced-motion rules for the other themes.

### Task 4: Implement scoped reader visuals and floating handles

**Files:**
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue:1153-2185`

- [ ] **Step 1: Add APPLE typography and material overrides**

  Because `applyDemoTheme` mounts theme classes on `document.documentElement` and `body`, use a scoped-SFC-safe selector such as `:global(.theme-apple) .same-layer-pre-host` (not `.same-layer-pre-host.theme-apple`). Set the 15–17px body type and 1.8–2.0 line-height, airy transcript/card spacing, restrained metadata contrast, and glass only for topbar/input/tools/drawers. Keep story cards stable and low-decoration.

- [ ] **Step 2: Add immediate button feedback and interruptible drawer motion**

  Add APPLE-scoped `:active` scale/material feedback capped at 120ms. Use a `linear()` spring in an `@supports` branch with the existing cubic-bezier fallback; keep drawer translation at or below 24px and 180–420ms. Preserve existing Vue transitions and event handlers.

- [ ] **Step 3: Make mobile handles true overlays**

  At the mobile breakpoint, keep both handles `position: fixed` (or root-relative `absolute`), outside flex/grid flow, with explicit z-index and pointer events. Preserve left role/right gallery routing, and ensure the open state only changes transform/opacity, never transcript width.

- [ ] **Step 4: Add APPLE reduced-preference fallbacks**

  Under APPLE-scoped media queries, remove drawer translation/rebound for `prefers-reduced-motion: reduce`, raise surface alpha for `prefers-reduced-transparency: reduce`, and strengthen text/border/focus treatment for `prefers-contrast: more`. Focus indication must include a visible outline/ring and non-color geometry.

- [ ] **Step 5: Re-run the focused source test**

  Run: `node --test src/寒冬末日/__tests__/sameLayerPreSource.test.js`

  Expected: PASS.

### Task 5: Verify build, generated scope, and visual behavior

**Files:**
- Generated only if touched by the build: `dist/寒冬末日/same-layer-pre/界面/状态栏/index.html`, `index.js.map`, `main.css.map`

- [ ] **Step 1: Run component/token checks and targeted tests**

  Run: `node --test src/寒冬末日/__tests__/sameLayerPreSource.test.js src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preGalleryImageRefs.test.js`

  Run: `pnpm check:component-tokens`

- [ ] **Step 2: Run the production build**

  Run: `pnpm build`; inspect `git status` and retain only the three listed pre dist artifacts if generated.

- [ ] **Step 3: Perform browser checks at all target widths**

  Select APPLE and verify default amber on first load, menu activation, 375/768/1024/1440px no horizontal scroll, transcript width unchanged with handles, left/right drawer routing, system/map panels, and bottom spacing.

- [ ] **Step 4: Perform accessibility preference checks**

  Emulate reduced motion, reduced transparency, and more contrast; verify the measured fallbacks and visible non-color focus treatment.

- [ ] **Step 5: Run final diff checks**

  Run: `git diff --check`

  Confirm no business/runtime files changed and no unrelated dirty files were staged.

- [ ] **Step 6: Commit the implementation**

  ```bash
  git add src/寒冬末日/__tests__/sameLayerPreSource.test.js src/寒冬末日/same-layer-pre/界面/状态栏/types.ts src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue src/寒冬末日/界面同层版/界面/状态栏/theme-tokens.css dist/寒冬末日/same-layer-pre/界面/状态栏/index.html dist/寒冬末日/same-layer-pre/界面/状态栏/index.js.map dist/寒冬末日/same-layer-pre/界面/状态栏/main.css.map
  git commit -m "feat: add apple theme to same-layer-pre"
  ```

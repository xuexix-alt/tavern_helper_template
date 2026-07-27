# Phone Component Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report the real load/version/lifecycle state of all ten manually imported phone scripts and make winter WeChat generation resolve Tavern Helper APIs across mobile iframe boundaries.

**Architecture:** `ModuleRegistry` exposes immutable lifecycle snapshots through `TavernPhonePublicApi`; a pure component-health evaluator owns the ten-component policy; the `00` entry debounces one toastr summary. The winter adapter reuses `tavernApiAdapter` instead of directly binding iframe globals.

**Tech Stack:** TypeScript, Tavern Helper iframe APIs, toastr, Node assert tests, webpack/pnpm.

---

### Task 1: Runtime module snapshots

**Files:**
- Modify: `src/小手机平台/core/types.ts`
- Modify: `src/小手机平台/core/moduleRegistry.ts`
- Modify: `src/小手机平台/core/runtime.ts`
- Test: `src/小手机平台/__tests__/runtime.test.ts`

- [x] Add a failing test that registers initialized and standby modules, then asserts immutable snapshots contain manifest versions and `READY`/`REGISTERED` states.
- [x] Run the runtime test and verify the public snapshot API is missing.
- [x] Add `PhoneModuleSnapshot`, `getModules()`, and a module-registration event; derive status from the initialized instance when present.
- [x] Run the runtime test and verify it passes.

### Task 2: Ten-component health report and notification

**Files:**
- Create: `src/小手机平台/core/componentHealth.ts`
- Modify: `src/小手机平台/脚本/00运行时管理器/index.ts`
- Test: `src/小手机平台/__tests__/runtime.test.ts`

- [x] Add failing tests for all-present, missing, version-mismatch, core-not-ready, standby-extension, and notification-once behavior.
- [x] Run the runtime test and verify the health evaluator is missing.
- [x] Implement the ten exact component requirements, pure report formatting, debounced single notification, and failure isolation around toastr.
- [x] Run the runtime test and verify all health cases pass.

### Task 3: Mobile-safe winter API resolution

**Files:**
- Modify: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Test: `src/小手机平台/__tests__/shellSource.test.js`

- [x] Add a failing source-contract test requiring `createGenerateRaw()` and `createStopGenerationById()` in the winter provider path and rejecting direct shorthand dependency injection.
- [x] Run the source-contract test and verify it fails on the current direct global binding.
- [x] Import the platform adapter factories once and use their wrappers when constructing `TavernProvider`.
- [x] Run the source-contract and AI/provider tests and verify they pass.

### Task 4: Build and publish

**Files:**
- Modify generated: `dist/小手机平台/脚本/00运行时管理器/index.js`
- Modify generated: `dist/小手机平台/脚本/00运行时管理器/index.js.map`
- Modify generated: `dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js`
- Modify generated: `dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js.map`

- [x] Run the complete small-phone test suite and targeted production build for the two entries.
- [x] Run `git diff --check` and inspect bundles for component-check and TavernHelper resolution markers.
- [x] Stage only the specification, plan, source, tests, and four relevant dist files.
- [x] Commit with `fix(phone): validate platform components on startup` and push branch `20260211`.

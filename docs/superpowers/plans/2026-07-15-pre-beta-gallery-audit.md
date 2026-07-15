# PRE Beta Gallery Audit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or
> superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
审计本轮 same-layer-pre 画廊 Beta 的全部实现、测试、截图结论与插件源码依据，修正不一致的文档和回归保护，并完成构建、提交与远程同步。

**Architecture:**
same-layer-pre 只保存正文图片的轻量引用并在显示时解析宿主/iframe 中的插件原生节点；Beta 对自身状态只读，不拥有生图、图片持久化或第二份图片真相，但测试动作可以委托插件原生节点，进而由插件执行生图。交互优先转发给 st-chatu8 原生图片节点，移动端画廊用 pointerdown/pointerup 自己识别长按与双击，再转成插件需要的 click-click 序列。

**Tech Stack:** Vue 3, TypeScript, Tavern Helper, Node built-in `node:test`, pnpm/Webpack, Markdown/TXT project
documentation.

---

## 1. Inventory and evidence map

- [x] Inventory the Beta entry, modal, gallery, reference resolver, and source tests.
- [x] Recheck the current st-chatu8 source and the v2.7.7 source-audit notes for placeholder, ready-media, click, and
      longpress behavior.
- [x] Mark each conclusion with its source file, function/selector/test or screenshot description, status, and whether
      it is safe as a development basis.

## 2. Reconcile the technical conclusions

- [x] Document the distinction between LLM regex/tag, body tag, prompt/request metadata, placeholder, pending response,
      ready media, and cache/`extra.images` metadata.
- [x] Confirm that Beta and the original pre gallery do not create a second persistent image truth or implement a
      parallel generation path; native-node delegation may intentionally trigger the plugin.
- [x] Confirm that ready-media regeneration is delegated as two clicks on the plugin media node, while longpress uses
      the 1200 ms threshold and plugin setting gates.
- [x] Document target routing: exact iframe media first, identity-bound host fallback second, and prompt-only routing to
      the prompt button.
- [x] Document mobile pointer semantics and the corrected tap-state reset placement, including the screenshot evidence
      where every second tap was reported as `same=false`.
- [x] Clarify that an action trace proves dispatch/bridge delivery, not that the plugin business callback completed,
      unless a native/plugin-side effect was observed.
- [x] Record the complete manual evidence sequence: Beta initial success, original-gallery single-click success with
      double/longpress failure, later Beta double/longpress success, repeated `#1/2 same=false`, and the absence of
      final live-device verification in this audit.

## 3. Update implementation and documentation

- [x] Add a consolidated audit document with an evidence matrix, stage model, gesture model, test/reproduction
      procedure, component index, and errata.
- [x] Update the existing Beta model, plugin integration guide, current-source audit, adapter notes, and example
      integration notes where their wording is stale or overstates evidence.
- [x] Keep the regression test for mobile double-tap state and add only the minimum assertions needed to prevent the
      corrected bug from returning.
- [x] Verify the no-second-truth boundary: no `imageData`/base64/Blob/IndexedDB write, no direct cache persistence, and
      all generation remains native-node or official-event delegation.
- [x] Add comments or log wording only where needed to keep the runtime behavior and documentation aligned.

## 4. Verify

- [x] Run
      `node --test src/寒冬末日/__tests__/sameLayerPreSource.test.js src/寒冬末日/same-layer-pre/界面/状态栏/__tests__/preGalleryImageRefs.test.js`.
- [x] Run component-token checks, the production build, and `git diff --check`.
- [x] Inspect generated churn and keep only the affected same-layer-pre distribution artifacts.

## 5. Commit and push

- [x] Review the worktree and remote divergence without discarding unrelated user changes.
- [x] Stage an explicit whitelist only; exclude `.tmp/**`, `.superpowers/**`, `pnpm-workspace.yaml`, `22252`, and
      unrelated `dist/**` churn.
- [x] Commit with a focused message; if remote advances, fetch/rebase, rerun tests/build, never force-push, push
      `20260211`, and verify `HEAD == origin/20260211`.

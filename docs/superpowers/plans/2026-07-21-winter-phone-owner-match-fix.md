# 寒冬小手机 Owner 校验修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 same-layer pre 使用真实寒冬角色名匹配 TavernPhone owner，使入口从“手机·不可用”恢复为“手机”。

**Architecture:** 保留现有三字段严格 owner 校验，只修正错误的角色名字面量及其测试夹具。通过真实中文 owner 的红绿测试证明修复，再单独构建 same-layer pre 产物并发布。

**Tech Stack:** TypeScript、Node test runner、Webpack、Vue 3。

## Global Constraints

- 精确角色名为 `末世寒冬 - 星穹秩序`。
- 保留 `adapterId: winter-apocalypse` 与 `runtimeMajor: 1` 校验。
- 不修改 UI 布局、小手机业务模块或宿主耦合边界。

---

### Task 1: 修复 owner 角色名并发布 pre UI

**Files:**
- Modify: `src/寒冬末日/__tests__/phoneBridge.test.ts`
- Modify: `src/寒冬末日/__tests__/winterPhoneSource.test.js`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/phoneBridge.ts`
- Modify: `dist/寒冬末日/same-layer-pre/界面/状态栏/index.html`
- Modify: `dist/寒冬末日/same-layer-pre/界面/状态栏/index.js.map`

**Interfaces:**
- Consumes: `PrePhoneRuntime.getOwner()` 返回的真实中文角色名。
- Produces: 匹配 owner 时 `PrePhoneBridge.getAvailability()` 返回 `available`。

- [ ] **Step 1: 将测试假运行时角色名改为 `末世寒冬 - 星穹秩序`，并断言桥接源码不含双反斜杠 `\\u672b`。**
- [ ] **Step 2: 运行 `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/phoneBridge.test.ts`，确认旧实现在 available 断言处失败。**
- [ ] **Step 3: 将 `EXPECTED_OWNER.characterName` 改为真实中文角色名，不改变另外两个校验字段。**
- [ ] **Step 4: 重新运行 phone bridge 与寒冬小手机测试，确认全部通过。**
- [ ] **Step 5: 使用 `$env:TAVERN_BUILD_PREFIXES='src/寒冬末日/same-layer-pre/界面/状态栏'; pnpm build` 生成限定范围的 production 产物。**
- [ ] **Step 6: 验证产物包含真实中文 owner 且不含双反斜杠 Unicode 字面量。**
- [ ] **Step 7: 提交后原子推送 `feature/winter-portable-phone` 与 `20260211`，随后刷新相关 CDN 路径并验证网络返回的新产物。**

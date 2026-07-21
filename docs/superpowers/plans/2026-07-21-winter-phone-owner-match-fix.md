# 寒冬小手机延迟 Owner 就绪修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 same-layer pre 在 TavernPhone 的 owner/session 延迟就绪后自动从“手机·不可用”恢复为可用。

**Architecture:** pre bridge 对已存在运行时始终监听 status，通过幂等的绑定函数在 owner/session 就绪时挂接宿主桥；失配或卸载时统一清理。保留三字段 owner 隔离。

**Tech Stack:** TypeScript、ts-node、Webpack、Vue 3。

## Global Constraints

- owner 精确匹配 `末世寒冬 - 星穹秩序`、`winter-apocalypse`、runtime major 1。
- 不修改 UI 布局、小手机业务模块或宿主输入框边界。
- host bridge、unread listener 和 detach 必须幂等。

---

### Task 1: 支持延迟 owner/session 绑定并发布 pre UI

**Files:**
- Modify: `src/寒冬末日/__tests__/phoneBridge.test.ts`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/phoneBridge.ts`
- Modify: `dist/寒冬末日/same-layer-pre/界面/状态栏/index.html`
- Modify: `dist/寒冬末日/same-layer-pre/界面/状态栏/index.js.map`

**Interfaces:**
- Consumes: `PrePhoneRuntime.on('status')`、`getOwner()`、`attachHostBridge()`。
- Produces: owner/session 延迟就绪后 `getAvailability()` 返回 `available`。

- [ ] **Step 1: 扩展 fake runtime，使 owner 与 session 可分阶段就绪；新增 unavailable → unavailable → available 的失败测试。**
- [ ] **Step 2: 运行现有 ts-node 命令，确认旧 bridge 在最终阶段仍为 unavailable。**
- [ ] **Step 3: 实现始终监听 status 的幂等绑定与清理函数。**
- [ ] **Step 4: 运行 phone bridge、寒冬源码契约和小手机相关测试。**
- [ ] **Step 5: 以 `TAVERN_BUILD_PREFIXES=src/寒冬末日/same-layer-pre/界面/状态栏` 运行 production build。**
- [ ] **Step 6: 验证产物、提交并原子推送 feature 分支与 `20260211`。**
- [ ] **Step 7: 刷新并重新请求 CDN 的 pre HTML、版本清单和 PNG，确认不再返回旧缓存。**
- [ ] **Step 8: 若普通分支 URL 仍被 testingcf 缓存，以测试驱动方式将 PNG 的两条生产 pre UI URL 规范为 `@refs/heads/20260211`，重新打包并验证 CDN 与本地产物一致。**

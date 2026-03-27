# 同层版模块拆分架构说明

**日期：** 2026-03-27
**状态：** 已落地（部分，Task 3 已完成，Task 4–5 待实现）
**关联计划：** `docs/superpowers/plans/2026-03-26-project-structure-remediation.md`

---

## 背景

`src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts` 是同层版的核心 composable，原文件超过 3700 行，集中了：

- 转写文本渲染（transcript HTML 构建）
- 开局流程纯函数（opening seed/result 判断、prompt 构建）
- 阅读器状态持久化（reader state hydration/persist）
- 画廊图片分组（gallery projection）
- 宿主事件响应和生命周期编排（orchestration）

这导致：

- 静态分析（tsc/eslint）难以精准定位问题
- 单个测试无法覆盖特定职责
- 新需求修改时影响面难以评估

---

## 已落地：Task 1–3

### Task 1 — ESLint 测试策略修正

在 `eslint.config.mjs` 中新增 `src/**/__tests__/**` 专用覆盖：

```js
{
  files: ['src/**/__tests__/**/*.{mjs,js,ts}'],
  rules: {
    'import-x/no-nodejs-modules': 'off',
  },
}
```

**原因：** `node:test` runner 使用 `import test from 'node:test'`，全局规则会误报；测试文件不需要 nodejs-modules 限制。
**影响：** 删除了两个测试文件中冗余的 `/* eslint-disable import-x/no-nodejs-modules */`。

### Task 2 — lint 卫生修复

| 文件 | 修复内容 |
|------|----------|
| `界面同层版/界面/状态栏/readerState.ts` | `catch {}` → `catch { // setVariable failure is non-fatal }` |
| `界面/store.ts` | 删除 7 处 unused `no-console` eslint-disable |
| `界面纯UI版/store.ts` | 同上（7 处） |
| `界面/状态栏/useShelterDailyRoll.ts` | 删除 4 处 unused eslint-disable |
| `界面纯UI版/状态栏/useShelterDailyRoll.ts` | 删除 4 处 unused eslint-disable |

**原因：** `no-console` 未在 ESLint 配置中启用，导致抑制指令全部误触发 `reportUnusedDisableDirectives`，掩盖真实错误信号。

### Task 3 — 从 useStreamingDemo 提取纯函数

#### 新模块：`useTranscriptRebuild.ts`

**职责：** 纯文本/HTML 渲染工具函数，无响应式依赖。

| 导出 | 说明 |
|------|------|
| `escapeHtml(input)` | HTML 特殊字符转义 |
| `encodeDataAttr(input)` | `data-*` 属性值编码 |
| `applyRegexForDisplay(text, role)` | 调用 SillyTavern regex 管道格式化显示文本 |
| `normalizeRoleLabel(role)` | 角色枚举 → 中文显示标签 |
| `sortTranscriptItems(items)` | 按 `message_id` 排序（不可变） |

#### 新模块：`useOpeningFlow.ts`

**职责：** 开局流程纯函数，无响应式依赖。

| 导出 | 说明 |
|------|------|
| `buildOpeningCompiledUserInput(preset, payload)` | 构建发送给 LLM 的开局用户输入 |
| `buildOpeningGenerateConfig(preset, payload)` | 构建 generate() 调用配置 |
| `buildOpeningAssistantText(payload)` | 从 payload 提取开局正文文本 |
| `isOpeningAssistantMessage(message)` | 判断是否是开局 assistant 楼层 |
| `isOpeningSeedMessage(message)` | 判断是否是开局 seed 楼层 |
| `buildOpeningTranscriptItem(payload, preset, status, buildFinalHtml, buildStreamStageHtml)` | 构建开局 TranscriptItem；HTML 构建器以参数注入避免循环依赖 |

**注意：** `buildOpeningTranscriptItem` 接受 `buildFinalHtml` 和 `buildStreamStageHtml` 作为参数，而非直接 import，原因是这两个函数依赖 `useStreamingDemo.ts` 内部的 `appendChatu8ArtifactsToHtml` 闭包，提取后保持依赖方向单向。

#### useStreamingDemo.ts 变更

- 删除了已提取的函数体（共约 100 行）
- 新增对 `useTranscriptRebuild` 和 `useOpeningFlow` 的 import
- 删除了 `buildOpeningGeneratePrompt` 的直接 import（现在只在 `useOpeningFlow` 内使用）

---

## 模块依赖关系（当前）

```
useStreamingDemo.ts
  ├── useTranscriptRebuild.ts   (纯函数，无响应式)
  ├── useOpeningFlow.ts         (纯函数，无响应式)
  │     └── useTranscriptRebuild.ts (applyRegexForDisplay)
  │     └── openingMessageFlags.ts
  ├── readerState.ts            (chat 变量 hydration/persist)
  ├── openingMessageFlags.ts    (opening seed/result flag 判断)
  ├── transcriptPagination.ts   (分页计算)
  └── ... (其余现有模块)
```

---

## 待落地：Task 4–5

### Task 4 — StoryPage.vue 拆分

计划提取：
- `useStoryPageShell.ts` — 全屏、viewport、shell 高度逻辑
- `useTranscriptInteractionBridge.ts` — transcript 双击、宿主 bridge、画廊 intent 接线

### Task 5 — 提取 core/ 子目录

计划将以下模块移入 `core/`：
- `readerState.ts`
- `openingMessageFlags.ts`
- `transcriptPagination.ts`

目的：明确「同层版专属」的阅读器核心逻辑边界，使这些模块不再与旧版 Demo 的相同名称文件产生混淆，同时为未来同层版独立开发提供清晰的引用路径。

---

## 验证基线

- `pnpm build` 成功（无新增错误）
- `node --experimental-strip-types __tests__/transcriptPagination.test.mjs` 全通过
- `node --experimental-strip-types __tests__/openingMessageFlags.test.mjs` 全通过
- `npx tsc --noEmit` 无新增错误（已有 `@types/function/` 和 `初始模板/` 错误为预存）

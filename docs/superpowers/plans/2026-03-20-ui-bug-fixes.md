# UI 待修复清单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 UI待修复清单_技术交接.txt 中 13 条问题的优先级，逐条修复 TranscriptList.vue / BottomComposer.vue / StoryPage.vue / useStreamingDemo.ts / index.ts 中的规范违规与布局 bug。

**Architecture:** 不拆分新文件，仅在现有组件内做局部改动。BUG-04（composable 拆分）工作量最大，单独作为最后一个大 Task 处理，优先保证高、中优先级的独立小 bug 先落地可验证。

**Tech Stack:** Vue 3, VueUse (`useThrottleFn`, `useTextareaAutosize`, `useBreakpoints`), TypeScript, scoped CSS

---

## File Map

| 文件 | 改动类型 |
|------|----------|
| `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue` | BUG-01 节流 / BUG-02 高度 / BUG-06 watch key / BUG-09 虚拟列表建议 |
| `src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue` | BUG-05 textarea autosize / BUG-11 断点统一 |
| `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue` | BUG-03 dvh / BUG-08 z-index 注释 / BUG-10 fullscreen 同步 / BUG-13 padding |
| `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts` | BUG-07 timer 统一清理 / BUG-04 拆分（最后处理）|
| `src/寒冬末日/界面同层版/界面/状态栏/index.ts` | BUG-12 jQuery 移除 |

---

## Task 1: BUG-01 — TranscriptList handleScroll 加节流

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue:136-141`

**背景：** 规范要求高频 scroll 回调必须用 `useThrottleFn`。当前 `handleScroll` 在每次原生 scroll 事件同步执行，对话长时会掉帧。

- [ ] **Step 1: 确认 VueUse 已引入**

```bash
grep -n 'from .@vueuse' src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue
```

- [ ] **Step 2: 修改 handleScroll，改为 useThrottleFn**

在 `<script setup>` 顶部 import 行补充 `useThrottleFn`（如果已有 `@vueuse/core` 导入则追加到同一行）：

```ts
import { useThrottleFn } from '@vueuse/core';
```

将原来的函数声明（约 136 行）：
```ts
function handleScroll() {
  const el = listRef.value;
  if (!el) return;
  emitScrollState(el);
  emit('reading-mode-change', isNearBottom(el) ? 'following_latest' : 'browsing_history');
}
```
替换为：
```ts
const handleScroll = useThrottleFn(() => {
  const el = listRef.value;
  if (!el) return;
  emitScrollState(el);
  emit('reading-mode-change', isNearBottom(el) ? 'following_latest' : 'browsing_history');
}, 80);
```

- [ ] **Step 3: 构建验证**

```bash
npx vite build --mode development 2>&1 | tail -20
```
期望：无 TypeScript 错误，build 成功。

- [ ] **Step 4: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue
git commit -m "fix(BUG-01): throttle handleScroll with useThrottleFn 80ms"
```

---

## Task 2: BUG-02 — TranscriptList transcript-scroller 去除硬编码高度

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue:262-263,339-340`

**背景：** 规范禁止用固定像素高度限制滚动区高度（会在 iframe 被宿主压缩时裁断布局）。父容器 `.ui-transcript-panel` 已是 `flex: 1 1 auto`，让 transcript-scroller 用 `flex: 1 1 0; min-height: 0; overflow: auto` 撑满父容器即可。

- [ ] **Step 1: 修改 .transcript-scroller CSS（桌面端）**

当前（约 262 行）：
```css
.transcript-scroller {
  max-height: 680px;
  overflow: auto;
  ...
}
```
改为（删除 `max-height: 680px`，改用 flex 撑满）：
```css
.transcript-scroller {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  ...
}
```
同时在 `.transcript-card` 上确保也是 flex 列方向（检查是否已有，如没有则添加）：
```css
.transcript-card {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  ...
}
```

- [ ] **Step 2: 修改移动端媒体查询（约 339 行）**

当前：
```css
@media (max-width: 760px) {
  .transcript-scroller {
    max-height: 560px;
    ...
  }
}
```
删除 `max-height: 560px` 一行（flex 已撑满，无需 max-height）。

- [ ] **Step 3: 构建验证**

```bash
npx vite build --mode development 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue
git commit -m "fix(BUG-02): remove hardcoded max-height on transcript-scroller, use flex stretch"
```

---

## Task 3: BUG-03 — StoryPage 替换 dvh 单位

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue:2264,2271,2304,2309`

**背景：** 规范禁止使用 `vh`/`dvh`（会受宿主高度影响导致 iframe 内容溢出或空白）。这几处都在移动端全屏或侧边栏的 `max-height`/`height` 上，改用父容器 flex 撑满（去掉限制），或改用固定 rem/百分比。

- [ ] **Step 1: 确认 4 处 dvh 位置**

```bash
grep -n 'dvh' src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue
```
期望输出 4 行（2264, 2271, 2304, 2309）。

- [ ] **Step 2: 替换各处**

**2264 行**（移动端抽屉 max-height）：
```css
/* 改前 */
max-height: calc(100dvh - 110px);
/* 改后：抽屉已 bottom:80px，用父容器剩余空间即可，改为固定上限 */
max-height: calc(100% - 30px);
```

**2271 行**（map 抽屉 max-height）：
```css
/* 改前 */
max-height: calc(100dvh - 96px);
/* 改后 */
max-height: calc(100% - 16px);
```

**2304 行**（移动端侧边栏 height）：
```css
/* 改前 */
height: min(calc(100dvh - 64px), 46rem);
/* 改后：sidebar 已 position:fixed/absolute，用视口百分比替代 dvh */
max-height: min(94%, 46rem);
height: auto;
```

**2309 行**（移动端侧边栏 max-height）：
```css
/* 改前 */
max-height: calc(100dvh - 64px);
/* 改后 */
max-height: 94%;
```

- [ ] **Step 3: 构建验证**

```bash
npx vite build --mode development 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue
git commit -m "fix(BUG-03): replace dvh units with percentage/rem in mobile layout"
```

---

## Task 4: BUG-05 — BottomComposer textarea 改用 useTextareaAutosize

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue`

**背景：** 规范要求多行文本输入优先使用 `useTextareaAutosize`。当前 textarea 固定 `rows="2"` 且 CSS 设了 `max-height: 48px`（移动端），无法自动随内容增高。

- [ ] **Step 1: 找到 textarea ref 和当前实现**

```bash
grep -n 'textarea\|rows\|ref' src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue | head -30
```

- [ ] **Step 2: 在 script setup 中添加 useTextareaAutosize**

在 import 区追加：
```ts
import { useTextareaAutosize } from '@vueuse/core';
```

添加 ref 和 autosize（在 `<script setup>` 适当位置）：
```ts
const composerTextareaRef = ref<HTMLTextAreaElement | null>(null);
useTextareaAutosize({ element: composerTextareaRef, input: () => props.modelValue ?? '' });
```

- [ ] **Step 3: 修改 template 中的 textarea**

当前：
```html
<textarea
  :value="modelValue"
  class="composer-textarea"
  rows="2"
  placeholder="AWAITING_COMMAND..."
  @input="onInput"
/>
```
改为（去掉 `rows`，绑定 ref）：
```html
<textarea
  ref="composerTextareaRef"
  :value="modelValue"
  class="composer-textarea"
  placeholder="AWAITING_COMMAND..."
  @input="onInput"
/>
```

- [ ] **Step 4: 调整 CSS min-height / max-height**

将 CSS 中 `composer-textarea` 的 `max-height` 改为合理上限（如 120px 桌面端，80px 移动端），并去除固定 `rows` 隐含的高度，改为 `min-height: 1.5em`：
```css
.composer-textarea {
  min-height: 1.5em;
  max-height: 120px;
  resize: none;
  overflow-y: auto;
  ...
}
/* 移动端 */
@media (max-width: 760px) {
  .composer-textarea {
    min-height: 1.5em;
    max-height: 80px;
  }
}
```

- [ ] **Step 5: 构建验证**

```bash
npx vite build --mode development 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue
git commit -m "fix(BUG-05): use useTextareaAutosize for composer textarea"
```

---

## Task 5: BUG-06 — TranscriptList watch 依赖键优化

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue:221-233`

**背景：** 当前 watch 每次对 `props.items` 用字符串拼接 `.map(...).join('|')` 构造依赖键，每次 tick 都会创建大量临时字符串，开销无谓。改用结构化 computed 对象数组（每项只包含关键字段）作为 watch source，Vue 内部做浅比较，减少不必要的字符串分配。

- [ ] **Step 1: 将 watch source 改为对象数组 computed**

当前（约 221 行）：
```ts
watch(
  () => props.items.map(item => `${item.message_id}:${item.phase}:${item.preview}:${item.content.length}`).join('|'),
  async () => { ... },
);
```
改为：
```ts
const itemsSignature = computed(() =>
  props.items.map(item => ({
    id: item.message_id,
    phase: item.phase,
    len: item.content.length,
  }))
);

watch(itemsSignature, async () => {
  await nextTick();
  const el = listRef.value;
  if (!el) return;
  if (props.shouldFollowLatest || isNearBottom(el)) {
    el.scrollTop = el.scrollHeight;
    emit('reading-mode-change', 'following_latest');
  }
  emitScrollState(el);
}, { deep: true });
```

- [ ] **Step 2: 构建验证**

```bash
npx vite build --mode development 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptList.vue
git commit -m "perf(BUG-06): replace string-join watch key with computed object array"
```

---

## Task 6: BUG-07 — useStreamingDemo.ts timer 统一清理

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts:2874-2910`

**背景：** `onBeforeUnmount` 中 5 个 timer 各自 `if(...) clearTimeout(...)` 重复模式。抽一个简单 helper 函数在同文件内统一处理，避免遗漏。不引入新文件，仅文件内部重构。

- [ ] **Step 1: 在 useStreamingDemo.ts 顶部（或 timer 变量声明附近）添加 helper**

找到 5 个 timer 变量的声明（用 grep 确认）：
```bash
grep -n 'hidePolicyTimer\|externalSyncTimer\|readerStatePersistTimer\|openingPayloadPersistTimer\|generatedImageDomMutationTimer' src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts | head -20
```

在这 5 个变量声明之后添加 helper（注意：helper 仅用于 onBeforeUnmount，不需要 export）：
```ts
function clearTimer(id: number): 0 {
  if (id) window.clearTimeout(id);
  return 0;
}
```

- [ ] **Step 2: 替换 onBeforeUnmount 中的 5 段手动清理**

当前（约 2885-2904 行）：
```ts
if (hidePolicyTimer) {
  window.clearTimeout(hidePolicyTimer);
  hidePolicyTimer = 0;
}
if (externalSyncTimer) {
  window.clearTimeout(externalSyncTimer);
  externalSyncTimer = 0;
}
if (readerStatePersistTimer) {
  window.clearTimeout(readerStatePersistTimer);
  readerStatePersistTimer = 0;
}
if (openingPayloadPersistTimer) {
  window.clearTimeout(openingPayloadPersistTimer);
  openingPayloadPersistTimer = 0;
}
if (generatedImageDomMutationTimer) {
  window.clearTimeout(generatedImageDomMutationTimer);
  generatedImageDomMutationTimer = 0;
}
```
改为：
```ts
hidePolicyTimer = clearTimer(hidePolicyTimer);
externalSyncTimer = clearTimer(externalSyncTimer);
readerStatePersistTimer = clearTimer(readerStatePersistTimer);
openingPayloadPersistTimer = clearTimer(openingPayloadPersistTimer);
generatedImageDomMutationTimer = clearTimer(generatedImageDomMutationTimer);
```

- [ ] **Step 3: 构建验证**

```bash
npx vite build --mode development 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts
git commit -m "refactor(BUG-07): unify timer cleanup with clearTimer helper"
```

---

## Task 7: BUG-08 — StoryPage z-index 添加注释层级表

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`（`<style>` 顶部）

**背景：** z-index 数值散落多处（1, 5, 16, 20, 24, 25, 30, 32, 2599, 2600），无统一说明容易维护时冲突。在 `<style scoped>` 顶部添加注释层级表，不改变任何数值。

- [ ] **Step 1: 在 `<style scoped>` 开头插入层级注释**

找到 `<style scoped>` 所在行：
```bash
grep -n '<style scoped>' src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue
```

在 `<style scoped>` 行之后、第一条规则之前插入：
```css
/*
 * Z-INDEX 层级表（本文件内）
 *   1      — ui-host-shell 基础层
 *   5      — ui-sidebar-mask 遮罩
 *  16      — ui-topbar（固定在顶）
 *  20      — ui-sidebar-toggle 按钮
 *  24      — ui-bottom-console-strip
 *  25      — ui-sidebar（侧边抽屉）/ ui-bottom-dock
 *  30      — 设置弹窗等 modal
 *  32      — 全屏时 modal 提升层
 * 2599    — ui-utility-mask（Teleport 到 body）
 * 2600    — ui-bottom-drawer（Teleport 到 body）
 */
```

- [ ] **Step 2: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue
git commit -m "docs(BUG-08): add z-index layer table comment in StoryPage style"
```

---

## Task 8: BUG-10 — StoryPage fullscreen 状态与原生 API 同步确认

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue:1399-1402`

**背景：** 检查 `fullscreenchange` 监听是否用 `useEventListener`（规范要求）且 `isFullscreen` 响应式状态是否与 `document.fullscreenElement` 完全同步。当前代码（约 1399 行）已用 `useEventListener(document, 'fullscreenchange', ...)` 并更新 `isFullscreen.value = !!document.fullscreenElement`，基本正确。但 `toggleFullscreen` 函数（约 601 行）自己切换时未等待原生事件确认就立刻写 `isFullscreen`，有轻微竞态——让状态完全由 `fullscreenchange` 事件驱动，去掉 `toggleFullscreen` 内的直接状态写入（如果有的话）。

- [ ] **Step 1: 读取 toggleFullscreen 完整实现**

```bash
sed -n '598,615p' src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue
```

- [ ] **Step 2: 确认状态驱动来源**

若 `toggleFullscreen` 内没有直接修改 `isFullscreen.value`（只是调用 `requestFullscreen`/`exitFullscreen`），则已正确——`isFullscreen` 仅由 `fullscreenchange` 事件驱动，此 Task 无需改动，直接跳到 commit 记录确认。

若有直接修改，则删除 `toggleFullscreen` 内的 `isFullscreen.value = ...` 赋值行，保留 `fullscreenchange` 监听器作为唯一数据源。

- [ ] **Step 3: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue
git commit -m "fix(BUG-10): ensure isFullscreen driven only by fullscreenchange event"
```

---

## Task 9: BUG-11 — BottomComposer 断点值统一

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue:165`

**背景：** `matchMedia('(max-width: 760px)')` 与 CSS 媒体查询 `@media (max-width: 760px)` 数值一致，暂无不一致风险。但硬编码魔法数字分散在 JS 和 CSS 两处，建议改用 `useBreakpoints` 或提取常量，避免日后改动 CSS 断点时遗漏 JS 端。

- [ ] **Step 1: 在 script setup 中用 useBreakpoints 替代 matchMedia**

在 import 区追加：
```ts
import { useBreakpoints } from '@vueuse/core';
```

在 `<script setup>` 适当位置添加：
```ts
const breakpoints = useBreakpoints({ mobile: 760 });
const isMobile = breakpoints.smallerOrEqual('mobile');
```

将原来（约 165 行）：
```ts
if (!window.matchMedia('(max-width: 760px)').matches) {
  choiceTextareaRef.value?.focus?.();
}
```
改为：
```ts
if (!isMobile.value) {
  choiceTextareaRef.value?.focus?.();
}
```

- [ ] **Step 2: 构建验证**

```bash
npx vite build --mode development 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue
git commit -m "fix(BUG-11): replace matchMedia with useBreakpoints to unify breakpoint source"
```

---

## Task 10: BUG-12 — index.ts 去除 jQuery 用于 Vue 挂载

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/index.ts`

**背景：** Vue 挂载逻辑使用 jQuery `$(() => {...})` 和 `$(window).on('pagehide', ...)` 混用，技术栈不一致。改为标准 DOM API。宿主 SillyTavern 的 jQuery 通信调用仍可保留，但 Vue 挂载本身不用 jQuery。

- [ ] **Step 1: 确认当前 index.ts 完整内容**

当前内容已知：
```ts
$(() => {
  const app = createApp(App);
  app.use(createPinia());
  app.mount('#app');
  $(window).on('pagehide', () => { app.unmount(); });
});
```

- [ ] **Step 2: 改为标准 DOM API**

```ts
document.addEventListener('DOMContentLoaded', () => {
  const app = createApp(App);
  app.use(createPinia());
  app.mount('#app');
  window.addEventListener('pagehide', () => { app.unmount(); });
});
```

> 注意：如果打包后 index.ts 已在 DOMContentLoaded 之后执行（webpack 默认 defer），可以直接去掉外层包裹：
> ```ts
> const app = createApp(App);
> app.use(createPinia());
> app.mount('#app');
> window.addEventListener('pagehide', () => { app.unmount(); });
> ```
> 验证打包配置后选择哪种形式。

- [ ] **Step 3: 构建验证**

```bash
npx vite build --mode development 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/index.ts
git commit -m "fix(BUG-12): replace jQuery mount wrapper with standard DOM API"
```

---

## Task 11: BUG-13 — StoryPage 移动端全屏 padding-right 补全

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue:2517-2520`

**背景：** 移动端全屏 `.ui-main-panel` 左侧 `padding-left: 22px`，右侧 `padding-right: 0` 不对称，右侧 [GALLERY] 按钮可能被内容遮挡。

- [ ] **Step 1: 修改 padding-right**

将（约 2517 行）：
```css
.ui-host-shell.is-fullscreen .ui-main-panel {
  padding-left: 22px;
  padding-right: 0;
}
```
改为：
```css
.ui-host-shell.is-fullscreen .ui-main-panel {
  padding-left: 22px;
  padding-right: 22px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue
git commit -m "fix(BUG-13): symmetric padding-right 22px in mobile fullscreen ui-main-panel"
```

---

## Task 12: BUG-09 — TranscriptList 虚拟列表（推荐项，可选）

评估：若对话条目通常 < 50 条，跳过；若需要支持 100+ 条：

- [ ] **Step 1: 引入 useVirtualList 并替换 v-for**

参考 https://vueuse.org/core/useVirtualList/ 实现，注意 containerProps 与现有 listRef 合并。

- [ ] **Step 2: Commit**

```bash
git commit -m "perf(BUG-09): useVirtualList for long transcript"
```

---

## Task 13: BUG-04 — useStreamingDemo.ts 拆分（单独排期）

2979 行 composable 职责过重，需先通读识别子域边界，再单独立项。

- [ ] **Step 1: 通读并识别子域**
- [ ] **Step 2: 用 brainstorming skill 制订拆分 spec，生成独立计划文档**
- [ ] **Step 3: 占位 commit**

```bash
git commit --allow-empty -m "plan(BUG-04): composable split deferred to separate plan"
```

---

## 执行顺序建议

| 顺序 | Task | BUG | 风险 |
|------|------|-----|------|
| 1 | Task 1 | BUG-01 handleScroll 节流 | 低 |
| 2 | Task 2 | BUG-02 transcript-scroller 高度 | 中 |
| 3 | Task 3 | BUG-03 dvh 单位 | 中 |
| 4 | Task 4 | BUG-05 textarea autosize | 低 |
| 5 | Task 5 | BUG-06 watch key | 低 |
| 6 | Task 6 | BUG-07 timer 清理 | 低 |
| 7 | Task 7 | BUG-08 z-index 注释 | 极低 |
| 8 | Task 8 | BUG-10 fullscreen 同步 | 低 |
| 9 | Task 9 | BUG-11 断点统一 | 低 |
| 10 | Task 10 | BUG-12 jQuery 移除 | 低 |
| 11 | Task 11 | BUG-13 padding 对称 | 极低 |
| 12 | Task 12 | BUG-09 虚拟列表 | 高（可选）|
| 13 | Task 13 | BUG-04 composable 拆分 | 极高（单独排期）|

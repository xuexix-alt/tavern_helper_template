# 同层版刷新域对齐 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `src/寒冬末日/界面同层版` 的正文区、左侧 MVU 变量区、右侧图廊按统一刷新域工作，并去掉左侧变量区对 `latest` 的回退显示。

**Architecture:** 保留现有 `useStreamingDemo.ts + mvuRoleStore.ts + StoryPage.vue` 的主体结构，不做激进重构。新增小而纯的“刷新域判断”和“MVU 来源枚举”辅助模块，把原来散落的刷新决策收口，同时保留 `st-chatu8` 作为图片生成与原生图片交互的唯一真实执行者。

**Tech Stack:** TypeScript, Vue 3, Pinia, Lodash, Zod, VueUse, Node + `ts-node/register/transpile-only`

---

## Runtime Constraint

- 同层版运行在酒馆 iframe 中，关闭酒馆和切换聊天都会触发 iframe 重载。
- 所有实现必须接受“iframe 整体重挂载”是正常机制，不能依赖内存态持续存在。
- 恢复逻辑优先依赖聊天记录、MVU 数据和已持久化的 reader chat state。

## File Structure

- Modify: `docs/前端接入插件的说明.txt`
  责任：补充同层版接 `st-chatu8` 的图片链说明，明确 UI 只是代理与收集器。
- Create: `src/寒冬末日/界面同层版/界面/状态栏/refreshDomains.ts`
  责任：统一定义刷新域、事件到刷新域的映射、去重与调度输入结构。
- Create: `src/寒冬末日/界面同层版/界面/状态栏/mvuSourceOptions.ts`
  责任：纯函数化计算“哪些楼层可作为变量来源”，只保留确认有 `stat_data` 的楼层。
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/mvuRoleStore.ts`
  责任：去掉目标楼层失败时对 `latest` 的回退，改成空态和保守重试。
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/MvuRolePanel.vue`
  责任：接入新的来源枚举逻辑，明确展示“第几项/总共几项/是否最新/空态”。
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
  责任：把消息事件、MVU 事件、图片事件映射到 `transcript / mvuSources / roleSidebar / gallery` 四个刷新域。
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
  责任：保持双击正文、图廊图片单击/双击代理回原宿主楼层的逻辑，并与新的图廊刷新规则对齐。
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/galleryCache.ts`
  责任：必要时补充按 `messageId / requestId / promptToken / imageSrc` 采集与匹配所需的小修正。
- Test: `scripts/test-gallery-cache-structure.js`
  责任：继续兜底图片缓存结构兼容。
- Test: `scripts/test-no-raw-prompt-writeback.js`
  责任：继续保证 prompt token 不会回写污染正文。
- Create: `scripts/test-mvu-source-options.js`
  责任：验证“只列出可读 `stat_data` 楼层”和“不回退 latest”。
- Create: `scripts/test-refresh-domains.js`
  责任：验证“事件 -> 刷新域”的决策矩阵。

## Chunk 1: 左侧 MVU 来源楼层去回退并纯函数化

### Task 1: 为 MVU 来源楼层枚举提取纯函数

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/mvuSourceOptions.ts`
- Test: `scripts/test-mvu-source-options.js`

- [ ] **Step 1: 写失败测试，锁定来源楼层只展示可读 `stat_data` 的行为**

```js
require('ts-node/register/transpile-only');

const { buildMvuSourceOptions } = require('../src/寒冬末日/界面同层版/界面/状态栏/mvuSourceOptions.ts');

const transcript = [
  { message_id: 0, role: 'assistant', isOpening: true },
  { message_id: 1, role: 'assistant', isOpening: false },
  { message_id: 2, role: 'assistant', isOpening: false },
];

const readable = new Set([0, 2]);
const options = buildMvuSourceOptions({
  transcriptItems: transcript,
  targetMessageId: null,
  hasStatData(messageId) {
    return readable.has(messageId);
  },
});

if (options.map(item => item.targetMessageId).join(',') !== '2,0') {
  throw new Error(`unexpected source options: ${JSON.stringify(options)}`);
}
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run: `node scripts/test-mvu-source-options.js`
Expected: FAIL with module or function missing error

- [ ] **Step 3: 写最小实现**

```ts
export type MvuSourceOption = {
  key: string;
  label: string;
  pillLabel: string;
  targetMessageId: number;
  sortId: number;
  isLatest: boolean;
};

export function buildMvuSourceOptions(...) {
  // 仅返回确认 hasStatData(messageId) === true 的 assistant/opening 楼层
}
```

- [ ] **Step 4: 重新运行测试，确认通过**

Run: `node scripts/test-mvu-source-options.js`
Expected: `mvu source options test passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/test-mvu-source-options.js src/寒冬末日/界面同层版/界面/状态栏/mvuSourceOptions.ts
git commit -m "test: cover mvu source option filtering"
```

### Task 2: 去掉 `mvuRoleStore` 对 `latest` 的回退

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/mvuRoleStore.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/components/MvuRolePanel.vue`
- Test: `scripts/test-mvu-source-options.js`

- [ ] **Step 1: 先补一个失败断言，证明读取失败时不应回退 `latest`**

```js
const fallback = resolveMvuSnapshot({
  target: 5,
  current: { ok: false },
  latest: { ok: true, data: { 慕小小: {} }, messageId: 9 },
  ready: false,
  source: 'default',
  resolvedMessageId: 'latest',
  extraAnalysis: false,
});

if (fallback.mode !== 'empty') {
  throw new Error(`expected empty mode, got ${fallback.mode}`);
}
```

- [ ] **Step 2: 运行测试，确认它失败在旧回退逻辑上**

Run: `node scripts/test-mvu-source-options.js`
Expected: FAIL because logic still returns fallback/latest semantics

- [ ] **Step 3: 在 `mvuRoleStore.ts` 实现最小改动**

```ts
if (current.ok) {
  // 保持当前楼层成功快照
} else if (extraAnalysis && ready.value) {
  // 只做短暂重试，不回退展示 latest
} else {
  data.value = initialData;
  source.value = 'default';
  ready.value = false;
}
```

- [ ] **Step 4: 在 `MvuRolePanel.vue` 接入 `buildMvuSourceOptions` 并明确空态文案**

```ts
const sourceOptions = computed(() =>
  buildMvuSourceOptions({
    transcriptItems: props.transcriptItems ?? [],
    targetMessageId: normalizedTargetMessageId.value,
    hasStatData(messageId) {
      return readMvuStatData(messageId).ok;
    },
  }),
);
```

- [ ] **Step 5: 重新运行测试，确认通过**

Run: `node scripts/test-mvu-source-options.js`
Expected: `mvu source options test passed`

- [ ] **Step 6: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/mvuRoleStore.ts src/寒冬末日/界面同层版/界面/状态栏/components/MvuRolePanel.vue src/寒冬末日/界面同层版/界面/状态栏/mvuSourceOptions.ts scripts/test-mvu-source-options.js
git commit -m "feat: remove latest fallback from mvu sidebar"
```

## Chunk 2: 统一刷新域并对齐消息/MVU/图片链

### Task 3: 提取刷新域决策模块

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/refreshDomains.ts`
- Test: `scripts/test-refresh-domains.js`

- [ ] **Step 1: 写失败测试，锁定事件到刷新域的矩阵**

```js
require('ts-node/register/transpile-only');

const { resolveRefreshDomainsForEvent } = require('../src/寒冬末日/界面同层版/界面/状态栏/refreshDomains.ts');

const result = resolveRefreshDomainsForEvent({
  type: 'mvu.variable_update_ended',
  messageId: 12,
  selectedSourceMessageId: 12,
  affectsTranscript: true,
});

const expected = ['mvuSources', 'roleSidebar', 'transcript'];
if (JSON.stringify(result) !== JSON.stringify(expected)) {
  throw new Error(`unexpected domains: ${JSON.stringify(result)}`);
}
```

- [ ] **Step 2: 运行测试，确认先失败**

Run: `node scripts/test-refresh-domains.js`
Expected: FAIL with module or function missing error

- [ ] **Step 3: 写最小实现**

```ts
export type RefreshDomain = 'transcript' | 'mvuSources' | 'roleSidebar' | 'gallery';

export function resolveRefreshDomainsForEvent(input: ...) {
  // 按 spec 固定返回去重后的刷新域数组
}
```

- [ ] **Step 4: 重新运行测试，确认通过**

Run: `node scripts/test-refresh-domains.js`
Expected: `refresh domains test passed`

- [ ] **Step 5: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/refreshDomains.ts scripts/test-refresh-domains.js
git commit -m "test: cover samelayer refresh domain mapping"
```

### Task 4: 在 `useStreamingDemo.ts` 收口刷新入口

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Test: `scripts/test-refresh-domains.js`

- [ ] **Step 1: 先把现有分散刷新入口列成注释或小表，避免直接硬改**

```ts
// rebuildTranscript -> transcript
// queuePersistDisplayedImagePrompts -> gallery persistence trigger
// queueHidePolicy -> host visibility / hidden sync
// queueExternalSync -> current broad sync path to be narrowed
```

- [ ] **Step 2: 新增统一入口 `scheduleUiRefresh(domains, reason, payload?)`**

```ts
function scheduleUiRefresh(domains: RefreshDomain[], reason: string) {
  if (domains.includes('transcript')) rebuildTranscript();
  if (domains.includes('gallery')) queuePersistDisplayedImagePrompts(reason);
  if (domains.includes('mvuSources') || domains.includes('roleSidebar')) {
    mvuRefreshRevision.value += 1;
  }
  queueHidePolicy(`refresh:${reason}`);
}
```

- [ ] **Step 3: 用刷新域替换 `handleHostRefreshEvent` 的“无差别外部同步”**

```ts
function handleHostRefreshEvent(name: string) {
  const domains = resolveRefreshDomainsForEvent(...);
  scheduleUiRefresh(domains, `event:${name}`);
}
```

- [ ] **Step 4: 保留“不跳最新”的规则**

```ts
if (name === tavern_events.GENERATION_STARTED || name === tavern_events.STREAM_TOKEN_RECEIVED) {
  // 允许更新状态，但不得因为刷新域调度强制切 latest
}
```

- [ ] **Step 5: 运行测试确认刷新域模块仍通过**

Run: `node scripts/test-refresh-domains.js`
Expected: `refresh domains test passed`

- [ ] **Step 6: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts src/寒冬末日/界面同层版/界面/状态栏/refreshDomains.ts scripts/test-refresh-domains.js
git commit -m "feat: align samelayer refresh scheduling"
```

## Chunk 3: 保留 st-chatu8 原图片链并把图廊收成收集器

### Task 5: 对齐图片代理与图廊收集逻辑

**Files:**
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/galleryCache.ts`
- Test: `scripts/test-gallery-cache-structure.js`
- Test: `scripts/test-no-raw-prompt-writeback.js`

- [ ] **Step 1: 先写一个最小失败断言，锁定“图廊只是收集器”的匹配顺序**

```js
const target = resolveImageMatchCandidate({
  requestId: 'req-1',
  promptToken: 'image###测试###',
  imageSrc: 'data:image/png;base64,abc',
  hostEntries: [...],
});

if (target.via !== 'requestId') {
  throw new Error(`expected requestId match first, got ${target.via}`);
}
```

- [ ] **Step 2: 运行相关测试，确认至少有一项先失败**

Run: `node scripts/test-gallery-cache-structure.js`
Expected: PASS or FAIL depending on current state

Run: `node scripts/test-no-raw-prompt-writeback.js`
Expected: PASS or FAIL depending on current state

If both already pass, add a new failing assertion to the image matching test script before changing production code.

- [ ] **Step 3: 最小实现图片链对齐**

```ts
// StoryPage.vue
// 保持双击正文 -> 宿主消息节点
// 保持图廊单击/双击 -> 宿主图片或按钮节点

// useStreamingDemo.ts
// 图片落盘后只刷新对应 messageId 的 transcript/gallery 采集，不引入新的图片真源
```

- [ ] **Step 4: 运行图片相关测试**

Run: `node scripts/test-gallery-cache-structure.js`
Expected: `gallery cache structure test passed`

Run: `node scripts/test-no-raw-prompt-writeback.js`
Expected: `no raw prompt writeback test passed`

- [ ] **Step 5: Commit**

```bash
git add src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts src/寒冬末日/界面同层版/界面/状态栏/galleryCache.ts scripts/test-gallery-cache-structure.js scripts/test-no-raw-prompt-writeback.js
git commit -m "feat: keep st-chatu8 image flow as source of truth"
```

## Final Verification

- [ ] **Step 1: 运行聚焦脚本测试**

Run: `node scripts/test-mvu-source-options.js`
Expected: `mvu source options test passed`

Run: `node scripts/test-refresh-domains.js`
Expected: `refresh domains test passed`

Run: `node scripts/test-gallery-cache-structure.js`
Expected: `gallery cache structure test passed`

Run: `node scripts/test-no-raw-prompt-writeback.js`
Expected: `no raw prompt writeback test passed`

- [ ] **Step 2: 运行类型/构建验证**

Run: `pnpm build`
Expected: exit code `0`

- [ ] **Step 3: 运行静态检查**

Run: `pnpm lint src/寒冬末日/界面同层版/界面/状态栏 src/寒冬末日/mvu_reprocess.ts`
Expected: exit code `0`

- [ ] **Step 4: 手工链路回归检查**

1. 首次加载同层版，确认只在首次进入时回到最新。
2. 浏览旧楼层时触发新生成，确认正文不被强制切回最新。
3. 左侧切到无 `stat_data` 楼层，确认显示空态，不回退 `latest`。
4. 主 AI 带变量指令生成后，确认左侧来源楼层列表更新，但正文不跳底。
5. 额外模型解析写回变量指令后，确认左侧来源楼层与当前目标楼层数据准确。
6. 双击正文触发生图，确认动作回到宿主楼层原节点。
7. 单击图廊图片，确认仍查看同 `mes` 文本的其他图。
8. 双击图廊图片，确认走原链路重生。

- [ ] **Step 5: Final commit**

```bash
git add docs/前端接入插件的说明.txt docs/superpowers/specs/2026-03-16-samelayer-refresh-alignment-design.md docs/superpowers/plans/2026-03-16-samelayer-refresh-alignment.md
git commit -m "docs: plan samelayer refresh alignment"
```

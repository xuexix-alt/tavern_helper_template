# 小手机聊天渲染修复实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复小手机响应式 APP 桌面与中心化 renderer 链路，并提供从 `stat_data` 根键显式创建私聊/群聊的完整界面。

**Architecture:** 将 renderer 生命周期提取为无 DOM 的 `PhoneAppController`，由小手机主程序注入 Vue 调度器、容器和显示回调；聊天 APP 只注册组件。宏解析、会话创建决策和 ChatDB 分区快照分别放在纯逻辑模块中，用 Node 测试完成红绿循环，再接入现有脚本入口。

**Tech Stack:** TypeScript、Vue 3 渲染函数、IndexedDB、`yaml`、Node `node:test`、`ts-node/register/transpile-only`、webpack。

**Workspace note:** `src/小手机/` 是当前工作区未跟踪的用户源码，独立 worktree 无法携带这份源状态。本计划在当前工作区实施，只暂存和提交小手机源码、对应测试及本计划，不碰其他脏文件。

**Execution precondition:** 本计划在开始 Chunk 1 前以显式路径单独提交；执行者先用 `git cat-file -e "HEAD:docs/superpowers/plans/2026-07-21-phone-chat-renderer-repair.md"` 证明 reviewed plan 已进入 HEAD。规格已在 `a18aba7b`。计划提交不包含任何源码或用户脏文件。

---

## Chunk 1: PhoneSystem 响应式桌面与 renderer 状态机

### Task 1: 定义控制器 API，并先验证打开与晚注册

**Files:**
- Create: `src/小手机/脚本/小手机主程序/phoneAppController.ts`
- Create: `src/小手机/脚本/__tests__/phoneAppController.test.js`

- [ ] **Step 1: 写第一组完整失败测试**

创建测试文件，公共夹具固定为：

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPhoneAppController } = require('../小手机主程序/phoneAppController.ts');

function createHarness() {
  const scheduled = [];
  const containers = new Map();
  const placeholders = [];
  const errors = [];
  const logs = [];
  const current = { value: null };
  const visible = { count: 0 };
  const registered = new Set(['chat-app', 'weather-app']);
  const vue = { createApp() {} };

  const makeContainer = id => {
    const container = { id, isConnected: true, innerHTML: '' };
    containers.set(id, container);
    return container;
  };
  makeContainer('chat-app');
  makeContainer('weather-app');

  const controller = createPhoneAppController({
    vue,
    scheduleMount: run => scheduled.push(run),
    getContainer: id => containers.get(id) ?? null,
    ensurePhoneVisible: () => { visible.count += 1; },
    isRegisteredApp: id => registered.has(id),
    setCurrentApp: id => { current.value = id; },
    showPlaceholder: (container, message) => placeholders.push([container.id, message]),
    showError: (container, error) => errors.push([container.id, String(error?.message || error)]),
    logError: error => logs.push(String(error?.message || error)),
  });

  const flushOne = () => {
    const run = scheduled.shift();
    assert.ok(run, 'expected one scheduled mount');
    run();
  };
  const flushAll = () => {
    while (scheduled.length) scheduled.shift()();
  };

  return { controller, scheduled, containers, placeholders, errors, logs, current, visible, registered, flushOne, flushAll };
}

test('openApp mounts a renderer registered before opening', () => {
  const h = createHarness();
  let mounted = 0;
  h.controller.registerRenderer('chat-app', ({ container, vue }) => {
    assert.equal(container.id, 'chat-app');
    assert.ok(vue.createApp);
    mounted += 1;
  });
  assert.equal(h.controller.openApp('chat-app'), true);
  assert.equal(h.current.value, 'chat-app');
  assert.equal(h.visible.count, 1);
  h.flushOne();
  assert.equal(mounted, 1);
});

test('late renderer registration mounts the already displayed app', () => {
  const h = createHarness();
  assert.equal(h.controller.openApp('chat-app'), true);
  h.flushOne();
  assert.deepEqual(h.placeholders, [['chat-app', 'APP 尚未就绪']]);
  let mounted = 0;
  h.controller.registerRenderer('chat-app', () => { mounted += 1; });
  h.flushOne();
  assert.equal(mounted, 1);
});

test('openApp rejects an unregistered app without changing state', () => {
  const h = createHarness();
  assert.equal(h.controller.openApp('missing-app'), false);
  assert.equal(h.current.value, null);
  assert.equal(h.scheduled.length, 0);
});
```

- [ ] **Step 2: 运行第一组测试并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/phoneAppController.test.js"
```

Expected: FAIL，在加载测试文件时明确报告找不到 `phoneAppController.ts`；三个命名用例尚未通过。

- [ ] **Step 3: 写最小但完整的控制器接口与打开路径**

`phoneAppController.ts` 先写完整公开类型，保持 `vue` 的类型安全：

```ts
import type * as VueRuntime from 'vue';

export interface PhoneRendererContext {
  container: HTMLElement;
  vue: typeof VueRuntime;
}
export type PhoneAppCleanup = () => void;
export type PhoneAppRenderer = (context: PhoneRendererContext) => void | PhoneAppCleanup;

export interface PhoneAppControllerDeps {
  vue: typeof VueRuntime;
  scheduleMount(run: () => void): void;
  getContainer(appId: string): HTMLElement | null;
  ensurePhoneVisible(): void;
  isRegisteredApp(appId: string): boolean;
  setCurrentApp(appId: string | null): void;
  showPlaceholder(container: HTMLElement, message: string): void;
  showError(container: HTMLElement, error: unknown): void;
  logError(error: unknown): void;
}

export interface PhoneAppController {
  registerRenderer(appId: string, renderer: PhoneAppRenderer): void;
  unregisterRenderer(appId: string): void;
  openApp(appId: string): boolean;
  goHome(): void;
  refreshCurrent(): void;
  destroy(): void;
  getCurrentAppId(): string | null;
}
```

先实现只满足前三项测试的完整 factory；所有公开方法均可调用，但 cleanup/替换/异常增强留到下一个红绿循环：

```ts
export function createPhoneAppController(deps: PhoneAppControllerDeps): PhoneAppController {
  const renderers = new Map<string, PhoneAppRenderer>();
  let currentAppId: string | null = null;
  let activeRenderer: PhoneAppRenderer | null = null;
  let activeCleanup: PhoneAppCleanup | null = null;
  let mountGeneration = 0;
  let destroyed = false;

  const scheduleCurrentMount = () => {
    const generation = ++mountGeneration;
    const appId = currentAppId;
    const renderer = appId ? renderers.get(appId) : undefined;
    deps.scheduleMount(() => {
      if (destroyed || generation !== mountGeneration || !appId || appId !== currentAppId) return;
      const container = deps.getContainer(appId);
      if (!container || !container.isConnected) return;
      if (!renderer || renderer !== renderers.get(appId)) {
        deps.showPlaceholder(container, 'APP 尚未就绪');
        return;
      }
      activeRenderer = renderer;
      activeCleanup = renderer({ container, vue: deps.vue }) || null;
    });
  };

  return {
    registerRenderer(appId, renderer) {
      renderers.set(appId, renderer);
      if (!destroyed && currentAppId === appId) scheduleCurrentMount();
    },
    unregisterRenderer(appId) {
      renderers.delete(appId);
    },
    openApp(appId) {
      if (destroyed || !deps.isRegisteredApp(appId)) return false;
      deps.ensurePhoneVisible();
      if (currentAppId === appId && activeRenderer === renderers.get(appId)) return true;
      currentAppId = appId;
      deps.setCurrentApp(appId);
      scheduleCurrentMount();
      return true;
    },
    goHome() {
      currentAppId = null;
      deps.setCurrentApp(null);
    },
    refreshCurrent() {
      if (!destroyed && currentAppId !== null) scheduleCurrentMount();
    },
    destroy() {
      destroyed = true;
      mountGeneration += 1;
      currentAppId = null;
      deps.setCurrentApp(null);
      renderers.clear();
      activeRenderer = null;
      activeCleanup = null;
    },
    getCurrentAppId: () => currentAppId,
  };
}
```

- [ ] **Step 4: 运行第一组测试并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/phoneAppController.test.js"
```

Expected: 3 tests PASS，0 failures。

### Task 2: 完成替换、导航、失效和错误状态机

**Files:**
- Modify: `src/小手机/脚本/__tests__/phoneAppController.test.js`
- Modify: `src/小手机/脚本/小手机主程序/phoneAppController.ts`

- [ ] **Step 1: 追加第二组失败测试**

使用同一 `createHarness()`，逐个追加命名测试及精确断言：

```js
test('replacement cleans the old renderer once before mounting the new renderer', () => {
  const h = createHarness();
  const calls = [];
  h.controller.registerRenderer('chat-app', () => {
    calls.push('mount-old');
    return () => calls.push('clean-old');
  });
  h.controller.openApp('chat-app');
  h.flushOne();
  h.controller.registerRenderer('chat-app', () => { calls.push('mount-new'); });
  assert.deepEqual(calls, ['mount-old', 'clean-old']);
  h.flushOne();
  assert.deepEqual(calls, ['mount-old', 'clean-old', 'mount-new']);
});

test('registering the same renderer function again still replaces the visible instance', () => {
  const h = createHarness();
  let mounts = 0;
  let cleans = 0;
  const renderer = () => { mounts += 1; return () => { cleans += 1; }; };
  h.controller.registerRenderer('chat-app', renderer);
  h.controller.openApp('chat-app');
  h.flushOne();
  h.controller.registerRenderer('chat-app', renderer);
  h.flushOne();
  assert.equal(mounts, 2);
  assert.equal(cleans, 1);
});

test('refreshCurrent mounts after the phone shell creates its container', () => {
  const h = createHarness();
  h.containers.delete('chat-app');
  let mounted = 0;
  h.controller.registerRenderer('chat-app', () => { mounted += 1; });
  h.controller.openApp('chat-app');
  h.flushOne();
  assert.equal(mounted, 0);
  h.containers.set('chat-app', { id: 'chat-app', isConnected: true, innerHTML: '' });
  h.controller.refreshCurrent();
  h.flushOne();
  assert.equal(mounted, 1);
});

test('unregistering the visible renderer cleans once and shows not-ready placeholder', () => {
  const h = createHarness();
  let cleaned = 0;
  h.controller.registerRenderer('chat-app', () => () => { cleaned += 1; });
  h.controller.openApp('chat-app');
  h.flushOne();
  h.controller.unregisterRenderer('chat-app');
  h.flushOne();
  assert.equal(cleaned, 1);
  assert.equal(h.current.value, 'chat-app');
  assert.deepEqual(h.placeholders.at(-1), ['chat-app', 'APP 尚未就绪']);
});

test('switching apps invalidates a stale scheduled mount and cleans the active app once', () => {
  const h = createHarness();
  const calls = [];
  h.controller.registerRenderer('chat-app', () => { calls.push('chat'); return () => calls.push('clean-chat'); });
  h.controller.registerRenderer('weather-app', () => { calls.push('weather'); });
  h.controller.openApp('chat-app');
  h.controller.openApp('weather-app');
  h.flushAll();
  assert.deepEqual(calls, ['weather']);
  h.controller.openApp('chat-app');
  h.flushOne();
  h.controller.openApp('weather-app');
  assert.deepEqual(calls, ['weather', 'chat', 'clean-chat']);
});

test('reopening the active app preserves its mounted instance', () => {
  const h = createHarness();
  let mounts = 0;
  h.controller.registerRenderer('chat-app', () => { mounts += 1; });
  h.controller.openApp('chat-app');
  h.flushOne();
  h.controller.openApp('chat-app');
  assert.equal(h.scheduled.length, 0);
  assert.equal(mounts, 1);
  assert.equal(h.visible.count, 2);
});

test('goHome and destroy each clean an active instance at most once', () => {
  const h = createHarness();
  let cleaned = 0;
  h.controller.registerRenderer('chat-app', () => () => { cleaned += 1; });
  h.controller.openApp('chat-app');
  h.flushOne();
  h.controller.goHome();
  h.controller.goHome();
  h.controller.destroy();
  assert.equal(cleaned, 1);
  assert.equal(h.current.value, null);
});

test('destroy invalidates scheduled mounts', () => {
  const h = createHarness();
  let mounted = 0;
  h.controller.registerRenderer('chat-app', () => { mounted += 1; });
  h.controller.openApp('chat-app');
  h.controller.destroy();
  h.flushAll();
  assert.equal(mounted, 0);
});

test('renderer failures clear content and show a visible error', () => {
  const h = createHarness();
  const container = h.containers.get('chat-app');
  container.innerHTML = 'partial';
  h.controller.registerRenderer('chat-app', () => { throw new Error('mount failed'); });
  h.controller.openApp('chat-app');
  h.flushOne();
  assert.equal(container.innerHTML, '');
  assert.deepEqual(h.errors, [['chat-app', 'mount failed']]);
});

test('cleanup failures are logged and do not block navigation', () => {
  const h = createHarness();
  h.controller.registerRenderer('chat-app', () => () => { throw new Error('cleanup failed'); });
  h.controller.openApp('chat-app');
  h.flushOne();
  h.controller.goHome();
  assert.equal(h.current.value, null);
  assert.deepEqual(h.logs, ['cleanup failed']);
});
```

- [ ] **Step 2: 运行第二组测试并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/phoneAppController.test.js"
```

Expected: 原 3 项 PASS。十个新增用例中，`replacement...`、`registering the same renderer...`、`unregistering...`、`switching...`、`goHome...`、`renderer failures...`、`cleanup failures...` 明确 FAIL，因为最小 factory 尚未 cleanup/捕获异常；`refreshCurrent...`、`destroy invalidates...`、`reopening...` 已经 PASS。不得以加载或语法错误作为 RED。

- [ ] **Step 3: 完成控制器状态机**

实现以下精确流程：

```ts
function runCleanup(): void {
  const cleanup = activeCleanup;
  activeCleanup = null;
  activeRenderer = null;
  if (!cleanup) return;
  try { cleanup(); } catch (error) { deps.logError(error); }
}

function invalidateMount(): number {
  mountGeneration += 1;
  return mountGeneration;
}

function scheduleCurrentMount(): void {
  const generation = invalidateMount();
  const appId = currentAppId;
  const renderer = appId ? renderers.get(appId) : undefined;
  deps.scheduleMount(() => {
    if (destroyed || generation !== mountGeneration || !appId || appId !== currentAppId) return;
    const container = deps.getContainer(appId);
    if (!container || !container.isConnected) return;
    if (!renderer || renderer !== renderers.get(appId)) {
      deps.showPlaceholder(container, 'APP 尚未就绪');
      return;
    }
    try {
      const cleanup = renderer({ container, vue: deps.vue });
      if (destroyed || generation !== mountGeneration || appId !== currentAppId || renderer !== renderers.get(appId)) {
        try { cleanup?.(); } catch (error) { deps.logError(error); }
        return;
      }
      activeRenderer = renderer;
      activeCleanup = cleanup || null;
    } catch (error) {
      container.innerHTML = '';
      deps.showError(container, error);
    }
  });
}
```

将 factory 的返回对象替换为以下完整方法；`scheduleCurrentMount()` 使用上面的完整版本：

```ts
const replaceVisibleRenderer = (appId: string) => {
  if (currentAppId !== appId || destroyed) return;
  invalidateMount();
  runCleanup();
  scheduleCurrentMount();
};

return {
  registerRenderer(appId, renderer) {
    renderers.set(appId, renderer);
    replaceVisibleRenderer(appId);
  },
  unregisterRenderer(appId) {
    if (!renderers.delete(appId)) return;
    replaceVisibleRenderer(appId);
  },
  openApp(appId) {
    if (destroyed || !deps.isRegisteredApp(appId)) return false;
    deps.ensurePhoneVisible();
    if (currentAppId === appId && activeRenderer === renderers.get(appId)) return true;
    invalidateMount();
    runCleanup();
    currentAppId = appId;
    deps.setCurrentApp(appId);
    scheduleCurrentMount();
    return true;
  },
  goHome() {
    if (destroyed || currentAppId === null) return;
    invalidateMount();
    runCleanup();
    currentAppId = null;
    deps.setCurrentApp(null);
  },
  refreshCurrent() {
    if (!destroyed && currentAppId !== null) scheduleCurrentMount();
  },
  destroy() {
    if (destroyed) return;
    destroyed = true;
    invalidateMount();
    runCleanup();
    renderers.clear();
    currentAppId = null;
    deps.setCurrentApp(null);
  },
  getCurrentAppId: () => currentAppId,
};
```

- [ ] **Step 4: 运行完整控制器测试并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/phoneAppController.test.js"
```

Expected: 13 tests PASS，0 failures。

### Task 3: 响应式 APP 元数据注册表

**Files:**
- Create: `src/小手机/脚本/小手机主程序/phoneAppRegistry.ts`
- Create: `src/小手机/脚本/__tests__/phoneAppRegistry.test.js`

- [ ] **Step 1: 写完整失败测试**

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { reactive, effect } = require('vue');
const { upsertPhoneApp } = require('../小手机主程序/phoneAppRegistry.ts');

test('upsertPhoneApp adds, sorts, and replaces metadata without duplicate icons', () => {
  const apps = reactive([]);
  let observed = [];
  effect(() => { observed = apps.map(app => app.name); });
  upsertPhoneApp(apps, { id: 'weather', name: '天气', icon: '☀️', color: '#09f', order: 2 });
  upsertPhoneApp(apps, { id: 'chat', name: '微信', icon: '💬', color: '#0c6', order: 1 });
  assert.deepEqual(observed, ['微信', '天气']);
  upsertPhoneApp(apps, { id: 'chat', name: '聊天', icon: '💭', color: '#0b5', order: 3 });
  assert.deepEqual(apps.map(app => app.id), ['weather', 'chat']);
  assert.equal(apps.filter(app => app.id === 'chat').length, 1);
  assert.equal(observed.at(-1), '聊天');
});
```

- [ ] **Step 2: 运行并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/phoneAppRegistry.test.js"
```

Expected: FAIL，找不到 `phoneAppRegistry.ts`。

- [ ] **Step 3: 实现原位替换和排序**

```ts
export interface PhoneApp { id: string; name: string; icon: string; color: string; order: number }
export function upsertPhoneApp(apps: PhoneApp[], app: PhoneApp): void {
  const index = apps.findIndex(item => item.id === app.id);
  if (index === -1) apps.push(app);
  else apps.splice(index, 1, app);
  apps.sort((left, right) => left.order - right.order);
}
```

- [ ] **Step 4: 运行并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/phoneAppRegistry.test.js"
```

Expected: 1 test PASS，0 failures。

### Task 4: 接入 PhoneSystem 视图、临时隐藏和永久销毁

**Files:**
- Modify: `src/小手机/脚本/小手机主程序/index.ts`（`PhoneApp`/注册表区、`PhoneDesktop`、`openPhone`、入口点击、`destroy`、PhoneSystem 导出区）
- Create: `src/小手机/脚本/__tests__/phoneSystemSourceContract.test.js`

- [ ] **Step 1: 写可运行的源码契约失败测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../小手机主程序/index.ts'), 'utf8');

function extractFunctionBody(functionName) {
  const match = source.match(new RegExp(`function ${functionName}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `expected function ${functionName}`);
  return match[1];
}

test('PhoneSystem owns responsive app metadata and renderer APIs', () => {
  assert.match(source, /reactive<PhoneApp\[\]>\(\[\]\)/);
  assert.match(source, /upsertPhoneApp\(registeredApps, app\)/);
  for (const name of ['registerRenderer', 'unregisterRenderer', 'openApp', 'goHome']) {
    assert.match(source, new RegExp(`\\b${name}\\b`));
  }
  const exported = source.match(/const PhoneSystem\s*=\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(exported, 'expected exported PhoneSystem object');
  for (const name of ['registerRenderer', 'unregisterRenderer', 'openApp', 'goHome']) {
    assert.match(exported[1], new RegExp(`\\b${name}\\b`));
  }
});

test('desktop clicks use openApp and renderer containers come from the owned phone iframe', () => {
  assert.match(source, /onClick:\s*\(\)\s*=>\s*openApp\(app\.id\)/);
  assert.match(source, /phoneIframe\?\.\[0\][\s\S]*contentDocument/);
  assert.doesNotMatch(source, /querySelector\(['"]iframe\[script_id\]/);
});

test('temporary hide preserves renderer while permanent destroy tears it down', () => {
  const toggleBody = extractFunctionBody('togglePhoneVisibility');
  assert.match(toggleBody, /phoneIframe\.hide\(\)/);
  assert.match(toggleBody, /phoneIframe\.show\(\)/);
  assert.doesNotMatch(toggleBody, /controller\.(?:goHome|destroy)/);
  const destroyBody = extractFunctionBody('destroy');
  assert.match(destroyBody, /controller\.destroy\(\)/);
  assert.match(destroyBody, /phoneApp\.unmount\(\)/);
  assert.match(source, /pagehide[\s\S]*destroy/);
});
```

- [ ] **Step 2: 运行并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/phoneSystemSourceContract.test.js"
```

Expected: 3 tests FAIL；分别缺少响应式/renderer API、集中 openApp、controller 永久 teardown。

- [ ] **Step 3: 接入注册表和控制器公开 API**

在 `index.ts` 顶部显式导入：

```ts
import * as vue from 'vue';
import { createPhoneAppController, type PhoneAppRenderer } from './phoneAppController';
import { type PhoneApp, upsertPhoneApp } from './phoneAppRegistry';

const { computed, createApp, h, nextTick, reactive, ref } = vue;
```

删除本地重复 `PhoneApp` interface。注册表使用：

```ts
const registeredApps = reactive<PhoneApp[]>([]);
function registerApp(app: PhoneApp): void { upsertPhoneApp(registeredApps, app); }
```

把 `currentApp` 提到 `PhoneDesktop` 外的共享 `ref<string | null>(null)`。创建 controller 时：

```ts
const controller = createPhoneAppController({
  vue,
  scheduleMount: run => { void nextTick(run); },
  getContainer: appId => (phoneIframe?.[0] as HTMLIFrameElement | undefined)
    ?.contentDocument?.getElementById(`app-content-${appId}`) ?? null,
  ensurePhoneVisible: () => { if (!phoneIframe) openPhone(); else phoneIframe.show(); },
  isRegisteredApp: appId => registeredApps.some(app => app.id === appId),
  setCurrentApp: appId => { currentApp.value = appId; },
  showPlaceholder: (container, message) => { container.textContent = message; },
  showError: (container, error) => { container.textContent = `APP 加载失败：${String((error as Error)?.message || error)}`; },
  logError: error => console.error('[PhoneSystem] renderer 清理失败:', error),
});
```

公开代理 `registerRenderer/unregisterRenderer/openApp/goHome` 调用 controller；桌面和 Dock 点击统一调用 `openApp(app.id)`。`PhoneDesktop` 返回桌面时读取共享 `currentApp`，标题栏返回调用 `goHome()`。

代理函数写成：

```ts
function registerRenderer(appId: string, renderer: PhoneAppRenderer): void { controller.registerRenderer(appId, renderer); }
function unregisterRenderer(appId: string): void { controller.unregisterRenderer(appId); }
function openApp(appId: string): boolean { return controller.openApp(appId); }
function goHome(): void { controller.goHome(); }
```

`PhoneSystem` 对象必须显式包含这些代理：

```ts
const PhoneSystem = {
  registerApp,
  registerRenderer,
  unregisterRenderer,
  openApp,
  goHome,
  registeredApps,
  // 保留现有 settings/API/event bus 成员
};
```

- [ ] **Step 4: 接入 iframe 准确容器和可见性语义**

`PhoneDesktop` 继续创建精确容器：

```ts
h('div', { id: `app-content-${currentApp.value}`, style: 'flex:1;overflow:hidden;' })
```

桌面与 Dock 的两个点击处理都替换为 `onClick: () => openApp(app.id)`。`openPhone()` 只创建一次 iframe 和 Vue root；phone iframe load 后使用导入的 `createApp(PhoneDesktop)`。入口绑定到完整函数：

```ts
function togglePhoneVisibility(): void {
  if (!phoneIframe) { openPhone(); return; }
  if (phoneIframe.is(':visible')) phoneIframe.hide();
  else phoneIframe.show();
}
$entry.on('click', () => { if (!dragMoved) togglePhoneVisibility(); });
```

iframe load 处理器在 `phoneApp.mount(mountTarget)` 后调用 `void nextTick(() => controller.refreshCurrent())`。这样 `openApp()` 先创建手机壳时，第一次因容器尚不存在而退出的调度，会在 PhoneDesktop 容器真实建立后再次挂载。

- [ ] **Step 5: 接入永久销毁并防止陈旧挂载**

`destroy()` 使用完整顺序：

```ts
let destroyed = false;
function destroy(): void {
  if (destroyed) return;
  destroyed = true;
  controller.destroy();
  if (phoneApp) { try { phoneApp.unmount(); } catch (error) { console.warn(error); } phoneApp = null; }
  phoneIframe?.remove();
  phoneIframe = null;
  $entry.remove();
  $(document).off('.phoneDrag');
}
$(window).on('pagehide', destroy);
```

`getContextGeneration()` 属于 Chunk 3 的聊天切换契约，不在本 Chunk 的源码测试中提前要求；Chunk 3 接入后再加入 PhoneSystem 导出。

- [ ] **Step 6: 运行 Chunk 1 全部测试**

```powershell
node --test "src/小手机/脚本/__tests__/phoneAppController.test.js" "src/小手机/脚本/__tests__/phoneAppRegistry.test.js" "src/小手机/脚本/__tests__/phoneSystemSourceContract.test.js"
```

Expected: 17 tests PASS（控制器 13、注册表 1、源码契约 3），0 failures。

- [ ] **Step 7: 提交 Chunk 1**

```powershell
git add -- "src/小手机/脚本/小手机主程序" "src/小手机/脚本/__tests__/phoneAppController.test.js" "src/小手机/脚本/__tests__/phoneAppRegistry.test.js" "src/小手机/脚本/__tests__/phoneSystemSourceContract.test.js"
git commit -m "fix: restore phone app renderer lifecycle"
```

## Chunk 2: stat_data 候选与显式建会话

### Task 3: 实现宏根键解析器

**Files:**
- Create: `src/小手机/脚本/聊天APP/statDataRootNames.ts`
- Create: `src/小手机/脚本/__tests__/statDataRootNames.test.js`

- [ ] **Step 1: 写完整表驱动失败测试**

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { STAT_DATA_MACRO, parseStatDataRootNames, loadStatDataRootNames } = require('../聊天APP/statDataRootNames.ts');

test('parses root names from YAML, JSON, and complete outer fences', () => {
  const cases = [
    ['角色甲:\n  好感: 1\n角色乙: {}', ['角色甲', '角色乙']],
    ['{"角色甲":{},"角色乙":{}}', ['角色甲', '角色乙']],
    ['```yaml\n角色甲: {}\n角色乙: {}\n```', ['角色甲', '角色乙']],
    ['  ```yml\r\n角色甲: {}\r\n角色乙: {}\r\n```  ', ['角色甲', '角色乙']],
    ['```json\n{"角色甲":{}}\n```', ['角色甲']],
    ['```\n角色甲: {}\n```', ['角色甲']],
  ];
  for (const [input, names] of cases) {
    assert.deepEqual(parseStatDataRootNames(input), { ok: true, names });
  }
  assert.deepEqual(parseStatDataRootNames('"甲": {}\n" 甲 ": {}\n乙: {}'), { ok: true, names: ['甲', '乙'] });
});

test('returns exact failure reasons in precedence order', () => {
  assert.deepEqual(parseStatDataRootNames('  '), { ok: false, reason: 'macro-unexpanded' });
  assert.deepEqual(parseStatDataRootNames(`prefix ${STAT_DATA_MACRO}`), { ok: false, reason: 'macro-unexpanded' });
  assert.deepEqual(parseStatDataRootNames('```yaml\n角色甲: {}\n``` trailing'), { ok: false, reason: 'parse-error' });
  assert.deepEqual(parseStatDataRootNames('foo: ['), { ok: false, reason: 'parse-error' });
  for (const input of ['[]', 'null', '123', '文本']) {
    assert.deepEqual(parseStatDataRootNames(input), { ok: false, reason: 'not-object' });
  }
  assert.deepEqual(parseStatDataRootNames('{}'), { ok: false, reason: 'empty' });
  assert.deepEqual(parseStatDataRootNames('"   ": {}'), { ok: false, reason: 'empty' });
});

test('macro adapter calls the exact macro and maps only source exceptions', () => {
  let received = '';
  const success = loadStatDataRootNames(source => { received = source; return '角色甲: {}'; });
  assert.equal(received, '{{format_message_variable::stat_data}}');
  assert.deepEqual(success, { ok: true, names: ['角色甲'] });
  assert.deepEqual(loadStatDataRootNames(() => { throw new Error('macro failed'); }), { ok: false, reason: 'source-error' });
});
```

- [ ] **Step 2: 运行解析器测试并确认失败**

Run:

```powershell
node --test "src/小手机/脚本/__tests__/statDataRootNames.test.js"
```

Expected: FAIL，明确报告找不到 `statDataRootNames.ts`；3 个命名测试尚未运行通过。

- [ ] **Step 3: 用 `yaml` 实现完整解析器**

```ts
import { parse } from 'yaml';

export const STAT_DATA_MACRO = '{{format_message_variable::stat_data}}';
const OUTER_FENCE = /^\s*```(?:ya?ml|json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i;

export type StatDataRootNameFailure = 'source-error' | 'macro-unexpanded' | 'parse-error' | 'not-object' | 'empty';
export type StatDataRootNameResult =
  | { ok: true; names: string[] }
  | { ok: false; reason: StatDataRootNameFailure };

export function parseStatDataRootNames(expanded: string): StatDataRootNameResult {
  const trimmed = String(expanded ?? '').trim();
  if (!trimmed || trimmed.includes(STAT_DATA_MACRO)) return { ok: false, reason: 'macro-unexpanded' };
  const fenced = trimmed.match(OUTER_FENCE);
  const source = fenced ? fenced[1] : trimmed;
  let value: unknown;
  try { value = parse(source); } catch { return { ok: false, reason: 'parse-error' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'not-object' };
  const names = [...new Set(Object.keys(value).map(name => name.trim()).filter(Boolean))];
  return names.length ? { ok: true, names } : { ok: false, reason: 'empty' };
}

export function loadStatDataRootNames(expandMacro: (source: string) => string): StatDataRootNameResult {
  try { return parseStatDataRootNames(expandMacro(STAT_DATA_MACRO)); }
  catch { return { ok: false, reason: 'source-error' }; }
}
```

- [ ] **Step 4: 运行解析器测试并确认通过**

```powershell
node --test "src/小手机/脚本/__tests__/statDataRootNames.test.js"
```

Expected: 3 tests PASS，0 failures。

### Task 4: 实现私聊/群聊选择与载荷决策

**Files:**
- Create: `src/小手机/脚本/聊天APP/conversationCreation.ts`
- Create: `src/小手机/脚本/__tests__/conversationCreation.test.js`

- [ ] **Step 1: 写完整纯决策失败测试**

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { decidePrivateConversation, decideGroupConversation } = require('../聊天APP/conversationCreation.ts');

test('private decision requires one name and reuses only an exact private member', () => {
  assert.deepEqual(decidePrivateConversation([], []), { ok: false, reason: 'select-one' });
  assert.deepEqual(decidePrivateConversation(['甲', '乙'], []), { ok: false, reason: 'select-one' });
  const privateChat = { id: 'p1', type: 'private', members: ['甲'], name: '甲' };
  const groupChat = { id: 'g1', type: 'group', members: ['甲'], name: '甲群' };
  assert.deepEqual(decidePrivateConversation(['甲'], [groupChat, privateChat]), { ok: true, kind: 'existing', conversation: privateChat });
  assert.deepEqual(decidePrivateConversation(['乙'], [privateChat]), {
    ok: true, kind: 'create', payload: { type: 'private', members: ['乙'], name: '乙' },
  });
});

test('group decision deduplicates members and requires two distinct names', () => {
  assert.deepEqual(decideGroupConversation(['甲', '甲'], ''), { ok: false, reason: 'select-at-least-two' });
  assert.deepEqual(decideGroupConversation(['甲', '乙', '甲'], ''), {
    ok: true, payload: { type: 'group', members: ['甲', '乙'], name: '甲、乙' },
  });
  assert.deepEqual(decideGroupConversation(['甲', '乙'], '  自定义群  '), {
    ok: true, payload: { type: 'group', members: ['甲', '乙'], name: '自定义群' },
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
node --test "src/小手机/脚本/__tests__/conversationCreation.test.js"
```

Expected: FAIL，明确报告找不到 `conversationCreation.ts`；2 个命名测试尚未运行通过。

- [ ] **Step 3: 实现判别联合和载荷函数**

```ts
export interface ConversationLike { id: string; type: 'private' | 'group'; members: string[]; name: string }
export type ConversationPayload = { type: 'private' | 'group'; members: string[]; name: string };
export type ConversationDecision =
  | { ok: false; reason: 'select-one' | 'select-at-least-two' }
  | { ok: true; kind: 'existing'; conversation: ConversationLike }
  | { ok: true; kind: 'create'; payload: ConversationPayload };

const uniqueNames = (names: string[]) => [...new Set(names.map(name => name.trim()).filter(Boolean))];

export function decidePrivateConversation(selected: string[], conversations: ConversationLike[]): ConversationDecision {
  const names = uniqueNames(selected);
  if (names.length !== 1) return { ok: false, reason: 'select-one' };
  const existing = conversations.find(item => item.type === 'private' && item.members[0] === names[0]);
  if (existing) return { ok: true, kind: 'existing', conversation: existing };
  return { ok: true, kind: 'create', payload: { type: 'private', members: names, name: names[0] } };
}

export function decideGroupConversation(selected: string[], customName: string): ConversationDecision {
  const members = uniqueNames(selected);
  if (members.length < 2) return { ok: false, reason: 'select-at-least-two' };
  const fallback = members.join('、');
  return { ok: true, kind: 'create', payload: { type: 'group', members, name: customName.trim() || fallback } };
}
```

- [ ] **Step 4: 运行纯决策测试并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/conversationCreation.test.js"
```

Expected: 2 tests PASS，0 failures。

### Task 5: 实现一次性异步创建协调器

**Files:**
- Create: `src/小手机/脚本/聊天APP/conversationCreationCoordinator.ts`
- Create: `src/小手机/脚本/__tests__/conversationCreationCoordinator.test.js`

- [ ] **Step 1: 写带调用计数的失败测试**

测试夹具注入 `getConversations/createConversation/onCommit/refreshConversations/onRefreshError/isCurrent`。命名用例和断言：

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationCreationCoordinator } = require('../聊天APP/conversationCreationCoordinator.ts');

function harness(overrides = {}) {
  const calls = { get: 0, create: 0, commit: [], refresh: 0, refreshErrors: 0 };
  const created = { id: 'new', type: 'private', members: ['甲'], name: '甲' };
  const deps = {
    getConversations: async () => { calls.get += 1; return []; },
    createConversation: async payload => { calls.create += 1; return { ...created, ...payload }; },
    onCommit: conversation => calls.commit.push(conversation),
    refreshConversations: async () => { calls.refresh += 1; },
    onRefreshError: () => { calls.refreshErrors += 1; },
    captureContext: () => 'ctx-1',
    isCurrent: token => token === 'ctx-1',
    ...overrides,
  };
  return { calls, coordinator: createConversationCreationCoordinator(deps) };
}

test('private confirmation performs fresh lookup and reuses an existing private without create', async () => {
  const existing = { id: 'old', type: 'private', members: ['甲'], name: '甲' };
  const h = harness({ getConversations: async () => { h.calls.get += 1; return [existing]; } });
  assert.deepEqual(await h.coordinator.confirmPrivate(['甲']), { ok: true, kind: 'existing', conversation: existing });
  assert.deepEqual(h.calls, { get: 1, create: 0, commit: [existing], refresh: 0, refreshErrors: 0 });
});

test('private lookup failure fails closed and never creates', async () => {
  const h = harness({ getConversations: async () => { h.calls.get += 1; throw new Error('read failed'); } });
  assert.deepEqual(await h.coordinator.confirmPrivate(['甲']), { ok: false, reason: 'lookup-error' });
  assert.equal(h.calls.create, 0);
});

test('stale private lookup never starts a create in the new context', async () => {
  let release;
  let current = true;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({
    getConversations: async () => { h.calls.get += 1; await pending; return []; },
    captureContext: () => 'old',
    isCurrent: token => token === 'old' && current,
  });
  const result = h.coordinator.confirmPrivate(['甲']);
  current = false;
  release();
  assert.deepEqual(await result, { ok: false, reason: 'stale' });
  assert.equal(h.calls.create, 0);
  assert.equal(h.calls.commit.length, 0);
  assert.equal(h.calls.refresh, 0);
});

test('created conversation commits and resolves before a non-blocking refresh settles', async () => {
  let rejectRefresh;
  const pendingRefresh = new Promise((_, reject) => { rejectRefresh = reject; });
  const h = harness({ refreshConversations: () => { h.calls.refresh += 1; return pendingRefresh; } });
  const result = await Promise.race([
    h.coordinator.confirmPrivate(['甲']),
    new Promise((_, reject) => setTimeout(() => reject(new Error('confirmation waited for refresh')), 50)),
  ]);
  assert.equal(result.ok, true);
  assert.equal(h.calls.create, 1);
  assert.equal(h.calls.commit.length, 1);
  assert.equal(h.coordinator.isBusy(), false);
  rejectRefresh(new Error('refresh failed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.refresh, 1);
  assert.equal(h.calls.refreshErrors, 1);
  assert.equal(h.calls.create, 1);
});

test('group confirmation always creates once and busy submissions are rejected', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ createConversation: async payload => { h.calls.create += 1; await pending; return { id: 'g', ...payload }; } });
  const first = h.coordinator.confirmGroup(['甲', '乙'], '');
  assert.deepEqual(await h.coordinator.confirmGroup(['甲', '乙'], ''), { ok: false, reason: 'busy' });
  release();
  assert.equal((await first).ok, true);
  assert.equal(h.calls.create, 1);
});

test('creation errors preserve caller state and stale completion does not commit or refresh', async () => {
  const failed = harness({ createConversation: async () => { failed.calls.create += 1; throw new Error('create failed'); } });
  assert.deepEqual(await failed.coordinator.confirmGroup(['甲', '乙'], '群'), { ok: false, reason: 'create-error' });
  assert.equal(failed.calls.commit.length, 0);
  const stale = harness({ captureContext: () => 'old', isCurrent: () => false });
  assert.deepEqual(await stale.coordinator.confirmPrivate(['甲']), { ok: false, reason: 'stale' });
  assert.equal(stale.calls.get, 0);
  assert.equal(stale.calls.create, 0);
  assert.equal(stale.calls.commit.length, 0);
  assert.equal(stale.calls.refresh, 0);
});
```

- [ ] **Step 2: 运行协调器测试并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/conversationCreationCoordinator.test.js"
```

Expected: FAIL，找不到协调器模块；6 个命名测试尚未运行通过。

- [ ] **Step 3: 实现完整协调器**

```ts
import {
  decideGroupConversation,
  decidePrivateConversation,
  type ConversationLike,
  type ConversationPayload,
} from './conversationCreation';

type FailureReason = 'select-one' | 'select-at-least-two' | 'lookup-error' | 'create-error' | 'busy' | 'stale';
export type CreationResult =
  | { ok: false; reason: FailureReason }
  | { ok: true; kind: 'existing' | 'created'; conversation: ConversationLike };

export interface ConversationCreationDeps<TContext> {
  getConversations(): Promise<ConversationLike[]>;
  createConversation(payload: ConversationPayload): Promise<ConversationLike>;
  onCommit(conversation: ConversationLike): void;
  refreshConversations(): Promise<void>;
  onRefreshError(error: unknown): void;
  captureContext(): TContext;
  isCurrent(context: TContext): boolean;
}

export function createConversationCreationCoordinator<TContext>(deps: ConversationCreationDeps<TContext>) {
  let busy = false;

  const refreshLater = () => {
    void deps.refreshConversations().catch(error => deps.onRefreshError(error));
  };

  const createAndCommit = async (payload: ConversationPayload, context: TContext): Promise<CreationResult> => {
    try {
      const conversation = await deps.createConversation(payload);
      if (!deps.isCurrent(context)) return { ok: false, reason: 'stale' };
      deps.onCommit(conversation);
      refreshLater();
      return { ok: true, kind: 'created', conversation };
    } catch {
      return { ok: false, reason: 'create-error' };
    }
  };

  const confirmPrivate = async (selected: string[]): Promise<CreationResult> => {
    const initial = decidePrivateConversation(selected, []);
    if (!initial.ok) return initial;
    if (busy) return { ok: false, reason: 'busy' };
    const context = deps.captureContext();
    if (!deps.isCurrent(context)) return { ok: false, reason: 'stale' };
    busy = true;
    try {
      let conversations: ConversationLike[];
      try { conversations = await deps.getConversations(); }
      catch { return { ok: false, reason: 'lookup-error' }; }
      if (!deps.isCurrent(context)) return { ok: false, reason: 'stale' };
      const decision = decidePrivateConversation(selected, conversations);
      if (!decision.ok) return decision;
      if (decision.kind === 'existing') {
        deps.onCommit(decision.conversation);
        return { ok: true, kind: 'existing', conversation: decision.conversation };
      }
      return await createAndCommit(decision.payload, context);
    } finally { busy = false; }
  };

  const confirmGroup = async (selected: string[], customName: string): Promise<CreationResult> => {
    const decision = decideGroupConversation(selected, customName);
    if (!decision.ok) return decision;
    if (busy) return { ok: false, reason: 'busy' };
    const context = deps.captureContext();
    if (!deps.isCurrent(context)) return { ok: false, reason: 'stale' };
    busy = true;
    try { return await createAndCommit(decision.payload, context); }
    finally { busy = false; }
  };

  return { confirmPrivate, confirmGroup, isBusy: () => busy };
}
```

- [ ] **Step 4: 运行协调器测试并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/conversationCreationCoordinator.test.js"
```

Expected: 6 tests PASS，0 failures。

### Task 6: renderer、可取消等待和聊天 UI 接线

**Files:**
- Create: `src/小手机/脚本/聊天APP/chatRendererLifecycle.ts`
- Modify: `src/小手机/脚本/聊天APP/index.ts`
- Create: `src/小手机/脚本/__tests__/chatRendererLifecycle.test.js`
- Create: `src/小手机/脚本/__tests__/chatAppSourceContract.test.js`

- [ ] **Step 1: 写完整 renderer 生命周期失败测试**

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { mountChatRenderer, waitForPhoneSystem } = require('../聊天APP/chatRendererLifecycle.ts');

test('mountChatRenderer mounts into the exact container and cleanup is idempotent', () => {
  const calls = [];
  const container = { id: 'target' };
  const app = { mount: value => calls.push(['mount', value]), unmount: () => calls.push(['unmount']) };
  const vue = { createApp: component => { calls.push(['create', component]); return app; } };
  const cleanup = mountChatRenderer({ container, vue, component: 'ChatComponent' });
  cleanup(); cleanup();
  assert.deepEqual(calls, [['create', 'ChatComponent'], ['mount', container], ['unmount']]);
});

test('mountChatRenderer rolls back and rethrows mount failures', () => {
  let unmounts = 0;
  const vue = { createApp: () => ({ mount: () => { throw new Error('mount failed'); }, unmount: () => { unmounts += 1; } }) };
  assert.throws(() => mountChatRenderer({ container: {}, vue, component: {} }), /mount failed/);
  assert.equal(unmounts, 1);
});

test('waitForPhoneSystem calls onReady once when the system appears', () => {
  const queue = [];
  let system = null;
  let ready = 0;
  waitForPhoneSystem({ read: () => system, schedule: fn => { queue.push(fn); return fn; }, cancel: () => {}, onReady: value => { assert.equal(value, system); ready += 1; } });
  assert.equal(queue.length, 1);
  system = { registerApp() {} };
  queue.shift()();
  assert.equal(ready, 1);
});

test('cancelling the waiter clears its timer and stale callbacks cannot register', () => {
  const queue = [];
  const cancelled = [];
  let ready = 0;
  const stop = waitForPhoneSystem({ read: () => null, schedule: fn => { queue.push(fn); return fn; }, cancel: token => cancelled.push(token), onReady: () => { ready += 1; } });
  const stale = queue[0];
  stop();
  stale();
  assert.deepEqual(cancelled, [stale]);
  assert.equal(ready, 0);
  assert.equal(queue.length, 1);
});
```

- [ ] **Step 2: 运行 renderer 测试并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/chatRendererLifecycle.test.js"
```

Expected: FAIL，找不到 `chatRendererLifecycle.ts`；4 个命名测试尚未通过。

- [ ] **Step 3: 实现 renderer 生命周期工具**

```ts
import type * as VueRuntime from 'vue';

export function mountChatRenderer(options: { container: Element; vue: typeof VueRuntime; component: object }): () => void {
  const app = options.vue.createApp(options.component);
  try { app.mount(options.container); }
  catch (error) { try { app.unmount(); } catch { /* mount error remains primary */ } throw error; }
  let cleaned = false;
  return () => { if (cleaned) return; cleaned = true; app.unmount(); };
}

export function waitForPhoneSystem<T, TTimer>(options: {
  read(): T | null | undefined;
  schedule(run: () => void): TTimer;
  cancel(timer: TTimer): void;
  onReady(value: T): void;
}): () => void {
  let disposed = false;
  let timer: TTimer | null = null;
  const tick = () => {
    if (disposed) return;
    const value = options.read();
    if (value) { timer = null; disposed = true; options.onReady(value); return; }
    timer = options.schedule(tick);
  };
  tick();
  return () => { if (disposed) return; disposed = true; if (timer !== null) options.cancel(timer); timer = null; };
}
```

- [ ] **Step 4: 写完整聊天 APP 源码契约失败测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../聊天APP/index.ts'), 'utf8');

function extractFunctionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `expected ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(brace + 1, index);
  }
  assert.fail(`unterminated ${name}`);
}

test('chat registers a renderer using the exact container and passed Vue runtime', () => {
  assert.match(source, /registerRenderer\(['"]chat-app['"],\s*\(\{\s*container,\s*vue\s*\}\)/);
  assert.match(source, /mountChatRenderer\(\{\s*container,\s*vue,\s*component:\s*createChatRenderer\(vue,\s*PS\)/);
  assert.match(source, /function createChatRenderer\(vue:/);
  assert.doesNotMatch(source, /window\.parent\.Vue/);
});

test('pagehide cancels waiting and unregisters the exact renderer', () => {
  const body = extractFunctionBody('disposeChatAppScript');
  assert.match(body, /stopWaitingForPhoneSystem\?\.\(\)/);
  assert.match(body, /registeredPhoneSystem\?\.unregisterRenderer\(['"]chat-app['"]\)/);
  assert.match(source, /pagehide['"],\s*disposeChatAppScript/);
});

test('legacy iframe guessing and retry mounting are removed', () => {
  assert.doesNotMatch(source, /nextElementSibling/);
  assert.doesNotMatch(source, /iframe\[script_id\]/);
  assert.doesNotMatch(source, /retries\s*>\s*20/);
});

test('list and modal states distinguish loading error empty and reset paths', () => {
  assert.match(source, /listState:\s*['"]loading['"]/);
  assert.match(source, /listState\s*===\s*['"]ready['"][\s\S]*conversations\.length\s*===\s*0/);
  assert.match(source, /聊天记录加载失败/);
  assert.match(source, /重试/);
  assert.match(source, /暂无聊天记录/);
  assert.match(source, /['"]＋['"]/);
  const openBody = extractFunctionBody('openCreationModal');
  assert.match(openBody, /candidateState\s*=\s*['"]loading['"]/);
  assert.match(openBody, /await vue\.nextTick\(\)/);
  assert.match(openBody, /loadStatDataRootNames\(substitudeMacros\)/);
  const closeBody = extractFunctionBody('closeCreationModal');
  for (const token of ["creationMode = null", "selectedNames = []", "groupName = ''", "creationError = ''", 'isCreating = false']) {
    assert.ok(closeBody.includes(token), `expected reset: ${token}`);
  }
  const submitBody = extractFunctionBody('submitCreation');
  assert.match(submitBody, /const submitContext = captureContext\(\)/);
  assert.match(submitBody, /isContextCurrent\(submitContext\)/);
});

test('existing message send generation and sync chain remains intact', () => {
  for (const token of ['ChatDB.addMessage', 'generatePrivateReply', 'generateGroupReply', 'ChatSync.instantSync']) {
    assert.ok(source.includes(token), `expected preserved chain ${token}`);
  }
});
```

- [ ] **Step 5: 运行源码契约并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/chatAppSourceContract.test.js"
```

Expected: renderer 注册、显式建会话和 list/modal 状态 4 个命名测试 FAIL；发送链保留 1 个命名测试 PASS。

- [ ] **Step 6: 接入聊天 Vue renderer 和显式创建 UI**

组件 state 明确包含：

```ts
listState: 'loading' | 'ready' | 'error';
listError: string;
notice: string;
modalOpen: boolean;
creationMode: 'private' | 'group' | null;
candidateState: 'idle' | 'loading' | 'ready' | 'error';
candidates: string[];
selectedNames: string[];
groupName: string;
creationError: string;
isCreating: boolean;
componentGeneration: number;
modalGeneration: number;
```

组件边界与上下文 token 写成：

```ts
function createChatRenderer(vue: typeof import('vue'), PS: any) {
  return { setup() {
    let disposed = false;
    const store = vue.reactive({
      conversations: [], listState: 'loading', listError: '', notice: '',
      modalOpen: false, creationMode: null, candidateState: 'idle', candidates: [],
      selectedNames: [], groupName: '', creationError: '', isCreating: false,
      componentGeneration: 0, modalGeneration: 0,
      // 保留 activeConv/messages/inputText/isGenerating
    });
    const captureContext = () => ({
      component: store.componentGeneration,
      modal: store.modalGeneration,
      phone: PS.getContextGeneration?.() ?? 0,
    });
    const isContextCurrent = (token: ReturnType<typeof captureContext>) =>
      !disposed && token.component === store.componentGeneration &&
      token.modal === store.modalGeneration && token.phone === (PS.getContextGeneration?.() ?? 0);
    vue.onBeforeUnmount(() => { disposed = true; store.componentGeneration += 1; store.modalGeneration += 1; });
```

`loadConversations()` 捕获独立 component/phone token（列表加载不比较 modal 字段），先 loading，await 后核对 token再写 ready；catch 也只在 token 有效时写 error。只有 `listState === 'ready' && conversations.length === 0` 渲染“暂无聊天记录”；error 分支渲染“聊天记录加载失败”和调用 `loadConversations` 的重试按钮。标题右侧在所有 listState 分支外始终渲染“＋”。

`openCreationModal()` 与关闭函数使用明确的异步/重置代码：

```ts
async function openCreationModal(): Promise<void> {
  store.modalGeneration += 1;
  const generation = store.modalGeneration;
  store.modalOpen = true;
  store.creationMode = null;
  store.selectedNames = [];
  store.groupName = '';
  store.creationError = '';
  store.isCreating = false;
  store.candidateState = 'loading';
  await vue.nextTick();
  if (disposed || generation !== store.modalGeneration) return;
  const result = loadStatDataRootNames(substitudeMacros);
  if (disposed || generation !== store.modalGeneration) return;
  if (result.ok) { store.candidates = result.names; store.candidateState = 'ready'; }
  else {
    store.candidates = [];
    store.candidateState = 'error';
    store.creationError = candidateErrorMessage[result.reason];
  }
}

function closeCreationModal(): void {
  store.modalGeneration += 1;
  store.modalOpen = false;
  store.creationMode = null;
  store.candidateState = 'idle';
  store.candidates = [];
  store.selectedNames = [];
  store.groupName = '';
  store.creationError = '';
  store.isCreating = false;
}
```

协调器使用实际 ChatDB 接线：

```ts
const coordinator = createConversationCreationCoordinator({
  getConversations: () => (window.parent as any).ChatDB.getConversations(),
  createConversation: payload => (window.parent as any).ChatDB.createConversation(payload),
  captureContext,
  isCurrent: isContextCurrent,
  onCommit: conversation => {
    const index = store.conversations.findIndex(item => item.id === conversation.id);
    if (index === -1) store.conversations.push(conversation);
    else store.conversations.splice(index, 1, conversation);
    closeCreationModal();
    void openConversation(conversation);
  },
  refreshConversations: loadConversations,
  onRefreshError: () => { if (!disposed) store.notice = '列表刷新失败，请稍后重试'; },
});

async function submitCreation(): Promise<void> {
  if (store.isCreating || store.candidateState !== 'ready' || store.creationMode === null) return;
  const submitContext = captureContext();
  store.isCreating = true;
  store.creationError = '';
  const result = store.creationMode === 'private'
    ? await coordinator.confirmPrivate([...store.selectedNames])
    : await coordinator.confirmGroup([...store.selectedNames], store.groupName);
  if (isContextCurrent(submitContext) && !result.ok && result.reason !== 'stale') {
    store.creationError = creationErrorMessage[result.reason];
  }
  if (isContextCurrent(submitContext)) store.isCreating = coordinator.isBusy();
}
```

确认按钮 `disabled` 条件固定为：`candidateState !== 'ready' || isCreating || creationMode === null`，并额外用纯 decision 判断当前选择是否有效。私聊选项点击替换为单元素数组；群聊点击切换成员。创建错误不会调用 `closeCreationModal()`，因此模式、选择和群名保持。成功 `onCommit` 才关闭并打开会话。后台 refresh 只替换 conversations 或显示 notice，不修改 modal/busy。

renderer 注册固定为：

```ts
PS.registerRenderer('chat-app', ({ container, vue }) =>
  mountChatRenderer({ container, vue, component: createChatRenderer(vue, PS) }),
);
```

脚本级等待/卸载保存准确引用：

```ts
let scriptDisposed = false;
interface PhoneSystemLike {
  registerApp(app: { id: string; name: string; icon: string; color: string; order: number }): void;
  registerRenderer(appId: string, renderer: (context: { container: HTMLElement; vue: typeof import('vue') }) => void | (() => void)): void;
  unregisterRenderer(appId: string): void;
  getContextGeneration?(): number;
}
let registeredPhoneSystem: PhoneSystemLike | null = null;
let stopWaitingForPhoneSystem: (() => void) | null = null;
stopWaitingForPhoneSystem = waitForPhoneSystem({
  read: () => scriptDisposed ? null : ((window.parent as any).PhoneSystem as PhoneSystemLike | undefined),
  schedule: run => setTimeout(run, 300),
  cancel: timer => clearTimeout(timer),
  onReady: PS => {
    if (scriptDisposed) return;
    registeredPhoneSystem = PS;
    PS.registerApp(chatMetadata);
    PS.registerRenderer('chat-app', ({ container, vue }) =>
      mountChatRenderer({ container, vue, component: createChatRenderer(vue, PS) }));
  },
});
function disposeChatAppScript(): void {
  if (scriptDisposed) return;
  scriptDisposed = true;
  stopWaitingForPhoneSystem?.();
  stopWaitingForPhoneSystem = null;
  registeredPhoneSystem?.unregisterRenderer('chat-app');
  registeredPhoneSystem = null;
}
$(window).on('pagehide', disposeChatAppScript);
```

内部统一使用传入的 `vue.h`、`vue.reactive`、`vue.onMounted/onBeforeUnmount`，不再读取任何窗口上的 Vue。

pagehide 先 disposed，取消等待，再反注册。原有消息读取、发送、ChatCore 和 ChatSync 调用体保持不变。

- [ ] **Step 7: 运行 Chunk 2 全部测试**

```powershell
node --test "src/小手机/脚本/__tests__/statDataRootNames.test.js" "src/小手机/脚本/__tests__/conversationCreation.test.js" "src/小手机/脚本/__tests__/conversationCreationCoordinator.test.js" "src/小手机/脚本/__tests__/chatRendererLifecycle.test.js" "src/小手机/脚本/__tests__/chatAppSourceContract.test.js"
```

Expected: 20 tests PASS（parser 3 + decision 2 + coordinator 6 + renderer lifecycle 4 + source contract 5），0 failures。

- [ ] **Step 8: 提交 Chunk 2**

```powershell
git add -- "src/小手机/脚本/聊天APP" "src/小手机/脚本/__tests__/statDataRootNames.test.js" "src/小手机/脚本/__tests__/conversationCreation.test.js" "src/小手机/脚本/__tests__/conversationCreationCoordinator.test.js" "src/小手机/脚本/__tests__/chatRendererLifecycle.test.js" "src/小手机/脚本/__tests__/chatAppSourceContract.test.js"
git commit -m "feat: add explicit phone chat creation"
```

## Chunk 3: ChatDB 分区与聊天切换

### Task 7: 固定每次 ChatDB 操作的 chatId

**Files:**
- Create: `src/小手机/脚本/聊天数据库/chatOperationContext.ts`
- Create: `src/小手机/脚本/__tests__/chatOperationContext.test.js`

- [ ] **Step 1: 写可执行分区竞态失败测试**

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatOperationContextFactory } = require('../聊天数据库/chatOperationContext.ts');

test('each operation synchronously pins chatId before database promises resolve', async () => {
  let current = 'old-chat';
  const diagnostics = [];
  const resolvers = [];
  const beginOperation = createChatOperationContextFactory({
    readChatId: () => current,
    openDatabase: () => new Promise(resolve => resolvers.push(resolve)),
    onDiagnosticChatId: id => diagnostics.push(id),
  });
  const oldOperation = beginOperation();
  current = 'new-chat';
  const newOperation = beginOperation();
  assert.equal(oldOperation.chatId, 'old-chat');
  assert.equal(newOperation.chatId, 'new-chat');
  resolvers[1]({ label: 'new-db' });
  resolvers[0]({ label: 'old-db' });
  assert.equal((await oldOperation.dbPromise).label, 'old-db');
  assert.equal((await newOperation.dbPromise).label, 'new-db');
  assert.deepEqual(diagnostics, ['old-chat', 'new-chat']);
});

test('missing chat ids normalize to default at synchronous entry', () => {
  const beginOperation = createChatOperationContextFactory({
    readChatId: () => '', openDatabase: async () => ({}), onDiagnosticChatId: () => {},
  });
  assert.equal(beginOperation().chatId, 'default');
});
```

- [ ] **Step 2: 运行并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/chatOperationContext.test.js"
```

Expected: FAIL，找不到 `chatOperationContext.ts`；2 个命名测试尚未通过。

- [ ] **Step 3: 实现完整 factory**

```ts
export interface ChatOperationContext<TDatabase> { chatId: string; dbPromise: Promise<TDatabase> }
export function createChatOperationContextFactory<TDatabase>(deps: {
  readChatId(): string | null | undefined;
  openDatabase(): Promise<TDatabase>;
  onDiagnosticChatId(chatId: string): void;
}): () => ChatOperationContext<TDatabase> {
  return () => {
    const chatId = String(deps.readChatId() || 'default');
    deps.onDiagnosticChatId(chatId);
    return { chatId, dbPromise: deps.openDatabase() };
  };
}
```

- [ ] **Step 4: 运行并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/chatOperationContext.test.js"
```

Expected: 2 tests PASS，0 failures。

### Task 8: 接入所有 ChatDB CRUD，并禁止嵌套重抓分区

**Files:**
- Modify: `src/小手机/脚本/聊天数据库/index.ts`
- Create: `src/小手机/脚本/聊天数据库/chatPartitionOperations.ts`
- Create: `src/小手机/脚本/__tests__/sourceTestUtils.js`
- Create: `src/小手机/脚本/__tests__/chatDatabaseSourceContract.test.js`
- Create: `src/小手机/脚本/__tests__/chatPartitionOperations.test.js`

- [ ] **Step 1: 写可执行行为与源码契约失败测试**

共享测试工具 `sourceTestUtils.js`：

```js
const fs = require('node:fs');
const path = require('node:path');
function readSource(relativePath) { return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8'); }
function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) throw new Error(`missing function ${functionName}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(brace + 1, index);
  }
  throw new Error(`unterminated function ${functionName}`);
}
module.exports = { readSource, extractFunctionBody };
```

`chatPartitionOperations.test.js` 完整行为测试：

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationForOperation, queryConversationsForOperation } = require('../聊天数据库/chatPartitionOperations.ts');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('reverse database resolution preserves database and chatId pairing', async () => {
  const oldDb = deferred();
  const newDb = deferred();
  const writes = [];
  const queries = [];
  const oldCreate = createConversationForOperation({ chatId: 'old-chat', dbPromise: oldDb.promise }, { type: 'private', members: ['甲'], name: '甲' }, 1, (db, record) => { writes.push([db.label, record]); return record; });
  const newQuery = queryConversationsForOperation({ chatId: 'new-chat', dbPromise: newDb.promise }, db => ({ getAll: chatId => { queries.push([db.label, chatId]); return [chatId]; } }));
  newDb.resolve({ label: 'new-db' });
  oldDb.resolve({ label: 'old-db' });
  const [record, rows] = await Promise.all([oldCreate, newQuery]);
  assert.equal(record.chatId, 'old-chat');
  assert.match(record.id, /^conv_old-chat_private_/);
  assert.deepEqual(writes.map(([db, value]) => [db, value.chatId]), [['old-db', 'old-chat']]);
  assert.deepEqual(queries, [['new-db', 'new-chat']]);
  assert.deepEqual(rows, ['new-chat']);
});
```

`chatDatabaseSourceContract.test.js` 提供平衡花括号 `extractFunctionBody`。三个命名测试使用以下完整断言逻辑：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { readSource, extractFunctionBody } = require('./sourceTestUtils.js');
const source = readSource('../聊天数据库/index.ts');
const publicCrud = ['createConversation', 'getConversation', 'getConversations', 'updateConversation', 'addMessage', 'getRecentMessages', 'markSyncedToLore'];
test('every public CRUD pins one operation and awaits its local database', () => {
  for (const name of publicCrud) {
    const body = extractFunctionBody(source, name);
    assert.match(body, /^\s*const operation = beginOperation\(\);/);
    assert.match(body, /await operation\.dbPromise|(?:createConversationForOperation|getConversationInContext|queryConversationsForOperation)\(operation,/);
    assert.doesNotMatch(body, /ensureConnection\(|\bcurrentChatId\b|\bdb!/);
  }
});
test('compound CRUD reuses internal context helpers and validates partition ownership', () => {
  assert.doesNotMatch(extractFunctionBody(source, 'updateConversation'), /await getConversation\(/);
  assert.match(extractFunctionBody(source, 'updateConversation'), /getConversationInContext\(operation,/);
  assert.match(extractFunctionBody(source, 'getConversationInContext'), /record\?\.chatId === operation\.chatId/);
  assert.match(extractFunctionBody(source, 'markSyncedToLore'), /validateMessageIdsInContext\(operation,/);
  const updateBody = extractFunctionBody(source, 'updateConversation');
  assert.ok(updateBody.indexOf('...updates') < updateBody.indexOf('id: conversation.id'));
  assert.ok(updateBody.indexOf('...updates') < updateBody.indexOf('chatId: operation.chatId'));
});
test('legacy connection helpers are compatibility-only and no CRUD calls them', () => {
  assert.match(source, /async function ensureConnection/);
  for (const name of publicCrud) assert.doesNotMatch(extractFunctionBody(source, name), /ensureConnection\(|getChatId\(/);
});
```

- [ ] **Step 2: 运行并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/chatPartitionOperations.test.js" "src/小手机/脚本/__tests__/chatDatabaseSourceContract.test.js"
```

Expected: partition behavior 1 test FAIL（模块不存在）；database contract 3 tests FAIL（公共 CRUD 未固定 context、复合操作嵌套、旧 helper 仍被调用）。

- [ ] **Step 3: 实现可行为测试的分区操作**

```ts
export function buildConversationRecord(operation: { chatId: string }, data: { type: 'private' | 'group'; members: string[]; name?: string }, now: number) {
  const name = data.name || (data.type === 'private' ? data.members[0] : `群聊_${now}`);
  return { id: `conv_${operation.chatId}_${data.type}_${name}_${now}`, chatId: operation.chatId, type: data.type, name, members: data.members, createdAt: now, updatedAt: now };
}
export async function createConversationForOperation<TDatabase, TResult>(operation: { chatId: string; dbPromise: Promise<TDatabase> }, data: { type: 'private' | 'group'; members: string[]; name?: string }, now: number, write: (database: TDatabase, record: ReturnType<typeof buildConversationRecord>) => TResult | Promise<TResult>): Promise<TResult> {
  const database = await operation.dbPromise;
  return write(database, buildConversationRecord(operation, data, now));
}
export async function queryConversationsForOperation<TDatabase, TResult>(operation: { chatId: string; dbPromise: Promise<TDatabase> }, getIndex: (database: TDatabase) => { getAll(chatId: string): TResult | Promise<TResult> }): Promise<TResult> {
  const database = await operation.dbPromise;
  return getIndex(database).getAll(operation.chatId);
}
```

- [ ] **Step 4: 接入 operation-local CRUD**

同步读取当前 chatId：

```ts
function readCurrentChatId(): string {
  try { return String((window.parent as any).SillyTavern?.getContext?.()?.chatId || 'default'); }
  catch { return 'default'; }
}
const beginOperation = createChatOperationContextFactory({
  readChatId: readCurrentChatId,
  openDatabase: openDB,
  onDiagnosticChatId: chatId => { currentChatId = chatId; },
});
```

七个公共 CRUD `createConversation/getConversation/getConversations/updateConversation/addMessage/getRecentMessages/markSyncedToLore` 的第一条执行语句都是 `const operation = beginOperation()`；随后从 `await operation.dbPromise` 得到局部 database。对象和索引只使用 `operation.chatId`。

内部 helper 固定为：

```ts
async function getConversationInContext(operation: ChatOperationContext<IDBDatabase>, id: string) {
  const database = await operation.dbPromise;
  const record = await readConversationById(database, id);
  return record?.chatId === operation.chatId ? record : undefined;
}
async function requireConversationInContext(operation: ChatOperationContext<IDBDatabase>, id: string) {
  const conversation = await getConversationInContext(operation, id);
  if (!conversation) throw new Error(`会话不存在于当前聊天分区: ${id}`);
  return conversation;
}
```

`updateConversation/addMessage/getRecentMessages` 在事务前 require conversation。`markSyncedToLore` 对每条 message 读取 `conversationId`，只更新其 conversation 通过 operation chatId 校验的记录。复合操作只传同一个 operation，不调用另一公共 CRUD。共享 `db/currentChatId` getter仅保留诊断兼容。

准确事务策略：

- `createConversation` 用 `buildConversationRecord(operation, data, Date.now())`，在局部 database 的 conversations readwrite transaction add 并等待 transaction complete。
- `getConversation` 只返回 `getConversationInContext(operation, id)`。
- `getConversations` 调用 `queryConversationsForOperation(operation, database => database.transaction(...).objectStore(...).index('chatId'))`；helper 自己 await 同一个 operation.dbPromise 并以 operation.chatId 调用 index.getAll。
- `updateConversation` 先用同一 operation 读取并校验，再以局部 database 单独 readwrite put。
- `addMessage` 先 require conversation；再开局部 database 的 messages+conversations readwrite transaction，add message 并用已校验 conversation 的副本更新 updatedAt/put，不在 transaction 内重新抓 context。
- `getRecentMessages` 先 require conversation，再以局部 database cursor 读取。
- `markSyncedToLore` 先用局部 database readonly transaction 读取所有目标 message；结束该 transaction 后，对唯一 conversationId 逐一调用 `getConversationInContext(operation, id)` 完成预校验；只有全部属于 captured chatId 的 message ID 进入新的 messages readwrite transaction。避免在活动 write transaction 中嵌套另一个 transaction。

`updateConversation` 合并更新时强制恢复身份字段：`{ ...conversation, ...updates, id: conversation.id, chatId: operation.chatId, updatedAt: Date.now() }`；源码契约断言 `id/chatId` 出现在 `...updates` 之后，调用者不能迁移分区或改主键。

旧 `getChatId/ensureConnection` 保留导出兼容，但 ensureConnection 只 `const operation = beginOperation(); await operation.dbPromise;`；没有公共 CRUD 调用它。共享 `db` 改名 `latestDatabase` 并只由 `openDB().onsuccess` 更新供诊断 getter。

- [ ] **Step 5: 运行数据库测试并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/chatOperationContext.test.js" "src/小手机/脚本/__tests__/chatPartitionOperations.test.js" "src/小手机/脚本/__tests__/chatDatabaseSourceContract.test.js"
```

Expected: 6 tests PASS（operation 2 + partition behavior 1 + database contract 3），0 failures。

### Task 9: 实现 ChatSync 防抖取消

**Files:**
- Create: `src/小手机/脚本/聊天正文联动/pendingSyncTimers.ts`
- Modify: `src/小手机/脚本/聊天正文联动/index.ts`
- Create: `src/小手机/脚本/__tests__/pendingSyncTimers.test.js`

- [ ] **Step 1: 写完整行为失败测试**

```js
require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cancelPendingTimers } = require('../聊天正文联动/pendingSyncTimers.ts');

test('cancelPendingTimers clears every token once, empties the map, and never runs callbacks', () => {
  let callbacks = 0;
  const tokens = [{ id: 1, run: () => callbacks++ }, { id: 2, run: () => callbacks++ }, { id: 3, run: () => callbacks++ }];
  const timers = new Map(tokens.map(token => [token.id, token]));
  const cleared = [];
  cancelPendingTimers(timers, token => cleared.push(token.id));
  cancelPendingTimers(timers, token => cleared.push(token.id));
  assert.deepEqual(cleared, [1, 2, 3]);
  assert.equal(timers.size, 0);
  assert.equal(callbacks, 0);
});
test('ChatSync exports cancelPending through the actual object', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../聊天正文联动/index.ts'), 'utf8');
  const object = source.match(/const ChatSync\s*=\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(object);
  assert.match(object[1], /\bcancelPending\b/);
  const body = source.match(/function cancelPending\(\)[^{]*\{([\s\S]*?)\n\s*\}/);
  assert.ok(body);
  assert.match(body[1], /cancelPendingTimers\(syncTimers,\s*clearTimeout\)/);
  assert.doesNotMatch(body[1], /syncToChatLore/);
});
```

- [ ] **Step 2: 运行并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/pendingSyncTimers.test.js"
```

Expected: 2 tests FAIL，helper 和 ChatSync 导出尚不存在。

- [ ] **Step 3: 实现并接入**

```ts
export function cancelPendingTimers<TKey, TTimer>(timers: Map<TKey, TTimer>, clear: (timer: TTimer) => void): void {
  for (const timer of timers.values()) clear(timer);
  timers.clear();
}
```

`ChatSync.cancelPending()` 调用 `cancelPendingTimers(syncTimers, clearTimeout)`；不调用 `syncToChatLore()`；加入导出对象。

- [ ] **Step 4: 运行并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/pendingSyncTimers.test.js"
```

Expected: 2 tests PASS，0 failures。

### Task 10: 完成 CHAT_CHANGED 事件顺序与监听清理

**Files:**
- Modify: `src/小手机/脚本/小手机主程序/index.ts`
- Create: `src/小手机/脚本/__tests__/phoneChatLifecycleSourceContract.test.js`

- [ ] **Step 1: 写可执行生命周期源码测试**

文件开头独立加载：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { readSource, extractFunctionBody } = require('./sourceTestUtils.js');
const source = readSource('../小手机主程序/index.ts');
```

三个命名测试：

```js
test('handleChatChanged follows the exact non-destructive sequence', () => {
  const body = extractFunctionBody(source, 'handleChatChanged');
  const tokens = ['if (chatId === currentChatId) return', 'contextGeneration += 1', "bus.emit('chat-context-changed', { chatId, generation: contextGeneration })", 'ChatCore?.abort?.()', 'ChatSync?.cancelPending?.()', 'goHome()', 'phoneIframe?.hide()'];
  let previous = -1;
  for (const token of tokens) { const index = body.indexOf(token); assert.ok(index > previous, `expected ordered ${token}`); previous = index; }
  assert.doesNotMatch(body, /destroy\(|\.remove\(|\.unmount\(|\$entry\.remove/);
});
test('destroy stops and clears the exact CHAT_CHANGED handle', () => {
  assert.match(source, /chatChangedHandle\s*=\s*eventOn\(tavern_events\.CHAT_CHANGED,\s*handleChatChanged\)/);
  const body = extractFunctionBody(source, 'destroy');
  assert.ok(body.indexOf('chatChangedHandle?.stop()') < body.indexOf('chatChangedHandle = null'));
});
test('PhoneSystem exports getContextGeneration', () => {
  const object = source.match(/const PhoneSystem\s*=\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(object); assert.match(object[1], /\bgetContextGeneration\b/);
});
```

- [ ] **Step 2: 运行并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/phoneChatLifecycleSourceContract.test.js"
```

Expected: 3 tests FAIL：事件顺序、非永久切换、监听清理/公开 generation 尚不存在。

- [ ] **Step 3: 实现准确事件源与顺序**

```ts
let contextGeneration = 0;
let currentChatId = String((window.parent as any).SillyTavern?.getContext?.()?.chatId || 'default');
let chatChangedHandle: { stop(): void } | null = null;
function getContextGeneration(): number { return contextGeneration; }
function handleChatChanged(callbackChatId?: unknown): void {
  const chatId = String(callbackChatId || (window.parent as any).SillyTavern?.getContext?.()?.chatId || 'default');
  if (chatId === currentChatId) return;
  currentChatId = chatId;
  contextGeneration += 1;
  bus.emit('chat-context-changed', { chatId, generation: contextGeneration });
  (window.parent as any).ChatCore?.abort?.();
  (window.parent as any).ChatSync?.cancelPending?.();
  goHome();
  phoneIframe?.hide();
}
chatChangedHandle = eventOn(tavern_events.CHAT_CHANGED, handleChatChanged);
```

`destroy()` 开头调用 `chatChangedHandle?.stop(); chatChangedHandle = null;`，且幂等；PhoneSystem 加入 `getContextGeneration`。切换 handler 不调用永久 teardown，保留 entry 和 iframe。

- [ ] **Step 4: 运行并确认 GREEN**

```powershell
node --test "src/小手机/脚本/__tests__/phoneChatLifecycleSourceContract.test.js"
```

Expected: 3 tests PASS，0 failures。

### Task 11: generation 守卫覆盖列表、消息与发送 await 边界

**Files:**
- Modify: `src/小手机/脚本/聊天APP/index.ts`
- Create: `src/小手机/脚本/__tests__/chatGenerationGuardsSource.test.js`

- [ ] **Step 1: 写可执行源码守卫失败测试**

文件开头独立加载：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { readSource, extractFunctionBody } = require('./sourceTestUtils.js');
const source = readSource('../聊天APP/index.ts');
```

测试提取函数体并使用 token index 断言。三个命名测试：

```js
test('component and modal context tokens are separate and phone generation is mandatory', () => {
  assert.match(source, /getContextGeneration\(\): number/);
  assert.match(source, /function captureComponentContext/);
  assert.match(source, /function captureModalContext/);
  assert.doesNotMatch(extractFunctionBody(source, 'captureComponentContext'), /modalGeneration/);
  assert.match(extractFunctionBody(source, 'captureModalContext'), /modalGeneration/);
});
test('list and message loads guard the same captured component token after awaits', () => {
  for (const name of ['loadConversations', 'loadMessages']) {
    const body = extractFunctionBody(source, name);
    const capture = body.indexOf('const context = captureComponentContext()');
    const awaited = body.indexOf('await ', capture);
    const guard = body.indexOf('isComponentContextCurrent(context)', awaited);
    assert.ok(capture >= 0 && awaited > capture && guard > awaited, `${name} guard order`);
  }
});
test('send guards after message and reply awaits before downstream effects', () => {
  const body = extractFunctionBody(source, 'sendMessage');
  const capture = body.indexOf('const sendContext = captureComponentContext()');
  const addAwait = body.indexOf('await ChatDB.addMessage', capture);
  const addGuard = body.indexOf('isComponentContextCurrent(sendContext)', addAwait);
  const userPush = body.indexOf('store.messages.push(userMsg)', addGuard);
  const coreCall = Math.min(...['await ChatCore.generateGroupReply', 'await ChatCore.generatePrivateReply'].map(token => { const i = body.indexOf(token, addGuard); return i < 0 ? Infinity : i; }));
  const replyGuard = body.indexOf('isComponentContextCurrent(sendContext)', coreCall);
  const replyPush = body.indexOf('store.messages.push(r)', replyGuard);
  const sync = body.indexOf('ChatSync.instantSync', replyGuard);
  assert.ok(capture >= 0 && addAwait > capture && addGuard > addAwait && userPush > addGuard && coreCall > userPush && replyGuard > coreCall && replyPush > replyGuard && sync > replyPush);
  assert.match(body, /catch[\s\S]*isComponentContextCurrent\(sendContext\)/);
  assert.match(body, /finally[\s\S]*isComponentContextCurrent\(sendContext\)/);
});
```

- [ ] **Step 2: 运行并确认 RED**

```powershell
node --test "src/小手机/脚本/__tests__/chatGenerationGuardsSource.test.js"
```

Expected: 3 tests FAIL：generation 尚为可选，messages/send await 边界无守卫。

- [ ] **Step 3: 接入固定 token**

`PhoneSystemLike.getContextGeneration(): number` 改为必选。把 Chunk 2 的通用 capture 拆为 `captureComponentContext()`（componentGeneration + phone generation）和 `captureModalContext()`（在 component token 上增加 modalGeneration）；列表、消息、发送使用 component token，候选和创建协调器使用 modal token。`loadConversations/loadMessages` 各捕获 component token，在 success/catch/scroll 的每次 store 或 DOM 写入前核验。

`sendMessage()` 在清输入/置 generating 前捕获 `sendContext`；await `ChatDB.addMessage` 后若 stale 立即 return，不 push、不调用 ChatCore；await reply 后若 stale return，不 push、不 ChatSync；catch 仅在 current 时 push error；finally 仅在 current 时清 generating/scroll。已经写入旧 IDB 的用户消息保留旧分区。

- [ ] **Step 4: 运行 Chunk 3 全部测试**

```powershell
node --test "src/小手机/脚本/__tests__/chatOperationContext.test.js" "src/小手机/脚本/__tests__/chatPartitionOperations.test.js" "src/小手机/脚本/__tests__/chatDatabaseSourceContract.test.js" "src/小手机/脚本/__tests__/pendingSyncTimers.test.js" "src/小手机/脚本/__tests__/phoneChatLifecycleSourceContract.test.js" "src/小手机/脚本/__tests__/chatGenerationGuardsSource.test.js"
```

Expected: 14 tests PASS（operation 2 + partition behavior 1 + database contract 3 + timers 2 + lifecycle 3 + generation guards 3），0 failures。

- [ ] **Step 5: 提交 Chunk 3**

```powershell
git add -- "src/小手机/脚本/聊天数据库" "src/小手机/脚本/聊天正文联动" "src/小手机/脚本/聊天APP/index.ts" "src/小手机/脚本/小手机主程序/index.ts" "src/小手机/脚本/__tests__/sourceTestUtils.js" "src/小手机/脚本/__tests__/chatOperationContext.test.js" "src/小手机/脚本/__tests__/chatPartitionOperations.test.js" "src/小手机/脚本/__tests__/chatDatabaseSourceContract.test.js" "src/小手机/脚本/__tests__/pendingSyncTimers.test.js" "src/小手机/脚本/__tests__/phoneChatLifecycleSourceContract.test.js" "src/小手机/脚本/__tests__/chatGenerationGuardsSource.test.js"
git commit -m "fix: isolate phone chat lifecycle by chat id"
```

## Chunk 4: 综合验证

### Task 7: 静态、构建与运行验证

**Files:**
- Modify only if a test exposes a defect: files already listed above

- [ ] **Step 1: 运行全部小手机定向测试**

```powershell
node --test "src/小手机/脚本/__tests__/*.test.js"
```

Expected: 51 tests PASS（Chunk 1: 17 + Chunk 2: 20 + Chunk 3: 14），0 failures。若 glob 发现数不是 51，视为失败并改用显式文件列表排查遗漏。

- [ ] **Step 2: 运行小手机 ESLint**

```powershell
pnpm exec eslint "src/小手机/脚本/**/*.ts" --max-warnings=0
```

Expected: 0 errors、0 warnings。现有正则无效转义属于本次小手机校验范围，必须一并机械修正，不改变匹配语义。

若 Step 1 或 Step 2 触发任何源码/测试修正，修正后必须重新运行完整 51 tests 和同一个 `--max-warnings=0` ESLint 命令，直到两者同时通过；不能拿修正前的结果进入隔离构建。

- [ ] **Step 3: 在临时干净 worktree 运行生产构建**

先执行 scoped pre-build checkpoint。Chunks 1–3 已提交；测试/ESLint 后实际发生修正的文件只从完整任务白名单中逐文件暂存：

```powershell
$taskSourceAllowlist = @(
  'src/小手机/脚本/小手机主程序/index.ts',
  'src/小手机/脚本/小手机主程序/phoneAppController.ts',
  'src/小手机/脚本/小手机主程序/phoneAppRegistry.ts',
  'src/小手机/脚本/聊天APP/index.ts',
  'src/小手机/脚本/聊天APP/statDataRootNames.ts',
  'src/小手机/脚本/聊天APP/conversationCreation.ts',
  'src/小手机/脚本/聊天APP/conversationCreationCoordinator.ts',
  'src/小手机/脚本/聊天APP/chatRendererLifecycle.ts',
  'src/小手机/脚本/聊天核心/index.ts',
  'src/小手机/脚本/聊天数据库/index.ts',
  'src/小手机/脚本/聊天数据库/chatOperationContext.ts',
  'src/小手机/脚本/聊天数据库/chatPartitionOperations.ts',
  'src/小手机/脚本/聊天正文联动/index.ts',
  'src/小手机/脚本/聊天正文联动/pendingSyncTimers.ts'
)
$preexistingStaged = @(git diff --cached --name-only)
if ($preexistingStaged.Count -ne 0) { throw "pre-build 前存在未预期 staged 文件: $($preexistingStaged -join ', ')" }
foreach ($path in $taskSourceAllowlist) {
  if (Test-Path -LiteralPath $path) { git add -- $path }
}
git diff --cached --check
git diff --cached --name-status
git diff --cached
$stagedNames = @(git diff --cached --name-only)
$unexpectedStaged = @($stagedNames | Where-Object { $_ -notin $taskSourceAllowlist })
if ($unexpectedStaged.Count -ne 0) { throw "scoped pre-build allowlist 外文件: $($unexpectedStaged -join ', ')" }
git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
  git commit -m "chore: prepare verified phone sources"
  if ($LASTEXITCODE -ne 0) { throw 'scoped pre-build commit failed' }
} elseif ($LASTEXITCODE -ne 0) {
  throw 'failed to inspect staged pre-build changes'
}
$remainingTaskChanges = @(git status --porcelain -- $taskSourceAllowlist)
if ($remainingTaskChanges.Count -ne 0) { throw "任务源码仍有未提交修正: $($remainingTaskChanges -join '; ')" }
$entrySources = @(
  'src/小手机/脚本/小手机主程序/index.ts',
  'src/小手机/脚本/聊天APP/index.ts',
  'src/小手机/脚本/聊天核心/index.ts',
  'src/小手机/脚本/聊天数据库/index.ts',
  'src/小手机/脚本/聊天正文联动/index.ts'
)
foreach ($entry in $entrySources) {
  git cat-file -e "HEAD:$entry"
  if ($LASTEXITCODE -ne 0) { throw "HEAD 缺少小手机入口: $entry" }
}
git status --short
```

Expected: cached diff 只能包含 `$taskSourceAllowlist` 中实际有差异的文件；通常至少包含首次纳入 HEAD 的 ChatCore。commit/空跳过后任务源码 scope 必须干净，五个 `cat-file` 都成功，其他用户修改仍未暂存。随后再次执行 51 tests 与 zero-warning ESLint；两者任一失败就返回修正/commit 循环，不能创建 worktree。

```powershell
$repoPath = (git rev-parse --show-toplevel).Trim()
$verifyPath = Join-Path (Split-Path $repoPath -Parent) ("tavern-helper-phone-build-" + [guid]::NewGuid().ToString('N'))
$verifyPath = [System.IO.Path]::GetFullPath($verifyPath)
if ((Split-Path $verifyPath -Parent) -ne (Split-Path $repoPath -Parent)) { throw '验证 worktree 必须是仓库的唯一兄弟目录' }
git worktree add --detach $verifyPath HEAD
$mainHead = (git -C $repoPath rev-parse HEAD).Trim()
$verifyHead = (git -C $verifyPath rev-parse HEAD).Trim()
if ($verifyHead -ne $mainHead) { throw "验证 worktree HEAD 不一致: $verifyHead != $mainHead" }
Push-Location $verifyPath
try {
  pnpm install --frozen-lockfile --offline
  if ($LASTEXITCODE -ne 0) { throw "临时 worktree pnpm install 失败: $LASTEXITCODE" }
  pnpm exec webpack --config (Join-Path $verifyPath 'webpack.config.ts') --mode production
  $webpackExit = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($webpackExit -ne 0) { throw "隔离 webpack 构建失败: $webpackExit" }
```

Expected: exit 0；临时 worktree 的 `dist/小手机/脚本/` 下五个入口均生成 `index.js`。当前工作区其他 `dist/**` 文件的时间戳和内容不发生变化。

若离线安装因本机 pnpm store 缺包而失败，保留 worktree 并报告，不自动改用会更新锁文件的命令；用户允许后才在该临时 worktree 做联网 frozen install。

- [ ] **Step 4: 只复制小手机构建产物并清理临时 worktree**

先验证 `$verifyPath` 是刚创建的绝对兄弟目录且 `git -C $verifyPath rev-parse HEAD` 等于当前 HEAD。精确验证并复制十个文件：

```powershell
$phoneEntries = @('小手机主程序', '聊天APP', '聊天核心', '聊天数据库', '聊天正文联动')
$artifactRelativePaths = foreach ($entry in $phoneEntries) {
  "dist/小手机/脚本/$entry/index.js"
  "dist/小手机/脚本/$entry/index.js.map"
}
foreach ($relative in $artifactRelativePaths) {
  $source = Join-Path $verifyPath $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "缺少隔离构建产物: $relative" }
}
if ($artifactRelativePaths.Count -ne 10) { throw "小手机产物白名单数量异常: $($artifactRelativePaths.Count)" }
$beforeHashes = @{}
foreach ($relative in $artifactRelativePaths) {
  $destination = Join-Path $repoPath $relative
  if (Test-Path -LiteralPath $destination -PathType Leaf) { $beforeHashes[$relative] = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash }
  $parent = Split-Path $destination -Parent
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
  Copy-Item -LiteralPath (Join-Path $verifyPath $relative) -Destination $destination -Force
}
git worktree remove --force -- $verifyPath
if ($LASTEXITCODE -ne 0) { throw "临时 worktree 清理失败，保留路径供人工处理: $verifyPath" }
```

Expected: `$artifactRelativePaths.Count -eq 10` 且十个文件均存在；当前工作区只覆盖这些已授权的小手机目标。`$beforeHashes` 留在验证记录中，便于报告哪些既有产物被替换。不复制目录或其他 dist。若 worktree 删除失败，保留并报告，不用递归文件删除强行清理。

- [ ] **Step 5: 以逐文件白名单暂存并检查完整差异**

先用 `git status --short` 记录所有未跟踪/修改项。Chunks 1–3 源码和测试已经提交，此处只暂存十个已验证构建文件，以及确有必要且已逐文件审查的 post-build 修正；禁止目录级 add。

```powershell
git add -- `
  "dist/小手机/脚本/小手机主程序/index.js" "dist/小手机/脚本/小手机主程序/index.js.map" `
  "dist/小手机/脚本/聊天APP/index.js" "dist/小手机/脚本/聊天APP/index.js.map" `
  "dist/小手机/脚本/聊天核心/index.js" "dist/小手机/脚本/聊天核心/index.js.map" `
  "dist/小手机/脚本/聊天数据库/index.js" "dist/小手机/脚本/聊天数据库/index.js.map" `
  "dist/小手机/脚本/聊天正文联动/index.js" "dist/小手机/脚本/聊天正文联动/index.js.map"
git diff --check -- "docs/superpowers/plans/2026-07-21-phone-chat-renderer-repair.md" "src/小手机/脚本/小手机主程序" "src/小手机/脚本/聊天APP" "src/小手机/脚本/聊天数据库" "src/小手机/脚本/聊天正文联动" "src/小手机/脚本/聊天核心"
git status --short
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git diff --cached
```

Expected: scoped/cached 无空白错误；此最终 cached name-status 只能包含上述十个 dist 产物。计划、规格、源码、测试应已经在各自 scoped commit 中；其他用户修改和未跟踪文件保持 unstaged。若全局 `git diff --check` 因用户既有改动失败，只报告，不修改无关文件。

- [ ] **Step 6: 在可丢弃的新酒馆聊天分区做真实运行验证**

先新建并记录两个明确可丢弃的 SillyTavern 聊天文件 `phone-verification-A` 与 `phone-verification-B` 的真实 `chatId`。所有私聊/群聊写入与 A→B→A 切换只在这两个新分区进行；实现不删除或迁移它们。如果无法安全建立两个测试分区，则将创建和跨聊天现场验证标为未完成。

打开酒馆助手脚本列表并确认实时监听开关。三种加载顺序分别独立执行，不能以一次最终状态代替：

1. 主程序先：暂时关闭聊天 APP 脚本，加载/打开手机看到桌面；再启用聊天 APP，观察微信图标晚注册出现并可挂载。
2. 聊天脚本先：关闭主程序、启用聊天脚本，确认等待中无报错；再启用主程序，确认只注册一个微信图标/renderer。
3. 热重载：微信可见且已打开时关闭再启用聊天脚本，确认旧实例卸载一次、新实例出现，无重复 DOM/事件。

每次改变加载顺序后按酒馆助手实际脚本开关重新加载对应脚本；只有切换全局加载顺序时才全页刷新。记录控制台 `[PhoneSystem]`、`[聊天APP]` 注册/挂载日志。

在可丢弃 chatId 中逐项观察：

- 初始空库显示“暂无聊天记录”。读取失败使用精确可逆注入：控制台执行 `window.__phoneChatOriginalGetConversations = window.ChatDB.getConversations; window.ChatDB.getConversations = async () => { throw new Error('phone-chat-verification'); };`，重新打开 APP 验证错误/重试且不显示空状态；观察后无条件执行 `window.ChatDB.getConversations = window.__phoneChatOriginalGetConversations; delete window.__phoneChatOriginalGetConversations;` 并断言 `typeof window.ChatDB.getConversations === 'function'`。恢复完成是继续创建/切换测试的前置条件；恢复失败则立即重载聊天数据库脚本并重新确认，再继续。
- 空/非空列表都有“＋”；宏根键候选每次打开弹窗刷新。
- 私聊选择一个姓名成功；再次选择相同姓名直接打开已有私聊，数据库无重复 private。
- 群聊少于两人确认按钮禁用；两人群聊创建成功。
- 临时点击入口隐藏/显示，保持同一聊天视图与输入状态。
- 返回桌面再打开只有一个 renderer DOM 和一组事件。
- Chat A 发起慢回复后切 Chat B：入口保留、手机隐藏/回桌面、旧回复 abort、pending ChatSync 不写 B；打开只显示 B 分区。
- 切回 Chat A 后恢复 A 的会话。
- 控制台无 renderer/mount/cleanup/IndexedDB 未处理错误。

Expected: 全链路通过。若没有可连接浏览器，最终报告必须明确标为“静态与构建已验证，真实酒馆运行验证未完成”，不得声称现场故障已完全关闭。

若现场任一用例暴露源码缺陷：不得提交当前 staged bundle。用十个精确 artifact path 执行 `git restore --staged -- <十文件>`（只取消暂存，不丢弃文件），实施 scoped 源码修正，然后重新执行 51 tests、zero-warning ESLint、pre-build allowlist commit、隔离构建、十文件验证/复制/暂存，并重跑失败现场用例及其相邻生命周期用例。只有新一轮全部通过才能进入最终 bundle commit。

- [ ] **Step 7: 提交最终白名单文件**

使用 Step 5 已审查的十文件 cached 集合提交；提交前再次运行并证明：

```powershell
git diff --cached --check
git commit -m "build: refresh phone chat bundles"
git show --stat --oneline HEAD
git status --short
```

Expected: final commit 只包含十个 reviewed `dist/小手机/脚本/*/index.js{,.map}`；其他用户修改和未跟踪文件仍显示在 status 且未进入提交。不得用目录级 add 补文件。若 ESLint 机械修正了 ChatCore，它已在 Step 3 pre-build commit 中逐文件审查，而不是混入 bundle commit。

最终交付分四项独立报告：Node 定向测试、ESLint、隔离生产构建与五个输出、真实酒馆运行验证。任一静态测试、lint 或构建失败/跳过都不能声称修复完成；浏览器不可用时只声明前三项的实际结果并保留现场验证缺口。

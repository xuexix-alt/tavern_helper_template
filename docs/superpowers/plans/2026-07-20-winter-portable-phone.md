# Winter Portable Phone Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `末世寒冬 - 星穹秩序` 实现一个由统一运行时管理、可迁移到其他角色卡的首版小手机，并以最小桥接接入 same-layer-pre。

**Architecture:** 通用平台位于 `src/小手机平台`，通过六个无启动副作用的注册脚本提供运行时、数据、AI、调度、外壳和 APP；寒冬目录只提供第七个适配器脚本、MVU通讯事实和 Pre 入口桥。所有异步业务捕获不可变 session，完整聊天进 IndexedDB，当前聊天 ChatLore 只接收聚合的 8/10 条截短记录。

**Tech Stack:** TypeScript、IndexedDB、Tavern Helper APIs、SillyTavern/MVU events、Vue宿主中的纯DOM PhoneShell、Zod、Node assert/ts-node、Webpack、Playwright smoke checks。

**Design:** `docs/superpowers/specs/2026-07-20-winter-portable-phone-design.md`

---

## File map

### 通用平台

- `src/小手机平台/core/types.ts`：跨模块契约、状态、session、owner、角色引用。
- `src/小手机平台/core/eventBus.ts`：可释放的类型化事件总线。
- `src/小手机平台/core/moduleRegistry.ts`：pending注册、固定依赖校验、去重和整实例dispose。
- `src/小手机平台/core/runtime.ts`：唯一 `window.top.TavernPhone` 实现和生命周期。
- `src/小手机平台/core/register.ts`：管理器未就绪时的无副作用注册助手。
- `src/小手机平台/platform/hostGateway.ts`：酒馆上下文、角色卡/聊天切换和公共事件适配。
- `src/小手机平台/platform/settingsStore.ts`：按角色卡命名空间存储 Provider/主题设置，密钥不进入事件。
- `src/小手机平台/data/phoneDb.ts`：按 sessionKey 的 IndexedDB 会话、消息、任务和同步状态。
- `src/小手机平台/data/loreSummary.ts`：私聊8条/群聊10条/80字/800字的纯函数。
- `src/小手机平台/data/chatLoreSync.ts`：500ms防抖、捕获worldbookName、单写队列和批次提交。
- `src/小手机平台/ai/jailbreakLayers.ts`：房东卡三层固定原文。
- `src/小手机平台/ai/promptAssembler.ts`：稳定快照到 assembledPrompt。
- `src/小手机平台/ai/responseParser.ts`：JSON提取、修复候选和会话成员校验。
- `src/小手机平台/ai/providers.ts`：OpenAI-compatible与Tavern generateRaw Provider。
- `src/小手机平台/scheduler/phoneScheduler.ts`：确定性候选、资格、去重、冷却和配额。
- `src/小手机平台/shell/phoneShell.ts`：top层手机壳、路由、焦点、Escape、主题和纯文本渲染。
- `src/小手机平台/shell/phoneShell.css`：Apple系统表面与无障碍媒体查询。
- `src/小手机平台/apps/phoneApps.ts`：桌面、消息、通讯录、广播、任务、设置和诊断。
- `webpack.config.ts`：可选 `TAVERN_BUILD_PREFIXES` 入口过滤，保护其他脏dist。
- `dump_schema.ts`：可选 `TAVERN_SCHEMA_PREFIXES` schema过滤，避免全仓生成。
- `scripts/package-winter-phone-card.mjs`：原子更新本地寒冬PNG的世界书和七个脚本。
- `scripts/test-package-winter-phone-card.mjs`：对临时PNG做解码往返和内容断言。

### 七个部署入口

- `src/小手机平台/脚本/00运行时管理器/index.ts`
- `src/小手机平台/脚本/10平台服务/index.ts`
- `src/小手机平台/脚本/20数据与同步/index.ts`
- `src/小手机平台/脚本/30AI与调度/index.ts`
- `src/小手机平台/脚本/40手机外壳/index.ts`
- `src/小手机平台/脚本/50通信与情报APP/index.ts`
- `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- `src/寒冬末日/脚本/小手机-90寒冬适配器/winterAdapterCore.ts`

### 寒冬接入

- `src/寒冬末日/schema.ts`：通讯对象和世界通讯网络。
- `src/寒冬末日/schema.json`：由 schema dump 生成。
- `src/寒冬末日/世界书/寒冬末日/[initvar].yaml`：保守初值。
- `src/寒冬末日/世界书/寒冬末日/initvar.schema.json`：初始化变量校验。
- `src/寒冬末日/世界书/变量/变量列表.txt`：模型可见字段列表。
- `src/寒冬末日/世界书/变量/临时NPC变量结构示意.txt`：临时NPC通讯字段。
- `src/寒冬末日/世界书/变量/[mvu_update]变量更新规则.yaml`：交换联系方式、T2/T4分发约束。
- `src/寒冬末日/世界书/变量/[mvu_update]变量输出格式.yaml`：通讯更新示例。
- `src/寒冬末日/same-layer-pre/界面/状态栏/phoneBridge.ts`：可选全局桥。
- `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`：重生左侧入口。
- `src/寒冬末日/脚本/小手机-90寒冬适配器/README.md`：七个构建产物与卡内导入顺序。

### 测试

- `src/小手机平台/__tests__/runtime.test.ts`
- `src/小手机平台/__tests__/data.test.ts`
- `src/小手机平台/__tests__/ai.test.ts`
- `src/小手机平台/__tests__/scheduler.test.ts`
- `src/小手机平台/__tests__/shellSource.test.js`
- `src/寒冬末日/__tests__/winterPhoneSource.test.js`
- `src/寒冬末日/__tests__/winterPhoneSchema.test.ts`
- `src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`
- `src/寒冬末日/__tests__/phoneBridge.test.ts`
- `src/寒冬末日/__tests__/sameLayerPreSource.test.js`（只增加入口契约）

---

### Task 1: 建立纯契约、session、宿主桥和运行时注册骨架

**Files:**
- Create: `src/小手机平台/core/types.ts`
- Create: `src/小手机平台/core/eventBus.ts`
- Create: `src/小手机平台/core/register.ts`
- Create: `src/小手机平台/core/moduleRegistry.ts`
- Create: `src/小手机平台/core/runtime.ts`
- Create: `src/小手机平台/__tests__/runtime.test.ts`

- [ ] **Step 1: 写失败测试：乱序注册、重复注册、owner和dispose**

```ts
import assert from 'node:assert/strict';
import { ModuleRegistry } from '../core/moduleRegistry';

const registry = new ModuleRegistry();
registry.register(fake('apps', ['shell']));
registry.register(fake('shell', []));
assert.deepEqual(registry.resolveOrder(), ['shell', 'apps']);
registry.register(fake('shell', []));
assert.equal(registry.list().filter(x => x.id === 'shell').length, 1);

const runtime = createRuntimeForTest();
const detach = runtime.attachHostBridge({ id: 'same-layer-pre', submitAction: action => received.push(action) });
await runtime.submitActionToHost({ kind: 'composer.insert', text: '检查供暖', sourceKey: 'task:heat', mode: 'replace' });
assert.equal(received.length, 1);
detach();
await assert.rejects(() => runtime.submitActionToHost(validAction), /host bridge/i);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/runtime.test.ts`  
Expected: FAIL，模块文件不存在。

- [ ] **Step 3: 实现最小契约与运行时**

关键约束：

```ts
export const PENDING_KEY = '__TAVERN_PHONE_PENDING_MODULES__';
export const RUNTIME_KEY = 'TavernPhone';

export function makeSessionKey(owner: PhoneOwner, chatId: string) {
  return `${owner.characterName}::${chatId}`;
}
```

注册器只实现固定依赖拓扑、缺失必需模块、同版本去重和整实例dispose；不实现跨版本在线热替换。`types.ts/runtime.ts`同时实现`PhoneHostAction`、`PhoneHostBridge`、`attachHostBridge()`、disposer和`submitActionToHost()`路由；owner/session变化或bridge释放后拒绝行动。

- [ ] **Step 4: 运行单测和TypeScript检查**

Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/runtime.test.ts`  
Expected: PASS，输出 `runtime tests passed`。

- [ ] **Step 5: 提交范围内变更**

```bash
git add src/小手机平台/core src/小手机平台/__tests__/runtime.test.ts
git commit -m "feat(phone): add managed runtime registry"
```

### Task 2: 增加宿主网关和安全设置存储

**Files:**
- Create: `src/小手机平台/platform/hostGateway.ts`
- Create: `src/小手机平台/platform/settingsStore.ts`
- Modify: `src/小手机平台/__tests__/runtime.test.ts`

- [ ] **Step 1: 写失败测试：切卡/切聊天生成新session，密钥不出现在快照和事件**

```ts
const settings = new SettingsStore(memoryStorage, '末世寒冬 - 星穹秩序');
settings.setSecret('sk-secret');
assert.equal(settings.getPublic().apiKey, undefined);
assert.ok(!JSON.stringify(settings.getPublic()).includes('sk-secret'));
```

- [ ] **Step 2: 运行并确认失败**

Run: Task 1测试命令。  
Expected: FAIL，`SettingsStore`不存在。

- [ ] **Step 3: 实现HostGateway与SettingsStore**

HostGateway只使用公共宿主接口获取当前角色名/chatId、订阅聊天/角色切换；top不可访问时返回明确错误。SettingsStore校验API URL协议，只在`withApiKey(callback)`调用期间取出密钥。

- [ ] **Step 4: 运行测试**

Expected: PASS；恶意 `javascript:` URL被拒绝。

- [ ] **Step 5: 提交**

```bash
git add src/小手机平台/platform src/小手机平台/__tests__/runtime.test.ts
git commit -m "feat(phone): isolate host sessions and secrets"
```

### Task 3: 实现PhoneDB与简单ChatLore同步

**Files:**
- Create: `src/小手机平台/data/phoneDb.ts`
- Create: `src/小手机平台/data/loreSummary.ts`
- Create: `src/小手机平台/data/chatLoreSync.ts`
- Create: `src/小手机平台/__tests__/data.test.ts`

- [ ] **Step 1: 写失败测试：8/10/80/800、批次ID和切聊天**

```ts
const privateSummary = buildLoreSummary(privateMessages(12), { type: 'private' });
assert.equal(countRenderedMessages(privateSummary), 8);
assert.ok(privateSummary.length <= 800);

const broadcastSummary = buildLoreSummary(broadcasts(12), { type: 'broadcast' });
assert.equal(countRenderedMessages(broadcastSummary), 8);
assert.match(broadcastSummary, /confirmed|unverified/);

const batch = captureLoreBatch(sessionA, messagesA);
switchCurrentSession(sessionB);
await sync(batch);
assert.deepEqual(markedIds, batch.messageIds);
assert.equal(writtenWorldbook, batch.worldbookName);
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/data.test.ts`  
Expected: FAIL。

- [ ] **Step 3: 实现纯摘要和IndexedDB仓储接口**

私聊从session全部私聊按`createdAt`取最后8条；群聊取目标会话最后10条；广播取最近8条并保留可信度/来源；每条先截80字，最终超长时保留200字头部和尾部。

- [ ] **Step 4: 实现单写队列和500ms防抖**

私聊、群聊、广播使用三个防抖键；开始即捕获`sessionKey/worldbookName/messageIds`，分别写入三个固定条目，只对本批ID标记同步。兼容内存适配器供测试，浏览器使用IndexedDB。

- [ ] **Step 5: 运行数据测试**

Expected: PASS，包含“防抖期间切聊天仍写原worldbook”。

- [ ] **Step 6: 提交**

```bash
git add src/小手机平台/data src/小手机平台/__tests__/data.test.ts
git commit -m "feat(phone): add isolated database and lore sync"
```

### Task 4: 实现提示词、三层原文和双Provider

**Files:**
- Create: `src/小手机平台/ai/jailbreakLayers.ts`
- Create: `src/小手机平台/ai/promptAssembler.ts`
- Create: `src/小手机平台/ai/responseParser.ts`
- Create: `src/小手机平台/ai/providers.ts`
- Create: `src/小手机平台/__tests__/ai.test.ts`

- [ ] **Step 1: 写失败测试：三层逐字符、裁剪、JSON/XSS与Tavern顺序**

```ts
assert.equal(JAILBREAK_LAYERS.layer1_identity, EXPECTED_LAYER_1);
assert.deepEqual(buildRolePrompts('PROMPT').map(x => x.role),
  ['system', 'system', 'user', 'assistant']);
assert.throws(() => parsePhoneReply('{"messages":[{"sender":"evil","content":"x"}]}', members));
assert.equal(parsePhoneReply(validPayload('<img src=x onerror=alert(1)>'), members)
  .messages[0].content, '<img src=x onerror=alert(1)>');
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/ai.test.ts`  
Expected: FAIL。

- [ ] **Step 3: 从房东卡本地源逐字符复制三层常量**

不得重写文字；`buildRolePrompts`生成固定四条。

- [ ] **Step 4: 实现PromptAssembler和ResponseParser**

中间提示词按协议、模式、档案、MVU、Lore、正文、聊天、输出契约顺序；解析器使用`jsonrepair`只做一次本地修复候选，再进行sender/member/content结构校验。

- [ ] **Step 5: 实现两个Provider**

Tavern调用：

```ts
generateRaw({
  generation_id: id,
  should_stream: false,
  should_silence: true,
  max_chat_history: 0,
  ordered_prompts: buildRolePrompts(assembledPrompt),
});
```

取消映射到`stopGenerationById(id)`；OpenAI Provider用AbortController，401/429/timeout抛出可诊断错误。

- [ ] **Step 6: 运行AI测试**

Expected: PASS；两个Provider请求都含四条相同role/content。

- [ ] **Step 7: 提交**

```bash
git add src/小手机平台/ai src/小手机平台/__tests__/ai.test.ts
git commit -m "feat(phone): add shared prompts and providers"
```

### Task 5: 实现受控调度器

**Files:**
- Create: `src/小手机平台/scheduler/phoneScheduler.ts`
- Create: `src/小手机平台/__tests__/scheduler.test.ts`

- [ ] **Step 1: 写失败测试：资格、去重、冷却、配额、失效快照**

覆盖P0-P3、每快照最多2个AI会话、同联系人间隔2个完成楼层、同会话单请求、session切换取消未开始job。

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/scheduler.test.ts`  
Expected: FAIL。

- [ ] **Step 3: 实现最小事件驱动调度**

只支持网络/通讯、任务/情报、角色阈值、结构化等待回报和低频日常；不分析自然语言承诺。

- [ ] **Step 4: 运行测试并提交**

```bash
git add src/小手机平台/scheduler src/小手机平台/__tests__/scheduler.test.ts
git commit -m "feat(phone): add controlled proactive scheduler"
```

### Task 6: 实现PhoneShell和首版APP

**Files:**
- Create: `src/小手机平台/shell/phoneShell.ts`
- Create: `src/小手机平台/shell/phoneShell.css`
- Create: `src/小手机平台/apps/phoneApps.ts`
- Create: `src/小手机平台/__tests__/shellSource.test.js`

- [ ] **Step 1: 写失败源码契约测试**

```js
const source = readFileSync('src/小手机平台/shell/phoneShell.ts', 'utf8');
assert.match(source, /textContent\s*=/);
assert.doesNotMatch(source, /v-html/);
assert.doesNotMatch(source, /\.innerHTML\s*=\s*(message|content|payload)/);
assert.match(source, /event\.key\s*===\s*['"]Escape['"]/);
assert.match(source, /focus\(\)/);
```

源码断言无`v-html`，无模型内容拼接`innerHTML`；运行时断言Escape关闭后焦点回到入口、路由关闭后保留。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test src/小手机平台/__tests__/shellSource.test.js`  
Expected: FAIL，`phoneShell.ts`不存在。

- [ ] **Step 3: 实现安全DOM helper和手机壳**

```ts
function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}
```

PhoneShell挂到top document单一根节点，使用ShadowRoot隔离样式；所有listener归属dispose袋。

- [ ] **Step 4: 实现桌面与六个页面**

消息、通讯录、广播、任务、设置、诊断只通过模块服务取数据；任务按钮调用`submitActionToHost`。

- [ ] **Step 5: 实现Apple样式与无障碍**

系统字体、中性表面、功能层玻璃、系统蓝/红、44px命中区、浅/深主题及三类reduced preference。

- [ ] **Step 6: 运行测试和TypeScript检查**

Run: `node --test src/小手机平台/__tests__/shellSource.test.js`  
Expected: PASS。Webpack安全范围构建在Task 7过滤器完成后运行。

- [ ] **Step 7: 提交**

```bash
git add src/小手机平台/shell src/小手机平台/apps src/小手机平台/__tests__/shellSource.test.js
git commit -m "feat(phone): add accessible apple phone shell"
```

### Task 7: 创建六个通用部署脚本

**Files:**
- Modify: `webpack.config.ts`
- Create: `src/小手机平台/脚本/00运行时管理器/index.ts`
- Create: `src/小手机平台/脚本/10平台服务/index.ts`
- Create: `src/小手机平台/脚本/20数据与同步/index.ts`
- Create: `src/小手机平台/脚本/30AI与调度/index.ts`
- Create: `src/小手机平台/脚本/40手机外壳/index.ts`
- Create: `src/小手机平台/脚本/50通信与情报APP/index.ts`
- Create: `src/寒冬末日/__tests__/winterPhoneSource.test.js`

- [ ] **Step 1: 写失败源码测试：六个入口只注册不启动，并要求构建范围过滤**

断言每个入口调用`registerPhoneModule`、ID/依赖固定，不直接创建DOM/DB/计时器；断言webpack读取`TAVERN_BUILD_PREFIXES`并在创建config前过滤entries；断言`TAVERN_SKIP_GENERATORS=1`时不注册`schema_dump`和`tavern_sync`插件。

- [ ] **Step 2: 运行并确认失败**

Run: `node --test src/寒冬末日/__tests__/winterPhoneSource.test.js`  
Expected: FAIL，入口不存在。

- [ ] **Step 3: 实现Webpack显式入口过滤**

```ts
const buildPrefixes = (process.env.TAVERN_BUILD_PREFIXES ?? '')
  .split(';').map(value => value.trim().replaceAll('\\', '/')).filter(Boolean);
const selected = buildPrefixes.length === 0
  ? results
  : results.filter(file => buildPrefixes.some(prefix => file.replaceAll('\\', '/').startsWith(prefix)));
```

插件列表同时使用：

```ts
const skipGenerators = process.env.TAVERN_SKIP_GENERATORS === '1';
// skipGenerators时不挂载schema_dump与tavern_sync；watch helper和正常编译不变。
```

默认无变量时保持现状；手机实施期间绝不运行默认全量构建，也不让范围构建触发全量schema/worldbook生成。

- [ ] **Step 4: 实现六个薄入口**

每个入口只提供manifest和factory；管理器入口安装全局后消费pending队列。

- [ ] **Step 5: 安全构建并检查六个dist产物**

Run: `$env:TAVERN_BUILD_PREFIXES='src/小手机平台'; $env:TAVERN_SKIP_GENERATORS='1'; pnpm exec webpack --mode development`  
Expected: `dist/小手机平台/脚本/{00运行时管理器,...,50通信与情报APP}/index.js`存在。

- [ ] **Step 6: 提交**

```bash
git add webpack.config.ts src/小手机平台/脚本 src/寒冬末日/__tests__/winterPhoneSource.test.js
git commit -m "feat(phone): add portable script entrypoints"
```

### Task 8: 扩展寒冬MVU与世界书

**Required skill:** `@zodmvu变量书写和校验修改`

**Files:**
- Modify: `dump_schema.ts`
- Modify: `src/寒冬末日/schema.ts`
- Modify/Generate: `src/寒冬末日/schema.json`
- Modify: `src/寒冬末日/世界书/寒冬末日/[initvar].yaml`
- Modify: `src/寒冬末日/世界书/寒冬末日/initvar.schema.json`
- Modify: `src/寒冬末日/世界书/变量/变量列表.txt`
- Modify: `src/寒冬末日/世界书/变量/临时NPC变量结构示意.txt`
- Modify: `src/寒冬末日/世界书/变量/[mvu_update]变量更新规则.yaml`
- Modify: `src/寒冬末日/世界书/变量/[mvu_update]变量输出格式.yaml`
- Modify: `src/寒冬末日/__tests__/winterPhoneSource.test.js`
- Create: `src/寒冬末日/__tests__/winterPhoneSchema.test.ts`

- [ ] **Step 1: 完整读取ZodMVU技能和仓库schema生成流程**

- [ ] **Step 2: 写失败源码/结构测试**

```js
const schema = readFileSync('src/寒冬末日/schema.ts', 'utf8');
const init = readFileSync('src/寒冬末日/世界书/寒冬末日/[initvar].yaml', 'utf8');
const rules = readFileSync('src/寒冬末日/世界书/变量/[mvu_update]变量更新规则.yaml', 'utf8');
assert.match(schema, /终端类型/);
assert.match(schema, /公共通信网/);
assert.match(init, /通讯网络:/);
assert.match(rules, /social\.shift_ration_protocol_t2/);
assert.match(rules, /最多5台/);
assert.match(rules, /social\.eden_phone_mass_t4/);
const dumpSource = readFileSync('dump_schema.ts', 'utf8');
assert.match(dumpSource, /TAVERN_SCHEMA_PREFIXES/);
```

`winterPhoneSchema.test.ts`：

```ts
import assert from 'node:assert/strict';
import { Schema } from '../schema';

const parsed = Schema.parse({ 世界: {}, 纪宁: { 姓名: '纪宁' } });
assert.deepEqual(parsed.纪宁.通讯, {
  已建立联系: false,
  终端类型: '无设备',
  终端状态: '无设备',
  信号状态: '离线',
  状态原因: '',
});
```

- [ ] **Step 3: 运行并确认失败**

Run: `node --test src/寒冬末日/__tests__/winterPhoneSource.test.js`  
Expected: FAIL，通讯字段不存在。

Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/winterPhoneSchema.test.ts`  
Expected: FAIL，`通讯`不存在。

- [ ] **Step 4: 给schema dump增加显式路径过滤**

默认不设置时保持原行为；设置`TAVERN_SCHEMA_PREFIXES=src/寒冬末日`时只生成寒冬schema。

- [ ] **Step 5: 修改Zod schema与初始化变量**

在共享`create角色Schema`加入通讯对象，确保主要角色和临时NPC一致；世界加入通讯网络。初始角色不凭空获得设备。

- [ ] **Step 6: 更新变量规则与输出示例**

明确普通联系方式、T2最多5台、T4量产、分发/收回/损坏必须由剧情事实触发。

- [ ] **Step 7: 生成并校验schema文件**

Run: `$env:TAVERN_SCHEMA_PREFIXES='src/寒冬末日'; pnpm dump`  
Expected: schema生成成功且不改无关字段。

- [ ] **Step 8: 运行测试并提交**

Run: `node --test src/寒冬末日/__tests__/winterPhoneSource.test.js`  
Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/winterPhoneSchema.test.ts`  
Expected: PASS；旧状态fixture补默认值，世界书约束齐全。

```bash
git add dump_schema.ts src/寒冬末日/schema.ts src/寒冬末日/schema.json src/寒冬末日/世界书 src/寒冬末日/__tests__/winterPhoneSource.test.js src/寒冬末日/__tests__/winterPhoneSchema.test.ts
git commit -m "feat(winter): add communication mvu facts"
```

### Task 9: 实现WinterContextAdapter

**Files:**
- Create: `src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts`
- Create: `src/寒冬末日/脚本/小手机-90寒冬适配器/winterAdapterCore.ts`
- Create: `src/寒冬末日/脚本/小手机-90寒冬适配器/README.md`
- Modify: `src/寒冬末日/__tests__/winterPhoneSource.test.js`
- Create: `src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`

- [ ] **Step 1: 写失败测试：owner、稳定快照、T2/T4、档案退化、临时转正**

```js
const adapter = readFileSync('src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts', 'utf8');
assert.match(adapter, /末世寒冬 - 星穹秩序/);
assert.match(adapter, /social\.shift_ration_protocol_t2/);
assert.match(adapter, /social\.eden_phone_mass_t4/);
assert.match(adapter, /assistantMessageId/);
assert.match(adapter, /mvuSignature/);
assert.match(adapter, /角色档案 - /);
```

`winterPhoneAdapter.test.ts`直接导入`winterAdapterCore.ts`：

```ts
assert.equal(canPublishSnapshot({ assistantMessageId: null, mvu: {} }), false);
assert.equal(canAssignEdenTerminal({ abilities: ['social.shift_ration_protocol_t2'], assignedCount: 5 }), false);
assert.equal(canAssignEdenTerminal({ abilities: ['social.eden_phone_mass_t4'], assignedCount: 99 }), true);
assert.deepEqual(resolveRoleMigration(temp('工程师'), [main('工程师')]), {
  from: 'temporary:工程师', to: 'main:工程师'
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `node --test src/寒冬末日/__tests__/winterPhoneSource.test.js`  
Expected: FAIL，适配器不存在。

Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`  
Expected: FAIL，适配器核心不存在。

- [ ] **Step 3: 实现适配器纯函数与模块注册**

只在角色名精确匹配时激活；读取公共SillyTavern/MVU/世界书API，不依赖Pre组件。任务源限制为阶段目标和情报碎片。

- [ ] **Step 4: 运行源码/fixture测试**

Run: `node --test src/寒冬末日/__tests__/winterPhoneSource.test.js`  
Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/winterPhoneAdapter.test.ts`  
Expected: PASS。

- [ ] **Step 5: 安全构建并检查第七个产物**

Run: `$env:TAVERN_BUILD_PREFIXES='src/寒冬末日/脚本/小手机-90寒冬适配器'; $env:TAVERN_SKIP_GENERATORS='1'; pnpm exec webpack --mode development`

Expected: `dist/寒冬末日/脚本/小手机-90寒冬适配器/index.js`存在。

- [ ] **Step 6: 写README导入清单**

记录七个脚本名、dist路径、任意加载顺序、角色卡打包注意事项，以及本地PNG原子打包命令。远端CDN发布仍是独立步骤，本地PNG完成不等于远端文件已更新。

- [ ] **Step 7: 提交**

```bash
git add src/寒冬末日/脚本/小手机-90寒冬适配器 src/寒冬末日/__tests__/winterPhoneSource.test.js src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
git commit -m "feat(winter): add portable phone adapter"
```

### Task 10: 接入same-layer-pre入口与composer桥

**Files:**
- Create: `src/寒冬末日/same-layer-pre/界面/状态栏/phoneBridge.ts`
- Modify: `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`
- Modify: `src/寒冬末日/__tests__/sameLayerPreSource.test.js`
- Create: `src/寒冬末日/__tests__/phoneBridge.test.ts`

- [ ] **Step 1: 写失败测试：按钮位置、可选全局、未读、composer动作**

```js
assert.ok(source.indexOf('phone-entry-button') < source.indexOf('btn-regenerate'));
assert.match(bridge, /attachHostBridge/);
assert.match(bridge, /kind\s*!==\s*['"]composer\.insert['"]/);
assert.match(bridge, /mode\s*===\s*['"]append['"]/);
assert.doesNotMatch(bridge, /PhoneDB|PromptAssembler|ChatLoreSync/);
```

`phoneBridge.test.ts`用fake runtime/composer验证：

```ts
const composer = createFakeComposer('已有文本');
const bridge = createPrePhoneBridge({ runtime: fakeRuntime(), composer });
await bridge.submitAction({ kind: 'composer.insert', text: '检查供暖', sourceKey: 'task:heat', mode: 'append' });
assert.equal(composer.value, '已有文本\n检查供暖');
assert.equal(composer.generateCalls, 0);
await assert.rejects(() => bridge.submitAction({ kind: 'unknown' } as any));
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test src/寒冬末日/__tests__/sameLayerPreSource.test.js`  
Expected: 新增断言FAIL。

Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/phoneBridge.test.ts`  
Expected: FAIL，bridge不存在。

- [ ] **Step 3: 实现phoneBridge**

只提供`toggle/getUnread/subscribe`并调用公共`attachHostBridge({ id: 'same-layer-pre', submitAction })`；生命周期 disposer 在Pre卸载时执行。`PhoneHostAction`固定为`composer.insert`、`sourceKey`、`replace|append`，空文本和未知动作拒绝，任何路径都不调用generate。

- [ ] **Step 4: 在重生左侧增加按钮**

按钮使用现有工具栏样式，显示离线/未读，点击只调用bridge。不得改流式、重生和MVU逻辑。

- [ ] **Step 5: 运行Pre测试与构建**

Run: `node --test src/寒冬末日/__tests__/sameLayerPreSource.test.js`  
Run: `pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/phoneBridge.test.ts`  
Run: `$env:TAVERN_BUILD_PREFIXES='src/寒冬末日/same-layer-pre'; $env:TAVERN_SKIP_GENERATORS='1'; pnpm exec webpack --mode development`  
Expected: PASS且Pre编译成功。

- [ ] **Step 6: 提交**

```bash
git add src/寒冬末日/same-layer-pre src/寒冬末日/__tests__/sameLayerPreSource.test.js src/寒冬末日/__tests__/phoneBridge.test.ts
git commit -m "feat(pre): add minimal phone entry bridge"
```

### Task 11: 集成、浏览器验收与构建审计

**Required skills:** `@playwright-cli`, `@superpowers:verification-before-completion`

**Files:**
- Modify only if defects found: files listed in Tasks 1–10
- Create: `scripts/package-winter-phone-card.mjs`
- Create: `scripts/test-package-winter-phone-card.mjs`
- Generate: corresponding `dist/小手机平台/**` and `dist/寒冬末日/**` outputs
- Generate/Modify atomically: `src/末世寒冬 - 星穹秩序.png`

- [ ] **Step 1: 运行全部纯逻辑和源码测试**

```bash
pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/runtime.test.ts
pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/data.test.ts
pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/ai.test.ts
pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/小手机平台/__tests__/scheduler.test.ts
node --test src/小手机平台/__tests__/shellSource.test.js
node --test src/寒冬末日/__tests__/winterPhoneSource.test.js
pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/winterPhoneSchema.test.ts
pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/winterPhoneAdapter.test.ts
pnpm exec ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node","types":["node"]}' src/寒冬末日/__tests__/phoneBridge.test.ts
node --test src/寒冬末日/__tests__/sameLayerPreSource.test.js
```

Expected: 全部PASS。

- [ ] **Step 2: 范围化生产构建并检查目标产物**

Run: `$env:TAVERN_BUILD_PREFIXES='src/小手机平台;src/寒冬末日/脚本/小手机-90寒冬适配器;src/寒冬末日/same-layer-pre'; $env:TAVERN_SKIP_GENERATORS='1'; pnpm exec webpack --mode production`  
Expected: 七个手机脚本和same-layer-pre构建成功；未匹配入口的脏dist未被Webpack触碰。用构建前后`git status --short`对比验证。

- [ ] **Step 3: 浏览器smoke**

验证：入口在重生左侧、Escape与焦点返回、浅/深主题、移动端无横向滚动、恶意HTML显示为文本、聊天切换期间AI/Lore仍落回原session、手机取消不停止主正文。

- [ ] **Step 4: 打包世界书并检查差异**

Run: `node tavern_sync.mjs bundle 寒冬末日`  
Expected: `src/寒冬末日.json`包含通讯schema相关世界书文本。

- [ ] **Step 5: 先写失败测试，再实现PNG原子打包器**

测试把原PNG复制到临时目录，运行打包器后重新解码，断言：

```js
assert.equal(card.data.name, '末世寒冬 - 星穹秩序');
assert.equal(phoneScripts.length, 7);
assert.ok(card.data.character_book.entries.some(e => e.comment === '变量列表' && e.content.includes('通讯网络')));
assert.deepEqual([...new Set(phoneScripts.map(s => s.id))].length, 7);
```

Run: `node scripts/test-package-winter-phone-card.mjs`  
Expected before implementation: FAIL。

打包器读取`src/寒冬末日.json`替换角色卡内嵌世界书，按稳定UUID upsert七个Tavern Helper import脚本；先写同目录临时PNG，重新解码验证角色名/脚本/世界书，再原子替换。任何失败不得覆盖源PNG。

- [ ] **Step 6: 运行临时PNG往返测试**

Run: `node scripts/test-package-winter-phone-card.mjs`  
Expected: PASS，临时文件包含七脚本且原始PNG哈希未改变。

- [ ] **Step 7: 更新本地角色卡PNG并复验**

Run: `node scripts/package-winter-phone-card.mjs --input 'src/末世寒冬 - 星穹秩序.png' --worldbook 'src/寒冬末日.json' --write`  
Expected: 原子替换成功；再次解码确认七脚本、最新世界书和角色名。此步骤不发布远端CDN。

- [ ] **Step 8: 完成前审计**

Run: `git diff --check`  
Run: `git status --short`  
检查只解释/交付计划内变更，不覆盖用户原有dist、日志、缓存和示例文件。

- [ ] **Step 9: 最终提交（如前序任务未逐次提交）**

```bash
git add <仅计划内文件与已验证PNG>
git commit -m "feat: add portable winter phone"
```

---

## Execution notes

- 当前工作树已有用户的dist、日志、缓存、示例卡和临时文件变更；任何清理、reset或批量add都禁止。
- 当前仓库存在受Git跟踪的本地 `src/末世寒冬 - 星穹秩序.png`，计划通过解码/校验/原子替换更新它；远端CDN发布与版本号推进仍是独立发布步骤，不能虚假宣称远端已更新。
- 若真实酒馆环境不可用，浏览器项记录为环境未验证，不能用静态测试代替声称现场通过。

## Plan audit record（2026-07-20）

计划经过主审和三轮独立计划审查后通过。审查闭环包括：广播ChatLore、任务到composer协议、Webpack生成副作用隔离、定向schema dump、本地PNG原子打包、Task 1宿主桥，以及寒冬schema/适配器/bridge三份可执行行为测试。`git diff --check`通过后方可进入实施。

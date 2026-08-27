# 02 核心运行时（core/）

`core/` 是平台的微内核，不含任何业务逻辑。它解决四个问题：

1. **跨 iframe 汇聚**：多脚本如何找到彼此（`register.ts` 的 top 单例 + pending 队列）
2. **模块生命周期**：注册 -> 拓扑排序 -> 初始化 -> 逆序卸载（`moduleRegistry.ts` + `runtime.ts`）
3. **服务发现**：按 capability 字符串发布/消费服务（`serviceRegistry.ts` + `serviceModule.ts`）
4. **可观测性**：事件分发与组件健康检查（`eventBus.ts` + `componentHealth.ts`）

依赖关系（箭头 = 引用）：

```
types.ts（叶子）          eventBus.ts（叶子）
     ▲                        ▲
serviceRegistry / serviceModule / moduleRegistry / register / componentHealth
     └────────────┬───────────┘
             runtime.ts（组合根）
                  ▲
        00运行时管理器入口（安装 + 健康通知）
```

---

## 2.1 [types.ts](../core/types.ts) — 全平台类型契约

纯类型定义文件，无任何 import。所有运行时行为的静态描述：

| 导出 | 说明 |
| --- | --- |
| `PhoneOwner` | `{ characterName, adapterId, runtimeMajor }` 手机归属者（哪张角色卡/哪个适配器占据 runtime） |
| `PhoneSession` | `{ owner, chatId, sessionKey }` 会话快照 |
| `PhoneHostAction` | `{ kind: 'composer.insert', text, sourceKey, mode: 'replace'\|'append' }` 提交回宿主的动作（向酒馆输入框插入文本） |
| `PhoneHostBridge` | `{ id: 'same-layer-pre', getStoryMessageId(), submitAction(action) }` 与同层 Pre 脚本通信的宿主桥 |
| `PhoneModuleManifest` | **模块描述符**：`{ id, version, required, dependsOn: string[], capabilities: string[] }` |
| `PhoneModuleStatus` | `'REGISTERED' \| 'INITIALIZING' \| 'READY' \| 'ERROR' \| 'DISPOSED'` |
| `PhoneModule` | **模块实例契约**：`init(context)` / `dispose(reason)` / `getStatus()` |
| `PhoneModuleContext` | 注入给 init 的上下文：`{ runtime, services, getOwner(), getSession() }` |
| `PhoneRuntimeState` | 12 态枚举；实现中实际流转 `WAITING -> RESOLVE -> READY/ERROR -> DISPOSED` |
| `PhoneRuntimeStatus` | `{ state, owner, sessionKey, isOpen, diagnostics }` |
| `PhoneRuntimeEventMap` | 事件表：`ready` / `status` / `modules` / `unread` / `hostStory` |
| `PhoneServiceRegistry` | 服务发现契约：`publish(ownerId, capability, service): () => void`、`get<T>(capability)`、`require<T>(capability)` |
| `TavernPhonePublicApi` | runtime 对外完整 API（17 个成员，与 `PhoneRuntime` 类方法一一对应） |

---

## 2.2 [eventBus.ts](../core/eventBus.ts) — 泛型事件总线

`class EventBus<TEvents>`，完全独立无依赖：

| 方法 | 行为 |
| --- | --- |
| `on(event, listener)` | Set 存储，返回**幂等**取消订阅函数；空集合自动清理 |
| `emit(event, ...args)` | 拷贝监听器集合遍历；**单个 listener 抛错不阻断其余 listener**；有错误上报器时逐个上报，否则聚合成 `AggregateError` 抛出 |
| `dispose()` | 清空全部订阅 |

`PhoneRuntime` 用它分发 `ready/status/modules/unread/hostStory` 五类事件，并把 listener 异常写入 `diagnostics`（供 UI / 健康检查展示）。

---

## 2.3 [serviceRegistry.ts](../core/serviceRegistry.ts) — 服务注册表

`class InternalPhoneServiceRegistry implements PhoneServiceRegistry`，以 **capability 字符串为唯一键的单例服务总线**：

| 方法 | 行为 |
| --- | --- |
| `publish(ownerId, capability, service)` | 校验非空；**同一 capability 不允许重复提供**（抛 `"already provided"`）；返回 release 函数（幂等、只删除自己那次注册） |
| `get<T>(capability)` | 宽松查询，缺失返回 `undefined` |
| `require<T>(capability)` | 强制获取，缺失抛 `"Required phone service is unavailable"` |

---

## 2.4 [serviceModule.ts](../core/serviceModule.ts) — 服务模块工厂

```ts
createServiceModule(moduleId: string, services: Readonly<Record<string, unknown>>): PhoneModule
```

把 `{ capability: serviceImpl }` 字典包装成标准 `PhoneModule`：

- `init(context)`：逐项 `context.services.publish(moduleId, capability, service)`；**任一 publish 失败则逆序 release 并回滚为 ERROR（原子发布）**
- `dispose()`：逆序 release 全部
- 各脚本入口（10/20/30/40/50/60）都用它把领域服务接入模块生命周期

---

## 2.5 [moduleRegistry.ts](../core/moduleRegistry.ts) — 模块注册表

`class ModuleRegistry`：

| 方法 | 行为 |
| --- | --- |
| `register(registration)` | 校验 id/version 非空；同 id **同版本幂等忽略**（返回 false）；**不同版本抛错（不支持热替换）** |
| `list()` / `snapshots()` | 全部注册项 / 冻结的 `PhoneModuleSnapshot[]` |
| `assertRequired(requiredIds)` | 必需模块缺失时抛 `"Missing required phone modules"` |
| `resolveOrder(rootIds?)` | DFS 后序**拓扑排序**（依赖先行）；检测依赖环（`"dependency cycle detected"`）与缺失依赖（`"Missing phone module dependency"`）；传 rootIds 时只排根的依赖闭包 |
| `findByCapability(capability)` | 按 `manifest.capabilities` 过滤模块 id |
| `initialize(context, requiredIds?)` | **只允许执行一次**；按拓扑序逐个 `factory()` -> `init(context)`；**失败回滚**：半初始化实例 + 已初始化模块逆序 dispose，清理后重新允许初始化（支持重试）；错误聚合为 `AggregateError` |
| `dispose(reason)` | 按初始化顺序**逆序** dispose，错误聚合 |

---

## 2.6 [register.ts](../core/register.ts) — 跨 iframe 注册入口

解决「脚本加载顺序不确定」的关键一环：

| 导出 | 说明 |
| --- | --- |
| `RUNTIME_KEY = 'TavernPhone'` | top 窗口上的运行时挂载键 |
| `PENDING_KEY = '__TAVERN_PHONE_PENDING_MODULES__'` | top 窗口上的暂存队列键 |
| `PHONE_RUNTIME_INSTALLED_EVENT = 'tavern-phone:runtime-installed'` | 运行时安装完成事件名 |
| `getPhoneTopWindow()` | 读取 `window.top` 并通过访问 `location.href` 探测跨域；**拿不到 top 直接抛错，禁止 iframe 本地回退** |
| `registerPhoneModule(registration)` | top 上已有 `TavernPhone` 则直接 `registerModule`；否则压入 pending 队列 |
| `dispatchPhoneRuntimeInstalled(topWindow)` | best-effort 派发安装事件，失败静默 |

---

## 2.7 [runtime.ts](../core/runtime.ts) — PhoneRuntime 微内核

组合根，聚合 EventBus / ModuleRegistry / ServiceRegistry。关键导出：

- `makeSessionKey(owner, chatId): string` — 生成 `` `${characterName}::${chatId}` ``
- `createPhoneRuntime(): PhoneRuntime` — 工厂
- `installPhoneRuntime(expectedOwner?)` — **top 单例安装**：已存在则复用（可顺带 setOwner）；否则创建 -> 消费 pending 队列 -> 挂载 `topWindow.TavernPhone` -> 派发安装事件

### PhoneRuntime 方法一览

| 方法 | 行为 |
| --- | --- |
| `registerModule(registration)` | 委托 ModuleRegistry；成功 emit `modules`，随后排程自动初始化 |
| `setOwner(owner)` | 同 owner 幂等；**不同 owner 抛错（不允许抢占）**；变更时使宿主桥失效、清空 session、状态回 WAITING |
| `setSession(chatId)` | 构建 sessionKey；session 变化使宿主桥失效；状态 READY/WAITING；emit `status` 与 `ready` |
| `getOwner() / getSession()` | 返回深拷贝（防御性副本） |
| `initializeModules(requiredIds?)` | 手动初始化入口：幂等 + 并发去重（复用 in-flight promise） |
| `open() / close() / toggle()` | `isOpen` 开关；open 前必须有活动 session，否则抛错 |
| `getStatus() / getModules() / getUnreadCount()` | 只读状态 / 模块快照 / 未读计数 |
| `on(event, listener)` | 委托 EventBus，返回取消订阅函数 |
| `attachHostBridge(bridge)` | 需 owner+session 才可挂载；记录挂载时快照；emit `hostStory`；返回 detach 函数 |
| `getHostStoryMessageId()` | 严格校验（bridge 未失效、owner/session 与挂载时一致、返回值为非负安全整数），任一不满足返回 `null` |
| `submitActionToHost(action)` | 四重校验（kind / text / sourceKey / mode）-> 校验 bridge 仍与当前 owner/session 匹配（**防串卡/串聊天**）-> 转发 |
| `dispose(reason?)` | 等待在途初始化完成 -> registry.dispose -> finally 清空事件/owner/session、状态 DISPOSED（**registry 失败也保证本地清理**） |

### 自动初始化机制

1. 每次注册模块后 `queueMicrotask` 排程一次尝试。
2. `tryAutomaticInitialization()` 以 `findByCapability('phone.adapter')` 的模块为**根**（当前唯一提供者为寒冬适配器 `winter.adapter`）。
3. `resolveOrder(roots)` 预校验：若报 "Missing phone module dependency" 则**保持 WAITING**（等待依赖模块后续注册）；其他错误进入 diagnostics 并置 ERROR。
4. 校验通过后初始化根的**依赖闭包**（standby 模块不被卷入，保持 REGISTERED）；成功置 READY（有 session）/ WAITING。

---

## 2.8 [componentHealth.ts](../core/componentHealth.ts) — 组件健康检查

- `PHONE_RUNTIME_VERSION = '1.1.0'`（运行时版本常量）
- `PHONE_COMPONENT_REQUIREMENTS`：**冻结的 10 组件期望清单**，同时是平台的组装清单：

| id | label | 期望版本 | 激活要求 |
| --- | --- | --- | --- |
| `phone.runtime` | 小手机-00运行时管理器 | 1.1.0 | ready |
| `platform.services` | 小手机-10平台服务 | 1.0.1 | ready |
| `data.sync` | 小手机-20数据与同步 | 1.0.0 | ready |
| `ai.scheduler` | 小手机-30AI与调度 | 1.0.2 | ready |
| `phone.shell` | 小手机-40手机外壳 | 1.0.1 | ready |
| `communication.apps` | 小手机-50通信与情报APP | 1.0.1 | ready |
| `intelligence.services` | 60智能情报 | 1.0.0 | standby |
| `wechat.adapter` | 70微信APP适配器 | 1.0.0 | standby |
| `main.adapter` | 90主适配器 | 1.0.0 | standby |
| `winter.adapter` | 小手机-90寒冬适配器 | 1.1.2 | ready |

| 函数 | 行为 |
| --- | --- |
| `evaluatePhoneComponentHealth(moduleSnapshots)` | `phone.runtime` 恒视为 READY；其余对照快照做：缺失检测（MISSING -> `缺失`）、版本一致性（不符 -> `当前 x，需要 y`）、ready 组件必须 READY、standby 组件允许 READY/REGISTERED（其余报 `状态异常`）；产出中文 issues |
| `formatPhoneComponentHealth(report)` | 标题「伊甸终端组件检查」；健康时输出 `x/10 个组件版本一致；n 个运行中，m 个待命`，否则列出全部问题 |
| `startPhoneComponentHealthNotification(runtime, options)` | 监听 `modules` 事件做**防抖**（默认 3000ms），**每次页面加载最多通知一次**；通知后即停表停听；返回幂等 stop 函数 |

---

## 2.9 [脚本/00运行时管理器](../脚本/00运行时管理器/index.ts) — 平台引导脚本

仅 14 行，职责单一：

1. jQuery ready 时 `installPhoneRuntime()`（安装单例、消费 pending 队列）
2. 启动组件健康通知：success 用 `toastr.success`；warning 用 `toastr.warning(..., { timeOut: 12000, extendedTimeOut: 4000 })`；`onError` 打 `console.warn('[小手机平台] ...')`
3. `$(window).one('pagehide', stop)` 页面卸载时停止通知

> 命名 "00" 使其在酒馆脚本列表中排最前，**保证 runtime 先于所有业务模块脚本安装**；即便顺序错乱，pending 队列机制也能兜底。

---

## 2.10 [脚本/90主适配器](../脚本/90主适配器/index.ts) — 实验性通用适配器（234 行）

**定位澄清**：该模块**不拥有** runtime、角色会话或顶层 Shell（文件头注释明确）——角色专用适配器（寒冬适配器）负责建立 owner/session 并创建唯一 Shell。它是一个 standby 实验模块（`required: false`，capability 为 `main.adapter` 而非 `phone.adapter`）。

- `createMainAdapterModule(): PhoneModule` — 状态机 REGISTERED -> INITIALIZING -> READY/ERROR -> DISPOSED
- 内部 `createAppServices(): PhoneAppServices` — `PhoneAppServices` 的**桩实现**（会话/联系人/任务等均返回空值或 TODO 占位）
- 唯一有实际逻辑的是 `sendMessage`：
  1. 优先 `context.services.require('provider.factory')`（由 70微信APP适配器提供）
  2. 失败则**降级手动组装**：`require('ai.providers')` 取 `TavernProvider` + `require('settings.store')` 建设置存储（storage 代理到 `window.parent.localStorage`），从 `window.parent.TavernHelper` 取 `generateRaw/stopGenerationById`
  3. 拼接极简提示词 -> `provider.request(prompt)` -> `await handle.promise` -> 控制台输出
- `init`：创建 AppServices -> `require('communication.apps').createPhoneApps(services)` 创建 APP 实例 -> READY

## 2.11 测试参考

[__tests__/runtime.test.ts](../__tests__/runtime.test.ts)（约 1083 行，自包含 node 脚本）覆盖：拓扑排序与乱序注册、同版本幂等/异版本拒绝、缺失依赖与依赖环、init 顺序与 dispose 逆序、初始化失败回滚与重试、自动初始化恰好一次、快照冻结性、健康报告各分支、健康通知防抖、宿主桥（owner 冲突保护、session 切换失效、action 校验）、EventBus 隔离、runtime dispose 失败仍完成清理、top 单例安装/pending 队列消费等。

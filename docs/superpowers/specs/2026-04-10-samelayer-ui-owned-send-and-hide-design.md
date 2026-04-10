# 同层 UI 接管发送与双层隐藏设计

日期：2026-04-10

适用范围：
- `src/寒冬末日/界面同层版/界面/状态栏`
- 重点文件：`useStreamingDemo.ts`、`pages/StoryPage.vue`、`nativeSendProxy.ts`

## 1. 背景

当前 `界面同层版` 的宿主楼层隐藏主要依赖消息数据层的 `is_hidden`。
这条链路已经能让酒馆不再长期渲染容器楼层之后的真实宿主消息 DOM，但仍存在两个稳定问题：

1. UI 重载、iframe 重建、或重新打开酒馆后，宿主楼层会先重新显示。
2. 若继续在这个状态下游玩，宿主原生流式渲染与同层 UI transcript 会同时存在，导致双套渲染、双套流式、额外性能开销，以及宿主/iframe 行为竞争。

为规避这个问题，当前现场不得不额外启用“楼层视觉隐藏脚本”在宿主页面补洞。这样虽然能跨 iframe 起作用，但会把隐藏逻辑拆到 UI 外部，带来更高的不确定性、排障复杂度和维护风险。

与此同时，酒馆助手已经提供了 UI 可直接调用的显示层接口：

- `retrieveDisplayedMessage(message_id)`
- `refreshOneMessage(message_id, $mes?)`
- `formatAsDisplayedMessage(text, { message_id })`

目标是把“数据隐藏 + 视觉隐藏 + 输入接管”全部收回同层 UI 内部，形成单一的真实实现。

## 2. 目标

本次设计目标如下：

1. 宿主楼层在同层 UI 生效期间持续保持隐藏。
2. 只有当用户明确关闭 UI 时，宿主楼层才恢复显示。
3. UI 重载、iframe 重建、重新进入聊天时，不再出现宿主楼层短暂露出。
4. 用户仍可使用酒馆原生 chat 输入框输入文本，但发送动作由 UI 接管到同一条同层生成链。
5. 从提示词和消息上下文角度，原生输入框发送与 UI 输入框发送保持等价。
6. 用户在原生输入框发送时无感，不再被自动拉回宿主 `#chat` 的最新楼层，也不再看到宿主流式 DOM 闪现。

非目标：

1. 不重做 `generate()` / opening / rollback / swipe 的核心业务链。
2. 不把图片桥接链改成完全脱离宿主。图片相关场景仍允许短时桥接宿主真实节点。
3. 不在本轮里重写整个同层 transcript 架构。

## 3. 根因总结

### 3.1 宿主楼层会在 UI 卸载时被主动取消隐藏

当前 `useStreamingDemo.ts` 在 `onBeforeUnmount()` 中，会读取容器之后的隐藏消息，再批量执行：

- `setChatMessages([{ message_id, is_hidden: false }], { refresh: 'all' })`

这意味着只要 UI iframe 卸载一次，宿主真实楼层就会被主动放出来。之后哪怕新的 UI 重新挂载并再次执行隐藏，也会经历一个宿主重新可见的窗口期。

### 3.2 仅靠数据层隐藏无法覆盖“UI 重建前的视觉窗口”

`is_hidden` 解决的是消息真相与宿主渲染策略，但在这些时刻仍会暴露窗口期：

1. iframe 尚未重新挂载完成。
2. 隐藏状态还未来得及恢复。
3. 酒馆触发了宿主消息区重新渲染。

这时仅靠数据层并不够，需要补一层“视觉收口”来压住宿主已显示的 DOM。

### 3.3 原生 chat 输入框发送仍走宿主原生行为

用户当前若从酒馆原生输入框发送，宿主会创建 user 楼层、开始 assistant 回传，并伴随宿主消息区自己的滚动/聚焦/流式更新逻辑。即使 UI 后续能把状态重新收回来，用户也会看到：

1. 视角切回宿主 `#chat` 最新楼层。
2. 宿主楼层短暂显示。
3. 同层 UI 与宿主原生渲染竞争。

仓库里已有 `sendToNativeChat()` 和 `runNativeSendProxy()`，但这条链当前依赖 `withHostTranscriptVisible()`，会在发送期间暂时取消隐藏宿主消息，这与“全程宿主持续隐藏”的目标相冲突。

## 4. 方案概览

本方案采用“UI 接管发送 + 双层隐藏”：

1. 数据层隐藏：
   继续使用 `is_hidden` 作为宿主消息真相层。
2. 视觉层隐藏：
   使用 `retrieveDisplayedMessage()` / `refreshOneMessage()` / 宿主消息节点查询补齐宿主 DOM 收口。
3. 输入接管：
   用户仍可在酒馆原生 chat 输入框中输入，但发送动作改由同层 UI 统一接管到 `runGenerationFlow()` 所在链路。
4. 明确退出：
   只有用户执行“关闭 UI / 退出同层模式”时，才允许批量恢复宿主楼层显示。

## 5. 设计细节

### 5.1 隐藏真相层

保留现有：

- `applyHidePolicy()`
- `restoreHideState()`
- `hideStatePersistence.ts`

但做两项关键调整：

1. 去掉默认卸载回显
   `onBeforeUnmount()` 不再无条件把所有隐藏消息改回 `is_hidden: false`。

2. 显式退出才回显
   新增“显式关闭 UI”入口函数，例如 `disableSameLayerUi()` 或 `teardownSameLayerUi({ restoreHost: true })`，只在用户明确关闭 UI 时才：
   - 批量恢复宿主楼层 `is_hidden: false`
   - `refresh: 'all'`
   - 清理聊天变量中的 hide state 记录

结果：

- iframe 热重载、Vue 组件重建、页面切换，不再等价于“退出同层模式”
- “是否恢复宿主显示”从生命周期副作用改成用户显式动作

### 5.1.1 异常退出与挂起隐藏的恢复路径

“普通 iframe 卸载不回显宿主”并不等于“任何异常都永远保持隐藏”。
为避免 crash、刷新、挂载失败后把宿主永久藏住，隐藏真相层必须额外引入运行时租约：

1. 在 chat variable 中记录一份 same-layer runtime lease，至少包含：
   - `sessionId`
   - `containerMessageId`
   - `heartbeatAt`
   - `status: booting | active | closing`
2. UI 启动时先获取或刷新 lease，再恢复 hide state。
3. UI 运行期间定期刷新 `heartbeatAt`。
4. 显式关闭 UI 时：
   - 将 lease 标记为 `closing`
   - 恢复宿主显示
   - 清理 hide state
5. 下次启动时，如果发现：
   - hide state 存在
   - 但 lease 已过期或处于异常状态
   - 且当前没有成功接管 same-layer
   则执行一次安全恢复，把宿主楼层重新显示。
6. 对于 `pagehide` / 导航离开 / 整页刷新：
   - 不立即恢复宿主显示
   - 只把 lease 标记为短期 `suspended`
   - 给一个很短的恢复宽限期，允许同页快速重建 same-layer
7. 如果宽限期后仍没有新的 active heartbeat，则下一次 bootstrap 必须执行安全恢复，而不是无限等待租约自然老化。

这样可以同时满足：

1. 普通热重载和 iframe 重建不会误判成“退出同层模式”
2. 但真正的异常退出不会把聊天永久锁在隐藏态

### 5.2 视觉收口层

新增一个 UI 内部的宿主视觉收口模块，建议命名：

- `hostVisualHide.ts`

职责：

1. 在 UI 启动时立即扫描容器之后的宿主楼层。
2. 对已显示的宿主消息根节点施加统一视觉隐藏。
3. 在宿主消息被重新渲染后重新补隐藏。
4. 在用户显式关闭 UI 时移除这层视觉隐藏。

推荐策略：

1. 优先通过 `retrieveDisplayedMessage(messageId)` 获取宿主 `mes_text`。
2. 向上找到对应 `.mes` 根节点。
3. 为节点打统一属性或类名，例如：
   - `data-eden-host-hidden="true"`
   - `.eden-host-hidden`
4. 通过注入到宿主文档的样式规则做视觉隐藏。

视觉隐藏目标：

- 不让宿主楼层占可见空间
- 不让宿主楼层在滚动定位中抢占视觉焦点
- 不依赖外部独立脚本

可接受的实现形式：

1. 对 `.mes` 根节点施加“视觉折叠但 DOM 仍在”的隐藏样式
2. 不使用 `display: none` 作为默认方案

推荐默认样式方向：

- `visibility: hidden`
- `pointer-events: none`
- 高度折叠到 0
- 清理多余 margin / padding / border / overflow

优先建议直接作用于整条宿主 `.mes`，而不是只隐藏 `.mes_text`，这样能最大程度压住宿主侧按钮、头像、流式占位等残留；但必须保证节点仍留在 DOM 中，供图片桥接、宿主按钮定位、消息根节点查找等事务继续使用。

### 5.3 视觉收口触发时机

视觉收口需要在这些时机执行：

1. UI `onMounted()` 初次挂载后，紧接 `restoreHideState()` 与 `queueHidePolicy('mounted')`
2. 聊天切换或历史加载后
3. 宿主消息事件：
   - `CHAT_CHANGED`
   - `MESSAGE_SENT`
   - `MESSAGE_RECEIVED`
   - `MESSAGE_UPDATED`
   - `MESSAGE_EDITED`
   - `MESSAGE_SWIPED`
   - `MORE_MESSAGES_LOADED`
4. 宿主 DOM MutationObserver 检测到新增 `.mes`

该层是“视觉兜底”，其职责不是决定谁该隐藏，而是根据数据层状态把宿主可见 DOM 迅速压回去。

### 5.3.1 视觉隐藏的事务性挂起

视觉层需要提供显式的挂起/恢复 API，例如：

- `suspendHostVisualHide(reason)`
- `resumeHostVisualHide(reason)`

用于以下少数事务：

1. 图片查看桥接
2. 重生图桥接
3. 必须命中宿主原生按钮或真实可点击区域的事务

事务规则：

1. 普通发送链不得使用该挂起能力
2. 桥接事务开始前，只允许最小范围地解除视觉折叠
3. 事务结束后立即重新应用视觉隐藏
4. 数据层 `is_hidden` 在整个过程中仍然保持真相地位

### 5.4 原生输入框接管

新增一个输入接管模块，建议命名：

- `hostChatInputBridge.ts`

职责：

1. 找到宿主原生 chat 输入框和发送触发入口。
2. 监听用户在原生输入框中的发送动作。
3. 读取用户输入文本。
4. 阻止宿主原生默认发送链继续推进。
5. 将文本转交给同层 UI 的 `runGenerationFlow({ prompt, createUser: true })`。

实现原则：

1. 输入来源保留原生 chat 输入框。
2. 发送执行权归同层 UI。
3. 同层 UI 成为唯一的 user/assistant 楼层写入者。

### 5.4.1 原生发送拦截契约

native chat 输入接管必须定义唯一的权威入口，避免双发送。

推荐契约：

1. 统一入口函数：
   - `handleNativeChatSubmit(rawText, source)`
2. 必须先解析一个“宿主发送管线上的单一拦截点”，并且该拦截点必须位于“宿主创建 user message 之前”。
3. 推荐优先级：
   - 首选：宿主真实 send / submit dispatcher 函数补丁
   - 次选：宿主 composer form 的 capture-phase submit 拦截
   - 再次：宿主发送按钮 click、输入框 Enter 等事件只作为辅助入口，统一转发到同一拦截点，不得各自独立成链
4. 若无法确认某个方案能在宿主创建消息前 100% 截断发送，则宁可禁用 native 输入接管，也不能半接管半放行。
5. IME 组合输入期间不得抢提交：
   - `event.isComposing === true` 时不触发
   - 仅在 composition 结束后的真实提交中接管
6. DOM 事件列表不是多个平级拦截点，而只是帮助命中同一个发送管线入口的适配层。

额外边界：

1. 本轮接管目标是“用户从宿主输入控件直接发起的发送”。
2. 其他程序化发送、插件自行调用 slash / API 发送，仍视为外部宿主事件，由 transcript 重建与双层隐藏兜底，不强行纳入 native input bridge。

这样可以把“用户交互发送”和“外部系统写消息”清晰分开，避免把接管范围写得过大却落不实。

### 5.4.2 管线级发送 owner 约束

为彻底消除双发送，设计上必须满足以下顺序：

1. 宿主输入控件产生一次“准备发送”信号
2. native bridge 在宿主 user message 创建前截断默认行为
3. native bridge 读取当前输入文本
4. native bridge 调用 `submitPromptViaSameLayer()`
5. `useStreamingDemo.ts` 成为唯一 user/assistant 楼层创建者
6. transcript、滚动、隐藏策略都只响应这条 same-layer 发送结果

如果无法证明步骤 2 稳定成立，则不允许启用“原生输入框接管”。

这样做后：

- 用户从原生输入框输入，提示词上下文仍来自真实聊天消息
- 但消息创建、assistant placeholder、流式 patch、transcript 更新，都由同层 UI 统一控制
- 不再需要 `withHostTranscriptVisible()` 包住原生发送

### 5.5 与现有 UI 输入框的关系

设计上，原生输入框与 UI 输入框最终都应汇入同一个内部入口，建议抽成：

- `submitPromptViaSameLayer(prompt: string, source: 'ui' | 'native-chat')`

职责：

1. 校验 prompt
2. 设置 busy / status
3. 统一调用 `runGenerationFlow()`
4. 统一滚动 transcript 到最新
5. 统一日志记录
6. 统一隐藏策略恢复

这样可以避免：

- UI 输入框一套逻辑
- 原生输入框另一套逻辑

从而保证“提示词角度等价”不是口头约束，而是代码结构保证。

### 5.5.1 发送链唯一 owner

为了避免 UI 输入框与原生输入框后续再次漂移，发送链 owner 必须唯一。

本设计规定：

1. `useStreamingDemo.ts` 持有发送状态机与最终发送执行权
2. `hostChatInputBridge.ts` 只是宿主输入适配层，只负责：
   - 读取原生输入文本
   - 阻断宿主默认发送
   - 调用 `submitPromptViaSameLayer()`
3. `pages/StoryPage.vue` 只是页面编排层，不拥有发送真相
4. `nativeSendProxy.ts` 降级为兼容或历史桥接层，不再参与普通发送主链

这四层的职责一旦分清，busy 锁、prompt 规范化、滚动策略、隐藏恢复时机，都只能由 `useStreamingDemo.ts` 的发送 owner 决定。

### 5.6 视角稳定与无感发送

接管发送后，用户无感的关键不只是“别让宿主发”，还包括滚动与焦点。

发送后 UI 应执行：

1. 维持 transcript 视角在同层 UI
   - 若当前在 latest 模式，则滚动到 transcript 最新
   - 禁止宿主 `#chat` 抢焦点

2. 保留原生输入框可继续使用
   - 发送完成后原生输入框可清空
   - 焦点可按策略保留在原生输入框或 UI 输入框

推荐默认：

- 用户在原生输入框发送后，焦点仍留在原生输入框
- 这样对用户来说“原生输入框仍然能用”
- 但视图更新只发生在同层 UI transcript

### 5.7 图片桥接等特殊场景

图片查看、重生图、命中宿主原按钮等能力仍可能需要短时访问宿主真实节点。

因此：

1. `withHostTranscriptVisible()` 不应再被用于“普通发送”
2. 它保留为“少数需要宿主原始交互节点的桥接事务”
3. 即使保留，也应尽量缩短暴露窗口，并在事务结束后立即重新应用：
   - 数据层隐藏
   - 视觉层隐藏

普通用户发送链必须完全避开它。

## 6. 预期改动文件

核心改动预计落在：

1. `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
   - 去掉默认卸载回显
   - 抽统一发送入口
   - 引入视觉收口调度

2. `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`
   - 串接新的发送入口
   - 保持 transcript 视角稳定

3. `src/寒冬末日/界面同层版/界面/状态栏/nativeSendProxy.ts`
   - 降级为兼容层或仅保留历史桥接用途

4. 新文件 `src/寒冬末日/界面同层版/界面/状态栏/hostVisualHide.ts`
   - 宿主视觉隐藏与宿主样式注入

5. 新文件 `src/寒冬末日/界面同层版/界面/状态栏/hostChatInputBridge.ts`
   - 原生 chat 输入框发送接管

如需要，也可能补：

6. `src/寒冬末日/界面同层版/界面/状态栏/__tests__/...`
   - source test
   - 行为单测

## 7. 风险与防护

### 7.1 风险：用户真的想退出同层 UI 时，宿主仍被隐藏

防护：

- 明确提供“关闭 UI 并恢复宿主显示”的可见入口
- 退出逻辑单独封装，不与普通卸载混用

### 7.2 风险：原生输入框发送接管不完整，导致双发送

防护：

- 接管层必须优先阻止默认发送
- 增加发送中互斥标记，防止 UI 链和宿主链同时推进

### 7.3 风险：视觉隐藏和数据隐藏不同步

防护：

- 数据层决定隐藏名单
- 视觉层只负责将当前已显示 DOM 压回隐藏
- 禁止视觉层自己决定“哪些消息该隐藏”

### 7.4 风险：图片桥接需要宿主 DOM，视觉隐藏妨碍命中

防护：

- 图片桥接场景允许短时显式事务性解锁
- 桥接结束后立即恢复双层隐藏

## 8. 验收标准

满足以下条件才视为设计完成后的实现达标：

1. UI 热重载后，宿主后续楼层不会整体重新露出。
2. 关闭酒馆再重新打开，进入聊天后宿主后续楼层不会持续显示。
3. 不再依赖外部“楼层视觉隐藏脚本”补洞。
4. 用户从酒馆原生 chat 输入框发送时：
   - 不会触发宿主最新楼层抢视角
   - 不会看到宿主流式消息闪现
   - 同层 transcript 正常生成 user/assistant
5. 用户从 UI 输入框发送时，行为与原生输入框接管后的内部发送链一致。
6. 只有用户明确关闭 UI 时，宿主楼层才恢复显示。

## 9. 测试建议

至少覆盖以下验证：

1. source test：
   - 不再在 `onBeforeUnmount()` 默认批量 `unhide`
   - 普通发送链不再依赖 `withHostTranscriptVisible()`
   - 发送链唯一 owner 仍在 `useStreamingDemo.ts`
   - native bridge 只调用 `submitPromptViaSameLayer()`，不直接发宿主消息

2. 行为验证：
   - 初次进入聊天
   - iframe 热重载
   - 聊天切换
   - UI 启动失败后的 stale hide state 恢复
   - `pagehide` / 整页刷新后的 suspended lease 恢复
   - IME 组合输入后发送
   - 原生发送按钮点击
   - Enter 提交
   - 原生输入框发送
   - UI 输入框发送
   - 用户显式关闭 UI

3. 竞态专项验证：
   - 在 `restoreHideState()` 与视觉收口模块初始化之间模拟宿主重渲染
   - 在 `MESSAGE_UPDATED` / `MORE_MESSAGES_LOADED` / MutationObserver 高频批次下验证宿主楼层持续不可见
   - 断言“host never visible between restore and visual re-hide”

4. 回归关注：
   - opening
   - rollback delete
   - regenerate
   - 图片查看 / 重生图

## 10. 推荐实现顺序

1. 先拆掉“默认卸载回显宿主楼层”
2. 再补 UI 内部视觉收口层
3. 再接管原生 chat 输入框发送
4. 最后把 UI 输入框与原生输入框统一到同一提交入口

这样可以先稳定“隐藏不会自行失效”，再处理“发送如何无感接管”。

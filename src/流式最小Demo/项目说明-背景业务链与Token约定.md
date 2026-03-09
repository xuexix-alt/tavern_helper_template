# 流式最小Demo：项目说明、业务链与 Token 约定

> 本文档是 `流式最小Demo` 的项目内总说明。
> 目的：让后续接手的 AI 或开发者，在只阅读项目目录的情况下，也能快速理解这个 demo 的目标、边界、业务链、函数优先级和样式维护规则。

## 1. 项目目的

- 本项目的直接目标，不是做一个普通状态栏，而是验证：**是否可以只在同层 iframe 界面内，通过前端界面而不是后台桥接脚本，直接接管发送、流式接收、显示与阅读体验**。
- 旧方案的核心问题被明确归纳为：
  - 桥接复杂，性能与延迟都不理想；
  - 酒馆发送后会创建新楼层并刷新新楼层 iframe，导致 UI 初始化时机落后，流式体验断裂；
  - 桥接链会丢失部分酒馆原生业务信息，如正则替换、实时渲染语义和部分生成事件。
- 因此，`流式最小Demo` 的目标是：**绕开旧桥接，直接验证“纯界面直管业务线”的可行性**。

## 2. 项目定位

- `流式最小Demo` 不是“宿主聊天区旁边的附属小挂件”，而是一个放在**第 0 层**的聊天阅读与操作工作台。
- 它的长期形态是：
  - 第 0 层 UI 作为唯一阅读和操作面板；
  - 后续 `user / assistant` 楼层作为真实聊天数据源；
  - `assistant` 楼层可被隐藏，只保留数据职能；
  - transcript 在 UI 内重建与渲染，而不是依赖宿主聊天区可见楼层承担阅读体验。

## 3. 官方边界

- 模板/库/环境提供的官方能力，主要来自：
  - `.cursor/rules/*`
  - `@types/*`
  - `util/*`
  - `示例/*`
  - `初始模板/*`
- `src/*` 是业务实现，不应被误判为模板原生能力。
- 当前项目中的所有能力判断，都应以 `.cursor` 规则和 `@types` 类型声明为边界依据。

## 4. 目标演进

### 阶段 1：纯界面最小流式验证

- 最初目标是：在不改现有主业务 UI 的前提下，做一个**最小规模纯界面 demo**。
- 这版验证链路强调：
  - 不使用后台脚本桥接；
  - 界面自己调用 `generate`；
  - 界面自己写回 `chat_message`；
  - 必要时通过 `displayed_message` 接管宿主显示层。

### 阶段 2：升级为第 0 层 transcript 工作台

- 项目随后升级为：**第 0 层 transcript 工作台**。
- 其核心特征是：
  - 主区为 `TranscriptList`；
  - 顶栏负责筛选、密度切换、回到最新；
  - 底部输入区负责发送；
  - 详情层负责查看 `raw / regex 后文本 / option / meta`；
  - assistant 回复真实写入聊天，但默认 `hidden`，只在 UI 中阅读。

### 阶段 3：阅读器体验增强

- 后续又补入三项阅读体验能力：
  - `opening` 折叠；
  - 三层密度（舒适 / 紧凑 / 极简）；
  - 浏览历史提示条；
- 并引入 `following_latest / browsing_history` 作为显式阅读模式状态机。

## 5. 当前稳定业务模型

### 5.1 总体原则

- **只在第 0 层 UI 里玩**。
- assistant 楼层尽量只承担数据层职能，不承担阅读层职能。
- transcript 列表由 UI 自己构建与维护。
- UI 永远只信**真实聊天记录**，不把本地显示缓存当成最终真相。

### 5.2 三层模型

#### Raw 层

- 数据源来自真实聊天记录：
  - `getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' })`
- 这里保留原始输出，不做显示裁剪。
- `chat_message.message` 是核心载体。

#### ViewModel 层

- 从 Raw 中解析出 UI 所需字段，例如：
  - `message_id`
  - `role`
  - `hidden`
  - `phase`
  - `raw`
  - `content`
  - `options`
  - `preview`
  - `is_latest`
  - `is_streaming`
- user 与 assistant 都进入列表模型，但 user 默认应弱化，而不是完全消失。

#### Render 层

- 第 0 层 UI 负责把 ViewModel 投影成阅读界面。
- assistant 最终态可使用：
  - `formatAsDisplayedMessage(raw, { message_id })`
- 流式阶段则优先走轻量显示，不必完全复刻宿主渲染。

## 6. 1-3 阶段业务链

### 阶段 1：流式预览

- 发送时：
  - 创建真实 `user` 楼层；
  - 调 `generate({ should_stream: true })`；
  - 创建一条 assistant 占位楼层；
- token 到来时：
  - 通过事件监听持续收集；
  - 更新这条 assistant 楼层的原始文本；
  - 第 0 层 UI 同步显示流式内容。

### 阶段 2：最终收口

- 生成结束后，不只相信本地流式缓存；
- 应重新从真实聊天记录读取最终消息；
- 再统一做最终 ViewModel 与最终 Render。

### 阶段 3：重绘补刷

- transcript 的目标是保持与真实聊天一致；
- 因此在以下事件后应重建：
  - `CHAT_CHANGED`
  - `MESSAGE_UPDATED`
  - `MESSAGE_RECEIVED`
  - `MESSAGE_SWIPED`
  - `MESSAGE_DELETED`

## 7. 当前推荐业务线

- 发送入口在第 0 层底部输入区；
- 创建真实 `user` 楼层；
- assistant 回复真实写入聊天；
- transcript 统一通过 `getChatMessages` 重建；
- 最新 assistant 在 UI 中流式显示；
- 历史 assistant 在 UI 中最终渲染；
- UI 滚动查看历史，不依赖宿主聊天区承担阅读体验。

## 8. 函数优先级

### 第一优先：`@types` 官方数据与事件链

- `generate`
- `getChatMessages`
- `setChatMessages`
- `createChatMessages`
- `deleteChatMessages`
- `eventOn`
- `iframe_events.*`
- `tavern_events.*`

这组函数负责：生成、读取真实聊天、写回真实聊天、监听生成/消息变化，是项目的主业务骨架。

### 第二优先：把聊天记录当作唯一真实源

- transcript 的最终数据不应以本地临时状态为准；
- 应优先回读真实聊天记录进行校准。

### 第三优先：`is_hidden`

- 如果目标是消除 UI 与宿主双份显示，优先考虑把 assistant 楼层直接隐藏；
- 这是官方数据层手段，不是显示层 hack。

### 第四优先：`displayed_message`

- 如果必须保留某条楼层位置但不要原生正文，才考虑使用：
  - `retrieveDisplayedMessage(message_id)`
  - `formatAsDisplayedMessage(...)`
- 这属于显示层接管，不是持久渲染真相。

### 低优先：脚本桥接式流式方案

- 旧桥接方案已被认定为复杂、延迟高、语义丢失较多；
- 在 `流式最小Demo` 的路线里，它不再是首选方案。

## 9. 隐藏与显示策略共识

- **有官方手段隐藏整条生成楼层**：`is_hidden`。
- **没有纯界面下一键关闭原生 `mes_text` 但保留楼层框架的官方开关**。
- 因此显示控制策略优先级为：
  1. `is_hidden`
  2. `retrieveDisplayedMessage(...)` 覆盖显示层
  3. 正则置空（不推荐，过于全局且钝）

## 10. 结构与产品心智

- `流式最小Demo` 的正确心智模型是：
  - **阅读器 / 工作台**
  - 不是“状态栏加几个按钮”
- transcript 是主体；
- 顶栏、底部输入区、详情层都是围绕 transcript 服务；
- UI 目标是成为“单层承载的聊天前端”。

## 11. 当前阶段新增约束

- 在旧会话形成的上述共识之上，当前阶段又新增了一组更强的语义要求：
  - 改词重生要尽量走酒馆原生“修改最后一条 user 后重新生成”的业务线；
  - 回退删除要尽量走酒馆原生“从当前楼层回退”的语义；
  - Swipe 要优先点击宿主现有左右箭头；
  - 改词重生的刷新时机要尽量提前到宿主 token 一出来就刷新，并切回 latest，实现“边生边看”。

## 12. Opening 新方案

### 12.1 目标

- 当前 demo 的 opening 双显根因是：
  - 0 层宿主楼层里有一份真实开局正文；
  - UI transcript 又把 0 层正文重新读取并渲染成 opening 卡。
- 新方案的目标是：
  - 让 0 层只承担 **宿主锚点 + 开局流程容器** 的职责；
  - opening 正文改由 **预制配置 + 用户表单 + AI 生成** 共同决定；
  - opening seed 优先由结构化 payload 驱动，而不是直接复读酒馆原始 0 层正文。

### 12.2 当前阶段最稳做法

- 第一阶段不直接改写 0 层宿主 raw，不先碰最脆弱的正则注入链。
- opening 先放到 chat 变量中维护：
  - `stream_demo.opening`
- UI transcript 在构建 opening 卡时：
  - 优先读取 opening payload；
  - 若 payload 尚不存在，再回退读取旧的 0 层正文。

### 12.3 Opening 数据模型

#### OpeningPreset

- 静态可维护配置，负责：
  - 世界观背景
  - 第一行文案
  - 默认时间/地点/主角
  - 表单 schema
  - AI 输出规则

当前文件：

- `src/流式最小Demo/shared/opening-preset.default.json`

#### OpeningPayload

- 运行态数据，负责：
  - 当前流程状态：`placeholder / configuring / generating / ready`
  - 当前使用的 preset
  - meta（时间/地点/主角）
  - 用户输入结果
  - prompt echo
  - opening content
  - opening options

当前模块：

- `src/流式最小Demo/shared/opening.schema.ts`
- `src/流式最小Demo/shared/opening.ts`

### 12.4 Opening UI 流程

- 第 0 层 opening 采用三阶段流程：

#### 阶段 A：预制信息展示

- UI 先展示：
  - 基础世界观背景
  - 开局第一句话
  - 默认格式化 meta

#### 阶段 B：用户定制输入

- 用户通过表单输入决定 opening 的可变部分：
  - 身份
  - 开局关注对象
  - 开局目标
  - 开局风格
  - 已知信息

#### 阶段 C：生成 opening

- UI 用 preset + 用户输入组装 opening prompt
- 调 `generate({ user_input })`
- AI 按固定标签输出：
  - `<opening_prompt_echo>`
  - `<content>`
  - `<option>`
- 生成结果写回 opening payload，再由 transcript opening 卡渲染。

### 12.5 当前已落地文件

- `src/流式最小Demo/shared/opening-preset.default.json`
  - opening 静态配置源
- `src/流式最小Demo/shared/opening.schema.ts`
  - preset / payload Zod schema
- `src/流式最小Demo/shared/opening.ts`
  - opening payload 读写、prompt 组装、AI 输出解析
- `src/流式最小Demo/界面/状态栏/components/OpeningSetupPanel.vue`
  - opening 配置 UI
- `src/流式最小Demo/界面/状态栏/useStreamingDemo.ts`
  - opening state、payload 恢复、opening transcript seed、opening 生成入口
- `src/流式最小Demo/界面/状态栏/pages/StoryPage.vue`
  - opening 配置面板接入主页面

### 12.6 当前阶段的边界

- 第一阶段 **还没有** 把 opening payload 反写进 0 层 raw 宿主消息。
- 当前选择先把 opening 跑通在：
  - JSON preset
  - chat 变量 payload
  - UI seed 渲染
- 这样可以先解决：
  - opening 双显
  - 开局可维护性
  - 用户定制化开局
- 同时避免在这一阶段就把宿主注入链改崩。

### 12.7 下一阶段方向

- 下一阶段再做“0 层宿主消息 = marker + opening payload 容器”这一层落地。
- 目标是让 opening 不只存在于 chat 变量，也进入稳定的 0 层宿主 raw 中，便于导出、迁移和更强的一致性维护。

## 13. Token 约定

> 目标：让 `src/流式最小Demo/界面/状态栏` 后续新增组件时，样式命名保持一致，避免重新回到组件层硬编码颜色。

### 13.1 分层约束

- `theme-tokens.css`：只定义 token，不写业务选择器
  - 文件：`src/流式最小Demo/界面/状态栏/theme-tokens.css`
- `component` 层：只消费 token，不新增颜色字面量
  - 目录：`src/流式最小Demo/界面/状态栏/components`
- `App.vue` / 页面层：允许使用 token，但不应重新定义颜色变量

### 13.2 基本规则

- 组件层禁止新增：
  - `#xxxxxx`
  - `rgba(...)`
  - `hsla(...)`
- 组件层禁止写颜色 fallback：
  - 禁止 `var(--xxx, rgba(...))`
  - 禁止 `var(--xxx, #xxxxxx)`
- 所有颜色、阴影、渐变都应先进入 `theme-tokens.css`

### 13.3 命名前缀

- demo 全局统一前缀：`--demo-*`
- 不再为单个组件单独发明一套完全独立前缀，优先复用已有语义 token

### 13.4 语义分组

#### 文本

- `--demo-text-primary`：正文主文字
- `--demo-text-secondary`：标题下说明 / 次级正文
- `--demo-text-tertiary`：弱化正文 / 摘要
- `--demo-text-muted`：辅助信息
- `--demo-text-subtle`：标签、计数、元信息

状态文字：

- `--demo-text-accent`
- `--demo-text-warning`
- `--demo-text-danger`
- `--demo-text-success`
- `--demo-text-inverse`

#### 面板 / 背景

- `--demo-surface-shell`：最外层壳
- `--demo-surface-card*`：卡片层
- `--demo-surface-panel*`：内层块、输入区、日志项
- `--demo-surface-modal`：抽屉 / 浮层
- `--demo-surface-overlay`：遮罩

状态背景：

- `--demo-surface-accent`
- `--demo-surface-user*`
- `--demo-surface-success*`
- `--demo-surface-danger*`

#### 边框

- `--demo-border-accent*`：主边框系统
- `--demo-border-warning*`：开场 / 历史 / user 相关
- `--demo-border-danger*`：危险操作 / 错误态
- `--demo-border-success*`：成功态
- `--demo-border-neutral*`：中性边框

#### 渐变

- `--demo-gradient-primary`：主按钮
- `--demo-gradient-chip-active`：激活 chip
- `--demo-gradient-transcript-fade`：普通 transcript 渐隐
- `--demo-gradient-opening-fade`：opening 渐隐

#### 阴影

- `--demo-shadow-shell`
- `--demo-shadow-drawer`
- `--demo-shadow-accent-inset`

### 13.5 命名后缀建议

- 面板类：`-shell` / `-card` / `-panel` / `-modal` / `-overlay`
- 文本类：`-primary` / `-secondary` / `-tertiary` / `-muted` / `-subtle`
- 边框类：`-soft` / `-muted` / `-strong` / `-stronger`
- 状态类：`-accent` / `-warning` / `-danger` / `-success`

### 13.6 新增样式时的优先级

写组件样式前，按下面顺序判断：

1. 先复用已有 `--demo-*` token
2. 若已有 token 语义接近，优先扩语义，不要复制一个新颜色
3. 确实没有合适语义时，再往 `theme-tokens.css` 新增 token
4. 新 token 名称优先描述“用途”，不要描述“具体颜色”

### 13.7 推荐流程

1. 在组件里先写结构和类名
2. 扫一遍需要的颜色语义
3. 先在 `theme-tokens.css` 补 token
4. 组件里只写 `var(--demo-xxx)`
5. 构建验证：`pnpm build`

### 13.8 扫描命令

```powershell
rg -n --glob '*.vue' --glob '*.css' --glob '*.scss' "#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(" src/流式最小Demo/界面/状态栏
```

如需排除 token 文件本身：

```powershell
rg -n --glob '*.vue' --glob '*.css' --glob '*.scss' "#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(" src/流式最小Demo/界面/状态栏 | Where-Object { $_ -notmatch 'theme-tokens\.css' }
```

### 13.9 一句话标准

- **组件写语义，token 持有颜色；新增样式先找 token，找不到再补 token。**

## 14. 代码结构总览

> 这一节的目标是：后续开发时，先看这里就能知道“该改哪个文件”，不必重新把整个目录扫一遍。

### 14.1 启动与页面装配层

- `src/流式最小Demo/界面/状态栏/index.ts`
  - 界面入口。
  - 负责导入 `theme-tokens.css`、`global.css`。
  - 在 `$(() => {})` 内挂载 Vue 应用，并在 `pagehide` 时卸载。
- `src/流式最小Demo/界面/状态栏/App.vue`
  - 最外层壳。
  - 只负责页面标题、说明文字和挂载 `StoryPage`。
- `src/流式最小Demo/界面/状态栏/pages/StoryPage.vue`
  - 当前唯一主页面。
  - 不直接写业务逻辑，只负责把 `useStreamingDemo()` 暴露的状态与动作分发给各个组件。

### 14.2 业务核心层

- `src/流式最小Demo/界面/状态栏/useStreamingDemo.ts`
  - 当前 demo 的**主协调器**。
  - 负责：
    - 读取真实聊天记录并重建 transcript；
    - 发送 user 输入并走 `generate` 流式；
    - 创建 assistant 占位楼层并持续写回；
    - 执行 assistant 隐藏策略；
    - 恢复 / 持久化阅读器状态；
    - 管理 opening 配置、生成与渲染；
    - 改词重生、回退删除、swipe 等贴近酒馆原生语义的动作；
    - 监听 `iframe_events` 与 `tavern_events` 并同步宿主变化。
- `src/流式最小Demo/界面/状态栏/types.ts`
  - 定义本 demo 的 ViewModel 与页面层类型：
    - `TranscriptItem`
    - `ReaderSummary`
    - `ReaderLogItem`
    - `ReaderChatState`
- `src/流式最小Demo/界面/状态栏/readerState.ts`
  - 阅读器状态的 chat 变量适配层。
  - 负责：
    - 读写 `stream_demo.reader_state`；
    - 版本迁移；
    - `message_id` / `reading_mode` / `density` 的归一化。

### 14.3 共享协议层

- `src/流式最小Demo/shared/message.ts`
  - assistant 流式占位楼层的“消息协议层”。
  - 负责：
    - 判断一条 assistant 是否属于本 demo；
    - 构建带 marker 的楼层 raw；
    - 提取 `<demo_phase>`、`<content>`、`<option>`；
    - 生成 preview 用纯文本。
- `src/流式最小Demo/shared/opening.schema.ts`
  - opening preset / payload 的 Zod schema。
  - 这是 opening 结构的唯一类型基准。
- `src/流式最小Demo/shared/opening.ts`
  - opening 的运行时适配层。
  - 负责：
    - 默认 preset / payload 创建；
    - chat 变量读写；
    - opening prompt 组装；
    - opening AI 输出解析。
- `src/流式最小Demo/shared/opening-preset.default.json`
  - opening 静态配置源。
  - 当前控制：
    - 世界观背景；
    - 开场第一句；
    - 默认 meta；
    - 表单 schema；
    - opening 输出规则。

### 14.4 展示组件层

- 已接入主页面的组件：
  - `ReadingHeader.vue`：顶部阅读器状态头。
  - `ContextSummaryCard.vue`：摘要卡。
  - `WorkbenchTabs.vue`：工作台页签 / 日志区。
  - `OpeningSetupPanel.vue`：opening 配置表单。
  - `TopToolbar.vue`：筛选、密度切换、回到最新。
  - `HistoryModeBanner.vue`：浏览历史提示条。
  - `TranscriptList.vue`：可滚动 transcript 容器。
  - `TranscriptMessageCard.vue`：普通 user / assistant 卡片。
  - `TranscriptOpeningCard.vue`：opening 卡片。
  - `BottomComposer.vue`：底部发送区。
  - `MessageDetailModal.vue`：详情浮层。
- 当前未接入主页面、属于保留 / 早期验证组件：
  - `ComposerPanel.vue`
  - `StreamPreview.vue`
  - `MessageHistory.vue`
- 结论：
  - 如果后续只改当前主界面，优先看 `StoryPage.vue` 中**已经接入**的组件。
  - 对未接入组件，不要默认它们仍然代表当前产品结构。

## 15. 状态机与持久化约定

### 15.1 运行时主状态

- `input`
  - 底部输入框内容。
- `busy`
  - 是否处于生成 / 改词 / opening 生成等排他操作中。
- `status`
  - demo 主流程状态：`idle / preparing / streaming / persisting / done / error`。
- `streamText`
  - token 监听阶段的本地流式缓存。
- `finalText`
  - 生成结束时的最终文本缓存。
- `errorText`
  - 失败提示文本。
- `assistantMessageId`
  - 当前“最新 assistant 锚点”楼层号。
  - 它同时驱动：
    - 哪一条是 `isLatest`；
    - 哪一条允许展示“流式中”；
    - 哪一条允许显示 swipe 控件。
- `transcript`
  - 当前 UI 里的完整 ViewModel 列表。
  - 注意：它是**可重建缓存**，不是最终真相源。

### 15.2 阅读器状态

- `filterMode`
  - `assistant`：默认模式，只显示 opening、assistant 和最新 user。
  - `all`：显示完整 transcript。
- `density`
  - `comfortable / compact / minimal`。
- `readingMode`
  - `following_latest / browsing_history`。
- `openingExpanded`
  - opening 卡片是否展开。
- `selectedItem`
  - 当前详情浮层打开的消息。

### 15.3 编辑 / 回退相关状态

- `editingUserMessageId`
  - 当前正在“改词重生”的 user 楼层号。
- `editingUserDraft`
  - 改词输入框草稿。
- `rollbackConfirmMessageId`
  - 当前等待确认“回退删除”的楼层号。

### 15.4 Opening 状态

- `openingPreset`
  - 静态配置。
- `openingPayload`
  - 运行时 payload。
  - 其状态只允许：
    - `placeholder`
    - `configuring`
    - `generating`
    - `ready`

### 15.5 内部队列与定时器

- `patchQueue`
  - assistant 占位楼层写回串行队列，避免 token 高频到来时并发覆盖。
- `latestPatchedMessage`
  - 上次写回的 raw，用于去重。
- `generationStops`
  - 当前生成阶段绑定的 iframe 事件解绑句柄。
- `historyStops`
  - 宿主聊天变化监听的解绑句柄。
- `hidePolicyTimer`
  - 延迟执行隐藏策略，避免在消息快速变动时反复抖动。
- `hidePolicyRunning / hidePolicyRerun`
  - 确保隐藏策略串行执行。
- `externalSyncTimer`
  - 宿主事件发生后统一延迟重建 transcript。
- `readerStatePersistTimer`
  - 阅读器状态延迟落盘，减少 chat 变量频繁写入。

### 15.6 持久化路径

- `stream_demo.reader_state`
  - 存阅读器状态：
    - `version`
    - `initialized`
    - `opening_message_id`
    - `latest_user_message_id`
    - `latest_assistant_message_id`
    - `reading_mode`
    - `density`
    - `opening_expanded`
    - `updated_at`
- `stream_demo.opening`
  - 存 opening payload：
    - `preset_id`
    - `base`
    - `meta`
    - `user_input`
    - `prompt_echo`
    - `opening_content`
    - `options`
    - `state`

### 15.7 恢复时机约束

- 阅读器状态与 opening payload 的恢复，只在当前容器 `message_id === 0` 时作为“工作台态”执行。
- 结论：
  - 如果后续把本页面挂到非 0 层，不能默认它会沿用完整工作台状态。

## 16. 详细业务链与关键函数

### 16.1 挂载链

- `onMounted()` 后按这个顺序执行：
  1. `restoreReaderChatState()`
  2. `rebuildTranscript()`
  3. `bindHistoryRefreshEvents()`
  4. `queueHidePolicy('mounted')`
- 这一顺序的意图是：
  - 先恢复状态；
  - 再基于真实聊天重建；
  - 再开始监听宿主变化；
  - 最后补一次 assistant 隐藏收口。

### 16.2 Transcript 重建链

- 入口函数：`rebuildTranscript()`
- 流程：
  1. 读取当前容器 `message_id`；
  2. `getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' })` 拉全量真实消息；
  3. 若当前容器是 0 层，则优先构建 opening 卡；
  4. 再遍历 0 层之后的 user / assistant / system 消息；
  5. 记录最新 assistant 的 `message_id`；
  6. 统一生成 `TranscriptItem[]`；
  7. 同步 `selectedItem`、阅读器状态与隐藏策略。
- opening 的特殊规则：
  - 若 `openingPayload.state !== 'placeholder'`，opening 卡优先来自 payload seed；
  - 只有 payload 尚未就绪时，才回退读取真实 0 层 raw。

### 16.3 发送与流式链

- 入口函数：`runDemo()` -> `runGenerationFlow({ prompt, createUser: true })`
- 标准流程：
  1. 校验 opening 已经 `ready`；
  2. 创建隐藏 user 楼层；
  3. 绑定 `iframe_events` 生成事件；
  4. 调 `generate({ should_stream: true })`；
  5. 创建隐藏 assistant 占位楼层；
  6. token 到来时持续更新 `streamText`；
  7. `patchAssistantMessage('stream')` 把最新 token 写回占位楼层；
  8. 生成完成后切到 `persisting`；
  9. `patchAssistantMessage('done')` 写回最终内容；
  10. 再通过真实聊天重建与隐藏策略收口。

### 16.4 Assistant 占位楼层写回链

- 入口函数：`patchAssistantMessage(phase)`
- 规则：
  - assistant raw 必须通过 `buildStreamDemoMessage(text, phase)` 生成；
  - 每次写回都强制 `is_hidden: true`；
  - 使用 `patchQueue` 保证串行；
  - 同时会更新本地 `transcript`，让 UI 在宿主真正刷新前先显示出结果。

### 16.5 宿主变化同步链

- 入口函数：`bindHistoryRefreshEvents()`
- 当前监听的宿主事件包括：
  - `CHAT_CHANGED`
  - `GENERATION_STARTED`
  - `GENERATION_ENDED`
  - `MESSAGE_EDITED`
  - `MESSAGE_RECEIVED`
  - `MESSAGE_UPDATED`
  - `MESSAGE_SWIPED`
  - `MESSAGE_DELETED`
  - `STREAM_TOKEN_RECEIVED`
  - `SMOOTH_STREAM_TOKEN_RECEIVED`
- 这些事件不会直接重建，而是走：
  - `handleHostRefreshEvent()` -> `queueExternalSync()` -> `rebuildTranscript()`
- 这样做的目的是降低频繁事件导致的重建抖动。

### 16.6 Assistant 隐藏策略链

- 入口函数：`applyHidePolicy(reason)`
- 实际策略是：
  - 读取当前容器之后的全部消息；
  - 找出 `is_hidden !== true` 的楼层；
  - 批量补写 `is_hidden: true`。
- 这个策略不是只隐藏 assistant，而是对容器之后所有楼层统一 hidden。
- 设计含义：
  - 真实数据仍然写进聊天；
  - 阅读体验完全交由第 0 层 transcript 承担。

### 16.7 改词重生链

- 入口函数：`confirmInlineEditRegenerate(item)`
- 约束：
  - 只能修改最后一条 user；
  - 改写该 user 后，会删除其后的所有楼层；
  - 然后调用 `triggerNativeRegenerate()`，尽量走酒馆原生重生链。
- 设计目标：
  - 尽量让“改词重生”的语义与酒馆用户直觉一致，而不是只在 UI 本地重跑一遍。

### 16.8 回退删除链

- 入口函数：`deleteFromMessageId(messageId)`
- 语义：
  - 从指定楼层开始删除到最后一层；
  - 删除成功后：
    - 清理编辑状态；
    - 重新构建 transcript；
    - 记录日志。

### 16.9 Swipe 链

- 入口函数：`swipeLatestAssistant(direction)`
- 当前实现不自己模拟 swipe 数据结构，而是：
  - 优先定位宿主现有 `.swipe_left / .swipe_right` 按钮；
  - 触发宿主按钮点击；
  - 再通过宿主事件回流重建 transcript。
- 这部分是当前 demo 与宿主 DOM 耦合最强的一处，已集中封装在：
  - `collectHostDocuments()`
  - `clickHostSwipeControl()`

### 16.10 Opening 链

- opening 的完整流程是：
  1. 展示 preset 里的世界观 / 第一行 / 默认 meta；
  2. 用户填写 `form_schema`；
  3. `generateOpening()` 校验必填项；
  4. 用 `buildOpeningPrompt()` 组装 prompt；
  5. 调 `generate({ user_input })`；
  6. 解析 `<opening_prompt_echo>`、`<content>`、`<option>`；
  7. 写回 `stream_demo.opening`；
  8. `rebuildTranscript()` 重新渲染 opening 卡。

## 17. 组件职责与显示规则

### 17.1 StoryPage 页面编排顺序

- 当前主页面从上到下依次是：
  1. `ReadingHeader`
  2. `ContextSummaryCard`
  3. `WorkbenchTabs`
  4. `OpeningSetupPanel`（仅 opening 未 ready 时显示）
  5. `TopToolbar`
  6. `HistoryModeBanner`
  7. `TranscriptList`
  8. `BottomComposer`
  9. `MessageDetailModal`

### 17.2 TranscriptList 的职责边界

- `TranscriptList.vue` 只负责：
  - 列表滚动；
  - 判断是否接近底部；
  - 在滚动时发出 `reading-mode-change`；
  - 暴露 `scrollToLatest()` 给父层调用。
- 它不负责：
  - 拉消息；
  - 改写聊天；
  - 决定哪个楼层允许重生 / 删除。

### 17.3 TranscriptMessageCard 的显示规则

- `TranscriptMessageCard.vue` 负责：
  - 显示楼层号、角色、hidden 标识、流式标识；
  - 在 user 卡上提供“改词重生”；
  - 在可删除楼层上提供“回退删除”；
  - 在最新 assistant 上提供 swipe 控件；
  - 在流式阶段显示 `streamHtml`；
  - 在最终态显示 `finalHtml`。
- 密度规则：
  - `comfortable`：正文尽量展开；
  - `compact`：保留最新 / 流式 / assistant 重点卡；
  - `minimal`：进一步收缩，只保留最新或流式重点正文。

### 17.4 TranscriptOpeningCard 的定位

- opening 卡是 transcript 的特殊首项。
- 它与普通 assistant 卡的不同点在于：
  - `message_id` 固定为 0；
  - 主要展示 seed / opening 正文 / option；
  - 受 `openingExpanded` 控制；
  - 不允许“回退删除”。

### 17.5 Detail 弹层的语义

- `MessageDetailModal.vue` 的职责是：
  - 把单条 `TranscriptItem` 的 raw / regexText / preview / options 等调试信息摊开给开发者与高级用户。
- 因此如果后续给 transcript 新增字段，详情层通常也应同步补展示入口。

### 17.6 Workbench 区块的语义

- `ReadingHeader.vue`：阅读器总状态头部。
- `ContextSummaryCard.vue`：把 `ReaderSummary` 里的 turn 数、最新摘要、状态标签做成卡片摘要。
- `WorkbenchTabs.vue`：当前主要承担工作台摘要 / 操作日志展示。

## 18. 关键不变量与修改入口

### 18.1 当前实现的不变量

- transcript 最终必须能由真实聊天记录完整重建。
- 本地 `streamText` / `finalText` 只是过程缓存，不是最终真相。
- assistant 占位楼层 raw 必须带 marker；否则无法按 demo 协议解析。
- opening payload 优先级高于 0 层旧 raw；只有 payload 不存在时才回退旧 raw。
- 改词重生只允许作用于**最后一条 user**。
- swipe 只作用于**最新 assistant**，且 opening 不参与 swipe。
- 样式新增先补 token，再在组件里消费 token。

### 18.2 后续开发时“改哪里”

- 想改 opening 文案、表单字段、默认 meta：
  - 先改 `shared/opening-preset.default.json`
  - 若结构变化，再改 `shared/opening.schema.ts`
- 想改 opening prompt 拼装方式：
  - 改 `shared/opening.ts` 的 `buildOpeningPrompt()`
- 想改 opening 渲染种子逻辑：
  - 改 `useStreamingDemo.ts` 的 `composeOpeningSeedText()` / `buildOpeningTranscriptItem()`
- 想改 assistant 流式 raw 协议：
  - 改 `shared/message.ts`
  - 并同步检查 `buildTranscriptItem()` 是否仍能正确解析
- 想改 transcript 重建逻辑：
  - 改 `useStreamingDemo.ts` 的 `rebuildTranscript()`
- 想改 hidden 策略：
  - 改 `applyHidePolicy()` / `queueHidePolicy()`
- 想改宿主事件同步：
  - 改 `bindHistoryRefreshEvents()` / `handleHostRefreshEvent()`
- 想改改词重生 / 回退删除语义：
  - 改 `confirmInlineEditRegenerate()` / `deleteFromMessageId()`
- 想改 swipe 方案：
  - 改 `clickHostSwipeControl()` / `swipeLatestAssistant()`
- 想新增阅读器持久化字段：
  - 同时改：
    - `types.ts`
    - `readerState.ts`
    - `useStreamingDemo.ts` 的恢复与持久化逻辑

### 18.3 最少重读原则

- 后续改动时，优先按下面顺序读：
  1. 本文档对应章节
  2. `StoryPage.vue` 看组件接线
  3. `useStreamingDemo.ts` 找动作入口
  4. 对应 `shared/*` 协议层
  5. 目标组件文件
- 除非涉及结构级重构，否则通常**不需要重新通读整个项目代码**。

## 19. 调试与排查清单

### 19.1 如果 transcript 与宿主聊天不一致

- 先检查：
  - `rebuildTranscript()` 是否已被触发；
  - `getChatMessages(..., { hide_state: 'all' })` 返回是否符合预期；
  - 是否有宿主事件没有走进 `queueExternalSync()`。

### 19.2 如果流式 token 不更新

- 先检查：
  - `bindGenerationEvents()` 是否成功绑定；
  - `iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY` 当前环境是否触发；
  - `patchAssistantMessage()` 是否被 `latestPatchedMessage` 去重挡住；
  - assistant 占位楼层是否创建成功。

### 19.3 如果 assistant 在宿主里仍然可见

- 先检查：
  - `queueHidePolicy()` 是否有执行；
  - `applyHidePolicy()` 扫到的楼层是否包含目标消息；
  - 当前容器 `message_id` 是否判断正确。

### 19.4 如果 opening 不显示或回退成旧内容

- 先检查：
  - `stream_demo.opening` 是否存在；
  - `openingPayload.state` 是否仍停留在 `placeholder / configuring / generating`；
  - `buildOpeningTranscriptItem()` 是否被 payload 优先命中；
  - 是否误把 0 层 raw 当成了唯一 opening 来源。

### 19.5 如果 swipe 无效

- 先检查：
  - 当前是否真的是“最新 assistant”；
  - 宿主消息是否有 swipe；
  - `.swipe_left / .swipe_right` 在当前酒馆 DOM 结构里是否存在；
  - 当前环境是否跨 iframe 导致宿主 document 不可访问。

### 19.6 如果改词重生行为异常

- 先检查：
  - 当前修改对象是不是最后一条 user；
  - user 楼层是否已成功改写；
  - 后续楼层是否已删除；
  - `triggerSlash('/trigger await=true')` 当前环境是否可用。

### 19.7 样式与构建自检

- 构建：

```powershell
pnpm build
```

- 检查组件层是否误写颜色字面量：

```powershell
rg -n --glob '*.vue' --glob '*.css' --glob '*.scss' "#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(" src/流式最小Demo/界面/状态栏 | Where-Object { $_ -notmatch 'theme-tokens\.css' }
```

## 20. 一句话总结

- `流式最小Demo` 的核心不是“在 UI 里临时显示点流式文本”，而是把第 0 层 UI 建成一个**以真实聊天记录为后端、以 transcript 为主体、尽量贴近酒馆原生业务线的同层聊天工作台**；样式层则统一走 `--demo-*` token，避免后续维护漂移。

## 21. 2026-03-09 开发记录

> 本节用于记录 2026-03-09 这轮开发后的最新实现共识。后续继续接手时，先读这里，再决定是否需要深入代码。

### 21.1 今日已确认的关键结论

- **`is_hidden` 不能作为“既隐藏又保留原生 chat_history”的方案。**
  - 在本地 SillyTavern + 酒馆助手环境中，经 MCP 现场检查后确认：
  - 被设为 `is_hidden: true` 的聊天楼层，不会正常进入酒馆原生 `chat_history` 提示词通道；
  - 提示词查看器抓不到这些楼层，说明它们不能作为“原生历史”来源。
- 因此，当前 demo 的隐藏策略已经从：
  - **数据层 hidden**
  - 调整为：
  - **数据层保持原生可见 + 宿主显示层隐藏非 0 楼**。

### 21.2 今日已落地的结构调整

#### A. 0 楼永远只做容器

- 第 `0` 楼不再承担 opening 正文载体职责。
- 第 `0` 楼的职责现在固定为：
  - 前端界面容器；
  - transcript 工作台挂载点；
  - 稳定 UI 占位符。
- 任何会导致 `0` 楼 raw 被正文覆盖、从而把 iframe 顶掉的做法，当前都视为错误方案。

#### B. opening 改为落到“首条真实 assistant”

- opening 生成结果不再写回 `message_id = 0`。
- 当前实现改为：
  - opening 生成完成后，写入 `0` 楼之后的首条真实 assistant；
  - 若该 opening assistant 已存在，则更新该楼层；
  - 若不存在，则在 `0` 楼之后创建一条新的 assistant。
- 这条楼层会打一个数据标记：
  - `data.stream_demo.opening_assistant = true`
- 这样做的目的有两层：
  1. 让 opening 正文进入酒馆原生 `chat_history`；
  2. 保住 `0` 楼 iframe 容器不被正文覆盖。

#### C. transcript 重建时跳过 opening assistant 原文楼层

- 因为 opening assistant 已经进入真实聊天历史，如果 transcript 重建时再把这条楼层正常读出来，就会与 opening 卡重复。
- 所以当前做法是：
  - transcript 顶部仍用 opening 卡展示 opening；
  - 重建聊天列表时，跳过 `data.stream_demo.opening_assistant = true` 的那条真实 assistant 楼层。
- 这样保留了：
  - 原生历史可见性；
  - transcript 阅读整洁性。

#### D. 普通聊天继续走酒馆原生历史

- 当前 user / assistant 楼层都保持：
  - `is_hidden: false`
- `generate` 仍走酒馆原生通道：
  - `generate({ should_stream: true, max_chat_history: 'all' })`
- 目标是让：
  - 酒馆助手提示词查看器；
  - 原生 `chat_history`；
  - 世界书扫描与后续提示词拼接；
  都继续基于真实聊天楼层工作。

#### E. 宿主隐藏改为显示层处理

- 由于不能再依赖 `is_hidden`，当前 demo 改为在宿主页面注入一段样式：
  - `#chat > .mes[mesid]:not([mesid='0']) { display: none !important; }`
- 这个隐藏只影响宿主聊天区的可见性，不改动真实楼层数据。
- 因此：
  - 原生历史仍存在；
  - 0 楼工作台可独占阅读体验；
  - 刷新后需要重新应用这段样式，所以挂载与外部事件同步仍然很重要。

### 21.3 今日已补的交互项

- 底部操作区已新增：
  - `ROLL`
- 当前 `ROLL` 的语义是：
  - 找最后一条 user；
  - 保留这条 user；
  - 删除其后续楼层；
  - 由 demo 自己重新 `generate({ should_stream: true })`；
  - 让新 assistant 重新生成。
- 该实现目标是：
  - 贴近酒馆“对最新回复不满意，重来一版”的体验；
  - 同时保证流程仍在 demo 的同层控制之内。

### 21.4 当前开发重点：Swipe 功能实现中

> **当前开发进度明确标记为：Swipe 功能实现。**

- 目前 swipe 逻辑已经改为：
  - 使用 `getChatMessages(..., { include_swipes: true })` 读取真实 `swipe_id / swipes`；
  - 使用 `setChatMessages([{ message_id, swipe_id }])` 切换 swipe。
- 这条路线已经确认是正确方向，因为它走的是酒馆原生 swipe 数据结构，而不是自造状态。

#### 当前已明确的 swipe 语义共识

- swipe 的真正用途是：
  - 用户对**当前最新 AI 回复**不满意；
  - 想保留该轮原提示词；
  - 对同一轮 assistant 回复生成并列版本；
  - 再通过 swipe 左右切换查看。
- 在酒馆原生语义下：
  - **只有最新的 AI 回复楼层**天然具备 swipe 语义和对应切换按钮。

#### 当前 swipe 的已知问题

- 今天在实现过程中发现：
  - 某些会话里，MCP 读到的 `2/3` 实际挂在 `message_id = 0` 上；
  - 这与“swipe 应只属于最新 assistant 楼层”的原生语义并不一致；
  - 说明当前 demo 在 opening / 历史 / 最新 assistant 的边界上还没有完全收稳。
- 因此，**swipe 功能当前仍然处于实现中，不应视为最终完成状态。**

#### 下一步的 swipe 收口方向

- 后续 swipe 实现必须满足以下约束：
  1. 目标楼层应当是“当前最新 assistant”；
  2. 不能错误地把 opening 或 0 楼容器当成 swipe 目标；
  3. UI 中的 swipe 按钮应只在该目标成立时显示；
  4. 切换后 transcript 与宿主显示应同时保持一致。

### 21.5 当前接手建议

- 如果后续继续做 swipe：
  - 先从“如何判定当前真正的 swipe 目标楼层”入手；
  - 再检查该楼层与 opening assistant / 0 楼容器的边界；
  - 最后才处理按钮显示与交互细节。
- 如果后续继续做 opening：
  - 保持“0 楼只做容器”的原则，不再回退到“正文写 0 楼”的旧做法。
- 如果后续继续做原生提示词对齐：
  - 保持“真实聊天楼层可进入原生 history”的方向，不再依赖 `is_hidden` 做数据层隐藏。

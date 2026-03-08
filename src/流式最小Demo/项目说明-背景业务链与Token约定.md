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

## 14. 一句话总结

- `流式最小Demo` 的核心不是“在 UI 里临时显示点流式文本”，而是把第 0 层 UI 建成一个**以真实聊天记录为后端、以 transcript 为主体、尽量贴近酒馆原生业务线的同层聊天工作台**；样式层则统一走 `--demo-*` token，避免后续维护漂移。

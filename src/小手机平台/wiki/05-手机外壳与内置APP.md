# 05 手机外壳与内置 APP（shell/ + apps/ + assets/）

UI 层的三个关键设计：

1. **Shadow DOM 隔离**：外壳样式注入 open Shadow Root，天然与酒馆页面样式互不干扰
2. **textContent-only 渲染**：所有 APP 页面用 `textContent` 赋值，无 `innerHTML`（防 XSS，测试静态断言保证）
3. **UI 与业务解耦**：APP 只持有 `PhoneAppServices` 接口，不直接接触 DB / Provider / 世界书

---

## 5.1 [shell/phoneShell.ts](../shell/phoneShell.ts) - 手机外壳（Shadow DOM 模态 UI 核心）

### 挂载机制

- `resolveTopDocument()` 强制取 `window.top.document`（脚本运行在 iframe 内，UI 必须挂到**顶层文档**；取不到则抛错，禁止 iframe 本地降级）
- 构造时单例校验：`querySelector('[data-tavern-phone-root]')` 已存在则抛 `'PhoneShell root already exists'`
- DOM 结构：`div[data-tavern-phone-root]`（默认 hidden）-> `attachShadow({mode:'open'})` -> Shadow 内含 `<style>`（注入调用方传入的 `styles`，即 phoneShell.css 字符串）+ `.phone-overlay` -> `section.phone-shell[role=dialog][aria-modal=true]`（状态栏 + 导航栏 + `main.phone-content` + `p.phone-live[aria-live=polite]` 屏幕阅读器播报区），root 追加到顶层 `document.body`

### 关键导出

| 导出 | 说明 |
| --- | --- |
| `PhoneShellOptions` | `apps / document? / styles / returnFocus? / initialRoute? / theme? / productName?（默认'小手机'）/ statusName?（默认'星穹通信'）/ onRequestClose?` |
| `PhoneShellApi` | `open(route?, returnFocus?) / close() / toggle() / back() / getRoute() / isOpen() / setTheme() / dispose()` |
| `PhoneRouteHistory` | 路由栈：`push`（与当前相同则忽略）、`back()`（栈底保护退到 home）、`current()`；**关闭外壳不清栈，重开后恢复上次 APP** |
| `PhoneOpenFocusGuard` | 版本号守卫，防止过期的 `open()` 异步完成后偷取焦点 |
| `PhoneViewScope` | 视图作用域：`listen()` 注册监听、`onDispose()` 注册清理器、`dispose()` 逆序释放全部资源 |
| `getFocusTrapTarget()` | Tab 循环焦点目标计算（首尾环绕） |
| `createPhoneAppIcon()` | APP 图标：有 `iconSrc` 用 `<img>`，否则文本 glyph |
| `PhoneShell` / `createPhoneShell()` | 核心实现 / 工厂 |

### 行为要点

- **关闭语义**：关闭按钮、遮罩点击、Escape 三者统一走 `requestClose()` -- 有 `onRequestClose` 回调则委托（运行时决定关窗/做清理），否则直接 `close()`；close 恢复 `returnFocus` 焦点
- **渲染机制**：`render()` 递增 `renderVersion`、销毁旧 `viewScope`；home 渲染 3 列桌面网格（`showOnHome !== false` 的 APP）；进入 APP 先显示「载入中…」，异步 `app.render(context)` 完成后校验 scope 活性 + 版本号，**过期结果丢弃**；异常渲染为错误页
- 给 APP 的 `PhoneAppRenderContext`：`document / listen / announce / requestRender / navigate / onDispose / isActive`
- **主题**：`setTheme('system')` 删除 `data-theme`（交给 CSS `prefers-color-scheme`）；light/dark 写 `root.dataset.theme`

> 外壳由**角色专用适配器**（寒冬适配器，`productName:'伊甸终端'`）在建立 owner/session 后创建，`40手机外壳` 脚本只发布创建器、不建实例。

## 5.2 [shell/phoneShell.css](../shell/phoneShell.css) - 外壳完整样式（约 1100 行）

iOS 原生风格，通过 Shadow DOM 天然隔离：

- `:host` 固定 `position:fixed; z-index:2147483647; width:100vw; height:100dvh; pointer-events:none`（遮罩层恢复 `pointer-events:auto`），保证覆盖酒馆所有 UI
- CSS 变量体系：`--phone-blue:#007aff`、`--phone-red:#ff3b30`、微信绿 `--wechat-green:#07c160`、气泡绿 `--wechat-bubble-outgoing:#95ec69`、聊天底色 `--wechat-chat-background:#ededed`、毛玻璃 `--phone-glass`
- 机身 390×760px、圆角 36px；状态栏/导航栏毛玻璃 `backdrop-filter: blur(20px) saturate(160%)`
- 微信视觉语言：outgoing 行反转 + 绿色气泡带右箭头（`::before` 三角）；群头像灰底；时间分隔条居中灰色；发送键微信绿
- 无障碍/响应式：44px 最小点击区、`prefers-color-scheme:dark`、`data-theme` 强制主题、`prefers-reduced-motion/-reduced-transparency/contrast`、`safe-area-inset`、520px 以下全屏（圆角 28px）

---

## 5.3 [apps/phoneApps.ts](../apps/phoneApps.ts) - 内置 APP 定义与全部页面 UI

### 核心接口

- `PhoneRoute` = `'home' | 'messages' | 'contacts' | 'broadcasts' | 'tasks' | 'profiles' | 'profile-detail' | 'smart-tasks' | 'settings' | 'diagnostics'`
- `PhoneAppServices`：约 20 个必选方法（`listConversations / listMessages / listContacts / listBroadcasts / listTasks / getSettings / getDiagnostics / openConversation / addContact / sendMessage / watchConversation / saveSettings / fetchModels / submitActionToHost ...`）+ 14 个可选档案方法（`listProfiles / refreshProfile / saveProfileEdit / restoreProfileVersion ...`）
- 视图模型：`PhoneConversationView`、`PhoneMessageView`（`direction / status: sent|pending|failed / timeLabel 剧情时间戳`）、`PhoneContactView`、`PhoneBroadcastView`、`PhoneTaskView`、`PhoneSettingsView`、`PhonePromptDebugEntryView`（提示词调试）、`PhoneDiagnosticsView`、`PhoneProfileView`（13 个档案字段 + refreshStatus + changes + rawResponse + versions）、`PhoneProfileSettingsView`

### 工具函数

| 函数 | 说明 |
| --- | --- |
| `createTaskHostAction(task)` | 任务 -> `{kind:'composer.insert', text, sourceKey, mode}` 宿主动作 |
| `redactDiagnostic(value)` | 诊断文本脱敏（URL query 凭据、JSON 头、Bearer、sk- 密钥） |
| `createPhoneApps(services)` | 闭包持有选中态，返回 8 个 APP 定义 |

### 8 个内置 APP

| 路由 | 标题 | 功能要点 |
| --- | --- | --- |
| `messages` | 微信（PNG 图标） | **双态**：无选中 -> 会话列表（私聊/群头像、未读徽标、失败行内重试）；选中 -> 聊天详情（`watchConversation` 订阅重绘、时间分隔条去重、气泡列表、失败重试/进行中取消、composer 发送） |
| `contacts` | 通讯录 | 已添加（点击开私聊并跳转；「邀请入群/移出群聊」切换 `setContactGroupMembership`）与可添加两节 |
| `broadcasts` | 广播 | 「末日公共广播」+「重新生成本期广播」按钮（`regenerateProfileRadio`）；`profile-radio` 渲染三栏 issue 卡片；`deterministic` 渲染通知行 |
| `tasks` | 任务 | 列表 +「送入输入框」按钮（`createTaskHostAction` -> `submitActionToHost`） |
| `profiles` | 档案 | 正文进度（`正文进度 N / 阈值`）、刷新设置面板（autoRefreshEvery 1-50、promptProfileMaxChars）、「刷新全部/重试失败」、紧凑人物卡（状态徽标 + analysisNarrative 摘要 + 行内刷新） |
| `profile-detail` | 人物档案（showOnHome:false） | 四 Tab：**变化**（before/after/原因/依据）、**档案**（固定本色只读 + 10 个 textarea 编辑器）、**依据**（正文范围/最近微信/引用标记/历史版本恢复）、**分析**（AI 说明/模型推理/原始回传） |
| `settings` | 设置 | Provider（tavern/OpenAI-compatible）/ API URL / API Key（password，保存后清空不留明文）/ 模型 + 拉取模型列表 / 生成参数 / 主题 / 通知 |
| `diagnostics` | 诊断 | 运行时状态、稳定快照版本、待同步正文记忆、可重试 ChatLore、模块状态、最近错误（脱敏）、**提示词调试面板**（组装提示词宏未展开/展开后/AI 原始响应/解析结果/错误） |

## 5.4 [apps/profileHelper.ts](../apps/profileHelper.ts) - 档案兜底收集器

`collectProfiles(services)`：无 AI 档案服务时的只读兼容层 -- 优先 `services.listProfiles()`；否则遍历已添加联系人，按约定 ID `private:${contactId}` 找私聊会话统计消息数/取最后一条 60 字，拼占位档案（各字段「待分析/暂无」）。

## 5.5 [apps/profileAnalyzer.ts](../apps/profileAnalyzer.ts) - 独立「房东卡」风格档案分析器

基于旧版全局对象（`window.parent.SillyTavern / TavernHelper / PhoneSystem / Mvu`）的独立分析器，与 profiles/ 体系**并行、互不依赖**：

- `class ProfileAnalyzer(db, sessionKey)`；配置/状态持久化到 localStorage（`profile_analyzer_${sessionKey}_config/_state`）
- `DEFAULT_CONFIG = { triggerInterval: 30, enableAutoAnalysis: true }`
- `checkAndTrigger()`：只在**双数楼层**（AI 输出后）且达到 `lastAnalyzedFloor + triggerInterval` 时触发
- 流程：读最近聊天（去 HTML/宏、截 500 字）-> 读 MVU `stat_data.租客列表` -> 智能过滤只分析最近对话中出现的人名 -> 逐人分析（世界书本色 + 上次动态 -> 提示词 -> `PhoneSystem.callExternalAPI` -> 去围栏）-> 长度 > 30 才写入
- `updateDynamicProfile()`：经 `window.parent.updateWorldbookWith` upsert 条目（name=`[人物动态]人名`，constant + before_character_definition/depth 4/order 101）

## 5.6 [apps/intelligentApps.ts](../apps/intelligentApps.ts) - 智能档案/智能任务 APP（UI 层）

配合 [intelligence/](06-人物档案与智能情报.md) 服务的两个 APP 定义：

- `IntelligentAppServices`：扩展 `PhoneAppServices`，**强制**（非可选）`listProfiles / getProfile / refreshProfile / listSmartTasks / refreshSmartTasks / deleteSmartTask`
- `createProfileApp(services)`（route `profiles`）：整体刷新按钮 + 档案卡片（基本信息/性格/当前状态/关系/最近互动 + **数据来源标记** MVU·微信·广播·正文）+ 行内刷新
- `createSmartTasksApp(services)`（route `smart-tasks`）：「重新解析聊天」；任务按 type 分三节；优先级 🔴🟡🟢；「执行」发送 `composer.insert` 动作；「删除」调 `deleteSmartTask`

## 5.7 [assets/wechatIcon.ts](../assets/wechatIcon.ts)

唯一导出 `WECHAT_APP_ICON_SRC`：约 6KB base64 PNG data URI（微信绿色 App 图标），供 `messages` APP 的 `iconSrc` 使用；测试以 sha256 锁定内容防篡改。

---

## 5.8 脚本入口

### [脚本/40手机外壳](../脚本/40手机外壳/index.ts) - 模块 `phone.shell`

manifest：`{ id: 'phone.shell', version: '1.0.1', required: true, dependsOn: ['platform.services'] }`。注册 `createServiceModule('phone.shell', {'phone.shell': {createPhoneShell}})` -- **只发布创建器不建实例**，由角色适配器在建立 owner/session 后取用创建唯一 Shell。

### [脚本/50通信与情报APP](../脚本/50通信与情报APP/index.ts) - 模块 `communication.apps`

manifest：`{ id: 'communication.apps', version: '1.0.1', required: true, dependsOn: ['data.sync', 'ai.scheduler', 'phone.shell'] }`。发布 `{createPhoneApps}` -- 消费方（角色适配器 / 90主适配器）`require('communication.apps')` 拿到工厂，传入自己的 `PhoneAppServices` 实现生成 APP 列表，再交给 Shell。

### [脚本/70微信APP适配器](../脚本/70微信APP适配器/index.ts) - 模块 `wechat.adapter`

manifest：`{ id: 'wechat.adapter', version: '1.0.0', required: true, dependsOn: ['platform.services', 'ai.scheduler', 'data.sync'] }`。**自定义 PhoneModule**（手写 init/dispose/getStatus 状态机）：

1. init 时用 [platform/tavernApiAdapter](../platform/tavernApiAdapter.ts) 的 `createGenerateRaw()` / `createStopGenerationById()` 并暴露到 iframe 全局（若未定义）
2. 发布 `provider.factory`：`createProvider()` 从 `ai.providers` 与 `settings.store` 服务取目录，按用户设置创建 `OpenAICompatibleProvider`（密钥经父窗口 localStorage 的 settingsStore 回调获取）或 `TavernProvider`
3. 发布 `message.sender`：`sendMessageViaChatCore(conversationId, content)` **桥接旧版小手机全局对象** -- `window.parent.ChatDB.addMessage(conversationId,'<user>',content)` 写用户消息 -> 先尝试 `ChatCore.generateGroupReply` 失败降级 `generatePrivateReply` 生成 AI 回复 -> `ChatSync.instantSync(conversationId)` 同步世界书；ChatCore/ChatDB 缺失时抛明确错误（要求旧版「聊天核心/聊天数据库」脚本已加载）

> **微信发消息的两条链路**：UI 的发送按钮调 `PhoneAppServices.sendMessage`（由角色适配器实现，优先经 `provider.factory` 用 Provider 发 AI）；`message.sender` capability 则是桥接旧版小手机成熟实现的备用通道。收发完成经 `watchConversation` 通知 UI 重绘。

测试参考：[__tests__/shellSource.test.js](../__tests__/shellSource.test.js)（源码静态断言 + `ts.transpileModule` 运行时加载，覆盖 textContent-only、单例 root、焦点陷阱、品牌定制、路由历史、设置保存/拉模型/清除 Key、watchConversation 重绘等）。

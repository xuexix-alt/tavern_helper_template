# 微信草稿、未读及会话排序

用户已确认实现以下三项，延续现有滚动与成员页改动。

## 约定接口

- PhoneAppServices 新增可选 `watchConversations(listener: () => void): () => void`。
- 新增可选 `markConversationRead(conversationId: string, messageIds: readonly string[]): Promise<void>`；只标记实际挂载且可见的消息，关闭手机或成员页不清未读。
- PhoneConversationView 新增可选 `updatedAt: number` 和 `timeLabel: string`；适配器按实际消息 createdAt 降序返回列表。
- Runtime 新增 `setUnreadCount(sessionKey: string, count: number): void`，拒绝旧会话回调；切换会话/owner 重置计数。
- PhoneShell 新增 `setUnreadCount(count: number): void`，仅刷新桌面微信角标，不重绘输入框。适配器负责订阅 runtime unread 并解除订阅。

## 执行

- [x] 数据层：持久化已读状态、初始化旧历史已读；实时列表订阅覆盖普通/主动/确定性群消息，更新总未读；测试同时间消息、会话隔离、并发已读和迟到结果。
- [x] 界面层：草稿按酒馆 sessionKey + conversationId 缓存到宿主 sessionStorage（不可用时内存降级），收消息/切页/重开不丢；发送成功只清除本次发送草稿，失败保留。
- [x] 界面层：可见挂载时标记实际渲染消息；关闭手机释放视图订阅；列表显示时间并监听变化；桌面微信显示总未读。
- [x] 回归测试、浏览器模拟、独立审查、相关 production 构建与一体化包验证。

## 范围与保护

不改群成员管理，不提交/推送，不碰 st-chatu8。保留已有未提交改动。构建前备份现有一体化 JSON，构建后重新生成。真实酒馆未运行时明确区分模拟验证。

## 验证结果

- 52 项 node:test 检查通过（外壳/APP、适配器列表排序和会话切换、现有寒冬源码契约）。
- conversationState、runtime、data、winterPhoneAdapter 四个 TS 测试脚本通过，覆盖真实内存和 fake-indexeddb 持久层。
- 浏览器模拟验证：桌面角标、列表新消息排序、可见清读、成员页和关闭状态保留未读、草稿切页/收消息/发送新稿保护。
- 对相关文件 ESLint 零错误，仅既有测试动态 require 的两项警告。
- 00/40/50、寒冬90及一体化 production 构建通过；有常规包体积/Browserslist数据过期提示。一体化 JSON 验证通过。
- 额外 phoneBridge.test.ts 在 owner 不匹配用例已有失败：actual available / expected unavailable；用 git HEAD 版本的测试和依赖在内存重跑，失败一致，未扩展修改该机制。
- 独立审查代理遇到账户用量限制；主代理继续审查并修复新会话尚未准备好就重开页面，以及通讯录跨session打开私聊选中态被重置的问题，两者均有行为回归测试。
- 真实 localhost:8000 酒馆未运行；本次没有现场生成验证。
- 构建前已将旧一体化JSON备份到系统临时目录，构建后重新生成；不提交或推送。

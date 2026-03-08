# 流式最小Demo 状态持久化说明

本文档说明 `src/流式最小Demo/界面/状态栏/useStreamingDemo.ts` 中写入 `chat` 变量的阅读器锚点状态。

## 变量位置

- 路径：`stream_demo.reader_state`
- 变量类型：`chat` 变量
- 读写接口：
  - `getVariables({ type: 'chat' })`
  - `updateVariablesWith(..., { type: 'chat' })`

## 字段定义

- `version: number`
  - 当前阅读器状态结构版本号
- `initialized: boolean`
  - 当前聊天是否已经初始化过阅读器状态
- `opening_message_id: number | null`
  - opening 开场卡所绑定的真实消息楼层号
- `latest_user_message_id: number | null`
  - 最近一次用户输入对应的真实消息楼层号
- `latest_assistant_message_id: number | null`
  - 最近一次 assistant 对应的真实消息楼层号
- `reading_mode: 'following_latest' | 'browsing_history'`
  - 当前阅读模式
- `density: 'comfortable' | 'compact' | 'minimal'`
  - 当前阅读密度
- `opening_expanded: boolean`
  - opening 卡当前是否展开
- `updated_at: number`
  - 最近一次写入时间戳

## 为什么写入 `chat` 变量

- 这些状态属于“当前聊天会话”的阅读器上下文，不属于角色全局，也不是单条消息变量。
- 刷新页面、重载 iframe、重新进入聊天时，可用来恢复阅读器状态。

## 恢复策略

- 挂载时先读取 `chat` 变量中的阅读器状态
- 读取后先执行迁移与归一化：
  - 旧版本或缺少 `version` 的状态会自动补齐为当前版本
  - 非法的 `message_id / reading_mode / density` 会回退到安全默认值
- 恢复：
  - `reading_mode`
  - `density`
  - `opening_expanded`
  - `latest_assistant_message_id`
- 然后再根据真实聊天记录 `rebuildTranscript()`
- 真实消息记录优先，`chat` 变量只作为恢复锚点，不作为正文数据源

## 写入时序

以下动作会触发 `reader_state` 写入或刷新：

- `rebuildTranscript()` 之后
  - 重新根据真实聊天记录构建 transcript 后，会统一回写当前锚点
- 阅读模式切换时
  - `following_latest` / `browsing_history` 变化后会写入 `reading_mode`
- 阅读密度切换时
  - `comfortable` / `compact` / `minimal` 变化后会写入 `density`
- opening 展开/收起时
  - 会写入 `opening_expanded`
- 发送用户输入后
  - 成功创建新的 hidden `user` 楼层后，会更新 `latest_user_message_id`
- 创建 assistant 占位楼层后
  - 成功创建新的 hidden `assistant` 占位后，会更新 `latest_assistant_message_id`
- 生成结束后
  - 最终 assistant 楼层确认后，会刷新最新锚点并写回状态
- 删除/回滚后
  - 删除楼层后会重新计算 transcript，并同步新的锚点状态

### 写入策略说明

- 写入不是每次状态变化立即同步，而是通过 `queuePersistReaderChatState()` 做轻微延迟聚合
- 这样可以减少频繁写 `chat` 变量带来的抖动
- 最终原则仍然是：
  - **正文内容以 `chat_message` 为准**
  - **`reader_state` 只记录阅读器锚点与偏好**

## 版本与迁移策略

- 当前版本：`1`
- 版本号常量：`READER_CHAT_STATE_VERSION`
- 当未来需要调整字段时：
  1. 递增 `READER_CHAT_STATE_VERSION`
  2. 在 `migrateReaderChatState()` 中补旧版本迁移规则
  3. 保持“真实消息记录优先、chat 变量仅做锚点恢复”的原则不变

这样即使旧聊天里残留了老结构，也能在挂载时自动迁移，而不是直接让阅读器状态失效。

## 边界说明

### 1. 只有第 `0` 层宿主恢复 `reader_state`

- 当前设计目标是：**第 `0` 层是唯一主阅读器入口**
- 因此：
  - 第 `0` 层宿主会读取并恢复 `reader_state`
  - 非第 `0` 层宿主不会恢复这份共享状态

这样做的原因是：

- 避免第 `2`、`4` 等后续楼层错误读取第 `0` 层的 opening / latest assistant / 阅读模式
- 避免出现“第 `4` 层显示第 `0` 层 opening”这种串层现象
- 保证主阅读器语义稳定：
  - opening 只在主入口显示
  - reading mode 只服务于主阅读器

### 2. 非第 `0` 层的行为

- 非第 `0` 层 iframe 仍可挂载 UI，但不应把它视为正式主阅读器入口
- 它们最多只做：
  - 降级显示
  - 调试验证
  - 辅助实验
- 不应恢复共享的 `reader_state`

### 3. `reader_state` 不保存正文内容

- 不保存 transcript 全量数据
- 不保存 opening 正文全文
- 不保存 assistant / user 的完整消息内容

正文只从真实聊天记录中读取：

- `getChatMessages(...)`
- `chat_message.message`

`reader_state` 仅保存：

- 锚点
- 模式
- 密度
- 展开状态
- 时间戳

### 4. `chat` 变量是会话级共享状态

- 同一聊天里的不同 iframe 都能读到它
- 因此它适合存“当前聊天阅读器的共享状态”
- 但也正因为它是共享的，所以必须配合“只有第 `0` 层恢复”的规则使用

### 5. MVU 与 `chat` 变量的职责分离

- `chat` 变量：保存阅读器工作台的会话级状态
- MVU：保存消息级或结构化游戏变量

两者可以并存，但不要混用：

- 不要把阅读器 UI 锚点写进 MVU
- 不要把正文结构化状态快照塞进 `reader_state`

## 维护原则

- 正文内容始终以 `chat_message` 为准，不把 transcript 全量存入 `chat` 变量
- `chat` 变量只保存阅读器锚点与显示偏好
- 以后迁移或复用时，优先保留本文件中定义的字段语义，避免随意更名

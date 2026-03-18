# 同层版生图链排查结论

## 范围

本结论只针对：

- `src/寒冬末日/界面同层版`
- 同层版 UI 里通过 `st-chatu8` 触发正文文生图
- 图生成后写回 chat 与图廊收录

## 今天确认过的事实

### 1. 插件真正处理的目标，很多时候仍是 iframe 内的 `html-body`

来自多份日志与浏览器控制台的共同结论：

- 插件记录的双击目标仍然是 `DIV html-body`
- 不是宿主 chat 里的 `.mes_text`
- 因此插件会继续把这次正文生图理解为“0 层 iframe 内正文”

典型日志特征：

- `桌面端双击, target: DIV html-body`
- `该元素不包含 mes_text 类，尝试查找外部 mes_text`
- `外部 mes_text 检测结果: {mesId: 0, chatTextLength: 9}`
- `chat 文本长度 <= 100，从 DOM 元素获取文本`

### 2. 只有当插件真正命中宿主 `mes_text` 时，才会稳定写回 chat

已验证过的楼层差异：

- `4#`：成功命中宿主 `mes_text`，图片能写回 chat，也能被图廊收录
- `2#`：仍然落在 iframe `html-body`，图片只进入插件缓存或 metadata，chat 不持久化
- `6#`：存在“宿主节点未就绪/未找到”的额外时序问题，触发更不稳定

### 3. 插件在“目标识别错误”时，会退回自己的 metadata 存储

从 `st-chatu8` 调试日志可以确认：

- `insertOriginalText 定位结果` 中会找到 `mesId: 0`
- 由于 `mes长度不足`
- 插件退回到 `chatMetadata`

这会导致：

- UI 当前 session 里偶尔能看见图
- 但 chat 不持久化
- iframe 重载后图片消失

### 4. “后半段接管”当前失败的直接原因是任务池为空

我们已经补了一条“生成完成后由同层版主动写回目标楼层”的链，但日志显示它目前还没有真正接上：

- `request-received ... targetMessageId: null, tasks: []`
- `response-unmatched ... tasks: []`

并且日志里没有出现：

- `start-task`
- `response-matched`
- `persist-begin`
- `persist-success`

这说明：

- `generate-image-request` 和 `generate-image-response` 的监听本身在工作
- 但触发时没有建立起“本轮生图属于哪个 message_id”的 pending task
- 所以后续响应没有办法匹配回目标楼层

## 今天已经做过的尝试

### 已尝试的前链修补

1. 正文双击代理层
- 给 assistant 正文增加透明代理按钮
- 目标是让双击优先命中代理层，而不是正文 HTML

2. 正文层 pointer-events 调整
- 让正文文本层与普通子节点尽量不接收点击
- 只保留图片层和插件图像节点交互

3. 宿主节点定位重试
- 对“最新楼层宿主节点尚未出现”的情况做了短暂重试

4. 坐标命中宿主节点
- 新增了“iframe 坐标 -> 宿主 document.elementFromPoint”命中宿主节点的逻辑
- 让 `message_id` 查找退为兜底

### 已尝试的后链接管

1. pending task 管理
- 触发生图时登记目标 `message_id`
- `generate-image-request` 到来时绑定 `requestId/prompt`

2. 结果持久化补丁
- `generate-image-response` 到来时，尝试把结果写回目标消息：
  - `data.stream_demo.generated_images`
  - `extra.images`

3. 图廊读取链复用
- 图廊继续沿用现有的消息数据读取逻辑
- 不另起一套图片真源

## 当前最可靠的根因判断

### 根因 A：插件前链仍优先消费 iframe 内正文目标

即使我们在同层版外层做了代理，插件真正记录到的触发目标仍然常常是 `html-body`，说明：

- 我们的拦截没有进入插件的真实取目标路径
- 或者插件内部还有一层独立的命中/定位逻辑

### 根因 B：后链没有建立起“本轮请求属于哪个楼层”的上下文

即使图片已经真实生成成功，只要：

- `targetMessageId` 为空
- `tasks` 为空

就无法把结果写回正确楼层。

### 根因 C：并发与取消会放大问题

日志里已经出现：

- 旧请求被取消
- 新请求开始
- 返回的 response id 与上一轮不同

因此如果绑定时机太晚，或者只依赖一次同步事件，很容易串单。

## 当前方案优劣比较

### 方案一：继续修前链，强行让插件命中宿主 `mes_text`

优点：

- 理论上最接近插件原生行为
- 一旦成功，插件自己的原写回机制可能直接恢复

缺点：

- 现在还没有真正打到插件的实际命中路径
- 继续修会越来越依赖插件内部实现细节
- 难以保证后续版本稳定

### 方案二：保留现有双击发起，接管后半段落盘

优点：

- 不需要完全吃透插件内部的目标识别
- 只要图真的生成成功，我们就能主动把结果落回目标楼层
- 更利于同层版自己控制图廊与持久化

缺点：

- 必须先解决“任务池为空”的问题
- 需要设计一层可靠的 request/response 到 message_id 的绑定
- 如果前链上下文本身错误，LLM 提示词质量仍可能受影响

## 明天建议的第一步

优先继续做“后半段接管”，先解决任务池为空的问题，而不是继续盲修前链命中。

### 建议实现

增加一个 `recent image intent` 兜底绑定：

- 当用户刚刚在 UI 某楼层发起正文生图或图片重生时，记录：
  - `message_id`
  - `created_at`
  - `valid_for_ms`
  - 可选 `source = transcript | gallery`

- 当 `generate-image-request` 到来时：
  - 如果当前 pending task 为空
  - 则尝试直接绑定最近一次 `recent image intent`

这样至少能先让：

- `request-received` 不再是 `targetMessageId: null`
- `response-unmatched` 有机会变为 `response-matched`
- `persist-begin / persist-success` 真正启动

## 已有调试信号

后续继续排查时，优先在控制台搜索：

- `[stream-demo:image-bridge] start-task`
- `[stream-demo:image-bridge] request-received`
- `[stream-demo:image-bridge] response-matched`
- `[stream-demo:image-bridge] response-unmatched`
- `[stream-demo:image-bridge] persist-begin`
- `[stream-demo:image-bridge] persist-success`
- `[stream-demo:image-bridge] persist-failed`

## 当前状态总结

今天已经确认：

- 图生成失败的根因不只是“没写回”
- 而是“前链目标识别错误 + 后链没有楼层绑定 + 并发取消重入”

其中最容易先落地修复的是：

- 后链的 `message_id` 绑定与结果落盘

这也是明天最推荐继续做的方向。

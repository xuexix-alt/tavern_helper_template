# PRE 正文楼层滑块与流式正则修复设计

## 目标

为 `src/寒冬末日/same-layer-pre/界面/状态栏` 增加一个只控制正文显示范围的楼层滑块，并修复 PRE 流式输出期间酒馆 display 正则无法实时生效的问题。

本次改动必须满足以下边界：

- 楼层滑块只影响 PRE 正文及 Apple 故事历史中的正文列表。
- MVU 角色列表继续使用现有的最近 6 个正文楼层作为变量来源候选，不随滑块扩大。
- 画廊保持现有扫描范围选择和事件逻辑，不读取正文滑块设置。
- 滑块设置使用浏览器 `localStorage`，所有角色卡与聊天共用同一个值。
- PRE 流式阶段应用酒馆 display 正则，但不提前补全尚未闭合的业务标签，也不改变最终落盘后的完整渲染链。

## 现状与根因

PRE 当前通过 `selectPreTranscriptWindow` 固定保留最近 3 轮，即 6 个 user/assistant 正文楼层。非 Apple 顶部菜单虽然显示“最新”和总楼层标签，但选择结果没有参与正文窗口计算。Apple 主题的正文阅读区只展示当前 user/assistant，故事历史弹窗则使用同一个固定 6 层窗口。

MVU 角色面板接收 `baseTranscriptItems` 并从其中构建可用 `stat_data` 楼层选项。若直接扩大 `baseTranscriptItems` 而不增加隔离层，正文滑块会间接扩大 MVU 的历史范围，与需求冲突。

PRE 流式渲染当前调用：

```ts
formatAsDisplayedMessage(source, { message_id: predictedMessageId })
```

接口要求 `message_id` 对应已经存在的酒馆消息楼层。流式 assistant 尚未落盘，传入的是预测的下一楼层号，因此该调用会失败并回退为转义文本，HTML 美化正则无法生效。完整版同层 UI 已使用不依赖已落盘楼层的 `formatAsTavernRegexedString(text, source, 'display', { depth: 0 })`，这是 PRE 流式阶段应复用的工作模式。

## 组件与模块

### `PreTranscriptFloorSlider.vue`

新增可复用滑块组件，只负责交互和展示，不直接访问聊天 API 或 `localStorage`。

输入：

- `modelValue`：当前有效显示数量。
- `minimum`：有效下限；通常为 6，聊天不足 6 层时等于实际总数。
- `maximum`：当前聊天已落盘的 user/assistant 正文总数。
- `disabled`：当前聊天不足 6 层或没有可调范围时为真。

输出：

- `update:modelValue`：拖动或键盘操作产生的新数量。
- `change`：用户完成一次选择，用于持久化和触发正文重建。

显示文案：

- 未达到最大值：`最近 N 层 / 共 M 层`。
- 达到最大值：`全部 M 层`。
- 不足 6 层：`全部 M 层`，滑块禁用。

组件使用原生 `input[type="range"]`，保留方向键、触摸拖动、焦点样式和 `aria-valuetext`。样式遵循现有主题变量，不新增第三方依赖。

### `preTranscriptDisplaySetting.ts`

新增独立的纯设置模块：

- 存储键：`eden.sameLayerPre.transcriptDisplayCount`。
- 默认值和最低偏好值：6。
- 读取时只接受有限正整数，并向下取整；非法、缺失或小于 6 的值恢复为 6。
- 写入时执行相同归一化。
- `localStorage` 不可用或抛错时继续使用内存中的默认值，不阻断 PRE 启动与正文刷新。

保存的是用户偏好的数值，不是某个聊天收敛后的有效值。例如全局偏好为 30，打开只有 10 层的聊天时显示 10 层，但不会把存储值改写为 10；切换到更长聊天后仍按 30 层显示。

### `useSameLayerPre.ts`

将固定的 `PRE_TRANSCRIPT_WINDOW_SIZE` 改为可响应的正文显示偏好，同时保留 6 层作为 MVU 隔离窗口常量。

该组合函数新增或暴露：

- 当前聊天已落盘的 user/assistant 正文总数。
- 当前有效正文显示数量。
- 保存的正文显示偏好。
- 更新正文显示偏好的方法。
- 专供 MVU 的最近 6 层正文数组。

正文窗口按消息顺序从当前聊天尾部截取最近 N 个符合条件的 user/assistant 楼层。流式临时项不计入已落盘总数，也不消耗 N 的配额；生成期间始终追加显示，落盘后再作为普通正文楼层参与计数。

刷新、发送、重生和回退删除后重新计算动态最大值与有效显示数量。若删除导致聊天总数下降，只收敛当前有效值，不覆盖全局偏好。

### `StoryPagePre.vue`

非 Apple 主题用楼层滑块弹层替换现有仅有“最新/全部”标签的菜单。顶部按钮显示当前有效数量。

Apple 主题保留现有“楼层”按钮打开故事历史的行为，在 `PreAppleHistoryOverlay` 标题区挂载同一个滑块组件。Apple 主阅读区仍只显示当前一轮；滑块控制故事历史弹窗可读取和展示的正文范围。

传给 `MvuRolePanel` 的 `transcript-items` 改为专供 MVU 的最近 6 层数组。`PreGalleryPanel` 的 props、扫描范围和本地状态均不改变。

## 数据流

1. PRE 启动时从 `localStorage` 读取全局正文显示偏好，非法值归一化为 6。
2. 获取当前聊天正文总数，计算 `effectiveCount = min(savedPreference, totalReadableCount)`。
3. 正文重建只选取最近 `effectiveCount` 个已落盘的 user/assistant 楼层，并在生成中追加流式临时项。
4. 用户拖动滑块时即时更新预览；完成选择后保存偏好并按新的窗口重建正文。
5. MVU 始终接收独立截取的最近 6 层数组；画廊继续独立扫描宿主消息和插件图片来源。

## 流式 display 正则修复

PRE 的 `streamRendererDisplay.ts` 改为复用 PRE 已有的 `applyRegexForDisplay`：

- assistant 映射为 `ai_output`。
- user 映射为 `user_input`。
- system 映射为 `world_info`。
- 目标阶段固定为 `display`，`depth` 固定为 0。
- 正则返回非空字符串时直接作为流式 HTML。
- API 不存在、抛错或返回空字符串时，对当前全量流式快照执行 HTML 转义后显示。

该修复只改变流式预览。消息落盘后仍由现有最终渲染逻辑使用真实 `message_id`、宿主已渲染 HTML 或 `formatAsDisplayedMessage`，不改变图片 artifact、手势委托、MVU 或最终楼层刷新。

流式输入是截至当前 token 的全量快照。正则只有在其匹配条件满足时才会产出 HTML；实现不猜测或补齐未闭合标签，以免闪烁、错误嵌套或提前隐藏正文。

## 错误与边界处理

- 无正文时滑块显示 0 层并禁用。
- 正文总数为 1 至 5 时显示全部并禁用，不写回低于 6 的存储值。
- 存储偏好大于当前聊天总数时只收敛有效值。
- 新消息、回退删除和聊天切换后重新计算最大值。
- `localStorage` 受限时使用默认 6 层，界面仍可工作；本次会话内的滑块交互仍更新当前响应式值。
- 酒馆 display 正则 API 缺失或失败时流式预览安全降级为转义文本，并保持最终落盘渲染可恢复。
- 不更改画廊的 `scanLimitValue`、图片引用真值、宿主事件监听和手势目标解析。

## 测试与验证

遵循测试先行：先添加失败用例，再实现最小改动。

自动测试覆盖：

- 设置模块读取缺失、非法、小数、小于 6、正常值以及 `localStorage` 抛错。
- 偏好值在短聊天中只被有效收敛，不反向覆盖保存值。
- 正文窗口分别选择最近 6 层、中间数量和全部楼层，并排除 0 楼及非 user/assistant 消息。
- 流式临时项始终追加且不占用已落盘楼层配额。
- StoryPage 将独立最近 6 层数组传给 MVU，画廊不接收正文滑块值。
- 滑块组件的最小值、最大值、禁用条件、标签和可访问性属性。
- PRE 流式 assistant 调用 `ai_output/display` 正则通道并保留 HTML 美化结果。
- user/system 角色映射正确；正则返回空、缺失或抛错时安全转义。

实现后运行相关 Node 测试、格式检查和 PRE 定向构建。源码与构建验证只能证明接线和产物正确；真实酒馆 iframe 中 HTML 美化随流式 token 生效的表现需另行现场复验。

## 非目标

- 不改变 MVU 变量的存储、继承、刷新或回退策略。
- 不改变画廊扫描范围、图片持久化或插件原生图片交互。
- 不将正文显示偏好改为聊天变量、角色卡变量或消息变量。
- 不实现虚拟列表、分页加载、楼层搜索或按角色过滤。
- 不改变最终消息写入、生成请求上下文或 LLM 实际接收的历史数量。

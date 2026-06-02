# 同层 UI 图片读取与画廊正文统一规范 v1.0.0

本文约束同层 UI 中两条图片消费链路：

- 正文图片显示：消息正文里的 `image###...###` 占位、st-chatu8 原生按钮、生成完成后的图片水合。
- 画廊取图：当前可见楼层、非当前可见楼层、UI 关闭后才完成的插件原生图片回收。

核心原则：正文和画廊不得各自猜图。两者都应从同一个 NativeFirst Image Entity 管线拿图，再根据自己的 UI 职责决定“放回正文位置”还是“归入画廊分组”。

## 单一事实源

统一入口是 `buildGeneratedImageRefsForMessage()`。

这个入口应同时服务：

- `galleryGroups`：当前 transcript 可见楼层的画廊分组。
- `historicalGalleryGroups`：当前 transcript 不可见，但仍属于本 chat 的历史/近期图片分组。
- `TranscriptMessageCard`：正文里已有占位但图片稍后 ready 时的补水合。
- `appendChatu8ArtifactsToHtml()`：正文 HTML 构建时把插件原生图片、占位、兼容图片接回正文。

它的数据来源按 NativeFirst 优先级合并：

1. `host_dom`：当前 SillyTavern DOM 上 st-chatu8 已渲染的按钮、span、container、img。
2. `extra`：`chat[messageId].extra.images` 或当前 swipe 的 `swipe_info[swipe_id].images`。
3. `mes_tag`：消息正文里保存的 `image###...###` / 插件原生 tag。
4. `cache`：`chatMetadata['st-chatu8']` 中的图片缓存，只作为补全或兜底。

`cache` 可以补齐已有 native artifact 的 `src`，但不能无条件污染所有楼层。只有当前三路都没有 artifact 时，才允许 `cache` 作为兼容兜底进入 entity。

## 消息归属

图片必须绑定到确定的 `messageId`。

允许的归属依据：

- SillyTavern message 数据里的 `message_id`。
- DOM 上的 `.mes[mesid]`。
- DOM 上的 `.mes[data-message-index]`。
- st-chatu8 新版写在 `.mes_text[data-message-index]` 上的索引。
- pending request manager 已经登记的 requestId -> messageId。
- recent intent 只用于刚触发生成后的短窗口辅助归属。

禁止的归属方式：

- 在没有明确 intent 的情况下把图片塞给 latest。
- 只因为 cache 有 ready 图片，就把它归给当前打开的正文楼层。
- 非 latest 楼层触发生成后，把响应默认归到最后一楼。

## 正文显示链路

正文链路目标是“图片出现在它对应的正文位置”。

标准流程：

1. `buildHostRenderedHtml()` 构建楼层正文 HTML。
2. `appendChatu8ArtifactsToHtml()` 读取同一 messageId 的 NativeFirst artifacts。
3. 优先保留 st-chatu8 原生 DOM 或 prompt placeholder，不抢插件自己的按钮状态。
4. 当已有 ready 图片时，通过 prompt token 或 anchorText 放回正文附近。
5. 如果无法锚定，只有兼容注入允许追加到尾部；插件原生数据路径不应随意追加尾图。
6. `TranscriptMessageCard` 监听 gallery entries 后续 ready，把缺失的图补回正文占位。

正文链路的日志 scope：

- `inlineImageHydration / append_artifacts`
- `imageSourceResolver / build_refs`
- `TranscriptMessageCard / gallery_entry_hydration`，组件内已有 hydration 相关日志
- `imageGenerationEventBridge / on_request`
- `imageGenerationEventBridge / on_response_success`

重点字段：

- `messageId`
- `rawLength`
- `promptTokenCount`
- `hostDomCount`
- `extraCount`
- `mesTagCount`
- `cacheCount`
- `nativeFirstCount`
- `nativeRenderableCount`
- `pluginNativeCount`
- `compatibilityCount`
- `dedupedInjectCount`
- `renderMode`

## 画廊取图链路

画廊链路目标是“只要 chat 里已有成品图片，就能按楼层归档显示”，不要求该楼层当前在正文窗口内。

画廊必须支持跨当前楼层取图，这是设计要求，不是兜底漏洞。

画廊有三层来源：

1. 当前 transcript 可见楼层：`galleryGroups` 对 `transcript.value` 每个 assistant item 调 `buildGeneratedImageRefsForMessage()`。
2. 近期跨楼层扫描：`discoverRecentNativeGalleryImages()` 扫当前容器楼层之后的最近 assistant 消息，或按显式 `messageIds` 扫指定楼层。
3. 历史懒加载：`loadOlderGalleryImages()` 从当前可见窗口之前继续向旧楼层扫描。

画廊楼层选择采用正文同款窗口，例如 `最新 10-13`、`历史 6-9`，使用单选下拉。首次打开默认选择当前正文窗口；若当前窗口不可解析，则回退到 latest 窗口。用户切换窗口后，画廊按该窗口内的 messageIds 做显式扫描并只展示当前选中窗口中的图片，避免多段楼层同时水合造成重复计算和卡顿。

画廊首次打开必须进入初始缓存会话，先显示“正在缓存当前图片...”，并按 `0 / 300 / 1200 / 3000 / 6000 / 9000ms` 自动重扫选中的楼层窗口与近期跨楼层来源。初始缓存结束前不应过早显示“没有图片”。

历史懒加载每次最多接入 3 个有图楼层。若本批扫描没有发现图片但还没有扫完整个 chat，画廊必须显示“这批历史楼层没有找到图片，可以继续往前查找。”，并保留继续加载入口；只有 cursor 扫到底后才显示本次 chat 已无更多历史图片。

近期跨楼层扫描分两种模式：

- `explicit-message-ids`：生成响应、host-data reconcile、placeholder reconcile 已知目标楼层时，只扫这些楼层。用于非 latest 楼层重新生成后的稳定归档。
- `recent-cross-floor`：UI 启动或手动刷新时扫描最近一批 assistant 楼层。用于 UI 关闭后插件才完成图片、再次打开 UI 时找回。

画廊不应依赖正文当前已经水合成功。正文水合失败时，只要 `extra / mes_tag / cache` 足够让 entity ready，画廊仍应拿到图。

画廊链路的日志 scope：

- `galleryGroups / recompute`
- `galleryNativeRecentScan / probe`
- `galleryNativeRecentScan / discovered`
- `galleryHistoryScan / load_older_probe`
- `imageSourceResolver / build_refs`
- `imageBridge / host-data-reconcile-probe`
- `imageBridge / host-data-reconcile-hit`

重点字段：

- `mode`
- `messageIds`
- `containerId`
- `candidateCount`
- `knownCurrentCount`
- `sampled[].messageId`
- `sampled[].imageCount`
- `sampled[].knownCurrent`
- `discovered`
- `historicalGroupCount`
- `groupCount`
- `imageCount`
- `groups[].messageId`
- `groups[].imageCount`

## 生图后的标准衔接

完整链路应长这样：

1. UI 在某楼层触发图片生成。
2. `beginPendingImageTask()` 记录目标 messageId 和 prompt/window intent。
3. st-chatu8 插入 `image###...###` 或按钮/placeholder。
4. `syncPendingRequestHintsFromDom()` 把 requestId 绑定回目标 messageId。
5. `generate-image-request` 到达，`imageGenerationEventBridge / on_request` 记录 requestId、messageId、pending 状态。
6. `generate-image-response` 成功，`imageGenerationEventBridge / on_response_success` 记录 targetMessageIds。
7. 同步触发：
   - `syncTranscriptItemsFromHostData('host.plugin_native_response_success')`
   - `queueGeneratedImageEntityRefresh()`
   - `discoverRecentNativeGalleryImages('host.plugin_native_response_success:immediate', targetMessageIds)`
   - `scheduleHostImageDataReconcile()`
   - `schedulePluginNativePromptPlaceholderReconcile()`
8. 延迟 reconcile 再次读取 host/chat/cache，补偿插件保存异步写入。
9. `buildGeneratedImageRefsForMessage()` 生成 ready refs。
10. 正文通过 hydration 补图，画廊通过 current/recent/history groups 显示。

## 测试排查顺序

测试时建议按下面顺序搜控制台日志：

1. 搜 `imageGenerationEventBridge`。
   - 有 `on_request` 但没有 `on_response_success`：插件生图任务未完成或失败。
   - `on_response_success.targetMessageIds` 为空：requestId 没绑定回楼层，查 `syncPendingRequestHintsFromDom` 和 DOM message index。

2. 搜 `host-data-reconcile-probe`。
   - 有 probe 且 `changedMessageIds` 为空：响应成功当刻 chat/extra/cache 可能还没写入，继续看后续 delay。
   - 始终没有目标 messageId：生图事件桥没有拿到正确楼层。

3. 搜 `galleryNativeRecentScan`。
   - `mode=explicit-message-ids` 且 `sampled[].imageCount=0`：指定楼层还没有被 `buildGeneratedImageRefsForMessage()` 读成 ready。
   - `mode=recent-cross-floor` 没扫到目标楼层：目标楼层可能在容器之前、不是 assistant、或超过近期扫描窗口。
   - `discovered>0` 但 UI 不显示：查 `mergedGalleryGroups` / gallery panel 渲染。

4. 搜 `imageSourceResolver`。
   - `promptTokenCount>0` 但 `mesTagEntryCount=0`：tag 解析规则没认出正文里的 image tag。
   - `extraRecordCount>0` 但 `readyEntityCount=0`：extra 结构字段不符合 artifact 读取规则。
   - `cacheEntryCount>0` 但 `readyEntityCount=0`：cache 没能通过 prompt/request/imageId 和 membership 对齐。
   - `readyEntityCount>0` 但 `refCount=0`：ref 构建或去重层有问题。

5. 搜 `inlineImageHydration`。
   - `pluginNativeCount>0` 但 `dedupedInjectCount=0` 可能是插件原生 DOM 已保留，正文不重复注入。
   - `compatibilityCount>0` 且 `dedupedInjectCount>0` 说明走了兼容注入。
   - `renderMode=plugin-native-data` 时正文不应把 unanchored 图直接追加尾部。

## 失败样例判断

非 latest 楼层重新生成，图片加到末尾，没有进入正文：

- 如果 `imageSourceResolver.readyEntityCount>0` 且 `inlineImageHydration.dedupedInjectCount=0`，说明 entity 已 ready，但正文路径认为插件原生 DOM 已接管或已有图，查 placeholder hydration。
- 如果 `galleryNativeRecentScan.discovered>0`，画廊应显示；不显示则查 gallery merge/render。
- 如果 `galleryNativeRecentScan.sampled[].imageCount=0`，说明画廊取图源头没读到 ready 图，查 extra/mes_tag/cache 计数。

LLM 生成 6 张，但只有 1 张进入生图链：

- 查 `imageGenerationHandoff` progress：`requestCount` 应追上 `promptButtonCount` 或 `promptPlaceholderCount`。
- 查 `imageGenerationEventBridge.on_request` 数量是否为 6。
- 如果 request 为 6、response 为 6，但 gallery 为 1，问题在 response 后归档，不在触发链。

UI 关闭后酒馆 chat 把图生出来，UI 再打开拿不到：

- 查 `mounted.native_recent_gallery_scan` 对应的 `galleryNativeRecentScan / probe`。
- 如果没有扫到目标楼层，检查 recent scan 范围、assistant 判断、容器楼层过滤。
- 如果扫到但 imageCount 为 0，检查 st-chatu8 是否把图写入 `extra.images`、`swipe_info[swipe_id].images` 或 `chatMetadata['st-chatu8']`。

## 维护约束

- 新增图片读取路径时，必须先进 NativeFirst artifact，再进入 entity/ref，不能让正文或画廊单独读取一套私有结构。
- 新增兜底时必须写清优先级，避免 cache 把别的楼层图片串进当前楼层。
- 新增日志时必须包含 `messageId`、`reason`、计数和 0 命中结果。
- 画廊扫描当前可见楼层之外的图片是正式能力，不能因为“不是当前 transcript”而删掉。

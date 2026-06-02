# 同层 UI 画廊机制说明 v1.0.0

本文描述寒冬末日同层 UI 的图片画廊机制。重点不是生图提示词怎么生成，而是“图片已经存在或正在生成时，画廊如何按楼层拿到图、显示图、避免重复计算，并和正文图片显示保持同一套数据来源”。

适用代码范围：

- `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- `src/寒冬末日/界面同层版/界面/状态栏/components/ImageGalleryPanel.vue`
- `src/寒冬末日/界面同层版/界面/状态栏/components/GeneratedImageAsset.vue`
- `src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue`
- `src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue`

## 总目标

画廊目标是：只要当前 chat 里某个 assistant 楼层已经有成品图片，画廊就应该能按 messageId 找到、归档并显示这张图。

它必须同时满足几件事：

- 当前正文窗口里的图片要优先稳定显示。
- 非当前正文窗口的历史楼层图片也能被取到。
- UI 关闭期间由 st-chatu8 完成的图片，重新打开 UI 后能被近期扫描找回。
- 画廊和正文不能各自猜图，必须共享同一个图片实体入口。
- 不能因为多段楼层同时扫描、水合而造成卡顿。
- 不能把某楼层的图片错误归到 latest 或当前楼层。

## 核心原则

画廊不是独立图库，不保存自己的图片二进制，也不维护一套私有 manifest。

当前机制的核心原则是：

- 图片事实源来自 SillyTavern chat 数据、st-chatu8 原生 DOM、消息正文 tag、插件 cache。
- 统一入口是 `buildGeneratedImageRefsForMessage()`。
- 正文和画廊都消费 `GeneratedImageRef`。
- 画廊只做分组、筛选、展示、触发动作，不重新发明图片归属规则。
- 跨当前楼层取图是正式设计，不是兜底。

## 数据模型

### `GeneratedImageRef`

画廊最终展示的是 `GeneratedImageRef`。

关键字段：

- `id`：图片条目 id。
- `messageId`：图片归属楼层。
- `src`：可显示图片源。
- `promptToken`：st-chatu8 prompt/token 线索。
- `requestId`：生图请求 id，若能拿到则用于响应归属。
- `characterName`：从提示词或元数据推断出的角色名。
- `title`：图片标题或提示词标题。
- `anchorText`：图片附近正文锚点。
- `createdOrder`：同楼层内排序依据。

### `GalleryGroup`

`useStreamingDemo.ts` 内部使用轻量分组：

```ts
type GalleryGroup = { messageId: number; images: GeneratedImageRef[] };
```

画廊不是先建全局列表再猜楼层，而是先按 messageId 形成 group，再 flatten 成展示条目。

### 当前分组与历史分组

画廊分两层保存：

- `galleryGroups`：从当前 `transcript.value` 可见楼层即时计算出来。
- `historicalGalleryGroups`：当前 transcript 不可见，但已经被扫描发现的历史/近期楼层图片。

最终展示源：

```ts
mergedGalleryGroups = mergeGalleryGroupsForEntries(galleryGroups, historicalGalleryGroups)
galleryEntries = flattenGalleryGroupsForEntries(mergedGalleryGroups)
```

合并规则是：当前可见楼层优先；历史池只补充当前没有的 messageId。

## 图片读取入口

### `buildGeneratedImageRefsForMessage()`

这是正文和画廊共享的统一入口。

输入：

- `messageId`
- `rawMessage`
- 可选 `createdOrderBase`
- 可选 `hostDomArtifacts`

输出：

- 当前 messageId 下所有 ready 的 `GeneratedImageRef[]`

内部主要步骤：

1. 从正文中收集 st-chatu8 prompt token。
2. 从 host DOM 收集已渲染图片、按钮、span、container。
3. 从 `extra.images` 或 `swipe_info[swipe_id].images` 读取插件保存图片。
4. 从消息正文 `image###...###` / native tag 读取 mes tag。
5. 从 `chatMetadata['st-chatu8']` 读取 cache。
6. 用 `buildGeneratedImageMembership()` 建立 token/request/image 与楼层的归属关系。
7. 用 `buildGeneratedImageEntities()` 合并 NativeFirst 图片实体。
8. 用 `filterReadyGeneratedImageEntities()` 过滤掉 placeholder-only 实体。
9. 转成 `GeneratedImageRef`。

如果 entity 层没有 ready 图，但 host DOM 已经有 message-scoped 图片，会走 host DOM fallback。这是为了兼容插件 DOM 已经渲染但数据层尚未写回的短时状态。

### NativeFirst 来源优先级

画廊遵循 NativeFirst artifact 优先级：

1. `host_dom`：SillyTavern DOM 上 st-chatu8 已渲染的按钮、span、container、img。
2. `extra`：`chat[messageId].extra.images` 或当前 swipe 的 `swipe_info[swipe_id].images`。
3. `mes_tag`：消息正文中的 `image###...###` 或插件 native image tag。
4. `cache`：`chatMetadata['st-chatu8']` 图片缓存。

`cache` 只能作为补齐和兜底，不能无条件把别的楼层图片塞到当前楼层。

## MessageId 级 refs 缓存

画廊一旦通过 `buildGeneratedImageRefsForMessage()` 成功拿到某楼层的 refs，会把结果写入 messageId 级缓存：

```ts
galleryGeneratedImageRefCache: Map<number, GalleryGeneratedImageRefCacheEntry>
```

缓存目的：

- 避免打开画廊、初始缓存 timer、近期扫描、历史扫描反复对同一楼层跑 NativeFirst/entity/membership 构建。
- 已经拿到图的楼层，在来源签名没有变化时直接复用 `GeneratedImageRef[]`。
- 空结果也短暂缓存，避免同一轮打开画廊时对无图楼层连续重复计算。

缓存签名由以下信息组成：

- `messageId`
- message-scoped image entity revision
- `createdOrderBase`
- raw message 摘要
- prompt token 摘要
- host DOM artifact 摘要
- `extra.images` / `swipe_info` 摘要
- st-chatu8 cache 摘要
- mes tag 摘要

缓存策略：

- 有图结果：只要签名不变就复用。
- 空结果：最多保留 `GALLERY_REF_EMPTY_CACHE_TTL_MS = 1500ms`，防止插件异步写入后仍被旧空结果挡住。
- 总容量：最多 `GALLERY_REF_CACHE_MAX_ENTRIES = 160` 个 messageId，超过后按插入顺序淘汰旧项。
- 命中时写 `imageSourceResolver / build_refs`，`variant='cache-hit'`。

失效策略：

- `queueGeneratedImageEntityRefresh(messageIds)` 会先清掉这些 messageId 的 refs 缓存。
- recent intent fallback messageId 也会被清掉。
- 全量图片刷新会清空整个 refs 缓存。
- raw message、host DOM、extra、cache、mes tag 或 image entity revision 变化时，签名不一致，旧缓存自动作废。

这个缓存不改变图片归属规则，也不绕过 NativeFirst。它只是复用同一楼层、同一来源签名下已经构建好的 `GeneratedImageRef[]`。

## 画廊 UI 入口

画廊由 `StoryPage.vue` 右侧抽屉承载。

打开入口：

```ts
startGalleryImageCacheSession('gallery.drawer_open');
galleryDrawerOpen.value = true;
```

`ImageGalleryPanel` 是 lazy mount：

```vue
<ImageGalleryPanel v-if="galleryDrawerOpen" ... />
```

这样画廊关闭时不会持续挂载图片卡片、分组计算和滚动监听，降低常驻成本。

## 楼层范围选择

画廊楼层选择使用正文同款窗口数据：

```ts
galleryWindowOptions = transcriptWindowPages
```

UI 是单选下拉，不再是多选 checkbox。

当前状态：

```ts
selectedGalleryWindowKey: Ref<string>
selectedGalleryWindowOption: Computed<TranscriptWindowPageOption | null>
selectedGalleryWindowMessageIds: Computed<number[]>
```

默认选择规则：

1. 优先选择当前正文窗口。
2. 如果当前窗口不可解析，回退到 latest 窗口。
3. 如果窗口列表变化，当前 key 会被 normalize；无效时清空，下一次 scan 再补默认值。

单选设计的原因：

- 多选会把多个窗口的 messageIds 合并，导致一次扫描涉及太多楼层。
- 初始缓存 timer 会多轮执行，多选会放大重复扫描成本。
- host-native hydration 会临时 unhide 宿主楼层，多选会造成大量宿主刷新和卡顿。
- 单选更接近正文 UI 的楼层模型，便于测试定位。

## 展示范围

画廊面板实际收到的是：

```ts
galleryVisibleEntries
```

它来自：

```ts
galleryEntries.filter(entry => selectedMessageIds.has(entry.messageId))
```

也就是说：

- `galleryEntries` 可以包含当前页、近期跨楼层、历史懒加载发现的所有图。
- `galleryVisibleEntries` 只展示当前单选窗口内的图。
- 角色立绘匹配等内部能力仍可使用完整 `galleryEntries`，不被画廊抽屉当前筛选饿死。

## 首次打开缓存会话

打开画廊后会进入初始缓存会话：

```ts
startGalleryImageCacheSession('gallery.drawer_open')
```

核心行为：

- 设置 `loadingInitialGalleryImages = true`。
- 先确保默认楼层窗口。
- 按固定延迟多次 probe：
  - `0ms`
  - `300ms`
  - `1200ms`
  - `3000ms`
  - `6000ms`
  - `9000ms`
- 每轮会 `scheduleUiRefresh(['gallery'])`。
- 每轮会 `scanSelectedGalleryWindow()`。
- 最后一轮后设置 `loadingInitialGalleryImages = false`。

UI 表现：

- 初始缓存期间显示“正在缓存当前图片...”。
- 初始缓存结束前不应过早显示“当前还没有可展示的楼层图片。”。

这个机制用于承接 st-chatu8 的异步写回：图片可能已经开始生成，但 `extra`、`cache`、host DOM 或正文 tag 不是同一时刻 ready。

## 单窗口扫描

当前扫描入口：

```ts
scanSelectedGalleryWindow(reason = 'gallery.window_selection')
```

步骤：

1. `ensureDefaultGalleryWindowSelection()` 确保有选中窗口。
2. 用 `selectedGalleryWindowMessageIds` 做显式楼层扫描。
3. 调 `discoverRecentNativeGalleryImages(reason, selectedGalleryWindowMessageIds.value)`。
4. 调 `maybeHydrateSelectedGalleryWindowMessages(reason, selectedGalleryWindowMessageIds.value)`。
5. 写 `galleryWindowSelection / scan` 日志。

日志字段：

- `reason`
- `selectedWindowKey`
- `selectedMessageIds`
- `visibleEntryCount`
- `knownEntryCount`

## Host-native hydration

有些历史楼层图片必须让 st-chatu8 在宿主 DOM 中短暂 materialize，才能补齐插件原生结构。这个动作由：

```ts
hydrateSelectedGalleryWindowMessages(reason, messageIds)
```

处理。

它会：

1. 只保留真实存在于 host chat meta 里的 messageId。
2. 按 `GALLERY_WINDOW_NATIVE_HYDRATION_CHUNK_SIZE = 4` 分块。
3. 对 chunk 申请 `hostVisualHideController.leaseMessageIdsForPluginNativeHandoff()`。
4. 对隐藏楼层临时 `setChatMessages(..., { refresh: 'affected' })`。
5. `syncPendingRequestHintsFromDom()`。
6. 扫一次 `discoverRecentNativeGalleryImages(...:native_host_hydration, chunkIds)`。
7. 等 `240ms` 后再扫一次。
8. `queueGeneratedImageEntityRefresh(chunkIds)`。
9. `schedulePluginNativePromptPlaceholderReconcile()`。
10. 把临时 unhide 的楼层恢复为 hidden，使用 `{ refresh: 'none' }`。
11. 释放 lease，恢复 hide policy。

### Hydration 去重

为了避免初始缓存多轮 timer 反复打同一段宿主楼层，外层使用：

```ts
maybeHydrateSelectedGalleryWindowMessages(reason, messageIds)
```

它会生成签名：

```ts
`${selectedGalleryWindowKey.value}:${hydrationIds.join(',')}`
```

如果和上一次相同，则跳过 hydration。

因此同一选中窗口内：

- 第一次打开会尝试 hydration。
- 后续初始缓存 probe 仍会轻量扫描，但不会重复 unhide/handoff。
- 切换到另一个窗口后，会产生新的签名并允许新一轮 hydration。

## 近期跨楼层扫描

入口：

```ts
discoverRecentNativeGalleryImages(reason, messageIds = [])
```

它有两种模式：

### `explicit-message-ids`

当传入 `messageIds` 时，只扫描指定楼层。

常见触发场景：

- 画廊当前单选窗口扫描。
- 生图响应成功后已知 target messageIds。
- host-data reconcile 延迟补偿。
- placeholder reconcile 已知目标楼层。

用途：

- 非 latest 楼层重新生成图片时，不把图错误塞到末尾。
- 只针对目标楼层补图，降低扫描范围。

### `recent-cross-floor`

当不传 `messageIds` 时，扫描最近一批 assistant 楼层。

当前窗口外的近期扫描上限：

```ts
GALLERY_RECENT_NATIVE_SCAN_BATCH_SIZE = 48
```

常见触发场景：

- UI mounted 后 `mounted.native_recent_gallery_scan`。
- 手动或生命周期触发的近期图片恢复。

用途：

- UI 关闭期间 st-chatu8 后台完成图片，重新打开 UI 后把图找回。
- 当前 transcript 没显示该楼层，但 chat 数据已经有图。

### 扫描过滤

候选楼层会经过：

- messageId 必须有效。
- 若有 active container，则必须在 container 之后。
- explicit 模式下必须属于传入 ids。
- 必须是 assistant 楼层。
- recent 模式下只取最近一批。

### 当前页图片保留

插件 DOM 有时会短暂 rerender，导致 `galleryGroups` 一会儿有图、一会儿为空。

为避免画廊刚拿到当前页图片又被清空，`discoverRecentNativeGalleryImages()` 会把已知当前组保留进 `historicalGalleryGroups`：

- `knownCurrentIds` 记录当前 computed groups。
- `currentGroupsById` 保存当前 group。
- 如果 candidate 是 known current 且有图片，就写入 `historicalById`。
- `retainedCurrent` 计数会写进日志。

这让“当前页图已经出现过一次”后，不容易因为插件短时 DOM 波动而在画廊里消失。

## 历史懒加载

入口：

```ts
loadOlderGalleryImages()
```

用途：

- 从当前可见窗口之前继续往旧楼层查。
- 避免一次性扫完整个 chat。

扫描参数：

```ts
GALLERY_HISTORY_SCAN_BATCH_SIZE = 24
GALLERY_HISTORY_MAX_GROUPS_PER_LOAD = 3
```

也就是说：

- 每次最多向前检查 24 个楼层。
- 每次最多接入 3 个有图楼层。
- 如果这 24 个楼层没有图，但还没扫到底，会提示用户继续往前查找。

状态：

- `galleryHistoryCursor`：下次从哪个 messageId 往前扫。
- `galleryHistoryExhausted`：是否已经扫完整个 chat。
- `loadingOlderGalleryImages`：历史扫描中。
- `galleryOlderLastScanHadNoImages`：本批扫描 0 命中。

UI 行为：

- 有更多历史时显示继续加载入口。
- 本批 0 命中但未扫到底时显示“这批历史楼层没有找到图片，可以继续往前查找。”。
- 扫到底后显示“已加载当前可用图片”。

## 与正文图片显示的关系

正文图片和画廊共享同一个图片读取入口，但职责不同。

正文职责：

- 把图片放回对应正文位置。
- 保留 st-chatu8 原生按钮/placeholder。
- 尽量通过 prompt token 或 anchorText 锚定。
- 不能随意把 plugin-native-data 的 unanchored 图追加到尾部。

画廊职责：

- 按 messageId 分组。
- 只展示当前选中楼层窗口。
- 支持跨当前楼层取图。
- 不要求正文已经水合成功。

共同点：

- 都依赖 `buildGeneratedImageRefsForMessage()`。
- 都走 NativeFirst entity/ref。
- 都依赖 `queueGeneratedImageEntityRefresh()` 驱动更新。

## 生图响应后的归档链路

当 UI 或画廊触发重新生成图片时，完整链路应为：

1. UI 调用图片动作。
2. `beginPendingImageTask(messageId, source)` 记录目标楼层和来源。
3. st-chatu8 插入按钮、placeholder 或 image tag。
4. `syncPendingRequestHintsFromDom()` 尝试把 requestId 绑定回 messageId。
5. `imageGenerationEventBridge / on_request` 记录 request。
6. st-chatu8 完成生成并发出 response。
7. `imageGenerationEventBridge / on_response_success` 消费 response。
8. 从 pending task 和 recent intent 解析 `targetMessageIds`。
9. `syncTranscriptItemsFromHostData('host.plugin_native_response_success', targetMessageIds)`。
10. `queueGeneratedImageEntityRefresh(targetMessageIds, 'host.plugin_native_response_success')`。
11. `discoverRecentNativeGalleryImages('host.plugin_native_response_success:immediate', targetMessageIds)`。
12. `scheduleHostImageDataReconcile('host.plugin_native_response_success', targetMessageIds)`。
13. `schedulePluginNativePromptPlaceholderReconcile('host.plugin_native_response_success', targetMessageIds)`。
14. 延迟 reconcile 继续补读 host/chat/cache。
15. 正文和画廊各自从最新 refs 刷新。

关键要求：

- target messageId 不能丢。
- 非 latest 楼层不能默认归到最后一楼。
- response 成功后要同时触发正文和画廊 refresh。

## 画廊图片操作

画廊中的每张图由 `GeneratedImageAsset.vue` 渲染。

支持动作：

- 查看图片。
- 重新生成图片。
- 打标签或打开插件原生动作。
- 指派为角色立绘。

动作 payload 通过：

```ts
GeneratedImageActivationPayload
```

携带：

- `messageId`
- `promptToken`
- `requestId`
- `src`
- `source`

其中 `source` 可以是：

- `transcript`
- `gallery`

这能让重新生成时保留“动作来自画廊”的 recent intent，避免响应归属丢失。

## 角色立绘与画廊

角色立绘系统可以读取完整的 `galleryEntries`，而不是只读当前抽屉筛选后的 `galleryVisibleEntries`。

原因：

- 用户当前画廊只看某个楼层窗口，不代表其他楼层图片不存在。
- 立绘自动匹配需要全 chat 已知图片。
- 画廊抽屉 UI 的筛选不应影响角色立绘匹配。

因此：

- 右侧画廊抽屉展示用 `galleryVisibleEntries`。
- transcript 图片计数和角色立绘等全局能力可继续使用 `galleryEntries`。

## 性能边界

当前机制的性能控制点：

- 画廊关闭时 `ImageGalleryPanel` 不挂载。
- 当前抽屉只展示单选窗口内的 `galleryVisibleEntries`。
- 历史加载每次最多接入 3 个有图楼层。
- 近期跨楼层扫描有批量上限。
- host-native hydration 按 4 个 messageId 分块。
- 同一窗口 hydration 有签名去重。
- 同一楼层图片 refs 有 messageId 级缓存；有图结果按签名复用，空结果短 TTL。
- `galleryRevision` 独立于 transcript DOM revision，避免正文 DOM 变化直接重算整个画廊。
- `GeneratedImageAsset` 只监听自己 message-scoped 的 entity revision。

避免重新引入的高风险设计：

- 多选多个窗口同时 hydration。
- 每次打开画廊全量扫描完整 chat。
- 每个角色立绘匹配都重新 sort/filter 全画廊。
- gallery panel 常驻挂载。
- 为画廊单独保存图片二进制缓存。

## 关键日志

### `galleryWindowSelection / scan`

用途：确认当前画廊选了哪个楼层窗口。

重点字段：

- `reason`
- `selectedWindowKey`
- `selectedMessageIds`
- `visibleEntryCount`
- `knownEntryCount`

异常判断：

- `selectedWindowKey` 为空：默认窗口解析失败。
- `selectedMessageIds` 过多：窗口配置异常。
- `knownEntryCount > 0` 但 `visibleEntryCount = 0`：图存在，但不属于当前选中窗口。

### `galleryInitialCache / probe`

用途：确认首次打开缓存会话是否按时重扫。

重点字段：

- `delayMs`
- `entryCount`
- `knownEntryCount`
- `groupCount`

异常判断：

- 初始缓存期间 entry 从 0 变非 0 是正常现象。
- 最后一轮仍为 0，才倾向判定当前窗口没有 ready 图。

### `galleryWindowNativeHydration / start`

用途：确认是否进入宿主原生水合。

重点字段：

- `sessionId`
- `messageIds`

异常判断：

- 同一个 selected window 多次连续 start：签名去重可能失效。
- messageIds 为空：host meta 未找到这些楼层。

### `galleryWindowNativeHydration / chunk`

用途：确认分块水合结果。

重点字段：

- `chunkIds`
- `hiddenChunkIds`
- `visibleEntryCount`
- `knownEntryCount`

异常判断：

- `hiddenChunkIds` 很多且频繁出现：水合成本高。
- 水合后 `knownEntryCount` 不变：宿主 DOM materialize 没提供新图。

### `galleryNativeRecentScan / probe`

用途：确认近期或显式楼层扫描是否扫到候选。

重点字段：

- `mode`
- `messageIds`
- `containerId`
- `candidateCount`
- `knownCurrentCount`
- `discovered`
- `retainedCurrent`
- `sampled[].messageId`
- `sampled[].imageCount`
- `sampled[].knownCurrent`

异常判断：

- explicit 模式下 `candidateCount=0`：目标楼层不在可读 chat 范围、不是 assistant，或被 container 过滤。
- `sampled[].imageCount=0`：该楼层没有被统一入口读成 ready 图。
- `retainedCurrent>0`：当前页图被保留，这是正常保护。

### `galleryNativeRecentScan / discovered`

用途：确认扫描结果已写入 historical pool。

重点字段：

- `discovered`
- `retainedCurrent`
- `historicalGroupCount`

异常判断：

- `discovered>0` 但 UI 不显示：看当前 selected window 是否包含这些 messageId。

### `galleryHistoryScan / load_older_probe`

用途：确认历史懒加载进度。

重点字段：

- `scanned`
- `nextCursor`
- `discoveredGroupCount`
- `discoveredImageCount`
- `discoveredMessageIds`
- `exhausted`
- `olderZeroHit`

异常判断：

- `olderZeroHit=true` 且 `exhausted=false`：本批没图，但还可以继续向前查。
- `discoveredGroupCount>0` 但当前 UI 不显示：这些图可能不属于当前单选窗口。

### `imageSourceResolver / build_refs`

用途：确认统一入口是否读到了 ready refs。

重点字段：

- `messageId`
- `variant`
- `promptTokenCount`
- `hostDomInputCount`
- `extraRecordCount`
- `mesTagEntryCount`
- `cacheEntryCount`
- `hostDomCount`
- `extraCount`
- `mesTagCount`
- `cacheCount`
- `nativeRenderableCount`
- `membershipCount`
- `entityCount`
- `readyEntityCount`
- `refCount`

异常判断：

- `extraRecordCount>0` 但 `readyEntityCount=0`：extra 结构没有被 entity 层识别。
- `mesTagEntryCount>0` 但 `readyEntityCount=0`：tag 解析或 membership 配对失败。
- `readyEntityCount>0` 但 `refCount=0`：ref 构建或去重失败。

### `inlineImageHydration / append_artifacts`

用途：确认正文图片显示链路是否拿到了同一批图。

重点字段：

- `messageId`
- `hostDomCount`
- `extraCount`
- `mesTagCount`
- `cacheCount`
- `nativeFirstCount`
- `pluginNativeCount`
- `compatibilityCount`
- `dedupedInjectCount`
- `renderMode`

异常判断：

- 画廊有图但正文没有图：看 `renderMode` 和 `dedupedInjectCount`。
- `pluginNativeCount>0` 但 `dedupedInjectCount=0` 可能是正文保留了插件原生 DOM，不重复注入。

## 常见问题排查

### 第一次打开画廊显示正在缓存，第二次才有图

先看：

- `galleryInitialCache / probe`
- `galleryNativeRecentScan / probe`
- `imageSourceResolver / build_refs`

判断：

- 如果第一轮 `0ms` 没图，后续 `300ms` 或 `1200ms` 有图，说明插件数据写回晚，是正常异步。
- 如果最终 `9000ms` 有图但 UI 仍显示空，查 `selectedWindowKey` 和 `galleryVisibleEntries`。

### 当前页图片出现后又消失

先看：

- `galleryNativeRecentScan / discovered`
- `retainedCurrent`
- `historicalGroupCount`

判断：

- 如果 `retainedCurrent>0`，说明保留机制工作中。
- 如果保留后仍消失，检查 `historicalGalleryGroups` 是否被 transcript watcher 过滤掉。

### 非 latest 楼层重新生成后图片进了末尾

先看：

- `imageGenerationEventBridge / on_response_success`
- `targetMessageIds`
- `galleryNativeRecentScan mode=explicit-message-ids`

判断：

- `targetMessageIds` 是目标楼层：归属链路正确，继续查正文锚定。
- `targetMessageIds` 为空或是 latest：requestId/messageId 绑定失败。

### 画廊看不到历史图

先看：

- 当前 `selectedWindowKey`
- `galleryEntries` 是否有图
- `galleryVisibleEntries` 是否被当前窗口过滤掉
- `galleryHistoryScan / load_older_probe`

判断：

- 如果 `galleryEntries` 有历史图但 `galleryVisibleEntries` 没有，说明当前单选窗口不包含那些楼层。
- 如果 `load_older_probe.discoveredGroupCount=0` 且 `olderZeroHit=true`，继续向前加载即可。
- 如果一直 0，查 `imageSourceResolver` 的各来源计数。

### 多张图只有一张进入链路

先看：

- `imageGenerationHandoff` progress
- `imageGenerationEventBridge / on_request`
- `imageGenerationEventBridge / on_response_success`
- `imageSourceResolver.readyEntityCount`

判断：

- request 数不足：触发链没把所有 prompt/button 交给 st-chatu8。
- response 数足但 ready refs 少：归档/读取链路问题。
- ready refs 足但 UI 少：画廊筛选或图片组件渲染问题。

## 维护约束

后续修改画廊时必须遵守：

- 不新增画廊私有图片读取入口。
- 不新增画廊私有图片二进制缓存。
- 不把 cache 图片无条件归到当前楼层。
- 不把非 latest 响应默认归到 latest。
- 不恢复多窗口同时水合。
- 不让画廊抽屉关闭时仍挂载重组件。
- 新增日志必须包含 `reason`、`messageId/messageIds`、命中计数和 0 命中信息。
- 新增历史扫描策略必须保留 cursor 和批量上限。
- 新增正文图片兜底时，必须确认画廊仍从同一 entity/ref 入口拿图。

## 推荐测试点

手测时建议按以下顺序：

1. 打开当前 latest 窗口，确认首次显示“正在缓存当前图片...”，随后自动出现当前窗口图片。
2. 切换画廊楼层下拉到历史窗口，确认只扫描该窗口。
3. 点击“继续加载历史图片”，确认每次最多新增 3 个有图楼层。
4. 在非 latest 楼层重新生成图片，确认 response 的 `targetMessageIds` 是原楼层。
5. 关闭 UI，让 st-chatu8 在宿主 chat 中完成图片，再重新打开 UI，确认 recent scan 能找回。
6. 对同一窗口反复打开画廊，确认不会连续出现大量相同 `galleryWindowNativeHydration / start`。

## 相关文档

- `docs/同层UI图片读取与画廊正文统一规范-v1.0.0.md`
- `docs/当前生图业务实现-v1.0.0.md`
- `docs/st-chatu8里的生图业务-v1.0.0.md`
- `docs/插件混淆还原/st-chatu8-v2.6.1-同层图片链路转译/same-layer-image-flow.md`

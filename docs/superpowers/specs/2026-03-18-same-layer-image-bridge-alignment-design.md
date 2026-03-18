# 同层版图片桥接对齐原插件设计

**目标**

将 `src/寒冬末日/界面同层版` 的图片画廊与正文生图链路收敛为“`st-chatu8` 原插件主导，同层版只做桥接、单次持久化、只读展示”，移除当前由 DOM 观察、全量消息回写和多源自触发形成的回环，降低大图 base64 在前端反复扫描、克隆、比较时造成的内存峰值与后台崩溃风险。

**问题摘要**

- 当前实现同时依赖官方图片事件、DOM 观察、聊天消息全量回写、缓存 sanitize、图廊重建等多条链路。
- `useStreamingDemo.ts` 中的 `persistDisplayedImagePrompts`、`bindDisplayedImagePromptObserver`、`sanitizePluginImageExtrasInCurrentChat`、`sanitizePluginImageCacheMeta` 会在图片变化后反复触发重新读取与重新写回。
- 图片数据包含 base64，现有逻辑频繁执行全量 `JSON.stringify` 比较、深拷贝和全聊天扫描，容易放大为高内存占用。
- 用户要求与 `st-chatu8` 原版动作对齐：
  - 双击正文：触发原生生图入口
  - 单击已有图片：打开同提示词更多图片查看器
  - 双击已有图片：沿原链路重新生成

**参考约束**

- `docs/前端接入插件的说明.txt` 明确要求：
  - UI 只做代理，不替代插件
  - 图廊只是收集器
  - 优先把动作路由回原楼层原节点
  - 同层版负责桥接和展示，`st-chatu8` 负责实际生成和原生图片交互逻辑

## 现状根因

### 1. 事件与 DOM 双轨并行，形成重复来源

当前图片数据既通过 `generate-image-request / generate-image-response` 进入，也通过 DOM 反扫 `st-chatu8-image-button / st-chatu8-image-span` 和插件 cache 被重新采样。

结果是：同一张图可能在“官方响应落库”和“DOM 观察后回写”两个方向都被处理一次。

### 2. UI 在反向改写聊天消息，形成自触发回环

当前逻辑会在检测到图片 DOM 变化后重新：

1. 提取 prompt token 与图片列表
2. 改写 assistant 原始消息文本
3. 改写 `data.stream_demo.generated_images`
4. 改写 `extra.images` 与 `extra.lockedTags`
5. `rebuildTranscript()`

这会导致图片的“展示副产物”再次反过来驱动“数据源改写”，偏离“插件原逻辑是真相”的边界。

### 3. 全量比较与深拷贝对 base64 大图不友好

当前多处逻辑会对整条消息甚至整段聊天的图片数据进行深拷贝和 `JSON.stringify` 比较。在图片是 base64 时，这种做法极易导致：

- 内存复制量巨大
- GC 频率升高
- 页面响应卡顿
- 进程 reaching heap limit

## 目标设计

### 1. 责任边界

同层版保留以下责任：

- 将正文和图廊上的用户动作转发到宿主原楼层对应节点
- 监听官方图片请求/响应事件，并把“成功返回的新图”单次持久化到对应消息
- 从消息持久化数据和插件已有 cache 中只读构建正文插图与图廊展示

同层版移除以下责任：

- 基于 DOM 变化对 assistant 消息做全量反写
- 根据展示结果回补 prompt token 文本
- 在 mounted 或后续刷新过程中批量 sanitize 全聊天图片数据后再次写回
- 把图廊当成图片真源或交互真源

### 2. 数据真相与读取顺序

单条消息的图片展示优先级：

1. `data.stream_demo.generated_images`
2. 当前消息 `extra.images` 中对应 `swipe_id` 的条目
3. `st-chatu8` cache 中该消息可读到的条目，仅作为只读兜底

正文和图廊都只按这个读取顺序消费数据，不再把 DOM 提取结果回写到消息。

### 3. 持久化策略

只在官方 `generate-image-response` 且成功携带图片数据时，对对应 `messageId` 做一次局部写入：

- 向 `data.stream_demo.generated_images` 追加最小条目：
  - `src`
  - `alt`
  - `promptToken`
  - `requestId`
- 向当前消息 `extra.images[swipe_id]` 追加兼容条目，确保插件已有读取路径和正文/图廊都能使用

写入要求：

- 仅修改单条消息
- 以 `requestId` 优先去重，必要时用 `src` 兜底
- 不扫描整段聊天
- 不对整批 base64 数组做字符串化比较

### 4. 交互映射

#### 正文区双击

继续通过桥接逻辑定位宿主原楼层的原生触发节点，并转发双击事件。该动作视为“原插件对这条正文再次发起生图”。

#### 已生成图片单击

只转发单击到宿主原图节点，让原插件打开“同提示词更多图片查看器”。同层版不自行解释查看器逻辑。

#### 已生成图片双击

只转发双击到宿主原图节点或其对应按钮节点，让原插件沿原语义执行重新生成。

#### 图廊图片单击/双击

图廊沿用与正文图片完全一致的语义：

- 单击：更多图查看器
- 双击：重新生成

如果无法可靠映射回宿主原节点，则只展示图片，不主动模拟一套替代交互。

### 5. 宿主节点定位顺序

保持并强化以下查找顺序：

1. `requestId`
2. `promptToken`
3. `imageSrc`

仅在成功命中宿主节点时才转发 click / dblclick。

## 代码调整方向

### 保留

- `generatedImageActivation.ts`
- `imagePendingTaskManager.ts`
- `galleryCache.ts`
- `imagePersistencePatch.ts` 中的单消息 patch 构建能力
- `StoryPage.vue` 中现有宿主节点解析与 click / dblclick 转发逻辑

### 删除或停用

- `bindDisplayedImagePromptObserver`
- `persistDisplayedImagePrompts`
- `queuePersistDisplayedImagePrompts`
- `sanitizePluginImageExtrasInCurrentChat`
- `sanitizePluginImageCacheMeta`
- 所有由图片 DOM 变化反向写消息的调用点

### 收敛

- `useStreamingDemo.ts` 的 gallery / transcript 刷新只保留“事件后局部刷新”
- `buildGalleryEntriesForMessage` 与正文图片注入逻辑继续读取消息与 cache，但不反写
- 图片持久化成功后只触发必要的 transcript / gallery 刷新

## 验证标准

### 功能行为

- 正文双击仍能触发原插件生图
- 正文中的已有图片单击会打开原插件更多图查看器
- 正文中的已有图片双击会走原插件重生
- 图廊中的图片单击/双击与正文图片语义一致
- 新图返回后，正文与图廊都能显示，重开界面后仍可恢复

### 性能与稳定性

- 一次生图成功只产生一次对应消息写入
- 不再出现图片 DOM 变化导致的 assistant 全量回写
- 不再因为观察图片变化而持续触发 `rebuildTranscript() -> setChatMessages() -> rebuildTranscript()` 回环
- 长聊天下内存不再因图片回写链路持续增长

### 兼容性

- 若某张图无法映射到宿主原节点，图仍能展示，但交互失效时不伪造替代行为
- cache 仍可作为历史图的展示兜底，但不是写回来源

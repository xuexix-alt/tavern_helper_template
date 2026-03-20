# 同层版 Native-first 图片链路收敛设计

**目标**

将 `src/寒冬末日/界面同层版` 的图片链路从“UI 自建持久化 + 插件兼容”收敛为“`st-chatu8` 原生主导、同层版只读消费与桥接”的 Native-first 模式。后续图片实体以插件原生 Stego PNG 为准，同层 UI 不再主动写 `extra.images`、`stream_demo.generated_images` 或 `idb://` 引用。

**已确认的设计定案**

1. `chatMetadata['st-chatu8']` 仅做 fallback，不再视为原生主来源。
2. UI 停止主动写 `extra.images` / `stream_demo.generated_images`。
3. 新增 `mes image tag parser`，把 `chat[mesId].mes` 纳入原生读取主链。
4. 旧 IndexedDB / `idb://` 直接退场，不再保留运行时主路径。

**非目标**

- 不重写 `st-chatu8` 插件自身的 prompt 规划、placeholder、图片查看器、重生图逻辑。
- 不在本轮实现新的图片实体存储层。
- 不把同层 UI 变成新的图片真相源。

---

## 1. 问题摘要

当前同层版的图片链路同时混用了四类来源：

1. `stream_demo.generated_images`
2. `extra.images`
3. `chatMetadata['st-chatu8']`
4. UI 自己的 IndexedDB / `idb://`

这套结构存在三个核心问题：

- **主来源判定错误**：原生成功路径主要落在 `chat[mesId].mes + extra.images + Stego PNG`，但当前 UI 仍会把 `chatMetadata['st-chatu8']` 当成可优先消费的数据层。
- **写入权冲突**：UI 侧 `persistGeneratedImageResponse()` 会回写 `extra.images`，而插件原生 `insertOriginalText` 路径会主动清理旧 `extra.images[0]`，双方存在竞争。
- **性能与复杂度问题**：UI 自建 IndexedDB 与 `idb://` 带来额外存储、反序列化、引用解析与消息写回成本，不符合“如无必要，勿增实体”。

---

## 2. Native-first 目标边界

### 2.1 真相源边界

未来同层版对图片的真相源排序为：

1. **宿主原生 DOM 工件**
   - `.st-chatu8-image-span`
   - `.st-chatu8-image-button`
   - 宿主 `mes_text` 内已渲染出的图片节点
2. **`chat[mesId].extra.images`**
3. **`chat[mesId].mes` 中的 image tag 标记**
4. **`chatMetadata['st-chatu8']` fallback**
5. 旧 `stream_demo.generated_images` 仅供迁移兼容读取

图片实体真相源为：

- **插件 Stego PNG**
- 通过插件原生 `getItemImg / getItemBlob` 等读取能力消费

### 2.2 同层 UI 职责

同层版保留以下职责：

- 将正文 / 图廊中的查看与重生动作桥接回宿主原节点。
- 读取原生图片来源并拼装正文注入 / 图廊展示所需的数据。
- 在宿主 DOM 尚未刷新完成时提供只读兜底展示。

同层版移除以下职责：

- 把图片实体写入浏览器 IndexedDB。
- 回写 `extra.images`、`stream_demo.generated_images`。
- 通过 `idb://` 维护自己的图片实体引用体系。

---

## 3. 入口修正：首次生图必须宿主优先

当前日志已经证明，失败主因不是 response 监听缺失，而是首次触发目标经常落在 iframe 内：

- `assistant-body`
- `assistant-body-wrap`
- `html-body`

这会导致插件前半段回查宿主 `mes_text` 时落到错误 `mesId`，进而因为 `mes.length < 100` 触发 fallback，最终只写到 `chatMetadata`。

### 设计要求

首次生图触发顺序必须改为：

1. 由同层消息 `messageId` 解析宿主真实 `.mes[mesid]`
2. 再解析宿主 `.mes_text`
3. 只有宿主目标确实找不到时，才回退 iframe `.assistant-body` / `.html-body`

这项修正优先级高于任何 response 侧补救逻辑。

---

## 4. `useStreamingDemo.ts` 的职责重构

### 4.1 降级 / 替换逻辑

#### 需要替换

- `readChatu8CacheEntries()`：从“原生主来源读取器”降级为 fallback cache reader。
- `appendChatu8ArtifactsToHtml()`：改为消费统一的 Native-first 图片聚合结果，不再混合拼装旧 persistence 结果。
- 图廊构造相关逻辑：统一改为先消费 native artifacts，再消费 legacy compatibility artifacts。

#### 需要降级为兼容层

- `readPersistedGeneratedImages()`
- `readPersistedGeneratedImageIndex()`

这两段只为旧聊天兼容，不再驱动新链路。

#### 需要降级为观察 / 调试层

- `bindImagePersistenceEvents()`
- `imagePendingTaskManager`
- `markRecentImageIntent()`
- `beginPendingImageTask()`

保留日志与定位能力，但不再承担“图片实体持久化主链”职责。

#### 需要废弃

- `persistGeneratedImageResponse()`
- 所有由其驱动的 `storeImage() / buildGeneratedImagePersistencePatch() / setChatMessages(idb)` 路径

### 4.2 新的 `useStreamingDemo.ts` 角色

`useStreamingDemo.ts` 后续应只承担：

- Native-first 来源编排
- transcript / gallery 刷新调度
- 交互桥接入口

而不再承担：

- 图片实体存储
- 图片引用持久化回写

---

## 5. `generatedImageSourceResolver.ts` 的优先级调整

当前优先级：

1. `stream_demo.generated_images`
2. `extra.images`
3. `chatMetadata`
4. `idb://`

这与 Native-first 不一致。

### 新优先级

1. `extra.images`
2. `mes image tag parser` 的结构化结果
3. `chatMetadata['st-chatu8']` fallback
4. `stream_demo.generated_images` legacy
5. `idb://` 不再支持

### 设计要求

- `generatedImageSourceResolver.ts` 不直接承担 Stego 解码逻辑。
- 它只负责决定“从哪个结构化来源读”，并返回足够的实体读取 hint。
- 如果需要调用插件原生实体读取能力，应通过独立 adapter 边界完成。

---

## 6. 新增 `mes image tag parser`

### 6.1 职责

新增一个只负责解析 `chat[mesId].mes` / `message.message` 中原生 image tag 标记的 parser。

### 6.2 输入

- `messageId`
- `rawMessage`
- 可选：当前 swipe 的 `extra.images`

### 6.3 输出

至少包含：

- `messageId`
- `order`
- `promptToken`
- `rawTag`
- `promptBody`
- `anchorText`
- `requestId?`
- `src?`
- `entityHint`

### 6.4 责任边界

它只做：

- token 解析
- 顺序还原
- 锚点提取
- 与 `extra.images` 的只读合并 hint

它不做：

- DOM 查询
- 图片实体读取
- 消息写回
- 交互桥接

### 6.5 模块建议

建议新增单独文件，例如：

- `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeMesTag.ts`

---

## 7. 模块保留 / 兼容 / 废弃清单

### 7.1 保留为主线

- `pages/StoryPage.vue` 中宿主目标桥接逻辑
- `pluginNativeImageDom.ts`
- `pluginNativeImageSelectors.ts`
- `GeneratedImageAsset.vue`
- `readChatu8ExtraImages()` 及其后续聚合层

### 7.2 保留为迁移兼容

- `galleryCache.ts`
- `readChatu8CacheEntries()`（fallback only）
- `readPersistedGeneratedImages()` / `readPersistedGeneratedImageIndex()`
- `imagePendingTaskManager.ts`（observe/debug only）

### 7.3 标记废弃并退出运行时主链

- `imageStore.ts`
- `imagePersistencePatch.ts`
- `persistGeneratedImageResponse()`
- `buildGeneratedImagePersistencePatch()`
- `buildIdbSrc() / parseIdbSrc() / isIdbSrc()`

---

## 8. 迁移策略

### 阶段 1：收紧读取优先级

- 先让 `chatMetadata` 退为 fallback
- 引入 `mes image tag parser`
- 用统一 native artifacts 取代旧的 cache-first / stream-demo-first 读取分支

### 阶段 2：停写 UI 自建持久化

- 停用 `persistGeneratedImageResponse()`
- 停用 `imageStore.ts` 运行时路径
- 停用 `imagePersistencePatch.ts` 运行时路径

### 阶段 3：移除 `idb://`

- 清理 resolver 中对 `idb://` 的主链依赖
- 保留历史兼容读取窗口后彻底删除

---

## 9. 验证标准

### 功能

- 首次生图触发优先命中宿主 `mes_text`
- 原生成功场景下，UI 不依赖 `chatMetadata` 也能展示图片
- 图廊与正文都能从 `extra.images + mes image tags` 恢复
- 查看 / 重生图仍优先桥接宿主原节点

### 边界

- UI 不再主动写 `extra.images`
- UI 不再主动写 `stream_demo.generated_images`
- UI 不再写 IndexedDB / `idb://`

### 性能

- 移除 UI 自建图片实体层后，不再产生额外的 IndexedDB 读写与 `idb://` 解析开销
- transcript / gallery 刷新只围绕原生结构读取，不再伴随图片实体回写

---

## 10. 本轮实施后的预期结果

实施完成后，同层版图片链路将满足：

- **首次生成走宿主主链**
- **图片读取走原生主来源**
- **UI 只读消费，不再争夺写入权**
- **Stego PNG 回归为唯一图片实体层**

这会让“同层版 UI”真正回到“宿主插件的桥接壳层”定位，而不是继续维持一套并行的第二图片系统。

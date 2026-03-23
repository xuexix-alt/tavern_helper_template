# 同层版图片链路 A1 方案设计：插件原生完整兼容 + 删除 legacy stream_demo fallback

## 1. 目标

将 `src/寒冬末日/界面同层版` 的图片链路收敛为：

- **插件原生链是唯一真相层**
- same-layer UI 只负责：
  - 宿主 `mes_text` 预热
  - 交互桥接
  - native-first 读取与展示
- **彻底删除** `data.stream_demo.generated_images` 的读写与 fallback 地位

本轮目标必须同时满足：

1. 继续兼容插件原生的：
   - `placeholder`
   - 自动批量生图
   - 按钮恢复链
2. 原始 chat 能稳定进入提示词/图恢复链
3. 关闭 UI、重载、重新打开后，仍能从原始 chat 恢复图片

---

## 2. 已确认定案

### 2.1 真相层

图片相关状态只允许来自以下三层：

1. `chat[mesId].mes`
2. `chat[mesId].extra.images[swipeId]`
3. `chatMetadata['st-chatu8']`（仅 fallback）

### 2.2 明确删除

以下内容不再属于运行时图片链的一部分：

- `data.stream_demo.generated_images`
- `legacyGeneratedImages`
- `legacy_stream_demo`
- `readPersistedGeneratedImages()`
- `persistGeneratedImageResponse()`
- `imagePersistencePatch.ts` 中围绕 `stream_demo.generated_images` 的运行时职责

### 2.3 same-layer UI 的最终定位

same-layer UI 不再拥有图片真相层，只保留三类职责：

1. **预热宿主正文**
2. **把操作桥接到宿主原生节点**
3. **读取插件原生结果并投影到正文/图库**

---

## 3. 非目标

- 不重写 `st-chatu8` 插件自身的 prompt 规划、placeholder、generation、taskQueue 实现
- 不继续维护 UI 自己的图片主存储层
- 不保留 `stream_demo.generated_images` 作为迁移期 fallback
- 不在本轮创建新的图片实体存储层

---

## 4. 问题定义

当前 same-layer 图片链路的问题，不是单点 bug，而是双真相架构：

1. 插件原生链希望围绕：
   - 宿主 `mes_text`
   - `chat[mesId].mes`
   - `image_groups -> extra.images`
   - `placeholder / autoLLMClick / taskQueue`
2. same-layer 旧链路仍残留：
   - `data.stream_demo.generated_images`
   - UI 自己的持久化/解析假设

这会导致：

- UI 开着时能看到图，但关闭 UI / 重载后恢复失败
- placeholder 与 UI 同时参与恢复，互相抢控制权
- 真实原生断链被 same-layer 的 legacy fallback 掩盖

---

## 5. 最终架构

### 5.1 真相层

#### 一级真相：`extra.images`

这是插件后半段恢复、按钮恢复、placeholder 再扫描、自动批量生图接力的主消费层。

#### 二级真相：`chat[mesId].mes`

这是插件前半段真正写入原始 chat 的正文层，包含 image tag / prompt 痕迹，是恢复链的重要上游。

#### 三级真相：`chatMetadata['st-chatu8']`

只保留为插件 fallback 路径，不得在 same-layer 中被提升为主来源。

### 5.2 适配层

same-layer 中继续保留：

- `hostMesTextRender.ts`
- `StoryPage.vue` 内的宿主桥接逻辑
- `hostCoordinateTarget.ts`
- native-first artifact reader

### 5.3 展示层

继续保留：

- `TranscriptMessageCard.vue`
- `GeneratedImageAsset.vue`
- `ImageGalleryPanel.vue`

但这些组件只展示原生读取结果，不再主导图片归属与恢复。

---

## 6. 完整时序链

### 6.1 第一段：用户操作进入 same-layer

用户在 same-layer 中进行：

- 非移动端双击正文
- 移动端触摸连击
- 图库重生图
- 生图菜单触发

统一先进入 same-layer 桥接层。

### 6.2 第二段：same-layer 预热宿主 `mes_text`

在真正打入插件链前，same-layer 必须先：

1. 解析正确 `messageId`
2. 调用 `ensureHostMesTextRendered(messageId)`
3. 标记图片意图与 request 归属（仅用于桥接期事件对齐）

设计要求：

- **宿主 `.mes[mesid] .mes_text` 必须优先存在**
- 不接受“先在 iframe 内触发，再期待插件自己回查成功”

### 6.3 第三段：桥接到插件前半段

same-layer 把动作尽量直接打到：

- 宿主原生 `mes_text`
- 或宿主原生图片按钮 / 图片 carrier

插件前半段随后执行：

- `ClickTrigger`
- `promptReq.handlePromptRequest`
- `getElContext`
- `LLM_IMAGE_GEN`
- `parseImagesFromPrompt`
- `saveImageGroup`

### 6.4 第四段：原始 chat 落点

理想路径：

- 写入 `chat[mesId].mes`

fallback 路径：

- 写入 `chatMetadata['st-chatu8']`

same-layer 不再自己补写额外图片真相层。

### 6.5 第五段：插件后半段

插件继续推进：

- `taskQueue`
- `placeholder`
- `autoLLMClick`
- `generate-image-request / generate-image-response`
- `image_groups -> extra.images`

最终可恢复层必须稳定落到：

- `extra.images`

### 6.6 第六段：关闭 UI / 重载恢复

恢复顺序固定为：

1. `extra.images`
2. `chat[mesId].mes` 里的 image tag / prompt 痕迹
3. `chatMetadata['st-chatu8']`

same-layer 重新打开时，只读取这三层，不允许再看 `stream_demo.generated_images`。

---

## 7. 文件职责变更

### 7.1 保留并强化

| 文件 | 改动方向 | 最终职责 |
| --- | --- | --- |
| `hostMesTextRender.ts` | 保留并强化 | 宿主 `mes_text` 预热，成为原生链前置条件 |
| `pages/StoryPage.vue` | 保留并收口 | 只负责宿主桥接，不再承担图片真相写入职责 |
| `hostCoordinateTarget.ts` | 保留 | 优先命中宿主 `mes_text` 类 target |
| `pluginNativeImageDom.ts` | 保留 | 原生图片 DOM 观察层 |
| `pluginNativeImageSelectors.ts` | 保留 | 原生图片 carrier/按钮识别 |

### 7.2 保留但降级

| 文件 | 改动方向 | 最终职责 |
| --- | --- | --- |
| `components/TranscriptMessageCard.vue` | 保留但降级 | 展示正文图片，交互后桥接回宿主 |
| `components/GeneratedImageAsset.vue` | 保留但降级 | 展示图片卡片，不再承担归属判断 |
| `components/ImageGalleryPanel.vue` | 保留但降级 | 展示 native-first 读取出的图库结果 |
| `useStreamingDemo.ts` | 保留但重构 | 原生图片读取编排 + UI 投影 + 桥接协调 |

### 7.3 必删的 legacy 读路径

| 文件 | 必删内容 |
| --- | --- |
| `useStreamingDemo.ts` | `readPersistedGeneratedImages()` |
| `useStreamingDemo.ts` | 所有 `legacyGeneratedImages: ...` |
| `pluginNativeImageArtifacts.ts` | `legacyGeneratedImages?: unknown[]` |
| `pluginNativeImageArtifacts.ts` | `collectLegacyArtifacts(...)` / `legacy_stream_demo` |
| `generatedImageSourceResolver.ts` | `message.data.stream_demo.generated_images` fallback |

### 7.4 必删/退场的 legacy 写路径

| 文件 | 必删内容 |
| --- | --- |
| `useStreamingDemo.ts` | `persistGeneratedImageResponse()` |
| `useStreamingDemo.ts` | `bindImagePersistenceEvents()` 相关旧持久化桥 |
| `imagePersistencePatch.ts` | 围绕 `stream_demo.generated_images` 的运行时职责 |

---

## 8. 运行时读取优先级

same-layer 图片读取优先级固定为：

1. 宿主原生 DOM 工件（若可直接对应 message）
2. `extra.images`
3. `chat[mesId].mes` 中的 image tag / prompt 解析结果
4. `chatMetadata['st-chatu8']`

禁止再出现：

5. `stream_demo.generated_images`

---

## 9. 关键风险与对应要求

### 风险 1：仍然先打到 iframe `html-body`

**要求：**
首次生图 target 解析优先宿主 `.mes[mesid] .mes_text`，iframe target 只能做兜底。

### 风险 2：宿主 `mes_text` 预热不及时

**要求：**

- 占位创建后预热一次
- 流式补丁后视情况再预热
- 完成态再预热一次

### 风险 3：`saveImageGroup` 退回 `chatMetadata`

**要求：**
验收时必须把“是否命中原生 `mes_text` 主路径”作为一级观察面。

### 风险 4：`image_groups -> extra.images` 没迁成

**要求：**
验收必须明确检查：

- `extra.images` 是否真的出现
- placeholder 是否从 `extra.images` 恢复

### 风险 5：legacy fallback 掩盖真实断链

**要求：**
删除 `stream_demo.generated_images` 后，若原生链断，界面必须诚实失败，不能再用旧层假装成功。

---

## 10. 验收标准

### 10.1 真相层验收

必须同时满足：

1. 运行时代码不再读取/写入 `data.stream_demo.generated_images`
2. same-layer 只从 `extra.images / mes / chatMetadata fallback` 读取
3. 关闭 UI 后的恢复不依赖 UI 自己缓存

### 10.2 桥接触发验收

必须同时满足：

1. 非移动端双击可进入插件原生生图链
2. 移动端连击可进入插件原生生图链
3. 插件开始读正文前，宿主 `mes_text` 已可查

### 10.3 原生后半段兼容验收

必须继续兼容：

- `placeholder`
- 自动批量生图
- 按钮恢复链
- `taskQueue`

### 10.4 重载恢复验收

必须满足：

1. 关闭 same-layer UI
2. 刷新 / 重载
3. 插件原生图片与按钮恢复成功
4. 重新打开 same-layer 后，正文和图库结果一致

---

## 11. 最小验证清单

### 用例 1：非移动端双击生图

- 在 same-layer 正文双击
- 验证宿主 `mes_text` 预热成功
- 验证插件进入原生生图链
- 验证 `extra.images` 与原始 chat 落点建立

### 用例 2：移动端触摸连击生图

- 在移动端环境下触发
- 验证 `touchstart` 预热成功
- 验证插件移动端分支最终完成原生链

### 用例 3：自动批量生图兼容

- 验证 `taskQueue` 能推进
- 验证后半段不因 same-layer 改造失效

### 用例 4：关闭 UI 后重载恢复

- 先生成图
- 关闭 UI
- 重载
- 验证插件原生图片/按钮恢复
- 再打开 same-layer 验证图文一致

### 用例 5：按钮恢复链

- 让 placeholder 处理完成一轮
- 触发 DOM 重建或刷新
- 验证按钮从 `extra.images` 恢复

### 用例 6：fallback 场景不崩

- 人为制造主路径不满足场景
- 验证 `chatMetadata['st-chatu8']` 可作为最终 fallback
- 验证不会重新启用 `stream_demo.generated_images`

### 静态 grep

```powershell
rg -n --hidden -S "stream_demo.generated_images|readPersistedGeneratedImages|legacyGeneratedImages|persistGeneratedImageResponse" src
```

通过标准：

- 运行时代码中不再保留这些主链引用

---

## 12. 实施边界

本 spec 对应的实施必须遵守：

1. 先删 legacy 读写路径，再收口 native-first 读取器
2. 不在同一提交里顺手重构无关 UI
3. 不通过 UI 自己补写图片结果来“制造成功”
4. 每完成一段改动，都要用日志或测试证明原生链仍成立

---

## 13. 一句话结论

本轮不是“增强 same-layer 自己的图片系统”，而是：

> **撤销 same-layer 对图片真相层的主权，把图片系统完整交还给插件原生 chat 链；same-layer 只保留宿主预热、交互桥接与 native-first 展示。**

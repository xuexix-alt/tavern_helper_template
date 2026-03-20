# st-chatu8 里的生图业务

> **版本**: v1.0.0  
> **日期**: 2026-03-20  
> **项目**: st-chatu8 插件  
> **结论状态**: 已按“代码可验证 / 日志可验证 / 推断”三类重写

---

## 0. 这份文档解决什么问题

这份文档不是在“猜插件怎么做”，而是为了回答你后续修同层 UI 生图时最关键的几个问题：

1. **st-chatu8 的“生图”其实分几段？**
2. **同层 iframe 里的 `html-body` 为什么经常不走原生 `mes_text` 路线？**
3. **到底什么时候写 `chat[mesId].mes`，什么时候退回 `chatMetadata`？**
4. **`extra.images`、`image_groups`、`lockedTags` 各自扮演什么角色？**
5. **为什么 UI 一重载/重建 DOM，插件的后续图片逻辑就容易失效？**

---

## 1. 证据等级说明

| 标记 | 含义 |
|---|---|
| **[代码验证]** | 直接由 `st-chatu8/` 里的 import / export / 可读字符串 / 逻辑分支确认 |
| **[日志验证]** | 直接由 `.tmp/插件日志/*.txt` 的运行日志确认 |
| **[综合推断]** | 代码与日志能拼出大方向，但细节没法 100% 还原 |

> 这套源码是**混淆过但不是完全黑盒**：很多模块名、导出名、事件名、日志文本仍然可读，因此比“纯猜测”可靠得多。

---

## 2. 先说结论：当前文档里最重要的纠偏

### 2.1 这条链路不是“一步到位生出最终图片”

**[代码验证] [日志验证]**

当前插件的“正文生图”至少分成两段：

### 第一段：**LLM 先产出 `<images>/<image>` 标签**

- 入口：`promptReq.handlePromptRequest`
- 构造上下文：`getElContext`、`buildPromptForRequestType`
- 调 LLM：`llmRequest.LLM_IMAGE_GEN`
- 结果：不是最终图片，而是带 `regex/tag` 的 `<images><image>...</image></images>` 文本
- 解析：`imageInserter.parseImagesFromPrompt`
- 保存锚点/标签：`imageInserter.insertImagesIntoElement` → `saveImageGroup`

### 第二段：**再由任务队列/placeholder 触发后续批量生图**

- 日志里可见：
  - `TaskQueue 任务已添加: ... - LLM: 正文图片生成`
  - `TaskQueue 任务已添加: ... - 自动批量生图 (4 张)`
  - `placeholder.js`
  - `iframe 自动点击任务已完成`

所以你后面修 UI 时，不能把它理解成“插件收到一次请求，直接写好最终图”。  
它实际上是：

```text
双击正文
→ LLM 生成图像标签计划
→ 保存标签锚点 / prompt / regex
→ 再触发后续批量出图与 placeholder 处理
```

---

### 2.2 `html-body` vs `mes_text` 不是唯一分支条件

**[日志验证]**

真正决定保存路径的，不只是“当前点的是不是 `mes_text`”，还包含：

1. `insertOriginalText` 是否启用
2. 是否能反查到外部 `mes_text`
3. 反查到的 `mes` 文本长度是否达到阈值

组 2（UI iframe）日志里有最关键的一段：

```text
目标元素: html-body
insertOriginalText设置: true
找到mes_text: true
mesId: 0
mes长度: 11
阈值: 100
分支: mes 长度不足 - 退回原有逻辑
分支: 保存到 chatMetadata (非 mes_text)
```

也就是说：

- **不是找不到 `mes_text`**
- 而是**找到了，但长度太短**
- 所以 **insertOriginalText 分支被放弃**
- 最终回退到 **chatMetadata 路线**

这点对你修同层版非常关键。

---

### 2.3 原生聊天里，成功走 `insertOriginalText` 时，主写入点是 `chat[mesId].mes`

**[日志验证]**

组 1（原生 `mes_text`）日志：

```text
目标元素: mes_text
insertOriginalText设置: true
找到mes_text: true
mesId: 2
mes长度: 8517
储存位置: chat[mesId].mes
insertOriginalText 保存完成
插入数量: 4
储存位置: chat[mesId].mes
```

这说明当前“点击触发正文生图”这条主链，在原生聊天里优先写的是：

```text
chat[mesId].mes
```

而不是你之前文档里写的“原生聊天一定先写 `extra.images`”。

更准确地说：

- **这条链路的第一落点**，在原生成功分支里，是 `chat[mesId].mes`
- `extra.images` 在后续 placeholder / 自动批量生图 / 标签管理阶段会参与
- 但它**不是这条点击触发生图链的唯一、也不是最早的持久化落点**

---

### 2.4 `extra.images` 不是虚构，它确实在后续阶段被大量使用

**[代码验证] [日志验证]**

虽然原生点击主写入点是 `chat[mesId].mes`，但 `extra.images` 确实存在，而且插件后续逻辑会读它：

- 代码里 `deleteTagForElement` 会直接处理：
  - `chat[mesId].extra.images[swipeId]`
  - `chat[mesId].extra.lockedTags`
- 日志里 `placeholder.js` 会输出：

```text
[iframe] Matched from chat[2].extra.images[0], tags: 7
[iframe] Matched from chat[4].extra.images[0], tags: 3
```

所以更准确的理解是：

- `chat[mesId].mes`：正文插入/锚点落点
- `extra.images`：后续 placeholder / 自动点击 / 标签图组读取的重要来源
- `lockedTags`：锁定标签的附属状态

---

## 3. 模块地图：哪些文件真的在这条链上

下面只列**与正文生图主链强相关**的模块。

| 文件 | 作用 | 证据 |
|---|---|---|
| `utils/promptReq.js` | 正文图片生成主入口，串联上下文、LLM、解析、保存 | **[代码验证]** |
| `utils/chatDataUtils.js` | 从目标元素回溯上下文；同层 iframe 会尝试反查外部 `mes_text` | **[代码验证] [日志验证]** |
| `utils/llmRequest.js` | 发起 `ch-llm-image-gen-request/response` 等事件 | **[代码验证]** |
| `utils/imageInserter.js` | 解析 `<images>/<image>`、模糊匹配文本、保存 image group、删标签 | **[代码验证] [日志验证]** |
| `utils/config.js` | 定义 `eventNames`、`EventType`、`LLMRequestTypes`、默认设置 | **[代码验证]** |
| `utils/aiImageGeneration.js` | 管理真正的生图请求队列，使用 `generate-image-request/response` | **[代码验证]** |
| `utils/taskQueue.js` | 承载 “LLM: 正文图片生成” 与 “自动批量生图” 两类任务 | **[日志验证]** |
| `utils/iframe/placeholder.js` | placeholder 扫描、匹配、自动点击与后续触发 | **[日志验证]** |
| `utils/iframe/autoLLMClick.js` | 自动点击/自动触发后续生图流程 | **[日志验证]** |
| `utils/settings/llmService.js` | `buildPromptForRequestType` 所在，负责按请求类型组装提示词 | **[代码验证]** |
| `utils/worldbookProcessor.js` | 世界书触发与正文上下文构造的一部分 | **[代码验证]** |

---

## 4. 事件总线不是一套，而是两套

### 4.1 LLM 文本生成事件

**[代码验证]**

`config.js` / `llmRequest.js` 明确存在这类事件：

- `ch-llm-image-gen-request`
- `ch-llm-image-gen-response`
- `ch-llm-image-gen-get-prompt-request`
- `ch-llm-image-gen-get-prompt-response`

它们负责的是：

```text
正文上下文 → 让 LLM 产出 <images>/<image> 标签文本
```

这一步返回的是**图像计划文本**，不是最终图像二进制。

---

### 4.2 真正的图片生成事件

**[代码验证]**

`aiImageGeneration.js` 明确导入 `EventType`，并维护：

- `imageGenerationQueue = new Map()`
- `requestImageGeneration(prompt, negative_prompt = '', options = {})`
- `getImageGenerationStatus(id)`

同时它发的是另一套事件：

- `generate-image-request`
- `generate-image-response`

也就是：

```text
tag / prompt → 真正的图片生成器 → imageUrl / error
```

### 4.3 这两套事件在业务上的关系

**[综合推断]**

当前架构更接近：

```text
第一层：LLM 事件
  产出 <image> 标签计划（regex/tag）

第二层：图片生成事件
  把 tag/prompt 送进真正的生图器，得到图片结果
```

这也是为什么你会看到：

- `promptReq.handlePromptRequest`
- `llmRequest.LLM_IMAGE_GEN`
- `parseImagesFromPrompt`
- `saveImageGroup`
- 然后**又**出现 `TaskQueue` / `placeholder` / 自动批量生图

---

## 5. 正文生图主链：按真实运行顺序拆开

## 5.1 触发阶段

**[日志验证]**

组 1/组 2 两份日志都能确认：

```text
ClickTrigger.handleDoubleClick
→ ClickTrigger.buttonClick
→ 用户选择操作: 图片生成
→ promptReq.handlePromptRequest
```

原生聊天时 target 是：

```text
DIV.mes_text
```

同层 iframe 时 target 是：

```text
DIV.html-body
```

---

## 5.2 上下文回溯阶段

**[代码验证] [日志验证]**

`promptReq.js` 直接导入了：

- `getElContext`
- `getProcessedPrompt`
- `replaceAllPlaceholders`
- `mergeAdjacentMessages`
- `buildPromptForRequestType`

组 2 UI 日志证明 `getElContext` 在 `html-body` 上会去找外部 `mes_text`：

```text
[chatDataUtils] 该元素不包含 mes_text 类，尝试查找外部 mes_text
[chatDataUtils] 外部 mes_text 检测结果: { mesId: 0, chatTextLength: 11 }
```

这一步的真实含义是：

- 同层 iframe 的正文节点本身**不是**酒馆原生消息正文
- 插件会尝试回到宿主消息楼层找对应 `mes_text`
- 但如果宿主正文太短、映射不稳定、或者 DOM 包装层太深，后面就会走回退分支

---

## 5.3 提示词构造阶段

**[代码验证] [日志验证]**

代码里 `promptReq.js` 明确会组合：

- 世界书数据
- 相邻消息合并
- 角色图片 / 服装图片 / 通用角色图片
- placeholder 替换
- `buildPromptForRequestType(...)`

日志里也能看到：

```text
getElContext 开始 / 结束
regex.onTestRegexClick 开始
buildPromptForRequestType 开始 / 结束
```

这说明正文生图的 prompt 不是“只取当前块文本”，而是**带上下文拼装**后的结果。

---

## 5.4 LLM 返回 `<images>` 标签阶段

**[代码验证] [日志验证]**

组 2 日志：

```text
llmRequest.LLM_IMAGE_GEN 开始
...
llmRequest.LLM_IMAGE_GEN 结束
```

随后马上进入：

```text
parseImagesFromPrompt
```

说明 `LLM_IMAGE_GEN` 返回的是可被 `parseImagesFromPrompt` 解析的文本，而不是图片实体。

---

## 5.5 `<images>` 解析阶段

**[代码验证] [日志验证]**

`imageInserter.js` 导出：

- `parseImagesFromPrompt`
- `insertImagesIntoElement`
- `fuzzyMatchLine`
- `calculateLineSimilarity`
- `calculateNgramSimilarity`
- `generateElKey`
- `saveImageGroup`
- `findTagInImageGroups`

日志能直接看到解析细节：

```text
[parseImagesFromPrompt] 找到 1 个 <images> 容器
[parseImagesFromPrompt] 找到 4 个 <image> 块
[parseImagesFromPrompt] 块 1 结果: regex="...", tag="..."
...
[parseImagesFromPrompt] 解析完成，共 4 个有效图片
```

所以这一层的核心数据模型至少包含：

- `regex`：正文锚点句子
- `tag` / prompt：后续真正生图时要用的提示词

---

## 5.6 文本锚点匹配阶段

**[代码验证] [日志验证]**

`insertImagesIntoElement` 会做的事，日志已经非常清楚：

1. 清理旧 image 元素
2. 排除第一个直接 `<div>` 的文本
3. 计算 logicalText 范围
4. 对每个 `regex` 做模糊匹配
5. 记录相似度、重映射 endIndex、去重

组 2 当前全量日志：

```text
Will exclude first direct <div> from matching
First <div> text range in logicalText: [0, 2649)
Excluded first <div> text from matching
Remapped endIndex: ...
Fuzzy matched with 90.9% similarity
...
After deduplication: 4 unique matches
```

### 对 UI 修复最重要的一点

你同层 UI 如果：

- 改了最外层 DOM 包装
- 把正文拆成多个 wrapper
- 让“第一层 div”承载了太多无关文本
- 或重建 transcript 时改变了 logicalText

那它的模糊匹配、endIndex remap、placeholder 后处理都会被连带影响。

---

## 6. 保存分支的真实规则

## 6.1 分支判断表

| 条件 | 结果 | 证据 |
|---|---|---|
| `insertOriginalText=true`，能定位到有效 `mes_text`，且 `mes长度 >= 100` | 走 `insertOriginalText` 分支，写 `chat[mesId].mes` | **[日志验证]** |
| `insertOriginalText=true`，但找到的外部 `mes_text` 太短 | 回退原逻辑 | **[日志验证]** |
| 回退原逻辑且当前目标不是 `mes_text`（如 `html-body`） | 保存到 `chatMetadata` | **[日志验证]** |

---

## 6.2 原生 `mes_text` 分支

**[日志验证]**

组 1 原生日志：

```text
目标元素: mes_text
insertOriginalText设置: true
找到mes_text: true
mesId: 2
mes长度: 8517
储存位置: chat[mesId].mes
insertOriginalText 保存完成
```

这说明：

- 它不是单纯“DOM 上插一下”
- 而是把插入后的结果持久化到 `chat[mesId].mes`

---

## 6.3 同层 iframe `html-body` 分支

**[日志验证]**

组 2 UI 日志：

```text
目标元素: html-body
在iframe中: true
找到mes_text: true
mesId: 0
mes长度: 11
阈值: 100
分支: mes 长度不足 - 退回原有逻辑
分支: 保存到 chatMetadata (非 mes_text)
```

这就是同层版最难修的核心矛盾：

- 插件**有能力**从 iframe 回溯到宿主消息
- 但回溯出的宿主消息正文不满足它的“可原文插入”条件
- 所以最终不写 `chat[mesId].mes`
- 改写成了 `chatMetadata`

也就是说：  
**同层 UI 不是“完全没找到宿主消息”，而是“找到了，但不够像插件想要的原生正文”。**

---

## 7. `chatMetadata`、`image_groups`、`extra.images`、`lockedTags` 分别是什么

## 7.1 `chatMetadata`

**[代码验证] [日志验证]**

`chatDataUtils.js` 里 `setcharData/getcharData` 明确是围绕 `getContext()` 的 `chatMetadata` 做读写包装。

日志里也直接有：

```text
[imageInserter] Saved to chatMetadata: ...
```

所以：

- `chatMetadata` 不是你文档里原来的纯猜测
- 它确实是插件自己的一个持久化/半持久化缓存入口

---

## 7.2 `image_groups`

**[代码验证]**

`promptReq.js` / `imageInserter.js` 里可以直接看到：

- `findTagInImageGroups`
- `image_groups`
- `setcharData('image_groups', ...)`
- `getcharData('image_groups')`

它更像是插件自有的“正文锚点图组索引”：

- 每组里至少关联若干 `tag/regex/locked`
- 供删标签、解锁、回查使用

这跟 UI 现在自己维护的 IndexedDB 不是同一层。

---

## 7.3 `extra.images`

**[代码验证] [日志验证]**

它不是假的，插件确实用它：

- `deleteTagForElement` 直接改 `chat[mesId].extra.images[swipeId]`
- `placeholder.js` 日志会输出：

```text
Matched from chat[2].extra.images[0], tags: 7
```

所以 `extra.images` 是后续 placeholder / 自动批量生图 / 标签重放的重要读取源。

---

## 7.4 `lockedTags`

**[代码验证]**

`deleteTagForElement` 里直接处理：

```text
chat[mesId].extra.lockedTags
```

它是标签锁定状态，不是图片实体本身。

---

## 8. 自动批量生图与 placeholder 链路

### 8.1 任务队列是真实存在的第二阶段

**[日志验证]**

同一条链里你能看到两类任务：

```text
TaskQueue 任务已添加: ... - LLM: 正文图片生成
TaskQueue 任务已添加: ... - 自动批量生图 (4 张)
```

这意味着：

- 第一类任务：先让 LLM 产出正文图像计划
- 第二类任务：再把这些计划真正转成批量生图动作

---

### 8.2 placeholder 会重复扫描、重复尝试

**[日志验证]**

日志反复出现：

```text
[placeholder] Will exclude first direct <div> from matching
[iframe] Element marked processed but no buttons found, re-processing
```

这说明 placeholder 不是一次性完成，而是轮询/重试式的。

### 对同层 UI 的直接影响

如果你在同层版里：

- 频繁重建 DOM
- 把按钮藏在 iframe 自己的结构里
- 改了按钮激活方式
- 让原有按钮查找不到

就会触发这种：

```text
标记过 processed，但又因为按钮找不到而重新处理
```

这类问题非常容易表现为：

- 重复生成
- placeholder 一直不消失
- 任务完成了但 UI 没同步

### 8.3 placeholder 不是“纯显示层”，它自己还会做匹配、补按钮、触发生成

**[代码验证] [日志验证]**

从 `utils/iframe/placeholder.js` 的 import 可以确认，它至少直接依赖这些能力：

- `getItemImg`：从插件数据库取图
- `getcharData/setcharData`：读写插件自己的数据
- `fuzzyMatchLine`
- `generateStableId`
- `generateElKey`
- `createAndShowImage`
- `triggerGeneration`
- `showEditDialog`

这说明 placeholder 不只是“把现成图片渲染出来”，它还负责：

1. 从已有锚点数据里恢复匹配
2. 在 iframe 里补出交互按钮/图片容器
3. 找不到真实图片时，再次触发生成
4. 支持编辑弹窗

也就是说，你同层 UI 如果自己替换了按钮或卡片结构，实际上是在和 placeholder 的“半控制器逻辑”抢控制权。

---

### 8.4 placeholder 当前已明确优先读取 `extra.images`

**[日志验证]**

当前全量日志里能稳定看到：

```text
[iframe] Matched from chat[2].extra.images[0], tags: 7
[iframe] Matched from chat[4].extra.images[0], tags: 3
```

这说明在 placeholder 阶段，插件会把：

```text
chat[messageId].extra.images[swipeId]
```

当成恢复来源之一，而且是经常命中的来源。

因此如果你后续想接入原生 placeholder 体系，`extra.images` 这层不能缺。

---

### 8.5 `image_groups` 更像早期/中间态锚点缓存，`extra.images` 更像后续消费态

**[代码验证] [综合推断]**

从 `placeholder.js` 和 `imageInserter.js` 里能读出的结构关系大致是：

1. `imageInserter.saveImageGroup` / `setcharData('image_groups', ...)`
   - 先按 `generateElKey(logicalText)` 记录一组图像锚点

2. `placeholder.js` 的 `getSavedImageMatches(...)`
   - 优先查 `chat[mesId].extra.images[swipeId]`
   - 如果没命中，再按 `generateElKey(logicalText)` 去查 `image_groups`
   - 从可读字符串看，命中后还可能把 `image_groups` 的内容迁移进 `extra.images`

这也是为什么：

- 你只修 `chatMetadata` 不够
- 你只修 UI 自己的 IndexedDB 也不够
- 因为插件后半段更偏向消费 `extra.images`

---

### 8.6 `autoLLMClick` 是后半段链路的调度器，不只是个开关

**[代码验证] [日志验证]**

`utils/iframe/autoLLMClick.js` 从可读 import 与字符串能确认：

- 它监听生成开始/结束类事件
- 它会记录：
  - `generationStartChatLength`
  - `generationStartSwipesLength`
- 在生成结束时比较：
  - 当前聊天长度是否增加
  - 当前最后一条消息的 swipes 是否增加

日志里能看到：

```text
[st-chatu8] GENERATION_STARTED data: normal
[st-chatu8] Chat array length: 3
[st-chatu8] Last message swipes length: 1
```

并且还有：

```text
[st-chatu8] Real mes_text not found for messageId: 1
```

这说明 `autoLLMClick` 的核心职责是：

1. 监听生成生命周期
2. 判断“是不是出现了新的可处理消息”
3. 回查那条消息对应的**真实宿主 `mes_text`**
4. 再把后续的正文生图流程重新打到那条消息上

所以它并不是“点一下开关自动点按钮”这么简单，而是一个：

```text
生成事件监听器 + 新消息探测器 + 宿主 mes_text 回查器 + 二次触发器
```

---

### 8.7 你同层版一旦没有“真实宿主 mes_text”，autoLLMClick 也会断

**[日志验证] [综合推断]**

日志里已经出现：

```text
[st-chatu8] Real mes_text not found for messageId: 1
```

这意味着：

- 即便前半段 prompt / image group 保存成功
- 后半段 autoLLMClick 仍可能因为找不到宿主 `mes_text` 而停住

这正是同层 UI 最难修的点之一：

```text
前半段是 iframe 内 html-body
后半段却要求能回到宿主 mes_text
```

只要这条映射断掉，后续自动批量生图就会变成：

- 任务跑了
- placeholder 在重试
- 但真正的后续动作落不到正确宿主节点上

---

## 8.8 真正“出图片”的那层还有独立请求队列

**[代码验证]**

`utils/aiImageGeneration.js` 可直接确认：

- 维护 `imageGenerationQueue = new Map()`
- 导出 `requestImageGeneration(prompt, negative_prompt = '', options = {})`
- 导出 `getImageGenerationStatus(id)`

并且队列记录字段至少包含：

```js
{
  id,
  prompt,
  negative_prompt,
  options,
  status,
  timestamp,
  imageUrl,
  error
}
```

这说明真正出图片的那层具备：

- 独立请求 ID
- 独立状态机
- 超时失败处理
- 可查询状态

所以如果你后面要自己接管“最终图片生成”，最好直接决定：

- 是继续用它的 `generate-image-request/response` 队列
- 还是自己重写这一层

不要卡在“前半段沿用插件，后半段半接半不接”的状态。

---

## 8.9 `taskQueue` 的状态机：真实状态与触发条件

**[代码验证] [日志验证]**

混淆前 `utils/taskQueue.js` 可以确认它不是一个“只打印日志的队列”，而是有完整状态流。

### 8.9.1 状态枚举

插件内部至少存在这些状态：

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

同时还定义了任务类型枚举，至少能读出：

- `button`
- `image`
- `video`
- `sd`
- `comfyui`
- `novelai`

> 日志里你最常看到的是“LLM: 正文图片生成”和“自动批量生图 (N 张)”这两类业务名称；它们是业务命名，不等于内部 type 枚举的全部。

### 8.9.2 `queued` 什么时候出现

**[代码验证]**

`addTask(...)` 会：

1. 生成任务 ID
2. 建 task 对象
3. 初始状态设为 `queued`
4. 立刻触发监听器刷新

日志表现为：

```text
[TaskQueue] 任务已添加: xxx - LLM: 正文图片生成
```

或：

```text
[TaskQueue] 任务已添加: xxx - 自动批量生图 (4 张)
```

### 8.9.3 `running` 什么时候出现

**[代码验证] [日志验证]**

`updateStatus(taskId, RUNNING)` 会：

- 把状态切到 `running`
- 写 `startedAt`

而 `executeNextQueued()` 会自动扫描第一个 `queued` 任务并把它切成 `running`。

日志表现：

```text
[TaskQueue] 任务状态更新: xxx -> running
```

### 8.9.4 `completed` / `failed` 什么时候出现

**[代码验证]**

`completeTask(taskId, success = true)` 会调用：

- `success=true` → `completed`
- `success=false` → `failed`

并且：

- 写 `completedAt`
- 做历史清理

日志表现：

```text
[TaskQueue] 任务状态更新: xxx -> completed
```

或：

```text
[TaskQueue] 任务状态更新: xxx -> failed
```

### 8.9.5 `cancelled` 什么时候出现

**[代码验证] [日志验证]**

`cancelTask(taskId)` 会：

1. 把状态改成 `cancelled`
2. 写 `completedAt`
3. 发一个取消事件：

```text
st_chatu8_task_cancelled
```

4. 返回“这个任务取消前是否是 running”

日志表现：

```text
[TaskQueue] 任务已取消: xxx
```

### 8.9.6 从日志可见的真实业务状态流

#### A. 正文 LLM 生图任务

**[日志验证]**

最稳定的流转是：

```text
任务已添加 → running → completed
```

也存在失败：

```text
任务已添加 → running → failed
```

#### B. 自动批量生图任务

**[日志验证]**

它有两种常见结果：

1. 正常完成
```text
任务已添加 → running → completed
```

2. 运行一段时间后被取消
```text
任务已添加 → running → cancelled
```

你日志里的典型例子：

```text
17:10:51.669 任务已添加: mmx92s5u2x2lw - 自动批量生图 (4 张)
17:10:51.673 任务状态更新: mmx92s5u2x2lw -> running
...
17:11:54.700 任务已取消: mmx92s5u2x2lw
```

### 8.9.7 对你修同层 UI 最重要的含义

`taskQueue` 不是“附带 UI 装饰”，它是原生链路的**控制平面**：

- `queued`：已经决定要做
- `running`：后续原生链路正在尝试推进
- `completed`：不代表 UI 一定渲染成功，只代表插件那一层认为完成
- `failed`：插件这一层就失败了
- `cancelled`：外层控制流主动放弃，不会再继续推进

所以你在同层 UI 里看到：

- 有任务
- 也在 `running`

并不代表：

- 图片一定会显示
- placeholder 一定能闭环

因为 UI 显示层和任务层是解耦的。

---

## 8.10 `generate-image-request / response`：真实 payload 与返回结构

### 8.10.1 发起请求的那层：`requestImageGeneration`

**[代码验证]**

混淆前 `utils/aiImageGeneration.js` 可确认：

```js
requestImageGeneration(prompt, negative_prompt = '', options = {})
```

它内部会先把请求放进 `imageGenerationQueue`：

```js
{
  id,
  prompt,
  negative_prompt,
  options,
  status: 'pending',
  timestamp,
  imageUrl: null,
  error: null
}
```

然后发事件：

```text
generate-image-request
```

### 8.10.2 请求 payload：已确认字段

**[代码验证]**

事件 payload 至少明确包含：

```js
{
  id,
  prompt,
  width,   // options.width || null
  height   // options.height || null
}
```

当有负面提示词时，还会额外挂一个“合并后的 prompt 字段”用于下游消费。  
**字段值已能确认存在，但字段名在混淆输出里不稳定，暂不在这里硬写死。**

### 8.10.2.1 但 iframe 实际触发时，不一定经过新的 requestId

**[代码验证]**

还原后的 `iframe/generation.js` 把这件事说明得更具体：

- `triggerGeneration(buttonEl)` 发请求时，真正使用的是：

```text
button.dataset.stableId
```

而不是 `aiImageGeneration.js` 自己生成的新 requestId。

也就是说，在 iframe / placeholder 这条后半段链路里：

```text
stableId = 请求 id = 响应回填时的定位键
```

这很关键，因为响应回来后它会按：

- `span[data-stable-id="..."]`
- `button.image-tag-button[data-stable-id="..."]`

去找回填目标。

### 8.10.3 iframe / generation 层在发请求前会再补业务字段

**[代码验证]**

`utils/iframe/generation.js` 不是简单转发，它会从按钮或宿主元素 dataset 里再组装一些字段：

至少已确认它会补：

- `id`
- `prompt`
- `width`
- `height`
- `change`（当节点带 change 标记时）

并且在特定标记场景下，还会再补：

- **修图相关字段**
  - `retouchPrompt`
  - `retouchImage`
- **视频相关字段**
  - 当 change 中带 `{视频}` 时，会进入视频分支
- 还会带一个与原始 URL / 原始资源有关的字段
  - 运行时返回里能看到 `originalUrl`

更具体地说，`triggerGeneration(buttonEl)` 会先从按钮 dataset 读取：

- `data-link` → prompt
- `data-stable-id` → 请求 id
- `data-change`
- `data-width`
- `data-height`

然后按条件补充：

- `change`
- `retouchPrompt`
- `retouchImage`
- `videoPrompt`
- `videoImage`

并且还会清理某些 dataset 中残留的 `blob:` / `data:` 标记，避免重复传递。

### 8.10.4 响应 payload：已确认字段

**[代码验证]**

`generation.js` 在消费 `generate-image-response` 时，明确按下面结构解包：

```js
{
  id,
  success,
  imageData,
  error,
  prompt,
  change,
  isVideo,
  originalUrl
}
```

这是目前你想自己桥接最终出图层时，最关键的一条。

### 8.10.4.1 这层的“真实图片数据”主字段其实是 `imageData`

**[代码验证]**

虽然 `aiImageGeneration.js` 里的队列字段叫 `imageUrl`，但 `generation.js` 消费响应时主取的是：

```js
imageData
```

然后交给：

```js
createAndShowImage(span, imageData, ...)
```

所以在 iframe 后半段语义里：

- `imageData` 才是主图片载荷
- `originalUrl` 更像视频失败回退或外部资源备用字段
- `imageUrl` 更像 `aiImageGeneration.js` 队列层对结果的宽泛命名

这两层字段语义并不完全一致，修桥接时必须注意。

### 8.10.5 响应成功后的消费方式

**[代码验证]**

成功时，插件会：

1. 停止对应 prompt 的“生成中”状态
2. 在当前文档或 iframe 文档里找：
   - `data-request-id="..."`
3. 调 `createAndShowImage(...)`
4. 把按钮 / 容器从 loading 状态切回可交互状态

而且这里不是只找“当前文档”：

- `generation.js` 会把：
  - `document`
  - 所有 `iframe.contentDocument`

都纳入搜索范围。

这说明原生设计本来就假设：

```text
同一个 stableId 可能在宿主文档或 iframe 文档里出现
```

所以你后面修同层版时，最好继续保留 `stableId` 跨文档一致性，不要另造一套局部 ID。

而且如果图片已经在 DB 里存在，`generation.js` 还会走 **缓存命中分支**：

- 直接取本地已有图片
- 然后主动补发一次 `generate-image-response`
- 带上：
  - `id`
  - `success: true`
  - `imageData`
  - `prompt`
  - `change`
  - `isVideo`
  - 一个表示缓存命中的标志

这一点非常重要：  
**缓存命中不是“静默显示一下图片”就完了，而是会继续广播成功响应，让别的监听器也认为这次生成完成。**

所以如果你未来自己接管后半段，又仍保留原生监听器，就要小心“缓存命中时的重复消费”。

### 8.10.6 响应失败后的消费方式

**[代码验证]**

失败时：

- `error` 会被写回队列项
- UI/按钮状态会从 loading 回退
- 文案会恢复成“生成图片”等默认状态
- 并打印：

```text
图像生成失败 (ID: ...)
```

此外 `generation.js` 里失败后还会：

- 移除按钮的 `data-loading`
- 将按钮恢复到可点击状态
- 重置文案回默认“生成图片”

因此如果你看到按钮一直停在“加载中”，通常意味着：

- 响应没回来
- 响应 ID 对不上 stableId
- 或中途有别的层吞掉了后续重置逻辑

### 8.10.7 `aiImageGeneration` 队列项的状态更新

**[代码验证]**

当收到 `generate-image-response`：

- `success=true`
  - 队列项 `status = completed`
  - `imageUrl = response.imageData || response.imageUrl`
- `success=false`
  - 队列项 `status = error`
  - `error = response.error || 默认错误`

注意这里的队列状态词和 `taskQueue` 的状态词**不是同一个系统**：

- `taskQueue`：`queued/running/completed/failed/cancelled`
- `imageGenerationQueue`：至少能看到 `pending/completed/error`

这也是为什么你不能把“任务已完成”和“真实图片请求已完成”混成一件事。

---

## 8.10.8 `createAndShowImage(...)` 的真实职责

**[代码验证]**

`generation.js` 里 `createAndShowImage(...)` 不只是“把 img.src 填进去”，它实际负责：

1. 创建包裹容器 `ai-image-container`
2. 判断图像还是视频
3. 视频时：
   - `dataURL -> Blob`
   - `fixMp4Faststart(...)`
   - 转成 `blobUrl`
   - 播放失败时优先回退 `originalUrl`
   - 最差再给一个下载 fallback
4. 给按钮写回 `change` 相关 dataset
5. 绑定点击 / 双击 / 长按 / 触摸事件
   - 单击预览
   - 双击重新生成
   - 长按打开编辑
6. 若开启 `collapse`，再包一层折叠 UI
7. 最终替换 placeholder span

所以从功能定位上说：

```text
placeholder.js = 找位置、补按钮、决定何时生成
generation.js = 真正把结果挂回 UI，并绑定后续交互
```

这两层一起构成了插件后半段原生链。

---

## 8.10.9 对同层版修复最直接的新增结论

**[综合推断]**

如果你想兼容原生 `generation.js` 后半段，那么至少要保住这些契约：

1. `button.dataset.stableId`
2. `button.dataset.link`
3. 对应的 `span[data-stable-id]`
4. 响应里的 `id === stableId`
5. 命中缓存时仍允许“成功响应广播”这件事发生

否则常见故障会变成：

- 图片其实生成了，但回填不到正确按钮
- 缓存命中了，但别的监听器没感知到
- 按钮 loading 不复位
- 双击重生图落不到同一个 stableId 目标上

---

## 8.11 `placeholder` 把 `image_groups` 迁移到 `extra.images` 的真实条件

**[代码验证] [日志验证]**

这是你同层 UI 持久化修复里最关键的一段。

### 8.11.1 `getSavedImageMatches(...)` 的优先级

从混淆前 `placeholder.js` 能看出，恢复匹配大致按这个顺序：

1. 先尝试从当前节点回查 `mesId`
2. 如果能回查到，就优先读：

```text
chat[mesId].extra.images[swipeId]
```

3. 如果这一层没有命中，再尝试：

```text
getcharData('image_groups')
→ generateElKey(logicalText)
→ image_groups[elKey]
```

### 8.11.2 `image_groups -> extra.images` 迁移会真的发生

**[代码验证]**

一旦满足：

- 当前节点能回查出 `mesId`
- 当前消息存在 `extra`
- `generateElKey(logicalText)` 在 `image_groups` 里能找到对应组

插件会做这件事：

```text
把 image_groups[elKey] 挂到 chat[mesId].extra.images[swipeId]
然后删除 image_groups[elKey]
然后 saveChatConditional()
然后 setcharData('image_groups', 新值)
```

这就是你要找的“迁移”逻辑本体。

### 8.11.3 为什么这个迁移对同层版特别关键

因为同层版经常出现这种情况：

- 前半段保存时落在 `chatMetadata / image_groups`
- 后半段 placeholder 恢复时却优先找 `extra.images`

如果迁移没有成功，就会出现：

```text
前半段插件说“我保存了”
后半段 placeholder 却说“我没拿到可消费的 extra.images”
```

于是就表现成：

- 重载后不恢复
- 自动批量生图接不上
- placeholder 一直重试

### 8.11.4 从日志看，迁移后的消费确实存在

日志反复出现：

```text
[iframe] Matched from chat[2].extra.images[0], tags: 7
[iframe] Matched from chat[4].extra.images[0], tags: 3
```

这证明后半段确实把 `extra.images` 当成主消费层。

所以你如果只把图存在 UI 自己的 IndexedDB 或 `chatMetadata`，而没有让这条原生迁移链成功，就会一直和 placeholder 原生链脱节。

## 9. 为什么同层版特别容易出逻辑阻碍

## 9.1 插件默认假设“正文节点最终能落回原生 `mes_text`”

但你的同层版里，真实点击目标是：

```text
html-body
```

而不是宿主原生：

```text
mes_text
```

插件虽然会努力回查外部 `mes_text`，但一旦：

- 文本太短
- DOM 对不上
- logicalText 变形
- 最外层 wrapper 干扰匹配

就会退回 `chatMetadata` 路线。

---

## 9.2 UI 自己维护的持久化层，不等于插件认可的原生层

你现在同层 UI 有自己的：

- IndexedDB
- transcript rebuild
- 自定义图片引用恢复

但 st-chatu8 原生链路内部依赖的是：

- `chat[mesId].mes`
- `chatMetadata`
- `image_groups`
- `extra.images`
- `lockedTags`
- `placeholder` / `taskQueue` / 自动点击

所以“UI 看起来能显示图”并不代表“插件自己的后续链路还认这个状态”。

---

## 10. 对后续修复最有用的开发建议

## 10.1 先明确你要接的是哪一层

不要混着修。建议先决定：

### 方案 A：接插件的“第一阶段”

只接：

- `promptReq.handlePromptRequest`
- `parseImagesFromPrompt`
- `saveImageGroup`

让 UI 自己管最终图片生成和持久化。  
这样你就**不要再依赖 placeholder / 自动批量生图 / extra.images 原生重放**。

### 方案 B：接插件的“完整原生阶段”

那你必须保证：

1. 目标节点能稳定回查到宿主 `mes_text`
2. `mes` 文本长度满足插件阈值
3. DOM 结构不要破坏 `insertImagesIntoElement` 的 logicalText / first div 排除逻辑
4. placeholder 能找到它期待的按钮/节点

否则就是“看起来接入了，实际上一直在走回退分支”。

---

## 10.2 当前同层版最该优先验证的 6 个点

1. **触发点元素类型**
   - 当前到底传给插件的是 `html-body` 还是宿主 `mes_text`？

2. **外部 `mes_text` 回查结果**
   - 日志里要看有没有：
   - `外部 mes_text 检测结果`
   - `mesId`
   - `chatTextLength`

3. **是否命中 `insertOriginalText`**
   - 看日志是：
   - `insertOriginalText 模式执行`
   - 还是 `mes 长度不足 - 退回原有逻辑`

4. **saveImageGroup 最终写哪**
   - `chat[mesId].mes`
   - 还是 `chatMetadata`

5. **placeholder 是否在反复 re-processing**
   - 这是 UI 与插件原生结构脱节的高危信号

6. **最终要不要继续依赖插件的 auto batch image**
   - 如果你决定 UI 自己接管真实图片缓存，就不要让原生 placeholder 链再半接管一次

---

## 11. 一句话版结论

### 你现在遇到的阻碍，本质不是“插件逻辑完全看不懂”

而是：

```text
同层 iframe 把原本假设运行在宿主 mes_text 上的链路，变成了 html-body + 外部回查 + 条件回退 + placeholder 补偿链。
```

这会导致：

- 前半段用的是 iframe 目标
- 中段勉强回查宿主消息
- 保存时可能退回 chatMetadata
- 后半段 placeholder / taskQueue / extra.images 又假设自己还在原生链里

所以一旦你想“只修某一层显示”，常常会被后面另一层原生架构反噬。

---

## 12. 参考证据

### 12.1 主要日志

- `.tmp/插件日志/组1原生chat生图-覆盖生图-存储循环操作插件调试日志-无UI时.txt`
- `.tmp/插件日志/组1原生chat生图-覆盖生图-存储循环操作日志-无UI时.txt`
- `.tmp/插件日志/组2UI中LLM发起-生图-加载循环操作插件调试日志.txt`
- `.tmp/插件日志/组2UI中LLM发起-生图-加载循环操作日志.txt`
- `.tmp/插件日志/当前全量日志.txt`

### 12.2 主要代码入口

- `st-chatu8/utils/promptReq.js`
- `st-chatu8/utils/imageInserter.js`
- `st-chatu8/utils/chatDataUtils.js`
- `st-chatu8/utils/llmRequest.js`
- `st-chatu8/utils/aiImageGeneration.js`
- `st-chatu8/utils/config.js`

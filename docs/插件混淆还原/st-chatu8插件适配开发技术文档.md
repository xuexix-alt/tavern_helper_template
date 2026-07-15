# st-chatu8 插件开发参考手册

> 本文档由逆向还原结果整理，供二次开发者理解插件架构、扩展功能或做兼容适配使用。
> 本文早期章节来自旧版可读化还原；当前 v2.7.7 bundle 的函数、DOM 和数据证据见 [`st-chatu8-v2.7.7-当前源码核对.md`](st-chatu8-v2.7.7-当前源码核对.md)。
> 本轮 same-layer-pre Beta 的完整测试证据、移动端误判和 1200ms 桥接契约边界见 [`../same-layer-pre画廊beta全量审计说明.md`](../same-layer-pre画廊beta全量审计说明.md)。
>
> **修订记录**
> v1.1（2026-03-20）：旧版实测修订。
> v1.2（2026-07-15）：按 v2.7.7 bundle 复核，纠正图片本体存储、占位符类名、请求身份属性及图片手势描述。旧版 `data-stable-id`、`image-tag-placeholder` 和 Stego-only 结论不再适用于当前 bundle。

---

## 目录

1. [整体架构一览](#1-整体架构一览)
2. [核心数据流：从 LLM 输出到图片落地](#2-核心数据流从-llm-输出到图片落地)
3. [模块速查表](#3-模块速查表)
4. [模块详解](#4-模块详解)
5. [关键接口速查](#5-关键接口速查)
6. [事件总线速查](#6-事件总线速查)
7. [Settings 字段表](#7-settings-字段表)
8. [扩展开发指引](#8-扩展开发指引)
9. [与外部 UI 适配的注意事项](#9-与外部-ui-适配的注意事项)

---

## 1. 整体架构一览

```
SillyTavern 宿主
│
├── index.js          ← 插件入口：初始化、CSS 加载、库加载、定时轮询
│
├── iframe/
│   ├── chatProcessor.js   ← 定时扫描 DOM，找 .mes_text 和 <iframe>
│   ├── placeholder.js     ← 扫描消息文本，注入"生成图片"按钮
│   ├── generation.js      ← 按钮点击处理，缓存查询，发出生图请求
│   ├── imageQueue.js      ← 生图请求队列（requestId 管理，事件路由）
│   ├── autoLLMClick.js    ← 监听 LLM 生成结束，自动触发生图
│   ├── promptReq.js       ← 生图请求总调度（prompt 构建→LLM→标签解析→插入）
│   ├── dialogs.js         ← 编辑对话框、尺寸弹窗、Banana 修图弹窗
│   ├── imagePreview.js    ← 全屏图片/视频预览弹窗
│   └── utils.js           ← 通用工具（见第 5 节）
│
└── utils/
    ├── config.js      ← extensionName, EventType, defaultSettings
    ├── database.js    ← 图片缓存/数据库/服务器媒体读取（getItemImg, getItemBlob, ...）
    ├── sd.js          ← SD WebUI API
    ├── novelai.js     ← NovelAI API
    ├── banana.js      ← Banana API
    ├── comfyui.js     ← ComfyUI API
    └── ...
```

---

## 2. 核心数据流：从 LLM 输出到图片落地

```
用户发送消息
    │
    ▼
SillyTavern GENERATION_ENDED 事件
    │
    ▼
autoLLMClick.js :: GENERATION_ENDED 监听
  检查消息增量 & 长度 & window.autoLLMClick
    │ (符合条件)
    ▼
handlePromptRequest(element, gestureId)       ← promptReq.js
  │
  ├─1─ [可选] showUserDemandPopup()           ← promptReq.js 内
  ├─2─ getElContext(element, depth)           ← chatDataUtils.js
  ├─3─ processWorldBooksWithTrigger(ctx)      ← worldbookProcessor.js
  ├─4─ buildPromptForRequestType('image_gen') ← settings/llmService.js
  ├─5─ replaceAllPlaceholders(msgs, data)     ← promptProcessor.js
  ├─6─ mergeAdjacentMessages(msgs)
  ├─7─ [可选] appendImagesToMessage(...)      ← 插入角色参考图
  ├─8─ LLM_IMAGE_GEN(messages)               ← llmRequest.js
  ├─9─ removeThinkingTags(response)          ← utils.js
  ├─10─ parseImagesFromPrompt(text)           ← imageInserter.js
  └─11─ insertImagesIntoElement(el, tags)     ← imageInserter.js
           │
           ▼
      placeholder.js 在 DOM 中找到 <tag> 位置
      注入"生成图片"按钮 (createButtonAtPosition)
           │ 用户点击 / autoLLMClick 自动点击
           ▼
      triggerGeneration(buttonEl)             ← generation.js
        检查缓存 (getItemImg)
        emit EventType.GENERATE_IMAGE_REQUEST
           │
           ▼
      imageQueue.js 接收请求，路由给对应生图后端
      (SD / NovelAI / Banana / ComfyUI)
           │
           ▼
      emit EventType.GENERATE_IMAGE_RESPONSE
           │
           ▼
      generation.js :: createAndShowImage()
      渲染图片/视频到宿主 DOM；媒体由插件缓存/数据库/服务器层读取
```

---

## 3. 模块速查表

| 文件               | 导出内容                                                                  | 关键依赖                                                | 一句话职责                                        |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `index.js`         | —                                                                         | 所有模块                                                | 插件入口，初始化、CSS 注入、定时轮询              |
| `chatProcessor.js` | `processMesTextElements` `processIframes`                                 | `placeholder.js`                                        | 扫描 DOM，触发按钮注入                            |
| `placeholder.js`   | `findAndReplaceInElement` `createButtonAtPosition` `getSavedImageMatches` | `generation.js` `dialogs.js`                            | 在消息文本中找 `<tag>` 位置，注入按钮             |
| `generation.js`    | `createAndShowImage` `triggerGeneration` `setShowImagePreview`            | `imageQueue.js` `dialogs.js`                            | 按钮点击 → 发请求 → 渲染结果                      |
| `imageQueue.js`    | `requestImageGeneration` `getImageGenerationStatus`                       | `config.js` `script.js`                                 | 请求队列与超时管理                                |
| `autoLLMClick.js`  | `setAutoLLMClick` `getAutoLLMClick` `initAutoLLMClick`                    | `promptReq.js`                                          | 监听 LLM 生成完成，自动触发 `handlePromptRequest` |
| `promptReq.js`     | `handlePromptRequest` + 大量透传导出                                      | `llmRequest.js` `imageInserter.js` `promptProcessor.js` | 生图请求总调度                                    |
| `dialogs.js`       | `showEditDialog` `showBananaRetouchDialog` `setTriggerGeneration`         | `imageInserter.js` `dialogs/comfyui`                    | 编辑对话框：提示词编辑、翻译、tag 操作            |
| `imagePreview.js`  | `showImagePreview` `downloadBlob`                                         | `database.js` `generation.js`                           | 全屏预览弹窗，缩略图切换，下载/删除               |
| `utils.js`         | 43 个函数（见第 5 节）                                                    | `database.js` `config.js`                               | 工具库：HTTP、图片处理、Prompt 替换等             |

---

## 4. 模块详解

### 4.1 `index.js` — 插件入口

**启动序列（顺序执行）：**
```
loadJSZip() → loadcrypto() → loadmsgpack() → main()
```

**`main()` 内部顺序：**
1. `cssFiles.forEach(loadCSS)` — 加载 10 个 CSS 文件
2. 合并 `defaultSettings` + `extension_settings[extensionName]`
3. 自动迁移旧版视频路径（`chatu8_video_paths.idle/dragging`）
4. `installGlobalErrorHandler()`
5. `initUI({ check_update })` — 初始化设置面板 UI
6. `initializeNewlineFixer()` — 修复换行问题
7. `setTimeout(addNewElement, 500)` — 注入 FAB 按钮
8. `setInterval(chenk, 2000)` — 定时调用各平台替换函数
9. `checkForUpdates()` — 检查远端版本

**`chenk()` 调用链：**
```
replaceWithcomfyui() → replaceWithBanana() → replaceWithnovelai() → replaceWithSd()
```
> 这 4 个函数均来自 `utils/` 目录，负责各平台的 API 调用和状态检查。

---

### 4.2 `chatProcessor.js` — DOM 扫描

**`processMesTextElements()`**
```javascript
// 触发时机：由各平台替换函数在替换完成后调用
// 核心逻辑：
for (const el of document.getElementsByClassName('mes_text')) {
    if (!zidongdianji && !isElementVisible(el, 2000)) continue;
    findAndReplaceInElement(el);  // → placeholder.js
}
```

**`processIframes()`**
- 遍历所有 `<iframe>` 元素
- 向每个 iframe 注入三套样式（button / frame / collapse）
- 用 `isInViewport()` + `hasSize()` 过滤元素后调用 `findAndReplaceInElement`
- 如果 iframe 尚未 loaded，挂 `load` 事件

**跳过条件（两个函数通用）：**
- `!extension_settings[extensionName].scriptEnabled` — 插件未启用
- `checkSendBuClass() === true` — 发送按钮正忙

---

### 4.3 `placeholder.js` / 当前 bundle 的图片标签注入 — 按钮注入

**`findAndReplaceInElement(element, displayMode?)`**
主入口。扫描 element 内的文本节点，找到所有 `<tag>` 格式的图片标签位置，逐一调用 `createButtonAtPosition`。

**`createButtonAtPosition(insertPosition, tagContent, nodeList, doc, element, settings, autoTrigger, displayMode)`**
在精确字符偏移处注入按钮：
```html
<button class="image-tag-button st-chatu8-image-button"
        data-link="<tag>"
        data-image-tag="<tag>"
        data-request-id="chatu8-id-...">生成图片</button>
<span class="st-chatu8-image-span"
      data-request-id="chatu8-id-..."></span>
```

当前 bundle 的去重属性是 `data-tag-inserted-chatu8-id-*`。`data-stable-id` 和 `image-tag-placeholder` 属于旧还原版本，不应再写入新适配器。

**`getSavedImageMatches(rawText, element, processedText, searchOffset?)`**
返回已匹配的图片标签位置数组，用于恢复已有图片的按钮状态。

---

### 4.4 `generation.js` — 生成与渲染

**`triggerGeneration(buttonEl)`**
```
1. 防重入检查 (isGenerating)
2. 读取 button.dataset.link 与 button.dataset.requestId
3. 检查 getItemImg / 插件媒体缓存 → 有缓存则直接渲染
4. 无缓存 → emit EventType.GENERATE_IMAGE_REQUEST
5. 监听 EventType.GENERATE_IMAGE_RESPONSE，按 response.id 过滤
6. 将 imageData / 视频 / originalUrl 交给 createAndShowImage
```

**`createAndShowImage(spanEl, dataUrl, displayMode, buttonEl, changeData, isVideo?, originalUrl?)`**
将 base64/BlobURL 渲染到 DOM 中的 `<span>` 占位元素，根据 `isVideo` 决定创建 `<img>` 还是 `<video>`。

**`setShowImagePreview(callback)`**
注入预览回调（由 `imagePreview.js` 在初始化时调用），使得点击图片时能打开全屏预览。

---

### 4.5 `imageQueue.js` — 请求队列

**`requestImageGeneration(prompt, negativePrompt?, options?)`**
```javascript
// 返回 Promise<responseData>
const result = await requestImageGeneration(
    'beautiful landscape, sunset',
    'blurry, ugly',
    { width: 512, height: 768 }
);
```
- 生成唯一 `requestId`（格式：`img_N_timestamp`）
- 存入 `imageGenerationQueue` Map
- emit `EventType.GENERATE_IMAGE_REQUEST`
- 60s 超时自动 reject

**`getImageGenerationStatus(requestId)`** → 返回状态字符串

---

### 4.6 `autoLLMClick.js` — 自动触发

**三个事件监听器：**

| 事件                  | 动作                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `GENERATION_STARTED`  | 快照当前 chat 长度和末尾消息 swipes 数                                        |
| `GENERATION_ENDED`    | 对比快照 → 验证消息长度 > 200 → `handlePromptRequest(element, 'gesture1')`    |
| `js_generation_ended` | 触发 `activateAutoLLMClick()`（设置 `window.autoLLMClick = true`，5s 后重置） |

**关键防误触逻辑：**
- 必须检测到消息内容增量（不是纯 swipe）
- 消息长度必须 > 200 字符（过滤短消息）
- `insertOriginalText` 标志处理（避免重复触发）

---

### 4.7 `promptReq.js` — 请求调度

**`handlePromptRequest(element, gestureId)`**

占位符替换时可用的变量（`{{...}}` 语法）：

| 占位符                 | 内容                   |
| ---------------------- | ---------------------- |
| `{{上下文}}`           | 最近 N 条消息拼接文本  |
| `{{正文}}`             | 当前消息 body          |
| `{{用户需求}}`         | 用户在弹窗输入的文字   |
| `{{角色启用列表}}`     | 启用的角色标签列表     |
| `{{通用角色启用列表}}` | 通用角色标签列表       |
| `{{通用服装启用列表}}` | 通用服装标签列表       |
| `{{世界书触发}}`       | 匹配到的世界书条目内容 |
| `{{角色名称}}`         | 当前角色名             |

**透传导出（可直接从 `promptReq.js` import）：**
- `llmRequest.js` 的所有 `LLM_*` 常量和函数
- `chatDataUtils.js` 的 `getElContext`, `setcharData`, `getcharData` 等
- `imageInserter.js` 的 `parseImagesFromPrompt`, `insertImagesIntoElement` 等
- `worldbookProcessor.js` 的 `processWorldBooksWithTrigger`

---

### 4.8 `dialogs.js` — 编辑对话框

**`showEditDialog(imgEl, buttonEl)`**
主编辑对话框，功能：
- 提示词 textarea + 自动补全（`handleAutocomplete`）
- 翻译按钮（`callTranslation` + `parseTranslationResult`）
- 坐标语法解析（`parsePromptStringWithCoordinates`）
- Tag 锁定/解锁/删除（`lockTagForElement` / `unlockTagForElement` / `deleteTagForElement`）
- 角色预设展开（`processCharacterPrompt`）
- 图像处理子菜单：ComfyUI / NovelAI / Gork / Banana 修图
- 长按发送 → 尺寸选择弹窗

**`showBananaRetouchDialog(imgEl, buttonEl)`**
Banana 修图专用对话框：显示预览图 + 指令输入 → 触发生成。

**`setTriggerGeneration(fn)`**
注入触发回调（由 `generation.js` 在初始化时调用）。

---

### 4.9 `imagePreview.js` — 全屏预览

**`showImagePreview(mediaEl, buttonEl)`**

弹窗结构：
```
overlay (全屏)
└── dialog
    ├── closeBtn (×)
    ├── navbar (1/3)
    ├── mainContainer
    │   └── mainImageArea (← 当前大图/视频)
    ├── actionBar
    │   ├── downloadBtn (下载当前媒体)
    │   └── deleteBtn (删除当前图片)
    └── thumbnailRow (缩略图横排)
```

**数据来源：** `dbs.getMergedAndSortedImages(md5(data-link))`，再按媒体条目读取 server/db 来源
**Blob 加载：** 按 `source` 字段分流（`server` → fetch，`db` → `dbs.storeReadOnly`）

**`downloadBlob(blob, filename)`**
通用下载函数，使用 `window.top` 的 URL/document 以支持 iframe 内调用。

---

## 5. 关键接口速查

### utils.js 导出一览

| 函数                                  | 签名                                                        | 说明                               |
| ------------------------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `isValidUrl`                          | `(url) → bool`                                              | URL 格式检查（空字符串返回 true）  |
| `checkSendBuClass`                    | `() → bool`                                                 | 发送按钮是否正忙                   |
| `getsdAuth`                           | `() → string`                                               | 返回 `Basic {base64}` 鉴权头       |
| `getSDMode`                           | `async (baseUrl) → string`                                  | 获取当前 SD checkpoint 名称        |
| `setSDMode`                           | `async (baseUrl, model) → void`                             | 切换 SD 模型                       |
| `delay`                               | `(ms) → Promise`                                            | setTimeout 包装                    |
| `sleep`                               | `(ms) → Promise`                                            | 同 delay                           |
| `deepMerge`                           | `(target, source) → object`                                 | 深合并两个对象                     |
| `processReferenceImage`               | `async (src) → base64`                                      | 加载并缩放参考图（>1M px 时缩小）  |
| `calculateSkipCfgAboveSigma`          | `(w, h, modelName?) → number`                               | 计算 skip_cfg_above_sigma          |
| `deduplicateTags`                     | `(prompt) → string`                                         | 逗号分隔标签去重（保留原始大小写） |
| `parsePromptStringWithCoordinates`    | `(raw) → {prompt, negPrompt, insertions[], modifiedPrompt}` | 解析带坐标的提示词                 |
| `stylInput`                           | `(placeholder) → Promise<string>`                           | 模态输入框                         |
| `convertImageToBase64`                | `async (uuid, file) → void`                                 | 读取文件并存入 DB                  |
| `stylishConfirm`                      | `(message) → Promise<bool>`                                 | 自定义确认弹窗                     |
| `removeTrailingSlash`                 | `(str) → string`                                            | 去除末尾斜杠                       |
| `escapeRegExp`                        | `(str) → string`                                            | 转义正则特殊字符                   |
| `waitForLock`                         | `() → Promise`                                              | 等待 `xianchengReleased` 事件      |
| `releaseLock`                         | `() → void`                                                 | 释放锁，dispatch 事件              |
| `acquireLock`                         | `() → void`                                                 | 获取锁（清除标志）                 |
| `addSmoothShakeEffect`                | `(el) → void`                                               | 600ms 正弦抖动动画                 |
| `generateRandomSeed`                  | `() → number`                                               | 随机整数种子                       |
| `isMobileDevice`                      | `() → bool`                                                 | UA 检测移动设备                    |
| `zhengmian`                           | `async (uuid, index) → string`                              | 获取正面提示词                     |
| `fumian`                              | `async (uuid, index) → string`                              | 获取负面提示词                     |
| `prompt_replace`                      | `async (prompt, rules, ctx?) → string`                      | 按规则数组替换提示词               |
| `prompt_replace_banana`               | `async (prompt, settings) → {prompt, negPrompt}`            | Banana 五段式提示词组合            |
| `prompt_replace_banana_for_character` | `(prompt, charSettings, name) → string`                     | Banana 分角色替换                  |
| `prompt_replace_for_character`        | `(prompt, rules, name) → string`                            | 通用分角色替换                     |
| `generateUniqueId`                    | `() → string`                                               | `Date.now(36) + random(36)`        |
| `extractPrompt`                       | `(prompt) → string`                                         | 透传（预留接口）                   |
| `request`                             | `({method,url,headers,data,responseType}) → Promise`        | fetch 包装                         |
| `getRequestHeaders`                   | `(csrfToken) → object`                                      | `{Content-Type, X-CSRF-Token}`     |
| `addLog`                              | `(msg) → void`                                              | 带时间戳写入日志并更新 textarea    |
| `clearLog`                            | `() → void`                                                 | 清空日志                           |
| `getLog`                              | `() → string`                                               | 获取全部日志文本                   |
| `processUploadedImage`                | `async (file, compress?) → dataUrl`                         | 读取文件为 dataUrl，移动端可压缩   |
| `processUploadedImageToBlob`          | `async (file) → Blob`                                       | 同上，返回 Blob                    |
| `removeThinkingTags`                  | `(text) → string`                                           | 移除 `<thinking>…</thinking>`      |
| `stripChineseAnnotations`             | `(text) → string`                                           | 反复删除 `（…）` 中文注释          |
| `convertImageToJpeg`                  | `async (src) → Blob`                                        | 任意格式转 JPEG（质量 0.98）       |
| `fixMp4Faststart`                     | `async (blob) → Blob`                                       | MP4 moov 前置修复                  |

---

## 6. 事件总线速查

事件通过 SillyTavern 的 `eventSource`（`../../../../script.js`）收发。
`EventType` 常量定义在 `./utils/config.js`。

| EventType 常量                  | 方向 | 触发方             | 监听方            | payload                                     |
| ------------------------------- | ---- | ------------------ | ----------------- | ------------------------------------------- |
| `GENERATE_IMAGE_REQUEST`        | emit | `generation.js`    | `imageQueue.js`   | `{ requestId, prompt, negPrompt, options }` |
| `GENERATE_IMAGE_RESPONSE`       | emit | 各平台 API 模块    | `generation.js`   | `{ requestId, dataUrl, isVideo, error? }`   |
| `js_generation_ended`           | emit | 插件内部           | `autoLLMClick.js` | —                                           |
| `st_chatu8_auto_click_complete` | emit | `taskQueue` 完成时 | `promptReq.js`    | `{ taskId, result }`                        |
| ST `GENERATION_STARTED`         | on   | SillyTavern 核心   | `autoLLMClick.js` | —                                           |
| ST `GENERATION_ENDED`           | on   | SillyTavern 核心   | `autoLLMClick.js` | —                                           |

---

## 7. Settings 字段表

以下字段存储于 `extension_settings[extensionName]`：

| 字段名                        | 类型        | 说明                                           |
| ----------------------------- | ----------- | ---------------------------------------------- |
| `scriptEnabled`               | bool/string | 插件总开关                                     |
| `sd_auth`                     | string      | SD WebUI 的 `user:password`（Base64 前的原文） |
| `llm_history_depth`           | number      | 构建 LLM 上下文时包含的历史消息层数（默认 0）  |
| `imageGenDemandEnabled`       | bool        | 是否在生图前弹出用户需求输入框                 |
| `imageGenDemand`              | string      | 默认生图需求文本                               |
| `regexTestMode`               | bool        | 正则测试模式（只展示 Prompt，不发 LLM 请求）   |
| `zidongdianji`                | string/bool | 自动批量生图开关（`'true'`/`true`）            |
| `zidongdianji2`               | string/bool | 连续自动生图开关                               |
| `chatu8_video_paths.idle`     | string      | 静息视频路径                                   |
| `chatu8_video_paths.dragging` | string      | 拖拽视频路径                                   |
| `log`                         | string      | 累积日志文本（`addLog` 写入）                  |

---

## 8. 扩展开发指引

### 8.1 添加新的生图后端

1. 在 `utils/` 创建 `replaceWithXxx.js`，实现 `replaceWithXxx()` 函数
2. 在 `index.js` 的 `chenk()` 中加入调用
3. 在 `imageQueue.js` 中监听 `EventType.GENERATE_IMAGE_REQUEST`，路由到你的后端
4. 完成后 emit `EventType.GENERATE_IMAGE_RESPONSE`

### 8.2 在提示词流程中插入自定义处理

在 `promptReq.js` 的 `handlePromptRequest` 中，Step 5（`replaceAllPlaceholders`）之后、Step 8（`LLM_IMAGE_GEN`）之前插入：
```javascript
// 在 replaceAllPlaceholders 返回后
messages = await myCustomProcessor(messages, { uuid, context, userDemand });
```

### 8.3 扩展编辑对话框

`dialogs.js` 的 `showEditDialog` 接收 `imgEl` 和 `buttonEl`，在对话框关闭时会调用 `_triggerGeneration(buttonEl)`（由 `setTriggerGeneration` 注入）。

若需要在对话框中加按钮，在 `showEditDialog` 内找到 `createButtonContainer` 调用处，追加新按钮即可。

### 8.4 自定义日志面板

日志写入 `extension_settings[extensionName].log`，同时同步到 `#ch-log-textarea`。
可通过 `getLog()` / `clearLog()` 读写，也可监听该 textarea 的值变化做自定义展示。

### 8.5 访问已生成图片

当前 v2.7.7 bundle 不能再概括为“只使用 Stego PNG”。源码中存在 `getItemImg`、`getItemBlob`、`getMergedAndSortedImages`、`dbs` 以及 server/db 媒体分支，说明图片本体由插件的缓存/数据库/服务器层管理。标签位置和锁定元数据则由 `extra.images` / `image_groups` 管理。

```
生图完成
  → 插件媒体缓存/数据库/服务器层保存或读取 imageData
  → `saveImageGroup` 保存标签、regex、位置和锁定元数据
  → 原生路径写入 `chat[mesId].extra.images[swipeId]`
       非标准元素回退到 `chatMetadata['st-chatu8'].data.image_groups`
```

读取已生成图片：

```javascript
import { getItemImg, getItemBlob } from './database.js';

// 依据插件的 tag/link 读取当前媒体
const [dataUrl, changeData, negPrompt, isVideo, origUrl] = await getItemImg(tagOrLink);

// 获取当前媒体 Blob（用于下载或处理）
const blob = await getItemBlob(tagOrLink, index);
```

当前图片显示路径主要依据按钮的 `data-link` / tag 查找媒体；`messageId`、`swipeId` 用于查找对应的 `extra.images` 元数据。不要把旧版 `dataset.uuid` 规则当作当前唯一身份。

> **外部 UI 注意：** `chatMetadata['st-chatu8'].data.image_groups` 是非标准元素场景的后备元数据；当前原生路径优先读取 `chat[mesId].extra.images[swipeId]`。媒体本体应通过插件的 `getItemImg` / `getItemBlob` / `dbs` 路径解析，不要依据旧版 Stego-only 描述另造第二套持久化真相。

### 8.6 锁机制使用

插件用 `window.xiancheng` 状态 + `xianchengReleased` 事件实现软锁：

```javascript
import { waitForLock, acquireLock, releaseLock } from './utils.js';

acquireLock();          // 获取锁（设 window.xiancheng = false）
try {
    // ... 临界区操作 ...
} finally {
    releaseLock();      // 释放锁（设 window.xianchengReleased = true 并 dispatch 事件）
}

// 等待锁释放
await waitForLock();
```

---

## 9. 与外部 UI 适配的注意事项

本节专为在 iframe 内渲染自定义 UI、同时希望消费插件生图结果的开发者准备。内容基于实测日志总结，不是设计意图描述。

---

### 9.1 插件的两套存储路径

插件在保存图片引用时有两条路径，触发条件不同：

| 条件 | 当前主要写入位置 |
| --- | --- |
| 找到宿主 `.mes_text` 与有效 `mesid` | `chat[mesId].extra.images[swipeId]`，并保留正文中的 image tag |
| 无法按宿主楼层保存或属于非标准元素 | `chatMetadata['st-chatu8'].data.image_groups` |

**当前判定代码（逻辑还原自 `saveImageGroup`）：**
```javascript
if (mesTextElement && mesId有效 && chat[mesId]) {
    chat[mesId].extra.images[swipeId] = imageRecords;
    saveChatConditional();
} else {
    saveToMetadata(imageRecords, logicalText);
}
```

---

### 9.2 图片实体存储：插件缓存/数据库/服务器层

当前 bundle 中的媒体读取代码同时出现 db/server 分支：

```
getItemImg(tagOrLink)
  → getMergedAndSortedImages(MD5(tagOrLink))
  → server path 或 db uuid
  → 返回图片/视频媒体供 createAndShowImage 使用
```

外部 UI 不应根据旧版 Stego-only 结论创建并维护另一套图片本体。画廊只保存轻引用，媒体显示时向宿主原生节点或插件缓存解析。

---

### 9.3 `generate-image-request / response` 事件的时序陷阱

当前 `triggerGeneration` 会先注册 `generate-image-response` 监听，再发出 `generate-image-request`。外部 UI 仍需处理事件与宿主 DOM 渲染不同步，但不能把旧版“response 早于 request”的描述当作当前源码契约。

```
generation.js emit GENERATE_IMAGE_REQUEST
     ↓
后端返回图片
     ↓
emit GENERATE_IMAGE_RESPONSE
     ↓
查找宿主 `data-request-id` 对应的 span/button
```

外部 UI 应先登记 pending task，并以 `response.id`、宿主 `data-request-id`、`data-link` 和楼层身份做兜底关联。不要依赖旧版 `data-stable-id`。

**实测成功路径（DOM fallback）：**
```
request-received
  → 记录 id / prompt / messageId
  → response-received
  → 查找宿主 [data-request-id]
  → 读取插件媒体并刷新 gallery 轻引用
  → CHARACTER_MESSAGE_RENDERED / DOM mutation 后再次 reconcile
```

iframe 内元素仍应保留可回溯的楼层身份，但当前插件图片占位符的直接关联字段是 `data-request-id`、`data-link` 和宿主 `mesid`。

---

### 9.4 `extra.images` 的写入竞争

当前 `saveImageGroup` 会保留已锁定记录，再用新的匹配结果覆盖当前 `extra.images[swipeId]`：

```javascript
const locked = oldImages.filter(item => item.locked === true);
extra.images[swipeId] = [...locked, ...newImages];
```

外部 UI 若把自己的 gallery 记录写入 `extra.images`，下次 `saveImageGroup` 可能覆盖这些非插件记录。

**规避方式：** 外部 UI 自己的引用放在自己的状态层；`extra.images` 只读为插件原生元数据，不要把 gallery 记录写回去。

---

### 9.5 `chatMetadata['st-chatu8']` 是后备元数据层

原始文档和部分分析中提到 `chatMetadata['st-chatu8']` 作为插件缓存来源，但实测结论是：

- **原生路径**（找到宿主 `mes_text`）：优先写 `chat[mesId].extra.images[swipeId]`
- **fallback 路径**（无法使用宿主楼层）：写 `chatMetadata['st-chatu8'].data.image_groups`

因此外部 UI 若用 `readChatu8CacheEntries(messageId)` 读 `chatMetadata['st-chatu8']` 来获取已生成图片，在原生触发场景下永远读不到数据。正确的消费方式是：

1. 优先读 `chat[mesId].extra.images[swipeId]`
2. 次选解析 `chat[mesId].mes` 中的 image tag 标记
3. 最后兜底 `chatMetadata['st-chatu8'].data.image_groups`

---

### 9.6 当前按钮恢复机制

当前 `findAndReplaceInElement` / `getSavedImageMatches` 会检查已处理元素、现有 `button.image-tag-button`、`data-link` / `data-image-tag` 和 `extra.images` / `image_groups`，缺少按钮时重新定位并注入：

```
button.image-tag-button[data-link="..."]
button.image-tag-button[data-image-tag="..."]
```

这意味着 `extra.images` 除了作为图片引用存储，还是**按钮恢复的数据源**。外部 UI 不应随意清空或覆盖它，否则会导致刷新后按钮无法恢复。

---

### 9.7 fuzzy match 分数对自动生图数量的影响

`insertImagesIntoElement` 用模糊匹配将 AI 生成的 regex 锚点对应到正文中的实际句子。当 AI 返回的 regex 和正文的实际措辞差距较大时，匹配分数可能很低（< 30%），导致：

- 对应 tag 插入位置错误（锚定到不相关的段落）
- 对应按钮可能未被渲染（或被渲染在错误位置）
- `自动批量生图` 只触发部分按钮（实测 4 张图只触发了 2 张）

**对外部 UI 的影响：** `beginPendingImageTask` / `markRecentImageIntent` 的调用时机应在 LLM 返回并确认有效图片数量之后，而不是在 LLM 请求发出时，否则预注册的 task 数量与实际触发的 request 数量不一致。

---

### 9.8 分阶段标志矩阵：regex、tag、requestId 和媒体节点

当前 v2.7.7 bundle 的图片身份不是单层结构：

| 阶段 | 标志 | 作用 | 是否证明图片已生成 |
| --- | --- | --- | --- |
| LLM 指令 | `<images>`、`<image>`、`regex`、`tag` | 描述插图位置和提示词 | 否 |
| 正文标签 | `image###...###`、`<image>...</image>` | 保留图片意图或历史标签 | 否 |
| DOM 占位 | `button.image-tag-button`、`.st-chatu8-image-span` | 建立插件交互节点 | 否 |
| DOM 关联 | `data-link`、`data-image-tag`、`data-request-id` | 关联提示词、标签和响应 | 否 |
| 请求中 | `data-loading="true"` | 防止重复触发 | 否 |
| 响应后 | `generate-image-response.id` | 找到 span/button 并调用 `createAndShowImage` | 响应成功时是 |
| 媒体节点 | `.st-chatu8-image-container` + `img/video` | 当前可见媒体 | 是 |
| 持久化 | `extra.images[swipeId]`、`image_groups` | 保存标签、regex、位置和锁定状态 | 不一定 |

`createButtonAtPosition` 当前把规范化 tag 传入 `generateStableId()`，并把结果写入 `data-request-id`。该稳定 ID 是 tag-hash，不包含 `mesid`、`messageId` 或 `swipeId`，所以外部适配器不能把 `requestId` 单独当作全局唯一图片身份。推荐结构：

```ts
type Chatu8ImageRef = {
  messageId: number;
  swipeId: number;
  regex?: string;       // 正文匹配锚点
  tag?: string;         // 图片标签
  link?: string;        // 实际提示词
  requestId?: string;   // DOM/response 关联
  imageId?: string;     // 缓存兼容字段
};
```

`regex` 不能被降级为 `promptToken`，`tag/link` 不能被 `src` 替代，`src/imageData` 只能作为当前显示证据。当前 bundle 没有 `data-stable-id` 和 `image-tag-placeholder`；相关选择器只允许作为旧版本兼容路径。

对于只复制已生成图片的外部 UI，判定顺序应为：

1. 按 `messageId + swipeId + requestId` 找到宿主 span/button。
2. 在 span/container 下找到 `img/video`，找到后只复制显示。
3. 没有媒体时，再用 `tag/link` 查询插件缓存。
4. 只有正文 token 或 regex 时，只建立 pending 引用，不主动发出 `generate-image-request`。

这里的“不主动发出”只表示外部画廊不实现第二套生图入口；如果用户操作被代理到插件原生按钮或媒体节点，插件仍可能按其自身协议执行生图。Beta 的动作日志只证明派发到达目标，不能单独证明插件业务回调已经完成。

---

```
index.js
  ├── utils/config.js          (extensionName, defaultSettings, EventType)
  ├── utils/database.js        (getItemImg, setItemImg, dbs...)
  ├── utils/sd|novelai|banana|comfyui.js
  ├── utils/ui.js              (initUI)
  └── utils/newline_fix.js     (initializeNewlineFixer)

iframe/chatProcessor.js
  └── iframe/placeholder.js

iframe/placeholder.js
  ├── iframe/generation.js
  └── iframe/dialogs.js

iframe/generation.js
  ├── iframe/imageQueue.js
  ├── iframe/dialogs.js
  └── iframe/imagePreview.js   (via setShowImagePreview callback)

iframe/autoLLMClick.js
  └── iframe/promptReq.js      (handlePromptRequest)

iframe/promptReq.js
  ├── settings/llmService.js   (buildPromptForRequestType)
  ├── settings/worldbook.js    (generateCharacterListText...)
  ├── llmRequest.js            (LLM_IMAGE_GEN...)
  ├── worldbookProcessor.js    (processWorldBooksWithTrigger)
  ├── chatDataUtils.js         (getElContext...)
  ├── imageInserter.js         (parseImagesFromPrompt, insertImagesIntoElement)
  ├── promptProcessor.js       (replaceAllPlaceholders, mergeAdjacentMessages)
  └── debugLogger.js

iframe/dialogs.js
  ├── imageInserter.js
  └── iframe/comfyuiInpaint.js | novelaiInpaint.js | gorkVideo.js

iframe/imagePreview.js
  ├── utils/database.js
  ├── iframe/generation.js     (createAndShowImage)
  └── iframe/utils.js          (fixMp4Faststart)
```

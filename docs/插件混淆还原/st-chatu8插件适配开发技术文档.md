# st-chatu8 插件开发参考手册

> 本文档由逆向还原结果整理，供二次开发者理解插件架构、扩展功能或做兼容适配使用。
> 还原文件位于 `iframe/` 目录（相对于插件根目录）。
>
> **修订记录**
> v1.1（2026-03-20）：根据无 UI 原生生图日志实测，修订图片存储机制描述（Stego PNG 而非 IndexedDB）、`saveImageGroup` 路径判定条件、`extra.images` 写入时机、`chatMetadata` fallback 触发条件，并新增第 9 节"与外部 UI 适配的注意事项"。

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
    ├── database.js    ← 图片持久化层：Stego PNG 隐写存储（getItemImg, setItemImg, ...）
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
      渲染图片到 DOM，写入持久化存储 (setItemImg → Stego PNG)
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

### 4.3 `placeholder.js` — 按钮注入

**`findAndReplaceInElement(element, displayMode?)`**
主入口。扫描 element 内的文本节点，找到所有 `<tag>` 格式的图片标签位置，逐一调用 `createButtonAtPosition`。

**`createButtonAtPosition(insertPosition, tagContent, nodeList, doc, element, settings, autoTrigger, displayMode)`**
在精确字符偏移处注入按钮：
```html
<span class="st-chatu8-image-container">
    <button class="生成图片">生成图片</button>
</span>
```

**`getSavedImageMatches(rawText, element, processedText, searchOffset?)`**
返回已匹配的图片标签位置数组，用于恢复已有图片的按钮状态。

---

### 4.4 `generation.js` — 生成与渲染

**`triggerGeneration(buttonEl)`**
```
1. 防重入检查 (isGenerating)
2. 读取 button.dataset: { uuid, link, tag, index }
3. 检查持久化缓存 (getItemImg) → 有缓存则直接渲染（从 Stego PNG 读取）
4. 无缓存 → emit EventType.GENERATE_IMAGE_REQUEST
5. 监听 EventType.GENERATE_IMAGE_RESPONSE → createAndShowImage
6. 超时 60s → 自动清理
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

**数据来源：** `dbs.getMergedAndSortedImages(md5(uuid))`
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

插件的图片持久化**不使用浏览器 IndexedDB**，而是通过隐写术（Steganography）将图片 base64 编码藏在一张服务端 PNG 图里：

```
生图完成
  → database.js :: setItemImg(uuid, index, imageData)
  → 上传到 /user/images/chatu8List/图片缓存列表.png（Stego PNG）
  → 引用写入 chat[mesId].mes（insertOriginalText 模式）
       或写入 chatMetadata['st-chatu8']（非 mes_text 触发时的 fallback）
```

读取已生成图片：

```javascript
import { getItemImg, getItemBlob } from './database.js';

// 获取某条消息的第 N 张图片的 data URL（从 Stego PNG 解码）
const [dataUrl, changeData, negPrompt, isVideo, origUrl] = await getItemImg(uuid, index);

// 获取 Blob（用于下载或处理）
const blob = await getItemBlob(uuid, index);
```

`uuid` 来自按钮元素的 `dataset.uuid`，即消息标识（通常对应 `mesId`）。

> **外部 UI 注意：** `chatMetadata['st-chatu8']` 只是 fallback 路径（非 `mes_text` 触发时才会写入）。原生路径的图片引用在 `chat[mesId].mes` 的 image tag 标记中，图片实体在 Stego PNG 里，不在浏览器 IndexedDB。若外部 UI 有自己的 IndexedDB 方案，两套存储完全独立，需单独协调写入时机（详见第 9 节）。

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

| 条件                                                                                                 | 路径                      | 写入位置                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| 触发元素是宿主原生 `mes_text`（`ownerDocument = 主文档`）                                            | `insertOriginalText` 模式 | `chat[mesId].mes`（正文）+ Stego PNG（图片实体）  |
| 触发元素是 iframe 内元素（`assistant-body` / `html-body` 等），且关联的 `chat[mesId].mes` 长度 < 100 | fallback 模式             | `chatMetadata['st-chatu8']`（仅引用，无图片实体） |

**判定代码（`imageInserter.js :: saveImageGroup`）：**
```javascript
// 伪代码还原
if (insertOriginalText && mesId有效 && chat[mesId].mes.length >= 100) {
    // 写 chat[mesId].mes
} else {
    // 写 chatMetadata['st-chatu8']  ← fallback
}
```

实测中 iframe 内元素触发时，`chatDataUtils` 向上查找宿主 `mes_text` 拿到的 mesId 有时对应一条极短的系统消息（长度 9），直接触发 fallback。

---

### 9.2 图片实体存储：Stego PNG，不是 IndexedDB

插件的 `database.js` **不使用浏览器 IndexedDB**。图片实体通过隐写术编码后上传到服务端：

```
setItemImg(uuid, index, base64)
  → 编码追加到 Stego PNG
  → PUT /user/images/chatu8List/图片缓存列表.png
```

外部 UI 若实现了自己的 `IndexedDB` 存储方案（如 `chatu8-ui-image-store`），和插件存储**完全独立**，需要自行在 `generate-image-response` 事件里写入。

---

### 9.3 `generate-image-request / response` 事件的时序陷阱

插件的生图流程中，`generate-image-response` 经常**早于** `generate-image-request` 到达监听方：

```
generation.js emit GENERATE_IMAGE_REQUEST
     ↓ (几乎同时)
NovelAI / SD 后端返回图片
     ↓
emit GENERATE_IMAGE_RESPONSE  ← 可能先到达外部监听方
     ↓ (之后才)
外部 UI 的 generate-image-request 监听注册完成
```

原因：插件在按钮点击后立即 emit request，但外部 UI（如 `useStreamingDemo.ts`）的 `imagePendingTaskManager` 需要先通过 `beginPendingImageTask` 注册 task，才能在收到 request 时绑定 messageId。如果 response 先到，必须走 `bufferedResponse` 重放路径，或 DOM fallback 兜底（依赖元素上存在 `data-message-id` 属性）。

**实测成功路径（DOM fallback）：**
```
response-unmatched（response 先到，无匹配 task）
  → 等待 request 事件到达
  → request-fallback-dom（从 DOM 找 [data-message-id]）
  → request-received（targetMessageId 绑定成功）
  → request-replay-buffered-response
  → persist-begin → idb-store-success → persist-success
```

**前提条件：** iframe 内的 `assistant-body` 元素必须带有正确的 `data-message-id` 属性，且值与宿主 `chat` 数组里的实际 mesId 一致。

---

### 9.4 `extra.images` 的写入竞争

`insertImagesIntoElement` 在 `insertOriginalText` 模式下会主动清空旧的 `extra.images`：

```javascript
// imageInserter.js 内
console.log('[imageInserter] insertOriginalText: clearing old extra.images[0] to avoid conflict');
```

外部 UI 若在 `persist-success` 之后将图片引用写入 `extra.images`，下次用户再次触发图片生成时，这些引用会被插件清空覆盖。

**规避方式：** 不要以 `extra.images` 作为外部 UI 图片引用的唯一来源；自建引用层（如写入 `data.stream_demo.generated_images`）并在每次 `saveImageGroup` 事件后重新 merge。

---

### 9.5 `chatMetadata['st-chatu8']` 不是主存储层

原始文档和部分分析中提到 `chatMetadata['st-chatu8']` 作为插件缓存来源，但实测结论是：

- **原生路径**（宿主 `mes_text` 触发）：**不写** `chatMetadata`，写 `chat[mesId].mes`
- **fallback 路径**（iframe 元素触发 + mes 过短）：才写 `chatMetadata['st-chatu8']`

因此外部 UI 若用 `readChatu8CacheEntries(messageId)` 读 `chatMetadata['st-chatu8']` 来获取已生成图片，在原生触发场景下永远读不到数据。正确的消费方式是：

1. 优先读 `chat[mesId].extra.images`（原生路径的结果）
2. 次选解析 `chat[mesId].mes` 中的 image tag 标记
3. 最后兜底 `chatMetadata['st-chatu8']`（仅 fallback 场景有数据）

---

### 9.6 `placeholder.js` 的按钮恢复机制

每 4s 轮询时，`placeholder.js` 会检查已处理元素是否还有按钮。若元素被标记处理过（`data-chatu8-processed`）但找不到按钮，会尝试从 `chat[mesId].extra.images[0]` 里恢复 tag 列表并重新注入按钮：

```
[iframe] Element marked processed but no buttons found, re-processing
[iframe] Matched from chat[4].extra.images[0], tags: 4
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

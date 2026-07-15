# st-chatu8 v2.7.7 当前源码核对

> 核对对象：`st-chatu8/st-chatu8/index.js`、`manifest.json`。<br>
> 当前 bundle：仓库 `29c79ed`，manifest 版本 `2.7.7`。<br>
> 说明：插件目前发布的是混淆 bundle，下面的“组件”是从 bundle 的 `__esm` 模块标记、函数名、字符串常量和调用关系中还原出的逻辑组件，不代表仓库中仍存在同名源码文件。

> 本轮 Beta 审计边界：DOM/身份/事件关系属于当前 bundle 核对结论；1200ms 是当前 pre 桥接和本轮 Beta 设备日志采用的测试契约。当前混淆 bundle 文本无法直接证明这个数值，仓库中的 `utils/iframe/generation.js`、`placeholder.js` 是旧版可读化参考，其中的 500ms 不能反推 v2.7.7 当前运行时。

## 1. 结论摘要

当前插件仍分成两条相互衔接的链路：

1. LLM 生图提示词链路：`ch-llm-image-gen-request` / `ch-llm-image-gen-response`、`parseImagesFromPrompt`、`insertImagesIntoElement`、`saveImageGroup`。
2. 真实图片链路：宿主原生按钮触发 `generate-image-request`，后端返回 `generate-image-response`，再由 `createAndShowImage` 把图片或视频放回原生楼层 DOM。

画廊可以复制“显示结果”，但不能把复制出来的 `<img>` 当成插件原生交互节点。插件交互绑定在宿主楼层的按钮、span、`mesid`、`data-link` 和图片缓存身份上。

## 2. 组件与当前代码依据

| 逻辑组件 | 当前 bundle 中的函数/字符串 | 代码行为 | 对外部 UI 的含义 |
| --- | --- | --- | --- |
| 提示词图片标签解析 | `parseImagesFromPrompt`、`insertImagesIntoElement` | 解析 `<images>` / `<image>` 结果，按 `regex` / `tag` 找正文位置 | 不能只等真实图片 `src`，占位阶段就要建立引用 |
| 标签位置与按钮恢复 | `findAndReplaceInElement`、`getSavedImageMatches`、`createButtonAtPosition` | 扫描 `.mes_text` 及 iframe 文档，依据 `extra.images` / `image_groups` 恢复按钮 | 宿主 `.mes_text` 是原生定位源 |
| 图片组保存 | `saveImageGroup`、`saveToMetadata` | 优先保存到 `chat[mesId].extra.images[swipeId]`；非标准元素回退到 `chatMetadata['st-chatu8'].data.image_groups` | `extra.images` 是当前首选元数据来源 |
| 生图触发 | `triggerGeneration` | 读取按钮 `dataset.link` 与 `dataset.requestId`，发出 `generate-image-request` | 画廊不能仅凭自己的副本触发插件逻辑 |
| 响应渲染 | `createAndShowImage` | 找到所有匹配 `data-request-id` 的 span/button，将 `imageData` 渲染为图片或视频 | 响应后仍必须回到宿主 DOM |
| 图片缓存/媒体读取 | `getItemImg`、`getItemBlob`、`getMergedAndSortedImages`、`dbs` | 依据 tag/link 读取插件缓存、数据库或服务器媒体 | 画廊不应另建第二套图片本体存储 |
| 锁定与删除 | `lockTagForElement`、`unlockTagForElement`、`deleteTagForElement`、`deleteImagesForElement` | 围绕宿主 `.mes_text`、`mesid`、`extra.images`、`lockedTags` 修改 | 交互应代理到宿主原生节点 |
| 图片手势 | `createAndShowImage`、`createButtonAtPosition` | 图片预览、双击再生图、长按编辑；占位按钮单击生图、长按编辑 | 克隆 `<img>` 不会继承这些监听器 |
| 通用点击触发 | `handleDoubleClick`、`initDocumentGestureEvents` | 独立于图片生成；通用点击会排除 `IMG`、`BUTTON` 等元素 | 不要把通用三连击误当成图片生成协议 |

## 3. 当前原生 DOM 结构

`createButtonAtPosition` 当前会写入与请求绑定的按钮和 span，逻辑结构可表示为：

```html
<button
  class="image-tag-button st-chatu8-image-button"
  data-link="<tag>"
  data-image-tag="<tag>"
  data-request-id="chatu8-id-...">
  生成图片
</button>
<span
  class="st-chatu8-image-span"
  data-request-id="chatu8-id-..."></span>
```

当前源码中没有 `data-stable-id` 字符串，也没有 `image-tag-placeholder` 类名。去重标记使用：

```text
data-tag-inserted-chatu8-id-...
```

图片生成完成后，`createAndShowImage` 会在上述 span 内放入 `.st-chatu8-image-container`，其中是 `<img>` 或 `<video>`；开启折叠时还会包裹 `.st-chatu8-collapse-wrapper`。

## 4. 当前事件协议

当前 `triggerGeneration` 的结构化伪代码如下：

```ts
const prompt = button.dataset.link;
const requestId = button.dataset.requestId;

eventEmit('generate-image-request', {
  id: requestId,
  prompt,
  width,
  height,
  change,
  retouchPrompt,
  retouchImage,
  videoPrompt,
  videoImage,
});
```

响应监听器按 `response.id === button.dataset.requestId` 过滤，当前使用的字段包括：

```ts
{
  id,
  success,
  imageData,
  error,
  prompt,
  change,
  isVideo,
  format,
  originalUrl,
}
```

`imageData` 仍是当前渲染入口，但不能再文档化为“永远是纯 base64”：当前代码同时处理 data URL、视频、原始 URL 和缓存读取结果。

## 5. 当前持久化与媒体真相

标签/位置元数据的优先级：

1. `chat[mesId].extra.images[swipeId]`
2. `chat[mesId].mes` 中的 `image###...###` 或 `<image>...</image>` 标签
3. `chatMetadata['st-chatu8'].data.image_groups`
4. 宿主 `.mes_text` 中的原生按钮、span、图片容器

`getcharData` / `setcharData` 当前直接访问：

```text
chatMetadata['st-chatu8'].data[键]
```

真实图片媒体则由 `getItemImg`、`getItemBlob`、`dbs.getMergedAndSortedImages` 等缓存/数据库/服务器路径读取。`extra.images` 和 `image_groups` 主要保存标签、正则、位置和锁定状态，不能等同于图片二进制。

## 6. 当前图片交互

### 6.1 已渲染图片

`createAndShowImage` 在图片或视频容器上注册：

- 单击：根据 `clickToPreview` 设置打开插件预览。
- 两次 `click`：在 `dbclike === 'true'` 且存在关联按钮时调用 `triggerGeneration(button)`；这是插件内部 click-click 计时协议，不是原生 `dblclick` 事件。
- 长按：在 `longPressToEdit === 'true'` 时调用 `showEditDialog(image, button)`；本轮 pre 桥接以 1200ms 作为实测契约，数值本身不从当前混淆 bundle 文本直接断言。
- 移动端同时监听 `touchstart` / `touchend` / `touchcancel`。

因此，外部 UI 若要把成品图的“双击重生图”交回当前插件，目标必须是插件实际绑定的 `<img>` / `<video>` 节点，并在同一节点上依次派发两次 `click`。单独派发 `dblclick` 即使 `dispatchEvent()` 返回成功，也不会命中这里的重生分支；事件返回值只代表 DOM 派发成功，不代表插件业务回调已执行。

### 6.2 图片占位按钮

`createButtonAtPosition` 为按钮注册：

- 单击：直接 `triggerGeneration(button)`。
- 长按：在设置允许时调用 `showEditDialog(null, button)`；本轮 pre 桥接以 1200ms 作为实测契约，旧版可读化文件中的 500ms 仅作历史参考。
- `mousedown`、`mouseup`、`mouseleave`、`touchstart`、`touchend`、`touchcancel` 均参与取消或确认长按。

manifest 的“手机双击改为三次点击”属于通用点击触发功能。当前 `handleDoubleClick` 明确排除 `IMG`、`BUTTON`、`VIDEO` 等元素，不能把它与图片本身的双击再生图混为一谈。

## 7. same-layer / same-layer-pre 接入规则

画廊轻引用至少应保留：

```ts
type Chatu8ImageRef = {
  messageId: number;
  swipeId: number;
  tag?: string;
  link?: string;
  requestId?: string;
};
```

其中 `src`、`imageData`、Blob、IndexedDB key 只能作为当前显示缓存，不应成为 UI 自己的持久化真相。

交互处理优先级：

1. 通过 `messageId + swipeId + tag/link + requestId` 找到宿主原生按钮或图片。
2. 画廊卡片只做视觉副本，点击/长按/双击转发到该宿主节点。
3. 宿主节点不存在时显示占位态并等待 `CHARACTER_MESSAGE_RENDERED`、`generate-image-response` 或 DOM mutation 后再解析。
4. 不在画廊复制一套 `triggerGeneration`、图片缓存和锁定状态。

同层 UI 自己创建的 clone 不会被插件的 `processMesTextElements` 自动处理；插件扫描的是宿主 `.mes_text` 及其关联 iframe 文档。因此“复制数据属性让插件重新绑定”不是可靠方案，代理到仍连接的宿主原生节点才是首选。

## 7.1 生图链路的分阶段身份标志

当前 bundle 并不是从提示词到图片始终使用同一个 ID。不同阶段的标志含义如下：

| 阶段 | 当前标志 | 含义 |
| --- | --- | --- |
| LLM 图片指令 | `ch-llm-image-gen-request/response`、`<images>`、`<image>`、`regex`、`tag` | 临时描述“在哪一段插图、使用什么提示词” |
| 正文持久化 | `image###...###`、`<image>...</image>` | 正文中的图片标签，不代表媒体已经生成 |
| 原生占位 | `button.image-tag-button`、`.st-chatu8-image-button`、`.st-chatu8-image-span` | 插件已经识别标签并建立了交互节点 |
| 占位身份 | `data-link`、`data-image-tag`、`data-request-id` | 提示词、标签和 DOM 响应关联 |
| 去重状态 | `data-tag-inserted-chatu8-id-*` | 当前正文根节点的标签处理标记 |
| 请求中 | `data-loading="true"` | 按钮正在等待生图请求 |
| 响应回填 | `generate-image-response.id` | 插件按 ID 找到 span/button 并调用 `createAndShowImage` |
| 已有媒体 | `.st-chatu8-image-container` 下的 `<img>` / `<video>` | 图片或视频已写入 DOM |
| 持久化记录 | `extra.images[swipeId]`、`image_groups` | 标签、regex、位置、锁定等元数据 |
| 缓存媒体 | `getItemImg(tag)`、`getItemBlob`、`getMergedAndSortedImages` | 根据 tag/link 或缓存键取实际媒体 |

### `requestId` 不是完整的全局图片身份

当前 `createButtonAtPosition` 会把规范化后的 tag 传给 `generateStableId`，再将结果同时写入按钮和 span 的 `data-request-id`。`generateStableId` 是对 tag 文本做哈希并添加 `chatu8-id-` 前缀；它没有使用 `mesid`、`swipeId` 或时间戳。

因此，当前 `requestId` 更接近“该 tag 的 DOM/响应关联标志”，不是严格意义上某一楼层某一次请求的全局唯一 ID。同一个 tag 出现在多个楼层时，可能得到相同的 `requestId`；响应处理又会在主文档和可访问 iframe 中查找所有相同 ID 的 span/button。

外部 UI 不应单独用 `requestId` 去合并图片，至少应使用：

```ts
messageId + swipeId + requestId
```

更完整的轻引用应保留：

```ts
type Chatu8ImageRef = {
  messageId: number;
  swipeId: number;
  regex?: string;       // 正文定位锚点
  tag?: string;         // 图片标签/逻辑身份
  link?: string;        // 传给生图的实际提示词
  requestId?: string;   // DOM/response 关联标志
  imageId?: string;     // 仅作为缓存或兼容字段
};
```

`regex`、`tag/link`、`requestId` 分属不同阶段，不能互相替代。当前 bundle 没有 `data-stable-id` 字符串，也没有 `image-tag-placeholder` 类名；这两个名称只能作为旧版兼容标志，不能作为 v2.7.7 的首选标志。

## 8. 当前源码证据索引

以下名称可直接在当前 `index.js` 中检索：

```text
EventType / generate-image-request / generate-image-response
parseImagesFromPrompt
insertImagesIntoElement
findAndReplaceInElement
getSavedImageMatches
createButtonAtPosition
triggerGeneration
createAndShowImage
getItemImg / getItemBlob / getMergedAndSortedImages
saveImageGroup / saveToMetadata
getcharData / setcharData
lockTagForElement / unlockTagForElement / deleteTagForElement
handleDoubleClick / initDocumentGestureEvents
st-chatu8-image-span
st-chatu8-image-container
st-chatu8-image-button
image-tag-button
data-request-id / data-link / data-image-tag
```

旧的 `docs/插件混淆还原/st-chatu8/utils/iframe/generation.js` 与 `placeholder.js` 仍可作为历史结构参考，但其中的 `data-stable-id`、`image-tag-placeholder` 和 Stego-only 图片存储描述不适用于当前 v2.7.7 bundle。

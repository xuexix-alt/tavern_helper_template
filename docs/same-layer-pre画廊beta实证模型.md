# same-layer-pre 画廊 beta 实证模型

> 当前依据：`st-chatu8` v2.7.7 bundle。详细函数、组件和源码检索项见 [`st-chatu8-v2.7.7-当前源码核对.md`](插件混淆还原/st-chatu8-v2.7.7-当前源码核对.md)。本轮全部证据、手工结果和误判修正见 [`same-layer-pre画廊beta全量审计说明.md`](same-layer-pre画廊beta全量审计说明.md)。

这个 beta 不是同层图片持久化的新实现，而是验证 pre 能否在不复制图片本体的前提下，按 st-chatu8 原生身份复刻可见图片，并把点击、双击、移动端长按交回宿主插件 DOM。

## 事件模型

```ts
eventOn(tavern_events.MESSAGE_UPDATED, id => refreshImageRef(id));
eventOn(tavern_events.MESSAGE_EDITED, id => refreshImageRef(id));
eventOn(tavern_events.USER_MESSAGE_RENDERED, id => hydrateImageDom(id));
eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, (id, type) => hydrateImageDom(id));
```

`MESSAGE_UPDATED` / `MESSAGE_EDITED` 只负责按 messageId 定向刷新轻引用。`USER_MESSAGE_RENDERED` / `CHARACTER_MESSAGE_RENDERED` 说明宿主楼层 DOM 可能刚落地，因此先扫一次，再用延迟二扫抓插件后续补上的按钮或图片节点。画廊关闭时只记录脏事件；打开时用 `reason=drawer_open` 做一次懒扫描。

实际插件链路还应监听 `generate-image-request` / `generate-image-response`，以及当前源码中仍保留的 `regex-st-chatu8-test-message`、`regex-st-chatu8-result-message`、`st_chatu8_auto_click_complete`。这些事件分别对应提示词解析、真实图片请求/响应和自动点击完成，不应互相替代。

## 原生真相顺序

生成请求只负责拿结果。持久化真相按插件原生路径查，不把图片体积塞进 same-layer-pre：

1. `chat[messageId].extra.images[swipeId]`
2. 消息正文里的 `image###...###` 或 `<image>...</image>` 标签
3. `chatMetadata['st-chatu8'].data.image_groups` 后备缓存
4. 宿主 `.mes_text` 里由插件创建或处理过的 DOM

当前 bundle 的直接依据是 `saveImageGroup`、`saveToMetadata`、`getSavedImageMatches`、`findAndReplaceInElement` 和 `createButtonAtPosition`。旧 `placeholder.js` 的行号只能作为历史版本参考；其可读化结构仍能说明 `data-link` / `data-image-tag` 与 `triggerGeneration` 的占位按钮关系，但不能覆盖当前 v2.7.7 的类名和数值结论。

## 轻引用格式

如果 UI 另一个位置要复刻一张持久化图片，只存身份，不存 base64、idb src 或 imageData。`lightKey` 只应是由楼层、swipe、tag/link/requestId 组成的轻量索引，不能包含 base64 或图片本体：

```html
<span
  data-chatu8-image-ref
  data-message-id="13"
  data-swipe-id="0"
  data-image-tag="<tag>"
  data-link="<tag>"
  data-request-id="chatu8-id-...">
</span>
```

渲染时按 `messageId + swipeId + tag/link + requestId` 去原生来源解析已有媒体，再显示一份 `<img>` 或 `<video>`。当前插件媒体由 `getItemImg`、`getItemBlob`、`getMergedAndSortedImages` 等缓存/数据库/服务器路径管理；画廊只保存轻引用，不保存 base64、Blob 或 imageData。

## 性能边界

same-layer-pre 不保存 base64，不保存 imageData，不复制插件图片体。热路径只在对应楼层事件后定向刷新，不扫全聊天、不重算全图库。`drawer_open` 是 beta 面板的人工观测入口，用来判断最新含图楼层当前停在 DOM、EXTRA、TAG 还是 CACHE。

## 手势边界

视觉复制一个 `<img>` 不会天然继承插件手势。当前图片节点由 `createAndShowImage` 管理，按钮节点由 `createButtonAtPosition` 管理；插件的生成、删除、锁定、解锁等行为围绕宿主 `.mes_text`、`.mes[mesid]`、`data-link`、`data-image-tag`、`data-request-id`、`extra.images`、`image_groups` 这些身份信息运行。

因此 pre 画廊点击卡片时应优先代理到仍连接的宿主原始元素。单独复刻数据属性不会让插件扫描画廊 clone；插件扫描的是宿主 `.mes_text` 及关联 iframe 文档。移动端不应把合成 `click` / 原生 `dblclick` 当作 PC 鼠标事件的等价物：画廊按钮应以 `pointerdown` / `pointerup` 识别触摸双击，并把第二次 `pointerup` 交给宿主 click-click 桥；本轮桥接长按使用 1200ms。这里的 1200ms 是当前 pre/Beta 实测契约，不是旧版可读化文件 500ms 常量对 v2.7.7 的直接证明。若同层捕获层拦截，或事件只落在 iframe clone 上，宿主插件 handler 收不到。

当前图片交互依据：图片单击按设置预览，双击在 `dbclike` 开启时调用 `triggerGeneration(button)`，长按约 1200ms 调用 `showEditDialog`；图片占位按钮单击直接生图，长按约 1200ms 编辑。这里的“图片双击”不是原生 `dblclick` 协议，而是 `createAndShowImage` 绑定在同一个媒体节点上的两次 `click`，第二次 `click` 命中插件内部计时器后才进入重生图分支。Beta 必须派发连续两次 `click`，不能只派发一个 `dblclick`。manifest 中的移动端三连击属于通用点击触发，不应当套用到图片节点。

## 分阶段身份标志与 pre 的保存边界

st-chatu8 v2.7.7 在不同阶段使用不同的图片标志，pre 不能把它们全部压缩成一个 `promptToken`：

| 阶段 | 识别信息 | pre 的处理方式 |
| --- | --- | --- |
| LLM 指令 | `<images>` / `<image>`、`regex`、`tag` | 作为临时的定位和逻辑身份，不证明图片已生成 |
| 正文标签 | `image###...###`、`<image>...</image>` | 只能证明正文存在图片意图或历史标签 |
| 插件占位 | `button.image-tag-button`、`.st-chatu8-image-span`、`data-link`、`data-image-tag`、`data-request-id` | 优先解析宿主原生节点 |
| 请求状态 | `data-loading="true"`、`generate-image-request` | 只记录状态，不由画廊重新发起请求 |
| 响应回填 | `generate-image-response.id` | 等待宿主 DOM 更新后重新解析 |
| 已生成媒体 | `.st-chatu8-image-container` 下的 `<img>` / `<video>` | 复制显示结果，不复制插件媒体真相 |
| 持久化/缓存 | `extra.images[swipeId]`、`image_groups`、插件 cache | 读取 tag/link 和媒体证据，不回写画廊记录 |

当前插件的 `data-request-id` 由 tag 的 `generateStableId()` 派生，不包含 `messageId` 或 `swipeId`，所以它不是全局唯一图片 ID。画廊合并引用必须至少使用：

```ts
messageId + swipeId + requestId
```

并继续保留 `tag/link` 作为逻辑匹配回退。`regex` 应作为独立字段保留，用于正文定位，不能在没有 `promptToken` 时直接包装成 `image###${regex}###`。

当前 v2.7.7 bundle 没有 `data-stable-id` 和 `image-tag-placeholder`；pre 中仍存在的相关选择器只能作为旧版本兼容分支。当前版本首选：

```text
button.image-tag-button
.st-chatu8-image-button
.st-chatu8-image-span[data-request-id]
.st-chatu8-image-container img/video
```

### 画廊只拿已生成图片时的判定

```text
宿主 span 下有 img/video
  → 复制显示

宿主有 button/span，但没有媒体
  → 显示占位，不触发生图

extra.images 有 tag/link，但 DOM 没有媒体
  → 尝试读取插件缓存

只有 regex 或正文 image### token
  → 只显示“有图片意图”的状态，不当作已生成图片
```

pre 当前 `readPromptToken()` 会在缺少 token 时把 `regex` 当作 prompt 的 fallback；这会丢失正文锚点语义。下一步应把 `regex` 加入 `PreGalleryImageRef`，与 `promptToken/tag/link` 分开保存。

## 当前源码依据清单

| 组件 | 当前函数/选择器 | 作用 |
| --- | --- | --- |
| 标签解析 | `parseImagesFromPrompt`、`insertImagesIntoElement` | 生成 `regex` / `tag` 匹配信息 |
| 原生占位 | `findAndReplaceInElement`、`createButtonAtPosition` | 创建 `button.image-tag-button` 与 `.st-chatu8-image-span` |
| 生图请求 | `triggerGeneration` | 发出 `generate-image-request`，按 `id` 接收 response |
| 图片渲染 | `createAndShowImage` | 把 `imageData` 变为 `.st-chatu8-image-container` |
| 元数据 | `saveImageGroup`、`saveToMetadata` | 写 `extra.images` 或 `st-chatu8.data.image_groups` |
| 原生交互 | `lockTagForElement`、`deleteImagesForElement` | 修改宿主锁定/删除状态 |

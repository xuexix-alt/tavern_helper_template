# same-layer-pre 画廊 Beta 全量审计说明

> 审计日期：2026-07-15；审计范围：本轮 Beta 画廊入口、正文图片引用、原生节点交互代理、移动端双击/长按修复、相关测试与 st-chatu8
> v2.7.7 源码核对；配套设计说明：[`same-layer-pre画廊beta实证模型.md`](same-layer-pre画廊beta实证模型.md)
> 插件源码索引：[`st-chatu8-v2.7.7-当前源码核对.md`](插件混淆还原/st-chatu8-v2.7.7-当前源码核对.md)

## 1. 审计结论

本轮 Beta 的正确定位是“对自身状态只读的诊断和原生手势转接层”，不是新的生图库，也不是让画廊替代正文生图。它做三件事：

1. 从正文、宿主 DOM、`extra.images`、`image_groups` 和插件缓存中建立图片轻引用。
2. 在画廊中显示已经由插件生成的图片，必要时显示同一身份的占位态。
3. 把单击、双击、长按代理回仍然由 st-chatu8 绑定的宿主按钮或图片节点。

它不做三件事：

1. 不在 Beta 内实现或直接发出一套新的 `generate-image-request`
   链路；测试动作可以委托宿主原生节点，因而允许插件按自己的协议执行生图。
2. 不把 `imageData`、base64、Blob 或插件媒体 URL 写成 same-layer-pre 的第二份长期真相。
3. 不把画廊里的视觉 `<img>` clone 当成插件原生交互节点。

因此，“画廊拿到本楼正文已经生好的图片，并保留插件互动”这一设计方向成立；关键不是复制节点，而是复制显示、保留身份、把动作交给原节点。

## 2. 证据等级

| 等级 | 证据                                           | 本轮可支持的结论                                                                     |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| A    | 当前仓库源码、组件、静态测试、插件 bundle 检索 | 身份字段、节点选择、事件转发和不持久化边界                                           |
| B    | 用户提供的 Beta 手机截图与手势回报             | Beta 的 `iframe-ready-image` 目标、单击/双击/长按派发，以及修复前移动端 tap 状态异常 |
| C    | 从混淆 bundle 还原出的逻辑或旧版可读化文件     | 组件关系和历史行为参考；数值或未在当前设备复验的行为不能单独升级为 A                 |
| D    | 推断或待现场复验                               | 插件业务回调是否实际完成、不同浏览器/版本的合成事件差异                              |

本次审计没有可用的手机浏览器现场连接，因此不会把最终设备回调、实际重生图结果或特定浏览器的事件序列写成已完成验证。

Beta 的 action
trace 只证明事件已派发到记录的目标节点；只有看到宿主 DOM、插件日志或实际结果变化，才能把它升级为插件业务回调成功。

## 3. 生图链路与阶段身份

同一张图在不同阶段不是同一个标志。应按下表理解：

| 阶段        | 主要标志                                                                      | 语义                                 | 画廊处理                                |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------- |
| LLM 指令    | `<images>` / `<image>`、`regex`、`tag`                                        | 要在正文什么位置、以什么逻辑身份插图 | 建立意图引用，不宣称已有图片            |
| 正文标签    | `image###...###`、`<image>...</image>`                                        | 正文中的图片锚点或历史标签           | 保留正文定位，不把它当媒体 URL          |
| 插件占位    | `button.image-tag-button`、`.st-chatu8-image-button`、`.st-chatu8-image-span` | 插件已识别标签并创建原生交互节点     | 显示 pending，占位单击交给按钮          |
| 占位身份    | `data-link`、`data-image-tag`、`data-request-id`                              | 提示词、标签和响应 DOM 的关联        | 与 `messageId + swipeId` 一起保存轻引用 |
| 请求中      | `data-loading="true"`、`generate-image-request`                               | 请求已经发出但媒体未回填             | 记录状态，不由画廊补发请求              |
| 响应回填    | `generate-image-response.id`                                                  | 插件按关联 ID 找到 span/button       | 等宿主 DOM 更新后重新解析               |
| 已生成媒体  | `.st-chatu8-image-container` 下的 `<img>` / `<video>`                         | 当前楼层已有可显示媒体               | 复制显示，交互仍指向原节点              |
| 元数据/缓存 | `extra.images[swipeId]`、`image_groups`、`getItemImg` / `getItemBlob`         | 标签、位置、锁定状态和媒体读取路径   | 只读查询，不能替代宿主插件真相          |

`regex` 是正文定位锚点，`tag/link` 是逻辑图片身份或提示词，`requestId` 是 DOM/response 关联标志，`src`
只是当前显示证据。`requestId` 由 tag 派生，不能单独作为跨楼层的全局图片 ID；最低组合应为：

```ts
messageId + swipeId + requestId;
```

当前 v2.7.7 bundle 没有 `data-stable-id` 和 `image-tag-placeholder`
字符串；这些只能作为旧版本兼容分支。旧版可读化文件仍出现它们，不应覆盖当前 bundle 的选择器结论。

## 4. “拿到正文图”的判定

```text
宿主 span/container 下有 img/video
  → 已生成：复制显示

宿主有 button/span，但没有媒体
  → 占位：等待插件，不主动生图

extra.images 有 tag/link，但 DOM 没有媒体
  → 尝试读取插件缓存；仍没有则保持占位

只有 regex 或正文 image### token
  → 只有图片意图，不当作已生成图片
```

所以 Beta 里“已有图片”来自 Beta 打开前正文已经存在的插件媒体，Beta 本身没有生成那张图。Beta 的图片卡片是显示副本，原图、缓存和正文元数据仍由插件/酒馆保管。

## 5. 原生交互结论

### 5.1 成品图

当前插件对成品图的关键协议是同一媒体节点上的两次 `click`。它不是依赖单个原生 `dblclick`：

```text
第一次 click → 插件单击计时/预览路径
第二次 click → 在 dbclike 开启且存在关联按钮时进入 triggerGeneration(button)
```

因此 `dispatchEvent(new MouseEvent('dblclick'))`
即使返回成功，也只能证明 DOM 事件派发成功，不能证明插件重生图回调执行。`preGalleryImageRefs.ts`
已改为在精确的 iframe/宿主图片节点上依次派发两个 `click`。

### 5.2 占位按钮

占位阶段的单击目标是 `button.image-tag-button`，单击直接交给插件的
`triggerGeneration(button)`。长按目标优先也是按钮，而不是画廊自己的占位元素。

### 5.3 长按时长的证据边界

本轮 pre 桥和 Beta 测试使用 `PRE_GALLERY_NATIVE_LONG_PRESS_MS = 1200`。用户提供的 Beta 日志显示了 1200ms 的
`mousedown → mouseup`，并确认长按成功。

这里必须区分证据：当前 `st-chatu8/index.js` 是混淆 bundle，文本检索不能直接证明这个数字；仓库内
`docs/插件混淆还原/st-chatu8/utils/iframe/generation.js` 和 `placeholder.js`
是旧版可读化参考，仍保留 500ms 常量。因此 1200ms 应写成“当前 pre 桥接/本轮 Beta 实测契约”，不能写成旧还原稿直接证明的 v2.7.7 源码常量。若插件版本或设置改变，仍应以设备现场日志和插件行为复验。

长按完成后必须压制浏览器随后合成的 click，否则会串成“长按后又单击/重生”。

## 6. 移动端双击审计与修正

### 6.1 Beta 证明了什么

Beta 的测试按钮不依赖手机浏览器把两次触摸自动合成为 PC 式
`dblclick`，而是直接找到插件绑定的原生节点并派发协议需要的事件。用户截图中曾出现：

```text
mobile tap #1/2; same=false
mobile tap #1/2; same=false
```

两条记录间隔只有约百余毫秒，却每次都从 #1 开始。这证明原画廊的问题不是“手机双击太慢”，而是画廊自己的触摸状态在第二次触摸到达前被清掉/重置。

### 6.2 修正后的路径

原画廊现在按以下顺序工作：

1. `pointerdown`：只启动长按计时；触摸事件阻止兼容 click 重复计数。
2. 未达到长按阈值的 `pointerup`：记录一次 mobile tap。
3. 第二次同一卡片的 `pointerup` 在窗口内到达：清除 pending 单击，记录 `#2 -> click sequence`，对宿主原生图片派发两次
   `click`。
4. 非触摸设备保留桌面 click/dblclick 路径。
5. `pointercancel`、`pointerleave`、长按完成时清理对应计时器；长按后的合成 click 被吞掉。

本轮曾出现一个会让修复失效的中间版本：`startLongPress` 无条件调用 `resetMobileTapState()`，导致第二次触摸在 `pointerup`
前再次归零。该错误已改为仅在非 touch 路径重置，并由回归测试锁定。这个误判和修正必须保留在历史记录中，不能继续归因于“手机双击天生不同”。

结论是：手机的原始输入事件、浏览器合成 click/dblclick 和 PC 鼠标确实不应视为完全等价；但本轮 `same=false`
的直接故障是本地状态重置位置错误。Beta 的直接派发成功说明宿主节点/插件协议方向正确，原画廊需要的是同一套 pointer-up 识别逻辑。

## 7. 组件与代码依据

| 组件              | 代码                                                                                                   | 审计作用                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Beta 入口/弹窗    | `src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue`、`components/PreGalleryBetaModal.vue` | 顶部 Beta 按钮、只读诊断、测试动作和事件日志                  |
| 原画廊手势        | `components/PreGalleryPanel.vue`                                                                       | pointerdown/up、移动端双击计数、长按计时和合成 click 抑制     |
| 引用扫描/宿主解析 | `preGalleryImageRefs.ts`                                                                               | 正文/DOM/缓存轻引用、iframe 原生目标、identity-bound fallback |
| 回归测试          | `__tests__/preGalleryImageRefs.test.js`                                                                | 33 项静态源码/协议回归，包含 reset 位置保护                   |
| 插件当前源码核对  | `docs/插件混淆还原/st-chatu8-v2.7.7-当前源码核对.md`、`st-chatu8/st-chatu8/index.js`                   | 当前 bundle 的组件、身份和事件依据                            |
| 历史可读化参考    | `docs/插件混淆还原/st-chatu8/utils/iframe/generation.js`、`placeholder.js`                             | 仅用于解释旧结构和版本差异，不能覆盖当前 bundle               |

核心插件组件及其意义：

```text
parseImagesFromPrompt / insertImagesIntoElement
findAndReplaceInElement / createButtonAtPosition
triggerGeneration / createAndShowImage
getItemImg / getItemBlob / getMergedAndSortedImages
saveImageGroup / saveToMetadata
lockTagForElement / unlockTagForElement / deleteImagesForElement
handleDoubleClick / initDocumentGestureEvents
```

## 8. Beta 测试清单与可复现实验

### 已完成或有本轮证据的项目

- [x] 顶部 Beta 入口可以打开右侧诊断画面。
- [x] Beta 能识别已有正文图片，并显示 `iframe-ready-image` 等宿主目标信息。
- [x] Beta 测试单击、双击、长按均能完成桥接派发；用户确认修正后的 Beta 双击和长按成功。
- [x] Beta 不实现并行生图、不写入第二份图片本体；双击/占位单击若委托原生节点，仍可能由插件执行生图。
- [x] 原画廊长按目标使用插件当前桥接时长，并抑制长按后的合成 click。
- [x] 移动端双击从 click 监听迁移到 pointerdown/pointerup 状态机，并锁定修正前的无条件 reset 回归。

### 尚需设备现场复验的项目

- [ ] 在用户当前手机、当前 st-chatu8 设置下，对原画廊图片实点两次，确认日志出现
      `mobile pointer tap #2 -> click sequence`，并观察插件是否真的重生图/打开预览。
- [ ] 分别关闭 `dbclike`、`longPressToEdit`，确认插件设置关闭时桥接不会越权触发业务动作。
- [ ] 对 iframe 内图片、宿主 fallback、视频 overlay 各复验一次。
- [ ] 对旧聊天、同 tag 跨楼层、swipe 非 0 的引用复验去重和目标选择。

推荐观察日志：

```text
mobile pointer tap #1/2; same=false; ...
mobile pointer tap #2/2; same=true; ...
mobile pointer tap #2 -> click sequence
iframe-native-click-sequence / host-native-click-sequence
longpress ... 1200ms -> mouseup
```

如果仍然连续出现 `#1/2; same=false`，优先检查加载的 dist 是否为本次构建、是否存在旧页面缓存，以及
`pointerdown`/`pointerup` 的 `pointerType` 是否为 `touch`；不要先把它归因于设备“双击定义不同”。

## 9. 审计修订记录

| 旧结论/风险                             | 审计后的结论                                                          |
| --------------------------------------- | --------------------------------------------------------------------- |
| 以单个原生 `dblclick` 复现图片双击      | 改为同一原生媒体节点的两次 `click`                                    |
| 620ms 可作为插件长按测试时长            | 改为当前 pre/Beta 使用 1200ms；旧版 500ms 仅作历史参考                |
| 画廊 clone 复制属性后即可继承插件互动   | 改为 clone 只显示，互动必须代理宿主原生节点                           |
| 手机两次 click 失败就是手机双击完全不同 | 修正为：事件模型有差异，但本轮直接故障是 touch tap 状态被无条件 reset |
| Beta action trace 等于插件业务成功      | 改为只证明桥接派发；业务成功必须看宿主/插件实际结果                   |
| `requestId` 是全局图片 ID               | 改为 tag 派生的 DOM/response 关联标志，必须与楼层和 swipe 组合        |

## 10. 维护规则

后续继续开发时，应先维护 `preGalleryImageRefs.ts`
的原生目标与轻引用边界，再维护画廊显示；不要为“让画廊可交互”新增第二份图片缓存。任何新的插件版本都应重新核对：占位选择器、媒体容器、请求/响应 ID、图片 click-click 逻辑、长按设置和移动端事件监听，然后更新本审计的证据等级。

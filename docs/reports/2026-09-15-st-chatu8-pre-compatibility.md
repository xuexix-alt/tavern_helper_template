# st-chatu8 v3.0.7 与 same-layer-pre 兼容性审计

日期：2026-09-15。范围：正文生图、图片按钮、画廊、图片手势与自动生成衔接。

## 核心修复已实施（2026-09-15）

以下实施状态优先于后文保留的历史诊断：

- 新增 prePluginMedia：快照序列化前修正插件块级容器，保留 requestId 结构，优先读取 data-full-src 并过滤透明占位图；统一祖先字段读取。
- 正文图片单击/重生走对应宿主图片，按住编辑走对应宿主按钮；正文三触从第一触起阻断竞争的 iframe 插件处理，最终派发到实际消息 `.mes_text`。加入当前 swipe 检查、移动取消与触摸兼容 click 去重；触摸开始保留浏览器滚动/缩放默认行为。
- 画廊修正请求去重、当前 swipe 的 extra.images 对象格式读取，并优先使用宿主原生控件；切聊天/切 swipe 清理节点缓存。订阅 generate-image-response，正文同步使对应楼层缓存失效。
- 更新相关源码约束测试，替换原先引用缺失文档的审计测试。当前四组针对性测试共 43 项通过；相关文件 ESLint 通过，生产构建通过（仍有包体大小与 Browserslist 数据陈旧提示）。
- 当前酒馆加载源原本就是 localhost:5500 的 dist 文件，已重载 pre iframe 验证新产物：三张图片全部恢复，naturalWidth 为 1024、1216、832；画廊准确显示三张真图；恢复后的成品图单击能打开原生预览；正文菜单日志绑定 mesId=5。
- 在当前浏览器中以合成事件验证：正文三触对应宿主 #5 的三组触摸序列；图片触摸派发 #5 按钮 mousedown/mouseup 和唯一一次图片 click。测试期间临时拦截宿主合成事件，未额外请求图片生成。真实手机滚动、长按、快速连触仍需用户实机复验。
- 本次实施聚焦已复现的正文恢复、图片动作桥接和画廊关联。历史 IndexedDB 全量资产桥接、视频完整支持、自定义标签和自动 LLM 落库时机属于后文列出的其他缺口，未在本次补成独立新功能。

## 后续酒馆实测补充（同日）

本节更新下文最初审计时“浏览器不可连接”的证据边界：后续已通过 Chrome 调试连接读取 `http://127.0.0.1:8000/`，角色卡为“末世寒冬 - 星穹秩序”，运行插件版本确认 3.0.7。桌面视口 1707×777，maxTouchPoints=0；移动端手势成功为用户反馈，尚未做真实移动端复现。

### 初始加载与重新生成出现不同结果

- 初始 #5 有三个插件图片资源，pre 中前两张没有 src，第三张已加载。三个带 requestId 的 span 都为空，图片 container 移到了外面；宿主图片有 `_mountChatImage` 和 onload 回调，pre 副本没有。
- 将宿主 innerHTML 只在脱离页面的 div 中重新解析，就能复现三个 span 内图片数从 1 变为 0。宿主动态 DOM 的段落/块级嵌套在 HTML 解析时发生结构修正，无需执行 Vue 就能复现身份容器与图片分离。
- 初始画廊三张图显示四条：两个空占位、一个 1×1 透明图和一张成品图。单击初始正文成品图没有打开插件预览。
- 用户授权后，从 pre 的 #5 正文双击，选择“图片生成”，发起了一次正文生图 LLM 请求；插件按当前设置自动生成三张图片。三个图片任务均完成。
- 此次生成后 pre 的三个 span 都包含图片，带 requestId，图片具有原生 `_mountChatImage` 回调。单击新生成的第三张图片成功打开插件预览，并已关闭预览。
- 再次打开画廊却显示五条：三个带 requestId 的空条目、一张没有 requestId 的成品图、一张没有 requestId 的透明占位图。确认画廊身份提取与懒加载地址问题独立于“是否已经成功生成”。

### 本次请求确实走 CHAT 保存，并未复现 body/HTML 回退

- 请求入口日志 msgid 921：`tagName=DIV, className=mes_text, mesId=5`。
- 上下文日志 msgid 930：`[chatDataUtils] chatId: 5`。
- 保存日志 msgid 1075：`[imageInserter] Saved to chat[5].mes (insertOriginalText mode)`。
- #5 正文长度由 7112 变为 6424，保留三组新的 image 标签；chat 长度始终为 6，未新增聊天楼层。
- `chatMetadata['st-chatu8'].data.image_groups` 始终为空；当前 insertOriginalText=true，因此 extra.images 为空不能作为未保存的证据。

### 用户报告的 body/HTML 回退：已定位风险机制，但该次请求未触发

当前 pre iframe 实际挂在 #0，#0 原文仅 11 字符。插件 `findMesTextFromElement`（index.js:15684）会把未经桥接的 iframe 节点定位到 iframe 外层 `.mes_text`，得到 #0，而非 pre 卡片标记的 #5。`getElContext` 对 #0/短正文走 DOM 文本分支；保存时插入原文的长度条件也无法满足，可能转入 image_groups metadata。

因此“手势能弹菜单”并不证明“操作目标是正确 chat 楼层”。本次桌面桥接正常，不能据此否定用户的移动端偶发问题。下一轮应在每次入口和响应保存前记录 chatId/messageId/swipeId、目标 ownerDocument、宿主 mesid，核对出现回退的具体入口。适配层应显式携带业务楼层身份，不从整个 pre iframe 的承载楼层推断。

本次仅诊断和经授权生成，未修改业务代码。以下为初始源码审计，结合本节现场证据阅读。

## 更新结果与证据边界

- 插件更新前：master，HEAD `a58656a`，含两个本地提交和未跟踪的 `utils/docs/`。
- 已 fetch 并合并远程 master `6575eb3fc6e47700f3784924aedddce4efc5c4b0`，manifest 版本为 **3.0.7**；远程哈希已用 `ls-remote` 核对。
- 合并后的本地 HEAD：`760b7329ca28fd8ff826efad23e056080d4e6d42`。本地提交保留，备份分支 `codex/pre-update-20260915` 指向更新前 HEAD。
- 本地相对远程的文件差异仅为已有 `utils/settings/ClickTrigger_restored.js`；未跟踪文档保留。新版上游将多个旧 utils 模块删除并合并进可读的 `index.js`，旧文件可从备份分支恢复。
- `st-chatu8` 实际是主仓库已跟踪的 gitlink（mode 160000）。本次更新使主仓库显示该子仓库提交变化；没有提交主仓库指针或推送远程。
- 更新对象是本工作区插件源码，不代表运行中酒馆已经加载新版。浏览器连接返回 `nodeRepl.fetch request failed`，本报告依据当前源码、函数级隔离验证与现有测试；未触发生图请求。
- 下述内容是当前 pre 对新版契约的缺口，不把每一项都归因于 v3.0.7 才新增的回归。

## 核心判断

pre 目前同时采用宿主 DOM 快照、iframe 内插件二次处理、宿主手势转发、画廊扫描。这几条路径没有统一“哪个节点真正绑定插件监听器”和“哪个字段代表图片身份、成品地址”的规则。应先修这两个边界，再补生成完成后的同步。

保留真实宿主楼层和 `.mes_text` 仍有价值：插件的正文操作和自动 LLM 生图继续依赖它们。当前 `is_hidden: false` 与视觉隐藏无需仅为此次适配而改成数据隐藏。

## 1. P1：复制了插件 DOM，却没有复制它的行为

**证据**

- `src/寒冬末日/same-layer-pre/界面/状态栏/useSameLayerPre.ts:370` 读取宿主 `.mes_text.innerHTML`，`:397` 优先作为 finalHtml。
- `components/PreTranscriptMessageCard.vue:26` 与 `components/PreAppleMessageBody.vue:16` 用 `v-html` 展示。
- `st-chatu8/index.js:49323` 创建按钮；`:49348` 附近通过 `addEventListener` 绑定单击生成和按住编辑。成品图片的监听器绑定在 `:48728`。
- `preHostImageGestureForwarder.ts:281` 只提供 dblclick、touchend 转发，没有复制按钮单击和按住的完整行为。
- 插件 `index.js:49304` 对已存在的同 link 按钮直接跳过；不能依赖扫描自动把克隆按钮重新绑定。

**影响**：当 finalHtml 已包含宿主插件按钮或成品图时，iframe 内可能出现“看得见但点不动”的克隆节点。图片自身的 IntersectionObserver、媒体播放状态也不会随 innerHTML 复制。若插件在 iframe 内重新创建过节点，这部分节点又可能正常，形成时好时坏的表现。

**建议**：明确节点所有权。正文文字继续由 pre 渲染，插件控件采用可辨识的占位引用，并统一委托到经过验证的原生控件；或者让插件通过显式 hydrate 接口在指定正文根节点重新挂载。不要把“有插件 class”视为“已绑定行为”。Vue 更新后只重建受影响媒体区域，避免擦掉插件节点。

## 2. P1：跨 iframe 类型判断阻断宿主图片定位

**证据**：`preHostImageGestureForwarder.ts:89` 用当前窗口的 `instanceof HTMLElement` 检查元素；`:187` 的候选实际来自父窗口 document。`:95` 同样用本窗口的 HTMLImageElement/HTMLVideoElement 读取宿主媒体。

**影响**：不同窗口有不同构造函数。真实宿主图片会被过滤，最终找不到转发目标；`:275` 仍提前吞掉原事件，导致本地插件也收不到该手势。

**验证**：提取实际函数，使用不同构造函数模拟两文档节点：宿主元素被解析为 null；宿主图片 src 被解析为空字符串。

**建议**：用节点能力/tagName 检查，或使用 `element.ownerDocument.defaultView` 的构造函数。先确认目标和动作受支持，再拦截原事件。对插件在 pre 内原生创建的图片，优先保留其原生交互。

## 3. P1：懒加载图片地址读取错误

**证据**

- 插件 `index.js:48092` 起将真图地址放入 `media.dataset.fullSrc`，图片进入观察区域才挂载 src，离屏时替换为透明 GIF。
- `preGalleryImageRefs.ts:551` 只读 currentSrc/src；`:402` 合并来源时采用已有非空 src 优先。
- `preHostImageGestureForwarder.ts:95` 也没有读取 fullSrc。

**影响**：画廊展示透明图、初次扫描没有图；宿主隐藏后更容易读到空地址或占位地址。宿主占位图先进入结果时，还可能盖过随后找到的 iframe 真图。

**验证**：真实读取函数面对带 fullSrc 的透明占位图，返回透明 GIF，忽略真实地址。

**建议**：统一媒体地址读取器，图片优先取经校验的 fullSrc，再取有效 currentSrc/src；明确排除插件占位 GIF、空地址和页面地址。合并时让有效媒体优先于占位数据，区分“尚未加载”和“没有图片”。

## 4. P1：生成完成、换图与正文缓存没有完整同步

**证据**

- 插件 `index.js:48937` 附近的 GENERATE_IMAGE_RESPONSE 处理直接替换 span 内媒体、修改按钮状态；事件名定义在 `:2289` 为 `generate-image-response`。
- `PreGalleryPanel.vue:501` 起只订阅 MESSAGE_UPDATED、MESSAGE_EDITED、USER_MESSAGE_RENDERED、CHARACTER_MESSAGE_RENDERED。
- `useSameLayerPre.ts:619` 的缓存签名仅包括角色、可见性、正文长度和首尾片段等，没有图片版本、extra.images 或 swipe_id。定向刷新仍通过同一个缓存函数。

**影响**：生图耗时超过正文事件后的补扫窗口时，打开着的画廊不会因生图成功自动更新。即使追加一次正文刷新，纯媒体变化也可能被旧缓存挡住。正文中间等长替换也是现有签名的另一个盲点。

**建议**：监听插件成功/失败响应，维护 requestId 到 chatId/messageId/swipeId 的映射，DOM 更新后定向刷新对应引用；为插件预览换图、编辑、删除补独立媒体变更通知或局部观察。给正文缓存增加显式失效机制，避免为了同步图片重写整段正文。

## 5. P1：引用身份在嵌套容器中丢失，退化为按地址/顺序猜图

**证据**

- 插件生成结构为 `button[data-request-id] + span.st-chatu8-image-span[data-request-id] > div.st-chatu8-image-container > img`，见 `index.js:49374` 与 `:47944`。
- `preGalleryImageRefs.ts:539` 的 readDataset 只读当前节点；`:662` 的 closest 首先命中内层 container，requestId 却在外层 span。随后用正文 token 的数组下标兜底。
- `:944` 的图片评分也直接读当前候选的 requestId；对 img 候选通常丢失外层身份。

**影响**：同层多图、相同 src、折叠图片或懒加载时容易出现重复引用、无法定位原生节点、顺序对应错误。画廊“设为立绘”也会受到错误引用的连带影响。

**验证**：readDataset 对内层 container 返回空 requestId，即使父 span 有真实 ID。

**建议**：在单条消息边界内沿媒体、容器、span、关联按钮分层取字段；使用 chatId/messageId/swipeId/requestId，并在需要区分同 prompt 的多个历史成品时增加资产 ID。插件 requestId 是由 link 派生的，不能单独视为一次生成任务或一张历史图片的唯一 ID。候选冲突时报告歧义，避免静默选择第一个。

## 6. P1：画廊所谓 cache 来源并非插件完整图片缓存

**证据**

- `preGalleryImageRefs.ts:729` 仅向 `collectPluginNativeCacheArtifacts` 传入 `chatMetadata['st-chatu8']`。
- `src/寒冬末日/界面同层版/界面/状态栏/pluginNativeCacheArtifacts.ts:84` 扫描 imageCache/images/data.image_groups，并要求条目含图片地址。
- 插件 `index.js:16037` 的 image_groups 保存正文锚点信息；`:3324` 的真正资产查询合并 `extension_settings[extensionName].jiuguanStorage[MD5(tag)]` 与 IndexedDB metadata；`:3884` 再按当前索引解析 path/uuid。

**影响**：仅有缓存、尚未挂载 DOM 的历史图无法靠现有 fallback 恢复；“全量画廊”实际上不等于插件全部资产。extra.images 和 image_groups 的 tag/regex 也不能直接充当图片地址。

**验证**：符合锚点结构的 image_groups 输入返回零条媒体引用。

**建议**：将“正文引用索引”与“资产解析”分开。优先建立插件侧只读查询桥接，按 prompt/link 查询当前图、历史图与媒体类型，再映射回对应楼层。`getItemImg` 是当前 bundle 内部函数，且会同步选择索引，不宜冒充已有的无副作用公共 API。若新增桥接，需要明确接口版本、只读行为与返回结构；不要直接 import 已删除的 utils 文件。

## 7. P2：新版视频缺少端到端支持

**证据**

- 插件 `index.js:47946` 创建 video，并可能将播放地址转为 blob URL；`:48634` 附近视频手势实际绑定到播放器 topOverlay。
- `hostBridge.ts:119` 的 normalizeImageDataToSrc 不接受 blob:，把它包装为 PNG base64。
- `PreGalleryPanel.vue:53` 对所有非空地址统一使用 img。
- `preGalleryImageRefs.ts:428` 将交互节点解析为 img/video，不认识播放器覆盖层。

**影响**：视频缩略图损坏、播放地址无效；向 video 派发点击/按住不等于触发新版播放器上的监听器。

**验证**：输入 `blob:https://example.test/media`，返回 `data:image/png;base64,blob:https://example.test/media`。

**建议**：引用模型增加 mediaType、mime、poster、originalUrl、activeMode，图/视频分别渲染；blob URL 只作有生命周期的临时地址。手势转交使用实际事件承载节点或显式动作接口。视频默认不能进入角色静态立绘选择。

## 8. P1 风险：自动 LLM 正文生图的结束时机与 pre 落库顺序不一致

**证据**

- pre `useSameLayerPre.ts:878` 先 await generate，返回后才 createChatMessages 保存 assistant。
- 插件 `index.js:105356` 起记录原生 GENERATION_STARTED 状态；GENERATION_ENDED 时要求 chat/swipes 已增长，并解析最新真实消息。
- 插件占位按钮自动点击另有 js_generation_ended 支持（`:51686`）；自动 LLM 写提示词模块并没有同样的监听。这是两种不同自动功能。
- 插件全 iframe 扫描（`:49928`）和自动点击窗口仍不认识 pre 中多个 data-message-id 的业务边界。

**风险**：结束事件发生时助手消息尚未落库，自动 LLM 路径可能跳过或选错消息；多楼层 pre 中还需要验证自动点击是否扩展到旧楼层未生成的按钮。此项需要运行时事件顺序验证，不能仅凭源码宣称已经复现。

**建议**：以“assistant 持久化完成 + 指定 messageId”作为适配入口，独立触发指定消息的插件动作；不要为了兼容伪造全局 GENERATION_ENDED。自动处理限定目标正文根节点，并以 generationId/messageId/swipeId 防重。

## 9. P2：自定义标签与现有硬编码解析不一致

插件 `index.js:49090` 读取配置 startTag/endTag；pre 复用的 `hostBridge.ts:140` 仍只识别 `名称###内容###`，缓存适配器还会自动包成 image###...###。

默认标签时不构成必现故障。用户自定义标签后，正文 token fallback、缓存关联、图片排序可能失效。建议从插件能力/配置桥接获取标签规则，对纯 prompt 与完整 token 分别建模。

## 不应误判的部分

- 新版普通图片同时支持 click-click 与原生 dblclick（`index.js:48666`、`:48700`）。画廊现有 click-click 策略并非对普通图片全面失效；“新版完全换成另一套双击协议”不成立。
- 长按阈值仍为 1200ms，和 pre 当前常量一致。主要问题是节点是否原生、目标是否找对，而不是单纯延长长按时间。
- generate-image-request / generate-image-response 事件名仍存在。已有 pluginImageClient 可以作为扩展起点，但当前它只处理自己发出的请求，不会自动同步插件其他入口产生的图片。

## 建议实施顺序

1. **定位与显示**：跨窗口节点判断、祖先身份解析、fullSrc/占位图处理、blob/mediaType。
2. **正文控件行为**：确定 DOM 所有权，统一按钮单击、图片预览、重生和编辑的动作路由；同一次手势只走一个入口。
3. **状态同步**：生成响应与换图通知，定向失效正文缓存和画廊引用。
4. **历史与自动化**：真实资产查询桥接、指定楼层自动 LLM 生图、可配置标签。

建议将适配逻辑收口为一个带版本/能力检测的 chatu8 适配层；这是拟议的新接口设计，当前插件并未提供本文描述的完整公共查询/动作 API。

## 验证情况与下一轮验收

已执行现有 `preGalleryImageRefs.test.js`：34 项中 33 项通过，1 项失败，原因为缺少 `docs/same-layer-pre画廊beta全量审计说明.md`。这是已有文档依赖问题，不能据此认定运行逻辑失败，也不能把其余通过项当作 v3.0.7 兼容证明。

对现有函数做了六项独立验证：透明占位地址、外层 requestId 丢失、blob 地址误转换、锚点 metadata 无资产、跨窗口 src 判断、跨窗口 HTMLElement 拒绝；均复现上述行为。未改 pre 业务源码。

实施后至少验证：

- 一层两图：单击生成、预览、重生、长按编辑逐一命中正确图片。
- 插件先处理宿主/后处理 iframe 两种顺序，以及 Vue 正文更新后按钮行为。
- 图像离屏、宿主隐藏、折叠后仍能从画廊看见真图。
- 画廊保持打开，生图十秒以上完成、失败、重生换图后自动同步。
- 图片只在数据库、宿主楼层未加载时的历史检索。
- 手机正文三触菜单与图片双击/长按分别验证；不让手势跨入口重复触发。
- Apple 与普通阅读布局、同 prompt 多楼层、切 swipe、切聊天后的身份隔离。
- 自定义 startTag/endTag、视频预览与播放器手势。
- pre 正常发送、开场生成、重新生成后，自动 LLM 只处理已落库的目标 assistant 楼层。

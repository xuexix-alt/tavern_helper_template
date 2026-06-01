# st-chatu8 v2.6.1 同层图片链路转译

> 来源：`F:\ST\SillyTavern\public\scripts\extensions\third-party\st-chatu8`  
> 插件提交：`5b27e94 chore: update`  
> 插件版本：`manifest.json` 标记 `2.6.1`  
> 转译日期：2026-06-01  
> 目的：把混淆后的当前插件运行链路转成 same-layer 适配可读说明。

## 1. 为什么要重新转译

本仓库同层 UI 原本主要盯两类信号：

1. `ch-llm-image-gen-request` / `ch-llm-image-gen-response`
2. 插件最终把真实图片写进 DOM 后的 `img[src]` mutation

2026-06-01 的现场日志显示，st-chatu8 更新后，同层正文插入链路中间新增/强化了正则与宿主渲染交接阶段：

```text
regex-st-chatu8-test-message
regex-st-chatu8-result-message
ch-llm-image-gen-request
ch-llm-image-gen-response
imageInserter.parseImagesFromPrompt
imageInserter.saveImageGroup
character_message_rendered
st_chatu8_auto_click_complete
generate-image-request / generate-image-response
```

也就是说：`ch-llm-image-gen-response` 并不是“正文 DOM 已经可读”的时点。插件会在 response 之后继续 `saveImageGroup`，然后触发酒馆重渲染 `character_message_rendered`。同层 UI 如果只在 response 或最终图片 `src` 上接管，就会早一拍，拿不到正文里的按钮/占位符，只能把图片条带追加到消息尾部。

## 2. 转译结论

- 当前插件仓库是混淆构建产物，但保留了可读字符串、CSS 类名、设置项和日志文本。
- 关键运行入口位于 `utils/imageInserter.js`（混淆），可读日志包括：
  - `[parseImagesFromPrompt] 解析结果详情`
  - `图片 1` / `图片 2` / ...
  - `[imageInserter] saveImageGroup - el 详细信息`
- 关键设置项仍可从 `html/settings/main.html` 与 `manifest.json` 更新说明确认：
  - `insertOriginalText`：插入原文/正文写回模式，当前说明里标注偏向“非同层”。
  - v2.6.0 更新项含“修复正文不能切换图片的问题”。
  - v2.4.0 / v2.1.4 更新项含“同层卡支持”“插入正文”等历史改动。
- 关键 DOM 载体：
  - `.st-chatu8-image-button`
  - `button.image-tag-button`
  - `.st-chatu8-image-span`
  - `span.image-tag-placeholder`
  - `.ai-image-container`

## 3. 对 same-layer 的直接影响

同层 UI 要把插件返回的图片插入正文位置，必须承认三个事实：

1. **宿主酒馆渲染后的 DOM 是权威来源**  
   同层 iframe 自己的 transcript DOM 不能当成插件原生 DOM 来源，否则会把已经搬运过的尾部条带再次当成“正文”。

2. **按钮/占位符阶段也要同步**  
   在真实图片 `src` 到达前，插件已经在正文里插入按钮或 placeholder。这个阶段决定图片应该出现在正文哪里，不能等到 `generate-image-response` 后再找位置。

3. **`character_message_rendered` 是新插件交接点**  
   现场日志显示 `saveImageGroup` 后会出现 `character_message_rendered`，这时宿主 `.mes_text` 才更可能包含插件注入的按钮/占位符。

## 4. 代码适配入口

当前同层适配代码位于：

- `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`

本次应维护的兼容入口：

- `CHATU8_REGEX_TEST_MESSAGE_EVENT = 'regex-st-chatu8-test-message'`
- `CHATU8_REGEX_RESULT_MESSAGE_EVENT = 'regex-st-chatu8-result-message'`
- `CHATU8_AUTO_CLICK_COMPLETE_EVENT = 'st_chatu8_auto_click_complete'`
- `tavern_events.CHARACTER_MESSAGE_RENDERED`
- placeholder-only DOM mutation：有 `.st-chatu8-image-button` / `.image-tag-placeholder`，但还没有 ready `img[src]`。

见：

- `same-layer-image-flow.md`
- `compatibility-notes.md`

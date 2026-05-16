# same-layer generate 轨道回迁方案

## 资料结论

参考文档：
https://stagedog.github.io/青空莉/工具经验/实时编写前端界面或脚本/进阶技巧/#id11

文档在“制作流式或同层界面 / 同层前端界面”里给出的核心模型是：

- 玩家只在一个前端界面内游玩。
- 玩家输入由前端界面调用酒馆助手 `generate` 或 `generateRaw` 来请求 AI 回复。
- 需要流式显示时，监听 iframe generation/stream token 事件获取流式文本。
- 剧情仍使用酒馆楼层机制保存，但界面代码通过 `createChatMessages`、`setChatMessages`、`deleteChatMessages` 等接口，并带 `{ refresh: 'none' }` 修改楼层，避免刷新宿主楼层显示。

因此，真正的 same-layer generate 轨道应当是：

```text
同层 UI 输入
  -> create/set/delete chat messages with refresh:none
  -> generate({ should_stream: true, ... })
  -> iframe stream events
  -> patch same-layer assistant placeholder
  -> done 写回
  -> MVU reprocess / lifecycle / save
```

它不是：

```text
同层 UI 输入
  -> triggerSlash('/send ...')
  -> triggerSlash('/trigger')
  -> 等宿主原生生成刷新
```

后者更接近“脚本改造宿主页面 / 流式楼层界面”的思路，不是文档中“同层前端界面”的主轨道。

## 当前代码状态

主要文件：

- `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`
- `src/寒冬末日/界面同层版/界面/状态栏/nativeSendProxy.ts`
- `src/寒冬末日/界面同层版/界面/状态栏/hostChatInputBridge.ts`

当前已经存在一个完整 generate 轨道入口：

```ts
runGenerationFlow(options)
```

它已经负责：

- 根据 `createUser` 创建 user 楼层。
- 创建 assistant 占位楼层。
- reveal hidden story messages，保障隐藏楼层参与上下文。
- 调用 `generate({ should_stream: true, max_chat_history: ... })`。
- 对 detached opening 使用 `generate({ user_input, should_stream: true, max_chat_history: 0 })`。
- 监听流式事件并 patch assistant。
- done 后执行 MVU reprocess、官方生命周期事件和显式保存。

但当前仍有两个入口偏离了 generate 轨道：

1. 普通正文

```ts
runDemo()
  -> runNativeSendProxy(prompt)
  -> sendToNativeChat(text, false)
  -> /send + /trigger 或 host ctx.generate
```

2. opening assistant

```ts
generateOpening()
  -> runOpeningNativeGeneration(compiledPromptSnapshot)
  -> sendToNativeChat(compiledPromptSnapshot, false)
```

“改词重生”当前反而已经比较接近 generate 轨道：

```ts
confirmInlineEditRegenerate()
  -> triggerNativeRegenerate()
  -> runGenerationFlow({ prompt: nextPrompt, createUser: false })
```

虽然函数名仍叫 `triggerNativeRegenerate`，但实际已经不是 native `/trigger` 路线。

## 当前问题的成因判断

当前混合路线的问题在于，same-layer 同时维护两套生成语义：

- `runGenerationFlow` 管理同层占位、流式 token、done 写回、MVU reprocess、生命周期、保存。
- `runNativeSendProxy` / `runOpeningNativeGeneration` 把生成交给宿主原生 send/trigger，然后 same-layer 通过宿主事件、隐藏楼层策略和 transcript rebuild 追赶状态。

这会带来几个不稳定点：

- 普通正文和 opening assistant 不是同一个执行入口，bug 修复经常只覆盖其中一条。
- 宿主 affected refresh 后，同层 UI 可能读到宿主渲染残留，而不是同层原始正文。
- MVU 额外回传、图片插件、生命周期事件会在 native 路线和 generate 路线中以不同顺序发生。
- 宏上下文依赖“隐藏楼层何时临时显示”，混合路线会让判断变复杂。

上一轮“正文被吞，只显示 streaming done”的修复，本质上是在宿主渲染残留进入同层 transcript 前做过滤；它是必要兜底，但不是统一生成轨道本身。

## 回迁目标

把 same-layer 中所有“正文生成”统一回 `runGenerationFlow`：

| 场景 | 目标入口 |
| --- | --- |
| 普通正文发送 | `runGenerationFlow({ prompt, createUser: true })` |
| 宿主输入框被 same-layer 拦截后的发送 | `submitPromptViaSameLayer -> runGenerationFlow({ createUser: true })` |
| 改词重生 | `runGenerationFlow({ prompt, createUser: false })` |
| opening 首次生成 | `runGenerationFlow({ createUser: false, detachedUserInput: true, maxChatHistory: 0, emitLifecycleKind: 'normal' })` |
| opening 重ROLL | 同 opening 首次生成，复用 frozen compiled prompt |

`nativeSendProxy.ts` 不作为第一阶段删除目标，只断开调用方，保留回滚余地。

## 最稳妥修改方案

### 阶段 1：测试先行，翻转旧契约

先改测试，让当前 native send 契约变成红灯。

需要更新的测试：

- `streamingFlow.test.js`
  - 将“runDemo routes normal sends through host native send proxy”改为“runDemo routes normal sends through runGenerationFlow”。
  - 断言 `runDemo` 调用 `submitPromptViaSameLayer(prompt, 'ui')` 或直接 `runGenerationFlow({ prompt, createUser: true })`。
  - 断言 `runDemo` 不调用 `runNativeSendProxy`。

- `openingSimplifiedFlowSource.test.js`
  - 将“generateOpening uses native send chain”反向改为“generateOpening uses detached generate flow”。
  - 断言 `generateOpening` 调用 `runOpeningDetachedGeneration(compiledPromptSnapshot)`。
  - 断言 `runOpeningDetachedGeneration` 内部调用 `runGenerationFlow({ detachedUserInput: true, maxChatHistory: 0 })`。
  - 断言 opening 路线不调用 `sendToNativeChat`。

- `runDemoNativeProxySource.test.js`
  - 第一阶段可改名或改断言为“native send proxy is not the same-layer primary send path”。
  - 如果测试价值不高，第二阶段再删除。

必须保留并继续通过的测试：

- `regenerateFlowSource.test.js`
- `regenerateMacroCompatibility.test.js`
- `regenerateMacroCompatibilitySource.test.js`
- `openingMacroCompatibilitySource.test.js`
- `postDoneSideEffectsQueue.test.js`
- `streamingFlow.test.js` 中 streaming done 宿主残留过滤相关断言

### 阶段 2：普通正文回到 generate

把：

```ts
runDemo()
  -> runNativeSendProxy(prompt)

submitPromptViaSameLayer()
  -> runNativeSendProxy(text)
```

改为：

```ts
runDemo()
  -> submitPromptViaSameLayer(prompt, 'ui')

submitPromptViaSameLayer()
  -> runGenerationFlow({ prompt: text, createUser: true })
```

保留原有输入清空逻辑：

```ts
if (submitted && (nextPrompt == null || prompt === String(input.value ?? '').trim())) {
  input.value = '';
}
```

这样普通正文重新遵循文档中的同层前端界面模型：UI 自己创建楼层、自己 `generate`、自己用 `refresh:none` 维护显示。

### 阶段 3：opening 回到 detached generate

把：

```ts
generateOpening()
  -> runOpeningNativeGeneration(compiledPromptSnapshot)

rerollOpening()
  -> runOpeningNativeGeneration(compiledPromptSnapshot)
```

改为：

```ts
generateOpening()
  -> runOpeningDetachedGeneration(compiledPromptSnapshot)

rerollOpening()
  -> runOpeningDetachedGeneration(compiledPromptSnapshot)
```

`runOpeningDetachedGeneration` 当前已经存在，并且已经按 generate 轨道写好：

```ts
runGenerationFlow({
  prompt: compiledPromptSnapshot,
  createUser: false,
  detachedUserInput: true,
  maxChatHistory: 0,
  emitLifecycleKind: 'normal',
  onAssistantPlaceholderCreated: ...
})
```

这一步应尽量只改调用方，不重写 opening payload 状态机。

### 阶段 4：保留宏上下文保障

普通正文和重生：

- `runGenerationFlow` 非 detached 模式继续使用 `max_chat_history: 'all'`。
- 生成前继续 `collectGenerationRevealMessageIds`，把 hidden story messages 临时设为 `is_hidden: false`。
- 生成完成后恢复隐藏。

opening：

- `buildOpeningCompiledUserInput` 继续在 latest-user visibility window 内调用 `substitudeMacros(compiledTemplate)`。
- detached opening 继续 `max_chat_history: 0`，因为 opening prompt 是独立完整 prompt，不应吃历史正文。

这能同时覆盖：

- 酒馆助手宏：在编译 opening prompt 时显式替换。
- 酒馆宏 / Tavern prompt assembly：普通正文和重生通过临时 reveal hidden messages 保证上下文可见。

### 阶段 5：保留必要兜底

必须保留：

- `isHostRenderedStreamDemoWrapperOnlyHtml` 过滤。
- post-done queue。
- explicit save guardian。
- MVU reprocess。
- generated image bridge。

这些不是 native/send 轨道专属，而是 same-layer generate 轨道稳定运行所需的后处理。

### 阶段 6：第二阶段清理旧 native send

确认 Playwright 实测和核心测试都稳定后，再做清理：

- 删除或废弃 `runNativeSendProxy`。
- 删除或废弃 `runOpeningNativeGeneration`。
- 移除 `sendToNativeChat` import。
- 评估是否删除 `nativeSendProxy.ts` 和对应测试。

这一步不建议和第一阶段混在一起，避免一次 diff 同时改变行为和删除回滚入口。

## 验证清单

代码测试：

```bash
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/streamingFlow.test.js"
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/openingSimplifiedFlowSource.test.js"
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/regenerateFlowSource.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/regenerateMacroCompatibility.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/regenerateMacroCompatibilitySource.test.js"
node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/openingMacroCompatibilitySource.test.js" "src/寒冬末日/界面同层版/界面/状态栏/__tests__/postDoneSideEffectsQueue.test.js"
pnpm build
```

浏览器回归：

- opening 首次生成：应出现 opening assistant 正文，不应生成只有 `streaming done` 的空卡。
- 普通正文发送：应创建 user + assistant，流式期间同层 UI 可读。
- 改词重生：编辑最后 user 后，只生成一个新的 assistant，正文不被 MVU 回传吞掉。
- opening 重ROLL：复用 frozen compiled prompt，仍走 detached `generate`。
- 宏验证：在 prompt 中放入酒馆助手宏和酒馆宏，确认普通正文、重生、opening 编译后的上下文都能生效。

## 推荐执行策略

建议先做“断调用、不删文件”的最小回迁：

1. 改测试契约。
2. 改 `runDemo` / `submitPromptViaSameLayer`。
3. 改 `generateOpening` / `rerollOpening`。
4. 跑测试和 build。
5. 做 Playwright 实测。
6. 稳定后再清理 native send 旧代码。

这样风险最低，因为核心 `runGenerationFlow` 已经存在，opening detached helper 也已经存在；我们只是把入口重新接回文档推荐的同层前端界面轨道。

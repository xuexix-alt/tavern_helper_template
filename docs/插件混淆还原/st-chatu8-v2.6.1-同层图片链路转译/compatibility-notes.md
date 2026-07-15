# same-layer 兼容要点

> **当前版本校正：** 本文原始结论来自 v2.6.x。当前 v2.7.7 的占位节点是 `.st-chatu8-image-span`，请求身份是 `data-request-id`；`span.image-tag-placeholder`、`data-stable-id` 和 Stego-only 图片存储描述仅保留为历史兼容说明。详见 [`../st-chatu8-v2.7.7-当前源码核对.md`](../st-chatu8-v2.7.7-当前源码核对.md)。

## 1. 事件监听要求

同层 UI 的插件原生生图监听不能只包含：

```text
ch-llm-image-gen-request
ch-llm-image-gen-response
```

还要监听：

```text
regex-st-chatu8-test-message
regex-st-chatu8-result-message
st_chatu8_auto_click_complete
character_message_rendered
```

其中 `character_message_rendered` 来自酒馆 `tavern_events`，它是插件 `saveImageGroup` 后宿主正文 DOM 更新的关键交接点。

## 2. 统一交接函数

建议把上述事件都导向同一条 host-render handoff：

```text
schedulePluginNativeHostRenderHandoff(reason, payload)
  → 从 payload / recentIntent / assistantMessageId 收集 messageIds
  → syncPendingRequestHintsFromDom()
  → syncTranscriptItemsFromHostData(reason, messageIds)
  → queueGeneratedImageEntityRefresh(messageIds, reason)
  → scheduleHostImageDataReconcile(reason, messageIds)
  → schedulePluginNativePromptPlaceholderReconcile(reason, messageIds)
  → 短延迟 80ms / 240ms 再 probe 一次
```

这样可以覆盖：

- 插件事件先于 DOM mutation 的情况
- 宿主渲染比 LLM response 晚一拍的情况
- 自动点击完成后才补齐按钮/placeholder 的情况

## 3. placeholder-only mutation 不能忽略

原先的 DOM observer 只在 `hasReadyChatu8Mutation` 为真时刷新，也就是等真实图片 `src` 写入。v2.6.x 下这样会错过正文位置，因为位置在按钮/占位 span 阶段已经确定。

正确策略：

```text
if 有 st-chatu8 相关 mutation:
  syncPendingRequestHintsFromDom()
  affectedMessageIds = collectMutationMessageIds(records)

  if 没有 ready img[src]:
    schedulePluginNativePromptPlaceholderReconcile(..., affectedMessageIds)
    return

  queueGeneratedImageEntityRefresh(affectedMessageIds, ...)
```

## 4. 锚点与去重

- `image###...###` token marker 要优先作为替换位置。
- 若 token marker 已经匹配成功，应删除相同 token 的 fallback hint，避免同一按钮又通过 regex anchor 追加一次。
- `extra.images` 在图片未 ready 前也要读原始 record，因为 `regex` / `anchorText` 可能已经存在，`src` 可能还没有。

## 5. 调试判断

若再次出现“图片只在末尾，不进正文”，优先检查：

1. 日志里是否有 `character_message_rendered`，以及我们的 handoff trace 是否跟随出现。
2. 宿主 `.mes[mesid] .mes_text` 中是否已经有 `.st-chatu8-image-button`。
3. placeholder-only mutation 是否触发了 `same_layer.plugin_native_placeholder_dom_mutation` 或 `host.plugin_native_placeholder_dom_mutation`。
4. `appendChatu8ArtifactsToHtml` 是否读取的是 original host roots，而不是 same-layer transcript roots。

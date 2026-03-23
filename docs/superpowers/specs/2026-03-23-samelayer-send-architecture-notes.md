# Same-layer Send Architecture Notes

> Created: 2026-03-23
> Context: After debug trace rollout (debugTrace.ts + debugTraceLifecycle.ts wired into useStreamingDemo.ts)

## Background

在 `界面同层版` 中，用户通过 UI 触发发送（StoryPage 的 send 按钮）走的是**插件自定义路径**，而不是宿主酒馆原生的 `sendMessage` 路径。这导致某些生命周期事件（如 `generation_started`、`generation_ended`、`stream_token`）与宿主行为不完全对齐，偶发出现 transcript 双写/双 patch 问题。

---

## Route A: UI send 委托给宿主原生 send

**思路**：UI 侧不自己维护发送流程，而是调用酒馆插件 API 中已有的宿主 send 入口，让宿主自己触发 `generation_started` → `stream_token` → `generation_ended` 完整链路。

**涉及文件：**
- `useStreamingDemo.ts`：移除 `_streamingDemo_sendMessage` 的自定义 patch 逻辑，改为调用宿主 send API
- `StoryPage.vue`：send 按钮 handler 简化，不再手动传 traceId
- `debugTraceLifecycle.ts`：`shouldIgnoreHostRefreshDuringBusy` 可能部分失效，需重新评估

**优点：**
- 和宿主行为天然对齐，不需要维护双路径
- `generation_started` / `stream_token` 等事件由宿主统一触发，无重复 patch 风险
- epoch controller、suppress window 等防护逻辑可以大幅简化

**风险：**
- 宿主 send API 在 iframe 内调用的权限边界需验证（postMessage vs 直接调用）
- 宿主 send 触发的 `host_refresh` 事件时序可能与同层 UI 的渲染节奏不一致
- 开场生成（Opening）流程本来就走插件自定义路径，两路合并会增加统一成本
- 若宿主未来更新了 send API 签名，同层侧需同步跟进

**维护风险评级：** 中期低，短期高（需要先打通 iframe 内宿主调用链路）

---

## Route B: UI send 保持自定义，但补全宿主等效生命周期

**思路**：保留现有插件自定义发送路径，但在 `useStreamingDemo.ts` 内部严格模拟宿主的完整生命周期事件序列，使插件侧行为与宿主等效。

**涉及文件：**
- `useStreamingDemo.ts`：在 send 流程中补全 `generation_started` 触发时机、`host_refresh` 抑制窗口校准
- `debugTraceLifecycle.ts`：补充 `shouldCreateAssistantPlaceholderOnFirstToken`、`shouldPrewarmHostMesTextAfterPatch` 等节点的 trace 埋点
- `hostMesTextRender.ts`：确保 pre-warm 时机与宿主等效
- `StoryPage.vue`：仅在需要 UI bootstrap trace 时修改

**优点：**
- 不依赖宿主 send API 的 iframe 可达性，风险更可控
- 现有防护逻辑（epoch controller、suppress window、`shouldIgnoreHostRefreshDuringBusy`）可继续复用
- 开场生成和普通生成可以共享同一套生命周期管理逻辑

**风险：**
- 需要长期跟踪宿主行为变化，手动保持等效
- `useStreamingDemo.ts` 已 2979 行，继续膨胀的维护成本高
- 若宿主内部增加了新的 patch 或 rebuild 节点，插件侧可能错过

**维护风险评级：** 短期低，长期中（需要定期对齐宿主行为）

---

## 推荐决策标准

收集到 trace 证据后，按以下标准选择：

| 条件 | 推荐路线 |
|------|----------|
| trace 显示双 patch 根因在「宿主 host_refresh 与插件 patch 并发」 | Route A（委托宿主，消除并发根源） |
| trace 显示双 patch 根因在「插件自身 epoch 管理失效」 | Route B（补全插件侧生命周期，修 epoch 控制） |
| iframe 内宿主 send API 不可直接调用 | Route B（必选） |
| `useStreamingDemo.ts` 预计拆分（见 BUG-04 plan）| 两路均可，拆分后 Route A 成本更低 |

---

## Debug Trace 使用方法

在浏览器控制台启用：

```js
// 方式 1：localStorage
localStorage.setItem('stream_demo_debug', '1')

// 方式 2：运行时 flag
window.__STREAM_DEMO_DEBUG__ = { enabled: true }
```

查看事件：

```js
// 查看所有事件
window.__STREAM_DEMO_DEBUG__.events

// 按 traceId 分组
window.__STREAM_DEMO_DEBUG__.groupByTrace()

// 清空
window.__STREAM_DEMO_DEBUG__.clear()
```

Trace 事件结构：`{ ts, traceId, scope, event, payload }`

---

## 已实现的 Trace 埋点

`useStreamingDemo.ts` 中已接入的关键节点（截至 2026-03-23）：

- `installDebugTraceRuntime`：模块加载时安装到 `window.__STREAM_DEMO_DEBUG__`
- `recordDebugTrace`：generation 生命周期关键节点埋点

`debugTraceLifecycle.ts` 提供的纯函数帮助器（可独立测试）：

- `shouldIgnoreHostRefreshDuringBusy` — 防止 busy 期间 host_refresh 触发重建
- `shouldSuppressLifecycleEchoHostRefresh` — 抑制窗口内的 echo 事件
- `shouldCreateAssistantPlaceholderOnFirstToken` — 首 token 时创建 placeholder 判断
- `shouldEnsureAssistantPlaceholderBeforeFinalize` — finalize 前确保 placeholder 判断
- `shouldPrewarmHostMesTextAfterPatch` — patch 后 pre-warm host mes_text 判断
- `buildDemoAssistantFinalBodySource` — 最终 body 来源选择
- `summarizeTranscriptForDebug` — transcript 摘要（含 hash 签名，用于重复检测）
- `createGenerationListenerEpochController` — epoch 控制器（防止陈旧回调写入）

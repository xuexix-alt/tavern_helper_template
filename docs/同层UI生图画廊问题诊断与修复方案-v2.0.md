# 同层 UI 生图和画廊问题诊断与修复方案 v2.0

> **版本**: v2.0  
> **日期**: 2026-06-04  
> **基于**: 插件源码审计 + 实际运行日志 + 架构设计文档  

---

## 执行摘要

**核心发现：**
1. ✅ 插件事件链路完整且符合接口要求（已验证）
2. ✅ 触发目标正确（mes_text，非 iframe 元素）
3. ❌ **Same-layer UI 的事件监听器因架构设计变更被完全移除**
4. ❌ **监听器移除是正确的（避免双真相），但缺少轻量级监控层**

**问题本质：**
- 2026-03-23 架构重构后，UI 不再自己持久化图片（正确）
- 但同时移除了**所有事件监听**，包括监控、日志、错误提示（过度删除）
- 导致 UI 无法感知生图进度、失败原因、请求状态

---

## 一、插件实际运行链路（基于源码）

### 1.1 完整事件时序

根据 [autoLLMClick.js](docs/插件混淆还原/st-chatu8/utils/iframe/autoLLMClick.js) 和实际日志：

```text
22:52:18.190  用户触发（双击 mes_text）
22:52:18.247  用户选择操作: 图片生成
22:52:18.262  regex-st-chatu8-test-message       ← 插件开始解析正文
22:52:18.456  regex-st-chatu8-result-message     ← 正则规则匹配完成
22:52:18.517  ch-llm-image-gen-request           ← LLM 开始生成提示词

--- LLM 生成提示词（约 60 秒）---

22:53:18.151  ch-llm-image-gen-response          ← LLM 返回提示词
22:53:18.170  [parseImagesFromPrompt] 解析：4 张图片
22:53:18.172  [imageInserter] saveImageGroup     ← 保存图片组元数据
22:53:19.302  character_message_rendered         ← 宿主重渲染 DOM ⚠️ 关键时点
22:53:19.465  st_chatu8_auto_click_complete      ← 自动点击完成

22:53:19.477  generate-image-request (×4)        ← 真实生图请求
22:53:19.502  generate-image-request
22:53:19.529  generate-image-request
22:53:19.552  generate-image-request

--- 真实生图（12-28 秒不等）---

22:53:31.316  generate-image-response            ← 第 1 张图回来
22:53:37.011  generate-image-response            ← 第 2 张
22:53:59.424  generate-image-response            ← 第 3 张
22:54:27.752  generate-image-response            ← 第 4 张
```

### 1.2 关键发现

1. **`character_message_rendered` 是 DOM 交接点**
   - 在此之前：插件只完成了 `saveImageGroup`（元数据）
   - 在此之后：宿主 `.mes_text` 中出现按钮/placeholder
   - 如果只监听 `ch-llm-image-gen-response`，**早一拍**，拿不到 DOM

2. **按钮/placeholder 阶段决定图片位置**
   - 真实图片 `src` 到达前，位置已经确定
   - 依据：`image###...###` token 或 `regex` anchor
   - 不能等 `generate-image-response` 再找位置

3. **插件自己会发送 `generate-image-request`**
   - 来源：[autoLLMClick.js:473](docs/插件混淆还原/st-chatu8/utils/iframe/autoLLMClick.js#L473) `handlePromptRequest(element, 'gesture1')`
   - Same-layer UI **不需要**自己发送请求
   - 只需要**监听和响应**即可

---

##二、架构演变历史

### 2.1 旧架构（双真相系统）—— 已废弃

```text
插件原生链：
  mes_text → extra.images → chatMetadata

UI 自己维护：
  generate-image-response → IndexedDB → stream_demo.generated_images
  
问题：
  ✗ 数据不一致（双真相）
  ✗ UI 关闭后恢复失败（IndexedDB 是 UI 私有的）
  ✗ 插件断链被 UI 的 fallback 掩盖
```

### 2.2 新架构（插件原生唯一真相）—— 2026-03-23

根据 [2026-03-23-samelayer-plugin-native-full-compat-a1-design.md](docs/superpowers/specs/2026-03-23-samelayer-plugin-native-full-compat-a1-design.md)：

```text
唯一真相层：
  1. chat[mesId].extra.images[swipeId]    （一级）
  2. chat[mesId].mes                       （二级）
  3. chatMetadata['st-chatu8']            （fallback）

Same-layer UI 只负责：
  1. 宿主 mes_text 预热
  2. 交互桥接
  3. NativeFirst 读取与展示

明确删除：
  ✗ persistGeneratedImageResponse()
  ✗ bindImagePersistenceEvents()
  ✗ stream_demo.generated_images
  ✗ IndexedDB 图片持久化
```

### 2.3 问题：过度删除

**删除正确的部分：**
- ✅ 不再持久化到 IndexedDB
- ✅ 不再写入 `stream_demo.generated_images`
- ✅ 避免双真相系统

**过度删除的部分：**
- ❌ 完全移除事件监听（包括监控功能）
- ❌ 无法感知生图进度
- ❌ 无法显示生图失败错误
- ❌ 无调试日志输出

---

## 三、当前问题诊断

### 3.1 症状

- ✅ 插件事件正常发出（4 个 request，4 个 response）
- ❌ Same-layer UI 日志完全没有反应
- ❌ 图片无法在 UI 中显示
- ❌ 画廊为空

### 3.2 根本原因

**查找 `imageGenerationEventBridge` 使用位置：**

```bash
# 搜索结果：
src/寒冬末日/界面同层版/界面/状态栏/imageGenerationEventBridge.ts  # 定义
src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts            # 导入但未使用
src/寒冬末日/界面同层版/界面/状态栏/__tests__/*.test.js            # 测试
```

**测试验证（故意确保不存在）：**

```javascript
// pluginNativeImageArtifacts.test.js:396-398
assert.equal(
  useStreamingDemoSource.includes('bindImagePersistenceEvents();'),
  false,
  'onMounted runtime should not mount bindImagePersistenceEvents() in active flow',
);
```

**结论：事件桥接被完全移除，没有任何监听器在运行。**

---

## 四、修复方案

### 4.1 设计原则

1. ✅ **保持单一真相层**：插件原生链是唯一数据源
2. ✅ **不恢复 IndexedDB 持久化**：避免双真相
3. ✅ **添加轻量级监控层**：监听事件但不持久化
4. ✅ **补齐关键时点监听**：`character_message_rendered`

### 4.2 修复步骤

#### 步骤 1：恢复事件监听（仅用于监控）

**文件**: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`

**位置**: `onMounted()` 钩子中

**原代码**（已被删除）：
```typescript
// 无任何事件桥接代码
```

**修改为**：
```typescript
onMounted(() => {
  // ✅ 恢复事件监听，但只用于监控、日志、错误提示
  // ❌ 不做图片持久化、不写入 stream_demo.generated_images
  
  let imageBridge: ImageGenerationBridgeHandle | null = null;
  
  // 只在有全局 eventOn/eventRemoveListener 时启用
  if (typeof window.eventOn === 'function' && typeof window.eventRemoveListener === 'function') {
    imageBridge = createImageGenerationEventBridge({
      eventOn: window.eventOn,
      eventRemoveListener: window.eventRemoveListener,
      
      // 监听请求（记录日志）
      onRequest: ({ requestId, prompt }) => {
        recordDebugTrace('imageGenerationBridge', 'on_request', {
          requestId,
          promptHead: prompt.slice(0, 60),
          timestamp: Date.now(),
        });
        
        // 标记最近意图（用于响应归属）
        const assistantMessageId = readLatestAssistantMessageId();
        if (assistantMessageId != null) {
          imageRecentIntentStore.mark(assistantMessageId, 'bridge.on_request');
        }
      },
      
      // 监听成功响应（触发 UI 刷新，但不持久化）
      onResponseSuccess: ({ requestId, prompt, imageData }) => {
        recordDebugTrace('imageGenerationBridge', 'on_response_success', {
          requestId,
          promptHead: prompt.slice(0, 60),
          imageDataBytes: imageData.length,
          timestamp: Date.now(),
        });
        
        // ✅ 刷新 UI 显示（从插件原生层读取）
        // ❌ 不再调用 storeImage() 或 persistGeneratedImageResponse()
        
        // 从 pending task 和 recent intent 推断目标 messageIds
        const targetMessageIds = resolveImageResponseTargetMessageIds({ requestId, prompt });
        
        // 同步宿主数据
        syncTranscriptItemsFromHostData('host.plugin_native_response_success', targetMessageIds);
        
        // 刷新图片实体
        queueGeneratedImageEntityRefresh(targetMessageIds, 'host.plugin_native_response_success');
        
        // 触发画廊和正文刷新
        scheduleUiRefresh(['gallery', 'transcript'], 'image-response-success');
        
        // 延迟补偿（处理异步写入）
        scheduleHostImageDataReconcile('host.plugin_native_response_success', targetMessageIds);
        schedulePluginNativePromptPlaceholderReconcile('host.plugin_native_response_success', targetMessageIds);
      },
      
      // 监听失败响应（显示错误）
      onResponseFailure: ({ requestId, prompt, error }) => {
        recordDebugTrace('imageGenerationBridge', 'on_response_failure', {
          requestId,
          promptHead: prompt.slice(0, 60),
          error: error.slice(0, 120),
          timestamp: Date.now(),
        });
        
        // 显示友好错误提示
        const summary = summarizeImageGenerationFailure({ requestId, prompt, error });
        console.error('[same-layer] 生图失败', summary);
        
        // 可选：显示 toast 通知
        // showToast?.(summary.short, 'error');
      },
      
      recordTrace: recordDebugTrace,
    });
  }
  
  onUnmounted(() => {
    imageBridge?.uninstall();
  });
});
```

#### 步骤 2：监听 `character_message_rendered` 事件

**位置**: 同样在 `useStreamingDemo.ts` 的事件监听部分

**添加**：
```typescript
// 监听宿主 character_message_rendered 事件
window.eventSource?.on?.('character_message_rendered', (eventData) => {
  recordDebugTrace('tavernEvents', 'character_message_rendered', {
    eventData,
    timestamp: Date.now(),
  });
  
  // 从 eventData 或当前状态推断 messageId
  const messageId = eventData?.message_id ?? readLatestAssistantMessageId();
  if (messageId == null) return;
  
  // 同步 pending request hints（从 DOM 读取 requestId）
  syncPendingRequestHintsFromDom();
  
  // 短延迟后刷新（给插件 DOM 更新留时间）
  setTimeout(() => {
    // 扫描宿主 DOM 工件
    syncTranscriptItemsFromHostData('tavern.character_message_rendered', [messageId]);
    
    // 刷新图片实体
    queueGeneratedImageEntityRefresh([messageId], 'tavern.character_message_rendered');
    
    // 触发 placeholder reconcile（处理按钮/占位符阶段）
    schedulePluginNativePromptPlaceholderReconcile('tavern.character_message_rendered', [messageId]);
  }, 120);
});
```

#### 步骤 3：补充 placeholder-only mutation 处理

**文件**: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`

**位置**: 宿主 DOM MutationObserver 回调中

**修改逻辑**：
```typescript
// 当前逻辑：只在 hasReadyChatu8Mutation 时刷新
// 问题：错过 placeholder 阶段

// ✅ 修改为：
if (hasChatu8RelatedMutation) {
  syncPendingRequestHintsFromDom();
  const affectedMessageIds = collectMutationMessageIds(records);
  
  // 即使没有 ready img[src]，也要处理 placeholder
  if (!hasReadyChatu8Mutation) {
    // placeholder-only mutation
    recordDebugTrace('hostDomMutation', 'placeholder_only', {
      affectedMessageIds,
      timestamp: Date.now(),
    });
    
    schedulePluginNativePromptPlaceholderReconcile(
      'host.plugin_native_placeholder_dom_mutation',
      affectedMessageIds
    );
    return;
  }
  
  // 有 ready 图片
  queueGeneratedImageEntityRefresh(affectedMessageIds, 'host.plugin_native_dom_mutation');
  scheduleUiRefresh(['gallery', 'transcript'], 'host-dom-mutation');
}
```

#### 步骤 4：确保图片读取优先级正确

**文件**: `src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts`

**验证读取顺序**（应该已经正确，但需确认）：
```typescript
// ✅ 正确的 NativeFirst 顺序：
function buildGeneratedImageRefsForMessage(messageId) {
  const sources = [
    readFromHostDom(messageId),           // 1. 宿主 DOM 工件
    readFromExtraImages(messageId),       // 2. extra.images
    readFromMesTags(messageId),           // 3. mes 中的 image tag
    readFromChatMetadata(messageId),      // 4. chatMetadata fallback
    // ❌ 不再有：readFromStreamDemo(messageId)
  ];
  
  return mergeAndDedupe(sources);
}
```

### 4.3 测试更新

**文件**: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js`

**更新断言**：
```javascript
// 原测试（确保 bindImagePersistenceEvents 不存在）
assert.equal(
  useStreamingDemoSource.includes('bindImagePersistenceEvents();'),
  false,
  'onMounted runtime should not mount bindImagePersistenceEvents() in active flow',
);

// ✅ 保持不变（因为我们没有恢复 bindImagePersistenceEvents）
// ✅ 我们添加的是 createImageGenerationEventBridge，用途不同

// 可选：添加新测试验证监听器存在但不持久化
assert.equal(
  useStreamingDemoSource.includes('createImageGenerationEventBridge'),
  true,
  'runtime should mount event bridge for monitoring',
);

assert.equal(
  useStreamingDemoSource.includes('storeImage('),
  false,
  'runtime should not call storeImage for active writes',
);
```

---

## 五、预期效果

### 5.1 修复后的日志输出

```text
22:53:19.477  generate-image-request
→ [imageGenerationBridge] on_request (requestId=xxx, promptHead=...)

22:53:31.316  generate-image-response
→ [imageGenerationBridge] on_response_success (requestId=xxx, imageDataBytes=...)
→ [same-layer] syncTranscriptItemsFromHostData (reason=host.plugin_native_response_success)
→ [same-layer] queueGeneratedImageEntityRefresh (messageIds=[9])
→ [same-layer] scheduleUiRefresh (domains=['gallery', 'transcript'])

22:53:19.302  character_message_rendered
→ [tavernEvents] character_message_rendered (messageId=9)
→ [same-layer] syncPendingRequestHintsFromDom
→ [same-layer] schedulePluginNativePromptPlaceholderReconcile
```

### 5.2 功能恢复

- ✅ 图片在正文正确位置显示（基于 placeholder 锚点）
- ✅ 画廊显示所有生成的图片
- ✅ 生图失败时显示友好错误
- ✅ 调试日志完整输出
- ✅ UI 关闭后重新打开仍能恢复图片（从 extra.images 读取）

### 5.3 架构合规性

- ✅ 插件原生链是唯一真相层
- ✅ 不写入 IndexedDB
- ✅ 不写入 `stream_demo.generated_images`
- ✅ 避免双真相系统
- ✅ 通过测试：`bindImagePersistenceEvents` 不存在

---

## 六、验证清单

- [ ] 运行测试：`node --test "src/寒冬末日/界面同层版/界面/状态栏/__tests__/pluginNativeImageArtifacts.test.js"`
- [ ] 验证日志：生图时能看到 `[imageGenerationBridge]` 相关日志
- [ ] 功能测试：在 mesId=9 触发生图，图片出现在正文正确位置
- [ ] 画廊测试：打开画廊能看到所有生成的图片
- [ ] 重载测试：关闭 UI，刷新页面，重新打开 UI，图片仍然显示
- [ ] 失败测试：模拟生图失败，UI 能显示错误提示
- [ ] 静态检查：`rg -n "storeImage\(|stream_demo\.generated_images" src` 无命中

---

## 七、与旧方案的对比

| 维度 | 旧架构（双真相） | 2026-03-23 重构 | 本修复方案 |
|------|------------------|-----------------|------------|
| **图片持久化** | UI 自己维护 IndexedDB | ❌ 完全移除 | ❌ 不恢复 |
| **事件监听** | 持久化用途 | ❌ 完全移除 | ✅ 恢复（监控用途） |
| **数据真相层** | 双真相（插件+UI） | 单一（插件） | 单一（插件） |
| **错误提示** | 有 | ❌ 无 | ✅ 有 |
| **调试日志** | 有 | ❌ 无 | ✅ 有 |
| **重载恢复** | ❌ 失败（依赖 IndexedDB） | ✅ 成功（插件原生） | ✅ 成功（插件原生） |

---

## 八、后续优化建议

### 8.1 短期（P0）

1. 实施本修复方案
2. 补充集成测试
3. 更新开发文档

### 8.2 中期（P1）

1. 优化 `character_message_rendered` 的延迟策略
2. 增强 placeholder reconcile 的去重逻辑
3. 添加性能监控（生图耗时统计）

### 8.3 长期（P2）

1. 考虑与插件作者协作，标准化事件接口
2. 探索更主动的预热策略（在 LLM response 前预热 mes_text）
3. 添加用户可配置的生图超时提示

---

## 九、参考文档

- [docs/前端接入插件的说明.txt](docs/前端接入插件的说明.txt)
- [docs/当前生图业务实现-v1.0.0.md](docs/当前生图业务实现-v1.0.0.md)
- [docs/同层UI画廊机制说明-v1.0.0.md](docs/同层UI画廊机制说明-v1.0.0.md)
- [docs/superpowers/specs/2026-03-23-samelayer-plugin-native-full-compat-a1-design.md](docs/superpowers/specs/2026-03-23-samelayer-plugin-native-full-compat-a1-design.md)
- [docs/插件混淆还原/st-chatu8-v2.6.1-同层图片链路转译/](docs/插件混淆还原/st-chatu8-v2.6.1-同层图片链路转译/)
- [docs/插件混淆还原/st-chatu8/utils/iframe/autoLLMClick.js](docs/插件混淆还原/st-chatu8/utils/iframe/autoLLMClick.js)

---

## 十、结论

**问题根源：**
2026-03-23 架构重构正确地移除了双真相系统，但过度删除了事件监听功能，导致 UI 完全无法感知插件的生图流程。

**解决方案：**
恢复轻量级事件监听（监控、日志、错误提示），但**不恢复图片持久化**，保持插件原生链作为唯一真相源。

**关键平衡：**
- ✅ 监听事件 ≠ 持久化数据
- ✅ 监控层 ≠ 双真相系统
- ✅ 调试可观测性 ≠ 架构倒退

通过这个方案，我们既保持了架构的清晰性（单一真相层），又恢复了必要的可观测性（日志、错误、状态追踪）。

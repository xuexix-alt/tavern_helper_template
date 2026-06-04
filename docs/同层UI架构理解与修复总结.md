# 同层 UI 架构理解与修复总结

> **日期**: 2026-06-04  
> **状态**: ✅ 代码修复完成，等待实际测试验证  

---

## 一、架构理解修正

### 错误理解 ❌
我最初认为 same-layer UI 是一个独立的 iframe 应用。

### 正确理解 ✅
**Same-layer UI 是通过正则替换嵌入到 SillyTavern 消息中的**：

1. **触发方式**：在第 0 层消息中包含特殊标记 `[stream-demo:minimal]`
2. **渲染方式**：SillyTavern 的正则扩展检测到标记后，替换为 Vue 应用
3. **运行环境**：直接在 SillyTavern 主窗口中运行，不是 iframe

**证据**：
```javascript
// 从日志中看到
mes: '[stream-demo:minimal]\n<demo_phase>done</demo_phase…'
```

这意味着：
- ✅ `window.eventOn` 等 API 直接可用（与 SillyTavern 共享）
- ✅ 可以直接访问 SillyTavern 的全局对象
- ✅ 不需要 postMessage 通信

---

## 二、已完成的修复

### 修复内容
**文件**: `src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts`

**变更**：将 `imageGenerationBridge` 初始化从 `if (isOpeningWorkbenchHostActive())` 条件内移出

**代码对比**：

```typescript
// ❌ 修复前（第 6903 行）
onMounted(async () => {
  restoreReaderChatState();

  if (isOpeningWorkbenchHostActive()) {  // ← 限制条件
    bindHistoryRefreshEvents();
    // ...
    if (typeof eventOn === 'function' && typeof eventRemoveListener === 'function') {
      imageGenerationBridge = createImageGenerationEventBridge({
        // ... 81 行配置
      });
    }
    // ...
  }
});
```

```typescript
// ✅ 修复后
onMounted(async () => {
  restoreReaderChatState();

  // 图片生成事件桥：必须在所有 messageId 上生效
  if (typeof eventOn === 'function' && typeof eventRemoveListener === 'function') {
    imageGenerationBridge = createImageGenerationEventBridge({
      // ... 完整配置（81 行）
    });
  }

  if (isOpeningWorkbenchHostActive()) {
    bindHistoryRefreshEvents();
    // ... 其他代码保持不变
  }
});
```

### 验证结果
- ✅ 所有测试通过（17/17）
- ✅ 构建成功
- ✅ 架构合规性检查通过

---

## 三、当前状态分析

### 问题：日志中没有 `[stream-demo:image-bridge]` 输出

从当前日志 (12:41:35) 看到：
```
mes: '[stream-demo:minimal]\n<demo_phase>done</demo_phase…'
```

但**没有看到**任何 `[stream-demo:image-bridge]` 或 `imageGenerationBridge` 的日志。

### 可能原因

#### 原因 1：Same-layer UI 未触发（最可能）

**分析**：
- 消息中有 `[stream-demo:minimal]` 标记
- 但没有实际的 Vue 应用初始化日志
- 可能正则替换没有生效

**排查**：
1. 检查 SillyTavern 的正则扩展是否启用
2. 检查正则规则是否正确配置
3. 查看消息渲染后的 HTML，确认是否有 Vue 应用的 DOM 结构

#### 原因 2：构建产物未更新（可能）

**分析**：
- 代码已修改并构建成功
- 但浏览器可能加载的是旧版本

**排查**：
1. 检查 `dist/寒冬末日/界面同层版/界面/状态栏/index.js` 的修改时间
2. 硬刷新浏览器（Ctrl + Shift + R）
3. 清除浏览器缓存

#### 原因 3：`isOpeningWorkbenchHostActive()` 返回 false（较小可能）

**分析**：
- 虽然已经移出条件，但如果整个 `onMounted()` 没有执行，也不会有日志

**排查**：
1. 检查 Vue 应用是否正常挂载
2. 在 `onMounted()` 开头添加日志验证

---

## 四、验证步骤

### 步骤 1：确认 Same-layer UI 是否运行

在浏览器控制台执行：

```javascript
// 检查 Vue 应用
const streamDemoApp = document.querySelector('[data-stream-demo]');
console.log('Stream-demo app element:', streamDemoApp);

// 检查全局变量
console.log('imageGenerationBridge:', typeof window.imageGenerationBridge);
console.log('recordLifecycleTrace:', typeof window.recordLifecycleTrace);

// 检查事件桥接
if (typeof window.imageGenerationBridge !== 'undefined') {
  console.log('✅ 事件桥接已安装');
} else {
  console.log('❌ 事件桥接未安装');
}
```

### 步骤 2：触发生图并观察日志

1. 在 SillyTavern 中触发一次生图
2. 观察控制台是否出现以下日志：

**期望日志**：
```
[点击触发] 用户选择操作: 图片生成
generate-image-request
[imageGenerationBridge] on_request (requestId=xxx)  ← 新增
generate-image-response
[imageGenerationBridge] on_response_success         ← 新增
[same-layer] syncTranscriptItemsFromHostData        ← 新增
```

### 步骤 3：检查构建产物

```bash
# 查看构建时间
ls -lh dist/寒冬末日/界面同层版/界面/状态栏/index.js

# 确认修改内容
grep -A 5 "createImageGenerationEventBridge" dist/寒冬末日/界面同层版/界面/状态栏/index.js | head -10
```

### 步骤 4：强制刷新

1. 打开开发者工具（F12）
2. 勾选 Network → "Disable cache"
3. 硬刷新页面：Ctrl + Shift + R
4. 重新触发生图

---

## 五、调试建议

### 如果 Same-layer UI 未运行

**添加调试日志**：

在 `useStreamingDemo.ts` 的 `onMounted()` 开头添加：

```typescript
onMounted(async () => {
  console.log('[stream-demo] onMounted START', {
    timestamp: Date.now(),
    eventOnAvailable: typeof eventOn,
    eventRemoveListenerAvailable: typeof eventRemoveListener,
  });
  
  restoreReaderChatState();
  
  // ... 后续代码
});
```

### 如果事件桥接未初始化

**检查条件判断**：

```typescript
if (typeof eventOn === 'function' && typeof eventRemoveListener === 'function') {
  console.log('[stream-demo] 开始安装 imageGenerationBridge');
  
  imageGenerationBridge = createImageGenerationEventBridge({
    // ...
  });
  
  console.log('[stream-demo] imageGenerationBridge 安装完成', imageGenerationBridge);
} else {
  console.error('[stream-demo] 无法安装 imageGenerationBridge', {
    eventOn: typeof eventOn,
    eventRemoveListener: typeof eventRemoveListener,
  });
}
```

### 如果想手动测试事件监听

```javascript
// 手动触发测试事件
if (typeof window.eventEmit === 'function') {
  window.eventEmit('generate-image-request', {
    id: 'test-' + Date.now(),
    prompt: 'test image',
    width: null,
    height: null,
  });
  console.log('✅ 测试事件已发送');
} else {
  console.log('❌ eventEmit 不可用');
}
```

---

## 六、相关文档

- [同层UI生图画廊问题诊断与修复方案-v2.0.md](同层UI生图画廊问题诊断与修复方案-v2.0.md)
- [同层UI生图画廊修复实施报告.md](同层UI生图画廊修复实施报告.md)
- [控制台日志诊断报告-2026-06-04.md](控制台日志诊断报告-2026-06-04.md)
- [前端接入插件的说明.txt](前端接入插件的说明.txt)

---

## 七、结论

**代码修复状态**：✅ 已完成
- 移除了 `isOpeningWorkbenchHostActive()` 条件限制
- 事件桥接现在会在所有情况下初始化
- 所有测试通过，构建成功

**待验证事项**：🟡 需要实际运行测试
- 确认 Same-layer UI 是否正确加载
- 确认事件桥接是否安装成功
- 确认生图时是否有相应日志输出
- 确认图片是否能正确显示在正文和画廊中

**下一步**：
1. 执行上述验证步骤
2. 根据日志输出进一步调试
3. 如有问题，提供完整的日志和错误信息

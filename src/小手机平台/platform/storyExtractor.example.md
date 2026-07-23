# 小手机平台 - 获取酒馆正文功能使用指南

## 问题背景

当小手机使用 **OpenAI 兼容的自定义 API** 时，酒馆当前的正文不会自动注入到提示词中，导致 AI 缺少上下文信息。

**TavernProvider（酒馆 API）**：
- ✅ 自动注入正文（通过 `generateRaw` 的 `max_chat_history` 参数）

**OpenAICompatibleProvider（自定义 API）**：
- ❌ 不会自动注入正文
- ❌ `recentCompletedStory` 为空数组

## 解决方案

使用 `extractRecentCompletedStory` 函数从酒馆主聊天中读取最近的正文。

---

## 使用示例

### 示例 1：基本用法

```typescript
import { extractRecentCompletedStory } from './platform/storyExtractor';
import { createPromptContextSnapshot } from './ai/promptAssembler';

// 从 runtime 获取当前楼层 ID
const storyMessageId = runtime.getHostStoryMessageId();

// 提取最近 5 条正文
const recentStory = extractRecentCompletedStory({ 
  storyMessageId 
});

// 创建提示词快照
const snapshot = createPromptContextSnapshot({
  sessionKey: 'character::chat-id',
  snapshotKey: { chatId: 'chat-1', assistantMessageId: 10, mvuSignature: 'mvu:v1' },
  mode: '私聊',
  protocol: '你是微信聊天回复引擎',
  members: [{ name: '张三', identity: 'user-1', profile: '程序员' }],
  mvuFacts: '健康=100',
  communicationNetwork: '网络正常',
  chatLore: '之前约好今天见面',
  recentCompletedStory: recentStory, // ← 使用提取的正文
  phoneHistory: [],
  playerMessage: '到了吗？',
  outputContract: '{"messages":[{"sender":"张三","content":"文本"}]}',
  maxCharacters: 20000,
});
```

### 示例 2：自定义提取数量

```typescript
// 只提取最近 3 条正文
const recentStory = extractRecentCompletedStory({
  storyMessageId: runtime.getHostStoryMessageId(),
  maxStoryCount: 3,
});
```

### 示例 3：标记相关性

```typescript
// 将所有正文标记为不相关（可被 trim 删除）
const recentStory = extractRecentCompletedStory({
  storyMessageId: runtime.getHostStoryMessageId(),
  markAllRelevant: false,
});
```

### 示例 4：获取当前楼层正文

```typescript
import { extractCurrentStory } from './platform/storyExtractor';

const storyMessageId = runtime.getHostStoryMessageId();
const currentText = extractCurrentStory(storyMessageId);

console.log('当前楼层正文:', currentText);
```

---

## 集成到调度器

在小手机的 AI 调度器中使用：

```typescript
import { extractRecentCompletedStory } from '../platform/storyExtractor';
import { createPromptContextSnapshot, assemblePrompt } from '../ai/promptAssembler';

export async function dispatchAiRequest(job: PhoneSchedulerJob, runtime: TavernPhonePublicApi) {
  // 1. 获取当前楼层 ID
  const storyMessageId = runtime.getHostStoryMessageId();
  
  // 2. 提取正文
  const recentStory = extractRecentCompletedStory({ storyMessageId });
  
  // 3. 创建快照
  const snapshot = createPromptContextSnapshot({
    // ... 其他字段
    recentCompletedStory: recentStory,
  });
  
  // 4. 组装提示词
  const prompt = assemblePrompt(snapshot);
  
  // 5. 发送给 AI
  const provider = new OpenAICompatibleProvider({
    baseUrl: settings.apiUrl,
    model: settings.model,
    // ...
  });
  
  const request = provider.request(prompt);
  const response = await request.promise;
  
  return response;
}
```

---

## API 参考

### `extractRecentCompletedStory(options)`

从酒馆聊天记录中提取最近的正文。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `storyMessageId` | `number \| null` | ✅ | - | 当前楼层 ID（从 `runtime.getHostStoryMessageId()` 获取） |
| `maxStoryCount` | `number` | ❌ | `5` | 最多提取多少条正文 |
| `markAllRelevant` | `boolean` | ❌ | `true` | 是否标记所有正文为相关（`false` 时可被 trim 删除） |

**返回值：** `PromptSourceEntry[]`

```typescript
interface PromptSourceEntry {
  id: string;        // 格式：'story-{messageId}'
  content: string;   // 正文内容
  relevant: boolean; // 是否相关
}
```

**边界情况：**
- 如果 `storyMessageId` 为 `null`，返回空数组
- 如果读取失败（如非酒馆环境），返回空数组
- 自动过滤掉隐藏的消息
- 只提取 `assistant` 角色的消息（AI 回复）

---

### `extractCurrentStory(storyMessageId)`

提取当前楼层的正文内容。

**参数：**
- `storyMessageId`: `number | null` - 当前楼层 ID

**返回值：** `string` - 正文内容，失败时返回空字符串

---

## 注意事项

1. **仅在非酒馆 API 时使用**：使用 `TavernProvider` 时不需要手动提取正文
2. **性能考虑**：每次提取都会调用 `getChatMessages()`，不要过于频繁调用
3. **错误处理**：函数内部已处理异常，返回空数组而不是抛出错误
4. **楼层范围**：自动计算合理的楼层范围，避免读取过多数据

---

## 房东模拟器参考

本实现参考了房东模拟器中小手机的正文获取方式，采用相同的架构：
- 通过 `PhoneHostBridge.getStoryMessageId()` 获取当前楼层
- 使用 `getChatMessages()` 读取酒馆聊天记录
- 转换为 `PromptSourceEntry` 格式供 AI 使用

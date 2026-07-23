# 智能人员档案与任务系统 - 使用指南

## 功能概述

### 1. 智能人员档案 APP
整合多源信息，AI 自动生成和完善人物档案：
- ✅ MVU 变量中的人物数据
- ✅ 微信聊天记录
- ✅ 伊甸广播信息
- ✅ 正文中的最新互动
- ✅ 一键刷新所有档案

### 2. 智能任务板块 APP
自动解析行动并生成任务：
- ✅ 展示 MVU data 中的阶段任务
- ✅ AI 解析微信聊天生成可执行任务
- ✅ 一键执行（送入输入框）
- ✅ 任务管理（删除、刷新）

---

## 快速开始

### 安装依赖

```typescript
// 1. 导入模块
import { createIntelligenceService } from './intelligence/intelligenceService';
import { MemoryProfileStore, MemoryTaskStore } from './intelligence/storage';
import { createProfileApp, createSmartTasksApp } from './apps/intelligentApps';
import { OpenAICompatibleProvider } from './ai/providers';
```

### 初始化服务

```typescript
// 2. 创建 AI 提供者
const aiProvider = new OpenAICompatibleProvider({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'your-api-key',
  model: 'gpt-4',
});

// 3. 创建智能情报服务
const intelligenceService = createIntelligenceService(aiProvider);

// 4. 创建存储
const profileStore = new MemoryProfileStore();
const taskStore = new MemoryTaskStore();
```

### 注册 APP

```typescript
// 5. 创建服务接口实现
const services: IntelligentAppServices = {
  // ... 实现所有必需方法
  async listProfiles() {
    return await profileStore.listProfiles(sessionKey);
  },
  async refreshProfile(personId: string) {
    // 收集数据
    const chatMessages = await db.listMessages({
      sessionKey,
      type: 'private',
      conversationId: `private:${personId}`,
    });
    const broadcasts = await db.listMessages({ sessionKey, type: 'broadcast' });
    const storyMessageId = runtime.getHostStoryMessageId();
    const recentStory = extractCurrentStory(storyMessageId);

    // AI 增强档案
    const enhanced = await intelligenceService.enhanceProfile({
      personName: personId,
      chatMessages,
      broadcasts: broadcasts.map(b => ({
        source: b.source || '未知',
        content: b.content,
        trust: b.trust || 'unverified',
      })),
      recentStory,
      mvuPersonData: getMvuPersonData(personId),
    });

    // 保存到存储
    await profileStore.saveProfile(sessionKey, {
      id: personId,
      ...enhanced,
    });
  },
  // ... 其他方法
};

// 6. 注册 APP
const apps = [
  createProfileApp(services),
  createSmartTasksApp(services),
  // ... 其他 APP
];
```

---

## 核心 API 参考

### IntelligenceService

#### `enhanceProfile(request: ProfileEnhanceRequest)`
增强人员档案，返回完善后的档案数据。

**参数：**
```typescript
interface ProfileEnhanceRequest {
  personName: string;              // 人物姓名
  personBasicInfo?: string;        // 基本信息摘要
  chatMessages: PhoneMessage[];    // 微信聊天记录
  broadcasts: Array<{              // 伊甸广播
    source: string;
    content: string;
    trust: 'confirmed' | 'unverified';
  }>;
  recentStory: string;             // 最近正文互动
  mvuPersonData?: Record<string, unknown>; // MVU 变量数据
}
```

**返回值：**
```typescript
{
  name: string;
  basicInfo: string;         // AI 总结的基本信息
  personality: string;       // 性格特点
  currentStatus: string;     // 当前状态
  relationship: string;      // 与玩家的关系
  recentInteraction: string; // 最近互动摘要
  sources: {
    fromMvu: boolean;
    fromChat: boolean;
    fromBroadcast: boolean;
    fromStory: boolean;
  };
  lastUpdated: number;
}
```

---

#### `parseTasks(request: TaskParseRequest)`
从微信聊天中解析出可执行任务。

**参数：**
```typescript
interface TaskParseRequest {
  chatMessages: PhoneMessage[];    // 微信聊天记录
  storyContext: string;            // 当前正文上下文
  existingTasks?: Array<{          // MVU 现有任务
    title: string;
    description: string;
  }>;
}
```

**返回值：**
```typescript
SmartTask[] // 智能任务数组
```

**SmartTask 结构：**
```typescript
interface SmartTask {
  id: string;
  title: string;              // 任务标题
  detail: string;             // 任务详情
  type: 'mvu-stage' | 'chat-derived' | 'broadcast-derived';
  source: string;             // 来源说明
  relatedPersons: string[];   // 相关人物
  actionText?: string;        // 可执行的行动文本
  priority: 'high' | 'medium' | 'low';
  createdAt: number;
}
```

---

### 存储接口

#### ProfileStore
```typescript
interface ProfileStore {
  saveProfile(sessionKey: string, profile: PersonProfile): Promise<void>;
  getProfile(sessionKey: string, personId: string): Promise<PersonProfile | null>;
  listProfiles(sessionKey: string): Promise<PersonProfile[]>;
  deleteProfile(sessionKey: string, personId: string): Promise<void>;
}
```

#### TaskStore
```typescript
interface TaskStore {
  saveTask(sessionKey: string, task: SmartTask): Promise<void>;
  getTask(sessionKey: string, taskId: string): Promise<SmartTask | null>;
  listTasks(sessionKey: string): Promise<SmartTask[]>;
  deleteTask(sessionKey: string, taskId: string): Promise<void>;
  cleanExpiredTasks(sessionKey: string, expiryMs: number): Promise<void>;
}
```

---

## 使用场景示例

### 场景 1：刷新单个人物档案

```typescript
// 用户点击刷新按钮
async function handleRefreshProfile(personName: string) {
  try {
    // 1. 获取聊天记录
    const chatMessages = await phoneDb.listMessages({
      sessionKey: getCurrentSessionKey(),
      type: 'private',
      conversationId: `private:${personName}`,
    });

    // 2. 获取广播
    const broadcasts = await phoneDb.listMessages({
      sessionKey: getCurrentSessionKey(),
      type: 'broadcast',
    });

    // 3. 获取正文
    const storyId = runtime.getHostStoryMessageId();
    const recentStory = extractCurrentStory(storyId);

    // 4. 获取 MVU 数据
    const mvuData = await getMvuVariable(`租客列表.${personName}`);

    // 5. AI 增强
    const enhanced = await intelligenceService.enhanceProfile({
      personName,
      personBasicInfo: mvuData?.外貌,
      chatMessages,
      broadcasts: broadcasts.map(b => ({
        source: b.source || '未知',
        content: b.content,
        trust: b.trust || 'unverified',
      })),
      recentStory,
      mvuPersonData: mvuData,
    });

    // 6. 保存
    await profileStore.saveProfile(sessionKey, {
      id: personName,
      ...enhanced,
    });

    console.log('档案已更新:', enhanced);
  } catch (error) {
    console.error('刷新档案失败:', error);
  }
}
```

### 场景 2：解析聊天生成任务

```typescript
// 用户点击"重新解析聊天"
async function handleRefreshTasks() {
  try {
    // 1. 获取最近的微信聊天
    const chatMessages = await phoneDb.listMessages({
      sessionKey: getCurrentSessionKey(),
      type: 'private',
    });

    // 2. 获取当前正文上下文
    const storyId = runtime.getHostStoryMessageId();
    const storyContext = extractCurrentStory(storyId);

    // 3. 获取 MVU 现有任务
    const mvuTasks = await getMvuVariable('任务列表');

    // 4. AI 解析任务
    const smartTasks = await intelligenceService.parseTasks({
      chatMessages,
      storyContext,
      existingTasks: mvuTasks,
    });

    // 5. 保存所有任务
    for (const task of smartTasks) {
      await taskStore.saveTask(sessionKey, task);
    }

    console.log(`解析出 ${smartTasks.length} 个任务`);
  } catch (error) {
    console.error('解析任务失败:', error);
  }
}
```

### 场景 3：执行任务（送入输入框）

```typescript
// 用户点击任务的"执行"按钮
async function handleExecuteTask(task: SmartTask) {
  if (!task.actionText) {
    console.warn('任务没有可执行文本');
    return;
  }

  try {
    await runtime.submitActionToHost({
      kind: 'composer.insert',
      text: task.actionText,
      sourceKey: `task-${task.id}`,
      mode: 'replace', // 或 'append'
    });
    console.log('任务已送入输入框:', task.actionText);
  } catch (error) {
    console.error('执行任务失败:', error);
  }
}
```

---

## AI 提示词说明

### 档案增强提示词
系统会自动将以下信息整合并发送给 AI：
1. MVU 变量中的人物数据（年龄、职业、外貌等）
2. 最近 10 条微信聊天记录
3. 最近 5 条伊甸广播
4. 当前正文中的互动内容

AI 会返回：
- 基本信息总结
- 性格特点
- 当前状态
- 与玩家的关系
- 最近互动摘要

### 任务解析提示词
系统会分析最近 20 条微信聊天，识别：
1. **明确邀请**："到我家来一趟" → "去张三家里"
2. **约定会面**："明天见面吧" → "明天与张三会面"
3. **请求帮助**："能帮我买点东西吗" → "帮张三购买物品"
4. **提及地点**："在咖啡厅等你" → "前往咖啡厅与张三会面"
5. **物品交接**："把钥匙给我" → "将钥匙交给张三"

---

## 注意事项

1. **API 成本**：每次刷新都会调用 AI，请合理控制频率
2. **数据隐私**：档案数据仅存储在本地或 PhoneDb 中
3. **错误处理**：AI 可能返回格式错误，系统会自动尝试修复
4. **任务去重**：避免与 MVU 阶段任务重复
5. **存储选择**：
   - `MemoryStore`：快速但重启后丢失
   - `PhoneDbStore`：持久化但不支持删除

---

## 性能优化建议

1. **批量刷新**：一次性刷新多个档案，减少 API 调用
2. **缓存策略**：设置档案有效期，避免频繁刷新
3. **懒加载**：仅在用户打开 APP 时加载数据
4. **任务清理**：定期清理过期任务（7天以上）

```typescript
// 定期清理过期任务
setInterval(() => {
  taskStore.cleanExpiredTasks(sessionKey, 7 * 24 * 60 * 60 * 1000);
}, 24 * 60 * 60 * 1000);
```

---

## 参考

- 房东模拟器 Z5.20 的人员档案实现
- 小手机平台架构文档
- MVU 变量系统规范

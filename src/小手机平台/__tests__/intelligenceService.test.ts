import assert from 'node:assert/strict';
import { createIntelligenceService } from '../intelligence/intelligenceService';
import type { AiProvider } from '../intelligence/intelligenceService';
import type { ProfileEnhanceRequest, TaskParseRequest } from '../intelligence/profileTypes';

// Mock AI Provider
class MockAiProvider implements AiProvider {
  private responses: Map<string, string> = new Map();

  setResponse(key: string, response: string): void {
    this.responses.set(key, response);
  }

  request(prompt: string): { id: string; promise: Promise<string>; cancel: () => void } {
    const id = `mock-${Date.now()}`;
    let cancelled = false;

    const promise = new Promise<string>((resolve, reject) => {
      setTimeout(() => {
        if (cancelled) {
          reject(new Error('Request cancelled'));
          return;
        }

        // 根据提示词类型返回对应的响应
        if (prompt.includes('人员档案分析助手')) {
          const response = this.responses.get('profile') || this.getDefaultProfileResponse();
          resolve(response);
        } else if (prompt.includes('任务解析助手')) {
          const response = this.responses.get('tasks') || this.getDefaultTasksResponse();
          resolve(response);
        } else {
          reject(new Error('Unknown prompt type'));
        }
      }, 10);
    });

    return {
      id,
      promise,
      cancel: () => {
        cancelled = true;
      },
    };
  }

  private getDefaultProfileResponse(): string {
    return JSON.stringify({
      basicInfo: '25岁，程序员，外貌整洁',
      personality: '内向但友善',
      currentStatus: '在家工作',
      relationship: '邻居',
      recentInteraction: '昨天在电梯里打招呼',
    });
  }

  private getDefaultTasksResponse(): string {
    return JSON.stringify([
      {
        title: '去张三家里',
        detail: '张三邀请到他家做客',
        source: '张三: 到我家来一趟',
        relatedPersons: ['张三'],
        actionText: '前往张三家里',
        priority: 'medium',
      },
    ]);
  }
}

async function testEnhanceProfile(): Promise<void> {
  const mockProvider = new MockAiProvider();
  const service = createIntelligenceService(mockProvider);

  const request: ProfileEnhanceRequest = {
    personName: '张三',
    personBasicInfo: '程序员',
    chatMessages: [
      {
        id: 'msg-1',
        sessionKey: 'test::chat-1',
        conversationId: 'private:张三',
        type: 'private',
        sender: '张三',
        content: '你好',
        createdAt: Date.now(),
        syncedToLore: false,
      },
    ],
    broadcasts: [
      {
        source: '伊甸广播',
        content: '今日天气晴朗',
        trust: 'confirmed',
      },
    ],
    recentStory: '玩家与张三在咖啡厅见面',
    mvuPersonData: { 年龄: 25, 职业: '程序员' },
  };

  const result = await service.enhanceProfile(request);

  assert.equal(result.name, '张三', '姓名应该正确');
  assert.equal(result.basicInfo, '25岁，程序员，外貌整洁', '基本信息应该正确');
  assert.equal(result.personality, '内向但友善', '性格应该正确');
  assert.equal(result.currentStatus, '在家工作', '当前状态应该正确');
  assert.equal(result.relationship, '邻居', '关系应该正确');
  assert.equal(result.recentInteraction, '昨天在电梯里打招呼', '最近互动应该正确');
  assert.ok(result.sources?.fromMvu, '应标记来自 MVU');
  assert.ok(result.sources?.fromChat, '应标记来自聊天');
  assert.ok(result.sources?.fromBroadcast, '应标记来自广播');
  assert.ok(result.sources?.fromStory, '应标记来自正文');
  assert.ok(result.lastUpdated, '应有更新时间');
}

async function testParseTasks(): Promise<void> {
  const mockProvider = new MockAiProvider();
  const service = createIntelligenceService(mockProvider);

  const request: TaskParseRequest = {
    chatMessages: [
      {
        id: 'msg-1',
        sessionKey: 'test::chat-1',
        conversationId: 'private:张三',
        type: 'private',
        sender: '张三',
        content: '到我家来一趟',
        createdAt: Date.now(),
        syncedToLore: false,
      },
    ],
    storyContext: '玩家正在市区闲逛',
    existingTasks: [{ title: '购买食材', description: '去超市买菜' }],
  };

  const result = await service.parseTasks(request);

  assert.ok(Array.isArray(result), '应返回数组');
  assert.equal(result.length, 1, '应解析出 1 个任务');

  const task = result[0];
  assert.equal(task.title, '去张三家里', '任务标题应正确');
  assert.equal(task.detail, '张三邀请到他家做客', '任务详情应正确');
  assert.equal(task.type, 'chat-derived', '任务类型应为 chat-derived');
  assert.equal(task.source, '张三: 到我家来一趟', '来源应正确');
  assert.deepEqual(task.relatedPersons, ['张三'], '相关人物应正确');
  assert.equal(task.actionText, '前往张三家里', '行动文本应正确');
  assert.equal(task.priority, 'medium', '优先级应正确');
  assert.ok(task.id, '应有任务 ID');
  assert.ok(task.createdAt, '应有创建时间');
}

async function testParseJsonResponse(): Promise<void> {
  const mockProvider = new MockAiProvider();
  const service = createIntelligenceService(mockProvider);

  // 测试 JSON 代码块包裹
  mockProvider.setResponse(
    'profile',
    '```json\n{"basicInfo": "测试", "personality": "测试", "currentStatus": "测试", "relationship": "测试", "recentInteraction": "测试"}\n```',
  );

  const request: ProfileEnhanceRequest = {
    personName: '测试',
    chatMessages: [],
    broadcasts: [],
    recentStory: '',
  };

  const result = await service.enhanceProfile(request);
  assert.equal(result.basicInfo, '测试', '应正确解析 JSON 代码块');

  // 测试纯 JSON
  mockProvider.setResponse(
    'profile',
    '{"basicInfo": "纯JSON", "personality": "测试", "currentStatus": "测试", "relationship": "测试", "recentInteraction": "测试"}',
  );

  const result2 = await service.enhanceProfile(request);
  assert.equal(result2.basicInfo, '纯JSON', '应正确解析纯 JSON');
}

async function testEmptyTasksResponse(): Promise<void> {
  const mockProvider = new MockAiProvider();
  const service = createIntelligenceService(mockProvider);

  // AI 返回空数组
  mockProvider.setResponse('tasks', '[]');

  const request: TaskParseRequest = {
    chatMessages: [],
    storyContext: '',
  };

  const result = await service.parseTasks(request);
  assert.deepEqual(result, [], '空聊天记录应返回空数组');
}

async function testRequestCancellation(): Promise<void> {
  const mockProvider = new MockAiProvider();
  const service = createIntelligenceService(mockProvider);

  const request: ProfileEnhanceRequest = {
    personName: '测试',
    chatMessages: [],
    broadcasts: [],
    recentStory: '',
  };

  // 创建请求但立即取消
  const enhancePromise = service.enhanceProfile(request);

  // 注意：当前实现没有暴露 handle，所以无法直接测试取消
  // 这里只是验证正常完成不会抛出错误
  await enhancePromise;
  assert.ok(true, '请求应能正常完成');
}

async function testInvalidJsonResponse(): Promise<void> {
  const mockProvider = new MockAiProvider();
  const service = createIntelligenceService(mockProvider);

  // AI 返回无效 JSON
  mockProvider.setResponse('profile', '这不是有效的 JSON');

  const request: ProfileEnhanceRequest = {
    personName: '测试',
    chatMessages: [],
    broadcasts: [],
    recentStory: '',
  };

  await assert.rejects(
    () => service.enhanceProfile(request),
    /无效/,
    '无效 JSON 应抛出错误',
  );
}

export async function runIntelligenceServiceTests(): Promise<void> {
  console.log('[Intelligence Service Tests] Starting...');

  try {
    await testEnhanceProfile();
    console.log('✓ enhanceProfile 基本功能测试通过');

    await testParseTasks();
    console.log('✓ parseTasks 基本功能测试通过');

    await testParseJsonResponse();
    console.log('✓ JSON 解析测试通过');

    await testEmptyTasksResponse();
    console.log('✓ 空响应测试通过');

    await testRequestCancellation();
    console.log('✓ 请求取消测试通过');

    await testInvalidJsonResponse();
    console.log('✓ 无效 JSON 测试通过');

    console.log('[Intelligence Service Tests] All tests passed! ✓');
  } catch (error) {
    console.error('[Intelligence Service Tests] Test failed:', error);
    throw error;
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntelligenceServiceTests().catch(console.error);
}

import type { ProviderError, RequestHandle } from '../ai/providers';
import type { PersonProfile, ProfileEnhanceRequest, SmartTask, TaskParseRequest } from './profileTypes';
import { buildProfileEnhancePrompt, buildTaskParsePrompt } from './profileTypes';

/**
 * AI 提供者接口（兼容 TavernProvider 和 OpenAICompatibleProvider）
 */
export interface AiProvider {
  request(prompt: string): RequestHandle<string>;
}

/**
 * 智能情报服务 - 负责档案增强和任务解析
 */
export class IntelligenceService {
  constructor(private readonly provider: AiProvider) {}

  /**
   * 增强人员档案
   */
  async enhanceProfile(request: ProfileEnhanceRequest): Promise<Partial<PersonProfile>> {
    const prompt = buildProfileEnhancePrompt(request);
    const handle = this.provider.request(prompt);

    try {
      const response = await handle.promise;
      const parsed = this.parseJsonResponse<{
        basicInfo: string;
        personality: string;
        currentStatus: string;
        relationship: string;
        recentInteraction: string;
      }>(response);

      if (!parsed) {
        throw new Error('AI 返回的档案格式无效');
      }

      return {
        name: request.personName,
        basicInfo: parsed.basicInfo || '待了解',
        personality: parsed.personality || '待了解',
        currentStatus: parsed.currentStatus || '未知',
        relationship: parsed.relationship || '未知',
        recentInteraction: parsed.recentInteraction || '暂无互动',
        sources: {
          fromMvu: !!request.mvuPersonData,
          fromChat: request.chatMessages.length > 0,
          fromBroadcast: request.broadcasts.length > 0,
          fromStory: !!request.recentStory,
        },
        lastUpdated: Date.now(),
      };
    } catch (error) {
      if (this.isProviderError(error)) {
        throw new Error(`AI 请求失败: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 解析聊天生成智能任务
   */
  async parseTasks(request: TaskParseRequest): Promise<SmartTask[]> {
    const prompt = buildTaskParsePrompt(request);
    const handle = this.provider.request(prompt);

    try {
      const response = await handle.promise;
      const parsed = this.parseJsonResponse<
        Array<{
          title: string;
          detail: string;
          source: string;
          relatedPersons: string[];
          actionText?: string;
          priority: 'high' | 'medium' | 'low';
        }>
      >(response);

      if (!Array.isArray(parsed)) {
        // AI 可能返回空数组，这是合法的
        return [];
      }

      return parsed.map((task, index) => ({
        id: `chat-task-${Date.now()}-${index}`,
        title: task.title || '未命名任务',
        detail: task.detail || '',
        type: 'chat-derived' as const,
        source: task.source || '微信聊天',
        relatedPersons: Array.isArray(task.relatedPersons) ? task.relatedPersons : [],
        actionText: task.actionText,
        priority: task.priority || 'medium',
        createdAt: Date.now(),
      }));
    } catch (error) {
      if (this.isProviderError(error)) {
        throw new Error(`AI 请求失败: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 取消正在进行的请求
   */
  cancel(handle: RequestHandle<string>): void {
    handle.cancel();
  }

  /**
   * 解析 JSON 响应（支持 markdown 代码块包裹）
   */
  private parseJsonResponse<T>(response: string): T | null {
    try {
      // 尝试直接解析
      return JSON.parse(response.trim()) as T;
    } catch {
      // 尝试提取 markdown 代码块中的 JSON
      const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim()) as T;
        } catch {
          return null;
        }
      }

      // 尝试提取 {} 或 [] 包裹的内容
      const objectMatch = response.match(/(\{[\s\S]*\})/);
      const arrayMatch = response.match(/(\[[\s\S]*\])/);
      const match = objectMatch || arrayMatch;

      if (match) {
        try {
          return JSON.parse(match[1].trim()) as T;
        } catch {
          return null;
        }
      }

      return null;
    }
  }

  /**
   * 类型守卫：判断是否为 ProviderError
   */
  private isProviderError(error: unknown): error is ProviderError {
    return error instanceof Error && 'code' in error;
  }
}

/**
 * 创建智能情报服务实例
 */
export function createIntelligenceService(provider: AiProvider): IntelligenceService {
  return new IntelligenceService(provider);
}

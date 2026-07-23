/**
 * 小手机平台 - 智能人员档案与任务系统完整集成示例
 *
 * 本示例展示如何在实际项目中集成智能情报功能
 */

import { createIntelligenceService } from './intelligence/intelligenceService';
import { MemoryProfileStore, MemoryTaskStore } from './intelligence/storage';
import { createProfileApp, createSmartTasksApp, type IntelligentAppServices } from './apps/intelligentApps';
import { OpenAICompatibleProvider } from './ai/providers';
import { extractRecentCompletedStory, extractCurrentStory } from './platform/storyExtractor';
import type { PhoneDb } from './data/phoneDb';
import type { TavernPhonePublicApi } from './core/types';

/**
 * 完整的集成配置
 */
export interface IntelligenceIntegrationConfig {
  /** AI 提供者配置 */
  ai: {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeout?: number;
  };
  /** 是否使用持久化存储（PhoneDb） */
  usePersistentStorage?: boolean;
  /** 任务过期时间（毫秒，默认 7 天） */
  taskExpiryMs?: number;
}

/**
 * 智能情报集成类
 */
export class IntelligenceIntegration {
  private readonly intelligenceService;
  private readonly profileStore;
  private readonly taskStore;
  private readonly config: Required<IntelligenceIntegrationConfig>;

  constructor(
    config: IntelligenceIntegrationConfig,
    private readonly phoneDb: PhoneDb,
    private readonly runtime: TavernPhonePublicApi,
  ) {
    this.config = {
      ...config,
      usePersistentStorage: config.usePersistentStorage ?? false,
      taskExpiryMs: config.taskExpiryMs ?? 7 * 24 * 60 * 60 * 1000,
    };

    // 创建 AI 提供者
    const aiProvider = new OpenAICompatibleProvider({
      baseUrl: config.ai.baseUrl,
      apiKey: config.ai.apiKey,
      model: config.ai.model,
      timeout: config.ai.timeout,
    });

    // 创建智能情报服务
    this.intelligenceService = createIntelligenceService(aiProvider);

    // 创建存储
    if (this.config.usePersistentStorage) {
      this.profileStore = new (await import('./intelligence/storage')).PhoneDbProfileStore(phoneDb);
      this.taskStore = new (await import('./intelligence/storage')).PhoneDbTaskStore(phoneDb);
    } else {
      this.profileStore = new MemoryProfileStore();
      this.taskStore = new MemoryTaskStore();
    }

    // 启动定期清理任务
    this.startTaskCleanup();
  }

  /**
   * 创建服务接口（供 APP 使用）
   */
  createServices(): IntelligentAppServices {
    const sessionKey = this.getSessionKey();

    return {
      // ========== 基础服务 ==========
      submitActionToHost: async action => {
        await this.runtime.submitActionToHost(action);
      },

      // ========== 档案相关 ==========
      listProfiles: async () => {
        return await this.profileStore.listProfiles(sessionKey);
      },

      getProfile: async personId => {
        return await this.profileStore.getProfile(sessionKey, personId);
      },

      refreshProfile: async personId => {
        await this.refreshSingleProfile(personId);
      },

      // ========== 任务相关 ==========
      listSmartTasks: async () => {
        return await this.taskStore.listTasks(sessionKey);
      },

      refreshSmartTasks: async () => {
        await this.refreshAllTasks();
      },

      deleteSmartTask: async taskId => {
        await this.taskStore.deleteTask(sessionKey, taskId);
      },

      // ========== 其他服务（如果需要） ==========
      listConversations: async () => [],
      listMessages: async () => [],
      listContacts: async () => [],
      listBroadcasts: async () => [],
      requestRender: () => {},
    };
  }

  /**
   * 刷新单个人物档案
   */
  private async refreshSingleProfile(personId: string): Promise<void> {
    const sessionKey = this.getSessionKey();

    // 1. 收集聊天记录
    const chatMessages = await this.phoneDb.listMessages({
      sessionKey,
      type: 'private',
      conversationId: `private:${personId}`,
    });

    // 2. 收集广播
    const broadcastMessages = await this.phoneDb.listMessages({
      sessionKey,
      type: 'broadcast',
    });

    const broadcasts = broadcastMessages.map(msg => ({
      source: msg.source || '未知来源',
      content: msg.content,
      trust: (msg.trust || 'unverified') as 'confirmed' | 'unverified',
    }));

    // 3. 获取最近正文
    const storyMessageId = this.runtime.getHostStoryMessageId();
    const recentStory = extractCurrentStory(storyMessageId);

    // 4. 获取 MVU 变量数据
    const mvuPersonData = await this.getMvuPersonData(personId);

    // 5. AI 增强档案
    const enhanced = await this.intelligenceService.enhanceProfile({
      personName: personId,
      personBasicInfo: mvuPersonData?.外貌 || mvuPersonData?.basicInfo,
      chatMessages,
      broadcasts,
      recentStory,
      mvuPersonData,
    });

    // 6. 保存档案
    await this.profileStore.saveProfile(sessionKey, {
      id: personId,
      name: personId,
      basicInfo: enhanced.basicInfo || '待了解',
      personality: enhanced.personality || '待了解',
      currentStatus: enhanced.currentStatus || '未知',
      relationship: enhanced.relationship || '未知',
      recentInteraction: enhanced.recentInteraction || '暂无互动',
      sources: enhanced.sources || {
        fromMvu: false,
        fromChat: false,
        fromBroadcast: false,
        fromStory: false,
      },
      lastUpdated: Date.now(),
    });
  }

  /**
   * 刷新所有任务
   */
  private async refreshAllTasks(): Promise<void> {
    const sessionKey = this.getSessionKey();

    // 1. 获取所有私聊消息
    const chatMessages = await this.phoneDb.listMessages({
      sessionKey,
      type: 'private',
    });

    // 2. 获取当前正文上下文
    const storyMessageId = this.runtime.getHostStoryMessageId();
    const storyContext = extractCurrentStory(storyMessageId);

    // 3. 获取 MVU 现有任务
    const existingTasks = await this.getMvuTasks();

    // 4. AI 解析任务
    const smartTasks = await this.intelligenceService.parseTasks({
      chatMessages,
      storyContext,
      existingTasks,
    });

    // 5. 保存所有任务
    for (const task of smartTasks) {
      await this.taskStore.saveTask(sessionKey, task);
    }
  }

  /**
   * 获取 MVU 变量中的人物数据
   */
  private async getMvuPersonData(personId: string): Promise<Record<string, unknown> | undefined> {
    try {
      // 尝试从 MVU 变量中获取人物数据
      // 实际实现需要根据项目的 MVU 结构调整
      if (typeof window !== 'undefined' && (window as any).getMvuVariable) {
        return await (window as any).getMvuVariable(`租客列表.${personId}`);
      }
      return undefined;
    } catch (error) {
      console.warn(`获取 MVU 人物数据失败 (${personId}):`, error);
      return undefined;
    }
  }

  /**
   * 获取 MVU 中的现有任务
   */
  private async getMvuTasks(): Promise<Array<{ title: string; description: string }>> {
    try {
      if (typeof window !== 'undefined' && (window as any).getMvuVariable) {
        const taskList = await (window as any).getMvuVariable('任务列表');
        if (Array.isArray(taskList)) {
          return taskList.map(task => ({
            title: task.标题 || task.title || '未命名任务',
            description: task.描述 || task.description || '',
          }));
        }
      }
      return [];
    } catch (error) {
      console.warn('获取 MVU 任务列表失败:', error);
      return [];
    }
  }

  /**
   * 获取当前 session key
   */
  private getSessionKey(): string {
    const session = this.runtime.getSession();
    if (!session) {
      throw new Error('No active phone session');
    }
    return session.sessionKey;
  }

  /**
   * 启动定期清理任务
   */
  private startTaskCleanup(): void {
    // 每天清理一次过期任务
    setInterval(
      () => {
        const sessionKey = this.getSessionKey();
        this.taskStore.cleanExpiredTasks(sessionKey, this.config.taskExpiryMs).catch(error => {
          console.error('清理过期任务失败:', error);
        });
      },
      24 * 60 * 60 * 1000,
    );
  }

  /**
   * 创建并注册 APP
   */
  createApps() {
    const services = this.createServices();
    return [createProfileApp(services), createSmartTasksApp(services)];
  }
}

/**
 * 使用示例：在项目中集成
 */
export async function integrateIntelligence(
  config: IntelligenceIntegrationConfig,
  phoneDb: PhoneDb,
  runtime: TavernPhonePublicApi,
) {
  // 1. 创建集成实例
  const integration = new IntelligenceIntegration(config, phoneDb, runtime);

  // 2. 创建 APP
  const apps = integration.createApps();

  // 3. 返回 APP 供小手机平台注册
  return apps;
}

/**
 * 快速启动示例
 */
export async function quickStart() {
  // 假设这些已经在其他地方初始化
  const phoneDb = (window as any).phoneDb;
  const runtime = (window as any).tavernPhone;

  // 配置
  const config: IntelligenceIntegrationConfig = {
    ai: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'your-api-key',
      model: 'gpt-4',
      timeout: 60000,
    },
    usePersistentStorage: false, // 使用内存存储
    taskExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 天
  };

  // 集成
  const apps = await integrateIntelligence(config, phoneDb, runtime);

  console.log(
    '智能情报系统已启动，创建了以下 APP:',
    apps.map(app => app.title),
  );

  return apps;
}

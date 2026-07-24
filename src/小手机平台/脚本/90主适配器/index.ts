/**
 * 小手机平台主适配器 - 独立实现版本
 *
 * 完全独立，不依赖旧版小手机的 ChatCore
 * 使用小手机平台自己的 TavernProvider
 */

import { registerPhoneModule } from '../../core/register';
import type { PhoneModule, PhoneModuleContext, PhoneModuleStatus } from '../../core/types';
import type { PhoneAppServices, PhoneConversationView, PhoneMessageView } from '../../apps/phoneApps';

function createMainAdapterModule(): PhoneModule {
  let status: PhoneModuleStatus = 'REGISTERED';
  let context: PhoneModuleContext | null = null;

  /**
   * 创建 PhoneAppServices 实现 - 独立版本
   */
  function createAppServices(): PhoneAppServices {
    return {
      async listConversations(): Promise<readonly PhoneConversationView[]> {
        // TODO: 从数据库获取会话列表
        return [];
      },

      async listMessages(conversationId: string): Promise<readonly PhoneMessageView[]> {
        // TODO: 从数据库获取消息列表
        return [];
      },

      async listContacts() {
        return [];
      },

      async listBroadcasts() {
        return [];
      },

      async listTasks() {
        return [];
      },

      async getSettings() {
        return {
          provider: 'tavern',
          apiUrl: '',
          model: '',
          parameters: {},
        };
      },

      async getDiagnostics() {
        return [];
      },

      async openConversation(conversationId: string): Promise<void> {
        console.log('[主适配器] 打开会话:', conversationId);
      },

      async openOrCreateConversation(contactId: string): Promise<string> {
        return contactId;
      },

      async addContact(contactId: string): Promise<void> {
        console.log('[主适配器] 添加联系人:', contactId);
      },

      async setContactGroupMembership(contactId: string, included: boolean): Promise<void> {
        console.log('[主适配器] 设置群组成员:', contactId, included);
      },

      async retryFailedMessage(conversationId: string): Promise<void> {
        console.log('[主适配器] 重试失败消息:', conversationId);
      },

      /**
       * 发送消息 - 使用 TavernProvider（独立实现）
       */
      async sendMessage(conversationId: string, content: string): Promise<void> {
        const cleanContent = content.trim();
        if (!cleanContent) {
          throw new Error('消息不能为空');
        }

        console.log('[主适配器] 发送消息:', { conversationId, content: cleanContent });

        try {
          // 1. 尝试获取 TavernProvider 工厂
          let provider: any;

          try {
            const providerFactory = context!.services.require<{
              createProvider: () => any;
            }>('provider.factory');
            provider = providerFactory.createProvider();
            console.log('[主适配器] 使用 wechat.adapter 的 provider');
          } catch (error) {
            console.warn('[主适配器] provider.factory 不可用，尝试手动创建:', error);

            // 手动创建 provider（降级方案）
            const aiCatalog = context!.services.require<{ TavernProvider: any }>('ai.providers');
            const settingsCatalog = context!.services.require<{
              createSettingsStore: (characterName: string, storage?: any) => any;
            }>('settings.store');

            const owner = context!.getOwner();
            const characterName = owner?.characterName || '默认角色';

            const storage = {
              getItem: (key: string) => window.parent.localStorage.getItem(key),
              setItem: (key: string, value: string) => window.parent.localStorage.setItem(key, value),
              removeItem: (key: string) => window.parent.localStorage.removeItem(key),
            };

            const settings = settingsCatalog.createSettingsStore(characterName, storage);
            const generateRaw = (window.parent as any).TavernHelper?.generateRaw;
            const stopGenerationById = (window.parent as any).TavernHelper?.stopGenerationById;

            if (!generateRaw) {
              throw new Error('无法访问 TavernHelper.generateRaw');
            }

            provider = new aiCatalog.TavernProvider({ generateRaw, stopGenerationById, settings });
            console.log('[主适配器] 手动创建 provider 成功');
          }

          // 2. 构建简单的提示词
          const prompt = `用户消息：${cleanContent}\n\n请生成回复。`;

          // 3. 调用 AI
          console.log('[主适配器] 调用 AI，提示词:', prompt);
          const handle = provider.request(prompt);
          const raw = await handle.promise;
          console.log('[主适配器] AI 回复:', raw);

          // 4. 显示回复（临时方案：直接在控制台）
          console.log('[主适配器] ✅ 消息发送完成');

          // TODO: 将消息写入数据库
          // TODO: 同步到世界书
        } catch (error) {
          console.error('[主适配器] ❌ 消息发送失败:', error);
          throw error;
        }
      },

      async retryMessage(conversationId: string, messageId: string): Promise<void> {
        console.log('[主适配器] 重试消息:', conversationId, messageId);
      },

      async cancelMessage(conversationId: string, messageId: string): Promise<void> {
        console.log('[主适配器] 取消消息:', conversationId, messageId);
      },

      watchConversation(conversationId: string, listener: () => void): () => void {
        console.log('[主适配器] 监听会话:', conversationId);
        return () => {};
      },

      async retryPendingLore(): Promise<void> {
        console.log('[主适配器] 重试待处理的世界书同步');
      },

      async saveSettings(settings: any, apiKey: string): Promise<void> {
        console.log('[主适配器] 保存设置:', settings);
      },

      async fetchModels(apiUrl: string, apiKey: string): Promise<readonly string[]> {
        return [];
      },

      async clearApiKey(): Promise<void> {
        console.log('[主适配器] 清除 API 密钥');
      },

      async submitActionToHost(action: any): Promise<void> {
        console.log('[主适配器] 提交主机操作:', action);
      },
    };
  }

  return {
    async init(moduleContext: PhoneModuleContext): Promise<void> {
      context = moduleContext;
      status = 'INITIALIZING';

      try {
        console.log('[主适配器] 开始初始化（独立模式，不依赖旧版小手机）...');

        // 创建 APP 服务
        const services = createAppServices();
        console.log('[主适配器] Services 已创建');

        // 获取 createPhoneApps 函数
        const appsCatalog = context.services.require<{
          createPhoneApps: (services: PhoneAppServices) => any[];
        }>('communication.apps');

        // 创建 APP 实例
        const apps = appsCatalog.createPhoneApps(services);
        console.log('[主适配器] 创建了', apps.length, '个 APP');

        // 获取 shell 并注册 APP
        const shellCatalog = context.services.require<{
          createPhoneShell: (options: any) => any;
        }>('phone.shell');

        // 从 runtime 获取 owner，或使用默认值
        const runtimeOwner = context.runtime?.getOwner?.();
        const owner = runtimeOwner || {
          characterName: '末世寒冬 - 星穹秩序',
          adapterId: 'winter-apocalypse',
          runtimeMajor: 1,
        };

        // 如果 runtime 还没有 owner，设置它
        if (!runtimeOwner && context.runtime) {
          console.log('[主适配器] 设置 Runtime Owner:', owner);
          context.runtime.setOwner(owner);
        }

        const shell = shellCatalog.createPhoneShell({
          owner,
          apps,
        });

        console.log('[主适配器] Shell 已创建:', shell);

        status = 'READY';
        console.log('✅ [主适配器] 初始化完成（独立模式）');
      } catch (error) {
        status = 'ERROR';
        console.error('❌ [主适配器] 初始化失败:', error);
        throw new Error(`主适配器初始化失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async dispose(): Promise<void> {
      context = null;
      status = 'DISPOSED';
    },

    getStatus(): PhoneModuleStatus {
      return status;
    },
  };
}

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'main.adapter',
      version: '1.0.0',
      required: true,
      dependsOn: ['communication.apps', 'phone.shell'],
      capabilities: ['main.adapter', 'phone.adapter'],
    },
    factory: () => createMainAdapterModule(),
  });
});

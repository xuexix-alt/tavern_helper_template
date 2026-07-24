/**
 * 微信 APP 适配器
 *
 * 为微信 APP 提供完整的小手机功能支持，包括：
 * - 连接酒馆 API（generateRaw, stopGenerationById）
 * - 创建 TavernProvider 实例
 * - 桥接到旧版小手机的 ChatCore（消息发送功能）
 * - 提供消息发送等核心功能的实现
 */

import { registerPhoneModule } from '../../core/register';
import type { PhoneModule, PhoneModuleContext, PhoneModuleStatus } from '../../core/types';
import type { TavernProvider, OpenAICompatibleProvider } from '../../ai/providers';
import { createGenerateRaw, createStopGenerationById } from '../../platform/tavernApiAdapter';

function createWechatAdapterModule(): PhoneModule {
  let status: PhoneModuleStatus = 'REGISTERED';
  let context: PhoneModuleContext | null = null;

  /**
   * 创建 AI Provider 实例（支持 Tavern 和 OpenAI-compatible）
   */
  function createProvider(): InstanceType<typeof TavernProvider> | InstanceType<typeof OpenAICompatibleProvider> {
    if (!context) {
      throw new Error('微信 APP 适配器未初始化');
    }

    const aiCatalog = context.services.require<{
      TavernProvider: typeof TavernProvider;
      OpenAICompatibleProvider: typeof OpenAICompatibleProvider;
    }>('ai.providers');

    const settingsCatalog = context.services.require<{
      createSettingsStore: (characterName: string, storage?: any) => any;
    }>('settings.store');

    // 获取角色名
    const owner = context.getOwner();
    const characterName = owner?.characterName || '默认角色';

    // 创建使用父窗口 localStorage 的 storage 适配器
    const storage = {
      getItem: (key: string) => window.parent.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.parent.localStorage.setItem(key, value),
      removeItem: (key: string) => window.parent.localStorage.removeItem(key),
    };

    const settings = settingsCatalog.createSettingsStore(characterName, storage);
    const publicSettings = settings.getPublic();

    // 如果设置为使用 OpenAI-compatible API
    if (publicSettings.provider === 'openai-compatible') {
      const { OpenAICompatibleProvider } = aiCatalog;
      return new OpenAICompatibleProvider({
        baseUrl: publicSettings.apiUrl,
        model: publicSettings.model,
        parameters: publicSettings.parameters,
        withApiKey: callback => settings.withApiKey(callback),
      });
    }

    // 默认使用 Tavern Provider
    const { TavernProvider } = aiCatalog;
    const generateRaw = createGenerateRaw();
    const stopGenerationById = createStopGenerationById();

    return new TavernProvider({ generateRaw, stopGenerationById });
  }

  /**
   * 桥接到旧版小手机的 ChatCore 实现消息发送
   *
   * 这是一个临时方案，复用旧版小手机已有的成熟实现
   */
  async function sendMessageViaChatCore(conversationId: string, content: string): Promise<void> {
    const cleanContent = content.trim();
    if (!cleanContent) {
      throw new Error('消息不能为空');
    }

    // 获取旧版小手机的全局对象
    const ChatCore = (window.parent as any)?.ChatCore;
    const ChatDB = (window.parent as any)?.ChatDB;
    const ChatSync = (window.parent as any)?.ChatSync;

    if (!ChatCore) {
      throw new Error('ChatCore 未加载，请确保旧版小手机的"聊天核心"脚本已通过正则替换加载');
    }

    if (!ChatDB) {
      throw new Error('ChatDB 未加载，请确保旧版小手机的"聊天数据库"脚本已加载');
    }

    console.log('[微信APP适配器] 调用 ChatCore 发送消息:', { conversationId, content: cleanContent });

    try {
      // 写入用户消息
      const userMsg = await ChatDB.addMessage(conversationId, '<user>', cleanContent);
      console.log('[微信APP适配器] 用户消息已写入:', userMsg);

      // 调用 ChatCore 生成回复
      // 注意：这里假设 conversationId 的格式能让 ChatCore 识别会话类型
      let replies: any[];

      // 尝试调用群聊或私聊生成方法
      try {
        replies = await ChatCore.generateGroupReply(conversationId, cleanContent);
        console.log('[微信APP适配器] 群聊回复生成成功:', replies);
      } catch (groupError) {
        console.log('[微信APP适配器] 群聊生成失败，尝试私聊:', groupError);
        replies = await ChatCore.generatePrivateReply(conversationId, cleanContent);
        console.log('[微信APP适配器] 私聊回复生成成功:', replies);
      }

      // 同步到世界书
      if (ChatSync && typeof ChatSync.instantSync === 'function') {
        ChatSync.instantSync(conversationId);
        console.log('[微信APP适配器] 已触发世界书同步');
      }

      console.log('[微信APP适配器] 消息发送完成');
    } catch (error) {
      console.error('[微信APP适配器] 消息发送失败:', error);
      throw error;
    }
  }

  return {
    async init(moduleContext: PhoneModuleContext): Promise<void> {
      context = moduleContext;
      status = 'INITIALIZING';

      try {
        // 创建 generateRaw 和 stopGenerationById 实现
        const generateRaw = createGenerateRaw();
        const stopGenerationById = createStopGenerationById();

        // 将这些函数暴露到当前 iframe 的全局作用域
        // 注意：脚本通过 window.parent.TavernHelper 访问酒馆助手的函数
        // 这里暴露是为了让 TavernProvider 在创建时能直接访问
        if (typeof (window as any).generateRaw === 'undefined') {
          (window as any).generateRaw = generateRaw;
          console.log('✅ [微信APP适配器] generateRaw 已暴露到全局作用域（来自 window.parent.TavernHelper）');
        }

        if (typeof (window as any).stopGenerationById === 'undefined') {
          (window as any).stopGenerationById = stopGenerationById;
          console.log('✅ [微信APP适配器] stopGenerationById 已暴露到全局作用域（来自 window.parent.TavernHelper）');
        }

        // 注册 provider 工厂函数到服务中
        context.services.publish('wechat.adapter', 'provider.factory', {
          createProvider,
        });

        // 注册消息发送桥接函数
        context.services.publish('wechat.adapter', 'message.sender', {
          sendMessage: sendMessageViaChatCore,
        });

        status = 'READY';
        console.log('✅ [微信APP适配器] 已加载，TavernProvider 工厂和消息发送桥接已注册');
      } catch (error) {
        status = 'ERROR';
        console.error('❌ [微信APP适配器] 初始化失败:', error);
        throw new Error(`微信 APP 适配器初始化失败: ${error instanceof Error ? error.message : String(error)}`);
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
      id: 'wechat.adapter',
      version: '1.0.0',
      required: true,
      dependsOn: ['platform.services', 'ai.scheduler', 'data.sync'],
      capabilities: ['provider.factory', 'message.sender'],
    },
    factory: () => createWechatAdapterModule(),
  });
});

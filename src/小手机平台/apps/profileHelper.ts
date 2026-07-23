import type { PhoneAppServices, PhoneProfileView } from './phoneApps';

export async function collectProfiles(services: PhoneAppServices): Promise<PhoneProfileView[]> {
  try {
    const contacts = await services.listContacts();
    const conversations = await services.listConversations();
    const privateConversations = conversations.filter(c => c.kind === 'private');

    const profiles: PhoneProfileView[] = [];

    for (const contact of contacts) {
      if (!contact.added) continue;

      // 适配器中的会话 ID 格式为 private:${contactId}
      // contact.id 就是 contactId（如 main:纪宁）
      const conversationId = `private:${contact.id}`;
      const conv = privateConversations.find(c => c.id === conversationId);

      let messageCount = 0;
      let lastMessage = '';
      try {
        if (conv) {
          const messages = await services.listMessages(conv.id);
          messageCount = messages.length;
          const last = messages.at(-1);
          if (last) {
            lastMessage = last.content.substring(0, 60);
          }
        }
      } catch {
        // ignore
      }

      let broadcastMention = '';
      try {
        const broadcasts = await services.listBroadcasts();
        const mentions = broadcasts.filter(b => b.content.includes(contact.name));
        if (mentions.length > 0) {
          broadcastMention = mentions[0].content.substring(0, 60);
        }
      } catch {
        // ignore
      }

      const parts: string[] = [];
      if (messageCount > 0) parts.push(`聊天 ${messageCount} 条`);
      if (lastMessage) parts.push(lastMessage);
      if (broadcastMention) parts.push(`广播: ${broadcastMention}`);

      profiles.push({
        id: contact.id,
        name: contact.name,
        basicInfo: contact.detail || '待了解',
        personality: '待分析',
        currentStatus: '未知',
        relationship: '普通关系',
        recentInteraction: parts.length > 0 ? parts.join('；') : '暂无互动记录',
        lastUpdated: Date.now(),
      });
    }

    return profiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  } catch (error) {
    console.error('[ProfileHelper] 收集档案失败:', error);
    return [];
  }
}


/**
 * 档案助手 - 直接从数据源收集和生成人物档案
 * 不依赖复杂的 AI 服务，简化实现
 */

import type { PhoneDb } from '../data/phoneDb';
import type { PhoneProfileView } from './phoneApps';

/**
 * 从多个数据源收集人物档案信息
 */
export async function collectProfiles(db: PhoneDb, sessionKey: string): Promise<PhoneProfileView[]> {
  const profiles = new Map<string, PhoneProfileView>();

  try {
    // 1. 从通讯录获取基础人物列表
    const contacts = await getContactsFromMvu();

    // 2. 从聊天记录中提取互动信息
    const chatSummaries = await collectChatSummaries(db, sessionKey);

    // 3. 从广播中提取相关信息
    const broadcastMentions = await collectBroadcastMentions(db, sessionKey);

    // 4. 整合信息生成档案
    for (const contact of contacts) {
      const chatSummary = chatSummaries.get(contact.id) || {
        messageCount: 0,
        lastMessage: '',
        lastTime: 0,
      };

      const mentions = broadcastMentions.get(contact.id) || [];

      profiles.set(contact.id, {
        id: contact.id,
        name: contact.name,
        basicInfo: contact.basicInfo || '待了解',
        personality: contact.personality || '待了解',
        currentStatus: contact.status || '未知',
        relationship: contact.relationship || '普通关系',
        recentInteraction: generateInteractionSummary(chatSummary, mentions),
        lastUpdated: Date.now(),
      });
    }

    return Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  } catch (error) {
    console.error('[ProfileHelper] 收集档案失败:', error);
    return [];
  }
}

/**
 * 从 MVU 变量获取联系人信息
 */
async function getContactsFromMvu(): Promise<
  Array<{
    id: string;
    name: string;
    basicInfo?: string;
    personality?: string;
    status?: string;
    relationship?: string;
  }>
> {
  try {
    // 尝试从 MVU 变量中读取租客列表
    if (typeof window !== 'undefined' && (window as any).getMvuVariable) {
      const tenantList = await (window as any).getMvuVariable('租客列表');

      if (tenantList && typeof tenantList === 'object') {
        const contacts = [];
        for (const [name, data] of Object.entries(tenantList)) {
          if (typeof data === 'object' && data !== null) {
            const tenant = data as any;
            contacts.push({
              id: name,
              name,
              basicInfo: [tenant.年龄 && `${tenant.年龄}岁`, tenant.职业, tenant.外貌]
                .filter(Boolean)
                .join('，') || undefined,
              personality: tenant.性格,
              status: tenant.状态,
              relationship: tenant.关系?.[Object.keys(tenant.关系 || {})[0]],
            });
          }
        }
        return contacts;
      }
    }
  } catch (error) {
    console.warn('[ProfileHelper] 从 MVU 读取失败:', error);
  }

  return [];
}

/**
 * 从聊天记录中提取摘要信息
 */
async function collectChatSummaries(
  db: PhoneDb,
  sessionKey: string,
): Promise<
  Map<
    string,
    {
      messageCount: number;
      lastMessage: string;
      lastTime: number;
    }
  >
> {
  const summaries = new Map();

  try {
    const messages = await db.listMessages({ sessionKey, type: 'private' });

    for (const msg of messages) {
      // 解析 conversationId: "private:人名"
      const match = msg.conversationId.match(/^private:(.+)$/);
      if (!match) continue;

      const personName = match[1];
      const existing = summaries.get(personName);

      if (!existing || msg.createdAt > existing.lastTime) {
        summaries.set(personName, {
          messageCount: (existing?.messageCount || 0) + 1,
          lastMessage: msg.content.substring(0, 50),
          lastTime: msg.createdAt,
        });
      }
    }
  } catch (error) {
    console.warn('[ProfileHelper] 收集聊天摘要失败:', error);
  }

  return summaries;
}

/**
 * 从广播中提取人物相关信息
 */
async function collectBroadcastMentions(
  db: PhoneDb,
  sessionKey: string,
): Promise<Map<string, string[]>> {
  const mentions = new Map<string, string[]>();

  try {
    const broadcasts = await db.listMessages({ sessionKey, type: 'broadcast' });

    // 简单的关键词匹配
    for (const broadcast of broadcasts) {
      const content = broadcast.content;

      // 这里可以用更复杂的 NLP，暂时用简单匹配
      // 从 MVU 获取人名列表用于匹配
      const contacts = await getContactsFromMvu();

      for (const contact of contacts) {
        if (content.includes(contact.name)) {
          const existing = mentions.get(contact.id) || [];
          if (existing.length < 3) {
            // 最多保留 3 条相关广播
            existing.push(content.substring(0, 50));
            mentions.set(contact.id, existing);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[ProfileHelper] 收集广播提及失败:', error);
  }

  return mentions;
}

/**
 * 生成最近互动摘要
 */
function generateInteractionSummary(
  chatSummary: { messageCount: number; lastMessage: string; lastTime: number },
  broadcasts: string[],
): string {
  const parts: string[] = [];

  if (chatSummary.messageCount > 0) {
    const timeAgo = getTimeAgo(chatSummary.lastTime);
    parts.push(`${timeAgo}聊天：${chatSummary.lastMessage}（共${chatSummary.messageCount}条）`);
  }

  if (broadcasts.length > 0) {
    parts.push(`广播提及：${broadcasts[0]}`);
  }

  if (parts.length === 0) {
    return '暂无互动记录';
  }

  return parts.join('；');
}

/**
 * 计算时间差描述
 */
function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return '刚刚';
}

/**
 * 获取单个人物的详细档案（用于刷新）
 */
export async function refreshSingleProfile(
  db: PhoneDb,
  sessionKey: string,
  personId: string,
): Promise<PhoneProfileView | null> {
  const allProfiles = await collectProfiles(db, sessionKey);
  return allProfiles.find(p => p.id === personId) || null;
}

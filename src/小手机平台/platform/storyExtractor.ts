import type { PromptMainChatEntry, PromptSourceEntry } from '../ai/promptAssembler';
import type { ProfileStoryMessage } from '../profiles/profileTypes';

export interface StoryExtractorOptions {
  /**
   * 当前正文楼层 ID（从 PhoneHostBridge.getStoryMessageId() 获取）
   */
  storyMessageId: number | null;
  /**
   * 最多提取多少条最近的正文（默认 5 条）
   */
  maxStoryCount?: number;
  /**
   * 是否标记所有正文为相关（默认 true）
   */
  markAllRelevant?: boolean;
}

const CONTROL_BLOCK_PATTERN = /<(UpdateVariable(?:variable)?|Analysis|JSONPatch)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const UNCLOSED_CONTROL_BLOCK_PATTERN = /<(?:UpdateVariable(?:variable)?|Analysis|JSONPatch)\b[^>]*>[\s\S]*$/gi;
const CONTROL_TAG_PATTERN = /<\/?(?:UpdateVariable(?:variable)?|Analysis|JSONPatch)\b[^>]*>/gi;

export function stripMainChatControlBlocks(content: string): string {
  return content
    .replace(CONTROL_BLOCK_PATTERN, '')
    .replace(UNCLOSED_CONTROL_BLOCK_PATTERN, '')
    .replace(CONTROL_TAG_PATTERN, '')
    .trim();
}

export function extractRecentMainChatMessages(storyMessageId: number | null, limit = 5): PromptMainChatEntry[] {
  if (
    storyMessageId === null ||
    !Number.isSafeInteger(storyMessageId) ||
    storyMessageId < 0 ||
    !Number.isSafeInteger(limit) ||
    limit <= 0
  ) {
    return [];
  }
  try {
    return getChatMessages(`0-${storyMessageId}`, {
      hide_state: 'unhidden',
      include_swipes: false,
    })
      .filter(
        message =>
          message.message_id <= storyMessageId &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.message === 'string' &&
          message.message.trim() !== '',
      )
      .map(message => ({
        id: `main-chat-${message.message_id}`,
        role: message.role as 'user' | 'assistant',
        sender: message.name?.trim() || (message.role === 'user' ? '玩家' : 'AI'),
        content: stripMainChatControlBlocks(message.message),
      }))
      .filter(message => message.content !== '')
      .slice(-limit);
  } catch (error) {
    console.warn('[小手机平台] 提取最近主聊天消息失败:', error);
    return [];
  }
}

/**
 * 从酒馆聊天记录中提取最近的正文，用于小手机 AI 生成
 *
 * **使用场景：**
 * - TavernProvider 使用酒馆 API 时，酒馆会自动注入正文
 * - OpenAICompatibleProvider 使用自定义 API 时，需要手动提取正文
 *
 * @param options 提取选项
 * @returns 正文条目数组，按时间从旧到新排序
 *
 * @example
 * ```typescript
 * const storyMessageId = runtime.getHostStoryMessageId();
 * const recentStory = extractRecentCompletedStory({ storyMessageId });
 * const snapshot = createPromptContextSnapshot({
 *   // ... 其他字段
 *   recentMainChat: extractRecentMainChatMessages(storyMessageId),
 * });
 * ```
 */
export function extractRecentCompletedStory(options: StoryExtractorOptions): PromptSourceEntry[] {
  const { storyMessageId, maxStoryCount = 5, markAllRelevant = true } = options;

  // 如果没有当前楼层，返回空数组
  if (storyMessageId === null || !Number.isSafeInteger(storyMessageId) || storyMessageId < 0) {
    return [];
  }

  try {
    // 获取当前楼层及之前的 assistant 消息（AI 回复）
    const startId = Math.max(0, storyMessageId - maxStoryCount * 2); // 预留空间，因为可能有 user 消息
    const range = `${startId}-${storyMessageId}`;

    const messages = getChatMessages(range, {
      role: 'assistant',
      hide_state: 'unhidden',
      include_swipes: false,
    });

    // 过滤掉当前正在生成的楼层（如果是当前楼层，可能还未完成）
    const completedMessages = messages.filter(msg => msg.message_id < storyMessageId);

    // 取最近的 N 条
    const recentMessages = completedMessages.slice(-maxStoryCount);

    // 转换为 PromptSourceEntry 格式
    return recentMessages.map(msg => ({
      id: `story-${msg.message_id}`,
      content: typeof msg.message === 'string' ? msg.message.trim() : '',
      relevant: markAllRelevant,
    }));
  } catch (error) {
    // 如果读取失败（比如在非酒馆环境），返回空数组
    console.warn('[小手机平台] 提取正文失败:', error);
    return [];
  }
}

export function extractRecentCompletedMessages(storyMessageId: number | null, limit = 20): ProfileStoryMessage[] {
  if (
    storyMessageId === null ||
    !Number.isSafeInteger(storyMessageId) ||
    storyMessageId < 0 ||
    !Number.isSafeInteger(limit) ||
    limit <= 0
  ) {
    return [];
  }
  try {
    return getChatMessages(`0-${storyMessageId}`, {
      hide_state: 'all',
      include_swipes: false,
    })
      .filter(
        message =>
          message.message_id < storyMessageId &&
          !(message as { is_hidden?: boolean }).is_hidden &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.message === 'string' &&
          message.message.trim() !== '',
      )
      .slice(-limit)
      .map(message => ({
        id: String(message.message_id),
        role: message.role as 'user' | 'assistant',
        content: message.message.trim(),
      }));
  } catch (error) {
    console.warn('[小手机平台] 提取完整正文窗口失败:', error);
    return [];
  }
}

/**
 * 从酒馆聊天记录中提取当前楼层的正文
 *
 * @param storyMessageId 当前楼层 ID
 * @returns 正文内容，如果获取失败返回空字符串
 */
export function extractCurrentStory(storyMessageId: number | null): string {
  if (storyMessageId === null || !Number.isSafeInteger(storyMessageId) || storyMessageId < 0) {
    return '';
  }

  try {
    const messages = getChatMessages(storyMessageId, {
      role: 'assistant',
      hide_state: 'all',
      include_swipes: false,
    });

    const message = messages[0];
    if (!message) return '';

    return typeof message.message === 'string' ? message.message.trim() : '';
  } catch (error) {
    console.warn('[小手机平台] 提取当前正文失败:', error);
    return '';
  }
}

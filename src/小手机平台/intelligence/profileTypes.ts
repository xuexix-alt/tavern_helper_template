import { renderPromptTemplate } from '../ai/promptTemplates';
import type { PhoneDb, PhoneMessage } from '../data/phoneDb';

/**
 * 人员档案数据结构
 */
export interface PersonProfile {
  /** 人物 ID（唯一标识） */
  id: string;
  /** 人物姓名 */
  name: string;
  /** 基本信息（年龄、职业、外貌等） */
  basicInfo: string;
  /** 性格特点 */
  personality: string;
  /** 当前状态 */
  currentStatus: string;
  /** 关系描述 */
  relationship: string;
  /** 最近互动摘要 */
  recentInteraction: string;
  /** 数据来源标记 */
  sources: {
    fromMvu: boolean;
    fromChat: boolean;
    fromBroadcast: boolean;
    fromStory: boolean;
  };
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 任务数据结构
 */
export interface SmartTask {
  /** 任务 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 任务详情 */
  detail: string;
  /** 任务类型 */
  type: 'mvu-stage' | 'chat-derived' | 'broadcast-derived';
  /** 任务来源 */
  source: string;
  /** 相关人物 */
  relatedPersons: string[];
  /** 行动文本（用于插入输入框） */
  actionText?: string;
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 创建时间 */
  createdAt: number;
}

/**
 * AI 档案增强请求
 */
export interface ProfileEnhanceRequest {
  /** 人物基本信息 */
  personName: string;
  personBasicInfo?: string;
  /** 微信聊天记录 */
  chatMessages: PhoneMessage[];
  /** 伊甸广播 */
  broadcasts: Array<{ source: string; content: string; trust: 'confirmed' | 'unverified' }>;
  /** 最近正文互动 */
  recentStory: string;
  /** MVU 变量中的人物数据 */
  mvuPersonData?: Record<string, unknown>;
}

/**
 * AI 任务解析请求
 */
export interface TaskParseRequest {
  /** 微信聊天记录 */
  chatMessages: PhoneMessage[];
  /** 当前正文上下文 */
  storyContext: string;
  /** MVU 中的现有任务 */
  existingTasks?: Array<{ title: string; description: string }>;
}

/**
 * AI 增强档案的提示词模板
 */
export function buildProfileEnhancePrompt(request: ProfileEnhanceRequest): string {
  const chatSummary = request.chatMessages
    .slice(-10)
    .map(msg => `${msg.sender}: ${msg.content}`)
    .join('\n');

  const broadcastSummary = request.broadcasts
    .slice(-5)
    .map(b => `[${b.trust}][${b.source}] ${b.content}`)
    .join('\n');

  return renderPromptTemplate('enhance.body', {
    personName: request.personName,
    basicInfo: request.personBasicInfo || '暂无',
    mvuFacts: JSON.stringify(request.mvuPersonData || {}, null, 2),
    wechat: chatSummary || '暂无聊天记录',
    broadcasts: broadcastSummary || '暂无广播',
    story: request.recentStory || '暂无',
  });
}

/**
 * AI 任务解析的提示词模板
 */
export function buildTaskParsePrompt(request: TaskParseRequest): string {
  const chatSummary = request.chatMessages
    .slice(-20)
    .map(msg => `${msg.sender}: ${msg.content}`)
    .join('\n');

  const existingTasksText = request.existingTasks?.map(t => `- ${t.title}: ${t.description}`).join('\n') || '暂无';

  return renderPromptTemplate('tasks.body', {
    wechat: chatSummary,
    story: request.storyContext,
    existingTasks: existingTasksText,
  });
}

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

  return `你是人员档案分析助手，根据多源信息整合和完善人物档案。

## 任务
为「${request.personName}」生成完整的人物档案。

## 信息来源

### 1. 基本信息（MVU 变量）
${request.personBasicInfo || '暂无'}

### 2. MVU 详细数据
${JSON.stringify(request.mvuPersonData || {}, null, 2)}

### 3. 最近微信聊天（最近 10 条）
${chatSummary || '暂无聊天记录'}

### 4. 伊甸广播（最近 5 条）
${broadcastSummary || '暂无广播'}

### 5. 最近正文互动
${request.recentStory || '暂无'}

## 输出要求
以 JSON 格式输出，包含以下字段：
{
  "basicInfo": "整合的基本信息（年龄、职业、外貌等，50字以内）",
  "personality": "性格特点总结（30字以内）",
  "currentStatus": "当前状态（如：在家休息、外出工作，20字以内）",
  "relationship": "与玩家的关系（如：朋友、邻居、陌生人，20字以内）",
  "recentInteraction": "最近互动摘要（基于聊天和正文，50字以内）"
}

**注意：**
- 优先使用 MVU 变量中的确定信息
- 聊天记录反映最新动态，优先级高于广播
- 正文互动最能体现当前关系状态
- 如果信息不足，用"待了解"而非编造
- 保持客观中立，不要主观臆测`;
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

  return `你是任务解析助手，从微信聊天中识别玩家可采取的行动。

## 任务
分析微信聊天，提取玩家可以执行的具体行动。

## 微信聊天记录（最近 20 条）
${chatSummary}

## 当前正文上下文
${request.storyContext}

## 现有任务（MVU 阶段任务）
${existingTasksText}

## 识别规则
从聊天中识别以下类型的行动：
1. **明确邀请**："到我家来一趟" → "去[人名]家里"
2. **约定会面**："明天见面吧" → "明天与[人名]会面"
3. **请求帮助**："能帮我买点东西吗" → "帮[人名]购买物品"
4. **提及地点**："在咖啡厅等你" → "前往咖啡厅与[人名]会面"
5. **物品交接**："把钥匙给我" → "将钥匙交给[人名]"

## 输出要求
以 JSON 数组格式输出，每个任务包含：
{
  "title": "简短标题（15字以内）",
  "detail": "详细说明（50字以内）",
  "source": "来源聊天片段（原文引用）",
  "relatedPersons": ["相关人物姓名"],
  "actionText": "可插入输入框的行动文本（如：'前往张三家里'）",
  "priority": "high|medium|low"
}

**注意：**
- 只提取可执行的具体行动，不要泛泛而谈
- 避免与现有 MVU 任务重复
- actionText 要简洁明确，适合直接发送
- priority 基于紧急程度：明确时间=high，邀请=medium，建议=low
- 如果聊天中没有明确的行动提示，返回空数组 []`;
}

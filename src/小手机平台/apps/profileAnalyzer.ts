/**
 * 小手机档案分析系统
 * 基于房东卡的分析系统，实现自动分析和 AI 增强
 */

import type { PhoneDb } from '../data/phoneDb';
import type { PhoneProfileView } from '../apps/phoneApps';

// ============ 配置常量 ============
const DEFAULT_CONFIG = {
  triggerInterval: 30, // 每N楼触发一次分析
  enableAutoAnalysis: true, // 是否启用自动分析
};

// ============ 分析提示词模板 ============
const ANALYSIS_PROMPTS = {
  // 动态人设分析 - 本色+上次调色+聊天记录 → 新调色
  tenantDynamicAnalysis: function (
    personName: string,
    baseProfile: string | null,
    lastDynamic: string | null,
    recentChat: string,
  ): string {
    return `你是一个角色动态分析专家。请根据角色的本色、上次调色和最近对话，分析角色"${personName}"的变化，生成新的"调色"档案。

## 角色本色（固定人设，不会改变）
${baseProfile || '暂无本色档案'}

## 上次调色（上一次分析的动态人设）
${lastDynamic || '暂无上次调色，这是第一次分析'}

## 最近对话内容（重点关注与${personName}相关的部分）
${recentChat}

## 分析要求
根据最近的对话内容，分析"${personName}"在以下四个方面可能发生的变化。请写出具体、生动的描述。

## 输出格式
请直接输出以下格式的内容（每项2-4句话，要具体描述）：

【${personName}的近期动态】

行为变化：
${personName}最近[具体描述行为上的变化，包括日常习惯、作息、活动方式等。如无变化则描述当前保持的行为状态]

性格微调：
${personName}在性格上[描述细微的性格变化或当前性格特点的体现，不影响整体人设]

语言风格：
${personName}说话时[描述说话方式、用词习惯、语气的特点或变化]

个人目标：
${personName}目前[描述当前的目标、愿望、关注的事情或追求]

注意：
- 每项内容必须以"${personName}"开头，让读者知道这是谁的档案
- 每项2-4句话，内容要具体、有细节
- 要基于对话内容推断，不要凭空捏造
- 如果对话中没有相关信息，可以根据本色档案描述当前状态
- 不要使用markdown符号
- 直接输出内容，不要输出解释文字`;
  },

  // 解析AI返回的动态档案内容
  parseDynamicContent: function (aiResponse: string): string {
    let content = aiResponse.trim();
    // 移除可能的markdown代码块标记
    content = content.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '');
    return content;
  },
};

// ============ 档案分析器主体 ============
export class ProfileAnalyzer {
  private db: PhoneDb;
  private sessionKey: string;
  private config = { ...DEFAULT_CONFIG };
  private lastAnalyzedFloor = 0;
  private lastAnalysisTime: Date | null = null;

  constructor(db: PhoneDb, sessionKey: string) {
    this.db = db;
    this.sessionKey = sessionKey;
    this.loadConfig();
  }

  // ============ 配置管理 ============
  private loadConfig(): void {
    try {
      const saved = localStorage.getItem(`profile_analyzer_${this.sessionKey}_config`);
      if (saved) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }

      const stateSaved = localStorage.getItem(`profile_analyzer_${this.sessionKey}_state`);
      if (stateSaved) {
        const state = JSON.parse(stateSaved);
        this.lastAnalyzedFloor = state.lastAnalyzedFloor || 0;
        this.lastAnalysisTime = state.lastAnalysisTime ? new Date(state.lastAnalysisTime) : null;
      }
    } catch (e) {
      console.error('[档案分析] 加载配置失败:', e);
    }
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(`profile_analyzer_${this.sessionKey}_config`, JSON.stringify(this.config));
      localStorage.setItem(
        `profile_analyzer_${this.sessionKey}_state`,
        JSON.stringify({
          lastAnalyzedFloor: this.lastAnalyzedFloor,
          lastAnalysisTime: this.lastAnalysisTime?.toISOString(),
        }),
      );
    } catch (e) {
      console.error('[档案分析] 保存配置失败:', e);
    }
  }

  // ============ 获取当前楼层 ============
  private getCurrentFloor(): number {
    try {
      const ctx = (window as any).parent.SillyTavern?.getContext?.();
      if (ctx && ctx.chat && Array.isArray(ctx.chat)) {
        return Math.max(0, ctx.chat.length - 1);
      }
    } catch (e) {}
    return 0;
  }

  // ============ 获取最近对话 ============
  private getRecentChat(depth: number): string {
    try {
      const ctx = (window as any).parent.SillyTavern?.getContext?.();
      if (!ctx || !ctx.chat || !Array.isArray(ctx.chat)) return '';

      const messages = ctx.chat.slice(-depth);
      return messages
        .map((msg: any, index: number) => {
          const speaker = msg.is_user ? '玩家' : 'AI';
          const text = (msg.mes || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\{\{[^}]*\}\}/g, '')
            .substring(0, 500);
          return `[第${ctx.chat.length - depth + index + 1}楼] ${speaker}：${text}`;
        })
        .join('\n\n');
    } catch (e) {
      console.error('[档案分析] 获取对话失败:', e);
      return '';
    }
  }

  // ============ 检查并触发分析 ============
  public checkAndTrigger(): void {
    if (!this.config.enableAutoAnalysis) return;

    const currentFloor = this.getCurrentFloor();
    const nextTriggerFloor = this.lastAnalyzedFloor + this.config.triggerInterval;

    // 只在AI输出后（双数楼层）检测
    if (currentFloor % 2 !== 0) return;

    if (currentFloor >= nextTriggerFloor) {
      this.triggerAutoAnalysis();
    }
  }

  // ============ 触发自动分析 ============
  private async triggerAutoAnalysis(): Promise<void> {
    const recentChat = this.getRecentChat(this.config.triggerInterval);
    const contacts = await this.getContactsFromMvu();

    // 智能过滤：只分析最近对话中出现的人物
    const activeContacts = contacts.filter(c => recentChat.includes(c.name));

    if (activeContacts.length === 0) {
      console.log('[档案分析] 最近对话中没有提到任何人物，跳过分析');
      this.lastAnalyzedFloor = this.getCurrentFloor();
      this.saveConfig();
      return;
    }

    console.log('[档案分析] 触发自动分析，活跃人物:', activeContacts.map(c => c.name).join(', '));

    this.lastAnalyzedFloor = this.getCurrentFloor();
    this.lastAnalysisTime = new Date();
    this.saveConfig();

    // 为每个活跃人物执行分析
    for (const contact of activeContacts) {
      try {
        await this.analyzeContact(contact.name, recentChat);
      } catch (e) {
        console.error(`[档案分析] 分析失败: ${contact.name}`, e);
      }
    }
  }

  // ============ 分析单个人物 ============
  public async analyzeContact(personName: string, recentChat?: string): Promise<void> {
    console.log(`[档案分析] 开始分析: ${personName}`);

    // 获取本色（固定档案）
    const baseProfile = await this.getBaseProfile(personName);

    // 获取上次调色（动态档案）
    const lastDynamic = await this.getDynamicProfile(personName);

    // 获取最近对话
    const chat = recentChat || this.getRecentChat(this.config.triggerInterval);

    // 生成分析提示词
    const prompt = ANALYSIS_PROMPTS.tenantDynamicAnalysis(personName, baseProfile, lastDynamic, chat);

    // 调用API
    const aiResponse = await this.callAPI(prompt);

    // 解析结果
    const dynamicContent = ANALYSIS_PROMPTS.parseDynamicContent(aiResponse);

    if (dynamicContent && dynamicContent.length > 30) {
      // 写入动态档案
      await this.updateDynamicProfile(personName, dynamicContent);
      console.log(`[档案分析] 分析完成: ${personName}`);
    } else {
      throw new Error('AI返回内容过短或无效');
    }
  }

  // ============ 调用API ============
  private async callAPI(prompt: string): Promise<string> {
    const PhoneSystem = (window as any).parent.PhoneSystem || (window as any).PhoneSystem;
    if (!PhoneSystem || !PhoneSystem.callExternalAPI) {
      throw new Error('PhoneSystem.callExternalAPI不可用');
    }

    const messages = [
      {
        role: 'system',
        content:
          '你是一个角色动态分析专家。你的任务是分析角色在对话中的变化，生成简洁的动态人设。只输出指定格式的内容，不要输出解释文字。基于对话内容推断，不要凭空捏造，如无明显变化则保守处理。',
      },
      { role: 'user', content: prompt },
    ];

    const result = await PhoneSystem.callExternalAPI(messages, { temperature: 0.7 });
    return result || '';
  }

  // ============ ChatLore操作 ============
  private async getBaseProfile(personName: string): Promise<string | null> {
    try {
      const loreName = await this.ensureChatLore();
      if (!loreName) return null;

      const getWB =
        typeof (window as any).getWorldbook === 'function'
          ? (window as any).getWorldbook
          : (window as any).parent.getWorldbook;
      if (getWB) {
        const entries = await getWB(loreName);
        const entry = entries.find((e: any) => e.name === personName);
        return entry ? entry.content : null;
      }
    } catch (e) {
      console.error('[档案分析] 获取本色档案失败:', e);
    }
    return null;
  }

  private async getDynamicProfile(personName: string): Promise<string | null> {
    try {
      const loreName = await this.ensureChatLore();
      if (!loreName) return null;

      const getWB =
        typeof (window as any).getWorldbook === 'function'
          ? (window as any).getWorldbook
          : (window as any).parent.getWorldbook;
      if (getWB) {
        const entries = await getWB(loreName);
        const entry = entries.find((e: any) => e.name === `[人物动态]${personName}`);
        return entry ? entry.content : null;
      }
    } catch (e) {
      console.error('[档案分析] 获取动态档案失败:', e);
    }
    return null;
  }

  private async ensureChatLore(): Promise<string | null> {
    try {
      if (typeof (window as any).getOrCreateChatWorldbook === 'function') {
        return await (window as any).getOrCreateChatWorldbook('current');
      }
      if (typeof (window as any).parent.getOrCreateChatWorldbook === 'function') {
        return await (window as any).parent.getOrCreateChatWorldbook('current');
      }
    } catch (e) {
      console.error('[档案分析] 创建ChatLore失败:', e);
    }
    return null;
  }

  private async updateDynamicProfile(personName: string, content: string): Promise<void> {
    try {
      const loreName = await this.ensureChatLore();
      if (!loreName) throw new Error('无法获取ChatLore');

      const entryName = `[人物动态]${personName}`;

      const updateWB =
        typeof (window as any).updateWorldbookWith === 'function'
          ? (window as any).updateWorldbookWith
          : (window as any).parent.updateWorldbookWith;

      if (updateWB) {
        await updateWB(loreName, (entries: any[]) => {
          const existingIndex = entries.findIndex(e => e.name === entryName);

          const newEntry = {
            name: entryName,
            enabled: true,
            content: content,
            strategy: {
              type: 'constant',
              keys: [personName],
              keys_secondary: { logic: 'and_any', keys: [] },
              scan_depth: 'same_as_global',
            },
            position: {
              type: 'before_character_definition',
              role: 'system',
              depth: 4,
              order: 101,
            },
            probability: 100,
            recursion: {
              prevent_incoming: false,
              prevent_outgoing: false,
              delay_until: null,
            },
            effect: {
              sticky: null,
              cooldown: null,
              delay: null,
            },
          };

          if (existingIndex >= 0) {
            entries[existingIndex] = { ...entries[existingIndex], ...newEntry };
          } else {
            entries.push(newEntry);
          }

          return entries;
        });

        console.log('[档案分析] 动态档案已更新:', entryName);
      }
    } catch (e) {
      console.error('[档案分析] 更新动态档案失败:', e);
      throw e;
    }
  }

  // ============ 获取联系人列表 ============
  private async getContactsFromMvu(): Promise<Array<{ name: string }>> {
    try {
      if ((window as any).parent.Mvu && (window as any).parent.Mvu.getMvuData) {
        const mvuData = (window as any).parent.Mvu.getMvuData({ type: 'message', message_id: -1 });
        if (mvuData && mvuData.stat_data && mvuData.stat_data.租客列表) {
          return Object.keys(mvuData.stat_data.租客列表).map(name => ({ name }));
        }
      }
    } catch (e) {
      console.error('[档案分析] 获取联系人失败:', e);
    }
    return [];
  }
}

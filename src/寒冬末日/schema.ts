import { z } from 'zod';
import _ from 'lodash';

// ---------------------
// 1. 通用定义
// ---------------------

// 角色通用 Schema
const CharacterSchema = z.object({
  姓名: z.string(),

  // 健康系统
  健康: z.coerce.number().min(0).max(100).describe('范围0-100。记录健康数值。获得食物/温暖增加；受伤/饥饿/寒冷减少。'),
  健康更新原因: z.string().describe('记录健康值变化的原因和数值，格式：+/-X, 原因描述'),
  健康状况: z
    .enum(['健康', '亚健康', '生病/受伤', '重病/濒死', '无', '死亡'])
    .describe('>=80:健康; 60-79:亚健康; 30-59:生病/受伤; <30:重病/濒死'),

  // 外貌与状态 (纯文本描述)
  衣着: z.string().describe('详细描述当前的衣着状态'),
  舌唇: z.string().describe('口腔、嘴唇的状态'),
  胸乳: z.string().describe('胸部的状态'),
  私穴: z.string().describe('私处的详细状态'),
  神态样貌: z.string().describe('面部表情和神态'),
  动作姿势: z.string().describe('身体姿态和动作'),

  // 心理
  内心想法: z.string().describe('第一人称内心独白'),

  // 系统控制
  登场状态: z.enum(['登场', '离场']).default('离场').describe('值为"登场"时显示在UI。角色不出现时设为"离场"'),
});

// 2. 世界环境
const WorldSchema = z.object({
  地址: z.string().describe('当前所在的物理位置'),
  日期: z.string().describe('格式：末日纪元，XXXX年XX月XX日'),
  时间: z.string().describe('格式：时间段 - HH:MM'),
  末日天数: z.coerce.number().describe('自“永恒暴雪”降临以来的总天数'),
});

// 3. 庇护所
const ShelterSchema = z.object({
  庇护所等级: z.coerce.number().max(10),
  今日投掷点数: z.string().describe('记录每日升级判定结果'),
  距离上次升级: z.string().describe('记录保底进度'),
  庇护所能力: z
    .array(
      z.object({
        name: z.string(),
        desc: z.string(),
      }),
    )
    .describe('已激活的庇护所能力列表'),
});

// 4. 其他住户
const NeighborsSchema = z.object({
  言语: z.string().describe('其他幸存者的总体言语状态'),
  行为: z.string().describe('其他幸存者的总体行为状态'),
});

// ---------------------
// 5. 主 Schema
// ---------------------
export const Schema = z.object({
  世界: WorldSchema,
  庇护所: ShelterSchema,

  // 主要角色
  浅见亚美: CharacterSchema,
  相田哲也: CharacterSchema,
  星野琉璃: CharacterSchema,
  早川遥: CharacterSchema,
  早川舞: CharacterSchema,
  藤井雪乃: CharacterSchema,
  中村惠子: CharacterSchema,
  爱宫心爱: CharacterSchema,
  爱宫铃: CharacterSchema,
  '桃乐丝・泽巴哈': CharacterSchema,
  何铃: CharacterSchema,
  王静: CharacterSchema,
  康绮月: CharacterSchema,
  薛萍: CharacterSchema,

  // 动态 NPC (Optional)
  临时NPC: CharacterSchema.optional().describe('当有临时NPC登场时使用，离场时设为undefined或重置'),

  楼层其他住户: NeighborsSchema,
});

export type Schema = z.output<typeof Schema>;

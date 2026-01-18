import { z } from 'zod';
import { normalizeRoomTag, parseRoomTag } from './util/room';

const 主要角色关系档位Schema = z.enum(['无', '拒绝', '交易', '顺从', '忠诚', '性奴']).prefault('无');
const 临时NPC关系档位Schema = z.enum(['无', '拒绝', '交易', '顺从', '忠诚', '性奴']).prefault('无');
const 关系倾向Schema = z.enum(['极易', '易', '中立', '难', '极难', '不可']).prefault('中立');
const 健康状况Schema = z
  .preprocess(
    val => {
      if (typeof val !== 'string') return val;
      const s = val.trim();
      if (s === '病重' || s === '濒死' || s === '重病' || s === '病重/濒死') return '重病/濒死';
      if (s === '生病' || s === '受伤' || s === '生病/受伤' || s === '生病受伤') return '生病/受伤';
      return s;
    },
    z.enum(['健康', '亚健康', '生病/受伤', '重病/濒死', '无', '死亡']),
  )
  .prefault('健康');
const 登场状态Schema = z.enum(['登场', '离场']).prefault('离场');
const 更新原因Schema = z
  .preprocess(val => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') return String(val);
    return val;
  }, z.string())
  .prefault('');

const create角色Schema = (args: {
  relationStageSchema: z.ZodTypeAny;
  relationTendencySchema: z.ZodTypeAny;
  defaultRelationStage: string;
  defaultRelationTendency: string;
  defaultImprint: number;
}) =>
  z
    .object({
      姓名: z.string().prefault(''),
      关系: args.relationStageSchema.describe('反应角色的性同意程度，受玩家施舍/救助影响小受关系倾向影响大'),
      关系倾向: args.relationTendencySchema.describe('角色关系的倾向影响Imp数值的变化幅度和难易程度'),
      秩序刻印: z.coerce
        .number()
        .int()
        .transform(v => _.clamp(v, -20, 100))
        .prefault(19)
        .describe('范围-20~100（允许负数）；当Imp<0时将触发角色死亡结算'),
      秩序刻印更新原因: 更新原因Schema.describe(
        '跟随Imp值变动，格式示例：+3, 高级设施体验 / -5, 违反等级约束强行提出性要求',
      ),
      健康: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 100))
        .prefault(100)
        .describe('范围0-100。记录健康数值。获得食物/温暖增加；受伤/饥饿/寒冷减少。'),
      健康更新原因: 更新原因Schema.describe('记录健康值变化的原因和数值，格式：+/-X, 原因描述'),
      健康状况: 健康状况Schema.describe('>=80:健康; 60-79:亚健康; 30-59:生病/受伤; <30:重病/濒死'),
      衣着: z.string().prefault('').describe('描述当前的衣着状态包括上衣裤子丝袜内衣内裤'),
      舌唇: z.string().prefault('').describe('口腔、嘴唇的状态'),
      胸乳: z.string().prefault('').describe('胸部的状态或乳房乳头乳晕等在色情挑逗下的反应'),
      私穴: z.string().prefault('').describe('私处的详细状态或反应'),
      神态样貌: z.string().prefault('').describe('面部表情和神态'),
      动作姿势: z.string().prefault('').describe('身体姿态和动作'),
      内心想法: z.string().prefault('').describe('符合角色身份和剧情描述的第一人称内心独白'),
      所在房间: z
        .string()
        .prefault('')
        .transform(v => {
          const t = normalizeRoomTag(v);
          return parseRoomTag(t).kind === 'none' ? '' : t;
        })
        .describe(
          '角色所在房间（单一真源，用于脚本解算与自动纠偏房间数组）。允许值：""（未知/外出） | 玄关 | 玄关/净化/隔离区 | 玄关/临时客房A | 玄关/临时客房B | 核心区/客厅 | 核心区/餐厅/厨房 | 核心区/主卧室 | 核心区/主浴室 | 楼层{N}/{房间号4位数字}（示例：楼层30/3001） | 户外/{地点}（示例：户外/停车场）。注意：UI 地图仅会显示有格子的地点（玄关/净化/隔离区、玄关/临时客房A/B、核心区四区、以及当前支持的楼层房间）；其它位置（如楼层30/3001、户外/…）暂不展示。',
        ),
      登场状态: 登场状态Schema.describe('剧情未提及时离场，剧情提及登场，凡在庇护所内一律默认登场"'),
    })
    .prefault({
      姓名: '',
      关系: args.defaultRelationStage,
      关系倾向: args.defaultRelationTendency,
      秩序刻印: args.defaultImprint,
      健康: 100,
      健康更新原因: '',
      健康状况: '健康',
      衣着: '',
      舌唇: '',
      胸乳: '',
      私穴: '',
      神态样貌: '',
      动作姿势: '',
      内心想法: '',
      所在房间: '',
      秩序刻印更新原因: '',
      登场状态: '离场',
    });

const 主要角色Schema = create角色Schema({
  relationStageSchema: 主要角色关系档位Schema,
  relationTendencySchema: 关系倾向Schema,
  defaultRelationStage: '无',
  defaultRelationTendency: '中立',
  defaultImprint: 0,
});

const 临时NPCSchema = create角色Schema({
  relationStageSchema: 临时NPC关系档位Schema,
  relationTendencySchema: 关系倾向Schema,
  defaultRelationStage: '无',
  defaultRelationTendency: '中立',
  defaultImprint: 0,
});

export const Schema = z
  .object({
    世界: z
      .object({
        地址: z.string().prefault(''),
        日期: z.string().prefault(''),
        时间: z.string().prefault(''),
        末日天数: z.coerce.number().prefault(0),
      })
      .prefault({
        地址: '',
        日期: '',
        时间: '',
        末日天数: 0,
      }),

    庇护所: z
      .object({
        庇护所等级: z.coerce
          .number()
          .transform(v => _.clamp(v, 1, 10))
          .prefault(1)
          .describe('等级上限为10。升级来源：1.每日Roll点命中；2.剧情奖励；3.保底触发(7天)。'),
        今日投掷点数: z
          .string()
          .prefault('')
          .describe(
            '记录每日升级判定结果。跨天时Roll点(0-10)，命中幸运数(7,10)触发升级。格式："今日已投掷: X点 (触发幸运升级！/未升级)"',
          ),
        距离上次升级: z
          .string()
          .prefault('')
          .describe(
            '记录保底进度。若连续7天未升级，则在第8天跨天时强制触发保底升级。格式："X天 | 剩余保底升级天数：Y天"。升级后重置。',
          ),
        庇护所能力: z
          .record(z.string().describe('能力名'), z.object({ desc: z.string() }).prefault({ desc: '' }))
          .prefault({})
          .describe('已激活的庇护所能力列表。包含等级提升奖励与主线任务解锁的特殊奖励。'),
        可扩展区域: z
          .object({
            医疗翼: z.string().prefault('未解锁').describe('等级3:初级医疗舱; 等级6:外科手术台; 等级9:专家级自动医师'),
            制造工坊: z
              .string()
              .prefault('未解锁')
              .describe(
                '任务奖励解锁: "非致命防御制造器"(阶段一), "轻型军火熔炉"(阶段二); 等级5解锁"伊甸荚舱"; 等级8解锁"重型军械库"',
              ),
            载具格纳库: z
              .string()
              .prefault('未解锁')
              .describe('等级7解锁"先驱者制造单元"; 阶段三任务解锁"工业原料合成器"'),
          })
          .prefault({
            医疗翼: '未解锁',
            制造工坊: '未解锁',
            载具格纳库: '未解锁',
          })
          .describe('记录庇护所可扩展区域的解锁状态'),

        当前生存庇护范围: z
          .record(z.string(), z.array(z.string()))
          .prefault({})
          .describe('脚本回写镜像：最终生效的生存庇护范围（key: 楼层号，如"20"/"19"，value: 房间号数组）。AI 只读。'),

        庇护范围变更: z
          .object({
            add: z.record(z.string(), z.array(z.string())).optional(),
            remove: z.record(z.string(), z.array(z.string())).optional(),
            note: z.string().optional(),
          })
          .prefault({})
          .describe(
            'AI 写入入口（delta）：用于提交“生存庇护范围”的增删变更，脚本会校验/去重/卡上限后写入 chat 变量并回写镜像。示例：{ add: { "20": ["2002"] }, remove: { "20": ["2007"] } }',
          ),
      })
      .prefault({
        庇护所等级: 1,
        今日投掷点数: '',
        距离上次升级: '',
        庇护所能力: {},
        可扩展区域: {
          医疗翼: '未解锁',
          制造工坊: '未解锁',
          载具格纳库: '未解锁',
        },
        当前生存庇护范围: {},
        庇护范围变更: {},
      }),

    房间: z
      .object({
        玄关: z
          .object({
            净化隔离区入住者: z.array(z.string()).prefault([]).describe('净化/隔离区停留者姓名列表（公共区域）'),
            临时客房A入住者: z.array(z.string()).prefault([]).describe('临时客房A进入者姓名列表'),
            临时客房B入住者: z.array(z.string()).prefault([]).describe('临时客房B进入者姓名列表'),
          })
          .prefault({
            净化隔离区入住者: [],
            临时客房A入住者: [],
            临时客房B入住者: [],
          })
          .describe('玄关区域房间状态'),
        核心区: z
          .object({
            客厅使用者: z.array(z.string()).prefault([]).describe('客厅停留者姓名列表（公共区域）'),
            餐厅厨房使用者: z.array(z.string()).prefault([]).describe('餐厅/厨房停留者姓名列表（含万象合成终端）'),
            主卧室使用者: z.array(z.string()).prefault([]).describe('主卧室进入或使用者姓名列表'),
            主浴室使用者: z.array(z.string()).prefault([]).describe('主浴室进入或使用者姓名列表'),
          })
          .prefault({
            客厅使用者: [],
            餐厅厨房使用者: [],
            主卧室使用者: [],
            主浴室使用者: [],
          })
          .describe('20楼2001室核心区域房间进入或使用名单列表'),
        楼层房间: z
          .object({
            楼层20房间: z
              .record(z.string(), z.object({ 入住者: z.array(z.string()) }).prefault({ 入住者: [] }))
              .prefault({})
              .describe('20层各房间进入或使用者列表，key为房间号'),
            楼层19房间: z
              .record(z.string(), z.object({ 入住者: z.array(z.string()) }).prefault({ 入住者: [] }))
              .prefault({})
              .describe('19层各房间进入或使用者列表，key为房间号'),
          })
          .prefault({
            楼层20房间: {},
            楼层19房间: {},
          })
          .describe('楼层房间状态'),
      })
      .prefault({
        玄关: {
          净化隔离区入住者: [],
          临时客房A入住者: [],
          临时客房B入住者: [],
        },
        核心区: {
          客厅使用者: [],
          餐厅厨房使用者: [],
          主卧室使用者: [],
          主浴室使用者: [],
        },
        楼层房间: {
          楼层20房间: {},
          楼层19房间: {},
        },
      }),

    主线任务: z
      .object({
        当前阶段: z.string().prefault('阶段一：秩序的萌芽').describe('主线任务的当前阶段名称'),
        阶段目标: z
          .record(
            z.string(),
            z.object({
              描述: z.string(),
              当前值: z.coerce.number().prefault(0),
              目标值: z.coerce.number().prefault(1),
            }),
          )
          .prefault({
            '肃清20、19、21层的敌对幸存者': { 描述: '肃清20、19、21层的敌对幸存者', 当前值: 0, 目标值: 3 },
            庇护至少3个核心女性角色或家庭: { 描述: '庇护至少3个核心女性角色或家庭', 当前值: 0, 目标值: 3 },
            完成一个公寓内部的情报碎片任务: { 描述: '完成一个公寓内部的情报碎片任务', 当前值: 0, 目标值: 1 },
          })
          .describe('当前阶段需要达成的目标列表'),
        目标完成状态: z
          .record(z.string(), z.boolean())
          .prefault({
            '0': false,
            '1': false,
            '2': false,
          })
          .describe('目标完成状态，key为索引字符串（0/1/2...），value为true表示完成'),
        情报碎片: z
          .record(
            z.string(),
            z
              .object({
                编号: z.string().prefault(''),
                描述: z.string().prefault(''),
                价值: z.string().prefault(''),
                风险: z.string().prefault(''),
                状态: z.enum(['未探索', '已探索', '已完成']).prefault('未探索'),
              })
              .prefault({
                编号: '',
                描述: '',
                价值: '',
                风险: '',
                状态: '未探索',
              }),
          )
          .prefault({})
          .describe('已解锁的情报碎片'),
        $meta: z
          .object({
            楼层: z
              .object({
                last_seen_message_id: z.coerce
                  .number()
                  .prefault(0)
                  .describe('最近一次记录的楼层号（用于过期/清理逻辑）'),
              })
              .prefault({
                last_seen_message_id: 0,
              }),
            情报碎片: z
              .record(
                z.string(),
                z
                  .object({
                    created_at: z.coerce.number().prefault(0),
                    explored_at: z.coerce.number().prefault(0),
                    completed_at: z.coerce.number().prefault(0),
                  })
                  .prefault({
                    created_at: 0,
                    explored_at: 0,
                    completed_at: 0,
                  }),
              )
              .prefault({})
              .describe('情报碎片的楼层时间戳（用于UI倒计时与自动清理）'),
            阶段目标: z
              .record(
                z.string(),
                z
                  .object({
                    completed_at: z.coerce.number().prefault(0),
                  })
                  .prefault({
                    completed_at: 0,
                  }),
              )
              .prefault({})
              .describe('阶段目标的楼层时间戳（用于UI倒计时与自动清理）'),
          })
          .prefault({
            楼层: {
              last_seen_message_id: 0,
            },
            情报碎片: {},
            阶段目标: {},
          })
          .describe('脚本/界面内部元数据（不建议在世界书中直接写入）'),
      })
      .prefault({
        当前阶段: '阶段一：秩序的萌芽',
        阶段目标: {
          '肃清20、19、21层的敌对幸存者': { 描述: '肃清20、19、21层的敌对幸存者', 当前值: 0, 目标值: 3 },
          庇护至少3个核心女性角色或家庭: { 描述: '庇护至少3个核心女性角色或家庭', 当前值: 0, 目标值: 3 },
          完成一个公寓内部的情报碎片任务: { 描述: '完成一个公寓内部的情报碎片任务', 当前值: 0, 目标值: 1 },
        },
        目标完成状态: {
          '0': false,
          '1': false,
          '2': false,
        },
        情报碎片: {},
        $meta: {
          楼层: {
            last_seen_message_id: 0,
          },
          情报碎片: {},
          阶段目标: {},
        },
      }),

    // 主要角色
    浅见亚美: 主要角色Schema,
    相田哲也: 主要角色Schema,
    星野琉璃: 主要角色Schema,
    早川遥: 主要角色Schema,
    早川舞: 主要角色Schema,
    藤井雪乃: 主要角色Schema,
    中村惠子: 主要角色Schema,
    // 爱宫心爱: 主要角色Schema,
    // 爱宫铃: 主要角色Schema,
    '桃乐丝・泽巴哈': 主要角色Schema,
    // 何铃: 主要角色Schema,
    王静: 主要角色Schema,
    // 康绮月: 主要角色Schema,
    // 薛萍: 主要角色Schema,
    小泽花: 主要角色Schema,

    临时NPC: z
      .record(z.string(), 临时NPCSchema)
      .prefault({})
      .describe(
        '存储临时NPC的状态，key为NPC姓名。临时NPC用于短期/路人角色；允许将其转正为主要角色（移至顶层并删除此处）。',
      ),

    楼层其他住户: z
      .object({
        言语: z.string().prefault(''),
        行为: z.string().prefault(''),
      })
      .prefault({
        言语: '',
        行为: '',
      }),
  })
  .catchall(主要角色Schema);

export type Schema = z.output<typeof Schema>;

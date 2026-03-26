import { z } from 'zod';
import { normalizeRoomTag, parseRoomTag } from './util/room';

const 主要角色关系档位Schema = z.enum(['无', '逃离', '交易', '协作', '忠诚', '归附']).prefault('无');
const 临时NPC关系档位Schema = z.enum(['无', '逃离', '交易', '协作', '忠诚', '归附']).prefault('无');
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
const 时间段Schema = z.enum(['凌晨', '清晨', '上午', '中午', '下午', '傍晚', '夜间', '深夜']);
const 时间格式Schema = z.string().regex(/^(凌晨|清晨|上午|中午|下午|傍晚|夜间|深夜) - \d{2}:\d{2}$/);
const 时间段别名映射: Record<string, z.infer<typeof 时间段Schema>> = {
  早晨: '清晨',
  早上: '上午',
  午后: '下午',
  晚上: '夜间',
};

function normalizeTimeText(value: unknown): string {
  const raw = String(value ?? '').trim();
  const normalized = raw.replace(/\s+/g, ' ');
  const match = normalized.match(/^([^\s-]+)\s*-\s*(\d{1,2}):(\d{1,2})$/);
  if (!match) return normalized;

  const rawPeriod = String(match[1]).trim();
  const period = 时间段别名映射[rawPeriod] ?? rawPeriod;
  const validPeriod = 时间段Schema.safeParse(period).success ? period : '上午';

  const hh = _.padStart(String(_.clamp(Number(match[2]), 0, 23)), 2, '0');
  const mm = _.padStart(String(_.clamp(Number(match[3]), 0, 59)), 2, '0');
  return `${validPeriod} - ${hh}:${mm}`;
}
const 庇护楼层Schema = z.enum(['19', '20']);
const 可扩展区域Schema = z
  .record(z.enum(['医疗翼', '制造工坊', '载具格纳库']), z.string().prefault('未解锁'))
  .prefault({
    医疗翼: '未解锁',
    制造工坊: '未解锁',
    载具格纳库: '未解锁',
  });
const 所在房间格式Schema = z.union([
  z.literal(''),
  z.enum([
    '玄关',
    '玄关/净化/隔离区',
    '玄关/临时客房A',
    '玄关/临时客房B',
    '玄关/临时客房C',
    '玄关/临时客房D',
    '玄关/临时客房E',
    '核心区/客厅',
    '核心区/餐厅/厨房',
    '核心区/主卧室',
    '核心区/次卧',
    '核心区/小影院&舞台',
    '核心区/会议室',
    '核心区/主浴室',
    '核心区/书房',
    '户外',
  ]),
  z.string().regex(/^楼层\d+\/\d{4}$/),
  z.string().regex(/^户外\/.+$/),
]);

const createExtensibleMapSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.looseObject({}).catchall(itemSchema).prefault({});

const 角色控制Schema = z
  .object({
    version: z.coerce
      .number()
      .int()
      .transform(v => Math.max(1, v))
      .prefault(1),
    initialized: z.boolean().prefault(false),
    selected_roles: z.array(z.string()).prefault([]),
    revealed_roles: z.array(z.string()).prefault([]),
    deleted_roles: z.array(z.string()).prefault([]),
    initialized_at_message_id: z.coerce
      .number()
      .int()
      .transform(v => Math.max(0, v))
      .prefault(0),
    pending_unlock: z.array(z.string()).prefault([]),
    debug_dossier_inject: z.boolean().prefault(false),
  })
  .prefault({
    version: 1,
    initialized: false,
    selected_roles: [],
    revealed_roles: [],
    deleted_roles: [],
    initialized_at_message_id: 0,
    pending_unlock: [],
    debug_dossier_inject: false,
  });

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
      关系: args.relationStageSchema,
      关系倾向: args.relationTendencySchema,
      秩序刻印: z.coerce
        .number()
        .int()
        .transform(v => _.clamp(v, -20, 100))
        .prefault(19),
      秩序刻印更新原因: 更新原因Schema,
      健康: z.coerce
        .number()
        .transform(v => _.clamp(v, 0, 100))
        .prefault(100),
      健康更新原因: 更新原因Schema,
      健康状况: 健康状况Schema,
      衣着: z.string().prefault(''),
      舌唇: z.string().prefault(''),
      胸乳: z.string().prefault(''),
      私穴: z.string().prefault(''),
      神态样貌: z.string().prefault(''),
      动作姿势: z.string().prefault(''),
      内心想法: z.string().prefault(''),
      所在房间: z
        .preprocess(val => normalizeRoomTag(String(val ?? '')), 所在房间格式Schema)
        .prefault('')
        .transform(v => {
          const t = normalizeRoomTag(v);
          return parseRoomTag(t).kind === 'none' ? '' : t;
        }),
      登场状态: 登场状态Schema,
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
        时间: z.preprocess(normalizeTimeText, 时间格式Schema).prefault('上午 - 08:00').catch('上午 - 08:00'),
        末日天数: z.coerce.number().prefault(0),
        开局配置: z
          .object({
            sealed: z.boolean().prefault(false),
            world_mode_id: z.string().prefault(''),
            route_id: z.string().prefault(''),
            pre_disaster_identity: z.string().prefault(''),
            early_story_tone: z.string().prefault(''),
            opening_seed_user_message_id: z.coerce.number().int().prefault(0),
            opening_result_message_id: z.coerce.number().int().prefault(0),
            form_values: z
              .object({
                supplemental_setting: z.string().prefault(''),
              })
              .prefault({
                supplemental_setting: '',
              }),
            meta: z
              .object({
                source: z.string().prefault('opening_ui'),
                version: z.coerce.number().int().prefault(1),
              })
              .prefault({
                source: 'opening_ui',
                version: 1,
              }),
          })
          .prefault({
            sealed: false,
            world_mode_id: '',
            route_id: '',
            pre_disaster_identity: '',
            early_story_tone: '',
            opening_seed_user_message_id: 0,
            opening_result_message_id: 0,
            form_values: {
              supplemental_setting: '',
            },
            meta: {
              source: 'opening_ui',
              version: 1,
            },
          }),
      })
      .prefault({
        地址: '',
        日期: '',
        时间: '上午 - 08:00',
        末日天数: 0,
        开局配置: {
          sealed: false,
          world_mode_id: '',
          route_id: '',
          pre_disaster_identity: '',
          early_story_tone: '',
          opening_seed_user_message_id: 0,
          opening_result_message_id: 0,
          form_values: {
            supplemental_setting: '',
          },
          meta: {
            source: 'opening_ui',
            version: 1,
          },
        },
      }),

    庇护所: z
      .object({
        庇护所等级: z.coerce
          .number()
          .transform(v => _.clamp(v, 1, 10))
          .prefault(1),
        今日投掷点数: z.string().prefault(''),
        距离上次升级: z.string().prefault(''),
        庇护所能力: z
          .record(
            z.string().describe('能力名'),
            z
              .object({
                name: z.string().prefault(''),
                desc: z.string().prefault(''),
              })
              .prefault({ name: '', desc: '' }),
          )
          .prefault({}),
        庇护所能力总述: z.string().prefault(''),
        接口覆盖等价庇护范围: z.boolean().prefault(false),
        接口覆盖范围: z.partialRecord(庇护楼层Schema, z.array(z.string()).prefault([])).prefault({}),
        可扩展区域: 可扩展区域Schema,

        当前生存庇护范围: z.partialRecord(庇护楼层Schema, z.array(z.string()).prefault([])).prefault({}),

        庇护范围变更: z
          .object({
            add: z.partialRecord(庇护楼层Schema, z.array(z.string()).prefault([])).prefault({}),
            remove: z.partialRecord(庇护楼层Schema, z.array(z.string()).prefault([])).prefault({}),
            note: z.string().prefault(''),
          })
          .prefault({ add: {}, remove: {}, note: '' }),
      })
      .prefault({
        庇护所等级: 1,
        今日投掷点数: '',
        距离上次升级: '',
        庇护所能力: {},
        庇护所能力总述: '',
        接口覆盖等价庇护范围: false,
        接口覆盖范围: {},
        可扩展区域: {
          医疗翼: '未解锁',
          制造工坊: '未解锁',
          载具格纳库: '未解锁',
        },
        当前生存庇护范围: {},
        庇护范围变更: {
          add: {},
          remove: {},
          note: '',
        },
      }),

    房间: z
      .object({
        玄关: z
          .object({
            净化隔离区入住者: z.array(z.string()).prefault([]),
            临时客房A入住者: z.array(z.string()).prefault([]),
            临时客房B入住者: z.array(z.string()).prefault([]),
            临时客房C入住者: z.array(z.string()).prefault([]),
            临时客房D入住者: z.array(z.string()).prefault([]),
            临时客房E入住者: z.array(z.string()).prefault([]),
          })
          .prefault({
            净化隔离区入住者: [],
            临时客房A入住者: [],
            临时客房B入住者: [],
            临时客房C入住者: [],
            临时客房D入住者: [],
            临时客房E入住者: [],
          }),
        核心区: z
          .object({
            客厅使用者: z.array(z.string()).prefault([]),
            餐厅厨房使用者: z.array(z.string()).prefault([]),
            主卧室使用者: z.array(z.string()).prefault([]),
            次卧使用者: z.array(z.string()).prefault([]),
            小影院舞台使用者: z.array(z.string()).prefault([]),
            会议室使用者: z.array(z.string()).prefault([]),
            书房使用者: z.array(z.string()).prefault([]),
            主浴室使用者: z.array(z.string()).prefault([]),
          })
          .prefault({
            客厅使用者: [],
            餐厅厨房使用者: [],
            主卧室使用者: [],
            次卧使用者: [],
            小影院舞台使用者: [],
            会议室使用者: [],
            书房使用者: [],
            主浴室使用者: [],
          }),
        楼层房间: z
          .object({
            楼层20房间: z
              .record(z.string(), z.object({ 入住者: z.array(z.string()).prefault([]) }).prefault({ 入住者: [] }))
              .prefault({}),
            楼层19房间: z
              .record(z.string(), z.object({ 入住者: z.array(z.string()).prefault([]) }).prefault({ 入住者: [] }))
              .prefault({}),
          })
          .prefault({
            楼层20房间: {},
            楼层19房间: {},
          }),
      })
      .prefault({
        玄关: {
          净化隔离区入住者: [],
          临时客房A入住者: [],
          临时客房B入住者: [],
          临时客房C入住者: [],
          临时客房D入住者: [],
          临时客房E入住者: [],
        },
        核心区: {
          客厅使用者: [],
          餐厅厨房使用者: [],
          主卧室使用者: [],
          次卧使用者: [],
          小影院舞台使用者: [],
          会议室使用者: [],
          书房使用者: [],
          主浴室使用者: [],
        },
        楼层房间: {
          楼层20房间: {},
          楼层19房间: {},
        },
      }),

    主线任务: z
      .object({
        当前阶段: z.string().prefault('阶段一：秩序的萌芽'),
        阶段目标: z
          .record(
            z.string(),
            z.object({
              描述: z.string().prefault(''),
              当前值: z.coerce.number().prefault(0),
              目标值: z.coerce.number().prefault(1),
            }),
          )
          .prefault({
            '肃清20、19、21层的敌对幸存者': { 描述: '肃清20、19、21层的敌对幸存者', 当前值: 0, 目标值: 3 },
            庇护至少3个核心女性角色或家庭: { 描述: '庇护至少3个核心女性角色或家庭', 当前值: 0, 目标值: 3 },
            完成一个公寓内部的情报碎片任务: { 描述: '完成一个公寓内部的情报碎片任务', 当前值: 0, 目标值: 1 },
          }),
        目标完成状态: z.record(z.string(), z.boolean()).prefault({
          '0': false,
          '1': false,
          '2': false,
        }),
        情报碎片: createExtensibleMapSchema(
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
        ),
        $meta: z
          .object({
            楼层: z
              .object({
                last_seen_message_id: z.coerce.number().prefault(0),
              })
              .prefault({
                last_seen_message_id: 0,
              }),
            情报碎片: createExtensibleMapSchema(
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
            ),
            阶段目标: createExtensibleMapSchema(
              z
                .object({
                  completed_at: z.coerce.number().prefault(0),
                })
                .prefault({
                  completed_at: 0,
                }),
            ),
            角色控制: 角色控制Schema,
          })
          .prefault({
            楼层: {
              last_seen_message_id: 0,
            },
            情报碎片: {},
            阶段目标: {},
            角色控制: {
              version: 1,
              initialized: false,
              selected_roles: [],
              revealed_roles: [],
              deleted_roles: [],
              initialized_at_message_id: 0,
              pending_unlock: [],
              debug_dossier_inject: false,
            },
          }),
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

    // 主要角色采用动态键：未显式声明的顶层角色将由 .catchall(主要角色Schema) 校验

    临时NPC: createExtensibleMapSchema(临时NPCSchema),

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

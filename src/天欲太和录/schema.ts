import { z } from 'zod';

const 初始日期 = '天和元年1月1日 14:00';
const 日期格式Schema = z.string().regex(/^.+年\d{1,2}月\d{1,2}日 \d{2}:\d{2}$/);

function normalizeDateText(value: unknown): string {
  const raw = String(value ?? '').trim();
  const normalized = raw.replace(/\s+/g, ' ');
  const match = normalized.match(/^(.+年)\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{1,2})$/);
  if (!match) return normalized;

  const 年号 = match[1].replace(/ /g, '');
  const month = _.clamp(Number(match[2]), 1, 12);
  const day = _.clamp(Number(match[3]), 1, 31);
  const hh = _.padStart(String(_.clamp(Number(match[4]), 0, 23)), 2, '0');
  const mm = _.padStart(String(_.clamp(Number(match[5]), 0, 59)), 2, '0');
  return `${年号}${month}月${day}日 ${hh}:${mm}`;
}

const 关系档位Schema = z.enum(['无', '永久逃离', '逃离', '交易', '协作', '忠诚', '归附']).prefault('无');
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

const 伊甸一次性指令条目Schema = z
  .object({
    名称: z.string().prefault(''),
    数量: z.coerce.number().int().nonnegative().prefault(0),
    说明: z.string().prefault(''),
    范围: z.string().prefault(''),
    时效: z.string().prefault(''),
    生效实例: z
      .array(
        z
          .object({
            对象范围: z.string().prefault(''),
            剩余时效: z.string().prefault(''),
          })
          .prefault({ 对象范围: '', 剩余时效: '' }),
      )
      .prefault([]),
  })
  .prefault({ 名称: '', 数量: 0, 说明: '', 范围: '', 时效: '', 生效实例: [] });

const 角色Schema = z
  .object({
    姓名: z.string().prefault(''),
    关系: 关系档位Schema,
    关系倾向: 关系倾向Schema,
    秩序刻印: z.coerce
      .number()
      .int()
      .transform(v => _.clamp(v, -20, 100))
      .prefault(0),
    健康: z.coerce
      .number()
      .transform(v => _.clamp(v, 0, 100))
      .prefault(100),
    健康状况: 健康状况Schema,
    登场状态: 登场状态Schema,
  })
  .prefault({
    姓名: '',
    关系: '无',
    关系倾向: '中立',
    秩序刻印: 0,
    健康: 100,
    健康状况: '健康',
    登场状态: '离场',
  });

export const Schema = z
  .object({
    世界: z
      .object({
        地址: z.preprocess(value => value ?? '', z.string()).prefault(''),
        日期: z.preprocess(normalizeDateText, 日期格式Schema).prefault(初始日期).catch(初始日期),
      })
      .prefault({ 地址: '', 日期: 初始日期 }),

    伊甸一次性指令: z.record(z.string().describe('指令编号'), 伊甸一次性指令条目Schema).prefault({}),

    // 顾玄一为开局主要角色；其余主要角色为动态键，由 .catchall(角色Schema) 校验
    顾玄一: 角色Schema,

    临时NPC: z.record(z.string().describe('临时称呼'), 角色Schema).prefault({}),
  })
  .catchall(角色Schema);

export type Schema = z.output<typeof Schema>;

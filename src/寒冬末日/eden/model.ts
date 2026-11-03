import { z } from 'zod';

export const EDEN_GROUPS = ['供暖供电', '防护安保', '食物与制造', '清洁与娱乐', '通讯与情报', '外出装备'] as const;
const Text = z.string().trim().min(1, '请填写名称或描述');
const Level = z.number().int().min(1).max(4);
export const EdenAbilitySchema = z.object({
  name: Text,
  group: z.enum(EDEN_GROUPS),
  effect: Text,
  limit: z.string().trim(),
  level: Level,
  condition: z.string().trim(),
  conditionConfirmed: z.boolean(),
  enabled: z.boolean(),
  replaces: z.array(z.string()).prefault([]),
});
const AchievementSchema = z.object({
  kind: z.enum(['技术', '生产']),
  key: Text,
  name: Text,
  evidence: Text,
  day: z.number().finite(),
  messageId: z.number().int().min(0),
  sourceFingerprint: z.string().prefault(''),
  branch: z.enum(['农业', '工业', '气象', '其他']).prefault('其他'),
  techLevel: z.number().int().min(0).max(5).nullable().prefault(null),
});
export const InitialEdenTechnologySchema = z.object({
  branch: z.enum(['农业', '工业', '气象']),
  techLevel: z.number().int().min(0).max(5),
  name: Text,
});
export type InitialEdenTechnology = z.infer<typeof InitialEdenTechnologySchema>;
export const EdenDocumentSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0),
  savedAt: z.string(),
  level: Level,
  levelNames: z.array(Text).length(4),
  status: z.enum(['运行', '停用']),
  rooms: z
    .array(
      z
        .string()
        .regex(/^20\d{2}$/, '外接房间需为20层四位房号')
        .refine(room => room !== '2001', '2001无需外接'),
    )
    .refine(rooms => new Set(rooms).size === rooms.length, '房间不能重复'),
  abilities: z.record(Text, EdenAbilitySchema).refine(abilities => {
    const names = Object.values(abilities).map(item => item.name);
    return new Set(names).size === names.length;
  }, '能力名称不能重复'),
  rescueStartDay: z.number().min(0),
  initialTechnologies: z
    .array(InitialEdenTechnologySchema)
    .refine(
      items => new Set(items.map(item => `${item.branch}-lv${item.techLevel}`)).size === items.length,
      '初始技术不能重复',
    )
    .prefault([]),
  openingSetup: z.object({ fingerprint: z.string(), startDay: z.number().finite() }).optional(),
  achievements: z.record(Text, AchievementSchema),
  missionLore: Text,
  technologyLore: Text,
});
export type EdenDocument = z.infer<typeof EdenDocumentSchema>;
export type EdenAbility = z.infer<typeof EdenAbilitySchema>;
export type EdenContext = {
  day: number | null;
  messageId: number;
  anchors?: Record<string, string>;
  knownIntel?: Record<string, any>;
};
export type AchievementInput = Pick<z.infer<typeof AchievementSchema>, 'kind' | 'key' | 'name' | 'evidence'> &
  Partial<Pick<z.infer<typeof AchievementSchema>, 'branch' | 'techLevel'>>;

/** 对剧情文本前缀建立身份，楼层号重用或上文换分支后不能恢复旧成果。无需把聊天正文存进世界书。 */
export function buildEdenAnchors(
  messages: Array<{ message_id: number; role?: string; name?: string; message?: string }>,
): Record<string, string> {
  const anchors: Record<string, string> = {};
  let first = 2166136261;
  let second = 5381;
  for (const message of messages) {
    const text = JSON.stringify([message.message_id, message.role ?? '', message.name ?? '', message.message ?? '']);
    for (let index = 0; index < text.length; index++) {
      first = Math.imul(first ^ text.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ text.charCodeAt(index);
    }
    anchors[message.message_id] = `v1:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
  }
  return anchors;
}

export function confirmAchievement(
  document: EdenDocument,
  input: AchievementInput,
  context: EdenContext,
): EdenDocument {
  if (context.day === null || !Number.isFinite(context.day)) throw new Error('当前末日天数未知，不能确认成果');
  const typedKey =
    input.kind === '技术' &&
    input.branch &&
    input.branch !== '其他' &&
    input.techLevel !== null &&
    input.techLevel !== undefined
      ? `${input.branch}-lv${input.techLevel}`
      : input.key;
  const item = AchievementSchema.parse({
    ...input,
    key: typedKey,
    ...(input.kind === '生产' ? { branch: '其他', techLevel: null } : {}),
    day: context.day,
    messageId: context.messageId,
    sourceFingerprint: context.anchors?.[context.messageId] ?? '',
  });
  if (item.kind === '技术' && item.branch !== '其他') {
    if (item.techLevel === null) throw new Error('请选择该技术的lv0至lv5等级');
    item.key = `${item.branch}-lv${item.techLevel}`;
  }
  const id = `${item.kind}:${item.key}`;
  if (
    item.kind === '技术' &&
    document.initialTechnologies.some(
      initial =>
        `${initial.branch}-lv${initial.techLevel}` === item.key ||
        (initial.branch === '农业' && initial.techLevel === 0 && item.key === 'agriculture-0'),
    )
  )
    throw new Error('初始技术不能重复结算');
  const previous = document.achievements[id];
  const sourceWasReplaced =
    !!previous &&
    !!context.anchors &&
    (!previous.sourceFingerprint || context.anchors[previous.messageId] !== previous.sourceFingerprint);
  if (previous && !sourceWasReplaced) throw new Error('同一成果不能重复结算；请使用原成果编号');
  return EdenDocumentSchema.parse({ ...document, achievements: { ...document.achievements, [id]: item } });
}

export function getEdenRuntime(document: EdenDocument, context: EdenContext) {
  const day = context.day;
  const achievements = Object.entries(document.achievements)
    .filter(
      ([, item]) =>
        day !== null &&
        item.day <= day &&
        item.messageId <= context.messageId &&
        (!context.anchors || (!!item.sourceFingerprint && context.anchors[item.messageId] === item.sourceFingerprint)),
    )
    .map(([id, item]) => ({ id, ...item }));
  const lastAchievementDay = Math.max(
    document.rescueStartDay,
    ...achievements.filter(item => item.day >= 0).map(item => item.day),
  );
  let checkpoint = document.rescueStartDay;
  let overdueSinceDay: number | null = null;
  for (const item of [...achievements]
    .filter(item => item.day >= document.rescueStartDay)
    .sort((a, b) => a.day - b.day)) {
    if (item.day - checkpoint > 30 && overdueSinceDay === null) overdueSinceDay = checkpoint + 31;
    checkpoint = item.day;
  }
  if (day !== null && day >= 0 && day - checkpoint > 30 && overdueSinceDay === null) overdueSinceDay = checkpoint + 31;
  const overdue = day !== null && day >= 0 && overdueSinceDay !== null;
  const rescueStatus = day === null ? '日期未知' : day < 0 ? '灾前准备' : overdue ? '救亡逾期' : '履行中';
  const running = document.status === '运行' && !overdue;
  const eligible = Object.entries(document.abilities)
    .filter(
      ([, item]) =>
        running && item.enabled && item.level <= document.level && (!item.condition || item.conditionConfirmed),
    )
    .map(([id, item]) => ({ id, ...item }));
  const replaced = new Set(eligible.flatMap(item => item.replaces));
  const abilities = eligible.filter(item => !replaced.has(item.id));
  const externalPower = abilities.some(item => item.id === 'external-power');
  const rooms = externalPower ? document.rooms.slice(0, document.level >= 4 ? undefined : 3) : [];
  return {
    running,
    abilities,
    rooms,
    achievements,
    rescue: {
      status: rescueStatus,
      overdue,
      overdueSinceDay,
      lastAchievementDay,
      deadlineDay: lastAchievementDay + 30,
      remainingDays: day === null || day < 0 ? null : overdue ? 0 : Math.max(0, lastAchievementDay + 30 - day),
    },
  };
}

export function describeEden(document: EdenDocument, context: EdenContext): string {
  const state = getEdenRuntime(document, context);
  return [
    '<当前伊甸>',
    `本条目是玩家在前端确认保存的伊甸能力权限；不得依据旧任务、旧掷点或历史摘要擅自增加能力。`,
    `本体等级：${document.level}级·${document.levelNames[document.level - 1]}；运行状态：${state.running ? '运行' : state.rescue.overdue ? '停机（救亡逾期）' : '玩家停用'}。`,
    `当前剧情：${context.day === null ? '末日天数未知，不推定救亡逾期' : context.day < 0 ? `灾前${Math.abs(context.day)}天` : `末日第${context.day}天`}。`,
    '已启用能力：',
    ...state.abilities.map(
      item =>
        `- ${item.name}：${item.effect}${item.limit ? `；限制：${item.limit}` : ''}${item.condition ? `；已确认条件：${item.condition}` : ''}`,
    ),
    ...(state.abilities.length ? [] : ['- 无。停机或停用时不提供伊甸功能，既有实体物资不会凭空消失。']),
    `外接供暖供电房间：${state.rooms.join('、') || '无'}。登记其他房间不自动授予供水、监控、制造或安防。`,
    '尚未启用：',
    ...Object.entries(document.abilities)
      .filter(([id]) => !state.abilities.some(item => item.id === id))
      .map(
        ([, item]) =>
          `- ${item.name}：${!state.running ? '伊甸停用或停机' : item.level > document.level ? `需${item.level}级` : !item.enabled ? '玩家未启用' : item.condition && !item.conditionConfirmed ? item.condition : '已由更高模块替代'}`,
      ),
    '本体等级、失散技术等级与生产体系进度分别记录。技术知识不会自动生成设备或完成社会化生产。',
    '</当前伊甸>',
  ].join('\n');
}

export function describeRescue(document: EdenDocument, context: EdenContext): string {
  const state = getEdenRuntime(document, context);
  const board = getEdenMissionBoard(document, context, context.knownIntel);
  return [
    '<当前救亡任务>',
    `当前目标：${board.currentTask.title}。${board.currentTask.description}`,
    ...board.clues.map(clue => `已知线索：${clue.title}（${clue.status}）——${clue.description}`),
    `状态：${state.rescue.status}。救亡义务仅灾后生效，灾前记录成果但不启动或延后灾后期限。`,
    `灾后起算日：第${document.rescueStartDay}天；最近有效起算点：第${state.rescue.lastAchievementDay}天；本次期限：第${state.rescue.deadlineDay}天。超过该日才逾期。`,
    `剩余天数：${state.rescue.remainingDays ?? '尚未计时'}；${state.rescue.overdue ? `第${state.rescue.overdueSinceDay}天起救亡逾期，伊甸停止响应与提供功能；迟到的新成果不能自动恢复，须玩家另外明确确认恢复。` : '首次获得有效技术、首次建立自持生产体系可分别计为成果，须由玩家在前端确认。'}`,
    ...state.achievements.map(
      item =>
        `- ${item.kind}成果 ${item.key}：${item.name}；${item.day < 0 ? '灾前' : '末日'}第${Math.abs(item.day)}天；依据：${item.evidence}`,
    ),
    '同一成果编号只结算一次；重启既有生产线或重复取得同项技术不重置期限。不得输出旧主线奖励、自动升级或全员Imp奖励。',
    '</当前救亡任务>',
  ].join('\n');
}

export type KnownEdenTechnology = Pick<
  z.infer<typeof AchievementSchema>,
  'branch' | 'techLevel' | 'key' | 'name' | 'evidence'
> & { id: string };

/** 初始知识不进入成果账本，不参与救亡计时。 */
export function getKnownEdenTechnologies(document: EdenDocument, context: EdenContext): KnownEdenTechnology[] {
  const initial = document.initialTechnologies.map(item => ({
    ...item,
    id: `技术:${item.branch}-lv${item.techLevel}`,
    key: `${item.branch}-lv${item.techLevel}`,
    evidence: '开局已掌握（不计救亡成果）',
  }));
  const known = new Map<string, KnownEdenTechnology>(initial.map(item => [item.id, item]));
  for (const item of getEdenRuntime(document, context).achievements.filter(item => item.kind === '技术')) {
    if (!known.has(item.id)) known.set(item.id, item);
  }
  return [...known.values()];
}

export function describeTechnologies(document: EdenDocument, context: EdenContext): string {
  const state = getEdenRuntime(document, context);
  return [
    '<当前伊甸技术>',
    ...getKnownEdenTechnologies(document, context).map(
      item =>
        `- 已获得 ${item.branch}${item.techLevel === null ? '' : `lv${item.techLevel}`} ${item.key}：${item.name}；${item.evidence}`,
    ),
    ...state.achievements
      .filter(item => item.kind === '生产')
      .map(item => `- 自持生产体系 ${item.key}：${item.name}；${item.evidence}`),
    ...(state.achievements.length || document.initialTechnologies.length ? [] : ['尚无已确认的技术或自持生产成果。']),
    '仅有知识不等于已有设备、人口、原料和生产秩序；未发现的后续线索不得提前告诉角色。',
    '</当前伊甸技术>',
  ].join('\n');
}

/** 看板只显示已知调查方向，不展开完整技术树或未来失散地点。 */
export function getEdenMissionBoard(document: EdenDocument, context: EdenContext, intel: Record<string, any> = {}) {
  const state = getEdenRuntime(document, context);
  const agricultureZero = getKnownEdenTechnologies(document, context).some(
    item => (item.branch === '农业' && item.techLevel === 0) || ['agriculture-0', '农业-lv0'].includes(item.key),
  );
  const production = state.achievements.some(item => item.kind === '生产');
  const currentTask = state.rescue.overdue
    ? { title: '救亡期限已逾期', description: '伊甸已停止响应。当前成果与已知线索保留，等待正式恢复决定。' }
    : !agricultureZero
      ? {
          title: '寻找农业 lv0 · 万能营养液',
          description: '伊甸残存记忆指向星穹公寓。沿已知线索寻找量子意识存储器，确认取得知识后再推进生产。',
        }
      : !production
        ? {
            title: '建立首套自持生产体系',
            description: '将已经获得的技术落实为能够实际运行、持续供给的生产体系。知识、原料、人员与组织条件分别确认。',
          }
        : {
            title: '推进下一项救亡成果',
            description: '继续寻找已知线索指向的失散技术，或建立新的自持生产体系。重复取得旧成果不重新结算。',
          };
  const clues: Array<{ id: string; title: string; description: string; status: string }> = agricultureZero
    ? []
    : [
        {
          id: 'ag0-professor',
          title: '农业生物科技教授',
          description: '公寓内一位教授曾将一打技术资料带回家研究，教授生死与资料去向未知。',
          status: '待调查',
        },
        {
          id: 'ag0-station',
          title: '地下消防救援站',
          description: '废弃救援站灾后曾被用作政府情报人员安全屋，可能留下相关痕迹。',
          status: context.day !== null && context.day < 0 ? '灾后线索' : '待调查',
        },
        {
          id: 'ag0-memory',
          title: '伊甸残存记忆',
          description: '修复农业 lv0 失散前的记忆需要大量能量，先寻找可行的供能方案。',
          status: '需要供能',
        },
      ];
  if (context.day !== null && context.day < 0) {
    const futureClue = clues.findIndex(clue => clue.id === 'ag0-station');
    if (futureClue >= 0) clues.splice(futureClue, 1);
  }
  for (const [id, item] of Object.entries(intel)) {
    if (id.startsWith('$') || !item || typeof item !== 'object') continue;
    const description = String(item.描述 ?? '').trim();
    if (!description) continue;
    clues.push({
      id: `intel:${id}`,
      title: String(item.编号 || id),
      description,
      status: String(item.状态 || '已知线索'),
    });
  }
  return { currentTask, clues, achievements: state.achievements, rescue: state.rescue };
}

/** 仅兼容旧面板的显示字段；不让这些字段反过来改写正式世界书。 */
export function projectEdenToMvu(document: EdenDocument, context: EdenContext, statData: Record<string, any>): void {
  const state = getEdenRuntime(document, context);
  const shelter = (statData.庇护所 ??= {});
  shelter.庇护所等级 = document.level;
  shelter.庇护所能力 = Object.fromEntries(
    state.abilities.map(item => [item.name, { name: item.name, desc: item.effect }]),
  );
  shelter.庇护所能力总述 = describeEden(document, context);
  shelter.接口覆盖等价庇护范围 = false;
  shelter.接口覆盖范围 = {};
  shelter.当前生存庇护范围 = state.rooms.length ? { '20': [...state.rooms] } : {};
  shelter.庇护范围变更 = {};
  shelter.今日投掷点数 = '世界书确认模式';
  shelter.距离上次升级 = '由玩家确认等级';
  shelter.可扩展区域 = {
    医疗翼: state.abilities.some(item => item.id === 'medicine' || item.id === 'tools')
      ? '已确认医药与器械能力（无自动诊疗）'
      : '未解锁',
    制造工坊: state.abilities.some(item => item.id === 'tools') ? '简易制造' : '未解锁',
    载具格纳库: '未解锁',
  };
  const missions = (statData.主线任务 ??= {});
  missions.当前阶段 = `末日救亡·${state.rescue.status}`;
  missions.阶段目标 = {};
  missions.目标完成状态 = {};
}

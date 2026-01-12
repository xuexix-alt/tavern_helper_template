type MissionGoal = {
  描述: string;
  当前值: number;
  目标值: number;
};

type IntelStatus = '未探索' | '已探索' | '已完成';
type IntelFragment = {
  编号: string;
  描述: string;
  价值: string;
  风险: string;
  状态: IntelStatus;
};

type MissionMeta = {
  楼层: {
    last_seen_message_id: number;
  };
  情报碎片: Record<
    string,
    {
      created_at: number;
      explored_at: number;
      completed_at: number;
    }
  >;
  阶段目标: Record<
    string,
    {
      completed_at: number;
    }
  >;
};

type MissionStageDef = {
  name: string;
  goals: Array<{ key: string; 描述: string; 目标值: number }>;
  rewards?: {
    abilities?: Record<string, string>;
  };
};

function readMissionDebugFlagFromChat(): boolean {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const debug = _.get(vars, 'eden.debug', {}) ?? {};
  return _.get(debug, 'mission_logic', false) === true;
}

function safeJsonStringify(val: any): string {
  try {
    return JSON.stringify(val);
  } catch {
    return '[unstringifiable]';
  }
}

function pickMissionSnapshot(stat_data: any): any {
  return {
    当前阶段: _.get(stat_data, '主线任务.当前阶段', null),
    阶段目标: _.get(stat_data, '主线任务.阶段目标', null),
    目标完成状态: _.get(stat_data, '主线任务.目标完成状态', null),
    情报碎片: _.get(stat_data, '主线任务.情报碎片', null),
    $meta: _.get(stat_data, '主线任务.$meta', null),
    庇护所能力: _.get(stat_data, '庇护所.庇护所能力', null),
  };
}

function logMissionSnapshotDiff(tag: string, before: any, after: any) {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  const changed: Record<string, { before: any; after: any }> = {};
  for (const k of keys) {
    const b = before?.[k];
    const a = after?.[k];
    if (!_.isEqual(b, a)) changed[k] = { before: b, after: a };
  }
  if (Object.keys(changed).length === 0) return;
  console.log(`[MissionLogic][${tag}] changed keys: ${Object.keys(changed).join(', ')}`);
  for (const [k, v] of Object.entries(changed)) {
    console.log(`[MissionLogic][${tag}] ${k}: ${safeJsonStringify(v.before)} -> ${safeJsonStringify(v.after)}`);
  }
}

function normalizeMissionGoals(raw: any): Array<{ key: string; value: MissionGoal }> {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) {
    return raw.map((g, idx) => ({
      key: String(idx),
      value: {
        描述: String(g?.描述 ?? ''),
        当前值: Number(g?.当前值 ?? 0),
        目标值: Number(g?.目标值 ?? 0),
      },
    }));
  }
  return Object.entries(raw).map(([k, g]) => ({
    key: String(k),
    value: {
      描述: String((g as any)?.描述 ?? ''),
      当前值: Number((g as any)?.当前值 ?? 0),
      目标值: Number((g as any)?.目标值 ?? 0),
    },
  }));
}

function buildGoalsRecord(stage: MissionStageDef): Record<string, MissionGoal> {
  const record: Record<string, MissionGoal> = {};
  for (const g of stage.goals) {
    record[g.key] = { 描述: g.描述, 当前值: 0, 目标值: g.目标值 };
  }
  return record;
}

function buildGoalStatusRecord(goalCount: number): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (let i = 0; i < goalCount; i += 1) {
    record[String(i)] = false;
  }
  return record;
}

function clampNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isGoalDone(goal: MissionGoal): boolean {
  const cur = clampNumber(goal.当前值);
  const tgt = clampNumber(goal.目标值);
  if (tgt <= 0) return false;
  return cur >= tgt;
}

function isIntelFragment(val: unknown): val is IntelFragment {
  if (!val || typeof val !== 'object') return false;
  const status = (val as any).状态;
  if (status !== '未探索' && status !== '已探索' && status !== '已完成') return false;
  return true;
}

function getLastMessageIdSafe(): number | null {
  try {
    const id = (globalThis as any).getLastMessageId?.();
    if (typeof id === 'number' && Number.isFinite(id)) return id;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function ensureMissionMeta(stat_data: any) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const raw = _.get(mission, '$meta', null);
  const meta: MissionMeta =
    raw && typeof raw === 'object'
      ? (raw as any)
      : {
          楼层: { last_seen_message_id: 0 },
          情报碎片: {},
          阶段目标: {},
        };

  if (!meta.楼层 || typeof meta.楼层 !== 'object') meta.楼层 = { last_seen_message_id: 0 };
  if (typeof meta.楼层.last_seen_message_id !== 'number') meta.楼层.last_seen_message_id = 0;
  if (!meta.情报碎片 || typeof meta.情报碎片 !== 'object') meta.情报碎片 = {};
  if (!meta.阶段目标 || typeof meta.阶段目标 !== 'object') meta.阶段目标 = {};

  _.set(stat_data, '主线任务.$meta', meta);
}

function syncMissionMetaIntel(stat_data: any, message_id: number) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const intel = _.get(mission, '情报碎片', null);
  if (!intel || typeof intel !== 'object' || Array.isArray(intel)) return;

  ensureMissionMeta(stat_data);
  const meta: MissionMeta = _.get(stat_data, '主线任务.$meta');
  const metaIntel = meta.情报碎片 ?? {};

  // 清理已消失的 key
  for (const k of Object.keys(metaIntel)) {
    if (!(k in (intel as any))) delete metaIntel[k];
  }

  for (const [k, frag] of Object.entries(intel as Record<string, unknown>)) {
    if (!isIntelFragment(frag)) continue;

    const cur = metaIntel[k] ?? { created_at: message_id, explored_at: 0, completed_at: 0 };
    if (!cur.created_at) cur.created_at = message_id;

    if (frag.状态 === '未探索') {
      cur.explored_at = 0;
      cur.completed_at = 0;
    } else if (frag.状态 === '已探索') {
      if (!cur.explored_at) cur.explored_at = message_id;
      cur.completed_at = 0;
    } else if (frag.状态 === '已完成') {
      if (!cur.completed_at) cur.completed_at = message_id;
      if (!cur.explored_at) cur.explored_at = cur.created_at || message_id;
    }

    metaIntel[k] = cur;
  }

  meta.情报碎片 = metaIntel;
  _.set(stat_data, '主线任务.$meta', meta);
}

function cleanupIntelFragments(stat_data: any, message_id: number, debug: boolean) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const intel = _.get(mission, '情报碎片', null);
  if (!intel || typeof intel !== 'object' || Array.isArray(intel)) return;

  ensureMissionMeta(stat_data);
  const meta: MissionMeta = _.get(stat_data, '主线任务.$meta');
  const metaIntel = meta.情报碎片 ?? {};

  const removeAfterDone = 3;
  const removeAfterNotDone = 5;
  const removed: string[] = [];

  for (const [k, frag] of Object.entries(intel as Record<string, unknown>)) {
    if (!isIntelFragment(frag)) continue;
    const m = metaIntel[k];
    if (!m) continue;

    if (frag.状态 === '已完成') {
      const base = m.completed_at || 0;
      if (base > 0 && message_id - base >= removeAfterDone) removed.push(k);
      continue;
    }

    if (frag.状态 === '已探索') {
      const base = m.explored_at || 0;
      if (base > 0 && message_id - base >= removeAfterDone) removed.push(k);
      continue;
    }

    // 未探索：超过 5 楼仍未完成，则清理（避免长期占用 token）
    const base = m.created_at || 0;
    if (base > 0 && message_id - base >= removeAfterNotDone) removed.push(k);
  }

  if (removed.length === 0) return;

  for (const k of removed) {
    delete (intel as any)[k];
    delete metaIntel[k];
  }

  meta.情报碎片 = metaIntel;
  _.set(stat_data, '主线任务.情报碎片', intel);
  _.set(stat_data, '主线任务.$meta', meta);

  if (debug) console.log(`[MissionLogic] cleanup intel fragments: ${removed.join(', ')}`);
}

function syncMissionMetaGoals(stat_data: any, message_id: number) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const stageGoals = normalizeMissionGoals(_.get(mission, '阶段目标', {}));
  ensureMissionMeta(stat_data);
  const meta: MissionMeta = _.get(stat_data, '主线任务.$meta');
  const metaGoals = meta.阶段目标 ?? {};

  const presentKeys = new Set(stageGoals.map(g => g.key));
  for (const k of Object.keys(metaGoals)) {
    if (!presentKeys.has(k)) delete metaGoals[k];
  }

  for (const g of stageGoals) {
    const done = isGoalDone(g.value);
    const cur = metaGoals[g.key] ?? { completed_at: 0 };
    if (!done) cur.completed_at = 0;
    else if (!cur.completed_at) cur.completed_at = message_id;
    metaGoals[g.key] = cur;
  }

  meta.阶段目标 = metaGoals;
  _.set(stat_data, '主线任务.$meta', meta);
}

function cleanupCompletedGoals(stat_data: any, message_id: number, debug: boolean) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const goalsRaw = _.get(mission, '阶段目标', null);
  if (!goalsRaw || typeof goalsRaw !== 'object') return;

  ensureMissionMeta(stat_data);
  const meta: MissionMeta = _.get(stat_data, '主线任务.$meta');
  const metaGoals = meta.阶段目标 ?? {};

  const removeAfter = 3;
  const removedKeys: string[] = [];

  const stageGoals = normalizeMissionGoals(goalsRaw);
  for (const g of stageGoals) {
    const done = isGoalDone(g.value);
    if (!done) continue;
    const base = metaGoals[g.key]?.completed_at ?? 0;
    if (base > 0 && message_id - base >= removeAfter) removedKeys.push(g.key);
  }

  if (removedKeys.length === 0) return;

  if (Array.isArray(goalsRaw)) {
    // 兼容：如果阶段目标为 array，则按索引字符串删除（从后往前）
    const idxs = removedKeys
      .map(k => Number(k))
      .filter(n => Number.isFinite(n))
      .sort((a, b) => b - a);
    for (const idx of idxs) {
      if (idx >= 0 && idx < (goalsRaw as any[]).length) {
        (goalsRaw as any[]).splice(idx, 1);
      }
    }
    // array 模式下索引会整体移动，直接重置 meta，后续由 syncMissionMetaGoals 重新建立
    meta.阶段目标 = {};
  } else {
    for (const k of removedKeys) {
      delete (goalsRaw as any)[k];
      delete metaGoals[k];
    }
  }

  // 目标清单发生变更后，重建完成状态，避免遗留旧 index
  _.set(stat_data, '主线任务.目标完成状态', {});
  applyMissionGoalCompletion(stat_data);

  if (!Array.isArray(goalsRaw)) meta.阶段目标 = metaGoals;
  _.set(stat_data, '主线任务.阶段目标', goalsRaw);
  _.set(stat_data, '主线任务.$meta', meta);

  if (debug) console.log(`[MissionLogic] cleanup completed goals: ${removedKeys.join(', ')}`);
}

const DEFAULT_INTELS: IntelFragment[] = [
  {
    编号: 'LOG-001',
    描述: '旧物业终端的损坏记录中发现一段加密通讯录音，提及15层某房间储备紧急医疗物资（房号破损模糊）。',
    价值: '药品、抗生素、升级【医疗舱】的组件。',
    风险: '信息可能过时；物资被抢先；楼层存在未知危险或被小团体盘踞。',
    状态: '未探索',
  },
  {
    编号: 'LOG-002',
    描述: '地下二层车库深处疑似有大功率柴油发电机（应急照明/消防系统），暴雪前曾进行大型维护。',
    价值: '稳定电力来源（电梯/净水等）、大量柴油储备。',
    风险: '车库环境复杂，可能是幸存者据点或变异生物巢穴。',
    状态: '未探索',
  },
  {
    编号: 'SIGNAL-003',
    描述: '业余无线电截获断续广播：自称“方舟”的组织宣称在瑞峰购物中心建成“乌托邦”，欢迎加入（夹杂诡异赞美诗）。',
    价值: '潜在盟友/交易伙伴，或值得征服的新领地。',
    风险: '可能是骗局/陷阱/邪教诱饵。',
    状态: '未探索',
  },
];

const STAGES: MissionStageDef[] = [
  {
    name: '阶段一：秩序的萌芽',
    goals: [
      { key: '肃清20、19、21层的敌对幸存者', 描述: '肃清20、19、21层的敌对幸存者', 目标值: 3 },
      { key: '庇护至少3个核心女性角色或家庭', 描述: '庇护至少3个核心女性角色或家庭', 目标值: 3 },
      { key: '完成一个公寓内部的情报碎片任务', 描述: '完成一个公寓内部的情报碎片任务', 目标值: 1 },
    ],
    rewards: {
      abilities: {
        基础电力利用优化: '“伊甸”完成基础自检与优化，提高基础电力利用效率。',
        非致命防御制造器: '任务奖励解锁：可制造非致命防御装置（用于庇护区安全）。',
      },
    },
  },
  {
    name: '阶段二：塔内孤王',
    goals: [
      { key: '垂直统一（掌控1-21层）', 描述: '彻底掌控星穹国际公寓所有楼层（1-21层）', 目标值: 1 },
      { key: '激活生命线（修复备用发电机组）', 描述: '完成【备用发电机组】探索与修复', 目标值: 1 },
      { key: '技术垄断（关键区域升至2级）', 描述: '至少一项关键区域升级至2级', 目标值: 1 },
    ],
    rewards: {
      abilities: {
        核心系统自适应升级: '提升庇护所整体运行效率，并可能解锁新的建造/科研选项。',
        全楼广播系统: '可向整栋大楼发布最高指示，强化统治与威慑。',
        轻型军火熔炉: '任务奖励解锁：制造工坊可升级“轻型军火熔炉”。',
      },
    },
  },
  {
    name: '阶段三：社区辐射',
    goals: [
      { key: '冲出牢笼（载具格纳库+雪地车）', 描述: '研发并建立【载具格纳库】，制造第一辆雪地车', 目标值: 1 },
      { key: '建立前哨（探索外部建筑）', 描述: '探索至少一个周边建筑并建立稳定前哨', 目标值: 1 },
      { key: '接触外部势力（交易/击退）', 描述: '与拾荒者联盟建立交易路线，或击退雪狼帮狩猎队', 目标值: 1 },
    ],
    rewards: {
      abilities: {
        外部环境信息整合: '提升侦测与预警能力，优化外部环境信息整合。',
        雪原地图: '获得高价值物资点与“微型堡垒”分布线索的地图。',
        工业原料合成器: '任务奖励解锁：载具格纳库可解锁“工业原料合成器”。',
      },
    },
  },
  {
    name: '最终阶段：新世界的王',
    goals: [
      { key: '区域霸主（击溃大型外部势力）', 描述: '击溃雪狼帮或“方舟”教会至少一个大型外部势力', 目标值: 1 },
      { key: '秩序建立（100名幸存者社区）', 描述: '建立至少100名幸存者、分工明确的末日社区', 目标值: 100 },
      { key: '文明火种（关键区域顶级）', 描述: '至少三个关键区域升级至顶级', 目标值: 3 },
    ],
    rewards: {
      abilities: {
        生态穹顶: '解锁最终庇护所形态“生态穹顶”，达成自给自足的生态循环。',
      },
    },
  },
];

function findStageDef(stageName: string): { current: MissionStageDef; next: MissionStageDef | null } | null {
  const idx = STAGES.findIndex(s => s.name === stageName);
  if (idx < 0) return null;
  return { current: STAGES[idx], next: STAGES[idx + 1] ?? null };
}

function applyMissionGoalCompletion(stat_data: any) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const stageGoals = normalizeMissionGoals(_.get(mission, '阶段目标', {}));
  if (stageGoals.length === 0) return;

  const status = _.get(mission, '目标完成状态', {}) ?? {};
  const nextStatus: Record<string, boolean> = { ...(typeof status === 'object' ? status : {}) };

  let doneCount = 0;
  const changedIndexes: string[] = [];
  for (let i = 0; i < stageGoals.length; i += 1) {
    const goal = stageGoals[i].value;
    const done = isGoalDone(goal);
    if (done) doneCount += 1;
    const idxKey = String(i);
    if (!_.isEqual(nextStatus[idxKey], done)) changedIndexes.push(idxKey);
    nextStatus[idxKey] = done;
  }

  _.set(stat_data, '主线任务.目标完成状态', nextStatus);
  console.log(`[主线任务] 阶段目标完成状态: ${doneCount}/${stageGoals.length}`);
  for (let i = 0; i < stageGoals.length; i += 1) {
    const g = stageGoals[i].value;
    const done = nextStatus[String(i)];
    console.log(`[主线任务]  - 目标${i}: ${done ? '✓' : '○'} ${g.描述} (${g.当前值}/${g.目标值})`);
  }
  const allDone = doneCount === stageGoals.length;
  console.log(`[主线任务] ${allDone ? '✓ 所有目标完成，准备结算阶段' : '○ 等待剩余目标完成'}`);
}

function ensureIntelSeeds(stat_data: any, debug: boolean) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const intel = _.get(mission, '情报碎片', null);
  const record: Record<string, IntelFragment> =
    intel && typeof intel === 'object' && !Array.isArray(intel) ? (intel as any) : {};

  if (Object.keys(record).length > 0) return;

  const seeded: Record<string, IntelFragment> = {};
  for (const frag of DEFAULT_INTELS) {
    seeded[frag.编号] = { ...frag };
  }
  _.set(stat_data, '主线任务.情报碎片', seeded);
  if (debug) console.log(`[MissionLogic] seeded intel fragments: ${DEFAULT_INTELS.length}`);
}

function syncIntelProgressIntoGoals(stat_data: any, debug: boolean) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const intel = _.get(mission, '情报碎片', null);
  if (!intel || typeof intel !== 'object' || Array.isArray(intel)) return;

  const completed = Object.values(intel as Record<string, unknown>)
    .filter(isIntelFragment)
    .filter(v => v.状态 === '已完成').length;
  const goals = _.get(mission, '阶段目标', null);
  if (!goals || typeof goals !== 'object') return;

  // 当前 schema 的默认阶段一目标 key
  const key = '完成一个公寓内部的情报碎片任务';
  const goal = _.get(goals, key, null);
  if (!goal || typeof goal !== 'object') return;

  const target = clampNumber((goal as any).目标值);
  const next = Math.min(clampNumber(completed), target > 0 ? target : 0);
  const cur = clampNumber((goal as any).当前值);
  if (cur !== next) {
    _.set(stat_data, `主线任务.阶段目标.${key}.当前值`, next);
    if (debug) console.log(`[MissionLogic] sync intel progress: ${cur} -> ${next} (completed=${completed})`);
  }
}

function applyMissionStageAdvanceIfCompleted(stat_data: any, old_stat_data: any, debug: boolean) {
  const mission = _.get(stat_data, '主线任务', null);
  if (!mission || typeof mission !== 'object') return;

  const currentStage = String(_.get(mission, '当前阶段', ''));
  const oldStage = String(_.get(old_stat_data, '主线任务.当前阶段', ''));
  if (!currentStage) return;

  // 若 AI 已经切阶段，则脚本不重复推进
  if (oldStage && oldStage !== currentStage) {
    if (debug) console.log(`[MissionLogic] skip stage-advance: already changed by AI (${oldStage} -> ${currentStage})`);
    return;
  }

  const stageGoals = normalizeMissionGoals(_.get(mission, '阶段目标', {}));
  if (stageGoals.length === 0) return;
  const allDone = stageGoals.every(g => isGoalDone(g.value));
  if (!allDone) return;

  const def = findStageDef(currentStage);
  if (!def) {
    console.log(`[MissionLogic] stage completed but unknown stage name: ${currentStage}`);
    return;
  }
  if (!def.next) {
    console.log(`[MissionLogic] final stage completed: ${currentStage}`);
  } else {
    console.log(`[MissionLogic] stage completed: ${currentStage} -> ${def.next.name}`);
    _.set(stat_data, '主线任务.当前阶段', def.next.name);
    _.set(stat_data, '主线任务.阶段目标', buildGoalsRecord(def.next));
    _.set(stat_data, '主线任务.目标完成状态', buildGoalStatusRecord(def.next.goals.length));
  }

  const rewards = def.current.rewards?.abilities ?? {};
  for (const [name, desc] of Object.entries(rewards)) {
    const path = `庇护所.庇护所能力.${name}`;
    if (_.get(stat_data, path) == null) {
      _.set(stat_data, path, { desc });
      console.log(`[MissionLogic] reward: +${name}`);
    }
  }
}

$(async () => {
  await waitGlobalInitialized('Mvu');

  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
    const stat_data = _.get(new_variables, 'stat_data', {});
    const old_stat_data = _.get(old_variables, 'stat_data', {});
    const debug = readMissionDebugFlagFromChat();
    const lastMessageId = getLastMessageIdSafe();

    if (debug) {
      const oldSnap = pickMissionSnapshot(old_stat_data);
      const preSnap = pickMissionSnapshot(stat_data);
      logMissionSnapshotDiff('AI', oldSnap, preSnap);
    }

    const preScriptSnap = debug ? pickMissionSnapshot(stat_data) : null;
    ensureIntelSeeds(stat_data, debug);
    syncIntelProgressIntoGoals(stat_data, debug);
    applyMissionGoalCompletion(stat_data);
    applyMissionStageAdvanceIfCompleted(stat_data, old_stat_data, debug);

    if (lastMessageId != null) {
      ensureMissionMeta(stat_data);
      _.set(stat_data, '主线任务.$meta.楼层.last_seen_message_id', lastMessageId);
      syncMissionMetaIntel(stat_data, lastMessageId);
      syncMissionMetaGoals(stat_data, lastMessageId);
      cleanupIntelFragments(stat_data, lastMessageId, debug);
      cleanupCompletedGoals(stat_data, lastMessageId, debug);
    }

    if (debug && preScriptSnap) {
      const postScriptSnap = pickMissionSnapshot(stat_data);
      logMissionSnapshotDiff('Script', preScriptSnap, postScriptSnap);
    }
  });
});

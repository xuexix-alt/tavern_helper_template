import { diffWorldHours } from '../../util/time';
import { parseRoomTag } from '../../util/room';
import { normalizeScope, ShelterScopeByFloor, isRoomSheltered } from '../../util/shelter_scope';
import { clampHealth, computeOffstageHealthDelta, healthCondition, HealthRules } from '../../util/health';

type RoleLike = {
  姓名?: string;
  健康?: number;
  健康更新原因?: string;
  健康状况?: string;
  内心想法?: string;
  登场状态?: string;
  关系?: string;
  关系倾向?: string;
  秩序刻印?: number;
  秩序刻印更新原因?: string;
};

type RoleTouched = {
  health: boolean;
  healthReason: boolean;
  relation: boolean;
  relationTendency: boolean;
  imprint: boolean;
  imprintReason: boolean;
  thought: boolean;
};

function parseTimeStrToMinutes(timeStr: string): number | null {
  const m = (timeStr ?? '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseDateStr(dateStr: string): { year: number; month: number; day: number } | null {
  const m = (dateStr ?? '').match(/(\d{1,4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function formatDateStr(date: Date): string {
  return `末日纪元，${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function readDebugFlagsFromChat(): { dateLogic: boolean; offstageHealth: boolean } {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const debug = _.get(vars, 'eden.debug', {}) ?? {};
  return {
    dateLogic: _.get(debug, 'date_logic', false) === true,
    offstageHealth: _.get(debug, 'offstage_health', false) === true,
  };
}

function relationStageFromImprint(mark: number): '无' | '拒绝' | '交易' | '顺从' | '忠诚' | '性奴' {
  const v = _.clamp(Number(mark) || 0, 0, 100);
  if (v <= 0) return '无';
  if (v < 20) return '拒绝';
  if (v < 40) return '交易';
  if (v < 60) return '顺从';
  if (v < 90) return '忠诚';
  return '性奴';
}

function readShelterScopeFromChat(): ShelterScopeByFloor {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const raw = _.get(vars, 'eden.shelter_scope', {});
  if (!raw || typeof raw !== 'object') return {};
  return normalizeScope(raw as any);
}

function readHealthRulesFromChat(): HealthRules {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const raw = _.get(vars, 'eden.rules.health', {}) ?? {};
  const r = raw as Partial<HealthRules>;
  return {
    decayPer6h: _.clamp(Number(r.decayPer6h) || 5, 0, 10),
    recoverPer12h: _.clamp(Number(r.recoverPer12h) || 1, 0, 10),
    decayMultiplier: _.clamp(Number(r.decayMultiplier) || 1, 0, 10),
    recoverMultiplier: _.clamp(Number(r.recoverMultiplier) || 1, 0, 10),
  };
}

function isShelteredForRole(stat_data: any, rolePath: string, scope: ShelterScopeByFloor): boolean {
  const tag = _.get(stat_data, `${rolePath}.所在房间`, '');
  const loc = parseRoomTag(tag);
  if (loc.kind === 'core' || loc.kind === 'entrance') return true;
  if (loc.kind === 'floor') {
    if (loc.floor === '20' && loc.roomNumber === '2001') return true;
    // 仅对当前支持的楼层（19/20）做庇护范围判定；其它楼层（如 30/40）暂视为未受庇护
    if (loc.floor === '20' || loc.floor === '19') return isRoomSheltered(scope, loc.floor, loc.roomNumber);
    return false;
  }
  return false;
}

function isRoleLike(val: any): val is RoleLike {
  return val && typeof val === 'object' && '健康' in val && '登场状态' in val;
}

function mergeRoleLike(coreRole: RoleLike, tempRole: RoleLike): RoleLike {
  const next: any = _.cloneDeep(coreRole);
  for (const [key, value] of Object.entries(tempRole ?? {})) {
    const cur = next[key];
    if (cur === undefined || cur === null) {
      next[key] = value;
      continue;
    }
    if (typeof cur === 'string' && cur.trim() === '' && typeof value === 'string' && value.trim() !== '') {
      next[key] = value;
      continue;
    }
    if (Array.isArray(cur) && cur.length === 0 && Array.isArray(value) && value.length > 0) {
      next[key] = value.slice();
      continue;
    }
  }
  return next as RoleLike;
}

function mergeTempNpcIntoCore(stat_data: any) {
  const temp = _.get(stat_data, '临时NPC', {});
  if (!temp || typeof temp !== 'object' || Array.isArray(temp)) return;

  for (const [name, tempRole] of Object.entries(temp)) {
    if (typeof name !== 'string' || !name) continue;
    if (!isRoleLike(tempRole)) continue;
    const coreRole = _.get(stat_data, name, null);
    if (!isRoleLike(coreRole)) continue;

    const next = mergeRoleLike(coreRole, tempRole as RoleLike);
    _.set(stat_data, name, next);
    _.unset(stat_data, ['临时NPC', name]);
  }
}

function diffRoleTouched(oldRole: RoleLike | null, newRole: RoleLike): RoleTouched {
  if (!oldRole) {
    return {
      health: false,
      healthReason: false,
      relation: false,
      relationTendency: false,
      imprint: false,
      imprintReason: false,
      thought: false,
    };
  }
  return {
    health: !_.isEqual(oldRole.健康, newRole.健康),
    healthReason: !_.isEqual(oldRole.健康更新原因, newRole.健康更新原因),
    relation: !_.isEqual(oldRole.关系, newRole.关系),
    relationTendency: !_.isEqual(oldRole.关系倾向, newRole.关系倾向),
    imprint: !_.isEqual(oldRole.秩序刻印, newRole.秩序刻印),
    imprintReason: !_.isEqual(oldRole.秩序刻印更新原因, newRole.秩序刻印更新原因),
    thought: !_.isEqual(oldRole.内心想法, newRole.内心想法),
  };
}

function applyAutoStageFromThoughtUpdateIfNeeded(
  rolePath: string,
  roleName: string,
  oldRole: RoleLike | null,
  newRole: RoleLike,
  debug?: { offstageHealth: boolean },
) {
  if (!oldRole) return;
  if (oldRole.登场状态 !== '离场') return;
  if (newRole.登场状态 !== '离场') return;

  const touched = diffRoleTouched(oldRole, newRole);
  if (!touched.thought) return;

  const nextThought = String(newRole.内心想法 ?? '').trim();
  if (!nextThought) return;

  // AI 本轮更新了内心想法，通常代表“在场/正在互动”，但可能遗漏把登场状态改为登场
  _.set(newRole, '登场状态', '登场');
  if (debug?.offstageHealth) {
    console.log(`[OffstageHealth] auto-stage from thought update: ${rolePath} (${roleName})`);
  }
}

function applyOffstageRoleHealthIfNeeded(
  rolePath: string,
  roleName: string,
  oldRole: RoleLike | null,
  newRole: RoleLike,
  stat_data: any,
  deltaHours: number | null,
  scope: ShelterScopeByFloor,
  rules: HealthRules,
  debug?: { offstageHealth: boolean },
) {
  if (newRole.登场状态 !== '离场') return;
  if (!oldRole) return;
  if (deltaHours === null) return;

  // 规则：只要 AI 本轮对“健康/健康更新原因”有指令，就认为是剧情介入，脚本不做基础结算
  const touched = diffRoleTouched(oldRole, newRole);
  if (touched.health || touched.healthReason) {
    if (debug?.offstageHealth) {
      console.log(
        `[OffstageHealth] skip(${roleName}): touched by AI (health=${touched.health}, reason=${touched.healthReason})`,
      );
    }
    return;
  }

  const currentHealth = clampHealth(Number(newRole.健康) || 0);
  const sheltered = isShelteredForRole(stat_data, rolePath, scope);
  const computed = computeOffstageHealthDelta(deltaHours, sheltered, rules);
  if (!computed.delta) {
    if (debug?.offstageHealth) {
      console.log(`[OffstageHealth] no-op(${roleName}): dh=${deltaHours.toFixed(2)}, sheltered=${sheltered}`);
    }
    return;
  }

  const nextHealth = clampHealth(currentHealth + computed.delta);
  const actualDelta = nextHealth - currentHealth;

  const label =
    computed.reason.split(',').slice(1).join(',').trim() || (sheltered ? '离场受庇护休整' : '离场未受庇护自然衰减');
  const reasonText = actualDelta ? `${actualDelta > 0 ? `+${actualDelta}` : `${actualDelta}`}, ${label}` : '0, 无变化';

  _.set(stat_data, `${rolePath}.健康`, nextHealth);
  _.set(stat_data, `${rolePath}.健康更新原因`, reasonText);
  console.log(`[离场健康结算] ${roleName}: ${currentHealth} → ${nextHealth} (${reasonText})`);
}

function applyDeathFromNegativeImprintIfNeeded(
  rolePath: string,
  roleName: string,
  role: RoleLike,
  stat_data: any,
  debug?: { offstageHealth: boolean },
): boolean {
  const markRaw = role.秩序刻印;
  if (typeof markRaw !== 'number' && typeof markRaw !== 'string') return false;

  const mark = Number(markRaw);
  if (!Number.isFinite(mark) || mark >= 0) return false;

  const currentHealth = clampHealth(Number(role.健康) || 0);
  if (currentHealth <= 0) return false;

  const reasonText = `${-currentHealth}, 羞愧而死`;

  _.set(stat_data, `${rolePath}.健康`, 0);
  _.set(stat_data, `${rolePath}.健康更新原因`, reasonText);
  _.set(stat_data, `${rolePath}.登场状态`, '离场');

  console.log(`[角色死亡] ${roleName}: Imp=${mark} -> 健康 ${currentHealth} → 0 (${reasonText})`);
  if (debug?.offstageHealth) {
    console.log(`[OffstageHealth] applied death rule: ${rolePath} (${roleName})`);
  }
  return true;
}

function applyDerivedHealthStatus(rolePath: string, role: RoleLike, stat_data: any) {
  const health = clampHealth(Number(role.健康) || 0);
  const expected = healthCondition(health);
  if (role.健康状况 !== expected) {
    _.set(stat_data, `${rolePath}.健康状况`, expected);
  }
}

function applyDerivedRelationStage(rolePath: string, oldRole: RoleLike | null, newRole: RoleLike, stat_data: any) {
  const markRaw = newRole.秩序刻印;
  if (typeof markRaw !== 'number' && typeof markRaw !== 'string') return;
  const stage = relationStageFromImprint(Number(markRaw));

  // 规则：脚本只在阈值导致阶段变化时写回关系；若 AI 本轮明确更新了关系，则不覆盖
  const touched = diffRoleTouched(oldRole, newRole);
  if (touched.relation) return;

  if (newRole.关系 !== stage) {
    _.set(stat_data, `${rolePath}.关系`, stage);
  }
}

$(async () => {
  await waitGlobalInitialized('Mvu');

  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
    const debug = readDebugFlagsFromChat();
    const oldWorld = _.get(old_variables, 'stat_data.世界', {});

    // 跨午夜自动补日期：避免 AI 把时间从 23:xx 推进到 01:xx 但忘记 日期/末日天数 +1，导致 diffWorldHours 判定“时间未前进”
    // 注意：若同时部署了 `src/寒冬末日/脚本/日期逻辑/index.ts`，请二选一，避免重复 +1
    {
      const oldTimeStr = _.get(old_variables, 'stat_data.世界.时间', '');
      const newTimeStr = _.get(new_variables, 'stat_data.世界.时间', '');
      if (oldTimeStr !== newTimeStr) {
        const oldMinutes = parseTimeStrToMinutes(oldTimeStr);
        const newMinutes = parseTimeStrToMinutes(newTimeStr);
        if (oldMinutes !== null && newMinutes !== null && oldMinutes > newMinutes) {
          console.log(`[DateLogic] Detected midnight crossing: ${oldTimeStr} -> ${newTimeStr}`);
          const oldDateStr = _.get(old_variables, 'stat_data.世界.日期', '');
          const newDateStr = _.get(new_variables, 'stat_data.世界.日期', '');
          if (oldDateStr === newDateStr) {
            console.log('[DateLogic] AI did not update date, patching date/day...');
            const parsed = parseDateStr(oldDateStr);
            if (parsed) {
              const dateObj = new Date(parsed.year, parsed.month - 1, parsed.day);
              if (!Number.isNaN(dateObj.getTime())) {
                dateObj.setDate(dateObj.getDate() + 1);
                const patched = formatDateStr(dateObj);
                _.set(new_variables, 'stat_data.世界.日期', patched);

                const oldDays = _.get(new_variables, 'stat_data.世界.末日天数');
                if (typeof oldDays === 'number') {
                  _.set(new_variables, 'stat_data.世界.末日天数', oldDays + 1);
                }
                const daysAfter = _.get(new_variables, 'stat_data.世界.末日天数');
                console.log(`[DateLogic] patched date: ${oldDateStr} -> ${patched}; days: ${oldDays} -> ${daysAfter}`);
              } else if (debug.dateLogic) {
                console.log(`[DateLogic] cannot parse date to Date(): ${oldDateStr}`);
              }
            } else if (debug.dateLogic) {
              console.log(`[DateLogic] cannot parse date string: ${oldDateStr}`);
            }
          } else if (debug.dateLogic) {
            console.log(`[DateLogic] date already updated by AI: ${oldDateStr} -> ${newDateStr}`);
          }
        } else if (debug.dateLogic) {
          console.log(
            `[DateLogic] time changed but not crossing: ${oldTimeStr} -> ${newTimeStr} (oldMin=${oldMinutes}, newMin=${newMinutes})`,
          );
        }
      } else if (debug.dateLogic) {
        console.log('[DateLogic] time unchanged; no date check.');
      }
    }

    const newWorld = _.get(new_variables, 'stat_data.世界', {});
    const deltaHours = diffWorldHours(oldWorld, newWorld);
    if (deltaHours === null) {
      const oldTimeStr = _.get(old_variables, 'stat_data.世界.时间', '');
      const newTimeStr = _.get(new_variables, 'stat_data.世界.时间', '');
      if (oldTimeStr !== newTimeStr) {
        console.log('[DateLogic] diffWorldHours=null', { oldWorld, newWorld });
      } else if (debug.dateLogic) {
        console.log('[DateLogic] diffWorldHours=null (time unchanged)', { oldWorld, newWorld });
      }
    } else if (debug.dateLogic) {
      console.log(`[DateLogic] diffWorldHours=${deltaHours.toFixed(2)}`);
    }

    const stat_data = _.get(new_variables, 'stat_data', {});
    const old_stat_data = _.get(old_variables, 'stat_data', {});

    // 若同名角色同时存在于顶层与临时NPC，自动合并并移除临时NPC
    mergeTempNpcIntoCore(stat_data);

    const scope = readShelterScopeFromChat();
    const rules = readHealthRulesFromChat();

    const reserved = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);
    for (const [key, val] of Object.entries(stat_data ?? {})) {
      if (reserved.has(key)) continue;
      if (typeof key !== 'string' || key.startsWith('_')) continue;
      if (!isRoleLike(val)) continue;

      const oldRole = _.get(old_stat_data, key, null) as any as RoleLike | null;
      applyAutoStageFromThoughtUpdateIfNeeded(key, key, oldRole, val as any, debug);
      applyDeathFromNegativeImprintIfNeeded(key, key, val as any, stat_data, debug);
      applyOffstageRoleHealthIfNeeded(key, key, oldRole, val as any, stat_data, deltaHours, scope, rules, debug);
      applyDerivedHealthStatus(key, val as any, stat_data);
      applyDerivedRelationStage(key, oldRole, val as any, stat_data);
    }

    const tempNpc = _.get(stat_data, '临时NPC', {});
    if (tempNpc && typeof tempNpc === 'object') {
      for (const [name, val] of Object.entries(tempNpc)) {
        if (typeof name !== 'string' || !name) continue;
        if (!isRoleLike(val)) continue;

        const oldRole = _.get(old_stat_data, `临时NPC.${name}`, null) as any as RoleLike | null;
        applyAutoStageFromThoughtUpdateIfNeeded(`临时NPC.${name}`, name, oldRole, val as any, debug);
        applyDeathFromNegativeImprintIfNeeded(`临时NPC.${name}`, name, val as any, stat_data, debug);
        applyOffstageRoleHealthIfNeeded(
          `临时NPC.${name}`,
          name,
          oldRole,
          val as any,
          stat_data,
          deltaHours,
          scope,
          rules,
          debug,
        );
        applyDerivedHealthStatus(`临时NPC.${name}`, val as any, stat_data);
        applyDerivedRelationStage(`临时NPC.${name}`, oldRole, val as any, stat_data);
      }
    }
  });
});

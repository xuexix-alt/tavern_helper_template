import { diffWorldHours } from '../../util/time';
import { findRoleLocation, normalizeRoomTag, parseRoomTag, roomTagFromLocation } from '../../util/room';
import { floorRoomCapacity, isRoomSheltered, normalizeScope, ShelterScopeByFloor } from '../../util/shelter_scope';
import { clampHealth, computeOffstageHealthDelta, healthCondition, HealthRules } from '../../util/health';
import { CHAT_VAR_KEYS } from '../../界面/outbound';

type Rooms = any;

function readRoomDebugFlagFromChat(): boolean {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const debug = _.get(vars, 'eden.debug', {}) ?? {};
  return _.get(debug, 'room_logic', false) === true;
}

function listRoomTagsFromRooms(rooms: Rooms): string[] {
  const tags: string[] = [
    '玄关/临时客房A',
    '玄关/临时客房B',
    '核心区/客厅',
    '核心区/餐厅/厨房',
    '核心区/主卧室',
    '核心区/主浴室',
  ];

  const floor20: Record<string, any> = _.get(rooms, '楼层房间.楼层20房间', {});
  if (floor20 && typeof floor20 === 'object') {
    for (const k of Object.keys(floor20)) {
      const roomNumber = String(k ?? '').trim();
      if (roomNumber) tags.push(`楼层20/${roomNumber}`);
    }
  }
  const floor19: Record<string, any> = _.get(rooms, '楼层房间.楼层19房间', {});
  if (floor19 && typeof floor19 === 'object') {
    for (const k of Object.keys(floor19)) {
      const roomNumber = String(k ?? '').trim();
      if (roomNumber) tags.push(`楼层19/${roomNumber}`);
    }
  }

  return _(tags).uniq().value();
}

function readRoomListByTag(rooms: Rooms, tag: string): string[] {
  const t = normalizeRoomTag(tag);
  if (t === '玄关/临时客房A') return _.get(rooms, '玄关.临时客房A入住者', []);
  if (t === '玄关/临时客房B') return _.get(rooms, '玄关.临时客房B入住者', []);
  if (t === '核心区/客厅') return _.get(rooms, '核心区.客厅使用者', []);
  if (t === '核心区/餐厅/厨房') return _.get(rooms, '核心区.餐厅厨房使用者', []);
  if (t === '核心区/主卧室') return _.get(rooms, '核心区.主卧室使用者', []);
  if (t === '核心区/主浴室') return _.get(rooms, '核心区.主浴室使用者', []);

  const m = t.match(/^楼层(20|19)\/(.+)$/);
  if (m) {
    const floor = m[1];
    const roomNumber = String(m[2] ?? '').trim();
    if (!roomNumber) return [];
    return _.get(rooms, `楼层房间.楼层${floor}房间.${roomNumber}.入住者`, []);
  }

  return [];
}

function listRoleNames(stat_data: any): { core: string[]; tempNpc: string[] } {
  const reserved = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);

  const core: string[] = [];
  for (const [k, v] of Object.entries(stat_data ?? {})) {
    if (reserved.has(k)) continue;
    if (typeof k !== 'string' || !k || k.startsWith('_')) continue;
    if (!v || typeof v !== 'object') continue;
    if (!('登场状态' in v) || !('健康' in v)) continue;
    core.push(k);
  }

  const tempNpc: string[] = [];
  const temp = _.get(stat_data, '临时NPC', {});
  if (temp && typeof temp === 'object' && !Array.isArray(temp)) {
    for (const [k, v] of Object.entries(temp)) {
      if (typeof k !== 'string' || !k) continue;
      if (!v || typeof v !== 'object') continue;
      if (!('登场状态' in v) || !('健康' in v)) continue;
      tempNpc.push(k);
    }
  }

  return { core, tempNpc };
}

function readRoleRoomTag(stat_data: any, name: string, isTempNpc: boolean): string {
  const path = isTempNpc ? `临时NPC.${name}.所在房间` : `${name}.所在房间`;
  return normalizeRoomTag(_.get(stat_data, path, ''));
}

function writeRoleRoomTag(stat_data: any, name: string, isTempNpc: boolean, tag: string) {
  const path = isTempNpc ? `临时NPC.${name}.所在房间` : `${name}.所在房间`;
  _.set(stat_data, path, normalizeRoomTag(tag));
}

function isValidExplicitTag(tag: string): boolean {
  if (!tag) return false;
  const loc = parseRoomTag(tag);
  return loc.kind !== 'none';
}

function resolveRoleFinalTagTagOnly(args: { oldTag: string; newTag: string }): { finalTag: string; reason: string } {
  const oldTag = normalizeRoomTag(args.oldTag);
  const newTag = normalizeRoomTag(args.newTag);

  if (isValidExplicitTag(newTag)) return { finalTag: newTag, reason: 'explicit' };
  if (newTag === '') {
    return isValidExplicitTag(oldTag) ? { finalTag: '', reason: 'explicit-none' } : { finalTag: '', reason: 'none' };
  }

  if (isValidExplicitTag(oldTag)) return { finalTag: oldTag, reason: 'invalid-keep-old' };
  return { finalTag: '', reason: 'invalid-to-none' };
}

function bootstrapMissingRoleRoomTagsFromRooms(stat_data: any, debug: boolean) {
  const rooms = _.get(stat_data, '房间', {}) ?? {};
  const { core, tempNpc } = listRoleNames(stat_data);

  const patched: Array<{ name: string; tag: string }> = [];
  for (const name of [...core, ...tempNpc]) {
    const isTemp = tempNpc.includes(name);
    const curTag = readRoleRoomTag(stat_data, name, isTemp);
    if (curTag) continue;

    const loc = findRoleLocation(rooms, name);
    const tag = roomTagFromLocation(loc);
    if (!tag) continue;

    writeRoleRoomTag(stat_data, name, isTemp, tag);
    patched.push({ name, tag });
  }

  if (debug && patched.length > 0) {
    console.log('[RoomLogic] bootstrapped missing role tags from rooms:', patched);
  }
}

function keepUnknownNames(list: any, known: Set<string>): string[] {
  if (!Array.isArray(list)) return [];
  return _(list)
    .filter((x: any) => typeof x === 'string')
    .map((x: string) => x.trim())
    .filter((x: string) => x.length > 0 && !known.has(x))
    .value();
}

function ensureFloorRoomSlot(nextRooms: Rooms, floor: '20' | '19', roomNumber: string) {
  const path = `楼层房间.楼层${floor}房间.${roomNumber}`;
  const cur = _.get(nextRooms, path, null);
  if (!cur || typeof cur !== 'object') _.set(nextRooms, path, { 入住者: [] });
  const residents = _.get(nextRooms, `${path}.入住者`, null);
  if (!Array.isArray(residents)) _.set(nextRooms, `${path}.入住者`, []);
}

function writeRoomListByTag(nextRooms: Rooms, tag: string, list: string[]) {
  const t = normalizeRoomTag(tag);
  if (t === '玄关/临时客房A') return void _.set(nextRooms, '玄关.临时客房A入住者', list);
  if (t === '玄关/临时客房B') return void _.set(nextRooms, '玄关.临时客房B入住者', list);
  if (t === '核心区/客厅') return void _.set(nextRooms, '核心区.客厅使用者', list);
  if (t === '核心区/餐厅/厨房') return void _.set(nextRooms, '核心区.餐厅厨房使用者', list);
  if (t === '核心区/主卧室') return void _.set(nextRooms, '核心区.主卧室使用者', list);
  if (t === '核心区/主浴室') return void _.set(nextRooms, '核心区.主浴室使用者', list);

  const m = t.match(/^楼层(20|19)\/(.+)$/);
  if (!m) return;
  const floor = m[1] as '20' | '19';
  const roomNumber = String(m[2] ?? '').trim();
  if (!roomNumber) return;
  ensureFloorRoomSlot(nextRooms, floor, roomNumber);
  _.set(nextRooms, `楼层房间.楼层${floor}房间.${roomNumber}.入住者`, list);
}

function applyRoomConsistency(stat_data: any, old_stat_data: any, debug: boolean) {
  const rooms = _.get(stat_data, '房间', {}) ?? {};
  const oldRooms = _.get(old_stat_data, '房间', {}) ?? {};

  bootstrapMissingRoleRoomTagsFromRooms(stat_data, debug);

  const { core, tempNpc } = listRoleNames(stat_data);
  const knownNames = new Set<string>([...core, ...tempNpc]);

  const allTags = _([...listRoomTagsFromRooms(oldRooms), ...listRoomTagsFromRooms(rooms)]).uniq().value();

  const finalTagByName = new Map<string, string>();
  const finalReasonByName = new Map<string, string>();
  const oldTagByName = new Map<string, string>();
  const newTagByName = new Map<string, string>();

  for (const name of [...core, ...tempNpc]) {
    const isTemp = tempNpc.includes(name);
    const oldTag = readRoleRoomTag(old_stat_data, name, isTemp);
    const newTag = readRoleRoomTag(stat_data, name, isTemp);
    oldTagByName.set(name, oldTag);
    newTagByName.set(name, newTag);

    const { finalTag, reason } = resolveRoleFinalTagTagOnly({ oldTag, newTag });
    finalTagByName.set(name, finalTag);
    finalReasonByName.set(name, reason);

    if (finalTag !== newTag) {
      writeRoleRoomTag(stat_data, name, isTemp, finalTag);
    }
  }

  const nextRooms: Rooms = _.cloneDeep(rooms ?? {});

  for (const tag of allTags) {
    const base = keepUnknownNames(readRoomListByTag(oldRooms, tag), knownNames);
    writeRoomListByTag(nextRooms, tag, base);
  }

  for (const name of [...core, ...tempNpc]) {
    const tag = finalTagByName.get(name) ?? '';
    if (!tag) continue;
    const list = readRoomListByTag(nextRooms, tag);
    const next = Array.isArray(list) ? list.slice() : [];
    if (!next.includes(name)) next.push(name);
    writeRoomListByTag(nextRooms, tag, next);
  }

  const allKnown = [...core, ...tempNpc];
  for (const tag of allTags) {
    const list = readRoomListByTag(nextRooms, tag);
    const normalized = _(list)
      .filter((x: any) => typeof x === 'string')
      .map((x: string) => x.trim())
      .filter((x: string) => x.length > 0)
      .uniq()
      .value();

    const kept = normalized.filter(x => !allKnown.includes(x));
    const known = normalized.filter(x => allKnown.includes(x));
    writeRoomListByTag(nextRooms, tag, [...kept, ...known]);
  }

  _.set(stat_data, '房间', nextRooms);

  if (debug) {
    const mismatch: Array<{ name: string; old: string; next: string; final: string; reason: string }> = [];
    for (const name of [...core, ...tempNpc]) {
      const oldTag = oldTagByName.get(name) ?? '';
      const newTag = newTagByName.get(name) ?? '';
      const finalTag = finalTagByName.get(name) ?? '';
      const reason = finalReasonByName.get(name) ?? '';
      if (oldTag !== newTag || newTag !== finalTag) mismatch.push({ name, old: oldTag, next: newTag, final: finalTag, reason });
    }
    if (mismatch.length > 0) console.log('[RoomLogic] tag reconcile:', mismatch);

    const dup: Array<{ name: string; tags: string[] }> = [];
    const writeTags = allTags;
    for (const name of [...core, ...tempNpc]) {
      const tags = writeTags.filter(t => (readRoomListByTag(nextRooms, t) ?? []).includes(name));
      if (tags.length > 1) dup.push({ name, tags });
    }
    if (dup.length > 0) console.log('[RoomLogic] still duplicated after reconcile:', dup);

    const reasons = [...finalReasonByName.entries()].reduce<Record<string, number>>((acc, [, r]) => {
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {});
    console.log('[RoomLogic] reconcile summary:', reasons);
  }
}

type ScopeDelta = {
  add?: ShelterScopeByFloor;
  remove?: ShelterScopeByFloor;
  note?: string;
};

function readShelterScopeFromChat(): ShelterScopeByFloor {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_SHELTER_SCOPE, {});
  if (!raw || typeof raw !== 'object') return {};
  return normalizeScope(raw as any);
}

function writeShelterScopeToChat(scope: ShelterScopeByFloor) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    vars => {
      _.set(vars, CHAT_VAR_KEYS.EDEN_SHELTER_SCOPE, normalizeScope(scope));
      return vars;
    },
    { type: 'chat' },
  );
}

function clampLevel(level: any): number {
  const lv = Number(level);
  return _.clamp(Number.isFinite(lv) ? lv : 1, 1, 10);
}

function toRoomList(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return _(input)
    .filter((x: any) => typeof x === 'string')
    .map((x: string) => x.trim())
    .filter(Boolean)
    .value();
}

function normalizeScopeDelta(raw: any): ScopeDelta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const addRaw = (raw as any).add ?? null;
  const removeRaw = (raw as any).remove ?? null;

  const add: ShelterScopeByFloor = {};
  const remove: ShelterScopeByFloor = {};

  const looksLikeScope =
    addRaw == null &&
    removeRaw == null &&
    (Object.prototype.hasOwnProperty.call(raw, '20') || Object.prototype.hasOwnProperty.call(raw, '19'));

  const srcAdd = looksLikeScope ? raw : addRaw;
  const srcRemove = looksLikeScope ? null : removeRaw;

  if (srcAdd && typeof srcAdd === 'object' && !Array.isArray(srcAdd)) {
    for (const floor of ['20', '19']) {
      const list = toRoomList((srcAdd as any)[floor]);
      if (list.length) add[floor] = list;
    }
  }

  if (srcRemove && typeof srcRemove === 'object' && !Array.isArray(srcRemove)) {
    for (const floor of ['20', '19']) {
      const list = toRoomList((srcRemove as any)[floor]);
      if (list.length) remove[floor] = list;
    }
  }

  const note = typeof (raw as any).note === 'string' ? String((raw as any).note) : undefined;

  if (Object.keys(add).length === 0 && Object.keys(remove).length === 0) return null;
  return { add: Object.keys(add).length ? add : undefined, remove: Object.keys(remove).length ? remove : undefined, note };
}

function enforceCapacity(list: string[], capacity: number): string[] {
  if (capacity <= 0) return [];
  const uniqSorted = _(list)
    .filter((x: any) => typeof x === 'string' && x.trim().length > 0)
    .map((x: string) => x.trim())
    .filter((room: string) => room !== '2001')
    .uniq()
    .sortBy()
    .value();
  if (uniqSorted.length <= capacity) return uniqSorted;
  return uniqSorted.slice(0, capacity);
}

function applyScopeDelta(current: ShelterScopeByFloor, delta: ScopeDelta, level: number): ShelterScopeByFloor {
  const base = normalizeScope(current);
  const next: ShelterScopeByFloor = { ...base };

  for (const floor of ['20', '19'] as const) {
    const cap = floorRoomCapacity(level, floor);
    const cur = Array.isArray(next[floor]) ? next[floor].slice() : [];
    const set = new Set<string>(cur);

    for (const room of toRoomList(delta.remove?.[floor])) set.delete(room);

    if (cap > 0) {
      for (const room of toRoomList(delta.add?.[floor])) {
        if (room === '2001') continue;
        if (set.has(room)) continue;
        if (set.size >= cap) break;
        set.add(room);
      }
    }

    const merged = Array.from(set);
    const capped = enforceCapacity(merged, cap);
    if (capped.length > 0) next[floor] = capped;
    else delete next[floor];
  }

  return normalizeScope(next);
}

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
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
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

function readHealthRulesFromChat(): HealthRules {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_RULES_HEALTH, {}) ?? {};
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
    if (loc.floor === '20' || loc.floor === '19') return isRoomSheltered(scope, loc.floor, loc.roomNumber);
    return false;
  }
  return false;
}

function isRoleLike(val: any): val is RoleLike {
  return val && typeof val === 'object' && '健康' in val && '登场状态' in val;
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

function applyDerivedHealthStatus(rolePath: string, role: RoleLike, stat_data: any) {
  const healthRaw = role.健康;
  const health = typeof healthRaw === 'number' || typeof healthRaw === 'string' ? Number(healthRaw) : NaN;
  if (!Number.isFinite(health)) return;
  const status = healthCondition(clampHealth(health));
  _.set(stat_data, `${rolePath}.健康状况`, status);
}

function applyAutoStageFromThoughtUpdateIfNeeded(
  rolePath: string,
  roleName: string,
  oldRole: RoleLike | null,
  newRole: RoleLike,
  debug: { offstageHealth: boolean },
) {
  const touched = diffRoleTouched(oldRole, newRole);
  if (!touched.thought) return;

  const tag = _.get(newRole, '登场状态', '');
  if (tag !== '离场') return;

  if (debug.offstageHealth) {
    console.log(`[Offstage] auto stage: ${roleName} is 离场 because thought updated.`);
  }

  _.set(newRole, '登场状态', '离场');
}

function applyDeathFromNegativeImprintIfNeeded(
  rolePath: string,
  roleName: string,
  newRole: RoleLike,
  stat_data: any,
  debug: { offstageHealth: boolean },
) {
  const markRaw = newRole.秩序刻印;
  if (typeof markRaw !== 'number' && typeof markRaw !== 'string') return;
  const mark = Number(markRaw);
  if (!Number.isFinite(mark)) return;
  if (mark >= 0) return;

  if (debug.offstageHealth) {
    console.log(`[Death] ${roleName} died from negative imprint: ${mark}`);
  }

  _.set(stat_data, `${rolePath}.健康`, 0);
  _.set(stat_data, `${rolePath}.健康更新原因`, '死亡（Imp<0 触发精神崩溃自杀）');
  _.set(stat_data, `${rolePath}.健康状况`, '死亡');
  _.set(stat_data, `${rolePath}.登场状态`, '离场');
  _.set(stat_data, `${rolePath}.衣着`, '');
  _.set(stat_data, `${rolePath}.舌唇`, '');
  _.set(stat_data, `${rolePath}.胸乳`, '');
  _.set(stat_data, `${rolePath}.私穴`, '');
  _.set(stat_data, `${rolePath}.神态样貌`, '');
  _.set(stat_data, `${rolePath}.动作姿势`, '');
  _.set(stat_data, `${rolePath}.内心想法`, '');
  _.set(stat_data, `${rolePath}.所在房间`, '');
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
  debug: { offstageHealth: boolean },
) {
  if (deltaHours === null) return;

  const touched = diffRoleTouched(oldRole, newRole);
  if (touched.health || touched.healthReason) return;

  const stage = _.get(newRole, '登场状态', '');
  const isOffstage = stage === '离场';
  if (!isOffstage) return;

  const healthRaw = newRole.健康;
  if (typeof healthRaw !== 'number' && typeof healthRaw !== 'string') return;
  const currentHealth = clampHealth(Number(healthRaw) || 0);

  const sheltered = isShelteredForRole(stat_data, rolePath, scope);
  const computed = computeOffstageHealthDelta(deltaHours, sheltered, rules);
  if (!computed.delta) return;

  const nextHealth = clampHealth(currentHealth + computed.delta);
  const actualDelta = nextHealth - currentHealth;
  _.set(stat_data, `${rolePath}.健康`, nextHealth);

  const label =
    computed.reason.split(',').slice(1).join(',').trim() || (sheltered ? '离场受庇护休整' : '离场未受庇护自然衰减');
  const reasonText = actualDelta ? `${actualDelta > 0 ? `+${actualDelta}` : `${actualDelta}`}, ${label}` : '0, 无变化';
  _.set(stat_data, `${rolePath}.健康更新原因`, reasonText);

  if (debug.offstageHealth) {
    console.log(`[Offstage] ${roleName} health ${currentHealth} -> ${nextHealth} (${reasonText})`, {
      deltaHours,
      sheltered,
      rules,
    });
  }
}

function applyDerivedRelationStage(rolePath: string, oldRole: RoleLike | null, newRole: RoleLike, stat_data: any) {
  const markRaw = newRole.秩序刻印;
  if (typeof markRaw !== 'number' && typeof markRaw !== 'string') return;
  const stage = relationStageFromImprint(Number(markRaw));

  const touched = diffRoleTouched(oldRole, newRole);
  if (touched.relation) return;

  if (newRole.关系 !== stage) {
    _.set(stat_data, `${rolePath}.关系`, stage);
  }
}

function patchDateOnMidnightCrossIfNeeded(new_variables: any, old_variables: any, debug: { dateLogic: boolean }) {
  const oldTimeStr = _.get(old_variables, 'stat_data.世界.时间', '');
  const newTimeStr = _.get(new_variables, 'stat_data.世界.时间', '');

  if (oldTimeStr === newTimeStr) {
    if (debug.dateLogic) console.log('[DateLogic] time unchanged; no date check.');
    return;
  }

  const oldMinutes = parseTimeStrToMinutes(oldTimeStr);
  const newMinutes = parseTimeStrToMinutes(newTimeStr);
  if (oldMinutes === null || newMinutes === null) return;

  if (oldMinutes <= newMinutes) {
    if (debug.dateLogic) {
      console.log(
        `[DateLogic] time changed but not crossing: ${oldTimeStr} -> ${newTimeStr} (oldMin=${oldMinutes}, newMin=${newMinutes})`,
      );
    }
    return;
  }

  console.log(`[DateLogic] Detected midnight crossing: ${oldTimeStr} -> ${newTimeStr}`);

  const oldDateStr = _.get(old_variables, 'stat_data.世界.日期', '');
  const newDateStr = _.get(new_variables, 'stat_data.世界.日期', '');
  if (oldDateStr !== newDateStr) {
    if (debug.dateLogic) console.log(`[DateLogic] date already updated by AI: ${oldDateStr} -> ${newDateStr}`);
    return;
  }

  const parsed = parseDateStr(oldDateStr);
  if (!parsed) {
    if (debug.dateLogic) console.log(`[DateLogic] cannot parse date string: ${oldDateStr}`);
    return;
  }

  const dateObj = new Date(parsed.year, parsed.month - 1, parsed.day);
  if (Number.isNaN(dateObj.getTime())) {
    if (debug.dateLogic) console.log(`[DateLogic] cannot parse date to Date(): ${oldDateStr}`);
    return;
  }

  console.log('[DateLogic] AI did not update date, patching date/day...');
  dateObj.setDate(dateObj.getDate() + 1);
  const patched = formatDateStr(dateObj);
  _.set(new_variables, 'stat_data.世界.日期', patched);

  const oldDays = _.get(new_variables, 'stat_data.世界.末日天数');
  if (typeof oldDays === 'number') _.set(new_variables, 'stat_data.世界.末日天数', oldDays + 1);
  const daysAfter = _.get(new_variables, 'stat_data.世界.末日天数');
  console.log(`[DateLogic] patched date: ${oldDateStr} -> ${patched}; days: ${oldDays} -> ${daysAfter}`);
}

function applyOffstageBundle(new_variables: any, old_variables: any, scope: ShelterScopeByFloor) {
  const debug = readDebugFlagsFromChat();
  const oldWorld = _.get(old_variables, 'stat_data.世界', {});
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
      applyOffstageRoleHealthIfNeeded(`临时NPC.${name}`, name, oldRole, val as any, stat_data, deltaHours, scope, rules, debug);
      applyDerivedHealthStatus(`临时NPC.${name}`, val as any, stat_data);
      applyDerivedRelationStage(`临时NPC.${name}`, oldRole, val as any, stat_data);
    }
  }
}

$(async () => {
  await waitGlobalInitialized('Mvu');

  const first = (new_variables: any, old_variables: any) => {
    const stat_data = _.get(new_variables, 'stat_data', {}) ?? {};
    const old_stat_data = _.get(old_variables, 'stat_data', {}) ?? {};

    const roomDebug = readRoomDebugFlagFromChat();
    applyRoomConsistency(stat_data, old_stat_data, roomDebug);

    const debug = readDebugFlagsFromChat();
    patchDateOnMidnightCrossIfNeeded(new_variables, old_variables, debug);
  };

  const last = (new_variables: any, old_variables: any) => {
    const stat_data = _.get(new_variables, 'stat_data', {}) ?? {};
    const shelterLevel = clampLevel(_.get(stat_data, ['庇护所', '庇护所等级'], 1));

    const currentScope = readShelterScopeFromChat();
    const rawDelta = _.get(stat_data, ['庇护所', '庇护范围变更'], null);
    const delta = normalizeScopeDelta(rawDelta);

    const nextScope = delta ? applyScopeDelta(currentScope, delta, shelterLevel) : currentScope;
    if (delta) writeShelterScopeToChat(nextScope);

    _.set(stat_data, ['庇护所', '当前生存庇护范围'], nextScope);

    // 清空触发器（保留字段本身），避免重复执行；并保证 AI 后续可继续 replace 该路径。
    if (delta) _.set(stat_data, ['庇护所', '庇护范围变更'], {});

    applyOffstageBundle(new_variables, old_variables, nextScope);
  };

  eventMakeFirst(Mvu.events.VARIABLE_UPDATE_ENDED, first);
  eventMakeLast(Mvu.events.VARIABLE_UPDATE_ENDED, last);
});

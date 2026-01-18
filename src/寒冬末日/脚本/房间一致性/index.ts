import { findRoleLocation, parseRoomTag, normalizeRoomTag, roomTagFromLocation } from '../../util/room';

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

function isRoleLike(val: any): boolean {
  return val && typeof val === 'object' && '健康' in val && '登场状态' in val;
}

function mergeRoleLike(coreRole: any, tempRole: any): any {
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
  return next;
}

function mergeTempNpcIntoCore(stat_data: any) {
  const temp = _.get(stat_data, '临时NPC', {});
  if (!temp || typeof temp !== 'object' || Array.isArray(temp)) return;

  for (const [name, tempRole] of Object.entries(temp)) {
    if (typeof name !== 'string' || !name) continue;
    if (!isRoleLike(tempRole)) continue;
    const coreRole = _.get(stat_data, name, null);
    if (!isRoleLike(coreRole)) continue;

    const next = mergeRoleLike(coreRole, tempRole);
    _.set(stat_data, name, next);
    _.unset(stat_data, ['临时NPC', name]);
  }
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

  // 1) 单一真源：本轮显式写入且合法 → 直接采用
  if (isValidExplicitTag(newTag)) return { finalTag: newTag, reason: 'explicit' };

  // 2) 显式置空：离开/未知/外出 → 直接清空（不再依赖房间数组推断）
  if (newTag === '') {
    return isValidExplicitTag(oldTag) ? { finalTag: '', reason: 'explicit-none' } : { finalTag: '', reason: 'none' };
  }

  // 3) 非空但非法：视为本轮写错（例如“楼层30/3001”），保持上轮合法值以免跳房；否则清空
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
  // 若同名角色同时存在于顶层与临时NPC，自动合并并移除临时NPC
  mergeTempNpcIntoCore(stat_data);

  const rooms = _.get(stat_data, '房间', {}) ?? {};
  const oldRooms = _.get(old_stat_data, '房间', {}) ?? {};

  // 兼容旧存档：若 initvar/旧聊天只维护了房间数组但没写“所在房间”，先把缺失标签补齐。
  // 补齐后，后续逻辑以“所在房间”为单一真源，`房间/**` 只作为派生输出。
  bootstrapMissingRoleRoomTagsFromRooms(stat_data, debug);

  const { core, tempNpc } = listRoleNames(stat_data);
  const knownNames = new Set<string>([...core, ...tempNpc]);

  const allTags = _([...listRoomTagsFromRooms(oldRooms), ...listRoomTagsFromRooms(rooms)])
    .uniq()
    .value();

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

    const resolved = resolveRoleFinalTagTagOnly({ oldTag, newTag });
    finalTagByName.set(name, resolved.finalTag);
    finalReasonByName.set(name, resolved.reason);
  }

  // 1) 写回角色“所在房间”，作为之后轮次的真源
  for (const name of [...core, ...tempNpc]) {
    const isTemp = tempNpc.includes(name);
    const tag = finalTagByName.get(name) ?? '';
    writeRoleRoomTag(stat_data, name, isTemp, tag);
  }

  // 2) 重建房间数组：先保留 unknown（如 {{user}}），再按所在房间分配 known
  const nextRooms = _.cloneDeep(rooms ?? {});

  const unknownByTag: Record<string, string[]> = {};
  const priorKnownOrderByTag: Record<string, string[]> = {};
  for (const tag of allTags) {
    // 房间数组属于派生数据：unknown（如 {{user}}）以“本轮现值”为准，避免删除/迁移时被旧值反向复活。
    const raw = readRoomListByTag(rooms, tag);
    unknownByTag[tag] = keepUnknownNames(raw, knownNames);
    priorKnownOrderByTag[tag] = Array.isArray(raw) ? raw.filter(x => typeof x === 'string' && knownNames.has(x)) : [];

    // 但对宏占位符做“温和兜底”：如果上一轮存在宏（如 {{user}}）而本轮被误删，则保留它。
    const oldRaw = readRoomListByTag(oldRooms, tag);
    const stickyMacros = keepUnknownNames(oldRaw, knownNames).filter(x => x === '{{user}}' || /^\{\{.+\}\}$/.test(x));
    if (stickyMacros.length > 0) {
      const merged = _(unknownByTag[tag]).concat(stickyMacros).uniq().value();
      unknownByTag[tag] = merged;
    }
  }

  const assignedByTag: Record<string, string[]> = {};
  for (const [name, tag] of finalTagByName.entries()) {
    if (!tag) continue;
    // UI 的房间数组没有“玄关”这个列表，所以“玄关”作为逻辑位置时，默认派生到临时客房A用于显示。
    const physicalTag = tag === '玄关' ? '玄关/临时客房A' : tag;
    if (!assignedByTag[physicalTag]) assignedByTag[physicalTag] = [];
    assignedByTag[physicalTag].push(name);
  }

  const writeTags = _([...allTags, ...Object.keys(assignedByTag)])
    .uniq()
    .value();
  for (const tag of writeTags) {
    const assigned = assignedByTag[tag] ?? [];
    const prior = priorKnownOrderByTag[tag] ?? [];
    const orderedInPrior = prior.filter(n => assigned.includes(n));
    const rest = assigned.filter(n => !orderedInPrior.includes(n)).sort();
    const list = [...(unknownByTag[tag] ?? []), ...orderedInPrior, ...rest];
    writeRoomListByTag(nextRooms, tag, _(list).uniq().value());
  }

  _.set(stat_data, '房间', nextRooms);

  if (debug) {
    const explicitNone = [...finalReasonByName.entries()]
      .filter(([, reason]) => reason === 'explicit-none')
      .map(([name]) => ({
        name,
        oldTag: oldTagByName.get(name) ?? '',
        newTag: newTagByName.get(name) ?? '',
        finalTag: finalTagByName.get(name) ?? '',
      }));
    if (explicitNone.length > 0) {
      console.log('[RoomLogic] explicit-none applied (role left to unknown):', explicitNone);
    }

    const dup: Array<{ name: string; tags: string[] }> = [];
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

$(async () => {
  await waitGlobalInitialized('Mvu');

  const listener = (new_variables: any, old_variables: any) => {
    const stat_data = _.get(new_variables, 'stat_data', {}) ?? {};
    const old_stat_data = _.get(old_variables, 'stat_data', {}) ?? {};
    const debug = readRoomDebugFlagFromChat();
    applyRoomConsistency(stat_data, old_stat_data, debug);
  };

  // 让房间一致性优先执行：保证其他脚本读取到的是已纠偏后的房间结构
  eventMakeFirst(Mvu.events.VARIABLE_UPDATE_ENDED, listener);
});

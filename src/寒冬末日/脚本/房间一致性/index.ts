import { parseRoomTag, normalizeRoomTag } from '../../util/room';

type Rooms = any;

function readRoomDebugFlagFromChat(): boolean {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const debug = _.get(vars, 'eden.debug', {}) ?? {};
  return _.get(debug, 'room_logic', false) === true;
}

function listRoomTagsFromRooms(rooms: Rooms): string[] {
  const tags: string[] = ['玄关/临时客房A', '玄关/临时客房B', '核心区/主卧室', '核心区/主浴室'];

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

function tagPriority(tag: string): number {
  const t = normalizeRoomTag(tag);
  if (t.startsWith('核心区/')) return 3;
  if (t.startsWith('玄关/')) return 2;
  if (t.startsWith('楼层')) return 1;
  return 0;
}

function resolveRoleFinalTag(args: {
  name: string;
  oldRooms: Rooms;
  newRooms: Rooms;
  oldTag: string;
  newTag: string;
  allTags: string[];
}): { finalTag: string; reason: string } {
  const { name, oldRooms, newRooms, oldTag, newTag, allTags } = args;

  // 1) 显式真源：只要本轮变量中存在合法的“所在房间”，就以它为准
  if (isValidExplicitTag(newTag)) return { finalTag: newTag, reason: 'explicit' };

  const present: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const tag of allTags) {
    const oldList = readRoomListByTag(oldRooms, tag);
    const newList = readRoomListByTag(newRooms, tag);
    const oldIn = Array.isArray(oldList) && oldList.includes(name);
    const newIn = Array.isArray(newList) && newList.includes(name);
    if (newIn) present.push(tag);
    if (!oldIn && newIn) added.push(tag);
    if (oldIn && !newIn) removed.push(tag);
  }

  // 2) 正常：只出现在一个房间
  if (present.length === 1) return { finalTag: present[0], reason: 'single' };

  // 3) 冲突：同名出现在多个房间
  if (present.length > 1) {
    // 若本轮恰好“新增进”一个房间，通常代表移动目标；优先以此为准
    if (added.length === 1) return { finalTag: added[0], reason: 'added' };

    // 其次：若旧Tag仍有效且在 present 中，保持旧Tag（避免乱跳）
    if (isValidExplicitTag(oldTag) && present.includes(oldTag)) return { finalTag: oldTag, reason: 'keep-old-tag' };

    // 最后：按优先级选择（核心区 > 玄关 > 楼层），稳定输出
    const picked = _(present)
      .sortBy(t => -tagPriority(t))
      .sortBy()
      .head();
    return { finalTag: picked ?? present[0], reason: 'priority' };
  }

  // 4) 缺失：角色不在任何房间
  // 若旧Tag存在且仍合法，则沿用旧Tag（防止“移除但忘记添加”的不健壮）
  if (isValidExplicitTag(oldTag)) return { finalTag: oldTag, reason: 'sticky-old-tag' };

  // 否则维持为空（未知/外出）
  if (removed.length > 0) return { finalTag: '', reason: 'removed-to-none' };
  return { finalTag: '', reason: 'none' };
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

  const { core, tempNpc } = listRoleNames(stat_data);
  const knownNames = new Set<string>([...core, ...tempNpc]);

  const allTags = _([...listRoomTagsFromRooms(oldRooms), ...listRoomTagsFromRooms(rooms)]).uniq().value();

  const finalTagByName = new Map<string, string>();
  const finalReasonByName = new Map<string, string>();

  for (const name of [...core, ...tempNpc]) {
    const isTemp = tempNpc.includes(name);
    const oldTag = readRoleRoomTag(old_stat_data, name, isTemp);
    const newTag = readRoleRoomTag(stat_data, name, isTemp);

    const resolved = resolveRoleFinalTag({ name, oldRooms, newRooms: rooms, oldTag, newTag, allTags });
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
    const raw = readRoomListByTag(rooms, tag);
    unknownByTag[tag] = keepUnknownNames(raw, knownNames);
    priorKnownOrderByTag[tag] = Array.isArray(raw) ? raw.filter(x => typeof x === 'string' && knownNames.has(x)) : [];
  }

  const assignedByTag: Record<string, string[]> = {};
  for (const [name, tag] of finalTagByName.entries()) {
    if (!tag) continue;
    if (!assignedByTag[tag]) assignedByTag[tag] = [];
    assignedByTag[tag].push(name);
  }

  const writeTags = _([...allTags, ...Object.keys(assignedByTag)]).uniq().value();
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

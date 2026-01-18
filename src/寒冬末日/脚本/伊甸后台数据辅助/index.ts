import { z } from 'zod';
import { clampHealth, computeOffstageHealthDelta, healthCondition, HealthRules } from '../../util/health';
import { findRoleLocation, normalizeRoomTag, parseRoomTag, roomTagFromLocation } from '../../util/room';
import { floorRoomCapacity, isRoomSheltered, normalizeScope, ShelterScopeByFloor } from '../../util/shelter_scope';
import { diffWorldHours } from '../../util/time';
import { CHAT_VAR_KEYS } from '../../界面/outbound';

import shelterBlueprintRaw from '../../世界书/寒冬末日/庇护所升级能力.txt?raw';

type Rooms = any;

type EdenDebugSetting = {
  enabled: boolean;
  toConsole: boolean;
  toChat: boolean;
};

const EDEN_HELPER_VERSION = '1.2';
const EDEN_HELPER_ACTIVE_INSTANCE_KEY = '__eden_helper_active_instance__';
const EDEN_HELPER_INSTANCE_ID = (() => {
  try {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    return String(Date.now());
  }
})();

const EDEN_HELPER_DEBUG_FLAG_PATH = 'eden.debug.eden_helper';
const EDEN_HELPER_DEBUG_TO_CHAT_FLAG_PATH = 'eden.debug.to_chat';
const EDEN_HELPER_DEBUG_LOG_PATH = 'eden.debug.eden_helper_log';
const EDEN_HELPER_DEBUG_LOG_MAX = 80;

const DEBUG_BUTTON_TOGGLE = '伊甸调试开关';
const DEBUG_BUTTON_TOGGLE_CHATLOG = '伊甸调试写入日志';

function getDeep(obj: any, path: string): any {
  const keys = String(path ?? '')
    .split('.')
    .filter(Boolean);
  let cur = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function setDeep(obj: any, path: string, value: any) {
  const keys = String(path ?? '')
    .split('.')
    .filter(Boolean);
  if (keys.length === 0) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function safeStringify(value: any, maxLen = 1200): string {
  try {
    const json = JSON.stringify(value, (_k, v) => {
      if (typeof v === 'string' && v.length > 400) return `${v.slice(0, 400)}…`;
      return v;
    });
    if (typeof json !== 'string') return String(value ?? '');
    if (json.length <= maxLen) return json;
    return `${json.slice(0, maxLen)}…`;
  } catch {
    return String(value ?? '');
  }
}

function resolveEdenDebugSetting(): EdenDebugSetting {
  try {
    // 支持 ?debug：方便在不便写入变量时快速开启控制台日志（不写入 chat）
    try {
      const search = new URLSearchParams(window.location.search);
      if (search.has('debug') || search.has('dev')) {
        return { enabled: true, toConsole: true, toChat: search.has('to_chat') };
      }
    } catch {
      // ignore
    }

    const vars = typeof getVariables === 'function' ? (getVariables({ type: 'chat' }) ?? {}) : {};
    const enabled = getDeep(vars, EDEN_HELPER_DEBUG_FLAG_PATH) === true;
    const toChat = getDeep(vars, EDEN_HELPER_DEBUG_TO_CHAT_FLAG_PATH) === true;
    return { enabled, toConsole: enabled, toChat };
  } catch {
    return { enabled: false, toConsole: false, toChat: false };
  }
}

function getHostGlobal(): any {
  // 在 SillyTavern 中脚本运行于 iframe，顶层 window 可作为“跨重载”的共享存储。
  try {
    return (window.top ?? window) as any;
  } catch {
    return window as any;
  }
}

function markThisInstanceActive() {
  try {
    const host = getHostGlobal();
    host[EDEN_HELPER_ACTIVE_INSTANCE_KEY] = {
      id: EDEN_HELPER_INSTANCE_ID,
      version: EDEN_HELPER_VERSION,
      scriptId: typeof getScriptId === 'function' ? (getScriptId() as any) : null,
      ts: new Date().toISOString(),
    };
  } catch {
    // ignore
  }
}

function isActiveInstance(): boolean {
  try {
    const host = getHostGlobal();
    const cur = host?.[EDEN_HELPER_ACTIVE_INSTANCE_KEY];
    // 若宿主没写入 active key（极端环境），默认放行，避免脚本“完全失效”。
    if (!cur || typeof cur !== 'object') return true;
    return cur.id === EDEN_HELPER_INSTANCE_ID;
  } catch {
    return true;
  }
}

function edenLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  payload?: Record<string, any>,
  debugSetting?: EdenDebugSetting,
) {
  if (!isActiveInstance()) return;
  const debug = debugSetting ?? resolveEdenDebugSetting();
  if (!debug.enabled) return;

  const zh = typeof payload?.zh === 'string' ? (payload.zh as string) : '';
  const payloadForPrint = payload ? { ...payload } : undefined;
  if (payloadForPrint && 'zh' in payloadForPrint) delete (payloadForPrint as any).zh;

  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(zh ? { zh } : {}),
    ...(payload ? payload : {}),
  };

  if (debug.toConsole) {
    const head = zh ? `${zh} (${event})` : event;
    const tail = payloadForPrint ? ` ${safeStringify(payloadForPrint)}` : '';
    (console as any)?.[level]?.(`[eden/helper] ${head}${tail}`);
  }

  if (debug.toChat && typeof updateVariablesWith === 'function') {
    try {
      updateVariablesWith(
        (vars: any) => {
          const current = getDeep(vars, EDEN_HELPER_DEBUG_LOG_PATH);
          const list = Array.isArray(current) ? current.slice() : [];
          list.push({
            ts: record.ts,
            level: record.level,
            event: record.event,
            zh: record.zh ?? '',
            data: payload ? safeStringify(payload) : '',
          });
          if (list.length > EDEN_HELPER_DEBUG_LOG_MAX) list.splice(0, list.length - EDEN_HELPER_DEBUG_LOG_MAX);
          setDeep(vars, EDEN_HELPER_DEBUG_LOG_PATH, list);
          return vars;
        },
        { type: 'chat' },
      );
    } catch {
      // ignore
    }
  }
}

function readChatDebugFlag(path: string): boolean {
  try {
    const vars = typeof getVariables === 'function' ? (getVariables({ type: 'chat' }) ?? {}) : {};
    return _.get(vars, path, false) === true;
  } catch {
    return false;
  }
}

function writeChatDebugFlags(next: {
  eden_helper?: boolean;
  date_logic?: boolean;
  offstage_health?: boolean;
  room_logic?: boolean;
  to_chat?: boolean;
}) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    vars => {
      if (typeof next.eden_helper === 'boolean') _.set(vars, 'eden.debug.eden_helper', next.eden_helper);
      if (typeof next.date_logic === 'boolean') _.set(vars, 'eden.debug.date_logic', next.date_logic);
      if (typeof next.offstage_health === 'boolean') _.set(vars, 'eden.debug.offstage_health', next.offstage_health);
      if (typeof next.room_logic === 'boolean') _.set(vars, 'eden.debug.room_logic', next.room_logic);
      if (typeof next.to_chat === 'boolean') _.set(vars, 'eden.debug.to_chat', next.to_chat);
      return vars;
    },
    { type: 'chat' },
  );
}

function ensureDebugButtons() {
  if (typeof appendInexistentScriptButtons !== 'function') return;
  if (typeof getButtonEvent !== 'function') return;
  if (typeof eventOn !== 'function') return;

  appendInexistentScriptButtons([
    { name: DEBUG_BUTTON_TOGGLE, visible: true },
    { name: DEBUG_BUTTON_TOGGLE_CHATLOG, visible: true },
  ]);

  eventOn(getButtonEvent(DEBUG_BUTTON_TOGGLE), () => {
    if (!isActiveInstance()) return;
    const cur = readChatDebugFlag('eden.debug.eden_helper');
    const next = !cur;
    writeChatDebugFlags({
      eden_helper: next,
      date_logic: next,
      offstage_health: next,
      room_logic: next,
    });
    toastr?.info?.(`伊甸调试：${next ? '已开启' : '已关闭'}`);

    console.log(`[eden/helper] 调试开关：${next ? '开启' : '关闭'} ${safeStringify({ enabled: next })}`);
  });

  eventOn(getButtonEvent(DEBUG_BUTTON_TOGGLE_CHATLOG), () => {
    if (!isActiveInstance()) return;
    const cur = readChatDebugFlag('eden.debug.to_chat');
    const next = !cur;
    writeChatDebugFlags({ to_chat: next });
    toastr?.info?.(`伊甸调试写入日志：${next ? '已开启' : '已关闭'}`);

    console.log(`[eden/helper] 调试写入日志：${next ? '开启' : '关闭'} ${safeStringify({ to_chat: next })}`);
  });
}

function readRoomDebugFlagFromChat(): boolean {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const debug = _.get(vars, 'eden.debug', {}) ?? {};
  return _.get(debug, 'room_logic', false) === true;
}

function notifyEdenHelperLoaded() {
  try {
    if (!isActiveInstance()) return;
    const id = typeof getScriptId === 'function' ? String(getScriptId() ?? 'unknown') : 'unknown';
    const key = `eden.helper.loaded.${id}.v${EDEN_HELPER_VERSION}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    toastr?.success?.(`伊甸后台数据辅助 v${EDEN_HELPER_VERSION} 加载成功`);
  } catch {
    // ignore
  }
}

function listRoomTagsFromRooms(rooms: Rooms): string[] {
  const tags: string[] = [
    '玄关/净化/隔离区',
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
  if (t === '玄关/净化/隔离区') return _.get(rooms, '玄关.净化隔离区入住者', []);
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
    console.log('[房间逻辑] 已从「房间」表补齐缺失的角色所在房间标签:', patched);
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
  if (t === '玄关/净化/隔离区') return void _.set(nextRooms, '玄关.净化隔离区入住者', list);
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
      if (oldTag !== newTag || newTag !== finalTag)
        mismatch.push({ name, old: oldTag, next: newTag, final: finalTag, reason });
    }
    if (mismatch.length > 0) console.log('[房间逻辑] 房间标签对齐详情:', mismatch);

    const dup: Array<{ name: string; tags: string[] }> = [];
    const writeTags = allTags;
    for (const name of [...core, ...tempNpc]) {
      const tags = writeTags.filter(t => (readRoomListByTag(nextRooms, t) ?? []).includes(name));
      if (tags.length > 1) dup.push({ name, tags });
    }
    if (dup.length > 0) console.log('[房间逻辑] 对齐后仍存在多房间重复占用:', dup);

    const reasons = [...finalReasonByName.entries()].reduce<Record<string, number>>((acc, [, r]) => {
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {});
    console.log('[房间逻辑] 对齐原因统计:', reasons);
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

type Ability = { name: string; desc: string };

type ShelterUpgradeState = z.output<typeof ShelterUpgradeStateSchema>;

const ShelterUpgradeStateSchema = z
  .object({
    last_roll_date: z.string().prefault(''),
    days_since_upgrade: z.coerce.number().prefault(0),

    // meta: 用于 UI 显示 NEW 标签、以及调试定位“谁生效了”
    // roll_history: 以“日期”为粒度的一次性结算记录（用于防删楼刷点、以及回看旧日期时保持点数稳定）
    roll_history: z
      .record(
        z.string(),
        z
          .object({
            roll: z.union([z.coerce.number(), z.null()]),
            upgraded: z.boolean(),
            reason: z.string().prefault('normal'),
            source: z.string().prefault('script'),
            ts: z.string().prefault(''),
            event_id: z.string().optional(),
            message_id: z.coerce.number().optional(),
            trigger: z.string().optional(),
          })
          .passthrough(),
      )
      .prefault({}),
    last_roll_value: z.union([z.coerce.number(), z.null()]).optional(),
    last_roll_upgraded: z.boolean().optional(),
    last_roll_reason: z.string().optional(),
    last_roll_source: z.string().optional(),
    last_roll_event_id: z.string().optional(),
    last_roll_settled: z.boolean().optional(),

    last_level_message_id: z.coerce.number().optional(),
    last_level_source: z.string().optional(),

    last_ability_message_id: z.coerce.number().optional(),
    last_ability_source: z.string().optional(),
    last_ability_changed: z.boolean().optional(),
    last_ability_event_id: z.string().optional(),
    last_ability_added_names: z.array(z.string()).optional(),

    manual_request: z
      .object({
        id: z.string().prefault(''),
        message_id: z.coerce.number().prefault(0),
        today: z.string().prefault(''),
        ts: z.string().prefault(''),
      })
      .prefault({ id: '', message_id: 0, today: '', ts: '' })
      .optional(),
  })
  .passthrough()
  .prefault({ last_roll_date: '', days_since_upgrade: 0 });

function readShelterUpgradeState(): ShelterUpgradeState {
  try {
    const vars = getVariables({ type: 'chat' }) ?? {};
    const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, {});
    return ShelterUpgradeStateSchema.parse(raw);
  } catch {
    return ShelterUpgradeStateSchema.parse({});
  }
}

function patchShelterUpgradeState(patcher: (prev: any) => any) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    (vars: any) => {
      const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, {});
      const prev = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as any) } : {};
      const next = patcher(prev) ?? prev;
      _.set(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, next);
      return vars;
    },
    { type: 'chat' },
  );
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

function parseDaysSinceUpgrade(distanceText: any): number {
  const s = String(distanceText ?? '').trim();
  const m = s.match(/^(\d+)\s*天/);
  if (!m) return 0;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function formatDistanceText(daysSinceUpgrade: number): string {
  const days = Math.max(0, Math.floor(daysSinceUpgrade));
  const remaining = Math.max(0, 7 - days);
  return `${days}天 | 剩余保底升级天数：${remaining}天`;
}

function formatRollText(roll: number | null, upgraded: boolean, reason?: 'guarantee'): string {
  if (reason === 'guarantee') return '今日已投掷: 保底升级！';
  const r = typeof roll === 'number' && Number.isFinite(roll) ? Math.floor(roll) : 0;
  return `今日已投掷: ${r}点 (${upgraded ? '触发幸运升级！' : '未升级'})`;
}

function parseEdenDateToNumber(dateStr: any): number | null {
  const s = String(dateStr ?? '').trim();
  const m = s.match(/(\d+)年(\d+)月(\d+)日/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return y * 10000 + mo * 100 + d;
}

function isDateForward(today: string, last: string): boolean {
  const t = parseEdenDateToNumber(today);
  const l = parseEdenDateToNumber(last);
  if (t == null || l == null) return today !== last;
  return t > l;
}

function createEventId(prefix: string): string {
  try {
    const uuid = (globalThis as any)?.crypto?.randomUUID?.();
    if (typeof uuid === 'string' && uuid) return `${prefix}_${uuid}`;
  } catch {
    // ignore
  }
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

function pruneRollHistory(history: Record<string, any>, keep: number): Record<string, any> {
  const entries = Object.entries(history ?? {});
  if (entries.length <= keep) return history ?? {};

  const scored = entries.map(([k, v]) => {
    const n = parseEdenDateToNumber(k);
    return { k, v, n: n == null ? Number.POSITIVE_INFINITY : n };
  });
  scored.sort((a, b) => a.n - b.n);

  const sliced = scored.slice(Math.max(0, scored.length - keep));
  return sliced.reduce<Record<string, any>>((acc, x) => {
    acc[x.k] = x.v;
    return acc;
  }, {});
}

function parseShelterAbilitiesByLevel(raw: string): Record<number, Ability[]> {
  const out: Record<number, Ability[]> = {};
  const parts = String(raw ?? '').split(/###\s*庇护所等级\s*(\d+)\s*:/g);
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const level = Number(parts[i]);
    const section = String(parts[i + 1] ?? '');
    if (!Number.isFinite(level)) continue;

    const lines = section.split(/\r?\n/);
    const abilities: Ability[] = [];

    let curName: string | null = null;
    let curDesc: string[] = [];
    let inDesc = false;

    const commit = () => {
      if (!curName) return;
      const desc = curDesc
        .map(x => String(x ?? '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      abilities.push({ name: curName.trim(), desc });
      curName = null;
      curDesc = [];
      inDesc = false;
    };

    const looksLikeAbilityName = (line: string) => {
      const t = line.trim();
      if (!t) return false;
      // 能力名在蓝图中均以 emoji 开头；描述换行通常以中文开头，避免误判为“新能力”
      try {
        if (!/^\p{Extended_Pictographic}/u.test(t)) return false;
      } catch {
        // fallback：不支持 Unicode 属性转义时，退化为“常见图标前缀”判断
        if (!/^[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(t)) return false;
      }
      if (t.startsWith('#') || t.startsWith('<')) return false;
      if (t.startsWith('---')) return false;
      if (t.startsWith('简介')) return false;
      if (t.startsWith('-')) return false;
      return true;
    };

    for (const lineRaw of lines) {
      const line = String(lineRaw ?? '').trimEnd();
      const t = line.trim();
      if (!t) {
        if (inDesc) curDesc.push('');
        continue;
      }
      if (t.startsWith('---')) {
        if (curName) commit();
        continue;
      }

      const descMatch = t.match(/^简介[:：]\s*(.*)$/);
      if (descMatch && curName) {
        inDesc = true;
        curDesc.push(descMatch[1] ?? '');
        continue;
      }

      if (looksLikeAbilityName(t)) {
        if (curName) commit();
        curName = t;
        curDesc = [];
        inDesc = false;
        continue;
      }

      if (inDesc && curName) {
        curDesc.push(t);
      }
    }
    if (curName) commit();

    if (abilities.length > 0) out[level] = abilities;
  }
  return out;
}

const __shelterAbilitiesByLevel = parseShelterAbilitiesByLevel(shelterBlueprintRaw);

function normalizeAbilityName(name: any): string {
  // 统一“智能引号”等字符，避免同一能力被 AI 写出多个 key（导致误判 NEW / addedAbilities）
  const s = String(name ?? '').trim();
  if (!s) return '';
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyShelterUpgradeRewards(
  stat_data: any,
  level: number,
): {
  addedAbilities: string[];
  patchedMedicalWing: boolean;
  patchedVehicleHangar: boolean;
} {
  const lv = clampLevel(level);

  const beforeRecord = _.get(stat_data, ['庇护所', '庇护所能力'], {});
  const beforeKeys = beforeRecord && typeof beforeRecord === 'object' ? Object.keys(beforeRecord as any) : [];
  const beforeNorm = new Set(beforeKeys.map(k => normalizeAbilityName(k)).filter(Boolean));

  const abilityRecord = _.get(stat_data, ['庇护所', '庇护所能力'], {});
  if (!abilityRecord || typeof abilityRecord !== 'object') _.set(stat_data, ['庇护所', '庇护所能力'], {});

  // 先把当前能力表去重（按 normalizeAbilityName），合并 desc，避免产生“同能力多个 key”
  const rawMerged: Record<string, { desc: string }> = { ...(_.get(stat_data, ['庇护所', '庇护所能力']) ?? {}) };
  const deduped: Record<string, { desc: string }> = {};
  const normToKey = new Map<string, string>();
  for (const [k, v] of Object.entries(rawMerged)) {
    const key = String(k ?? '').trim();
    if (!key) continue;
    const norm = normalizeAbilityName(key);
    if (!norm) continue;
    const desc = String((v as any)?.desc ?? '').trim();
    const existKey = normToKey.get(norm);
    if (!existKey) {
      normToKey.set(norm, key);
      deduped[key] = { desc };
      continue;
    }
    const old = String((deduped[existKey] as any)?.desc ?? '').trim();
    // 优先保留信息量更大的描述，避免丢字；否则保留已有
    if ((!old && desc) || (desc && desc.length > old.length)) {
      deduped[existKey] = { desc };
    }
  }

  const addedAbilities: string[] = [];
  const merged: Record<string, { desc: string }> = { ...deduped };

  for (let i = 1; i <= lv; i++) {
    for (const ab of __shelterAbilitiesByLevel[i] ?? []) {
      const name = String(ab.name ?? '').trim();
      const norm = normalizeAbilityName(name);
      if (!norm) continue;

      const existingKey = normToKey.get(norm);
      if (!existingKey) {
        // 不存在：以蓝图名作为 canonical key 插入
        normToKey.set(norm, name);
        merged[name] = { desc: ab.desc };
        if (!beforeNorm.has(norm)) addedAbilities.push(name);
        continue;
      }

      // 已存在：仅在 desc 为空时补全，避免覆盖玩家/AI 写的更详细版本
      const existing = merged[existingKey];
      const oldDesc = String((existing as any)?.desc ?? '').trim();
      if (!oldDesc && ab.desc) merged[existingKey] = { desc: ab.desc };
    }
  }

  _.set(stat_data, ['庇护所', '庇护所能力'], merged);

  // 可扩展区域：只按“明确等级解锁”的部分做同步，避免覆盖任务解锁逻辑
  const beforeMed = String(_.get(stat_data, ['庇护所', '可扩展区域', '医疗翼'], '') ?? '');
  const med = lv >= 9 ? '专家级自动医师' : lv >= 6 ? '外科手术台' : lv >= 3 ? '初级医疗舱' : '未解锁';
  _.set(stat_data, ['庇护所', '可扩展区域', '医疗翼'], med);
  const patchedMedicalWing = beforeMed !== med;

  let patchedVehicleHangar = false;
  if (lv >= 7) {
    const cur = String(_.get(stat_data, ['庇护所', '可扩展区域', '载具格纳库'], '') ?? '');
    if (!cur || cur === '未解锁') {
      _.set(stat_data, ['庇护所', '可扩展区域', '载具格纳库'], '先驱者制造单元');
      patchedVehicleHangar = true;
    }
  }

  return { addedAbilities, patchedMedicalWing, patchedVehicleHangar };
}

type ParsedRollText =
  | { kind: 'guarantee'; roll: null; upgraded: true }
  | { kind: 'number'; roll: number; upgraded: boolean };

function parseRollText(text: any): ParsedRollText | null {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (s.includes('保底')) return { kind: 'guarantee', roll: null, upgraded: true };

  const m = s.match(/今日已投掷[:：]?\s*(\d+)\s*点/);
  if (!m) return null;
  const roll = Number(m[1]);
  if (!Number.isFinite(roll)) return null;
  const clamped = _.clamp(Math.floor(roll), 0, 10);
  const upgraded = clamped === 7 || clamped === 10;
  return { kind: 'number', roll: clamped, upgraded };
}

function applyShelterDailyRollIfNeeded(new_variables: any, old_variables: any, debugSetting: EdenDebugSetting) {
  const stat_data = _.get(new_variables, 'stat_data', {}) ?? {};
  const old_stat_data = _.get(old_variables, 'stat_data', {}) ?? {};

  const today = String(_.get(stat_data, ['世界', '日期'], '') ?? '').trim();
  if (!today) return;
  const yesterday = String(_.get(old_stat_data, ['世界', '日期'], '') ?? '').trim();

  const state = readShelterUpgradeState();
  const history0: Record<string, any> = ((state as any).roll_history as any) ?? {};

  const manualReq = (state as any)?.manual_request ?? null;
  const manualMessageId = Number((manualReq as any)?.message_id ?? 0);
  const manualToday = String((manualReq as any)?.today ?? '').trim();
  const hasManual = Number.isFinite(manualMessageId) && manualMessageId > 0 && (!manualToday || manualToday === today);

  const lastDate = String(state.last_roll_date ?? '').trim();
  const hasRollValue =
    Object.prototype.hasOwnProperty.call(state, 'last_roll_value') && (state as any).last_roll_value !== undefined;
  const alreadyRolledToday = lastDate === today && hasRollValue;
  const alreadyHasHistoryToday = Object.prototype.hasOwnProperty.call(history0, today);

  const crossedDay = (() => {
    if (!yesterday) return false;
    if (yesterday === today) return false;
    // 如果解析失败，退化为“字符串变化即跨天”，宁可触发一次也不要错过（有 chat 变量幂等兜底）
    const y = parseEdenDateToNumber(yesterday);
    const t = parseEdenDateToNumber(today);
    if (y == null || t == null) return true;
    return t > y;
  })();

  // 初次进入：优先用 old date 建档（避免“第一次装脚本刚好跨天但没roll”的体验）
  if (!lastDate) {
    const seededDays = parseDaysSinceUpgrade(_.get(stat_data, ['庇护所', '距离上次升级'], ''));
    const seededRoll = parseRollText(_.get(stat_data, ['庇护所', '今日投掷点数'], ''));
    const seededMessageId = getLastMessageIdSafe() ?? 0;
    const seedDate = yesterday && yesterday !== today ? yesterday : today;

    patchShelterUpgradeState(prev => ({
      ...prev,
      last_roll_date: seedDate,
      days_since_upgrade: seededDays,
      ...(seededRoll
        ? {
            last_roll_value: seededRoll.roll,
            last_roll_upgraded: seededRoll.upgraded,
            last_roll_reason: seededRoll.kind === 'guarantee' ? 'guarantee' : seededRoll.upgraded ? 'lucky' : 'normal',
            last_roll_source: 'seed',
            roll_history: {
              ...(typeof (prev as any)?.roll_history === 'object' && (prev as any).roll_history
                ? (prev as any).roll_history
                : {}),
              ...(Object.prototype.hasOwnProperty.call(
                typeof (prev as any)?.roll_history === 'object' && (prev as any).roll_history
                  ? (prev as any).roll_history
                  : {},
                seedDate,
              )
                ? {}
                : {
                    [seedDate]: {
                      roll: seededRoll.roll,
                      upgraded: seededRoll.upgraded,
                      reason: seededRoll.kind === 'guarantee' ? 'guarantee' : seededRoll.upgraded ? 'lucky' : 'normal',
                      source: 'seed',
                      ts: new Date().toISOString(),
                      message_id: seededMessageId,
                      trigger: 'seed',
                    },
                  }),
            },
          }
        : {}),
    }));

    edenLog(
      'info',
      'daily_roll.seed',
      { today, yesterday, seedDate, seededDays, hasSeededRoll: !!seededRoll, message_id: seededMessageId },
      debugSetting,
    );
  }

  // 重新读取一次，确保 last_roll_date/天数已就绪（本次事件内写回 chat 变量不会影响 new_variables，但这里用于逻辑判断即可）
  const nextState = lastDate ? state : readShelterUpgradeState();
  const history: Record<string, any> = ((nextState as any).roll_history as any) ?? {};
  const historyEntryToday = Object.prototype.hasOwnProperty.call(history, today) ? history[today] : null;
  const nextLastDate = String(nextState.last_roll_date ?? '').trim();
  const nextHasRollValue =
    Object.prototype.hasOwnProperty.call(nextState, 'last_roll_value') &&
    (nextState as any).last_roll_value !== undefined;
  const nextAlreadyRolledToday = nextLastDate === today && nextHasRollValue;
  const nextAlreadyHasHistoryToday = !!historyEntryToday;

  const needRollByDate = crossedDay && !nextAlreadyHasHistoryToday;
  const needRollByManual = hasManual && !nextAlreadyHasHistoryToday;
  const needRoll = needRollByDate || needRollByManual;

  const settleSource = needRollByManual ? 'manual' : 'script';
  const metaMessageId = (needRollByManual ? manualMessageId : getLastMessageIdSafe()) ?? 0;

  // 若今天已经有 roll_history 记录，则以它为准回写 roll/天数字段，避免 MVU “无更新取旧值”导致 UI 混淆。
  if (nextAlreadyHasHistoryToday) {
    const roll = (historyEntryToday as any)?.roll ?? null;
    const upgraded = (historyEntryToday as any)?.upgraded === true;
    const reason = String((historyEntryToday as any)?.reason ?? '').trim();
    const text = formatRollText(roll, upgraded, reason === 'guarantee' ? 'guarantee' : undefined);
    if (String(_.get(stat_data, ['庇护所', '今日投掷点数'], '') ?? '') !== text) {
      _.set(stat_data, ['庇护所', '今日投掷点数'], text);
    }

    const days =
      Number.isFinite((nextState as any).days_since_upgrade) && (nextState as any).days_since_upgrade >= 0
        ? Math.floor((nextState as any).days_since_upgrade)
        : parseDaysSinceUpgrade(_.get(stat_data, ['庇护所', '距离上次升级'], ''));
    const distText = formatDistanceText(days);
    if (String(_.get(stat_data, ['庇护所', '距离上次升级'], '') ?? '') !== distText) {
      _.set(stat_data, ['庇护所', '距离上次升级'], distText);
    }
  }

  // 未触发 roll：仅清理 manual_request（避免重复触发）
  if (!needRoll) {
    if (crossedDay || hasManual) {
      console.log(
        `[DailyRoll] skip ${JSON.stringify({
          today,
          yesterday,
          crossedDay,
          last_roll_date: nextLastDate,
          alreadyRolledToday: nextAlreadyRolledToday,
          alreadyHasHistoryToday: nextAlreadyHasHistoryToday,
          hasManual,
          last_roll_source: (nextState as any)?.last_roll_source ?? '',
        })}`,
      );
    }
    if (hasManual) {
      patchShelterUpgradeState(prev => {
        const next = { ...prev };
        delete (next as any).manual_request;
        return next;
      });
      edenLog('info', 'daily_roll.manual.noop', { today, message_id: metaMessageId }, debugSetting);
    }
    return;
  }

  const baseDays = Number.isFinite(nextState.days_since_upgrade)
    ? Math.max(0, Math.floor(nextState.days_since_upgrade))
    : parseDaysSinceUpgrade(_.get(stat_data, ['庇护所', '距离上次升级'], ''));

  const isGuarantee = baseDays >= 7;

  const rollTextNew = _.get(stat_data, ['庇护所', '今日投掷点数'], '');
  const rollTextOld = _.get(old_stat_data, ['庇护所', '今日投掷点数'], '');
  const aiTouchedRollTextRaw = !_.isEqual(rollTextNew, rollTextOld) && String(rollTextNew ?? '').trim().length > 0;
  const aiTouchedRollText = false; // 默认忽略 AI 写入 roll 文本（避免固定点数/刷点）
  const aiParsed = aiTouchedRollText ? parseRollText(rollTextNew) : null;

  if (aiTouchedRollTextRaw) {
    edenLog(
      'warn',
      'daily_roll.ai_roll_ignored',
      {
        today,
        message_id: metaMessageId,
        roll_text: String(rollTextNew ?? '').slice(0, 120),
      },
      debugSetting,
    );
  }

  let roll: number | null = null;
  let upgraded = false;
  let reason: 'guarantee' | 'lucky' | 'normal' | 'ai_invalid' = 'normal';
  let source: 'script' | 'manual' | 'ai' = settleSource;

  if (isGuarantee) {
    roll = null;
    upgraded = true;
    reason = 'guarantee';
  } else if (aiParsed && aiParsed.kind === 'number') {
    roll = aiParsed.roll;
    upgraded = aiParsed.upgraded;
    reason = upgraded ? 'lucky' : 'normal';
    source = 'ai';
  } else {
    if (aiTouchedRollText && !aiParsed) {
      reason = 'ai_invalid';
    }
    roll = Math.floor(Math.random() * 11);
    upgraded = roll === 7 || roll === 10;
    source = settleSource;
    reason = upgraded ? 'lucky' : reason === 'ai_invalid' ? 'ai_invalid' : 'normal';
  }

  const oldLevelRaw = _.get(old_stat_data, ['庇护所', '庇护所等级'], 1);
  const newLevelRaw = _.get(stat_data, ['庇护所', '庇护所等级'], 1);
  const oldLevel = clampLevel(oldLevelRaw);
  const newLevel = clampLevel(newLevelRaw);
  const baselineLevel = Math.max(oldLevel, newLevel);

  if (baselineLevel !== newLevel) {
    _.set(stat_data, ['庇护所', '庇护所等级'], baselineLevel);
    edenLog(
      'warn',
      'shelter.level.downgrade_corrected',
      { oldLevel, newLevel, baselineLevel, today, message_id: metaMessageId },
      debugSetting,
    );
  }

  const canLevelUp = baselineLevel < 10;
  const alreadyLevelUpByAI = newLevel > oldLevel;

  const nextLevel = upgraded && canLevelUp && !alreadyLevelUpByAI ? clampLevel(baselineLevel + 1) : baselineLevel;
  const nextDays = upgraded ? 0 : baseDays + 1;

  _.set(stat_data, ['庇护所', '今日投掷点数'], formatRollText(roll, upgraded, isGuarantee ? 'guarantee' : undefined));
  _.set(stat_data, ['庇护所', '距离上次升级'], formatDistanceText(nextDays));
  _.set(stat_data, ['庇护所', '庇护所等级'], nextLevel);

  const rewardDiff = applyShelterUpgradeRewards(stat_data, nextLevel);

  const didLevelUp = nextLevel > oldLevel;
  const didAbilityListChange = rewardDiff.addedAbilities.length > 0;
  const rollEventId = createEventId('roll');
  const abilityEventId = didAbilityListChange ? createEventId('ability') : '';

  edenLog(
    'info',
    'daily_roll.settled',
    {
      today,
      message_id: metaMessageId,
      trigger: needRollByManual ? 'manual' : 'auto',
      source,
      reason,
      baseDays,
      nextDays,
      roll,
      upgraded,
      oldLevel,
      nextLevel,
      didLevelUp,
      rewardAddedAbilities: rewardDiff.addedAbilities,
      rewardPatchedMedicalWing: rewardDiff.patchedMedicalWing,
      rewardPatchedVehicleHangar: rewardDiff.patchedVehicleHangar,
    },
    debugSetting,
  );
  console.log(
    `[DailyRoll] settled ${JSON.stringify({
      today,
      yesterday,
      trigger: needRollByManual ? 'manual' : 'auto',
      source,
      reason,
      roll,
      upgraded,
      oldLevel,
      nextLevel,
      baseDays,
      nextDays,
    })}`,
  );

  patchShelterUpgradeState(prev => {
    const next = {
      ...prev,
      last_roll_date: today,
      days_since_upgrade: nextDays,
      last_roll_value: roll,
      last_roll_upgraded: upgraded,
      last_roll_reason: reason,
      last_roll_source: source,
      last_roll_event_id: rollEventId,
      last_roll_settled: true,
    } as any;

    const prevHistory: Record<string, any> =
      prev && typeof prev === 'object' && !Array.isArray(prev) && typeof (prev as any).roll_history === 'object'
        ? ((prev as any).roll_history ?? {})
        : {};
    const nextHistory = {
      ...prevHistory,
      [today]: {
        roll,
        upgraded,
        reason,
        source,
        ts: new Date().toISOString(),
        event_id: rollEventId,
        message_id: metaMessageId,
        trigger: needRollByManual ? 'manual' : 'auto',
      },
    };
    next.roll_history = pruneRollHistory(nextHistory, 120);

    if (didLevelUp) {
      next.last_level_message_id = metaMessageId;
      next.last_level_source = source;
    }

    // 能力列表 NEW：仅在“新增能力条目”时点亮，避免仅修补可扩展区域等也显示 NEW
    next.last_ability_changed = didAbilityListChange;
    if (didAbilityListChange) {
      next.last_ability_message_id = metaMessageId;
      next.last_ability_source = source;
      next.last_ability_event_id = abilityEventId;
      next.last_ability_added_names = rewardDiff.addedAbilities.slice();
    }

    delete next.manual_request;
    return next;
  });
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
  return {
    add: Object.keys(add).length ? add : undefined,
    remove: Object.keys(remove).length ? remove : undefined,
    note,
  };
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

function mergeTempNpcIntoCore(stat_data: any, debugSetting?: EdenDebugSetting) {
  const temp = _.get(stat_data, '临时NPC', {});
  if (!temp || typeof temp !== 'object' || Array.isArray(temp)) return;

  const merged: string[] = [];
  for (const [name, tempRole] of Object.entries(temp)) {
    if (typeof name !== 'string' || !name) continue;
    if (!isRoleLike(tempRole)) continue;
    const coreRole = _.get(stat_data, name, null);
    if (!isRoleLike(coreRole)) continue;

    const next = mergeRoleLike(coreRole, tempRole as RoleLike);
    _.set(stat_data, name, next);
    _.unset(stat_data, ['临时NPC', name]);
    merged.push(name);
  }

  if (merged.length > 0 && debugSetting) {
    edenLog('info', 'role.merge_temp_into_core', { names: merged }, debugSetting);
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

/**
 * 登场状态清洗（针对“AI忘了把登场拨回离场，且本次没写任何字段”的失效局面）
 *
 * 规则（按用户需求）：
 * - 若 AI 明确改了登场状态（登场/离场），一律信任 AI（不在此处干预）
 * - 仅当：旧值为【登场】、新值仍为【登场】、且整段角色对象完全没变化（AI未写任何字段）
 *   => 视为“忘回拨”，脚本强制改为【离场】以继续走离场健康结算
 */
function sanitizeForgottenOnstageRoles(stat_data: any, old_stat_data: any, debugSetting: EdenDebugSetting) {
  const { core, tempNpc } = listRoleNames(stat_data);
  const all = [...core, ...tempNpc];

  const patched: Array<{ name: string; path: string }> = [];

  for (const name of all) {
    const isTemp = tempNpc.includes(name);
    const rolePath = isTemp ? `临时NPC.${name}` : name;

    const newRole = _.get(stat_data, rolePath, null);
    const oldRole = _.get(old_stat_data, rolePath, null);
    if (!newRole || typeof newRole !== 'object') continue;
    if (!oldRole || typeof oldRole !== 'object') continue;

    const oldStage = String(_.get(oldRole, '登场状态', '') ?? '').trim();
    const newStage = String(_.get(newRole, '登场状态', '') ?? '').trim();

    // 只处理“旧登场、且 AI 未改登场状态”的情况
    if (oldStage !== '登场') continue;
    if (oldStage !== newStage) continue;

    // 若 AI 写了任何字段（对象有差异），则认为“登场是有意为之”，不处理
    if (!_.isEqual(oldRole, newRole)) continue;

    _.set(stat_data, `${rolePath}.登场状态`, '离场');
    patched.push({ name, path: rolePath });

    edenLog(
      'warn',
      'stage_sanitize.force_offstage',
      {
        zh: `回拨「${name}」的登场状态为「离场」（AI 未改登场状态且本轮无字段更新）`,
        role: name,
        rolePath,
        reason: 'onstage_unchanged_and_no_updates',
      },
      debugSetting,
    );
  }

  if (patched.length > 0) {
    edenLog(
      'info',
      'stage_sanitize.summary',
      {
        zh: `登场状态清洗完成：共回拨 ${patched.length} 名角色为「离场」`,
        patchedCount: patched.length,
        patched,
      },
      debugSetting,
    );
  }
}

/**
 * 登场状态反向回拨（针对“角色实际有字段更新，但登场状态还停留在离场”的局面）
 *
 * 规则（按用户需求，且尽量保守）：
 * - 若 AI 明确改了登场状态（登场/离场），一律信任 AI（不在此处干预）
 * - 仅当：旧值为【离场】、新值仍为【离场】、且角色对象出现“非健康结算类字段”的更新
 *   => 视为“忘拨回登场”，脚本强制改为【登场】
 *
 * 说明：健康/健康更新原因 可能会被脚本或 AI 用于“离场期间的休整/衰减结算”，不应据此强制登场。
 */
function sanitizeForgottenOffstageRoles(stat_data: any, old_stat_data: any, debugSetting: EdenDebugSetting) {
  const { core, tempNpc } = listRoleNames(stat_data);
  const all = [...core, ...tempNpc];

  const patched: Array<{ name: string; path: string; changedKeys: string[]; effectiveChangedKeys: string[] }> = [];
  const skippedHealthOnly: Array<{ name: string; path: string; changedKeys: string[] }> = [];

  for (const name of all) {
    const isTemp = tempNpc.includes(name);
    const rolePath = isTemp ? `临时NPC.${name}` : name;

    const newRole = _.get(stat_data, rolePath, null);
    const oldRole = _.get(old_stat_data, rolePath, null);
    if (!newRole || typeof newRole !== 'object') continue;
    if (!oldRole || typeof oldRole !== 'object') continue;

    const oldStage = String(_.get(oldRole, '登场状态', '') ?? '').trim();
    const newStage = String(_.get(newRole, '登场状态', '') ?? '').trim();

    // 只处理“旧离场、且 AI 未改登场状态”的情况
    if (oldStage !== '离场') continue;
    if (oldStage !== newStage) continue;

    // AI 本轮没有写入任何字段：不回拨
    if (_.isEqual(oldRole, newRole)) continue;

    const IGNORE_FOR_DIFF = new Set(['登场状态']);
    // 用户设定：只排除“脚本后台可能更新”的字段（健康与原因）。其他字段若被更新，一律视为“角色实际在场”。
    const IGNORE_FOR_EFFECTIVE = new Set(['健康', '健康更新原因']);

    const keys = Array.from(new Set([...Object.keys(oldRole), ...Object.keys(newRole)]));
    const changedKeys = keys.filter(
      k => !IGNORE_FOR_DIFF.has(k) && !_.isEqual((oldRole as any)?.[k], (newRole as any)?.[k]),
    );
    const effectiveChangedKeys = changedKeys.filter(k => !IGNORE_FOR_EFFECTIVE.has(k));

    // 只更新了健康/健康更新原因：不回拨登场（保持离场）。
    if (effectiveChangedKeys.length === 0) {
      if (changedKeys.length > 0) skippedHealthOnly.push({ name, path: rolePath, changedKeys: changedKeys.slice() });
      continue;
    }

    _.set(stat_data, `${rolePath}.登场状态`, '登场');
    patched.push({
      name,
      path: rolePath,
      changedKeys: changedKeys.slice(),
      effectiveChangedKeys: effectiveChangedKeys.slice(),
    });

    edenLog(
      'warn',
      'stage_sanitize.force_onstage',
      {
        zh: `回拨「${name}」的登场状态为「登场」（检测到非健康字段更新：${effectiveChangedKeys
          .slice(0, 8)
          .join('、')}${effectiveChangedKeys.length > 8 ? ` 等${effectiveChangedKeys.length}项` : ''}）`,
        role: name,
        rolePath,
        reason: 'offstage_unchanged_but_role_updated',
        changedKeys,
        effectiveChangedKeys,
        ignoredKeysForEffective: Array.from(IGNORE_FOR_EFFECTIVE),
      },
      debugSetting,
    );
  }

  if (patched.length > 0) {
    edenLog(
      'info',
      'stage_sanitize.summary.force_onstage',
      {
        zh: `离场状态校准完成：共回拨 ${patched.length} 名角色为「登场」`,
        patchedCount: patched.length,
        patched,
      },
      debugSetting,
    );
  }

  if (skippedHealthOnly.length > 0) {
    edenLog(
      'debug',
      'stage_sanitize.summary.skip_health_only',
      {
        zh: `离场状态校准：检测到 ${skippedHealthOnly.length} 名角色仅更新「健康/健康更新原因」，保持「离场」`,
        skippedCount: skippedHealthOnly.length,
        skipped: skippedHealthOnly,
      },
      debugSetting,
    );
  }
}

function applyDerivedHealthStatus(rolePath: string, role: RoleLike, stat_data: any) {
  const healthRaw = role.健康;
  const health = typeof healthRaw === 'number' || typeof healthRaw === 'string' ? Number(healthRaw) : NaN;
  if (!Number.isFinite(health)) return;
  const status = healthCondition(clampHealth(health));
  _.set(stat_data, `${rolePath}.健康状况`, status);
}

function applyAutoStageFromThoughtUpdateIfNeeded(
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
    console.log(`[登场状态] 「${roleName}」内心想法已更新，登场状态自动回拨为「登场」`);
  }

  _.set(newRole, '登场状态', '登场');
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
    console.log(`[死亡判定] 「${roleName}」Imp=${mark}（<0），判定精神崩溃自杀：健康清零`);
  }

  _.set(stat_data, `${rolePath}.健康`, 0);
  _.set(stat_data, `${rolePath}.健康更新原因`, '死亡（Imp<0 触发精神崩溃自杀）');
  _.set(stat_data, `${rolePath}.健康状况`, '死亡');
  // Imp<0 自杀：按规则保留负值，不清零（仅规范化为 number）
  _.set(stat_data, `${rolePath}.秩序刻印`, mark);
  _.set(stat_data, `${rolePath}.秩序刻印更新原因`, '');
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

function applyDeathFromZeroHealthIfNeeded(
  rolePath: string,
  roleName: string,
  role: RoleLike,
  stat_data: any,
  debug: { offstageHealth: boolean },
) {
  const healthRaw = role.健康;
  if (typeof healthRaw !== 'number' && typeof healthRaw !== 'string') return;
  const health = clampHealth(Number(healthRaw) || 0);
  if (health > 0) return;

  const reason = String((role as any)?.健康更新原因 ?? '').trim();
  const markRaw = (role as any)?.秩序刻印;
  const markNum = typeof markRaw === 'number' || typeof markRaw === 'string' ? Number(markRaw) : NaN;
  const diedFromNegativeImprint = Number.isFinite(markNum) && markNum < 0;

  _.set(stat_data, `${rolePath}.健康`, 0);
  _.set(stat_data, `${rolePath}.健康状况`, '死亡');
  _.set(stat_data, `${rolePath}.登场状态`, '离场');
  if (!reason) _.set(stat_data, `${rolePath}.健康更新原因`, '死亡（健康归零）');

  // 归档死亡：清空文本类字段；秩序刻印清零（负刻印死亡已在另一条规则内处理）
  _.set(stat_data, `${rolePath}.衣着`, '');
  _.set(stat_data, `${rolePath}.舌唇`, '');
  _.set(stat_data, `${rolePath}.胸乳`, '');
  _.set(stat_data, `${rolePath}.私穴`, '');
  _.set(stat_data, `${rolePath}.神态样貌`, '');
  _.set(stat_data, `${rolePath}.动作姿势`, '');
  _.set(stat_data, `${rolePath}.内心想法`, '');
  _.set(stat_data, `${rolePath}.所在房间`, '');

  if (!diedFromNegativeImprint) {
    _.set(stat_data, `${rolePath}.秩序刻印`, 0);
    _.set(stat_data, `${rolePath}.秩序刻印更新原因`, '');
  }

  if (debug.offstageHealth) {
    console.log(
      `[死亡判定] 「${roleName}」健康<=0，判定死亡 ${safeStringify({ health, reason, diedFromNegativeImprint })}`,
    );
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
  debug: { offstageHealth: boolean },
) {
  if (deltaHours === null) return;

  const touched = diffRoleTouched(oldRole, newRole);
  if (touched.health) return;
  if (touched.healthReason) {
    const r = String((newRole as any)?.健康更新原因 ?? '').trim();
    if (r && r !== '0, 无变化') return;
  }

  const stage = _.get(newRole, '登场状态', '');
  const isOffstage = stage === '离场';
  if (!isOffstage) return;

  const healthRaw = newRole.健康;
  if (typeof healthRaw !== 'number' && typeof healthRaw !== 'string') return;
  const currentHealth = clampHealth(Number(healthRaw) || 0);
  if (currentHealth <= 0) return;

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
    console.log(
      `[离场结算] 「${roleName}」健康 ${currentHealth} -> ${nextHealth}（${reasonText}）${safeStringify({
        deltaHours,
        sheltered,
        rules,
      })}`,
    );
  }
}

function applyDerivedRelationStage(rolePath: string, oldRole: RoleLike | null, newRole: RoleLike, stat_data: any) {
  const markRaw = newRole.秩序刻印;
  if (typeof markRaw !== 'number' && typeof markRaw !== 'string') return;
  const mark = Number(markRaw);
  const stage = relationStageFromImprint(mark);

  const touched = diffRoleTouched(oldRole, newRole);
  if (touched.relation) return;

  if (newRole.关系 !== stage) {
    const oldStage = String((newRole as any)?.关系 ?? '').trim();
    _.set(stat_data, `${rolePath}.关系`, stage);
    edenLog('info', 'relation.auto_derived', {
      zh: `Imp 达到 ${Number.isFinite(mark) ? mark : '?'}，自动调整「${rolePath}」关系为「${stage}」`,
      rolePath,
      imp: Number.isFinite(mark) ? mark : null,
      relationBefore: oldStage,
      relationAfter: stage,
    });
  }
}

function patchDateOnMidnightCrossIfNeeded(new_variables: any, old_variables: any, debug: { dateLogic: boolean }) {
  const oldTimeStr = _.get(old_variables, 'stat_data.世界.时间', '');
  const newTimeStr = _.get(new_variables, 'stat_data.世界.时间', '');

  if (oldTimeStr === newTimeStr) {
    if (debug.dateLogic) console.log('[时间逻辑] 时间未变化：不检查日期');
    return;
  }

  const oldMinutes = parseTimeStrToMinutes(oldTimeStr);
  const newMinutes = parseTimeStrToMinutes(newTimeStr);
  if (oldMinutes === null || newMinutes === null) return;

  if (oldMinutes <= newMinutes) {
    if (debug.dateLogic) {
      console.log(
        `[时间逻辑] 时间变化但未跨天：${oldTimeStr} -> ${newTimeStr} (oldMin=${oldMinutes}, newMin=${newMinutes})`,
      );
    }
    return;
  }

  console.log(`[时间逻辑] 检测到跨天：${oldTimeStr} -> ${newTimeStr}`);

  const oldDateStr = _.get(old_variables, 'stat_data.世界.日期', '');
  const newDateStr = _.get(new_variables, 'stat_data.世界.日期', '');
  if (oldDateStr !== newDateStr) {
    if (debug.dateLogic) console.log(`[时间逻辑] AI 已更新日期：${oldDateStr} -> ${newDateStr}`);
    return;
  }

  const parsed = parseDateStr(oldDateStr);
  if (!parsed) {
    if (debug.dateLogic) console.log(`[时间逻辑] 无法解析日期字符串：${oldDateStr}`);
    return;
  }

  const dateObj = new Date(parsed.year, parsed.month - 1, parsed.day);
  if (Number.isNaN(dateObj.getTime())) {
    if (debug.dateLogic) console.log(`[时间逻辑] 无法转换为 Date：${oldDateStr}`);
    return;
  }

  console.log('[时间逻辑] AI 未更新日期，脚本开始补全日期/天数...');
  dateObj.setDate(dateObj.getDate() + 1);
  const patched = formatDateStr(dateObj);
  _.set(new_variables, 'stat_data.世界.日期', patched);

  const oldDays = _.get(new_variables, 'stat_data.世界.末日天数');
  if (typeof oldDays === 'number') _.set(new_variables, 'stat_data.世界.末日天数', oldDays + 1);
  const daysAfter = _.get(new_variables, 'stat_data.世界.末日天数');
  console.log(`[时间逻辑] 已补全日期：${oldDateStr} -> ${patched}; 天数: ${oldDays} -> ${daysAfter}`);
}

function applyOffstageBundle(new_variables: any, old_variables: any, scope: ShelterScopeByFloor) {
  const debug = readDebugFlagsFromChat();
  const oldWorld = _.get(old_variables, 'stat_data.世界', {});
  const newWorld = _.get(new_variables, 'stat_data.世界', {});

  let deltaHours = diffWorldHours(oldWorld, newWorld);
  if (deltaHours === null) {
    // fallback：当日期/时间格式异常导致无法计算时，用 末日天数 的差值近似（避免离场健康“经常不结算”）
    const oldDays = _.get(oldWorld, '末日天数', null);
    const newDays = _.get(newWorld, '末日天数', null);
    if (
      typeof oldDays === 'number' &&
      typeof newDays === 'number' &&
      Number.isFinite(oldDays) &&
      Number.isFinite(newDays)
    ) {
      const dayDelta = Math.floor(newDays) - Math.floor(oldDays);
      if (dayDelta > 0) deltaHours = dayDelta * 24;
    }
  }
  if (deltaHours === null) {
    const oldTimeStr = _.get(old_variables, 'stat_data.世界.时间', '');
    const newTimeStr = _.get(new_variables, 'stat_data.世界.时间', '');
    if (oldTimeStr !== newTimeStr) {
      console.log(`[时间逻辑] 无法计算世界时间差(diffWorldHours=null) ${safeStringify({ oldWorld, newWorld })}`);
    } else if (debug.dateLogic) {
      console.log(`[时间逻辑] diffWorldHours=null（时间未变化）${safeStringify({ oldWorld, newWorld })}`);
    }
  } else if (debug.dateLogic) {
    console.log(`[时间逻辑] 世界时间差(diffWorldHours)=${deltaHours.toFixed(2)}小时`);
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
    applyAutoStageFromThoughtUpdateIfNeeded(key, oldRole, val as any, debug);
    applyDeathFromNegativeImprintIfNeeded(key, key, val as any, stat_data, debug);
    applyOffstageRoleHealthIfNeeded(key, key, oldRole, val as any, stat_data, deltaHours, scope, rules, debug);
    applyDeathFromZeroHealthIfNeeded(key, key, val as any, stat_data, debug);
    applyDerivedHealthStatus(key, val as any, stat_data);
    applyDerivedRelationStage(key, oldRole, val as any, stat_data);
  }

  const tempNpc = _.get(stat_data, '临时NPC', {});
  if (tempNpc && typeof tempNpc === 'object') {
    for (const [name, val] of Object.entries(tempNpc)) {
      if (typeof name !== 'string' || !name) continue;
      if (!isRoleLike(val)) continue;

      const oldRole = _.get(old_stat_data, `临时NPC.${name}`, null) as any as RoleLike | null;
      applyAutoStageFromThoughtUpdateIfNeeded(name, oldRole, val as any, debug);
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
      applyDeathFromZeroHealthIfNeeded(`临时NPC.${name}`, name, val as any, stat_data, debug);
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
}

$(async () => {
  ensureDebugButtons();
  await waitGlobalInitialized('Mvu');
  // 防止“脚本-实时修改/重载”导致重复监听：以顶层 window 为准，仅让最新实例生效。
  markThisInstanceActive();

  const baseDebug = resolveEdenDebugSetting();
  notifyEdenHelperLoaded();
  edenLog(
    'info',
    'boot',
    {
      zh: `伊甸后台数据辅助已启动 v${EDEN_HELPER_VERSION}（实例 ${EDEN_HELPER_INSTANCE_ID}）`,
      script: '伊甸后台数据辅助',
      version: EDEN_HELPER_VERSION,
      instanceId: EDEN_HELPER_INSTANCE_ID,
    },
    baseDebug,
  );

  // MVU 更新变量时可能会“就地修改”对象，导致 VARIABLE_UPDATE_ENDED 的
  // variables_before_update 与 variables 共享引用，进而让“本轮是否写入字段”的判定失真。
  // 因此在 UPDATE_STARTED 时抓取一份深拷贝快照，供本轮 UPDATE_ENDED 使用。
  let variablesBeforeUpdateSnapshot: any | null = null;
  eventMakeFirst(Mvu.events.VARIABLE_UPDATE_STARTED, (variables: any) => {
    if (!isActiveInstance()) return;
    try {
      variablesBeforeUpdateSnapshot = _.cloneDeep(variables);
    } catch {
      // best-effort: 保底不要影响后续逻辑
      variablesBeforeUpdateSnapshot = variables;
    }
  });

  const first = (new_variables: any, old_variables: any) => {
    if (!isActiveInstance()) return;
    const debugSetting = resolveEdenDebugSetting();
    edenLog('debug', 'mvu.update_ended.first.begin', {}, debugSetting);

    try {
      const stat_data = _.get(new_variables, 'stat_data', {}) ?? {};
      const old_vars = variablesBeforeUpdateSnapshot ?? old_variables;
      const old_stat_data = _.get(old_vars, 'stat_data', {}) ?? {};

      // 若同名角色同时存在于顶层与临时NPC，自动合并并移除临时NPC
      mergeTempNpcIntoCore(stat_data, debugSetting);

      // 出场状态清洗：尽早处理，避免后续房间逻辑等改动干扰“AI本次是否写入字段”的判定
      sanitizeForgottenOnstageRoles(stat_data, old_stat_data, debugSetting);
      sanitizeForgottenOffstageRoles(stat_data, old_stat_data, debugSetting);

      const roomDebug = readRoomDebugFlagFromChat();
      if (roomDebug) edenLog('debug', 'room_logic.begin', {}, debugSetting);
      applyRoomConsistency(stat_data, old_stat_data, roomDebug);
      if (roomDebug) edenLog('debug', 'room_logic.end', {}, debugSetting);

      const debug = readDebugFlagsFromChat();
      patchDateOnMidnightCrossIfNeeded(new_variables, old_vars, debug);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      edenLog('error', 'mvu.update_ended.first.error', { reason }, debugSetting);
    } finally {
      edenLog('debug', 'mvu.update_ended.first.end', {}, debugSetting);
    }
  };

  const last = (new_variables: any, old_variables: any) => {
    if (!isActiveInstance()) return;
    const debugSetting = resolveEdenDebugSetting();
    edenLog('debug', 'mvu.update_ended.last.begin', {}, debugSetting);

    try {
      const old_vars = variablesBeforeUpdateSnapshot ?? old_variables;
      const stat_data = _.get(new_variables, 'stat_data', {}) ?? {};

      // 日更 roll / 升级结算：从 UI 剥离后由脚本统一处理（含手动校准触发）
      applyShelterDailyRollIfNeeded(new_variables, old_vars, debugSetting);
      const shelterLevel = clampLevel(_.get(stat_data, ['庇护所', '庇护所等级'], 1));

      const currentScope = readShelterScopeFromChat();
      const rawDelta = _.get(stat_data, ['庇护所', '庇护范围变更'], null);
      const delta = normalizeScopeDelta(rawDelta);

      edenLog(
        'debug',
        'shelter_scope.input',
        {
          shelterLevel,
          hasDelta: !!delta,
          deltaNote: delta?.note ?? '',
          add: delta?.add ?? null,
          remove: delta?.remove ?? null,
        },
        debugSetting,
      );

      const nextScope = delta ? applyScopeDelta(currentScope, delta, shelterLevel) : currentScope;
      if (delta) {
        writeShelterScopeToChat(nextScope);
        edenLog('info', 'shelter_scope.applied', { scope: nextScope }, debugSetting);
      }

      _.set(stat_data, ['庇护所', '当前生存庇护范围'], nextScope);

      // 清空触发器（保留字段本身），避免重复执行；并保证 AI 后续可继续 replace 该路径。
      if (delta) _.set(stat_data, ['庇护所', '庇护范围变更'], {});

      applyOffstageBundle(new_variables, old_vars, nextScope);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      edenLog('error', 'mvu.update_ended.last.error', { reason }, debugSetting);
    } finally {
      edenLog('debug', 'mvu.update_ended.last.end', {}, debugSetting);
      variablesBeforeUpdateSnapshot = null;
    }
  };

  eventMakeFirst(Mvu.events.VARIABLE_UPDATE_ENDED, first);
  eventMakeLast(Mvu.events.VARIABLE_UPDATE_ENDED, last);
});

import { floorRoomCapacity, normalizeScope, ShelterScopeByFloor } from '../../util/shelter_scope';
import { CHAT_VAR_KEYS } from '../../界面/outbound';

type ScopeDelta = {
  add?: ShelterScopeByFloor;
  remove?: ShelterScopeByFloor;
  note?: string;
};

function readScopeFromChat(): ShelterScopeByFloor {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_SHELTER_SCOPE, {});
  if (!raw || typeof raw !== 'object') return {};
  return normalizeScope(raw as any);
}

function writeScopeToChat(scope: ShelterScopeByFloor) {
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

function normalizeDelta(raw: any): ScopeDelta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const addRaw = (raw as any).add ?? null;
  const removeRaw = (raw as any).remove ?? null;

  const add: ShelterScopeByFloor = {};
  const remove: ShelterScopeByFloor = {};

  // 兼容：如果 AI 直接写了 { "20": [...], "19": [...] }，视为 add
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

function applyDeltaToScope(current: ShelterScopeByFloor, delta: ScopeDelta, level: number): ShelterScopeByFloor {
  const base = normalizeScope(current);
  const next: ShelterScopeByFloor = { ...base };

  for (const floor of ['20', '19'] as const) {
    const cap = floorRoomCapacity(level, floor);
    const cur = Array.isArray(next[floor]) ? next[floor].slice() : [];
    const set = new Set<string>(cur);

    for (const room of toRoomList(delta.remove?.[floor])) set.delete(room);

    // 不解锁时忽略 add，但 remove 仍允许清理旧值
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

$(async () => {
  await waitGlobalInitialized('Mvu');

  const listener = (new_variables: any) => {
    const stat_data = _.get(new_variables, 'stat_data', {}) ?? {};
    const rawDelta = _.get(stat_data, ['庇护所', '庇护范围变更'], null);
    const delta = normalizeDelta(rawDelta);
    if (!delta) return;

    const level = clampLevel(_.get(stat_data, ['庇护所', '庇护所等级'], 1));
    const currentScope = readScopeFromChat();
    const nextScope = applyDeltaToScope(currentScope, delta, level);

    writeScopeToChat(nextScope);

    // 回写镜像：让 AI 能在 stat_data 里读到“最终生效”的庇护范围
    _.set(stat_data, ['庇护所', '当前生存庇护范围'], nextScope);

    // 清空触发器（保留字段本身），避免下次 VARIABLE_UPDATE_ENDED 重复执行；
    // 同时保证 AI 后续可继续使用 `replace /stat_data/庇护所/庇护范围变更`（不需要 insert）。
    _.set(stat_data, ['庇护所', '庇护范围变更'], {});
  };

  // 放在末尾执行：确保读取到的是“脚本纠偏后”的最终 stat_data（如房间一致性等）
  eventMakeLast(Mvu.events.VARIABLE_UPDATE_ENDED, listener);
});

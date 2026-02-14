import _ from 'lodash';
import { DEFAULT_SELECTED_ROLE_NAMES, ROLE_ALIAS_MAP, ROLE_CATALOG_NAME_SET } from './roleCatalog';

export const CHAT_VAR_KEYS_ROLE = {
  ROOT: 'eden.role_selector',
  INITIALIZED: 'eden.role_selector.initialized',
  VERSION: 'eden.role_selector.version',
  SELECTED: 'eden.role_selector.selected_roles',
  REVEALED: 'eden.role_selector.revealed_roles',
  DELETED: 'eden.role_selector.deleted_roles',
  INIT_MESSAGE_ID: 'eden.role_selector.initialized_at_message_id',
  PENDING_UNLOCK: 'eden.role_selector.pending_unlock',
} as const;

export const STAT_DATA_ROLE_SELECTOR_PATH = '主线任务.$meta.角色控制';

export const ROLE_SELECTOR_VERSION = 1;

export type RoleSelectorState = {
  version: number;
  initialized: boolean;
  selected_roles: string[];
  revealed_roles: string[];
  deleted_roles: string[];
  initialized_at_message_id: number;
  pending_unlock: string[];
};

function normalizeName(raw: any): string {
  const key = String(raw ?? '').trim();
  if (!key) return '';
  return ROLE_ALIAS_MAP[key] ?? key;
}

function dedupeAndFilterRoles(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return _(input)
    .map(normalizeName)
    .filter((name: string) => !!name)
    .uniq()
    .value();
}

export function normalizeRoleSelectorState(raw: any): RoleSelectorState {
  const selected = dedupeAndFilterRoles(_.get(raw, 'selected_roles', []));
  const revealedBase = dedupeAndFilterRoles(_.get(raw, 'revealed_roles', []));
  const deleted = dedupeAndFilterRoles(_.get(raw, 'deleted_roles', []));
  const deletedSet = new Set(deleted);
  const revealed = _.uniq([...selected, ...revealedBase]).filter(name => !deletedSet.has(name));
  const selectedFiltered = selected.filter(name => !deletedSet.has(name));
  const pending_unlock = dedupeAndFilterRoles(_.get(raw, 'pending_unlock', []));
  const pendingFiltered = pending_unlock.filter(name => !deletedSet.has(name));

  const initialized = _.get(raw, 'initialized', false) === true;
  const versionRaw = Number(_.get(raw, 'version', ROLE_SELECTOR_VERSION));
  const version = Number.isFinite(versionRaw) ? Math.max(1, Math.floor(versionRaw)) : ROLE_SELECTOR_VERSION;
  const initializedAtRaw = Number(_.get(raw, 'initialized_at_message_id', 0));
  const initialized_at_message_id = Number.isFinite(initializedAtRaw) ? Math.max(0, Math.floor(initializedAtRaw)) : 0;

  return {
    version,
    initialized,
    selected_roles: selectedFiltered,
    revealed_roles: revealed,
    deleted_roles: deleted,
    initialized_at_message_id,
    pending_unlock: pendingFiltered,
  };
}

export function createDefaultRoleSelectorState(): RoleSelectorState {
  const selected = dedupeAndFilterRoles(DEFAULT_SELECTED_ROLE_NAMES);
  return {
    version: ROLE_SELECTOR_VERSION,
    initialized: false,
    selected_roles: selected,
    revealed_roles: selected.slice(),
    deleted_roles: [],
    initialized_at_message_id: 0,
    pending_unlock: [],
  };
}

export function readRoleSelectorStateFromChatVars(vars: any): RoleSelectorState {
  const root = _.get(vars ?? {}, CHAT_VAR_KEYS_ROLE.ROOT, {});
  const base = root && typeof root === 'object' ? root : {};
  const normalized = normalizeRoleSelectorState(base);

  if (!normalized.initialized && normalized.selected_roles.length === 0 && normalized.revealed_roles.length === 0) {
    const defaults = createDefaultRoleSelectorState();
    return {
      ...normalized,
      selected_roles: defaults.selected_roles,
      revealed_roles: defaults.revealed_roles,
    };
  }

  return normalized;
}

export function readRoleSelectorStateFromStatData(statData: any): RoleSelectorState {
  const raw = _.get(statData ?? {}, STAT_DATA_ROLE_SELECTOR_PATH, {});
  const normalized = normalizeRoleSelectorState(raw);

  if (!normalized.initialized && normalized.selected_roles.length === 0 && normalized.revealed_roles.length === 0) {
    const defaults = createDefaultRoleSelectorState();
    return {
      ...normalized,
      selected_roles: defaults.selected_roles,
      revealed_roles: defaults.revealed_roles,
    };
  }

  return normalized;
}

export function writeRoleSelectorStateToStatData(statData: any, state: RoleSelectorState) {
  _.set(statData, STAT_DATA_ROLE_SELECTOR_PATH, toRoleSelectorRaw(state));
}

export function isRoleEnabledBySelectorState(state: RoleSelectorState | null | undefined, roleName: string): boolean {
  const name = normalizeName(roleName);
  if (!name) return false;
  const s = normalizeRoleSelectorState(state ?? createDefaultRoleSelectorState());
  if (s.deleted_roles.includes(name)) return false;

  // 非目录角色保留兼容：避免误伤剧情中临时生成/迁移出的角色。
  if (!ROLE_CATALOG_NAME_SET.has(name)) return true;

  // 初始化后进入严格模式：只有明确勾选(selected)的目录角色才算启用。
  if (s.initialized === true) return s.selected_roles.includes(name);

  // 兼容旧存档：未初始化时，允许 revealed 作为回退。
  return s.selected_roles.includes(name) || s.revealed_roles.includes(name);
}

export function isRoleEnabledByChatVars(vars: any, roleName: string): boolean {
  const state = readRoleSelectorStateFromChatVars(vars);
  return isRoleEnabledBySelectorState(state, roleName);
}

export function applyPendingUnlocks(state: RoleSelectorState): RoleSelectorState {
  if (!state.pending_unlock.length) return state;
  const deleted = new Set(state.deleted_roles ?? []);
  const pending = state.pending_unlock.filter(name => !deleted.has(name));
  if (!pending.length) {
    return {
      ...state,
      pending_unlock: [],
    };
  }
  return {
    ...state,
    revealed_roles: _.uniq([...state.revealed_roles, ...pending]),
    pending_unlock: [],
  };
}

export function toRoleSelectorRaw(state: RoleSelectorState): RoleSelectorState {
  return normalizeRoleSelectorState(state);
}

import _ from 'lodash';
import { ROLE_ALIAS_MAP, ROLE_CATALOG, RoleCatalogItem } from '../../roleCatalog';
import {
  CHAT_VAR_KEYS_ROLE,
  createDefaultRoleSelectorState,
  normalizeRoleSelectorState,
  readRoleSelectorStateFromChatVars,
} from '../../role_control';

type RoleSelectorStateLike = ReturnType<typeof createDefaultRoleSelectorState>;

const SCRIPT_NAME = '开局角色选择器';
const ROOT_ATTR = 'data-eden-role-selector-root';
const STYLE_ATTR = 'data-eden-role-selector-style';
const BTN_OPEN = '角色批量删除';
const BTN_RESET = '清空删除标记';
const BTN_TOGGLE_DOSSIER_DEBUG = '切换档案注入调试';
const BTN_CREATE_ROLE = '创建角色';
const BTN_REFRESH_LIST = '刷新名单';
const ROLE_CREATOR_OPEN_EVENT = 'eden.role_creator.open';
const ROLE_SELECTOR_OPEN_EVENT = 'eden.role_selector.open';
const ROLE_SELECTOR_UPDATED_EVENT = 'eden.role_selector.updated';
const DOSSIER_INJECT_DEBUG_KEY = 'debug.角色档案动态注入';
const DEFAULT_WORLDBOOK_NAME_CANDIDATES = [
  '末世寒冬-星穹秩序2.0',
  '寒冬末日-星穹秩序',
  '末世寒冬 - 星穹秩序',
  '末世寒冬-星穹秩序',
] as const;

const RESERVED_KEYS = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);

function normalizeRoleNameLoose(raw: any): string {
  return String(raw ?? '')
    .trim()
    .replace(/[?？·•‧∙]/g, '・');
}

const ROLE_ALIAS_MAP_NORMALIZED = (() => {
  const map = new Map<string, string>();
  for (const [alias, canonical] of Object.entries(ROLE_ALIAS_MAP)) {
    const normalizedAlias = normalizeRoleNameLoose(alias);
    const normalizedCanonical = normalizeRoleNameLoose(canonical);
    if (!normalizedAlias || !normalizedCanonical) continue;
    map.set(normalizedAlias, normalizedCanonical);
  }
  return map;
})();

function canonicalizeRoleName(raw: any): string {
  const normalized = normalizeRoleNameLoose(raw);
  if (!normalized) return '';
  return ROLE_ALIAS_MAP_NORMALIZED.get(normalized) ?? normalized;
}

function getChatVars(): any {
  try {
    return getVariables({ type: 'chat' }) ?? {};
  } catch {
    return {};
  }
}

function readDossierInjectDebugFlag(): boolean {
  const vars = getChatVars();
  return _.get(vars, DOSSIER_INJECT_DEBUG_KEY, false) === true || _.get(vars, '角色档案动态注入调试', false) === true;
}

function saveDossierInjectDebugFlag(value: boolean) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    vars => {
      _.set(vars, DOSSIER_INJECT_DEBUG_KEY, value === true);
      _.set(vars, '角色档案动态注入调试', value === true);
      return vars;
    },
    { type: 'chat' },
  );
}

function saveRoleSelectorStateToChat(state: RoleSelectorStateLike) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    vars => {
      _.set(vars, CHAT_VAR_KEYS_ROLE.ROOT, normalizeRoleSelectorState(state));
      return vars;
    },
    { type: 'chat' },
  );
}

function getCurrentMessageIdSafe(): number {
  try {
    const id = Number(getCurrentMessageId());
    if (Number.isFinite(id) && id >= 0) return id;
  } catch {
    // ignore
  }
  return 0;
}

type DossierIndexItem = {
  name: string;
  aliases?: string[];
  identity?: string;
  summary?: string;
  location?: string;
  defaultSelected?: boolean;
};

type RoleSelectorYamlApi = {
  parse: (input: string) => any;
  stringify: (input: any) => string;
};

function parseDossierIndex(text: string): DossierIndexItem[] {
  try {
    const data = JSON.parse(String(text ?? ''));
    if (!Array.isArray(data)) return [];
    const out: DossierIndexItem[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const name = String((row as any).name ?? '').trim();
      if (!name) continue;
      const aliases = Array.isArray((row as any).aliases) ? (row as any).aliases : [];
      out.push({
        name,
        aliases: aliases.map((v: any) => String(v ?? '').trim()).filter(Boolean),
        identity: typeof (row as any).identity === 'string' ? String((row as any).identity).trim() : undefined,
        summary: typeof (row as any).summary === 'string' ? String((row as any).summary).trim() : undefined,
        location: typeof (row as any).location === 'string' ? String((row as any).location).trim() : undefined,
        defaultSelected: (row as any).defaultSelected === true,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function buildDossierIndexText(list: DossierIndexItem[]): string {
  return JSON.stringify(list, null, 2);
}

function normalizeRoleListCanonical(list: any): string[] {
  if (!Array.isArray(list)) return [];
  return _.uniq(
    list
      .map(name => canonicalizeRoleName(name))
      .filter(Boolean),
  );
}

function readDeletedRoleSet(state: RoleSelectorStateLike | null | undefined): Set<string> {
  const list = normalizeRoleListCanonical((state as any)?.deleted_roles ?? []);
  return new Set(list);
}

function getYamlApi(): RoleSelectorYamlApi | null {
  const yaml = (window as any)?.YAML;
  if (!yaml || typeof yaml.parse !== 'function' || typeof yaml.stringify !== 'function') return null;
  return yaml as RoleSelectorYamlApi;
}

function pruneNameFromInitvarRooms(root: any, canonicalName: string) {
  if (!root || typeof root !== 'object') return;
  const rooms = _.get(root, '房间', null);
  if (!rooms || typeof rooms !== 'object') return;

  const shouldKeep = (x: any) => canonicalizeRoleName(x) !== canonicalName;
  const prunePath = (path: string) => {
    const list = _.get(rooms, path, null);
    if (!Array.isArray(list)) return;
    _.set(rooms, path, list.filter(shouldKeep));
  };

  const fixedPaths = [
    '玄关.净化隔离区入住者',
    '玄关.临时客房A入住者',
    '玄关.临时客房B入住者',
    '玄关.临时客房C入住者',
    '玄关.临时客房D入住者',
    '玄关.临时客房E入住者',
    '核心区.客厅使用者',
    '核心区.餐厅厨房使用者',
    '核心区.主卧室使用者',
    '核心区.次卧使用者',
    '核心区.小影院舞台使用者',
    '核心区.会议室使用者',
    '核心区.书房使用者',
    '核心区.主浴室使用者',
  ];
  for (const p of fixedPaths) prunePath(p);

  const floorBases = ['楼层房间.楼层20房间', '楼层房间.楼层19房间'];
  for (const base of floorBases) {
    const record = _.get(rooms, base, null);
    if (!record || typeof record !== 'object') continue;
    for (const roomNo of Object.keys(record)) {
      prunePath(`${base}.${roomNo}.入住者`);
    }
  }
}

async function pruneDossierIndexByRemovedRoles(worldbookName: string, removedSet: Set<string>) {
  if (!removedSet.size || typeof updateWorldbookWith !== 'function') return;
  await updateWorldbookWith(
    worldbookName,
    worldbook => {
      const idx = worldbook.findIndex(entry => String(entry?.name ?? '').trim() === '角色档案索引');
      if (idx === -1) return worldbook;
      const entry = worldbook[idx];
      const list = parseDossierIndex(String(entry?.content ?? ''));
      const next = list.filter(item => !removedSet.has(canonicalizeRoleName(item.name)));
      if (_.isEqual(next, list)) return worldbook;
      worldbook[idx] = { ...entry, content: buildDossierIndexText(next) };
      return worldbook;
    },
    { render: 'immediate' },
  );
}

async function pruneInitvarByRemovedRoles(worldbookName: string, removedSet: Set<string>) {
  if (!removedSet.size || typeof updateWorldbookWith !== 'function') return;
  const yaml = getYamlApi();
  if (!yaml) {
    throw new Error('YAML 解析器不可用，无法同步裁剪 initvar');
  }

  await updateWorldbookWith(
    worldbookName,
    worldbook => {
      const idx = worldbook.findIndex(entry => {
        const name = String(entry?.name ?? '').trim();
        return name === '[initvar]变量初始化勿开' || name === '[initvar]变量初始化';
      });
      if (idx === -1) return worldbook;

      const entry = worldbook[idx];
      const raw = String(entry?.content ?? '');
      if (!raw.trim()) return worldbook;

      let data: any = null;
      try {
        data = yaml.parse(raw);
      } catch {
        return worldbook;
      }
      if (!data || typeof data !== 'object') return worldbook;

      for (const roleName of Array.from(removedSet)) {
        for (const key of Object.keys(data)) {
          if (canonicalizeRoleName(key) !== roleName) continue;
          delete data[key];
        }
        const tempNpc = _.get(data, '临时NPC', null);
        if (tempNpc && typeof tempNpc === 'object') {
          for (const key of Object.keys(tempNpc)) {
            if (canonicalizeRoleName(key) !== roleName) continue;
            delete tempNpc[key];
          }
        }
        pruneNameFromInitvarRooms(data, roleName);
      }

      // 同步裁剪 initvar 中的角色控制，避免重开聊天时复活已删角色。
      const roleControlPath = ['主线任务', '$meta', '角色控制'];
      const roleControl = _.get(data, roleControlPath, null);
      if (roleControl && typeof roleControl === 'object') {
        const trimList = (list: any) =>
          normalizeRoleListCanonical(list).filter(name => !removedSet.has(name));
        _.set(roleControl, 'selected_roles', trimList(_.get(roleControl, 'selected_roles', [])));
        _.set(roleControl, 'revealed_roles', trimList(_.get(roleControl, 'revealed_roles', [])));
        _.set(roleControl, 'pending_unlock', trimList(_.get(roleControl, 'pending_unlock', [])));
        _.set(
          roleControl,
          'deleted_roles',
          _.uniq([...normalizeRoleListCanonical(_.get(roleControl, 'deleted_roles', [])), ...Array.from(removedSet)]),
        );
      }

      let next = '';
      try {
        next = yaml.stringify(data);
      } catch {
        return worldbook;
      }
      if (!next.trim()) return worldbook;
      worldbook[idx] = { ...entry, content: next };
      return worldbook;
    },
    { render: 'immediate' },
  );
}

async function resolveDefaultWorldbookName(): Promise<string | null> {
  try {
    const originalNames = typeof getWorldbookNames === 'function' ? getWorldbookNames() : [];
    const names = originalNames.map(name => name.replace(/\s+/g, ''));
    for (const candidate of DEFAULT_WORLDBOOK_NAME_CANDIDATES) {
      const idx = names.indexOf(candidate.replace(/\s+/g, ''));
      if (idx !== -1) return originalNames[idx] ?? candidate;
    }

    try {
      if (typeof getCharWorldbookNames === 'function') {
        const charWb = getCharWorldbookNames('current');
        if (charWb?.primary) return charWb.primary;
      }
    } catch {
      // ignore
    }

    return originalNames[0] ?? null;
  } catch {
    return null;
  }
}

async function loadCatalogFromWorldbookIndex(): Promise<RoleCatalogItem[]> {
  if (typeof getWorldbook !== 'function') return [];
  const worldbookName = await resolveDefaultWorldbookName();
  if (!worldbookName) return [];
  try {
    const worldbook = await getWorldbook(worldbookName);
    const entry = worldbook.find(item => String(item?.name ?? '').trim() === '角色档案索引');
    const list = parseDossierIndex(String(entry?.content ?? ''));
    return list.map(item => ({
      name: item.name,
      identity: item.identity ?? '自定义角色',
      summary: item.summary ?? '',
      location: item.location ?? '',
      aliases: item.aliases ?? [],
      defaultSelected: item.defaultSelected,
    }));
  } catch {
    return [];
  }
}

function normalizeCatalogItem(item: RoleCatalogItem): RoleCatalogItem {
  return {
    ...item,
    identity: item.identity || '自定义角色',
    summary: item.summary || '',
    location: item.location || '',
    aliases: item.aliases ?? [],
  };
}

function mergeRoleCatalog(
  base: RoleCatalogItem[],
  extra: RoleCatalogItem[],
  selected: string[],
  deletedSet: Set<string>,
): RoleCatalogItem[] {
  const map = new Map<string, RoleCatalogItem>();
  const findExistingKeyByCanonical = (canonicalName: string): string | undefined =>
    Array.from(map.keys()).find(key => canonicalizeRoleName(key) === canonicalName);
  for (const item of base) {
    const canonicalName = canonicalizeRoleName(item.name);
    if (!canonicalName || deletedSet.has(canonicalName)) continue;
    map.set(item.name, normalizeCatalogItem(item));
  }

  for (const item of extra) {
    const canonicalName = canonicalizeRoleName(item.name);
    if (!canonicalName || deletedSet.has(canonicalName)) continue;
    const normalized = normalizeCatalogItem(item);
    const existingKey = findExistingKeyByCanonical(canonicalName);
    if (!existingKey) {
      map.set(normalized.name, normalized);
      continue;
    }
    const cur = map.get(existingKey)!;
    map.set(existingKey, {
      ...cur,
      ...normalized,
      identity: normalized.identity || cur.identity,
      summary: normalized.summary || cur.summary,
      location: normalized.location || cur.location,
      aliases: _.uniq([...(cur.aliases ?? []), ...(normalized.aliases ?? [])]),
    });
  }

  for (const name of selected) {
    const roleName = String(name ?? '').trim();
    const canonicalName = canonicalizeRoleName(roleName);
    if (!canonicalName || deletedSet.has(canonicalName) || findExistingKeyByCanonical(canonicalName)) continue;
    map.set(roleName, normalizeCatalogItem({ name: roleName, identity: '自定义角色', summary: '', location: '' }));
  }

  const baseNames = new Set(base.map(item => item.name));
  const extras = Array.from(map.values())
    .filter(item => !baseNames.has(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'));

  const merged = base
    .map(item => map.get(item.name))
    .filter((item): item is RoleCatalogItem => !!item)
    .concat(extras);

  return merged.filter(item => !deletedSet.has(canonicalizeRoleName(item.name)));
}

function isRoleLike(val: any): boolean {
  return !!(val && typeof val === 'object' && !Array.isArray(val) && '登场状态' in val && '健康' in val);
}

function removeNameFromRooms(stat_data: any, name: string) {
  const normalizedName = canonicalizeRoleName(name);
  if (!normalizedName) return;

  const shouldKeep = (x: any) => canonicalizeRoleName(x) !== normalizedName;

  const paths = [
    ['房间', '玄关', '净化隔离区入住者'],
    ['房间', '玄关', '临时客房A入住者'],
    ['房间', '玄关', '临时客房B入住者'],
    ['房间', '核心区', '客厅使用者'],
    ['房间', '核心区', '餐厅厨房使用者'],
    ['房间', '核心区', '主卧室使用者'],
    ['房间', '核心区', '主浴室使用者'],
  ];

  for (const path of paths) {
    const list = _.get(stat_data, path, []);
    if (Array.isArray(list)) _.set(stat_data, path, list.filter(shouldKeep));
  }

  const floor20 = _.get(stat_data, ['房间', '楼层房间', '楼层20房间'], {});
  if (floor20 && typeof floor20 === 'object') {
    for (const room of Object.keys(floor20)) {
      const list = _.get(stat_data, ['房间', '楼层房间', '楼层20房间', room, '入住者'], []);
      if (Array.isArray(list)) {
        _.set(stat_data, ['房间', '楼层房间', '楼层20房间', room, '入住者'], list.filter(shouldKeep));
      }
    }
  }

  const floor19 = _.get(stat_data, ['房间', '楼层房间', '楼层19房间'], {});
  if (floor19 && typeof floor19 === 'object') {
    for (const room of Object.keys(floor19)) {
      const list = _.get(stat_data, ['房间', '楼层房间', '楼层19房间', room, '入住者'], []);
      if (Array.isArray(list)) {
        _.set(stat_data, ['房间', '楼层房间', '楼层19房间', room, '入住者'], list.filter(shouldKeep));
      }
    }
  }
}

function applySelectionToStatData(stat_data: any, enabledSet: Set<string>): Set<string> {
  if (!stat_data || typeof stat_data !== 'object') return new Set<string>();

  const enabledCanonicalSet = new Set(
    Array.from(enabledSet)
      .map(name => canonicalizeRoleName(name))
      .filter(Boolean),
  );
  const removedCanonicalSet = new Set<string>();

  for (const [key, val] of Object.entries(stat_data)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (!isRoleLike(val)) continue;
    const canonical = canonicalizeRoleName(key);
    if (!canonical || enabledCanonicalSet.has(canonical)) continue;
    removedCanonicalSet.add(canonical);
    _.unset(stat_data, [key]);
    removeNameFromRooms(stat_data, key);
  }

  const tempNpc = _.get(stat_data, '临时NPC', {});
  if (tempNpc && typeof tempNpc === 'object') {
    for (const [name, role] of Object.entries(tempNpc)) {
      if (!isRoleLike(role)) continue;
      const canonical = canonicalizeRoleName(name);
      if (!canonical || enabledCanonicalSet.has(canonical)) continue;
      removedCanonicalSet.add(canonical);
      _.unset(stat_data, ['临时NPC', name]);
      removeNameFromRooms(stat_data, name);
    }
  }

  return removedCanonicalSet;
}

async function replaceLatestStatData(mutator: (stat_data: any) => void) {
  try {
    const latest = Mvu.getMvuData({ type: 'message', message_id: 'latest' as any });
    const next = _.cloneDeep(latest ?? {});
    const stat_data = _.get(next, 'stat_data', {});
    mutator(stat_data);
    _.set(next, 'stat_data', stat_data);
    await Mvu.replaceMvuData(next as any, { type: 'message', message_id: 'latest' as any });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    toastr.warning(`角色选择变量写入失败：${reason}`);
  }
}

async function notifyRoleSelectorUpdated() {
  try {
    if (typeof eventEmit === 'function') {
      await eventEmit(ROLE_SELECTOR_UPDATED_EVENT as any);
    }
  } catch {
    // ignore
  }

  try {
    if (typeof setChatMessages === 'function' && typeof getLastMessageId === 'function') {
      const message_id = Number(getLastMessageId());
      if (Number.isFinite(message_id) && message_id >= 0) {
        await setChatMessages([{ message_id }], { refresh: 'affected' });
      }
    }
  } catch {
    // ignore
  }
}

function ensureCss() {
  if ($(`head style[${STYLE_ATTR}]`).length > 0) return;
  const css = `
  [${ROOT_ATTR}] { position: fixed; inset: 0; z-index: 999999; display: flex; justify-content: center; align-items: center; background: rgba(2,10,20,.72); padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); box-sizing: border-box; }
  [${ROOT_ATTR}] .eden-rs-modal { width: min(96vw, 760px); max-height: calc(100dvh - 16px); overflow: hidden; display: flex; flex-direction: column; border-radius: 16px; border: 1px solid #1a7fc5; background: linear-gradient(180deg,#031727,#041226); color: #d8f1ff; box-shadow: 0 16px 40px rgba(0,0,0,.45); }
  [${ROOT_ATTR}] .eden-rs-head { padding: 14px 16px; border-bottom: 1px solid rgba(80,180,255,.25); font-size: 18px; font-weight: 700; }
  [${ROOT_ATTR}] .eden-rs-desc { padding: 10px 16px 0; font-size: 13px; color: #a7d8f8; }
  [${ROOT_ATTR}] .eden-rs-tools { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px 16px 0; align-items: center; }
  [${ROOT_ATTR}] .eden-rs-search { min-height: 38px; border: 1px solid rgba(80,180,255,.35); border-radius: 10px; background: rgba(8,24,46,.72); color: #eaf8ff; padding: 0 11px; outline: none; width: 100%; box-sizing: border-box; }
  [${ROOT_ATTR}] .eden-rs-search::placeholder { color: rgba(167,216,248,.7); }
  [${ROOT_ATTR}] .eden-rs-count-chip { white-space: nowrap; font-size: 12px; color: #a7d8f8; border: 1px solid rgba(80,180,255,.28); border-radius: 999px; padding: 4px 10px; background: rgba(8,24,46,.45); }
  [${ROOT_ATTR}] .eden-rs-list { padding: 12px 16px 16px; overflow: auto; display: grid; gap: 10px; -webkit-overflow-scrolling: touch; }
  [${ROOT_ATTR}] .eden-rs-item { border: 1px solid rgba(80,180,255,.3); border-radius: 12px; padding: 10px 12px; background: rgba(8,24,46,.6); }
  [${ROOT_ATTR}] .eden-rs-line { display: flex; align-items: flex-start; gap: 8px; }
  [${ROOT_ATTR}] .eden-rs-line input[type="checkbox"] { width: 20px; height: 20px; margin-top: 2px; accent-color: #4ab8ff; flex: 0 0 auto; }
  [${ROOT_ATTR}] .eden-rs-name { font-size: 16px; font-weight: 700; color: #f0fbff; line-height: 1.3; word-break: break-word; }
  [${ROOT_ATTR}] .eden-rs-identity { font-size: 12px; color: #9ccff3; line-height: 1.35; }
  [${ROOT_ATTR}] .eden-rs-summary { margin-top: 6px; font-size: 13px; line-height: 1.5; color: #c9e6fb; word-break: break-word; }
  [${ROOT_ATTR}] .eden-rs-loc { margin-top: 6px; font-size: 12px; color: #89c4ed; word-break: break-word; }
  [${ROOT_ATTR}] .eden-rs-foot { padding: 12px 16px 16px; border-top: 1px solid rgba(80,180,255,.25); display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; background: rgba(3, 17, 36, .95); }
  [${ROOT_ATTR}] .eden-rs-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  [${ROOT_ATTR}] .eden-rs-btn { border: 1px solid #2a91d6; border-radius: 10px; padding: 9px 12px; min-height: 38px; background: #0a2742; color: #e7f6ff; cursor: pointer; font-size: 13px; }
  [${ROOT_ATTR}] .eden-rs-btn.primary { background: #0b5a88; border-color: #47b8ff; }
  [${ROOT_ATTR}] .eden-rs-btn:disabled { opacity: .5; cursor: not-allowed; }
  [${ROOT_ATTR}] .eden-rs-count { font-size: 12px; color: #9dd2f6; }
  @media (max-width: 760px) {
    [${ROOT_ATTR}] { padding: 0; align-items: stretch; }
    [${ROOT_ATTR}] .eden-rs-modal { width: 100vw; max-height: 100dvh; border-radius: 0; }
    [${ROOT_ATTR}] .eden-rs-head { position: sticky; top: 0; z-index: 2; background: rgba(3, 23, 39, .98); }
    [${ROOT_ATTR}] .eden-rs-tools { grid-template-columns: 1fr; }
    [${ROOT_ATTR}] .eden-rs-foot { position: sticky; bottom: 0; z-index: 2; padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
    [${ROOT_ATTR}] .eden-rs-actions { width: 100%; }
    [${ROOT_ATTR}] .eden-rs-btn { flex: 1 1 calc(50% - 8px); }
  }
  `;
  $('<style></style>').attr(STYLE_ATTR, '1').text(css).appendTo('head');
}

function closeSelector() {
  $(`[${ROOT_ATTR}]`).remove();
}

function renderSelector(options: {
  state: RoleSelectorStateLike;
  catalog: RoleCatalogItem[];
  onConfirm: (selected: string[]) => Promise<void>;
  onRefresh?: () => void;
  onOpenCreator?: () => void;
}) {
  closeSelector();
  ensureCss();

  const catalog = options.catalog ?? [];
  const selectedSet = new Set(normalizeRoleListCanonical(options.state.selected_roles ?? []));
  const $root = $('<div></div>').attr(ROOT_ATTR, '1');
  const $modal = $('<div class="eden-rs-modal"></div>').appendTo($root);
  $('<div class="eden-rs-head">角色批量删除器</div>').appendTo($modal);
  $(
    '<div class="eden-rs-desc">请勾选“保留”的角色。未勾选角色将被永久删除（当前变量 / 角色档案索引 / initvar），并加入删除标记，不会再参与动态档案注入。</div>',
  ).appendTo($modal);
  const $tools = $('<div class="eden-rs-tools"></div>').appendTo($modal);
  const $search = $('<input class="eden-rs-search" type="search" placeholder="搜索角色 / 简介 / 位置…" />').appendTo($tools);
  const $visibleCount = $('<div class="eden-rs-count-chip"></div>').appendTo($tools);

  const $list = $('<div class="eden-rs-list"></div>').appendTo($modal);
  const updateCount = () => {
    $count.text(`已勾选 ${selectedSet.size} / ${catalog.length}`);
    const visible = $list.children(':visible').length;
    $visibleCount.text(`显示 ${visible} / ${catalog.length}`);
  };

  const applyFilter = () => {
    const q = String($search.val() ?? '')
      .trim()
      .toLowerCase();
    $list.children('.eden-rs-item').each((_, el) => {
      const $el = $(el);
      if (!q) {
        $el.show();
        return;
      }
      const haystack = String($el.attr('data-search') ?? '').toLowerCase();
      $el.toggle(haystack.includes(q));
    });
    updateCount();
  };

  for (const role of catalog) {
    const canonical = canonicalizeRoleName(role.name);
    const checked = canonical ? selectedSet.has(canonical) : false;
    const id = `eden-rs-${role.name}`;
    const identityText = role.identity?.trim() || '自定义角色';
    const summaryText = role.summary?.trim() || '（暂无简介）';
    const locationText = role.location?.trim() || '未设置位置';
    const searchText = [role.name, identityText, summaryText, locationText, ...(role.aliases ?? [])].join('\n');
    const $item = $('<label class="eden-rs-item"></label>').attr('data-search', searchText).appendTo($list);
    const $line = $('<div class="eden-rs-line"></div>').appendTo($item);
    const $check = $('<input type="checkbox" />').attr('id', id).prop('checked', checked).appendTo($line);
    $('<span class="eden-rs-name"></span>').text(role.name).appendTo($line);
    $('<span class="eden-rs-identity"></span>').text(identityText).appendTo($line);
    $('<div class="eden-rs-summary"></div>').text(summaryText).appendTo($item);
    $('<div class="eden-rs-loc"></div>').text(`所在位置：${locationText}`).appendTo($item);

    $check.on('change', () => {
      if (!canonical) return;
      if ($check.is(':checked')) selectedSet.add(canonical);
      else selectedSet.delete(canonical);
      updateCount();
    });
  }

  const $foot = $('<div class="eden-rs-foot"></div>').appendTo($modal);
  const $count = $('<div class="eden-rs-count"></div>').appendTo($foot);
  const $actions = $('<div class="eden-rs-actions"></div>').appendTo($foot);
  const $btnCreate = $(`<button class="eden-rs-btn" type="button">${BTN_CREATE_ROLE}</button>`).appendTo($actions);
  const $btnRefresh = $(`<button class="eden-rs-btn" type="button">${BTN_REFRESH_LIST}</button>`).appendTo($actions);
  const $btnAll = $('<button class="eden-rs-btn" type="button">全选</button>').appendTo($actions);
  const $btnNone = $('<button class="eden-rs-btn" type="button">清空</button>').appendTo($actions);
  const $btnCancel = $('<button class="eden-rs-btn" type="button">取消</button>').appendTo($actions);
  const $btnConfirm = $('<button class="eden-rs-btn primary" type="button">确认删除未勾选</button>').appendTo($actions);

  $btnCreate.on('click', () => {
    options.onOpenCreator?.();
  });

  $btnRefresh.on('click', () => {
    options.onRefresh?.();
  });

  $btnAll.on('click', () => {
    selectedSet.clear();
    catalog.forEach(role => {
      const canonical = canonicalizeRoleName(role.name);
      if (canonical) selectedSet.add(canonical);
    });
    $list.find('input[type="checkbox"]').prop('checked', true);
    updateCount();
  });

  $btnNone.on('click', () => {
    selectedSet.clear();
    $list.find('input[type="checkbox"]').prop('checked', false);
    updateCount();
  });

  $search.on('input', () => {
    applyFilter();
  });

  $btnCancel.on('click', () => {
    closeSelector();
  });

  $btnConfirm.on('click', async () => {
    const selected = Array.from(selectedSet.values());
    if (selected.length === 0 && !window.confirm('当前未勾选任何角色，将删除全部可见角色数据。确认继续吗？')) {
      return;
    }

    $btnConfirm.prop('disabled', true).text('处理中...');
    try {
      await options.onConfirm(selected);
      closeSelector();
    } finally {
      $btnConfirm.prop('disabled', false).text('确认删除未勾选');
    }
  });

  updateCount();
  applyFilter();
  $('body').append($root);
}

async function buildMergedCatalog(state: RoleSelectorStateLike): Promise<RoleCatalogItem[]> {
  const extra = await loadCatalogFromWorldbookIndex();
  const deletedSet = readDeletedRoleSet(state);
  return mergeRoleCatalog(ROLE_CATALOG, extra, state.selected_roles ?? [], deletedSet);
}

function openRoleCreatorFromSelector() {
  if (typeof eventEmit === 'function') {
    eventEmit(ROLE_CREATOR_OPEN_EVENT as any);
    toastr.info('已请求打开角色创建器，请在状态栏中填写并保存');
    return;
  }
  toastr.warning('未检测到角色创建器事件接口');
}

async function applyRoleSelection(selected: string[]) {
  const state = readRoleSelectorStateFromChatVars(getChatVars());
  const catalog = await buildMergedCatalog(state);
  const catalogCanonical = _.uniq(
    catalog
      .map(item => canonicalizeRoleName(item.name))
      .filter(Boolean),
  );
  const catalogCanonicalSet = new Set(catalogCanonical);
  const normalizedSelected = _(selected)
    .map(name => canonicalizeRoleName(name))
    .filter(name => catalogCanonicalSet.has(name))
    .filter(Boolean)
    .uniq()
    .value();
  const selectedSet = new Set(normalizedSelected);
  const removedFromSelectionSet = new Set(catalogCanonical.filter(name => !selectedSet.has(name)));
  const mergedDeleted = _.uniq([...(state.deleted_roles ?? []), ...Array.from(removedFromSelectionSet)]);
  const nextState = normalizeRoleSelectorState({
    ...state,
    version: state.version || 1,
    initialized: true,
    selected_roles: normalizedSelected,
    revealed_roles: normalizedSelected,
    deleted_roles: mergedDeleted,
    pending_unlock: (state.pending_unlock ?? []).filter(name => !removedFromSelectionSet.has(canonicalizeRoleName(name))),
    initialized_at_message_id: getCurrentMessageIdSafe(),
  });

  saveRoleSelectorStateToChat(nextState);

  let removedFromStatData = new Set<string>();
  await replaceLatestStatData(stat_data => {
    removedFromStatData = applySelectionToStatData(stat_data, selectedSet);
    _.set(stat_data, '主线任务.$meta.角色控制', nextState);
  });
  const removedSet = new Set([...Array.from(removedFromSelectionSet), ...Array.from(removedFromStatData)]);

  const worldbookName = await resolveDefaultWorldbookName();
  if (worldbookName) {
    try {
      await pruneDossierIndexByRemovedRoles(worldbookName, removedSet);
      await pruneInitvarByRemovedRoles(worldbookName, removedSet);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      toastr.warning(`世界书同步裁剪失败：${reason}`);
    }
  } else if (removedSet.size > 0) {
    toastr.warning('未找到世界书，已仅删除当前变量中的未勾选角色');
  }

  await notifyRoleSelectorUpdated();

  toastr.success(`角色删除已完成：保留 ${nextState.selected_roles.length} 位，删除 ${removedSet.size} 位`);
  reloadIframe();
}

async function openSelector() {
  const state = readRoleSelectorStateFromChatVars(getChatVars());
  const catalog = await buildMergedCatalog(state);
  renderSelector({
    state,
    catalog,
    onConfirm: applyRoleSelection,
    onRefresh: () => void openSelector(),
    onOpenCreator: openRoleCreatorFromSelector,
  });
}

async function resetSelectionToDefault() {
  const state = readRoleSelectorStateFromChatVars(getChatVars());
  const defaults = createDefaultRoleSelectorState();
  const nextState = normalizeRoleSelectorState({
    ...state,
    initialized: true,
    selected_roles: defaults.selected_roles,
    revealed_roles: defaults.revealed_roles,
    deleted_roles: [],
    pending_unlock: [],
    initialized_at_message_id: getCurrentMessageIdSafe(),
  });
  saveRoleSelectorStateToChat(nextState);

  await replaceLatestStatData(stat_data => {
    _.set(stat_data, '主线任务.$meta.角色控制', nextState);
  });
  await notifyRoleSelectorUpdated();

  toastr.success('已清空删除标记并恢复默认勾选（不会自动恢复已删除角色数据）');
  reloadIframe();
}

async function toggleDossierInjectDebug() {
  const next = !readDossierInjectDebugFlag();
  saveDossierInjectDebugFlag(next);

  await replaceLatestStatData(stat_data => {
    _.set(stat_data, '主线任务.$meta.调试.角色档案动态注入', next);
    _.set(stat_data, '主线任务.$meta.角色控制.debug_dossier_inject', next);
  });
  await notifyRoleSelectorUpdated();

  if (next) {
    toastr.success('已开启「角色档案动态注入调试」');
    toastr.info('调试信息将以 <角色档案_动态注入_调试> 输出到提示词');
  } else {
    toastr.info('已关闭「角色档案动态注入调试」');
  }
}

function ensureButtons() {
  if (typeof appendInexistentScriptButtons !== 'function') return;
  appendInexistentScriptButtons([
    { name: BTN_OPEN, visible: true },
    { name: BTN_RESET, visible: true },
    { name: BTN_TOGGLE_DOSSIER_DEBUG, visible: true },
  ]);
}

function bindButtons() {
  if (typeof getButtonEvent !== 'function') return;

  eventOn(getButtonEvent(BTN_OPEN), () => {
    void openSelector();
  });

  eventOn(getButtonEvent(BTN_RESET), () => {
    void resetSelectionToDefault();
  });

  eventOn(getButtonEvent(BTN_TOGGLE_DOSSIER_DEBUG), () => {
    void toggleDossierInjectDebug();
  });
}

function bindExternalEvents() {
  if (typeof eventOn !== 'function') return;
  eventOn(ROLE_SELECTOR_OPEN_EVENT as any, () => {
    void openSelector();
  });
}

function shouldAutoOpenOnFirstRun(): boolean {
  const state = readRoleSelectorStateFromChatVars(getChatVars());
  return state.initialized !== true;
}

$(async () => {
  await waitGlobalInitialized('Mvu');
  ensureButtons();
  bindButtons();
  bindExternalEvents();

  if (shouldAutoOpenOnFirstRun()) {
    void openSelector();
  }

  console.info(`[${SCRIPT_NAME}] 已启动`);
});

$(window).on('pagehide', () => {
  closeSelector();
});

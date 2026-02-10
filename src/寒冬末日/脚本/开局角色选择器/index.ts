import _ from 'lodash';
import { ROLE_CATALOG, RoleCatalogItem } from '../../roleCatalog';
import {
  CHAT_VAR_KEYS_ROLE,
  applyPendingUnlocks,
  createDefaultRoleSelectorState,
  normalizeRoleSelectorState,
  readRoleSelectorStateFromChatVars,
} from '../../role_control';

type RoleSelectorStateLike = ReturnType<typeof createDefaultRoleSelectorState>;

const SCRIPT_NAME = '开局角色选择器';
const ROOT_ATTR = 'data-eden-role-selector-root';
const STYLE_ATTR = 'data-eden-role-selector-style';
const BTN_OPEN = '角色选择';
const BTN_RESET = '重置角色选择';
const BTN_APPLY_PENDING = '应用剧情解锁';
const BTN_TOGGLE_DOSSIER_DEBUG = '切换档案注入调试';
const BTN_CREATE_ROLE = '创建角色';
const BTN_REFRESH_LIST = '刷新名单';
const ROLE_CREATOR_OPEN_EVENT = 'eden.role_creator.open';
const ROLE_SELECTOR_OPEN_EVENT = 'eden.role_selector.open';
const ROLE_SELECTOR_UPDATED_EVENT = 'eden.role_selector.updated';
const DELETE_UNSELECTED_KEY = 'eden.role_selector.delete_unselected';
const DOSSIER_INJECT_DEBUG_KEY = 'debug.角色档案动态注入';
const DEFAULT_WORLDBOOK_NAME_CANDIDATES = [
  '末世寒冬-星穹秩序2.0',
  '寒冬末日-星穹秩序',
  '末世寒冬 - 星穹秩序',
  '末世寒冬-星穹秩序',
] as const;

const RESERVED_KEYS = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);

function getChatVars(): any {
  try {
    return getVariables({ type: 'chat' }) ?? {};
  } catch {
    return {};
  }
}

function readDeleteUnselectedFlag(): boolean {
  const vars = getChatVars();
  return _.get(vars, DELETE_UNSELECTED_KEY, false) === true;
}

function saveDeleteUnselectedFlag(value: boolean) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    vars => {
      _.set(vars, DELETE_UNSELECTED_KEY, value === true);
      return vars;
    },
    { type: 'chat' },
  );
}

function readDossierInjectDebugFlag(): boolean {
  const vars = getChatVars();
  return _.get(vars, DOSSIER_INJECT_DEBUG_KEY, false) === true;
}

function saveDossierInjectDebugFlag(value: boolean) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    vars => {
      _.set(vars, DOSSIER_INJECT_DEBUG_KEY, value === true);
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

function mergeRoleCatalog(base: RoleCatalogItem[], extra: RoleCatalogItem[], selected: string[]): RoleCatalogItem[] {
  const map = new Map<string, RoleCatalogItem>();
  for (const item of base) {
    map.set(item.name, normalizeCatalogItem(item));
  }

  for (const item of extra) {
    const normalized = normalizeCatalogItem(item);
    if (!map.has(normalized.name)) {
      map.set(normalized.name, normalized);
      continue;
    }
    const cur = map.get(normalized.name)!;
    map.set(normalized.name, {
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
    if (!roleName || map.has(roleName)) continue;
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

  return merged;
}

function isRoleLike(val: any): boolean {
  return !!(val && typeof val === 'object' && !Array.isArray(val) && '登场状态' in val && '健康' in val);
}

function normalizeInitialRoomFromCatalog(item?: RoleCatalogItem): string {
  const raw = String(item?.location ?? '').trim();
  if (!raw || raw === '未设置位置') return '';
  if (/^楼层\d+\/\d+$/.test(raw)) return raw;
  if (raw === '玄关' || raw.startsWith('玄关/') || raw.startsWith('核心区/')) return raw;
  return '';
}

function createDefaultRolePayload(name: string, item?: RoleCatalogItem): any {
  return {
    姓名: name,
    关系: '无',
    关系倾向: '中立',
    秩序刻印: 0,
    秩序刻印更新原因: '0, 无变化',
    健康: 100,
    健康更新原因: '0, 无变化',
    健康状况: '健康',
    衣着: '',
    舌唇: '',
    胸乳: '',
    私穴: '',
    神态样貌: '',
    动作姿势: '',
    内心想法: '',
    所在房间: normalizeInitialRoomFromCatalog(item),
    登场状态: '登场',
  };
}

function materializeSelectedRoles(
  stat_data: any,
  enabledSet: Set<string>,
  catalogByName: Map<string, RoleCatalogItem>,
) {
  for (const name of enabledSet) {
    const roleName = String(name ?? '').trim();
    if (!roleName) continue;

    const coreRole = _.get(stat_data, [roleName]);
    if (isRoleLike(coreRole)) {
      _.set(stat_data, [roleName, '姓名'], String(_.get(coreRole, '姓名', '') || roleName));
      _.set(stat_data, [roleName, '登场状态'], '登场');
      continue;
    }

    const tempRole = _.get(stat_data, ['临时NPC', roleName]);
    if (isRoleLike(tempRole)) {
      const migrated = _.cloneDeep(tempRole);
      _.set(migrated, '姓名', String(_.get(migrated, '姓名', '') || roleName));
      _.set(migrated, '登场状态', '登场');
      _.set(stat_data, [roleName], migrated);
      _.unset(stat_data, ['临时NPC', roleName]);
      continue;
    }

    _.set(stat_data, [roleName], createDefaultRolePayload(roleName, catalogByName.get(roleName)));
  }
}

function removeNameFromRooms(stat_data: any, name: string) {
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
    if (Array.isArray(list))
      _.set(
        stat_data,
        path,
        list.filter((x: any) => x !== name),
      );
  }

  const floor20 = _.get(stat_data, ['房间', '楼层房间', '楼层20房间'], {});
  if (floor20 && typeof floor20 === 'object') {
    for (const room of Object.keys(floor20)) {
      const list = _.get(stat_data, ['房间', '楼层房间', '楼层20房间', room, '入住者'], []);
      if (Array.isArray(list))
        _.set(
          stat_data,
          ['房间', '楼层房间', '楼层20房间', room, '入住者'],
          list.filter((x: any) => x !== name),
        );
    }
  }

  const floor19 = _.get(stat_data, ['房间', '楼层房间', '楼层19房间'], {});
  if (floor19 && typeof floor19 === 'object') {
    for (const room of Object.keys(floor19)) {
      const list = _.get(stat_data, ['房间', '楼层房间', '楼层19房间', room, '入住者'], []);
      if (Array.isArray(list))
        _.set(
          stat_data,
          ['房间', '楼层房间', '楼层19房间', room, '入住者'],
          list.filter((x: any) => x !== name),
        );
    }
  }
}

function applySelectionToStatData(stat_data: any, enabledSet: Set<string>, deleteUnselected: boolean) {
  if (!stat_data || typeof stat_data !== 'object') return;

  for (const [key, val] of Object.entries(stat_data)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (!isRoleLike(val)) continue;
    if (enabledSet.has(key)) continue;

    if (deleteUnselected) {
      _.unset(stat_data, [key]);
      removeNameFromRooms(stat_data, key);
    } else {
      _.set(stat_data, [key, '登场状态'], '离场');
      _.set(stat_data, [key, '所在房间'], '');
      removeNameFromRooms(stat_data, key);
    }
  }

  const tempNpc = _.get(stat_data, '临时NPC', {});
  if (tempNpc && typeof tempNpc === 'object') {
    for (const [name, role] of Object.entries(tempNpc)) {
      if (!isRoleLike(role)) continue;
      if (enabledSet.has(name)) continue;

      if (deleteUnselected) {
        _.unset(stat_data, ['临时NPC', name]);
        removeNameFromRooms(stat_data, name);
      } else {
        _.set(stat_data, ['临时NPC', name, '登场状态'], '离场');
        _.set(stat_data, ['临时NPC', name, '所在房间'], '');
        removeNameFromRooms(stat_data, name);
      }
    }
  }
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
  [${ROOT_ATTR}] { position: fixed; inset: 0; z-index: 999999; display: flex; justify-content: center; align-items: center; background: rgba(2,10,20,.72); }
  [${ROOT_ATTR}] .eden-rs-modal { width: min(92vw, 760px); max-height: 82vh; overflow: hidden; display: flex; flex-direction: column; border-radius: 16px; border: 1px solid #1a7fc5; background: linear-gradient(180deg,#031727,#041226); color: #d8f1ff; box-shadow: 0 16px 40px rgba(0,0,0,.45); }
  [${ROOT_ATTR}] .eden-rs-head { padding: 14px 16px; border-bottom: 1px solid rgba(80,180,255,.25); font-size: 18px; font-weight: 700; }
  [${ROOT_ATTR}] .eden-rs-desc { padding: 10px 16px 0; font-size: 13px; color: #a7d8f8; }
  [${ROOT_ATTR}] .eden-rs-list { padding: 12px 16px 16px; overflow: auto; display: grid; gap: 10px; }
  [${ROOT_ATTR}] .eden-rs-item { border: 1px solid rgba(80,180,255,.3); border-radius: 12px; padding: 10px 12px; background: rgba(8,24,46,.6); }
  [${ROOT_ATTR}] .eden-rs-line { display: flex; align-items: center; gap: 8px; }
  [${ROOT_ATTR}] .eden-rs-name { font-size: 16px; font-weight: 700; color: #f0fbff; }
  [${ROOT_ATTR}] .eden-rs-identity { font-size: 12px; color: #9ccff3; }
  [${ROOT_ATTR}] .eden-rs-summary { margin-top: 6px; font-size: 13px; line-height: 1.5; color: #c9e6fb; }
  [${ROOT_ATTR}] .eden-rs-loc { margin-top: 6px; font-size: 12px; color: #89c4ed; }
  [${ROOT_ATTR}] .eden-rs-foot { padding: 12px 16px 16px; border-top: 1px solid rgba(80,180,255,.25); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  [${ROOT_ATTR}] .eden-rs-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  [${ROOT_ATTR}] .eden-rs-btn { border: 1px solid #2a91d6; border-radius: 10px; padding: 8px 12px; background: #0a2742; color: #e7f6ff; cursor: pointer; }
  [${ROOT_ATTR}] .eden-rs-btn.primary { background: #0b5a88; border-color: #47b8ff; }
  [${ROOT_ATTR}] .eden-rs-btn:disabled { opacity: .5; cursor: not-allowed; }
  [${ROOT_ATTR}] .eden-rs-count { font-size: 12px; color: #9dd2f6; }
  `;
  $('<style></style>').attr(STYLE_ATTR, '1').text(css).appendTo('head');
}

function closeSelector() {
  $(`[${ROOT_ATTR}]`).remove();
}

function renderSelector(options: {
  state: RoleSelectorStateLike;
  catalog: RoleCatalogItem[];
  onConfirm: (selected: string[], deleteUnselected: boolean) => Promise<void>;
  onRefresh?: () => void;
  onOpenCreator?: () => void;
}) {
  closeSelector();
  ensureCss();

  const catalog = options.catalog ?? [];
  const selectedSet = new Set(options.state.selected_roles);
  let deleteUnselected = readDeleteUnselectedFlag();
  const $root = $('<div></div>').attr(ROOT_ATTR, '1');
  const $modal = $('<div class="eden-rs-modal"></div>').appendTo($root);
  $('<div class="eden-rs-head">开局角色选择器</div>').appendTo($modal);
  $(
    '<div class="eden-rs-desc">请勾选本次开局要出场的角色。未勾选角色会被初始化为离场，不显示、不触发；后续可通过剧情或按钮解锁。</div>',
  ).appendTo($modal);

  const $list = $('<div class="eden-rs-list"></div>').appendTo($modal);
  const updateCount = () => {
    $count.text(`已勾选 ${selectedSet.size} / ${catalog.length}`);
  };

  for (const role of catalog) {
    const checked = selectedSet.has(role.name);
    const id = `eden-rs-${role.name}`;
    const identityText = role.identity?.trim() || '自定义角色';
    const summaryText = role.summary?.trim() || '（暂无简介）';
    const locationText = role.location?.trim() || '未设置位置';
    const $item = $('<label class="eden-rs-item"></label>').appendTo($list);
    const $line = $('<div class="eden-rs-line"></div>').appendTo($item);
    const $check = $('<input type="checkbox" />').attr('id', id).prop('checked', checked).appendTo($line);
    $('<span class="eden-rs-name"></span>').text(role.name).appendTo($line);
    $('<span class="eden-rs-identity"></span>').text(identityText).appendTo($line);
    $('<div class="eden-rs-summary"></div>').text(summaryText).appendTo($item);
    $('<div class="eden-rs-loc"></div>').text(`所在位置：${locationText}`).appendTo($item);

    $check.on('change', () => {
      if ($check.is(':checked')) selectedSet.add(role.name);
      else selectedSet.delete(role.name);
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
  const $btnConfirm = $('<button class="eden-rs-btn primary" type="button">确认并初始化</button>').appendTo($actions);
  const $deleteLabel = $(
    '<label class="eden-rs-count" style="display:flex;gap:6px;align-items:center;"></label>',
  ).appendTo($foot);
  const $deleteInput = $('<input type="checkbox" />').prop('checked', deleteUnselected).appendTo($deleteLabel);
  $('<span>未勾选角色彻底删除（等同X按钮）</span>').appendTo($deleteLabel);

  $deleteInput.on('change', () => {
    deleteUnselected = $deleteInput.is(':checked');
    saveDeleteUnselectedFlag(deleteUnselected);
  });

  $btnCreate.on('click', () => {
    options.onOpenCreator?.();
  });

  $btnRefresh.on('click', () => {
    options.onRefresh?.();
  });

  $btnAll.on('click', () => {
    selectedSet.clear();
    catalog.forEach(role => selectedSet.add(role.name));
    $list.find('input[type="checkbox"]').prop('checked', true);
    updateCount();
  });

  $btnNone.on('click', () => {
    selectedSet.clear();
    $list.find('input[type="checkbox"]').prop('checked', false);
    updateCount();
  });

  $btnCancel.on('click', () => {
    closeSelector();
  });

  $btnConfirm.on('click', async () => {
    const selected = Array.from(selectedSet.values());
    if (selected.length === 0) {
      toastr.warning('请至少勾选 1 位角色');
      return;
    }

    $btnConfirm.prop('disabled', true).text('初始化中...');
    try {
      await options.onConfirm(selected, deleteUnselected);
      closeSelector();
    } finally {
      $btnConfirm.prop('disabled', false).text('确认并初始化');
    }
  });

  updateCount();
  $('body').append($root);
}

async function buildMergedCatalog(state: RoleSelectorStateLike): Promise<RoleCatalogItem[]> {
  const extra = await loadCatalogFromWorldbookIndex();
  return mergeRoleCatalog(ROLE_CATALOG, extra, state.selected_roles ?? []);
}

function openRoleCreatorFromSelector() {
  if (typeof eventEmit === 'function') {
    eventEmit(ROLE_CREATOR_OPEN_EVENT as any);
    toastr.info('已请求打开角色创建器，请在状态栏中填写并保存');
    return;
  }
  toastr.warning('未检测到角色创建器事件接口');
}

async function applyRoleSelection(selected: string[], deleteUnselected: boolean) {
  const state = readRoleSelectorStateFromChatVars(getChatVars());
  const catalog = await buildMergedCatalog(state);
  const catalogByName = new Map(catalog.map(item => [item.name, item]));
  const normalizedSelected = _(selected)
    .map(name => String(name ?? '').trim())
    .filter(Boolean)
    .uniq()
    .value();
  const nextState = normalizeRoleSelectorState({
    ...state,
    version: state.version || 1,
    initialized: true,
    selected_roles: normalizedSelected,
    revealed_roles: normalizedSelected,
    initialized_at_message_id: getCurrentMessageIdSafe(),
  });

  saveRoleSelectorStateToChat(nextState);

  const enabledSet = new Set(nextState.revealed_roles);
  await replaceLatestStatData(stat_data => {
    materializeSelectedRoles(stat_data, enabledSet, catalogByName);
    applySelectionToStatData(stat_data, enabledSet, deleteUnselected);
    _.set(stat_data, '主线任务.$meta.角色控制', nextState);
  });
  await notifyRoleSelectorUpdated();

  toastr.success(`角色选择已保存：${nextState.selected_roles.length} 位角色`);
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
  const nextState = createDefaultRoleSelectorState();
  nextState.initialized = true;
  nextState.initialized_at_message_id = getCurrentMessageIdSafe();
  saveRoleSelectorStateToChat(nextState);

  const enabledSet = new Set(nextState.revealed_roles);
  const catalogByName = new Map(ROLE_CATALOG.map(item => [item.name, item]));
  await replaceLatestStatData(stat_data => {
    materializeSelectedRoles(stat_data, enabledSet, catalogByName);
    applySelectionToStatData(stat_data, enabledSet, false);
    _.set(stat_data, '主线任务.$meta.角色控制', nextState);
  });
  await notifyRoleSelectorUpdated();

  toastr.success('已重置为默认角色选择');
  reloadIframe();
}

async function applyPendingUnlockFromChat() {
  const state = readRoleSelectorStateFromChatVars(getChatVars());
  const next = applyPendingUnlocks(state);
  if (_.isEqual(next, state)) {
    toastr.info('没有待应用的剧情解锁角色');
    return;
  }
  saveRoleSelectorStateToChat(next);
  await replaceLatestStatData(stat_data => {
    _.set(stat_data, '主线任务.$meta.角色控制', next);
  });
  await notifyRoleSelectorUpdated();
  toastr.success(`已应用剧情解锁：当前可见角色 ${next.revealed_roles.length} 位`);
  reloadIframe();
}

function toggleDossierInjectDebug() {
  const next = !readDossierInjectDebugFlag();
  saveDossierInjectDebugFlag(next);
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
    { name: BTN_APPLY_PENDING, visible: true },
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

  eventOn(getButtonEvent(BTN_APPLY_PENDING), () => {
    void applyPendingUnlockFromChat();
  });

  eventOn(getButtonEvent(BTN_TOGGLE_DOSSIER_DEBUG), () => {
    toggleDossierInjectDebug();
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

<template>
  <section id="characters-section" class="section">
    <h2 class="section-title">👤 登场角色 👤</h2>
    <div class="status-tabs-container">
      <template v-if="active_character_keys.length > 0">
        <div class="tab-buttons">
          <button
            v-for="key in active_character_keys"
            :key="key"
            class="tab-button"
            :class="{ active: active_character_key === key }"
            type="button"
            @click="setActiveCharacter(key)"
          >
            {{ getCharacterDisplayName(key) }}
            <span class="status-pill" :class="getCharacterStatus(key)">{{ getCharacterStatus(key) }}</span>
          </button>
        </div>

        <div
          v-for="key in active_character_keys"
          v-show="active_character_key === key"
          :key="`${key}:tab`"
          class="tab-content"
          :class="{ active: active_character_key === key }"
        >
          <div class="status-grid">
            <div class="status-item health-section">
              <div class="health-section-header">
                <div class="label">❤️ 健康</div>
                <div class="value">
                  {{ getCharacter(key)?.健康 ?? '--' }}
                  <button
                    v-if="canDeleteRole(key)"
                    class="role-remove-btn"
                    type="button"
                    aria-label="删除角色"
                    :disabled="deletingRoleName === getRoleNameKey(key)"
                    @click="onClickDeleteRole(key)"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div class="health-status-subtext">{{ getCharacter(key)?.健康状况 ?? '--' }}</div>
              <div class="progress-bar-container">
                <div class="progress-bar-value" :style="{ width: `${healthPercent(key)}%` }"></div>
              </div>
              <div class="value-subtext">{{ getCharacterChange(key) }}</div>
            </div>

            <div class="status-item imprint-section">
              <div class="health-section-header">
                <div class="label">🔱 秩序刻印</div>
                <div class="value">{{ getCharacter(key)?.秩序刻印 ?? '--' }}</div>
              </div>
              <div class="imprint-status-subtext">
                {{ getRelationStage(key) }} · 关系倾向：{{ getRelationTendency(key) }}
              </div>
              <div class="progress-bar-container imprint-bar">
                <div class="progress-bar-value" :style="{ width: `${imprintPercent(key)}%` }"></div>
              </div>
              <div class="value-subtext imprint-change">
                {{ getImprintChange(key) || ' ' }}
              </div>
              <div class="value-subtext imprint-hint">
                区间：{{ getRelationRangeText(key) }}｜数值越高表示更深的秩序绑定
              </div>
            </div>

            <div class="details-grid">
              <div class="status-item">
                <div class="label">👚 衣着</div>
                <div class="value">{{ getCharacter(key)?.衣着 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">👅 舌唇</div>
                <div class="value">{{ getCharacter(key)?.舌唇 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">🍈 胸乳</div>
                <div class="value">{{ getCharacter(key)?.胸乳 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">🌸 私穴</div>
                <div class="value">{{ getCharacter(key)?.私穴 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">😊 神态样貌</div>
                <div class="value">{{ getCharacter(key)?.神态样貌 ?? '--' }}</div>
              </div>
              <div class="status-item">
                <div class="label">💃 动作姿势</div>
                <div class="value">{{ getCharacter(key)?.动作姿势 ?? '--' }}</div>
              </div>
            </div>

            <div class="status-item">
              <div class="label">💭 内心想法</div>
              <div class="value thought-text">{{ getCharacter(key)?.内心想法 ?? '--' }}</div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="content-text">暂无登场角色</div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import _ from 'lodash';
import type { Schema as SchemaType } from '../../../schema';
import { useDataStore } from '../../store';

// 扩展 CharacterKey 以包含临时 NPC 的 key (格式: "临时NPC:姓名")
type CharacterKey =
  | Exclude<keyof SchemaType, '世界' | '庇护所' | '楼层其他住户' | '房间' | '主线任务' | '临时NPC'>
  | string;

const CHARACTER_ORDER = [
  '浅见亚美',
  '相田哲也',
  '星野琉璃',
  '早川遥',
  '早川舞',
  '藤井雪乃',
  '中村惠子',
  // '爱宫心爱',
  // '爱宫铃',
  '桃乐丝・泽巴哈',
  // '何铃',
  '王静',
  // '康绮月',
  // '薛萍',
  '小泽花',
] as const;

const store = useDataStore();

const RESERVED_KEYS = new Set(['世界', '庇护所', '房间', '主线任务', '楼层其他住户', '临时NPC']);

function isRoleLike(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  return '登场状态' in val && '健康' in val;
}

function listExtraCoreKeys(): string[] {
  const data = store.data as Record<string, any>;
  return Object.keys(data)
    .filter(key => !RESERVED_KEYS.has(key))
    .filter(key => !CHARACTER_ORDER.includes(key as (typeof CHARACTER_ORDER)[number]))
    .filter(key => typeof key === 'string' && key.length > 0 && !key.startsWith('_'))
    .filter(key => isRoleLike(data[key]))
    .sort();
}

const active_character_keys = computed<CharacterKey[]>(() => {
  const isActive = (key: CharacterKey) => getCharacter(key)?.登场状态 === '登场';

  const data = store.data as Record<string, any>;

  // 1. 固定角色按固定顺序
  const fixedKeys = CHARACTER_ORDER.filter(key => isRoleLike(data[key]));
  const fixedActive = fixedKeys.filter(isActive);
  const fixedInactive = fixedKeys.filter(k => !isActive(k));

  // 2. 追加角色（顶层非固定角色）
  const extraKeys = listExtraCoreKeys();
  const extraActive = extraKeys.filter(isActive);
  const extraInactive = extraKeys.filter(k => !isActive(k));

  // 3. 临时 NPC（按名称字典序）
  const tempActive: CharacterKey[] = [];
  const tempInactive: CharacterKey[] = [];
  const tempNPCs = store.data.临时NPC;
  if (tempNPCs && typeof tempNPCs === 'object') {
    const npcNames = Object.keys(tempNPCs).sort();
    const npcActive = npcNames.filter(name => isActive(`临时NPC:${name}`));
    const npcInactive = npcNames.filter(name => !isActive(`临时NPC:${name}`));
    npcActive.forEach(name => tempActive.push(`临时NPC:${name}`));
    npcInactive.forEach(name => tempInactive.push(`临时NPC:${name}`));
  }

  // 排序：登场角色优先；登场/离场内部顺序：固定名单 → 追加角色 → 临时NPC
  return [
    ...fixedActive,
    ...extraActive,
    ...tempActive,
    ...fixedInactive,
    ...extraInactive,
    ...tempInactive,
  ];
});

const active_character_key = ref<CharacterKey | null>(null);
const deletingRoleName = ref<string | null>(null);

watch(
  active_character_keys,
  keys => {
    if (keys.length === 0) {
      active_character_key.value = null;
      return;
    }

    if (!active_character_key.value || !keys.includes(active_character_key.value)) {
      active_character_key.value = keys[0];
    }
  },
  { immediate: true },
);

function getCharacter(key: CharacterKey) {
  // 某些转译流会把日文中点替换成占位符「?」，查找前先还原
  const normalizedKey = typeof key === 'string' ? key.replace(/\?/g, '・') : key;

  if (typeof key === 'string' && key.startsWith('临时NPC:')) {
    const realName = key.split(':')[1];
    return store.data.临时NPC[realName];
  }
  return store.data[normalizedKey as keyof typeof store.data] as any;
}

function isTempNpcKey(key: CharacterKey): boolean {
  return typeof key === 'string' && key.startsWith('临时NPC:');
}

function getTempNpcName(key: CharacterKey): string {
  if (!isTempNpcKey(key)) return '';
  return String(key.split(':')[1] ?? '').trim();
}

function getRoleNameKey(key: CharacterKey): string {
  if (isTempNpcKey(key)) return getTempNpcName(key);
  if (typeof key === 'string') return key.replace(/\?/g, '・');
  return String(key);
}

function canDeleteRole(key: CharacterKey): boolean {
  return !!getRoleNameKey(key);
}

async function confirmDeleteRole(name: string, isTemp: boolean): Promise<boolean> {
  const title = isTemp ? `确定删除临时NPC「${name}」？` : `确定删除角色「${name}」？`;
  const hint = isTemp
    ? '将从当前楼层变量中移除该临时NPC，并重载本楼层UI以刷新显示。'
    : '将从当前楼层变量中移除该角色（含固定角色/主角），并重载本楼层UI以刷新显示。';
  const content = `${title}\n\n${hint}`;

  try {
    if (typeof (SillyTavern as any)?.callGenericPopup === 'function') {
      const result = await SillyTavern.callGenericPopup(content, SillyTavern.POPUP_TYPE.CONFIRM);
      return result === SillyTavern.POPUP_RESULT.AFFIRMATIVE || result === true;
    }
  } catch {
    // ignore and fallback
  }

  return window.confirm(content);
}

function pruneNameFromRooms(stat_data: any, name: string) {
  const n = String(name ?? '').trim();
  if (!n) return;

  const rooms = _.get(stat_data, '房间', null);
  if (!rooms || typeof rooms !== 'object') return;

  const pruneList = (path: string) => {
    const list = _.get(rooms, path, null);
    if (!Array.isArray(list)) return;
    const next = list.filter(x => String(x ?? '').trim() !== n);
    if (!_.isEqual(next, list)) _.set(rooms, path, next);
  };

  pruneList('玄关.临时客房A入住者');
  pruneList('玄关.临时客房B入住者');
  pruneList('核心区.客厅使用者');
  pruneList('核心区.餐厅厨房使用者');
  pruneList('核心区.主卧室使用者');
  pruneList('核心区.主浴室使用者');

  const floorKeys = ['楼层房间.楼层20房间', '楼层房间.楼层19房间'];
  for (const baseKey of floorKeys) {
    const record = _.get(rooms, baseKey, null);
    if (!record || typeof record !== 'object') continue;
    for (const roomNumber of Object.keys(record)) {
      pruneList(`${baseKey}.${roomNumber}.入住者`);
    }
  }
}

async function onClickDeleteRole(key: CharacterKey) {
  const isTemp = isTempNpcKey(key);
  const name = getRoleNameKey(key);
  if (!name) return;
  if (deletingRoleName.value) return;

  const ok = await confirmDeleteRole(name, isTemp);
  if (!ok) return;

  try {
    deletingRoleName.value = name;
    await waitGlobalInitialized('Mvu');

    const message_id = getCurrentMessageId();
    const mvu_data = Mvu.getMvuData({ type: 'message', message_id });

    const existedCore = _.has(mvu_data, ['stat_data', name]);
    const existedTemp = _.has(mvu_data, ['stat_data', '临时NPC', name]);
    if (!existedCore && !existedTemp) {
      toastr.info(`角色「${name}」已不存在`);
      reloadIframe();
      return;
    }

    const removeCore = !isTemp && existedCore;
    const removeTemp = existedTemp;
    if (removeCore) _.unset(mvu_data, ['stat_data', name]);
    if (removeTemp) _.unset(mvu_data, ['stat_data', '临时NPC', name]);

    const keepCore = existedCore && !removeCore;
    const keepTemp = existedTemp && !removeTemp;
    if (!keepCore && !keepTemp) {
      pruneNameFromRooms(_.get(mvu_data, 'stat_data', {}), name);
    }

    await Mvu.replaceMvuData(mvu_data, { type: 'message', message_id });
    toastr.success(`已删除角色「${name}」`);
    reloadIframe();
  } catch (e: any) {
    console.error('[CharactersSection] delete role failed', e);
    toastr.error(`删除失败：${e?.message ?? e}`);
  } finally {
    deletingRoleName.value = null;
  }
}

function getCharacterChange(key: CharacterKey) {
  const char = getCharacter(key);
  if (!char || !char.健康更新原因) return '';
  return char.健康更新原因;
}

function getCharacterDisplayName(key: CharacterKey) {
  const char = getCharacter(key);
  const name = typeof char?.姓名 === 'string' ? char.姓名.trim() : '';
  // 如果是临时NPC，去掉前缀显示
  if (typeof key === 'string' && key.startsWith('临时NPC:')) {
    return key.split(':')[1];
  }
  return name ? name : key;
}

function getCharacterStatus(key: CharacterKey) {
  const char = getCharacter(key);
  return char?.登场状态 ?? '离场';
}

function setActiveCharacter(key: CharacterKey) {
  active_character_key.value = key;
}

function healthPercent(key: CharacterKey) {
  const char = getCharacter(key);
  const health = char?.健康;
  if (typeof health !== 'number') return 0;
  return _.clamp(health, 0, 100);
}

function imprintPercent(key: CharacterKey) {
  const char = getCharacter(key);
  const mark = char?.秩序刻印;
  if (typeof mark !== 'number') return 0;
  return _.clamp(mark, 0, 100);
}

function getRelationStage(key: CharacterKey) {
  const char = getCharacter(key);
  if (char?.关系) return char.关系;
  // fallback: 推断自秩序刻印数值
  const mark = typeof char?.秩序刻印 === 'number' ? char.秩序刻印 : null;
  if (mark === null) return '未知';
  if (mark <= 0) return '无';
  if (mark < 20) return '拒绝';
  if (mark < 40) return '交易';
  if (mark < 60) return '顺从';
  if (mark < 90) return '忠诚';
  return '性奴';
}

function getRelationTendency(key: CharacterKey) {
  const char = getCharacter(key);
  return char?.关系倾向 ?? '未知';
}

function getRelationRangeText(key: CharacterKey) {
  const relation = getRelationStage(key);
  switch (relation) {
    case '无':
      return '-20 - 0';
    case '拒绝':
      return '1 - 19';
    case '交易':
      return '20 - 39';
    case '顺从':
      return '40 - 59';
    case '忠诚':
      return '60 - 89';
    case '性奴':
      return '90 - 100';
    default:
      return '-20 - 100';
  }
}

function getImprintChange(key: CharacterKey) {
  const char = getCharacter(key);
  return char?.秩序刻印更新原因 ?? '';
}
</script>

<style scoped>
.imprint-section .progress-bar-value {
  background: linear-gradient(90deg, #7aa2f7, #f1fa8c);
}
.imprint-status-subtext {
  margin-top: 4px;
  color: var(--accent-blue, #8be9fd);
  font-size: 0.9em;
}
.imprint-hint {
  color: var(--text-color);
  opacity: 0.7;
}

.imprint-change {
  color: var(--accent-gold, #f1fa8c);
}
.imprint-bar {
  margin-top: 6px;
}
</style>

<style scoped>
.role-remove-btn {
  margin-left: 10px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 90, 90, 0.55);
  background: rgba(255, 90, 90, 0.12);
  color: rgba(255, 150, 150, 0.98);
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.12s ease,
    opacity 0.12s ease;
}

.role-remove-btn:hover {
  transform: scale(1.04);
}

.role-remove-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.status-pill {
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 0.75em;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
  background: rgba(255, 255, 255, 0.05);
}
.status-pill.登场 {
  color: #50fa7b;
  border-color: #50fa7b55;
  background: #50fa7b11;
}
.status-pill.离场 {
  color: #f1fa8c;
  border-color: #f1fa8c55;
  background: #f1fa8c11;
}
</style>

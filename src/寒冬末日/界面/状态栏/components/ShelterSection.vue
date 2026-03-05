<template>
  <section id="shelter-section" class="section shelter-redesign">
    <h2 class="section-title">🏰 庇护所信息 🏰</h2>
    <div class="shelter-grid">
      <div class="shelter-top-metrics">
        <div class="shelter-item shelter-item--metric shelter-item--level">
          <div class="label">
            ⚜️ 庇护所等级
            <span v-if="isNewShelterLevel" class="new-tag">NEW</span>
          </div>
          <div class="value metric-value metric-value--level">
            <span class="metric-number">{{ store.data.庇护所.庇护所等级 }}</span>
            <span class="metric-unit">级</span>
          </div>
        </div>

        <div class="shelter-item shelter-item--metric shelter-item--roll">
          <div class="label">
            🎲 今日投掷点数
            <span v-if="isNewDailyRoll" class="new-tag">NEW</span>
          </div>
          <div class="metric-roll-row">
            <div class="value metric-value metric-value--roll">{{ store.data.庇护所.今日投掷点数 }}</div>
            <button class="roll-calibrate-btn" :disabled="isCalibrating" @click="calibrateDailyRollDate">校准</button>
          </div>
        </div>

        <div class="shelter-item shelter-item--metric shelter-item--pity distance-item">
          <div class="label">⏳ 距离下次保底升级</div>
          <div class="value metric-value metric-value--pity">{{ store.data.庇护所.距离上次升级 }}</div>
        </div>
      </div>

      <div class="shelter-item shelter-item--expansion">
        <div class="label">🔒 可扩展区域状态</div>
        <div class="expansion-list">
          <div class="expansion-card" :class="{ unlocked: store.data.庇护所.可扩展区域.医疗翼 !== '未解锁' }">
            <div class="name">⚕️ 医疗翼</div>
            <div class="status">{{ store.data.庇护所.可扩展区域.医疗翼 }}</div>
          </div>
          <div class="expansion-card" :class="{ unlocked: store.data.庇护所.可扩展区域.制造工坊 !== '未解锁' }">
            <div class="name">🔧 制造工坊</div>
            <div class="status">{{ store.data.庇护所.可扩展区域.制造工坊 }}</div>
          </div>
          <div class="expansion-card" :class="{ unlocked: store.data.庇护所.可扩展区域.载具格纳库 !== '未解锁' }">
            <div class="name">🚜 载具格纳库</div>
            <div class="status">{{ store.data.庇护所.可扩展区域.载具格纳库 }}</div>
          </div>
        </div>
      </div>

      <!-- 伊甸空间地图 -->
      <div class="shelter-item shelter-map-block">
        <div class="label">🗺️ 伊甸空间地图</div>
        <button class="map-toggle-btn map-toggle-btn--expand" @click="isMapExpanded = !isMapExpanded">
          <span class="toggle-icon">{{ isMapExpanded ? '▼' : '▶' }}</span>
          <span class="toggle-text">{{ isMapExpanded ? '收起地图' : '展开地图' }}</span>
        </button>
        <button class="map-toggle-btn map-toggle-btn--scope" :disabled="!canOpenScopeEditor" @click="toggleScopeEditor">
          <span class="toggle-icon">{{ isScopeEditorOpen ? '✓' : '＋' }}</span>
          <span class="toggle-text">+庇护范围</span>
        </button>
        <div v-if="canOpenScopeEditor && !isScopeEditorOpen" class="scope-hint">
          20层 {{ scope20Max ? `${scope20Count}/${scope20Max}` : '未解锁' }} · 19层
          {{ scope19Max ? `${scope19Count}/${scope19Max}` : '未解锁' }}
        </div>

        <div class="map-container">
          <div class="map-quick-zones">
            <!-- 玄关区域 -->
            <div class="map-zone map-zone--compact map-zone--entrance">
              <div class="zone-label zone-label--compact">
                <span class="zone-label-main">🚪 玄关 · 净化区</span>
                <span class="zone-label-sub">出入缓冲 / 临时接待</span>
              </div>
              <div class="room-grid entrance-grid">
                <div
                  v-for="room in entranceRooms"
                  :key="`entrance-${room.key}`"
                  class="room-cell room-cell--compact"
                  :class="[
                    room.main ? 'room-cell--entrance-main highlight' : '',
                    { occupied: hasEntranceRoomResident(room.key) },
                  ]"
                >
                  <div class="room-number">{{ room.label }}</div>
                  <div class="room-value">{{ getEntranceRoomStatus(room.key) }}</div>
                  <div class="room-resident">{{ getEntranceRoomNames(room.key) }}</div>
                </div>
              </div>
            </div>

            <!-- 核心区 -->
            <div class="map-zone map-zone--compact map-zone--core">
              <div class="zone-label zone-label--compact">
                <span class="zone-label-main">💎 核心生活区</span>
                <span class="zone-label-sub">主要功能房间</span>
              </div>
              <div class="room-grid core-grid">
                <div
                  v-for="room in coreRooms"
                  :key="`core-${room.key}`"
                  class="room-cell room-cell--compact"
                  :class="[
                    room.feature ? 'room-cell--feature highlight' : '',
                    { occupied: hasCoreRoomResident(room.key) },
                  ]"
                >
                  <div class="room-number">{{ room.label }}</div>
                  <div class="room-resident">{{ getCoreRoomNames(room.key) }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 20层走廊 -->
          <div class="map-zone map-zone--floor">
            <div class="zone-label">🏢 20层 - 公寓走廊</div>
            <div class="zone-scope-hint">{{ scope20Hint }}</div>
            <div class="room-grid floor-grid">
              <div
                v-for="room in floor20Rooms"
                :key="room.number"
                class="room-cell"
                :class="{
                  'user-room': room.number === '2001',
                  occupied: hasFloorResident('20', room.number),
                  sheltered: isFloorRoomSheltered('20', room.number),
                  'scope-editable': isScopeEditorOpen && canEditFloor('20') && room.number !== '2001',
                }"
                @click="onFloorRoomClick('20', room.number)"
              >
                <div
                  v-if="isScopeEditorOpen && canEditFloor('20') && room.number !== '2001'"
                  class="scope-badge"
                  :class="{ on: isFloorRoomSheltered('20', room.number) }"
                >
                  {{ isFloorRoomSheltered('20', room.number) ? '已勾选' : '待勾选' }}
                </div>
                <div class="room-number">{{ room.number }}</div>
                <div class="room-value">{{ getFloorRoomCompactStatus('20', room.number) }}</div>
                <div class="room-resident">{{ getFloorRoomNames('20', room.number) }}</div>
              </div>
            </div>
          </div>

          <!-- 19层走廊 -->
          <div class="map-zone map-zone--floor">
            <div class="zone-label">🏢 19层 - 公寓走廊</div>
            <div class="zone-scope-hint">{{ scope19Hint }}</div>
            <div class="room-grid floor-grid">
              <div
                v-for="room in floor19Rooms"
                :key="room.number"
                class="room-cell"
                :class="{
                  occupied: hasFloorResident('19', room.number),
                  sheltered: isFloorRoomSheltered('19', room.number),
                  'scope-editable': isScopeEditorOpen && canEditFloor('19'),
                }"
                @click="onFloorRoomClick('19', room.number)"
              >
                <div
                  v-if="isScopeEditorOpen && canEditFloor('19')"
                  class="scope-badge"
                  :class="{ on: isFloorRoomSheltered('19', room.number) }"
                >
                  {{ isFloorRoomSheltered('19', room.number) ? '已勾选' : '待勾选' }}
                </div>
                <div class="room-number">{{ room.number }}</div>
                <div class="room-value">{{ getFloorRoomCompactStatus('19', room.number) }}</div>
                <div class="room-resident">{{ getFloorRoomNames('19', room.number) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 庇护范围快速设置：不依赖地图点选，避免“选完还要滚动找按钮” -->
        <Teleport to="body">
          <div
            v-if="isScopeEditorOpen"
            class="scope-modal-mask"
            :style="scopeModalMaskStyle"
            @click.self="closeScopeEditor"
          >
            <div class="scope-modal" role="dialog" aria-modal="true">
              <div class="scope-modal-header">
                <div class="scope-modal-title">🛡️ 设置生存庇护范围</div>
                <div class="scope-modal-header-actions">
                  <button
                    class="scope-btn scope-btn--primary scope-btn--mini"
                    type="button"
                    @click="confirmAndSendScope"
                  >
                    确定并发送
                  </button>
                  <button class="scope-icon-btn" type="button" aria-label="关闭" @click="closeScopeEditor">✕</button>
                </div>
              </div>

              <div class="scope-modal-subtitle">
                点击房间卡片即可添加/移除；设置完成后点击“确定并发送”即可同步给伊甸。
              </div>

              <div class="scope-modal-stats">
                <div class="stat">
                  20层：<span class="stat-strong">{{ scope20Max ? `${scope20Count}/${scope20Max}` : '未解锁' }}</span>
                </div>
                <div class="stat">
                  19层：<span class="stat-strong">{{ scope19Max ? `${scope19Count}/${scope19Max}` : '未解锁' }}</span>
                </div>
                <button class="scope-link-btn" type="button" @click="clearScopeSelection">清空选择</button>
              </div>

              <div class="scope-modal-body">
                <div class="scope-floor">
                  <div class="scope-floor-title">20层（公寓走廊）</div>
                  <div class="scope-room-grid">
                    <button
                      v-for="room in floor20Rooms"
                      :key="`s20-${room.number}`"
                      type="button"
                      class="scope-room-chip"
                      :class="{
                        selected: isFloorRoomSheltered('20', room.number),
                        disabled: !!getToggleRoomDisabledReason('20', room.number),
                        core: room.number === '2001',
                      }"
                      @click="toggleRoomFromSelector('20', room.number)"
                    >
                      <div class="chip-top">
                        <span class="chip-number">{{ room.number }}</span>
                        <span class="chip-mark">
                          {{ isFloorRoomSheltered('20', room.number) ? '✓' : '+' }}
                        </span>
                      </div>
                      <div class="chip-sub">
                        {{ room.number === '2001' ? '庇护所本体' : getFloorRoomStatus('20', room.number) }}
                      </div>
                    </button>
                  </div>
                </div>

                <div class="scope-floor" :class="{ locked: !scope19Max }">
                  <div class="scope-floor-title">19层（公寓走廊）</div>
                  <div v-if="!scope19Max" class="scope-locked-hint">庇护所等级 6 解锁</div>
                  <div class="scope-room-grid" :class="{ disabled: !scope19Max }">
                    <button
                      v-for="room in floor19Rooms"
                      :key="`s19-${room.number}`"
                      type="button"
                      class="scope-room-chip"
                      :class="{
                        selected: isFloorRoomSheltered('19', room.number),
                        disabled: !!getToggleRoomDisabledReason('19', room.number),
                      }"
                      @click="toggleRoomFromSelector('19', room.number)"
                    >
                      <div class="chip-top">
                        <span class="chip-number">{{ room.number }}</span>
                        <span class="chip-mark">
                          {{ isFloorRoomSheltered('19', room.number) ? '✓' : '+' }}
                        </span>
                      </div>
                      <div class="chip-sub">{{ getFloorRoomStatus('19', room.number) }}</div>
                    </button>
                  </div>
                </div>

                <details class="scope-details" open>
                  <summary>预览发送文本（调试用）</summary>
                  <textarea
                    v-model="scopeInstructionDraft"
                    class="scope-preview scope-preview--editable"
                    placeholder="(尚未选择任何房间)"
                    rows="6"
                    @input="onScopeInstructionInput"
                  />
                  <div class="scope-preview-actions">
                    <button
                      class="scope-btn scope-btn--ghost scope-btn--mini"
                      type="button"
                      :disabled="!scopeInstructionDirty"
                      @click="resetScopeInstructionDraft"
                    >
                      重置为自动生成
                    </button>
                    <span class="scope-preview-hint">编辑后，“确定并发送”会发送你修改的文本。</span>
                  </div>
                </details>
              </div>

              <div class="scope-modal-footer">
                <div class="scope-footer-hint">
                  点击"确定并发送"后，AI正文会识别房间的庇护效果；若只勾选"恢复健康"，则仅单纯恢复健康值。
                </div>
                <div class="scope-footer-spacer"></div>
                <button class="scope-btn" type="button" @click="closeScopeEditor">关闭</button>
                <button class="scope-btn scope-btn--primary" type="button" @click="confirmAndSendScope">
                  确定并发送
                </button>
              </div>
            </div>
          </div>
        </Teleport>
      </div>

      <!-- 庇护所能力列表（可折叠） -->
      <div class="shelter-item shelter-summary-block">
        <div class="label">🧠 庇护所能力总述</div>
        <div class="value">{{ shelterAbilitySummary }}</div>
      </div>

      <div class="shelter-item shelter-ability-block">
        <button class="collapse-toggle-btn" @click="toggleAbilityExpanded()">
          <span class="toggle-icon">{{ isAbilityExpanded ? '▼' : '▶' }}</span>
          <span class="toggle-text">
            💡 能力卡牌
            <span v-if="isNewAbilityList" class="new-tag">NEW</span>
          </span>
        </button>
        <div v-show="isAbilityExpanded" class="ability-list">
          <div class="ability-toolbar">
            <label class="ability-control">
              <span>类别</span>
              <select v-model="abilityCategoryFilter" class="ability-select">
                <option value="全部">全部</option>
                <option v-for="cat in SHELTER_CATEGORY_ORDER_DISPLAY" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </label>
            <label class="ability-control">
              <span>状态</span>
              <select v-model="abilityUnlockFilter" class="ability-select">
                <option value="全部">全部</option>
                <option value="已解锁">已解锁</option>
                <option value="未解锁">未解锁</option>
              </select>
            </label>
            <label class="ability-control">
              <span>排序</span>
              <select v-model="abilitySortMode" class="ability-select">
                <option value="level_asc">等级↑</option>
                <option value="level_desc">等级↓</option>
                <option value="value_desc">价值优先</option>
                <option value="unlock_first">解锁优先</option>
              </select>
            </label>
          </div>
          <div class="ability-legend">
            <span class="ability-legend-item is-green">● 基础（绿）</span>
            <span class="ability-legend-item is-purple">● 关键（紫）</span>
            <span class="ability-legend-item is-orange">● 核心（金橙）</span>
          </div>

          <template v-if="abilityMatrixRows.length > 0">
            <div class="ability-matrix">
              <section v-for="row in abilityMatrixRows" :key="row.level" class="ability-matrix-row">
                <div class="ability-row-label">
                  Lv.{{ row.level }} <span v-if="row.label">· {{ row.label }}</span>
                </div>
                <div class="ability-row-grid">
                  <div v-for="cat in abilityVisibleCategories" :key="`${row.level}-${cat}`" class="ability-grid-cell">
                    <div class="ability-grid-head">{{ cat }}</div>
                    <div class="ability-grid-cards">
                      <template v-if="getAbilityCardsByCategory(row, cat).length > 0">
                        <article
                          v-for="ab in getAbilityCardsByCategory(row, cat)"
                          :key="ab.id"
                          class="skill-card"
                          :class="[`rarity-${ab.rarity}`, { unlocked: ab.unlocked, locked: !ab.unlocked }]"
                        >
                          <div class="skill-main skill-main--compact">
                            <span class="skill-dot" :class="{ on: ab.unlocked }"></span>
                            <span class="skill-icon">{{ ab.icon }}</span>
                            <span class="skill-name">{{ ab.title }}</span>
                            <span v-if="ab.unlocked && isNewAbilityItem(ab.name)" class="new-tag new-tag--small"
                              >NEW</span
                            >
                          </div>
                        </article>
                      </template>
                      <div v-else class="skill-empty">—</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </template>
          <template v-else>
            <div class="ability-empty">(当前筛选条件下暂无能力)</div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useEventListener, useThrottleFn } from '@vueuse/core';
import YAML from 'yaml';
import { useDataStore } from '../../store';
import { useShelterScopeStore } from '../../shelterScopeStore';
import { floorRoomCapacity, isRoomSheltered } from '../../../util/shelter_scope';
import { CHAT_VAR_KEYS, copyText, sendToChat } from '../../outbound';
import { getViewMessageState, resolveViewMessageId } from '../../viewMessage';
import shelterBlueprintRaw from '../../../世界书/寒冬末日/庇护所升级能力.txt?raw';

const store = useDataStore();
const scopeStore = useShelterScopeStore();
const currentMessageId = computed(() => resolveViewMessageId({ preferHistory: true }) ?? -1);

function readShelterUpgradeMeta(worldDate: string): {
  last_roll_date: string;
  last_roll_message_id: number;
  last_level_message_id: number;
  last_ability_message_id: number;
  last_roll_source: string;
  last_ability_changed: boolean;
  last_roll_event_id: string;
  last_roll_settled: boolean;
  last_ability_event_id: string;
  last_ability_added_names: string[];
} {
  try {
    const vars = typeof getVariables === 'function' ? (getVariables({ type: 'chat' }) ?? {}) : {};
    const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, {}) ?? {};
    const rollHistory = (raw as any)?.roll_history ?? {};
    const entry = worldDate && rollHistory && typeof rollHistory === 'object' ? (rollHistory as any)[worldDate] : null;
    return {
      last_roll_date: String((raw as any)?.last_roll_date ?? '').trim(),
      // v2: roll NEW 绑定到 roll_history[日期].message_id（比 message_hash 锚点更稳定）
      last_roll_message_id: Number((entry as any)?.message_id ?? (raw as any)?.last_roll_message_id ?? 0) || 0,
      last_level_message_id: Number((raw as any)?.last_level_message_id ?? 0) || 0,
      last_ability_message_id: Number((raw as any)?.last_ability_message_id ?? 0) || 0,
      last_roll_source: String((raw as any)?.last_roll_source ?? '').trim(),
      last_ability_changed: (raw as any)?.last_ability_changed === true,
      last_roll_event_id: String((raw as any)?.last_roll_event_id ?? '').trim(),
      last_roll_settled: (raw as any)?.last_roll_settled === true,
      last_ability_event_id: String((raw as any)?.last_ability_event_id ?? '').trim(),
      last_ability_added_names: Array.isArray((raw as any)?.last_ability_added_names)
        ? (raw as any).last_ability_added_names.map((x: any) => String(x ?? '').trim()).filter(Boolean)
        : [],
    };
  } catch {
    return {
      last_roll_date: '',
      last_roll_message_id: 0,
      last_level_message_id: 0,
      last_ability_message_id: 0,
      last_roll_source: '',
      last_ability_changed: false,
      last_roll_event_id: '',
      last_roll_settled: false,
      last_ability_event_id: '',
      last_ability_added_names: [],
    };
  }
}

const worldDate = computed(() => String((store.data as any)?.世界?.日期 ?? '').trim());
const shelterMeta = computed(() => readShelterUpgradeMeta(worldDate.value));
function readShelterUiSeen(): { roll_event_id: string; ability_event_id: string } {
  try {
    const vars = typeof getVariables === 'function' ? (getVariables({ type: 'chat' }) ?? {}) : {};
    const ui = _.get(vars, 'eden.ui.seen', {}) ?? {};
    return {
      roll_event_id: String((ui as any)?.shelter_roll_event_id ?? '').trim(),
      ability_event_id: String((ui as any)?.shelter_ability_event_id ?? '').trim(),
    };
  } catch {
    return { roll_event_id: '', ability_event_id: '' };
  }
}

const seen = readShelterUiSeen();

function markShelterUiSeen(next: Partial<{ roll_event_id: string; ability_event_id: string }>) {
  if (typeof updateVariablesWith !== 'function') return;
  updateVariablesWith(
    (vars: any) => {
      const base = _.get(vars, 'eden.ui.seen', {}) ?? {};
      const merged = base && typeof base === 'object' && !Array.isArray(base) ? { ...(base as any) } : {};
      if (typeof next.roll_event_id === 'string' && next.roll_event_id)
        merged.shelter_roll_event_id = next.roll_event_id;
      if (typeof next.ability_event_id === 'string' && next.ability_event_id)
        merged.shelter_ability_event_id = next.ability_event_id;
      _.set(vars, 'eden.ui.seen', merged);
      return vars;
    },
    { type: 'chat' },
  );
}

const isNewDailyRoll = computed(
  () =>
    !!worldDate.value &&
    worldDate.value === shelterMeta.value.last_roll_date &&
    shelterMeta.value.last_roll_source !== 'seed' &&
    shelterMeta.value.last_roll_settled === true &&
    !!shelterMeta.value.last_roll_event_id &&
    shelterMeta.value.last_roll_event_id !== seen.roll_event_id,
);
const isNewShelterLevel = computed(
  () =>
    Number.isFinite(currentMessageId.value) &&
    currentMessageId.value > 0 &&
    currentMessageId.value === shelterMeta.value.last_level_message_id,
);
const isNewAbilityList = computed(
  () =>
    !!worldDate.value &&
    worldDate.value === shelterMeta.value.last_roll_date &&
    shelterMeta.value.last_ability_changed === true &&
    !!shelterMeta.value.last_ability_event_id &&
    shelterMeta.value.last_ability_event_id !== seen.ability_event_id,
);

if (isNewDailyRoll.value) {
  markShelterUiSeen({ roll_event_id: shelterMeta.value.last_roll_event_id });
}

const addedAbilitySet = computed(() => new Set(shelterMeta.value.last_ability_added_names));
function isNewAbilityItem(name: string): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  if (!isNewAbilityList.value) return false;
  return addedAbilitySet.value.has(n);
}

function toggleAbilityExpanded() {
  const next = !isAbilityExpanded.value;
  isAbilityExpanded.value = next;
  if (next && isNewAbilityList.value) {
    markShelterUiSeen({ ability_event_id: shelterMeta.value.last_ability_event_id });
  }
}
// 默认折叠，保持原有交互
const isMapExpanded = ref(false);
const isAbilityExpanded = ref(false);
const isScopeEditorOpen = ref(false);
const scopeModalViewportTop = ref(0);
const scopeModalViewportHeight = ref(0);
let parentScrollTarget: HTMLElement | Window | null = null;
let stopScopeScroll: (() => void) | null = null;
let stopScopeResize: (() => void) | null = null;
const isCalibrating = ref(false);

async function calibrateDailyRollDate() {
  if (isCalibrating.value) return;
  isCalibrating.value = true;
  try {
    if (getViewMessageState().mode === 'history') {
      toastr?.info?.('回看模式仅查看，请先返回最新楼层后再校准。', '每日Roll');
      return;
    }

    const today = String(store.data.世界.日期 ?? '').trim();
    if (!today) {
      toastr?.warning?.('无法校准：当前楼层没有世界日期', '每日Roll');
      return;
    }

    const message_id = resolveViewMessageId({ preferHistory: false });
    const targetMessageId = Number(message_id);
    if (!Number.isFinite(targetMessageId)) {
      toastr?.warning?.('无法校准：未能获取当前楼层号', '每日Roll');
      return;
    }

    // 手动“最后保底”：只发起请求，实际结算（含roll/升级/补全）由后台脚本统一处理
    if (typeof updateVariablesWith === 'function') {
      const request = {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        message_id: targetMessageId,
        today,
        ts: new Date().toISOString(),
      };
      updateVariablesWith(
        (vars: any) => {
          const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, {});
          const next = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as any) } : {};
          next.manual_request = request;
          _.set(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, next);
          return vars;
        },
        { type: 'chat' },
      );
    }

    // 触发一次 MVU 更新事件，让后台脚本立刻处理（尽量不改动楼层变量内容）
    await waitGlobalInitialized('Mvu');
    const mvu_data = Mvu.getMvuData({ type: 'message', message_id: targetMessageId }) as any;
    await Mvu.replaceMvuData(mvu_data, { type: 'message', message_id: targetMessageId });

    toastr?.info?.('已请求校准/roll，正在刷新…', '每日Roll');
    try {
      reloadIframe();
    } catch {
      window.location.reload();
    }
  } catch (e) {
    console.error('[eden/shelter_calibrate_roll_date] failed', e);
    toastr?.error?.('校准失败，请重试', '每日Roll');
  } finally {
    isCalibrating.value = false;
  }
}

const scopeModalMaskStyle = computed(() => ({
  top: `${scopeModalViewportTop.value}px`,
  height: `${scopeModalViewportHeight.value}px`,
}));

function getParentScrollContainer(frameEl: HTMLElement): HTMLElement | Window {
  try {
    const doc = frameEl.ownerDocument;
    const win = doc.defaultView ?? window.parent;
    let cur: HTMLElement | null = frameEl.parentElement;
    while (cur) {
      const style = win.getComputedStyle(cur);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 1) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return win;
  } catch {
    return window.parent;
  }
}

function updateScopeModalViewport() {
  const frameEl = window.frameElement as HTMLElement | null;
  if (!frameEl) return;
  const parentWin = window.parent as Window | null;
  if (!parentWin) return;

  // 关键：消息 iframe 本身通常“没有内部滚动”，外层滚动发生在父级容器。
  // 固定定位会锚定到 iframe 顶部，导致用户在长正文中点开弹窗时“弹窗跑到很远”。
  // 因此我们把 mask 放到文档的“当前可见区域对应的 y 坐标”上（绝对定位）。
  const rect = frameEl.getBoundingClientRect(); // 相对父窗口 viewport
  const topInIframeDoc = Math.max(0, -rect.top);
  scopeModalViewportTop.value = topInIframeDoc;
  scopeModalViewportHeight.value = Math.max(0, parentWin.innerHeight);
}

const throttledUpdateScopeModalViewport = useThrottleFn(updateScopeModalViewport, 50);

function bindParentScrollSync() {
  const frameEl = window.frameElement as HTMLElement | null;
  if (!frameEl) return;
  parentScrollTarget = getParentScrollContainer(frameEl);
  const handler = throttledUpdateScopeModalViewport;
  if (!parentScrollTarget) return;
  stopScopeScroll?.();
  stopScopeResize?.();
  stopScopeScroll = useEventListener(parentScrollTarget, 'scroll', handler, { passive: true });
  const resizeTarget = parentScrollTarget instanceof Window ? parentScrollTarget : (window.parent ?? window);
  stopScopeResize = useEventListener(resizeTarget, 'resize', handler, { passive: true });
}

function unbindParentScrollSync() {
  stopScopeScroll?.();
  stopScopeResize?.();
  stopScopeScroll = null;
  stopScopeResize = null;
  parentScrollTarget = null;
}

const shelterLevel = computed(() => {
  const lv = Number(store.data.庇护所.庇护所等级);
  return Number.isFinite(lv) ? lv : 1;
});

const canOpenScopeEditor = computed(() => shelterLevel.value >= 3);

const scope20Max = computed(() => floorRoomCapacity(shelterLevel.value, '20'));
const scope19Max = computed(() => floorRoomCapacity(shelterLevel.value, '19'));

function isVisibleScopeRoom(floor: '20' | '19', roomNumber: string): boolean {
  const n = String(roomNumber ?? '').trim();
  return floor === '20' ? /^200[1-8]$/.test(n) : /^190[1-8]$/.test(n);
}

function getVisibleScopeRooms(floor: '20' | '19'): string[] {
  return (scopeStore.scope[floor] ?? []).filter(room => isVisibleScopeRoom(floor, room));
}

const scope20Count = computed(() => getVisibleScopeRooms('20').length);
const scope19Count = computed(() => getVisibleScopeRooms('19').length);

const scopeInstructionText = computed(() => scopeStore.buildInstructionText());
const scopeInstructionDraft = ref('');
const scopeInstructionDirty = ref(false);

function resetScopeInstructionDraft() {
  scopeInstructionDraft.value = scopeInstructionText.value;
  scopeInstructionDirty.value = false;
}

function onScopeInstructionInput() {
  scopeInstructionDirty.value = true;
}

function buildFloorScopeHint(rooms: string[], max: number, unlockLevel: number): string {
  if (!max) return `庇护范围未解锁（庇护所等级${unlockLevel}解锁）。当前可用庇护 0/0。`;
  const list = rooms.length ? rooms.join('、') : '无';
  return `伊甸已庇护${list}。当前可用庇护 ${rooms.length}/${max}。`;
}

const scope20Hint = computed(() => buildFloorScopeHint(getVisibleScopeRooms('20'), scope20Max.value, 3));
const scope19Hint = computed(() => buildFloorScopeHint(getVisibleScopeRooms('19'), scope19Max.value, 6));

const SHELTER_CATEGORY_ORDER_RAW = ['安全', '生存', '舒适', '扩展', '远征', '限制'] as const;
const SHELTER_CATEGORY_ORDER_DISPLAY = ['安全', '生存', '舒适', '远征&扩展', '限制'] as const;
const ABILITY_VALUE_ORDER = ['基础', '关键', '核心'] as const;

type AbilityCategoryRaw = (typeof SHELTER_CATEGORY_ORDER_RAW)[number];
type AbilityCategoryDisplay = (typeof SHELTER_CATEGORY_ORDER_DISPLAY)[number];
type AbilityValueTier = (typeof ABILITY_VALUE_ORDER)[number];

type ShelterBlueprintAbilityLite = {
  id: string;
  name: string;
  category: AbilityCategoryRaw;
  unlock_level: number;
  value_tier: AbilityValueTier;
  icon: string;
};

type AbilitySortMode = 'level_asc' | 'level_desc' | 'value_desc' | 'unlock_first';

type SkillCardView = {
  id: string;
  name: string;
  title: string;
  icon: string;
  level: number;
  category: AbilityCategoryRaw;
  rarity: 'green' | 'orange' | 'purple';
  valueTier: AbilityValueTier;
  unlocked: boolean;
};

function toDisplayCategory(category: AbilityCategoryRaw): AbilityCategoryDisplay {
  if (category === '扩展' || category === '远征') return '远征&扩展';
  return category;
}

function normalizeAbilityText(input: any): string {
  const s = String(input ?? '').trim();
  if (!s) return '';
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAbilityIcon(name: string): { icon: string; title: string } {
  const s = String(name ?? '').trim();
  if (!s) return { icon: '🧩', title: '' };
  const m = s.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*(.*)$/u);
  if (m) {
    const icon = String(m[1] ?? '').trim() || '🧩';
    const title = String(m[2] ?? '').trim() || s;
    return { icon, title };
  }
  return { icon: '🧩', title: s };
}

function toValueTier(level: number): AbilityValueTier {
  if (level >= 8) return '核心';
  if (level >= 5) return '关键';
  return '基础';
}

function toRarityByTier(tier: AbilityValueTier): 'green' | 'orange' | 'purple' {
  if (tier === '核心') return 'orange';
  if (tier === '关键') return 'purple';
  return 'green';
}

function parseShelterAbilityMasterList(raw: string): ShelterBlueprintAbilityLite[] {
  try {
    const doc = YAML.parse(String(raw ?? '')) ?? {};
    const abilitiesRaw = _.get(doc, 'abilities', {});
    if (!abilitiesRaw || typeof abilitiesRaw !== 'object' || Array.isArray(abilitiesRaw)) return [];
    const out: ShelterBlueprintAbilityLite[] = [];
    for (const [key, val] of Object.entries(abilitiesRaw)) {
      const name = String((val as any)?.name ?? key).trim();
      if (!name) continue;
      const categoryRaw = String((val as any)?.category ?? '限制').trim();
      const category = SHELTER_CATEGORY_ORDER_RAW.includes(categoryRaw as any)
        ? (categoryRaw as (typeof SHELTER_CATEGORY_ORDER_RAW)[number])
        : '限制';
      const unlockLevelRaw = Number((val as any)?.unlock_level ?? 1);
      const unlock_level = _.clamp(Number.isFinite(unlockLevelRaw) ? Math.floor(unlockLevelRaw) : 1, 1, 10);
      const parsed = parseAbilityIcon(name);
      const value_tier = toValueTier(unlock_level);
      out.push({
        id: String(key ?? '').trim() || `${category}-${unlock_level}-${name}`,
        name,
        category,
        unlock_level,
        value_tier,
        icon: parsed.icon,
      });
    }

    out.sort((a, b) => {
      if (a.unlock_level !== b.unlock_level) return a.unlock_level - b.unlock_level;
      const ca = SHELTER_CATEGORY_ORDER_RAW.indexOf(a.category);
      const cb = SHELTER_CATEGORY_ORDER_RAW.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    return out;
  } catch {
    return [];
  }
}

const shelterAbilityMasterList = parseShelterAbilityMasterList(shelterBlueprintRaw);

const shelterAbilitySummary = computed(() => {
  const value = String((store.data.庇护所 as any)?.庇护所能力总述 ?? '').trim();
  if (value) return value;
  return '庇护所性能解码尚未生成，等待脚本同步中。';
});

const unlockedAbilityNameSet = computed(() => {
  const set = new Set<string>();
  const raw = store.data.庇护所.庇护所能力 as any;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return set;

  for (const [key, val] of Object.entries(raw)) {
    const keyNorm = normalizeAbilityText(key);
    if (keyNorm) set.add(keyNorm);

    const valNameNorm = normalizeAbilityText((val as any)?.name ?? '');
    if (valNameNorm) set.add(valNameNorm);
  }
  return set;
});

const unlockedAbilityRawRecord = computed(() => {
  const raw = store.data.庇护所.庇护所能力 as any;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
});

const abilityCategoryFilter = ref<'全部' | AbilityCategoryDisplay>('全部');
const abilityUnlockFilter = ref<'全部' | '已解锁' | '未解锁'>('全部');
const abilitySortMode = ref<AbilitySortMode>('level_asc');

const allAbilityEntries = computed<SkillCardView[]>(() => {
  const unlocked = unlockedAbilityNameSet.value;
  const unlockedRaw = unlockedAbilityRawRecord.value;
  const currentLevel = Math.max(1, Math.floor(Number(shelterLevel.value) || 1));
  const fromMaster: SkillCardView[] = shelterAbilityMasterList.map(item => {
    const parsed = parseAbilityIcon(item.name);
    const keyNorm = normalizeAbilityText(item.id);
    const nameNorm = normalizeAbilityText(item.name);
    const rawHit = Object.prototype.hasOwnProperty.call(unlockedRaw, item.id);
    return {
      id: item.id,
      name: item.name,
      title: parsed.title,
      icon: item.icon || parsed.icon,
      level: item.unlock_level,
      category: item.category,
      rarity: toRarityByTier(item.value_tier),
      valueTier: item.value_tier,
      unlocked: rawHit || unlocked.has(nameNorm) || unlocked.has(keyNorm) || currentLevel >= item.unlock_level,
    };
  });
  if (fromMaster.length > 0) return fromMaster;

  const names = Array.from(unlocked).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  return names.map(name => {
    const parsed = parseAbilityIcon(name);
    return {
      id: name,
      name,
      title: parsed.title,
      icon: parsed.icon,
      level: 1,
      category: '限制',
      rarity: 'green',
      valueTier: '基础',
      unlocked: true,
    };
  });
});

const filteredAbilityEntries = computed(() => {
  return allAbilityEntries.value
    .filter(item => {
      if (abilityCategoryFilter.value !== '全部' && toDisplayCategory(item.category) !== abilityCategoryFilter.value)
        return false;
      if (abilityUnlockFilter.value === '已解锁' && !item.unlocked) return false;
      if (abilityUnlockFilter.value === '未解锁' && item.unlocked) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      const mode = abilitySortMode.value;
      if (mode === 'unlock_first') {
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        if (a.level !== b.level) return a.level - b.level;
      }
      if (mode === 'value_desc') {
        const va = ABILITY_VALUE_ORDER.indexOf(a.valueTier);
        const vb = ABILITY_VALUE_ORDER.indexOf(b.valueTier);
        if (va !== vb) return vb - va;
        if (a.level !== b.level) return b.level - a.level;
      }
      if (mode === 'level_desc') {
        if (a.level !== b.level) return b.level - a.level;
      } else if (a.level !== b.level) {
        return a.level - b.level;
      }
      const ca = SHELTER_CATEGORY_ORDER_RAW.indexOf(a.category);
      const cb = SHELTER_CATEGORY_ORDER_RAW.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
});

const abilityVisibleCategories = computed<AbilityCategoryDisplay[]>(() => {
  if (abilityCategoryFilter.value !== '全部') return [abilityCategoryFilter.value];
  return SHELTER_CATEGORY_ORDER_DISPLAY.slice();
});

const abilityMatrixRows = computed(() => {
  const categories = abilityVisibleCategories.value;
  const grouped = new Map<number, SkillCardView[]>();
  for (const item of filteredAbilityEntries.value) {
    const level = item.level;
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level)!.push(item);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([level, list]) => {
      const byCategory = categories.reduce<Record<string, SkillCardView[]>>((acc, cat) => {
        acc[cat] = [];
        return acc;
      }, {});
      for (const item of list) {
        const displayCategory = toDisplayCategory(item.category);
        byCategory[displayCategory].push(item);
      }
      return {
        level,
        label: shelterLevelLabelByLevel.value[level] ?? '',
        byCategory: byCategory as Record<AbilityCategoryDisplay, SkillCardView[]>,
      };
    });
});

function getAbilityCardsByCategory(
  row: { byCategory?: Record<string, SkillCardView[] | undefined> } | null | undefined,
  category: AbilityCategoryDisplay,
): SkillCardView[] {
  const cards = row?.byCategory?.[category];
  return Array.isArray(cards) ? cards : [];
}

const shelterLevelLabelByLevel = computed(() => {
  const map: Record<number, string> = {};
  try {
    const doc = YAML.parse(String(shelterBlueprintRaw ?? '')) ?? {};
    const levels = _.get(doc, 'levels', {});
    if (levels && typeof levels === 'object') {
      for (const [k, v] of Object.entries(levels)) {
        const lv = _.clamp(Number(k), 1, 10);
        if (!Number.isFinite(lv)) continue;
        map[lv] = String((v as any)?.label ?? '').trim();
      }
    }
  } catch {
    // ignore
  }
  return map;
});

// 20层房间数据
const floor20Rooms = [
  { number: '2001' },
  { number: '2002' },
  { number: '2003' },
  { number: '2004' },
  { number: '2005' },
  { number: '2006' },
  { number: '2007' },
  { number: '2008' },
];

// 19层房间数据
const floor19Rooms = [
  { number: '1901' },
  { number: '1902' },
  { number: '1903' },
  { number: '1904' },
  { number: '1905' },
  { number: '1906' },
  { number: '1907' },
  { number: '1908' },
];

function canEditFloor(floor: '20' | '19'): boolean {
  return scopeStore.canEditFloor(floor, shelterLevel.value);
}

function isFloorRoomSheltered(floor: '20' | '19', roomNumber: string): boolean {
  // 2001（庇护所本体）以及庇护所内部区域默认受庇护：不需要设置，也不占用“庇护名额”。
  if (floor === '20' && roomNumber === '2001') return true;
  return isRoomSheltered(scopeStore.scope, floor, roomNumber);
}

function toggleScopeEditor() {
  if (!canOpenScopeEditor.value) {
    toastr.warning('庇护范围功能在庇护所等级 3 解锁');
    return;
  }
  isScopeEditorOpen.value = !isScopeEditorOpen.value;
}

function closeScopeEditor() {
  isScopeEditorOpen.value = false;
}

watch(isScopeEditorOpen, open => {
  if (open) {
    resetScopeInstructionDraft();
    updateScopeModalViewport();
    bindParentScrollSync();
    return;
  }
  unbindParentScrollSync();
});

onUnmounted(() => {
  unbindParentScrollSync();
});

watch(scopeInstructionText, text => {
  if (!isScopeEditorOpen.value) return;
  if (scopeInstructionDirty.value) return;
  scopeInstructionDraft.value = text;
});

function clearScopeSelection() {
  const ok = window.confirm('确定清空已选择的庇护房间？');
  if (!ok) return;
  scopeStore.clearAll();
  toastr.info('已清空');
}

function getToggleRoomDisabledReason(floor: '20' | '19', roomNumber: string): string | null {
  if (floor === '20' && roomNumber === '2001') return '2001/庇护所内部区域默认为受庇护，不占用名额、无需设置';
  if (!canEditFloor(floor)) return `当前等级未解锁${floor}层庇护范围`;

  const max = floor === '20' ? scope20Max.value : scope19Max.value;
  const count = floor === '20' ? scope20Count.value : scope19Count.value;
  const selected = isFloorRoomSheltered(floor, roomNumber);
  if (!selected && max > 0 && count >= max) return `该楼层庇护范围已达上限（${max} 间）`;
  return null;
}

function toggleRoomFromSelector(floor: '20' | '19', roomNumber: string) {
  const reason = getToggleRoomDisabledReason(floor, roomNumber);
  if (reason) {
    toastr.warning(reason);
    return;
  }
  const res = scopeStore.toggleRoom(floor, roomNumber, shelterLevel.value);
  if (!res.ok) toastr.warning(res.reason ?? '无法修改庇护范围');
}

function onFloorRoomClick(floor: '20' | '19', roomNumber: string) {
  if (!isScopeEditorOpen.value) return;
  if (floor === '20' && roomNumber === '2001') {
    toastr.info('2001 为庇护所本体，无需设置庇护');
    return;
  }
  const res = scopeStore.toggleRoom(floor, roomNumber, shelterLevel.value);
  if (!res.ok) toastr.warning(res.reason ?? '无法修改庇护范围');
}

async function copyScopeInstruction() {
  await copyText(scopeInstructionDraft.value, { toast: true });
}

function sendScopeInstruction() {
  sendToChat(scopeInstructionDraft.value, {
    toast: true,
    successMessage: '已发送',
    failureMessage: '发送失败，请复制后手动发送',
    unavailableMessage: '无法发送：triggerSlash 不可用',
  });
}

function confirmAndSendScope() {
  const text = scopeInstructionDraft.value.trim();
  if (!text) {
    toastr.warning('请先选择要庇护的房间');
    return;
  }

  const res = sendToChat(text, {
    toast: true,
    successMessage: '已发送到聊天',
    failureMessage: '发送失败，已尝试复制，请手动发送',
    unavailableMessage: '无法直接发送，已尝试复制，请手动发送',
  });

  if (res.ok) {
    closeScopeEditor();
    return;
  }

  void copyText(text, { toast: false });
}

type EntranceRoomKey = 'entrance' | 'guest_a' | 'guest_b' | 'guest_c' | 'guest_d' | 'guest_e';
type CoreRoomKey =
  | 'living_room'
  | 'kitchen'
  | 'master_bedroom'
  | 'mini_theater_stage'
  | 'meeting_room'
  | 'second_bedroom';

const entranceRooms: Array<{ key: EntranceRoomKey; label: string; main?: boolean }> = [
  { key: 'entrance', label: '玄关', main: true },
  { key: 'guest_a', label: '客房A' },
  { key: 'guest_b', label: '客房B' },
  { key: 'guest_c', label: '客房C' },
  { key: 'guest_d', label: '客房D' },
  { key: 'guest_e', label: '客房E' },
];

const coreRooms: Array<{ key: CoreRoomKey; label: string; feature?: boolean }> = [
  { key: 'living_room', label: '客厅', feature: true },
  { key: 'kitchen', label: '餐厅/厨房', feature: true },
  { key: 'master_bedroom', label: '主卧' },
  { key: 'mini_theater_stage', label: '小影院&舞台' },
  { key: 'meeting_room', label: '会议室' },
  { key: 'second_bedroom', label: '次卧' },
];

function toNameArray(value: any): string[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function pickNameArray(paths: string[], fallback: string[] = []): string[] {
  for (const path of paths) {
    const names = toNameArray(_.get(store.data, path, []));
    if (names.length > 0) return names;
  }
  return fallback;
}

function getEntranceRoomResidents(key: EntranceRoomKey): string[] {
  if (key === 'entrance') return toNameArray(_.get(store.data, '房间.玄关.净化隔离区入住者', []));
  if (key === 'guest_a') return toNameArray(_.get(store.data, '房间.玄关.临时客房A入住者', []));
  if (key === 'guest_b') return toNameArray(_.get(store.data, '房间.玄关.临时客房B入住者', []));
  if (key === 'guest_c') return toNameArray(_.get(store.data, '房间.玄关.临时客房C入住者', []));
  if (key === 'guest_d') return toNameArray(_.get(store.data, '房间.玄关.临时客房D入住者', []));
  return toNameArray(_.get(store.data, '房间.玄关.临时客房E入住者', []));
}

function hasEntranceRoomResident(key: EntranceRoomKey): boolean {
  return getEntranceRoomResidents(key).length > 0;
}

function getEntranceRoomStatus(key: EntranceRoomKey): string {
  if (key === 'entrance') return '就绪';
  return hasEntranceRoomResident(key) ? '' : '空置';
}

function getEntranceRoomNames(key: EntranceRoomKey): string {
  const names = getEntranceRoomResidents(key);
  if (names.length === 0) return '';
  return formatRoomResidents(names, { maxShown: 3 });
}

function getCoreRoomResidents(key: CoreRoomKey): string[] {
  if (key === 'living_room') return toNameArray(_.get(store.data, '房间.核心区.客厅使用者', []));
  if (key === 'kitchen') return toNameArray(_.get(store.data, '房间.核心区.餐厅厨房使用者', []));
  if (key === 'master_bedroom') return toNameArray(_.get(store.data, '房间.核心区.主卧室使用者', []));
  if (key === 'mini_theater_stage') {
    return pickNameArray(['房间.核心区.小影院舞台使用者', '房间.核心区.主浴室使用者']);
  }
  if (key === 'meeting_room') return toNameArray(_.get(store.data, '房间.核心区.会议室使用者', []));
  return pickNameArray(['房间.核心区.次卧使用者', '房间.核心区.书房使用者']);
}

function hasCoreRoomResident(key: CoreRoomKey): boolean {
  return getCoreRoomResidents(key).length > 0;
}

function getCoreRoomNames(key: CoreRoomKey): string {
  const names = getCoreRoomResidents(key);
  if (names.length === 0) return '';
  return formatRoomResidents(names, { maxShown: 4 });
}

// 楼层房间辅助函数
function getFloorRoomData(floor: string, room: string) {
  const floorKey = floor === '20' ? '楼层20房间' : '楼层19房间';
  const rooms = store.data.房间.楼层房间[floorKey as keyof typeof store.data.房间.楼层房间];
  const raw = rooms?.[room] as any;
  const residents = Array.isArray(raw?.入住者) ? raw.入住者 : [];
  return {
    ...(raw && typeof raw === 'object' ? raw : {}),
    入住者: residents,
  };
}

function hasFloorResident(floor: string, room: string): boolean {
  return getFloorRoomData(floor, room).入住者.length > 0;
}

function getFloorRoomStatus(floor: string, room: string): string {
  const data = getFloorRoomData(floor, room);
  return data.入住者.length > 0 ? '已入住' : '空置';
}

function getFloorRoomCompactStatus(floor: string, room: string): string {
  const data = getFloorRoomData(floor, room);
  return data.入住者.length > 0 ? '' : '空置';
}

function getFloorRoomNames(floor: string, room: string): string {
  const data = getFloorRoomData(floor, room);
  if (data.入住者.length === 0) return '';

  return formatRoomResidents(data.入住者, { maxShown: room === '2001' ? 3 : 4, showTotal: room === '2001' });
}

function normalizeResidentName(name: any): string {
  const s = String(name ?? '').trim();
  if (!s) return '';
  // UI 显示：将酒馆变量占位符映射为“你”
  if (s === '{{user}}') return '你';
  return s;
}

function formatRoomResidents(
  rawNames: any,
  opts?: {
    maxShown?: number;
    showTotal?: boolean;
  },
): string {
  const maxShown = Math.max(1, Number(opts?.maxShown ?? 4));
  const showTotal = opts?.showTotal === true;

  const names = (Array.isArray(rawNames) ? rawNames : [])
    .map(normalizeResidentName)
    .filter((n: string) => n.length > 0);
  if (names.length === 0) return '-';

  // 让“你”优先显示在最前面
  const unique = _(names).uniq().value();
  const hasYou = unique.includes('你');
  const ordered = hasYou ? ['你', ...unique.filter(n => n !== '你')] : unique;

  const shown = ordered.slice(0, maxShown);
  const hidden = Math.max(0, ordered.length - shown.length);

  const base = hidden > 0 ? `${shown.join('、')}…(+${hidden})` : shown.join('、');
  return showTotal && ordered.length >= 2 ? `${base}（${ordered.length}）` : base;
}
</script>

<style scoped>
.roll-calibrate-btn {
  margin-top: 8px;
  width: auto;
  min-width: 68px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(170, 196, 255, 0.45);
  background: rgba(89, 130, 255, 0.14);
  color: #dce7ff;
  cursor: pointer;
  font-size: 0.78em;
  line-height: 1.2;
}

.roll-calibrate-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.new-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.72em;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #fff;
  background: rgba(229, 57, 53, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.new-tag--small {
  margin-left: 8px;
  padding: 0 6px;
  font-size: 0.68em;
  line-height: 1.4;
  opacity: 0.95;
}

.distance-item .label {
  /* 保持 DOM 结构不动，只修正文案（避免因编码/表情符号导致的补丁匹配问题） */
  position: relative;
  color: transparent;
}

.distance-item .label::after {
  content: '⏳ 距离上次保底升级';
  position: absolute;
  inset: 0;
  color: var(--text-color);
  pointer-events: none;
}

.scope-hint {
  margin: 2px 0 10px;
  font-size: 0.85em;
  color: var(--accent-cyan, #00b4d8);
  opacity: 0.9;
}

.scope-btn {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background-color: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9em;
}

.scope-btn--primary {
  border-color: rgba(0, 180, 216, 0.55);
  background-color: rgba(0, 180, 216, 0.18);
  color: #e8fbff;
  font-weight: 600;
}

.scope-btn--ghost {
  background-color: transparent;
}

.scope-preview {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: var(--shelter-scope-preview-bg, rgba(0, 0, 0, 0.25));
  color: var(--text-color);
  font-size: 0.9em;
  line-height: 1.4;
  word-break: break-word;
}

.scope-preview--editable {
  display: block;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  outline: none;
  resize: vertical;
  min-height: 92px;
  font-family: inherit;
}

.scope-preview--editable:focus {
  border-color: rgba(0, 180, 216, 0.55);
  box-shadow: 0 0 0 2px rgba(0, 180, 216, 0.2);
}

.scope-preview-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.scope-preview-hint {
  font-size: 0.8em;
  opacity: 0.85;
}

.scope-btn--mini {
  padding: 6px 10px;
  font-size: 0.85em;
}

/* --- 庇护范围：快速设置弹窗 --- */
.scope-modal-mask {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.55);
  padding-top: calc(12px + env(safe-area-inset-top));
  padding-right: calc(12px + env(safe-area-inset-right));
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
  padding-left: calc(12px + env(safe-area-inset-left));
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.scope-modal {
  width: min(560px, calc(100% - 8px));
  max-height: 100%;
  background: var(--shelter-scope-modal-bg, rgba(25, 28, 35, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.scope-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
}

.scope-modal-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-modal-header-actions .scope-btn {
  white-space: nowrap;
}

.scope-modal-title {
  font-weight: 700;
  color: var(--text-strong, #f1fa8c);
}

.scope-icon-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
}

.scope-modal-subtitle {
  padding: 0 12px 8px;
  font-size: 0.9em;
  opacity: 0.92;
}

.scope-modal-stats {
  display: flex;
  gap: 10px;
  padding: 0 12px 10px;
  flex-wrap: wrap;
  align-items: center;
}

.scope-modal-stats .stat {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.85em;
}

.stat-strong {
  color: var(--accent-cyan, #00b4d8);
  font-weight: 700;
}

.scope-link-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--accent-cyan, #00b4d8);
  font-size: 0.85em;
  cursor: pointer;
  padding: 6px 8px;
  opacity: 0.95;
}

.scope-link-btn:hover {
  opacity: 1;
}

.scope-modal-body {
  padding: 0 12px 12px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.scope-floor + .scope-floor {
  margin-top: 14px;
}

.scope-floor-title {
  font-weight: 700;
  margin-bottom: 8px;
}

.scope-locked-hint {
  font-size: 0.85em;
  opacity: 0.8;
  margin: -4px 0 8px;
}

.scope-room-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.scope-room-grid.disabled {
  opacity: 0.55;
}

.scope-room-chip {
  text-align: left;
  border-radius: 12px;
  padding: 10px 10px 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  cursor: pointer;
  min-height: 56px;
}

.scope-room-chip .chip-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.scope-room-chip .chip-number {
  font-weight: 800;
}

.scope-room-chip .chip-mark {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-weight: 800;
  opacity: 0.85;
}

.scope-room-chip .chip-sub {
  margin-top: 6px;
  font-size: 0.8em;
  opacity: 0.9;
}

.scope-room-chip.selected {
  border-color: rgba(241, 250, 140, 0.6);
  background: radial-gradient(
    circle at 30% 20%,
    rgba(241, 250, 140, 0.18),
    rgba(241, 250, 140, 0.06) 55%,
    rgba(255, 255, 255, 0.04)
  );
}

.scope-room-chip.selected .chip-mark {
  background: rgba(241, 250, 140, 0.18);
  border-color: rgba(241, 250, 140, 0.6);
}

.scope-room-chip.core {
  border-color: rgba(241, 250, 140, 0.35);
  background: rgba(241, 250, 140, 0.06);
}

.scope-room-chip.disabled {
  opacity: 0.55;
}

.zone-scope-hint {
  margin: 6px 0 10px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(241, 250, 140, 0.18);
  background: rgba(241, 250, 140, 0.05);
  color: rgba(241, 250, 140, 0.92);
  font-size: 0.8em;
  line-height: 1.3;
}

.scope-details {
  margin-top: 14px;
  border-top: 1px dashed rgba(255, 255, 255, 0.12);
  padding-top: 10px;
}

.scope-details summary {
  cursor: pointer;
  opacity: 0.9;
}

.scope-modal-footer {
  padding: 10px 12px 12px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--shelter-scope-modal-bg, rgba(25, 28, 35, 0.98));
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  z-index: 2;
}

.scope-footer-hint {
  flex: 1 1 100%;
  order: 1;
  margin-bottom: 4px;
  padding: 8px 12px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(255, 180, 80, 0.12), rgba(255, 140, 0, 0.08));
  border: 1px solid rgba(255, 180, 80, 0.25);
  font-size: 0.8em;
  color: rgba(255, 220, 150, 0.95);
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 6px;
}

.scope-footer-hint::before {
  content: '💡';
  font-size: 1.1em;
}

.scope-footer-spacer {
  display: none;
}

.shelter-redesign .shelter-grid {
  gap: 10px;
}

.shelter-redesign .shelter-top-metrics {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  order: 1;
}

.shelter-redesign .shelter-summary-block,
.shelter-redesign .shelter-ability-block,
.shelter-redesign .shelter-map-block {
  grid-column: 1 / -1;
  margin: 0;
}

.shelter-redesign .shelter-summary-block {
  order: 3;
}

.shelter-redesign .shelter-ability-block {
  order: 4;
}

.shelter-redesign .shelter-map-block {
  order: 5;
}

.shelter-redesign .shelter-item {
  padding: 10px 11px;
  border-radius: 12px;
}

.shelter-redesign .shelter-item--metric {
  padding: 6px 9px;
  border-radius: 10px;
  min-height: 42px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid rgba(150, 169, 214, 0.3);
  background: var(--shelter-metric-card-bg, linear-gradient(165deg, rgba(16, 22, 38, 0.94), rgba(14, 19, 32, 0.78)));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.shelter-redesign .shelter-item--level {
  border-color: rgba(146, 227, 255, 0.34);
}

.shelter-redesign .shelter-item--roll {
  border-color: rgba(170, 153, 255, 0.3);
}

.shelter-redesign .shelter-item--pity {
  border-color: rgba(255, 206, 134, 0.3);
}

.shelter-redesign .shelter-item--expansion {
  padding: 8px 10px;
  order: 2;
}

.shelter-redesign .shelter-item .label {
  margin-bottom: 4px;
}

.shelter-redesign .shelter-item .value {
  line-height: 1.45;
}

.shelter-redesign .shelter-item--metric .label {
  margin-bottom: 2px;
  font-size: 0.76em;
  line-height: 1.2;
  opacity: 0.9;
}

.shelter-redesign .shelter-item--metric .value {
  font-size: 0.84em;
  line-height: 1.16;
}

.shelter-redesign .metric-value {
  min-height: 0;
}

.shelter-redesign .metric-value--level {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.shelter-redesign .metric-number {
  font-size: 1.34em;
  line-height: 1;
  font-weight: 800;
  color: var(--shelter-metric-number-color, #e8f2ff);
  text-shadow: 0 0 14px rgba(155, 211, 255, 0.2);
}

.shelter-redesign .metric-unit {
  font-size: 0.72em;
  opacity: 0.78;
}

.shelter-redesign .metric-value--roll {
  font-size: 0.84em;
  font-weight: 600;
  line-height: 1.16;
}

.shelter-redesign .metric-value--pity {
  font-size: 0.84em;
  font-weight: 600;
  line-height: 1.16;
}

.shelter-redesign .metric-roll-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.shelter-redesign .roll-calibrate-btn {
  margin-top: 0;
  padding: 1px 10px;
  min-width: 56px;
  min-height: 22px;
  font-size: 0.68em;
  line-height: 1.1;
  align-self: auto;
  border-color: rgba(150, 190, 255, 0.52);
  background: rgba(82, 124, 236, 0.16);
}

.shelter-redesign .expansion-list {
  gap: 5px;
}

.shelter-redesign .expansion-card {
  padding: 5px 7px;
  min-height: 0;
}

.shelter-redesign .map-toggle-btn--expand {
  display: none;
}

.shelter-redesign .map-toggle-btn--scope {
  width: auto;
  min-width: 110px;
  margin: 2px 0 0;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 228, 166, 0.45);
  background: var(--shelter-scope-btn-bg, linear-gradient(180deg, rgba(52, 162, 104, 0.2), rgba(31, 107, 71, 0.18)));
  box-shadow: inset 0 0 0 1px rgba(182, 255, 217, 0.08);
}

.shelter-redesign .map-toggle-btn--scope .toggle-text {
  font-size: 0.74em;
  letter-spacing: 0.01em;
  font-weight: 700;
}

.shelter-redesign .map-toggle-btn--scope .toggle-icon {
  color: var(--shelter-scope-btn-icon-color, #bfffd9);
  font-weight: 900;
}

.shelter-redesign .scope-hint {
  margin-top: 6px;
  margin-bottom: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--shelter-scope-hint-bg, rgba(132, 90, 223, 0.14));
  color: var(--shelter-scope-hint-color, #d9c8ff);
  font-size: 0.76em;
}

.shelter-redesign .map-container {
  margin-top: 2px;
  padding: 6px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shelter-redesign .map-quick-zones {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  align-items: stretch;
}

.shelter-redesign .map-zone {
  padding: 6px;
  margin-bottom: 0;
  border-radius: 9px;
  border: 1px solid rgba(120, 134, 164, 0.22);
  background: var(--shelter-map-zone-bg, linear-gradient(180deg, rgba(8, 12, 22, 0.64), rgba(8, 12, 22, 0.32)));
}

.shelter-redesign .map-zone--compact {
  padding: 6px;
  border-color: rgba(136, 152, 186, 0.32);
  background: var(--shelter-map-zone-compact-bg, linear-gradient(165deg, rgba(9, 14, 26, 0.8), rgba(9, 13, 24, 0.46)));
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.shelter-redesign .map-zone--entrance {
  box-shadow: inset 0 0 0 1px rgba(105, 180, 255, 0.08);
}

.shelter-redesign .map-zone--core {
  box-shadow: inset 0 0 0 1px rgba(241, 250, 140, 0.08);
}

.shelter-redesign .map-zone--floor {
  padding: 7px;
}

.shelter-redesign .zone-label {
  margin-bottom: 3px;
  font-size: 0.8em;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.shelter-redesign .zone-label--compact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.shelter-redesign .zone-label-main {
  min-width: 0;
}

.shelter-redesign .zone-label-sub {
  flex: 0 0 auto;
  font-size: 0.68em;
  font-weight: 500;
  opacity: 0.85;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid rgba(167, 184, 220, 0.25);
  background: rgba(132, 148, 180, 0.14);
}

.shelter-redesign .zone-scope-hint {
  margin: 2px 0 4px;
  padding: 3px 6px;
  font-size: 0.7em;
  border-radius: 7px;
}

.shelter-redesign .floor-indicator {
  margin: 3px 0 4px;
  font-size: 0.68em;
  text-align: center;
  opacity: 0.82;
  display: none;
}

.shelter-redesign .room-grid {
  display: grid;
  gap: 4px;
}

.shelter-redesign .entrance-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.shelter-redesign .core-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.shelter-redesign .floor-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.shelter-redesign .room-cell {
  position: relative;
  border: 1px solid rgba(225, 206, 128, 0.26);
  border-radius: 8px;
  padding: 5px 6px;
  min-height: 46px;
  background: linear-gradient(180deg, rgba(233, 218, 144, 0.12), rgba(172, 152, 92, 0.05));
}

.shelter-redesign .room-cell--compact {
  min-height: 34px;
  padding: 3px 5px;
  border-color: rgba(225, 206, 128, 0.28);
  background: linear-gradient(180deg, rgba(236, 222, 148, 0.11), rgba(166, 148, 90, 0.04));
}

.shelter-redesign .room-cell--feature {
  border-color: rgba(241, 216, 121, 0.32);
  background: linear-gradient(180deg, rgba(238, 214, 112, 0.14), rgba(161, 141, 78, 0.06));
}

.shelter-redesign .room-cell--entrance-main {
  border-color: rgba(241, 216, 121, 0.36);
  background: linear-gradient(180deg, rgba(238, 214, 112, 0.15), rgba(161, 141, 78, 0.06));
}

.shelter-redesign .room-cell.scope-editable {
  cursor: pointer;
}

.shelter-redesign .room-number {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78em;
  font-weight: 700;
}

.shelter-redesign .room-cell--compact .room-number {
  font-size: 0.72em;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shelter-redesign .room-number::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(172, 172, 186, 0.65);
  box-shadow: 0 0 0 2px rgba(90, 90, 106, 0.15);
  flex: 0 0 auto;
}

.shelter-redesign .room-cell.occupied .room-number::before {
  background: #61d88d;
  box-shadow: 0 0 0 2px rgba(97, 216, 141, 0.26);
}

.shelter-redesign .room-cell.occupied {
  border-color: rgba(98, 212, 140, 0.55);
  background: radial-gradient(circle at 18% 16%, rgba(121, 246, 168, 0.22), rgba(30, 88, 58, 0.18) 70%);
  box-shadow:
    inset 0 0 0 1px rgba(152, 255, 192, 0.18),
    0 0 12px rgba(98, 212, 140, 0.16);
}

.shelter-redesign .room-cell.occupied .room-number {
  color: #cfffe3;
}

.shelter-redesign .room-value {
  margin-top: 1px;
  font-size: 0.68em;
  opacity: 0.78;
  line-height: 1.1;
}

.shelter-redesign .room-cell--compact .room-value {
  font-size: 0.62em;
  line-height: 1.05;
  opacity: 0.7;
}

.shelter-redesign .room-value:empty {
  display: none;
}

.shelter-redesign .room-resident {
  margin-top: 1px;
  font-size: 0.69em;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shelter-redesign .room-cell--compact .room-resident {
  margin-top: 0;
  font-size: 0.64em;
  line-height: 1.1;
}

.shelter-redesign .room-resident:empty {
  display: none;
}

@media (max-width: 760px) {
  .shelter-redesign .shelter-top-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shelter-redesign .shelter-item--pity {
    grid-column: 1 / -1;
  }

  .shelter-redesign .map-quick-zones {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .shelter-redesign .floor-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .shelter-redesign .zone-label--compact {
    align-items: center;
  }
}

@media (max-width: 560px) {
  .shelter-redesign .floor-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .shelter-redesign .shelter-top-metrics {
    grid-template-columns: 1fr;
  }

  .shelter-redesign .shelter-item--pity {
    grid-column: auto;
  }

  .shelter-redesign .shelter-item--metric {
    min-height: 40px;
  }

  .shelter-redesign .metric-number {
    font-size: 1.26em;
  }

  .shelter-redesign .floor-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shelter-redesign .zone-label-sub {
    display: none;
  }
}

.shelter-redesign .room-cell.sheltered {
  border: 1px solid rgba(255, 186, 82, 0.58);
  outline: none;
  box-shadow: inset 0 0 16px rgba(255, 188, 86, 0.16);
  background: radial-gradient(circle at 18% 12%, rgba(255, 208, 130, 0.2), rgba(255, 255, 255, 0.02) 55%);
}

.shelter-redesign .room-cell.sheltered .room-number {
  color: #ffd08a;
  text-shadow: none;
}

.shelter-redesign .room-cell.sheltered.occupied {
  border-color: rgba(98, 212, 140, 0.62);
  box-shadow:
    inset 0 0 16px rgba(98, 212, 140, 0.18),
    0 0 12px rgba(98, 212, 140, 0.16);
}

.shelter-redesign .room-cell.sheltered.occupied .room-number {
  color: #cfffe3;
}

.shelter-redesign .room-cell.sheltered .room-number::after {
  content: '';
}

.shelter-redesign .scope-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.62em;
  line-height: 1.35;
  opacity: 0.96;
  background: rgba(132, 138, 160, 0.22);
  border: 1px solid rgba(164, 172, 194, 0.35);
  color: #cfd5e8;
  pointer-events: none;
}

.shelter-redesign .scope-badge.on {
  background: rgba(182, 121, 255, 0.2);
  border-color: rgba(197, 149, 255, 0.58);
  color: #e8dcff;
}

.shelter-redesign .ability-list {
  margin-top: 6px;
  padding: 8px 9px;
  border-radius: 10px;
}

.shelter-redesign .shelter-ability-block .collapse-toggle-btn {
  border-radius: 12px;
  border: 1px solid rgba(241, 216, 121, 0.36);
  background: var(--shelter-ability-toggle-bg, linear-gradient(180deg, rgba(72, 82, 112, 0.58), rgba(48, 55, 78, 0.52)));
  box-shadow: inset 0 0 0 1px rgba(255, 244, 201, 0.08);
}

.shelter-redesign .shelter-ability-block .collapse-toggle-btn .toggle-text {
  font-weight: 800;
  letter-spacing: 0.01em;
}

.shelter-redesign .ability-toolbar {
  gap: 6px;
  margin-bottom: 7px;
}

.shelter-redesign .ability-control {
  gap: 3px;
}

.shelter-redesign .ability-select {
  min-height: 30px;
  padding: 4px 8px;
  font-size: 0.8em;
}

.shelter-redesign .ability-legend {
  margin-bottom: 8px;
  font-size: 0.76em;
}

.shelter-redesign .ability-grid-head {
  margin-bottom: 4px;
  padding-bottom: 4px;
}

.shelter-redesign .ability-grid-cards {
  gap: 4px;
}

.shelter-redesign .skill-card {
  padding: 6px 8px;
  min-height: 0;
}

.shelter-redesign .skill-main--compact {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.2;
}

.shelter-redesign .skill-main--compact .skill-icon {
  font-size: 0.92em;
}

.shelter-redesign .skill-main--compact .skill-name {
  flex: 1;
  font-size: 0.82em;
}

.shelter-redesign .skill-main--compact .skill-dot {
  width: 7px;
  height: 7px;
}

.shelter-redesign .skill-main--compact .new-tag--small {
  margin-left: 4px;
}

:global(:root[data-theme='jade_green']) #shelter-section,
:global(:root[data-theme='parchment']) #shelter-section,
:global(:root[data-theme='milky']) #shelter-section {
  --shelter-metric-card-bg: linear-gradient(165deg, rgba(255, 255, 255, 0.8), rgba(237, 244, 252, 0.72));
  --shelter-metric-number-color: #1f4468;
  --shelter-scope-btn-bg: linear-gradient(180deg, rgba(78, 158, 112, 0.22), rgba(56, 132, 90, 0.18));
  --shelter-scope-btn-icon-color: #246247;
  --shelter-scope-hint-bg: rgba(124, 98, 186, 0.18);
  --shelter-scope-hint-color: #4b3877;
  --shelter-map-zone-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(236, 242, 248, 0.68));
  --shelter-map-zone-compact-bg: linear-gradient(165deg, rgba(250, 252, 255, 0.82), rgba(231, 238, 247, 0.74));
  --shelter-ability-toggle-bg: linear-gradient(180deg, rgba(172, 184, 210, 0.35), rgba(150, 164, 194, 0.3));
  --shelter-scope-modal-bg: rgba(248, 251, 255, 0.98);
  --shelter-scope-preview-bg: rgba(88, 108, 136, 0.12);
}

:global(:root[data-theme='jade_green']) #shelter-section .shelter-item--metric,
:global(:root[data-theme='parchment']) #shelter-section .shelter-item--metric,
:global(:root[data-theme='milky']) #shelter-section .shelter-item--metric,
:global(:root[data-theme='jade_green']) #shelter-section .map-zone,
:global(:root[data-theme='parchment']) #shelter-section .map-zone,
:global(:root[data-theme='milky']) #shelter-section .map-zone,
:global(:root[data-theme='jade_green']) #shelter-section .map-zone--compact,
:global(:root[data-theme='parchment']) #shelter-section .map-zone--compact,
:global(:root[data-theme='milky']) #shelter-section .map-zone--compact {
  border-color: rgba(92, 116, 152, 0.26);
}

:global(:root[data-theme='jade_green']) #shelter-section .room-cell:not(.occupied):not(.sheltered),
:global(:root[data-theme='parchment']) #shelter-section .room-cell:not(.occupied):not(.sheltered),
:global(:root[data-theme='milky']) #shelter-section .room-cell:not(.occupied):not(.sheltered) {
  border-color: rgba(104, 124, 152, 0.42);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(233, 240, 248, 0.72));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.56);
}

:global(:root[data-theme='jade_green']) #shelter-section .room-cell--compact:not(.occupied):not(.sheltered),
:global(:root[data-theme='parchment']) #shelter-section .room-cell--compact:not(.occupied):not(.sheltered),
:global(:root[data-theme='milky']) #shelter-section .room-cell--compact:not(.occupied):not(.sheltered) {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(236, 243, 250, 0.76));
}

:global(:root[data-theme='jade_green']) #shelter-section .room-cell:not(.occupied):not(.sheltered) .room-number::before,
:global(:root[data-theme='parchment']) #shelter-section .room-cell:not(.occupied):not(.sheltered) .room-number::before,
:global(:root[data-theme='milky']) #shelter-section .room-cell:not(.occupied):not(.sheltered) .room-number::before {
  background: rgba(120, 132, 154, 0.76);
  box-shadow: 0 0 0 2px rgba(92, 106, 132, 0.18);
}

:global(:root[data-theme='jade_green']) #shelter-section .roll-calibrate-btn,
:global(:root[data-theme='parchment']) #shelter-section .roll-calibrate-btn,
:global(:root[data-theme='milky']) #shelter-section .roll-calibrate-btn {
  border-color: rgba(72, 112, 174, 0.42);
  background: rgba(82, 124, 236, 0.18);
  color: #15406e;
}

:global(:root[data-theme='jade_green']) #shelter-section .scope-modal,
:global(:root[data-theme='parchment']) #shelter-section .scope-modal,
:global(:root[data-theme='milky']) #shelter-section .scope-modal,
:global(:root[data-theme='jade_green']) #shelter-section .scope-modal-footer,
:global(:root[data-theme='parchment']) #shelter-section .scope-modal-footer,
:global(:root[data-theme='milky']) #shelter-section .scope-modal-footer {
  border-color: rgba(88, 108, 136, 0.26);
}

:global(:root[data-theme='jade_green']) #shelter-section .scope-btn,
:global(:root[data-theme='parchment']) #shelter-section .scope-btn,
:global(:root[data-theme='milky']) #shelter-section .scope-btn,
:global(:root[data-theme='jade_green']) #shelter-section .scope-icon-btn,
:global(:root[data-theme='parchment']) #shelter-section .scope-icon-btn,
:global(:root[data-theme='milky']) #shelter-section .scope-icon-btn,
:global(:root[data-theme='jade_green']) #shelter-section .scope-room-chip,
:global(:root[data-theme='parchment']) #shelter-section .scope-room-chip,
:global(:root[data-theme='milky']) #shelter-section .scope-room-chip {
  border-color: rgba(92, 116, 152, 0.26);
  background: rgba(255, 255, 255, 0.65);
  color: var(--text-color);
}

:global(:root[data-theme='jade_green']) #shelter-section .scope-room-chip.selected,
:global(:root[data-theme='parchment']) #shelter-section .scope-room-chip.selected,
:global(:root[data-theme='milky']) #shelter-section .scope-room-chip.selected {
  border-color: rgba(201, 157, 72, 0.56);
}

:global(:root[data-theme='jade_green']) #shelter-section .zone-scope-hint,
:global(:root[data-theme='parchment']) #shelter-section .zone-scope-hint,
:global(:root[data-theme='milky']) #shelter-section .zone-scope-hint {
  border-color: rgba(201, 157, 72, 0.24);
  background: rgba(235, 194, 108, 0.14);
  color: #6d4d16;
}

@media (max-width: 520px) {
  .scope-room-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>

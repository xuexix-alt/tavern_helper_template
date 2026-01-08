<template>
  <section id="shelter-section" class="section">
    <h2 class="section-title">🏰 庇护所信息 🏰</h2>
    <div class="shelter-grid">
      <div class="shelter-item">
        <div class="label">⚜️ 庇护所等级</div>
        <div class="value">{{ store.data.庇护所.庇护所等级 }}</div>
      </div>
      <div class="shelter-item">
        <div class="label">🎲 今日投掷点数</div>
        <div class="value">{{ store.data.庇护所.今日投掷点数 }}</div>
      </div>
      <div class="shelter-item">
        <div class="label">⏳ 距离下次保底升级</div>
        <div class="value">{{ store.data.庇护所.距离上次升级 }}</div>
      </div>
      <div class="shelter-item">
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
      <div class="shelter-item">
        <div class="label">🗺️ 伊甸空间地图</div>
        <button class="map-toggle-btn" @click="isMapExpanded = !isMapExpanded">
          <span class="toggle-icon">{{ isMapExpanded ? '▼' : '▶' }}</span>
          <span class="toggle-text">{{ isMapExpanded ? '收起地图' : '展开地图' }}</span>
        </button>
        <button class="map-toggle-btn" :disabled="!canOpenScopeEditor" @click="toggleScopeEditor">
          <span class="toggle-icon">{{ isScopeEditorOpen ? '✕' : '➕' }}</span>
          <span class="toggle-text">
            🛡️ 设置庇护范围（20层 {{ scope20Count }}/{{ scope20Max }}，19层
            {{ scope19Max ? `${scope19Count}/${scope19Max}` : '未解锁' }}）
          </span>
        </button>
        <div v-if="canOpenScopeEditor && !isScopeEditorOpen" class="scope-hint">
          当前等级获得升级庇护范围权限，点击查看
        </div>

        <div v-show="isMapExpanded" class="map-container">
          <!-- 玄关区域 -->
          <div class="map-zone">
            <div class="zone-label">🚪 玄关 - 净化区</div>
            <div class="room-grid entrance-grid">
              <div class="room-cell highlight">
                <div class="room-number">玄关</div>
                <div class="room-value">{{ getEntranceStatus() }}</div>
                <div class="room-resident">净化/隔离区</div>
              </div>
              <div class="room-cell" :class="{ occupied: hasTempGuestA }">
                <div class="room-number">临时客房 A</div>
                <div class="room-value">{{ hasTempGuestA ? '已入住' : '空置' }}</div>
                <div class="room-resident">{{ getTempGuestNames('A') }}</div>
              </div>
              <div class="room-cell" :class="{ occupied: hasTempGuestB }">
                <div class="room-number">临时客房 B</div>
                <div class="room-value">{{ hasTempGuestB ? '已入住' : '空置' }}</div>
                <div class="room-resident">{{ getTempGuestNames('B') }}</div>
              </div>
            </div>
          </div>

          <!-- 核心区 -->
          <div class="map-zone">
            <div class="zone-label">💎 核心生活区</div>
            <div class="room-grid core-grid">
              <div class="room-cell highlight">
                <div class="room-number">客厅</div>
                <div class="room-value">公共区域</div>
                <div class="room-resident">-</div>
              </div>
              <div class="room-cell highlight">
                <div class="room-number">餐厅/厨房</div>
                <div class="room-value">万象合成终端</div>
                <div class="room-resident">-</div>
              </div>
              <div class="room-cell" :class="{ occupied: hasBedroomUser }">
                <div class="room-number">主卧室</div>
                <div class="room-value">{{ hasBedroomUser ? '使用中' : '空闲' }}</div>
                <div class="room-resident">{{ getBedroomUserNames() }}</div>
              </div>
              <div class="room-cell" :class="{ occupied: hasBathroomUser }">
                <div class="room-number">主浴室</div>
                <div class="room-value">{{ hasBathroomUser ? '使用中' : '空闲' }}</div>
                <div class="room-resident">{{ getBathroomUserNames() }}</div>
              </div>
            </div>
          </div>

          <!-- 20层走廊 -->
          <div class="map-zone">
            <div class="zone-label">🏢 20层 - 公寓走廊</div>
            <div class="zone-scope-hint">{{ scope20Hint }}</div>
            <div class="floor-indicator">↓ 通往外部楼梯</div>
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
                  🛡️
                </div>
                <div class="room-number">{{ room.number }}</div>
                <div class="room-value">{{ getFloorRoomStatus('20', room.number) }}</div>
                <div class="room-resident">{{ getFloorRoomNames('20', room.number) }}</div>
              </div>
            </div>
          </div>

          <!-- 19层走廊 -->
          <div class="map-zone">
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
                  🛡️
                </div>
                <div class="room-number">{{ room.number }}</div>
                <div class="room-value">{{ getFloorRoomStatus('19', room.number) }}</div>
                <div class="room-resident">{{ getFloorRoomNames('19', room.number) }}</div>
              </div>
            </div>
            <div class="floor-indicator">↓ 通往18层</div>
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
                <button class="scope-icon-btn" type="button" aria-label="关闭" @click="closeScopeEditor">✕</button>
              </div>

              <div class="scope-modal-subtitle">
                点击房间卡片即可添加/移除；设置完成后点击“确定并发送”即可同步给伊甸。
              </div>

              <div class="scope-modal-stats">
                <div class="stat">
                  20层：<span class="stat-strong">{{ scope20Count }}/{{ scope20Max }}</span>
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

                <details class="scope-details">
                  <summary>预览发送文本（调试用）</summary>
                  <div v-if="scopeInstructionText" class="scope-preview">
                    {{ scopeInstructionText }}
                  </div>
                  <div v-else class="scope-preview">(尚未选择任何房间)</div>
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
      <div class="shelter-item">
        <button class="collapse-toggle-btn" @click="isAbilityExpanded = !isAbilityExpanded">
          <span class="toggle-icon">{{ isAbilityExpanded ? '▼' : '▶' }}</span>
          <span class="toggle-text">💡 庇护所能力列表</span>
        </button>
        <div v-show="isAbilityExpanded" class="ability-list">
          <template v-if="abilities.length > 0">
            <div v-for="(ab, idx) in abilities" :key="idx" class="ability-card">
              <div class="name">{{ ab.name }}</div>
              <div class="desc">{{ ab.desc }}</div>
            </div>
          </template>
          <template v-else>(暂无能力)</template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useDataStore } from '../../store';
import { useShelterScopeStore } from '../../shelterScopeStore';
import { floorRoomCapacity, isRoomSheltered } from '../../../util/shelter_scope';
import { copyText, sendToChat } from '../../outbound';

const store = useDataStore();
const scopeStore = useShelterScopeStore();
// 默认折叠，保持原有交互
const isMapExpanded = ref(false);
const isAbilityExpanded = ref(false);
const isScopeEditorOpen = ref(false);
const scopeModalViewportTop = ref(0);
const scopeModalViewportHeight = ref(0);
let parentScrollTarget: HTMLElement | Window | null = null;

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

function bindParentScrollSync() {
  const frameEl = window.frameElement as HTMLElement | null;
  if (!frameEl) return;
  parentScrollTarget = getParentScrollContainer(frameEl);
  const handler = updateScopeModalViewport;

  if (parentScrollTarget instanceof Window) {
    parentScrollTarget.addEventListener('scroll', handler, { passive: true });
    parentScrollTarget.addEventListener('resize', handler, { passive: true });
  } else {
    parentScrollTarget.addEventListener('scroll', handler, { passive: true });
    window.parent?.addEventListener?.('resize', handler, { passive: true });
  }
}

function unbindParentScrollSync() {
  const handler = updateScopeModalViewport;
  if (parentScrollTarget instanceof Window) {
    parentScrollTarget.removeEventListener('scroll', handler as any);
    parentScrollTarget.removeEventListener('resize', handler as any);
  } else if (parentScrollTarget) {
    parentScrollTarget.removeEventListener('scroll', handler as any);
    window.parent?.removeEventListener?.('resize', handler as any);
  }
  parentScrollTarget = null;
}

const shelterLevel = computed(() => {
  const lv = Number(store.data.庇护所.庇护所等级);
  return Number.isFinite(lv) ? lv : 1;
});

const canOpenScopeEditor = computed(() => shelterLevel.value >= 3);

const scope20Max = computed(() => floorRoomCapacity(shelterLevel.value, '20'));
const scope19Max = computed(() => floorRoomCapacity(shelterLevel.value, '19'));
const scope20Count = computed(() => (scopeStore.scope['20'] ?? []).length);
const scope19Count = computed(() => (scopeStore.scope['19'] ?? []).length);

const scopeInstructionText = computed(() => scopeStore.buildInstructionText());

function buildFloorScopeHint(rooms: string[], max: number, unlockLevel: number): string {
  if (!max) return `庇护范围未解锁（庇护所等级${unlockLevel}解锁）。当前可用庇护 0/0。`;
  const list = rooms.length ? rooms.join('、') : '无';
  return `伊甸已庇护${list}。当前可用庇护 ${rooms.length}/${max}。`;
}

const scope20Hint = computed(() => buildFloorScopeHint(scopeStore.scope['20'] ?? [], scope20Max.value, 3));
const scope19Hint = computed(() => buildFloorScopeHint(scopeStore.scope['19'] ?? [], scope19Max.value, 6));

const abilities = computed(() => {
  const raw = store.data.庇护所.庇护所能力 as any;
  if (Array.isArray(raw)) return raw;
  return Object.entries(raw ?? {}).map(([name, val]) => ({
    name,
    desc: (val as any)?.desc ?? '',
  }));
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
  { number: '2009' },
  { number: '2010' },
  { number: '2011' },
  { number: '2012' },
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
  { number: '1909' },
  { number: '1910' },
  { number: '1911' },
  { number: '1912' },
];

function canEditFloor(floor: '20' | '19'): boolean {
  return scopeStore.canEditFloor(floor, shelterLevel.value);
}

function isFloorRoomSheltered(floor: '20' | '19', roomNumber: string): boolean {
  if (floor === '20' && roomNumber === '2001') return false;
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
    updateScopeModalViewport();
    bindParentScrollSync();
    return;
  }
  unbindParentScrollSync();
});

onUnmounted(() => {
  unbindParentScrollSync();
});

function clearScopeSelection() {
  const ok = window.confirm('确定清空已选择的庇护房间？');
  if (!ok) return;
  scopeStore.clearAll();
  toastr.info('已清空');
}

function getToggleRoomDisabledReason(floor: '20' | '19', roomNumber: string): string | null {
  if (floor === '20' && roomNumber === '2001') return '2001 为庇护所本体，无需设置庇护';
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
  await copyText(scopeInstructionText.value, { toast: true });
}

function sendScopeInstruction() {
  sendToChat(scopeInstructionText.value, {
    toast: true,
    successMessage: '已发送',
    failureMessage: '发送失败，请复制后手动发送',
    unavailableMessage: '无法发送：triggerSlash 不可用',
  });
}

function confirmAndSendScope() {
  const text = scopeInstructionText.value;
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

// 玄关区域计算属性
const hasTempGuestA = computed(() => store.data.房间.玄关.临时客房A入住者.length > 0);

const hasTempGuestB = computed(() => store.data.房间.玄关.临时客房B入住者.length > 0);

function getTempGuestNames(room: 'A' | 'B'): string {
  const names = room === 'A' ? store.data.房间.玄关.临时客房A入住者 : store.data.房间.玄关.临时客房B入住者;
  return names.length > 0 ? names.join('、') : '-';
}

function getEntranceStatus(): string {
  // 玄关总是显示"就绪"
  return '就绪';
}

// 核心区计算属性
const hasBedroomUser = computed(() => store.data.房间.核心区.主卧室使用者.length > 0);

const hasBathroomUser = computed(() => store.data.房间.核心区.主浴室使用者.length > 0);

function getBedroomUserNames(): string {
  const names = store.data.房间.核心区.主卧室使用者;
  return names.length > 0 ? names.join('、') : '-';
}

function getBathroomUserNames(): string {
  const names = store.data.房间.核心区.主浴室使用者;
  return names.length > 0 ? names.join('、') : '-';
}

// 楼层房间辅助函数
function getFloorRoomData(floor: string, room: string) {
  const floorKey = floor === '20' ? '楼层20房间' : '楼层19房间';
  const rooms = store.data.房间.楼层房间[floorKey as keyof typeof store.data.房间.楼层房间];
  return rooms?.[room] || { 入住者: [] };
}

function hasFloorResident(floor: string, room: string): boolean {
  return getFloorRoomData(floor, room).入住者.length > 0;
}

function getFloorRoomStatus(floor: string, room: string): string {
  const data = getFloorRoomData(floor, room);
  return data.入住者.length > 0 ? '已入住' : '空置';
}

function getFloorRoomNames(floor: string, room: string): string {
  const data = getFloorRoomData(floor, room);
  if (data.入住者.length === 0) return '-';

  // 特殊房间：1901 固定家庭（避免 AI/变量波动导致 UI 显示不稳定）
  if (room === '1901') return '爱宫铃 & 爱宫心爱';

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
  background-color: rgba(0, 0, 0, 0.25);
  color: var(--text-color);
  font-size: 0.9em;
  line-height: 1.4;
  word-break: break-word;
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
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  padding-left: calc(12px + env(safe-area-inset-left));
  display: flex;
  align-items: center;
  justify-content: center;
}

.scope-modal {
  width: min(560px, calc(100% - 8px));
  max-height: calc(100% - 8px);
  background: rgba(25, 28, 35, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
}

.scope-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
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
  overflow-y: auto;
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
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.scope-footer-hint {
  flex: 1 1 100%;
  order: -1;
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
  flex: 1;
}

.room-cell {
  position: relative;
  /* 普通状态：冷色调，暗示未受庇护 */
  border: 1px solid rgba(100, 120, 100, 0.3);
}

.room-cell.scope-editable {
  cursor: pointer;
}

/* 受庇护状态：橙色/金色渐变，暗示温暖安全 */
.room-cell.sheltered {
  border: none;
  outline: 3px solid rgba(255, 160, 60, 0.9);
  outline-offset: 1px;
  box-shadow:
    0 0 0 1px rgba(255, 180, 80, 0.3),
    0 0 24px rgba(255, 140, 0, 0.4),
    0 0 48px rgba(255, 100, 0, 0.2),
    inset 0 0 30px rgba(255, 200, 100, 0.15);
  background: radial-gradient(
    ellipse at center,
    rgba(255, 200, 100, 0.25) 0%,
    rgba(255, 180, 80, 0.15) 40%,
    transparent 70%
  );
}

.room-cell.sheltered .room-number {
  color: #ffb347;
  font-weight: 700;
  text-shadow: 0 0 8px rgba(255, 180, 80, 0.6);
}

.room-cell.sheltered .room-number::after {
  content: ' 🛡️';
  font-size: 0.85em;
  filter: drop-shadow(0 0 4px rgba(255, 200, 100, 0.8));
}

.room-cell.sheltered .room-occupants {
  color: rgba(255, 220, 150, 0.9);
}

@media (prefers-reduced-motion: no-preference) {
  .room-cell.sheltered {
    animation: edenShelterWarmGlow 3s ease-in-out infinite;
  }
}

@keyframes edenShelterWarmGlow {
  0%,
  100% {
    box-shadow:
      0 0 0 1px rgba(255, 180, 80, 0.3),
      0 0 24px rgba(255, 140, 0, 0.4),
      0 0 48px rgba(255, 100, 0, 0.2),
      inset 0 0 30px rgba(255, 200, 100, 0.15);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(255, 180, 80, 0.4),
      0 0 36px rgba(255, 160, 0, 0.5),
      0 0 60px rgba(255, 120, 0, 0.25),
      inset 0 0 40px rgba(255, 220, 120, 0.2);
  }
}

.scope-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 0.9em;
  opacity: 0.25;
  pointer-events: none;
}

.scope-badge.on {
  opacity: 1;
}

@media (max-width: 520px) {
  .scope-room-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>

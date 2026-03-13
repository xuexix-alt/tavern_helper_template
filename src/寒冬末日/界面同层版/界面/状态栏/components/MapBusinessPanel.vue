<template>
  <section class="map-panel">
    <section class="map-section">
      <div class="section-title">🗺 伊甸空间地图</div>
      <button type="button" class="scope-btn clip-corner-sm">+ +庇护范围</button>
      <section class="map-summary-strip">
        <article class="map-summary-chip clip-corner-sm">
          <small>庇护所等级</small>
          <strong>{{ levelNumber }}</strong>
        </article>
        <article class="map-summary-chip clip-corner-sm">
          <small>20层入住</small>
          <strong>{{ floor20Count }}/{{ floor20Max }}</strong>
        </article>
        <article class="map-summary-chip clip-corner-sm">
          <small>19层入住</small>
          <strong>{{ floor19Count }}/{{ floor19Max }}</strong>
        </article>
        <article class="map-summary-chip clip-corner-sm">
          <small>核心区域</small>
          <strong>{{ occupiedCoreCount }}/{{ coreRooms.length }}</strong>
        </article>
      </section>
      <div class="map-zone-grid">
        <section class="zone-card clip-corner-sm">
          <div class="zone-head">
            <div class="zone-title">🚪 玄关·净化区</div>
            <span class="zone-tag">出入缓冲 / 临时接待</span>
          </div>
          <div class="room-grid compact-grid">
            <article v-for="room in entranceRooms" :key="room.key" class="room-card" :class="{ active: room.active }">
              <div class="room-dot"></div>
              <strong>{{ room.label }}</strong
              ><span>{{ room.status }}</span>
            </article>
          </div>
        </section>
        <section class="zone-card clip-corner-sm">
          <div class="zone-head">
            <div class="zone-title">💎 核心生活区</div>
            <span class="zone-tag">主要功能房间</span>
          </div>
          <div class="room-grid compact-grid">
            <article v-for="room in coreRooms" :key="room.key" class="room-card" :class="{ active: room.active }">
              <div class="room-dot"></div>
              <strong>{{ room.label }}</strong
              ><span>{{ room.status }}</span>
            </article>
          </div>
        </section>
      </div>
      <section class="floor-card clip-corner-sm">
        <div class="floor-title">🏢 20层 - 公寓走廊</div>
        <div class="floor-warn">
          庇护范围未解锁（庇护所等级3解锁）。当前可用庇护 {{ floor20Count }}/{{ floor20Max }}。
        </div>
        <div class="room-grid floor-grid">
          <article
            v-for="room in floor20Rooms"
            :key="room.key"
            class="room-card"
            :class="{ active: room.active, sheltered: room.sheltered }"
          >
            <div class="room-dot"></div>
            <strong>{{ room.label }}</strong
            ><span>{{ room.status }}</span>
          </article>
        </div>
      </section>
      <section class="floor-card clip-corner-sm">
        <div class="floor-title">🏢 19层 - 公寓走廊</div>
        <div class="floor-warn">
          庇护范围未解锁（庇护所等级6解锁）。当前可用庇护 {{ floor19Count }}/{{ floor19Max }}。
        </div>
        <div class="room-grid floor-grid">
          <article
            v-for="room in floor19Rooms"
            :key="room.key"
            class="room-card"
            :class="{ active: room.active, sheltered: room.sheltered }"
          >
            <div class="room-dot"></div>
            <strong>{{ room.label }}</strong
            ><span>{{ room.status }}</span>
          </article>
        </div>
      </section>
    </section>
  </section>
</template>

<script setup lang="ts">
import { useDataStore } from '../../../../界面/store';
import { useShelterScopeStore } from '../../../../界面/shelterScopeStore';
import { floorRoomCapacity, isRoomSheltered } from '../../../../util/shelter_scope';
const store = useDataStore();
const scopeStore = useShelterScopeStore();
function namesAt(path: string) {
  const raw = _.get(store.data, path, []);
  return Array.isArray(raw) ? raw.map(item => String(item ?? '').trim()).filter(Boolean) : [];
}
function roomStatus(path: string) {
  const names = namesAt(path);
  return names.length ? names.join('、') : '空置';
}
const entranceRooms = computed(() => [
  {
    key: 'entrance',
    label: '玄关',
    status: roomStatus('房间.玄关.净化隔离区入住者'),
    active: namesAt('房间.玄关.净化隔离区入住者').length > 0,
  },
  {
    key: 'guest_a',
    label: '客房A',
    status: roomStatus('房间.玄关.临时客房A入住者'),
    active: namesAt('房间.玄关.临时客房A入住者').length > 0,
  },
  {
    key: 'guest_b',
    label: '客房B',
    status: roomStatus('房间.玄关.临时客房B入住者'),
    active: namesAt('房间.玄关.临时客房B入住者').length > 0,
  },
  {
    key: 'guest_c',
    label: '客房C',
    status: roomStatus('房间.玄关.临时客房C入住者'),
    active: namesAt('房间.玄关.临时客房C入住者').length > 0,
  },
  {
    key: 'guest_d',
    label: '客房D',
    status: roomStatus('房间.玄关.临时客房D入住者'),
    active: namesAt('房间.玄关.临时客房D入住者').length > 0,
  },
  {
    key: 'guest_e',
    label: '客房E',
    status: roomStatus('房间.玄关.临时客房E入住者'),
    active: namesAt('房间.玄关.临时客房E入住者').length > 0,
  },
]);
const coreRooms = computed(() => [
  {
    key: 'living',
    label: '客厅',
    status: roomStatus('房间.核心区.客厅使用者'),
    active: namesAt('房间.核心区.客厅使用者').length > 0,
  },
  {
    key: 'kitchen',
    label: '餐厅/厨房',
    status: roomStatus('房间.核心区.餐厅厨房使用者'),
    active: namesAt('房间.核心区.餐厅厨房使用者').length > 0,
  },
  {
    key: 'master',
    label: '主卧',
    status: roomStatus('房间.核心区.主卧室使用者'),
    active: namesAt('房间.核心区.主卧室使用者').length > 0,
  },
  {
    key: 'theater',
    label: '小影院&舞台',
    status: roomStatus('房间.核心区.小影院&舞台使用者'),
    active: namesAt('房间.核心区.小影院&舞台使用者').length > 0,
  },
  {
    key: 'meeting',
    label: '会议室',
    status: roomStatus('房间.核心区.会议室使用者'),
    active: namesAt('房间.核心区.会议室使用者').length > 0,
  },
  {
    key: 'second',
    label: '次卧',
    status: roomStatus('房间.核心区.次卧使用者'),
    active: namesAt('房间.核心区.次卧使用者').length > 0,
  },
]);
function buildFloorRooms(floor: '20' | '19') {
  const prefix = floor === '20' ? '20' : '19';
  return Array.from({ length: 8 }, (_, index) => {
    const room = `${prefix}${String(index + 1).padStart(2, '0')}`;
    const key = floor === '20' ? '楼层20房间' : '楼层19房间';
    const names = namesAt(`房间.楼层房间.${key}.${room}`);
    return {
      key: room,
      label: room,
      status: names.length ? names.join('、') : '空置',
      active: names.length > 0,
      sheltered: isRoomSheltered(scopeStore.scope, floor, room),
    };
  });
}
const floor20Rooms = computed(() => buildFloorRooms('20'));
const floor19Rooms = computed(() => buildFloorRooms('19'));
const levelNumber = computed(() => Number(_.get(store.data, '庇护所.庇护所等级', 0)) || 0);
const floor20Max = computed(() => floorRoomCapacity(levelNumber.value, '20'));
const floor19Max = computed(() => floorRoomCapacity(levelNumber.value, '19'));
const floor20Count = computed(() => (scopeStore.scope['20'] ?? []).length);
const floor19Count = computed(() => (scopeStore.scope['19'] ?? []).length);
const occupiedCoreCount = computed(() => coreRooms.value.filter(room => room.active).length);
</script>

<style scoped>
.map-panel,
.map-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.map-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.map-summary-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 54px;
  padding: 10px 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}

.map-summary-chip small,
.map-summary-chip strong {
  font-family: var(--demo-font-mono);
}

.map-summary-chip small {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-subtle);
}

.map-summary-chip strong {
  font-size: 13px;
  color: var(--demo-text-accent);
}

.map-zone-grid {
  display: grid;
  gap: 16px;
}
.zone-card,
.floor-card {
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}
.section-title,
.floor-title,
.zone-title,
.zone-tag,
.room-card strong,
.room-card span {
  font-family: var(--demo-font-mono);
}
.section-title,
.floor-title,
.zone-title {
  color: var(--demo-text-primary);
  font-size: 14px;
  font-weight: 700;
}
.zone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-title {
  font-size: 16px;
}
.scope-btn {
  width: fit-content;
  min-height: 46px;
  padding: 0 20px;
  border: 1px solid var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
  font-size: 18px;
  font-weight: 700;
}
.map-zone-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.zone-card,
.floor-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 14px;
}
.zone-tag {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  color: var(--demo-text-secondary);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
}
.room-grid {
  display: grid;
  gap: 10px;
}
.compact-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.floor-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.room-card {
  min-height: 88px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: flex-start;
  border-radius: 14px;
}
.room-card.active {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}
.room-card.sheltered {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--demo-color-neon) 32%, transparent) inset;
}
.room-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 26%, transparent);
}
.room-card.active .room-dot {
  background: var(--demo-color-neon);
}
.room-card strong {
  font-size: 16px;
  color: var(--demo-text-primary);
}
.room-card span {
  font-size: 12px;
  color: var(--demo-text-secondary);
  line-height: 1.45;
}
.floor-warn {
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 32%, transparent);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--demo-text-warning);
  font-family: var(--demo-font-mono);
  font-size: 14px;
  border-radius: 12px;
}
@media (max-width: 980px) {
  .map-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .map-zone-grid {
    grid-template-columns: 1fr;
  }
  .compact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .floor-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .map-panel,
  .map-section {
    gap: 10px;
  }

  .map-summary-strip {
    gap: 6px;
  }

  .map-summary-chip {
    min-height: 46px;
    padding: 8px 9px;
  }

  .map-summary-chip small {
    font-size: 9px;
  }

  .map-summary-chip strong {
    font-size: 12px;
  }

  .section-title {
    font-size: 14px;
  }

  .scope-btn {
    min-height: 34px;
    padding: 0 12px;
    font-size: 12px;
  }

  .compact-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .floor-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .zone-card,
  .floor-card {
    padding: 9px;
    gap: 8px;
  }
  .zone-head {
    gap: 6px;
    align-items: flex-start;
  }
  .zone-tag {
    min-height: 22px;
    padding: 0 6px;
    font-size: 10px;
  }
  .floor-warn {
    padding: 6px 8px;
    font-size: 10px;
    line-height: 1.3;
    border-radius: 8px;
  }
  .room-grid {
    gap: 5px;
  }
  .room-card {
    min-height: 50px;
    padding: 6px;
    gap: 3px;
    border-radius: 8px;
  }
  .room-dot {
    width: 6px;
    height: 6px;
  }
  .room-card strong {
    font-size: 11px;
    line-height: 1.1;
  }
  .room-card span {
    font-size: 9px;
    line-height: 1.2;
  }
}

@media (max-width: 420px) {
  .compact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .floor-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .room-card {
    min-height: 46px;
    padding: 5px;
  }
  .room-card strong {
    font-size: 10px;
  }
  .room-card span {
    font-size: 8px;
  }
}
</style>

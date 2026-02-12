<template>
  <div class="world-section">
    <div class="world-head">
      <span class="world-kicker">WORLD SNAPSHOT</span>
      <span class="world-location">📍 {{ store.data.世界.当前地点 }}</span>
    </div>

    <div class="meta-row">
      <div class="meta-pill">
        <span class="meta-label">DATE</span>
        <span class="meta-value">{{ formatted_date }}</span>
      </div>
      <div class="meta-pill">
        <span class="meta-label">TIME</span>
        <span class="meta-value">{{ formatted_time }}</span>
      </div>
      <div class="meta-pill">
        <span class="meta-label">EVENTS</span>
        <span class="meta-value">{{ _.size(store.data.世界.近期事务) || 0 }}</span>
      </div>
    </div>

    <div class="event-list">
      <div v-for="(description, name) in store.data.世界.近期事务" :key="name" class="event-badge">
        <span class="event-title">{{ name }}</span>
        <span class="event-desc">{{ description }}</span>
      </div>
      <div v-if="_.isEmpty(store.data.世界.近期事务)" class="event-badge">
        <span class="event-title">暂无事务</span>
        <span class="event-desc">当前没有进行中的事务</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import _ from 'lodash';
import { useDataStore } from '../store';

const store = useDataStore();

const formatted_date = computed(() => {
  const match = store.data.世界.当前时间.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : store.data.世界.当前时间.split(' ')[0] || '未知';
});

const formatted_time = computed(() => {
  const match = store.data.世界.当前时间.match(/(\d{2}:\d{2})/);
  return match ? match[1] : store.data.世界.当前时间.split(' ')[1] || '未知';
});
</script>

<style lang="scss" scoped>
.world-section {
  border-bottom: 1px solid var(--c-border-soft);
  padding: 11px 12px;
  background: linear-gradient(180deg, rgba(240, 247, 244, 0.76), rgba(255, 255, 255, 0.36));
}

.world-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.world-kicker {
  font-size: 0.66rem;
  letter-spacing: 0.12em;
  color: var(--c-grey-olive);
}

.world-location {
  max-width: 62%;
  font-size: 0.78rem;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(76, 98, 89, 0.42);
}

.meta-pill {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid rgba(76, 98, 89, 0.28);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.76);
  padding: 6px 8px;
}

.meta-label {
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  color: var(--c-grey-olive);
}

.meta-value {
  font-size: 0.82rem;
  font-weight: 700;
}

.event-list {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  scrollbar-color: rgba(90, 117, 104, 0.4) transparent;
}

.event-badge {
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(60, 73, 63, 0.34);
  border-radius: 10px;
  padding: 8px 10px;
  min-width: 150px;
  flex: 0 0 min(220px, 78%);
  position: relative;
  scroll-snap-align: start;
  box-shadow: 0 5px 14px rgba(20, 45, 35, 0.08);
}

.event-badge::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 8px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background-color: #77c79f;
}

.event-title {
  display: block;
  font-weight: 700;
  margin-bottom: 2px;
  padding-left: 12px;
  font-size: 0.8rem;
}

.event-desc {
  display: block;
  font-size: 0.72rem;
  color: var(--c-grey-olive);
  padding-left: 12px;
  line-height: 1.35;
}

@media (max-width: 600px) {
  .world-section {
    padding: 10px;
  }

  .world-location {
    max-width: 58%;
    font-size: 0.72rem;
  }

  .meta-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .meta-pill:last-child {
    grid-column: span 2;
  }

  .event-badge {
    flex-basis: 84%;
    min-width: 0;
  }
}
</style>

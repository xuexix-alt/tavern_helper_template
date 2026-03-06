<template>
  <section class="section world-section">
    <div class="world-pane">
      <div class="world-pane-tab">基础信息</div>
      <div class="world-pane-body">
        <div class="world-info-grid">
          <div class="world-info-card world-info-card--location">
            <div class="world-info-label">位置</div>
            <div class="world-info-value"><TextHighlight :text="store.data.世界.地址" :query="query" /></div>
          </div>

          <div class="world-info-card world-info-card--date">
            <div class="world-info-label">日期</div>
            <div class="world-info-value"><TextHighlight :text="store.data.世界.日期" :query="query" /></div>
          </div>

          <div class="world-info-card world-info-card--day">
            <div class="world-info-label">末日进程</div>
            <div class="world-info-value">第 <TextHighlight :text="store.data.世界.末日天数" :query="query" /> 天</div>
          </div>

          <div class="world-info-card world-info-card--time">
            <div class="world-info-label">当前时间</div>
            <div class="world-info-value"><TextHighlight :text="store.data.世界.时间" :query="query" /></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import TextHighlight from './TextHighlight.vue';
import { useDataStore } from '../../store';

withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);
const store = useDataStore();
</script>

<style scoped>
.world-section {
  padding: 0;
  border: 0;
  background: transparent;
}

.world-pane {
  min-width: 0;
  border: 1px solid var(--world-pane-border);
  border-radius: 12px;
  background: var(--world-pane-bg);
  overflow: hidden;
}

.world-pane-tab {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  font-size: 0.84em;
  font-weight: 700;
  color: var(--accent-gold);
  border-bottom: 1px solid var(--world-pane-tab-border);
  background: var(--world-pane-tab-bg);
}

.world-pane-body {
  padding: 8px;
}

.world-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.world-info-card {
  border-radius: 9px;
  padding: 6px 8px;
  background: var(--world-card-bg);
  border: 1px solid var(--world-card-border);
  display: grid;
  gap: 2px;
  min-height: 46px;
}

.world-info-card--location {
  grid-column: 1 / -1;
}

.world-info-label {
  font-size: 0.68em;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  opacity: 0.75;
  line-height: 1.25;
  color: var(--accent-blue);
}

.world-info-value {
  font-size: 0.84em;
  line-height: 1.3;
  word-break: break-word;
}

.world-info-card--location .world-info-value {
  color: var(--accent-blue);
}

.world-info-card--date .world-info-value,
.world-info-card--day .world-info-value {
  color: var(--accent-gold);
}

.world-info-card--time .world-info-value {
  color: var(--accent-red);
}

@media (max-width: 520px) {
  .world-pane-body {
    padding: 7px;
  }

  .world-info-grid {
    grid-template-columns: 1fr;
  }

  .world-info-card--location {
    grid-column: auto;
  }
}
</style>

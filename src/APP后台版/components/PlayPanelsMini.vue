<template>
  <div class="mini-panel" @click.stop>
    <div class="mini-head">
      <div class="mini-title">
        <i class="fas fa-layer-group"></i>
        <div>
          <div class="title">面板小窗</div>
          <div class="sub">{{ appModeLabel }}</div>
        </div>
      </div>
      <div class="mini-actions">
        <button class="mini-btn" @click="expand">
          <i class="fas fa-up-right-and-down-left-from-center"></i>
          展开
        </button>
        <button class="mini-btn danger" @click="close">
          <i class="fas fa-times"></i>
          关闭
        </button>
      </div>
    </div>

    <div class="mini-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="mini-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <i :class="tab.icon"></i>
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <div class="mini-body">
      <div v-if="activeTab === 'status'" class="mini-section">
        <ServiceStatus />
        <ServiceStats />
      </div>
      <div v-else-if="activeTab === 'discover'" class="mini-section">
        <DiscoverQuickPanel />
      </div>
      <div v-else class="mini-section">
        <div class="mini-card">
          <div class="mini-card-title">
            <i class="fas fa-history"></i>
            历史订单
          </div>
          <div class="mini-card-desc">独立弹窗展示，便于复购与回看。</div>
          <button class="mini-primary" @click="openHistory">
            <i class="fas fa-up-right-from-square"></i>
            打开历史
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { historyOverlayOpen, playPanelsMini, playPanelsOpen } from '../shared/uiState';
import ServiceStatus from './ServiceStatus.vue';
import ServiceStats from './ServiceStats.vue';
import DiscoverQuickPanel from './DiscoverQuickPanel.vue';
import { appModeLabel, isAppMode, isMixedMode } from '../shared/appMode';

const showStorePanels = computed(() => isAppMode.value || isMixedMode.value);

const tabs = computed(() => {
  const base = [
    { id: 'status', label: '状态', icon: 'fas fa-user-shield' },
    { id: 'discover', label: '发现', icon: 'fas fa-compass' },
    { id: 'history', label: '历史', icon: 'fas fa-history' },
  ];
  if (!showStorePanels.value) {
    return base.filter(t => t.id !== 'discover' && t.id !== 'history');
  }
  return base;
});

const activeTab = ref<'status' | 'discover' | 'history'>('status');

watch(tabs, next => {
  if (!next.find(t => t.id === activeTab.value)) {
    activeTab.value = (next[0]?.id as any) || 'status';
  }
});

function openHistory() {
  historyOverlayOpen.value = true;
}

function expand() {
  playPanelsOpen.value = true;
  playPanelsMini.value = false;
}

function close() {
  playPanelsMini.value = false;
}
</script>

<style scoped lang="scss">
.mini-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 5100;
  width: min(360px, 92vw);
  border-radius: 18px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: linear-gradient(135deg, rgba(2, 6, 23, 0.96), rgba(15, 23, 42, 0.98));
  box-shadow: 0 25px 50px rgba(15, 23, 42, 0.55);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mini-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mini-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #e2e8f0;

  i {
    color: #93c5fd;
  }
}

.mini-title .title {
  font-size: 14px;
  font-weight: 700;
}

.mini-title .sub {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.7);
}

.mini-actions {
  display: flex;
  gap: 6px;
}

.mini-btn {
  border-radius: 10px;
  padding: 6px 8px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(30, 41, 59, 0.6);
  color: #e2e8f0;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mini-btn.danger {
  border-color: rgba(239, 68, 68, 0.35);
  color: #fecaca;
}

.mini-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mini-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 10px;
  padding: 6px 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.85);
  color: rgba(226, 232, 240, 0.8);
  font-size: 11px;
  font-weight: 600;
}

.mini-tab.active {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.2);
  color: #e0f2fe;
}

.mini-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mini-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mini-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.75);
  padding: 12px;
  color: #e2e8f0;
}

.mini-card-title {
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.mini-card-desc {
  font-size: 11px;
  color: rgba(226, 232, 240, 0.6);
  margin-bottom: 8px;
}

.mini-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.2);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .mini-panel {
    right: 10px;
    left: 10px;
    bottom: 10px;
    width: auto;
    border-radius: 16px;
  }
}
</style>

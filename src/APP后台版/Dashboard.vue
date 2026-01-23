<template>
  <div class="dashboard-shell relative flex w-full flex-col gap-3">
    <!-- Command Bar -->
    <div class="dashboard-top flex flex-wrap items-center gap-2 px-2 pt-2 sm:px-3 sm:pt-3">
      <div class="flex flex-wrap items-center gap-2">
        <button class="cmd-btn" @click="openPanels" title="打开面板（状态/发现/设置）">
          <i class="fas fa-bars"></i>
          <span>面板</span>
        </button>
        <button class="cmd-btn cmd-accent" @click="toggleMarketplace" title="商城与套餐">
          <i class="fas fa-store"></i>
          <span>商城</span>
        </button>
        <button class="cmd-btn" @click="goHome" title="返回首页">
          <i class="fas fa-home"></i>
          <span>首页</span>
        </button>
        <button class="cmd-btn" @click="goDiscover" title="发现">
          <i class="fas fa-compass"></i>
          <span>发现</span>
        </button>
        <button class="cmd-btn" @click="goService" title="服务状态">
          <i class="fas fa-concierge-bell"></i>
          <span>服务</span>
        </button>
      </div>

      <div class="flex min-w-0 flex-1 items-center gap-2">
        <RpgHud class="min-w-0 flex-1" />
      </div>

      <button class="cmd-btn" @click="openHistory" title="历史订单">
        <i class="fas fa-history"></i>
        <span>历史</span>
      </button>
    </div>

    <!-- Main narrative area (maximize) -->
    <main class="dashboard-body flex w-full flex-col gap-3 px-2 pb-2 sm:px-3 sm:pb-3 lg:flex-row lg:items-start">
      <div class="min-w-0 flex-1">
        <Play />
      </div>
      <MarketplaceDock v-if="marketplaceOpen" />
    </main>
  </div>

  <PlayPanelsModal v-if="playPanelsOpen" />
  <PlayPanelsMini v-if="playPanelsMini" />
  <HistoryOverlay />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Play from './components/Play.vue';
import HistoryOverlay from './components/HistoryOverlay.vue';
import PlayPanelsModal from './components/PlayPanelsModal.vue';
import PlayPanelsMini from './components/PlayPanelsMini.vue';
import RpgHud from './components/RpgHud.vue';
import MarketplaceDock from './components/MarketplaceDock.vue';
import { historyOverlayOpen, marketplaceOpen, playPanelsMini, playPanelsOpen } from './shared/uiState';

const router = useRouter();

function openHistory() {
  historyOverlayOpen.value = true;
}

function openPanels() {
  playPanelsOpen.value = true;
  playPanelsMini.value = false;
}

function toggleMarketplace() {
  marketplaceOpen.value = !marketplaceOpen.value;
}

function goHome() {
  router.push('/home');
}

function goDiscover() {
  router.push('/discover');
}

function goService() {
  router.push('/service');
}

onMounted(() => {
  try {
    if (window.innerWidth >= 1024) {
      marketplaceOpen.value = true;
    }
  } catch {
    // ignore
  }
});
</script>

<style scoped lang="scss">
.dashboard-top {
  position: sticky;
  top: 0;
  z-index: 8;
  backdrop-filter: blur(10px);
}

.cmd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 14px;
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.7);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.cmd-btn:hover {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(30, 41, 59, 0.8);
}

.cmd-accent {
  border-color: rgba(16, 185, 129, 0.4);
  color: #a7f3d0;
}
</style>

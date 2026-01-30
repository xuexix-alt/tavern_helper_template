<template>
  <div class="dashboard-shell">
    <Play />
    <!-- /play 的全局浮层挂载点：由 shared/uiState 控制 -->
    <ShopOverlay v-if="shopOverlayOpen" />
    <HistoryOverlay v-if="historyOverlayOpen" />
    <PlayPanelsModal v-if="playPanelsOpen && !playPanelsMini" />
    <PlayPanelsMini v-if="playPanelsMini" />
  </div>
</template>

<script setup lang="ts">
import Play from './components/Play.vue';
import HistoryOverlay from './components/HistoryOverlay.vue';
import PlayPanelsMini from './components/PlayPanelsMini.vue';
import PlayPanelsModal from './components/PlayPanelsModal.vue';
import ShopOverlay from './components/ShopOverlay.vue';
import { historyOverlayOpen, playPanelsMini, playPanelsOpen, shopOverlayOpen } from './shared/uiState';
</script>

<style scoped lang="scss">
.dashboard-shell {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8px;
}
</style>

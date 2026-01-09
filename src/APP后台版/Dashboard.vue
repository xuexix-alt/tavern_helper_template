<template>
  <div class="relative flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden p-3 sm:p-4">
    <!-- Compact HUD / Actions -->
    <div class="flex items-center gap-2">
      <button
        class="shrink-0 rounded-2xl border border-blue-500/20 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 hover:border-blue-500/40 hover:bg-slate-800/60"
        @click="openPanels"
        title="打开面板（角色/商城/历史/导航）"
      >
        <i class="fas fa-bars"></i>
        <span class="ml-2 hidden sm:inline">面板</span>
      </button>

      <RpgHud class="min-w-0 flex-1" />

      <button
        class="shrink-0 rounded-2xl border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 hover:border-blue-500/30 hover:bg-slate-800/60"
        @click="openHistory"
        title="历史订单"
      >
        <i class="fas fa-history text-blue-300"></i>
        <span class="ml-2 hidden md:inline">历史</span>
      </button>
    </div>

    <!-- Main narrative area (maximize) -->
    <main class="min-h-0 min-w-0 flex-1">
      <Play class="h-full" />
    </main>
  </div>

  <PlayPanelsModal v-if="playPanelsOpen" />
  <HistoryOverlay />
</template>

<script setup lang="ts">
import Play from './components/Play.vue';
import HistoryOverlay from './components/HistoryOverlay.vue';
import PlayPanelsModal from './components/PlayPanelsModal.vue';
import RpgHud from './components/RpgHud.vue';
import { historyOverlayOpen, playPanelsOpen } from './shared/uiState';

function openHistory() {
  historyOverlayOpen.value = true;
}

function openPanels() {
  playPanelsOpen.value = true;
}
</script>

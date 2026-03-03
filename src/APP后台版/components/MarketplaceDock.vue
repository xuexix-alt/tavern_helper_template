<template>
  <!-- Desktop dock -->
  <aside
    class="hidden w-[320px] min-w-[280px] flex-col rounded-2xl border border-emerald-500/20 bg-slate-950/60 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl lg:sticky lg:top-4 lg:flex"
    :class="{ 'link-text': isTextLinked }"
    @click="focusMarket"
  >
    <div class="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
      <div class="flex items-center gap-2 text-sm font-bold text-slate-100">
        <span class="material-symbols-outlined text-emerald-300">storefront</span>
        商城与套餐
      </div>
      <button
        class="rounded-lg border border-slate-700/50 bg-slate-900/60 px-2 py-1 text-xs text-slate-200 hover:border-emerald-500/30 hover:bg-slate-800/70"
        @click="close"
      >
        收起
      </button>
    </div>

    <div class="p-3">
      <div class="space-y-3">
        <ShopList />
        <PackageDetail />
        <PackageImages />
      </div>
    </div>
  </aside>

  <!-- Mobile overlay -->
  <div class="fixed inset-0 z-[5300] flex items-end bg-black/70 p-3 lg:hidden">
    <div
      class="flex w-full flex-col rounded-2xl border border-emerald-500/20 bg-slate-950/95 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl"
      :class="{ 'link-text': isTextLinked }"
      @click="focusMarket"
    >
      <div class="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
        <div class="flex items-center gap-2 text-sm font-bold text-slate-100">
          <span class="material-symbols-outlined text-emerald-300">storefront</span>
          商城与套餐
        </div>
        <button
          class="rounded-lg border border-slate-700/50 bg-slate-900/60 px-2 py-1 text-xs text-slate-200 hover:border-emerald-500/30 hover:bg-slate-800/70"
          @click="close"
        >
          关闭
        </button>
      </div>

      <div class="p-3">
        <div class="space-y-3">
          <ShopList />
          <PackageDetail />
          <PackageImages />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { focusArea, shopOverlayOpen } from '../shared/uiState';
import ShopList from './ShopList.vue';
import PackageDetail from './PackageDetail.vue';
import PackageImages from './PackageImages.vue';

const isTextLinked = computed(() => focusArea.value === 'text');

function close() {
  shopOverlayOpen.value = false;
}

function focusMarket() {
  focusArea.value = 'market';
}

onMounted(() => {
  focusArea.value = 'market';
});
</script>

<style scoped lang="scss">
.link-text {
  border-color: rgba(59, 130, 246, 0.4) !important;
  box-shadow:
    0 0 0 1px rgba(59, 130, 246, 0.2),
    0 18px 40px rgba(59, 130, 246, 0.2) !important;
}
</style>

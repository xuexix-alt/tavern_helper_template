<template>
  <div class="flex h-full gap-6 overflow-hidden p-6">
    <!-- Center Column: Play Area + Bottom Stats -->
    <div class="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent flex flex-1 flex-col gap-6 overflow-y-auto pr-2">
      <Play>
        <template #stats>
          <ServiceStats />
        </template>
        <template #status>
          <ServiceStatus />
        </template>
      </Play>
    </div>

    <!-- Right Column: Info Panel -->
    <div class="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent flex w-80 flex-col gap-6 overflow-y-auto pl-1">
      <ShopList />
      <PackageDetail />
      <PackageImages />
    </div>
  </div>
</template>

<script setup lang="ts">
import Play from './components/Play.vue';
import ServiceStats from './components/ServiceStats.vue';
import ServiceStatus from './components/ServiceStatus.vue';
import ShopList from './components/ShopList.vue';
import PackageDetail from './components/PackageDetail.vue';
import PackageImages from './components/PackageImages.vue';
</script>

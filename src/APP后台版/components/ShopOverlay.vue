<template>
  <div class="overlay" @click.self="close">
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">
          <span class="material-symbols-outlined">storefront</span>
          {{ ui.panelTitles.marketplace }}
        </div>
        <button class="panel-close" @click="close">
          <span class="material-symbols-outlined">close</span>
          {{ ui.panelTitles.close }}
        </button>
      </div>

      <div class="panel-body">
        <div class="panel-column">
          <ShopList />
        </div>
        <div class="panel-column">
          <PackageDetail />
          <PackageImages />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { shopOverlayOpen, focusArea } from '../shared/uiState';
import ShopList from './ShopList.vue';
import PackageDetail from './PackageDetail.vue';
import PackageImages from './PackageImages.vue';
import uiSpec from '../shared/ui-spec-for-designers.json';

const ui = uiSpec.uiTexts;

function close() {
  shopOverlayOpen.value = false;
  focusArea.value = 'text';
}
</script>

<style scoped lang="scss">
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 6000;
}

.panel {
  width: min(980px, 100%);
  border-radius: 20px;
  border: 2px solid rgba(245, 158, 11, 0.35);
  background: #f8fafc;
  color: #0f172a;
  box-shadow: 0 25px 60px rgba(15, 23, 42, 0.45);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
}

.panel-title i {
  color: #f59e0b;
}

.panel-title .material-symbols-outlined {
  color: #f59e0b;
}

.panel-close {
  border-radius: 12px;
  padding: 6px 10px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
}

.panel-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.panel-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 900px) {
  .panel-body {
    grid-template-columns: 1fr;
  }
}
</style>

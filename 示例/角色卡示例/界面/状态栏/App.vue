<template>
  <div class="card">
    <header class="card-head">
      <p class="card-kicker">EDEN STATUS CONSOLE</p>
      <h1 class="card-title">寒冬末日状态栏</h1>
      <p class="card-subtitle">当前页面：{{ active_tab_label }}</p>
    </header>

    <WorldSection />

    <DependencyBar />

    <TabNav v-model="active_tab" :tabs="tabs" />

    <div class="content-area" :aria-label="`当前页：${active_tab_label}`">
      <div v-if="active_tab === '白娅'" id="panel-白娅" class="tab-pane active">
        <CharacterPanel />
      </div>
      <div v-else-if="active_tab === '主角'" id="panel-主角" class="tab-pane active">
        <InventoryPanel />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CharacterPanel from './components/CharacterPanel.vue';
import DependencyBar from './components/DependencyBar.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import TabNav from './components/TabNav.vue';
import WorldSection from './components/WorldSection.vue';

const tabs = [
  { id: '白娅', label: '角色情报' },
  { id: '主角', label: '持有物品' },
];

const active_tab = useLocalStorage<string>('status_bar:active_tab', tabs[0].id);
const active_tab_label = computed(() => tabs.find(tab => tab.id === active_tab.value)?.label ?? tabs[0].label);

watchEffect(() => {
  if (!tabs.some(tab => tab.id === active_tab.value)) {
    active_tab.value = tabs[0].id;
  }
});
</script>

<style lang="scss" scoped>
.card {
  width: 100%;
  max-width: 760px;
  background:
    linear-gradient(150deg, rgba(255, 255, 255, 0.88), rgba(240, 247, 244, 0.9) 28%, rgba(228, 243, 235, 0.92)),
    var(--c-mint-cream);
  border: 1px solid var(--c-border-soft);
  border-radius: 14px;
  box-shadow: 0 14px 28px rgba(11, 26, 23, 0.14);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  font-family: var(--font-archive);
  color: var(--c-granite);
  font-size: 13px;
  line-height: 1.45;
  margin: 0 auto;
  overflow: hidden;
}

.card-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--c-border-soft);
  background:
    radial-gradient(circle at 16% 18%, rgba(162, 227, 196, 0.28), transparent 48%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.35));
}

.card-kicker {
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  color: var(--c-grey-olive);
}

.card-title {
  font-size: 1.06rem;
  line-height: 1.2;
  letter-spacing: 0.03em;
}

.card-subtitle {
  font-size: 0.77rem;
  color: #4f6359;
  opacity: 0.92;
}

.content-area {
  padding: 12px 12px 10px;
  height: clamp(280px, 52vh, 620px);
  min-height: 0;
  overflow: hidden;
}

.tab-pane {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: rgba(90, 117, 104, 0.38) transparent;
  animation: fadeEffect 0.28s ease;
}

.tab-pane.active {
  display: block;
}

.tab-pane::-webkit-scrollbar {
  width: 5px;
}

.tab-pane::-webkit-scrollbar-thumb {
  background: rgba(90, 117, 104, 0.4);
  border-radius: 999px;
}

.tab-pane::-webkit-scrollbar-track {
  background: transparent;
}

@keyframes fadeEffect {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .card {
    border-radius: 12px;
  }

  .card-head {
    padding: 10px 11px 9px;
  }

  .card-kicker {
    font-size: 0.63rem;
    letter-spacing: 0.12em;
  }

  .card-title {
    font-size: 0.98rem;
  }

  .card-subtitle {
    font-size: 0.72rem;
  }

  .content-area {
    padding: 10px 10px 8px;
    height: clamp(260px, 48vh, 520px);
  }
}
</style>

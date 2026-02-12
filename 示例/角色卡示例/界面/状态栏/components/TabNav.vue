<template>
  <nav class="tabs" role="tablist" aria-label="状态栏页面切换">
    <button
      v-for="tab in props.tabs"
      :key="tab.id"
      class="tab-button"
      :class="{ active: model === tab.id }"
      role="tab"
      :aria-selected="model === tab.id"
      :aria-controls="`panel-${tab.id}`"
      @click="switchTab(tab.id)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>

<script setup lang="ts">
const props = defineProps<{
  tabs: { id: string; label: string }[];
}>();

const model = defineModel<string | null>({ required: true });

function switchTab(id: string) {
  model.value = id;
}
</script>

<style lang="scss" scoped>
.tabs {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--c-border-soft);
  background: linear-gradient(180deg, rgba(179, 191, 184, 0.28), rgba(179, 191, 184, 0.06));
}

.tab-button {
  flex: 1;
  min-height: 44px;
  border: 1px solid rgba(60, 73, 63, 0.25);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.66);
  color: #4f6458;
  font-size: 0.84rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  font-family: var(--font-archive);
  cursor: pointer;
  transition: transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.tab-button:hover {
  background-color: rgba(162, 227, 196, 0.3);
  color: var(--c-granite);
}

.tab-button.active {
  background: linear-gradient(180deg, rgba(162, 227, 196, 0.58), rgba(162, 227, 196, 0.3));
  border-color: rgba(83, 117, 100, 0.62);
  color: var(--c-granite);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.62),
    0 6px 14px rgba(83, 117, 100, 0.18);
  transform: translateY(-1px);
}

.tab-button:focus-visible {
  outline: 2px solid rgba(83, 117, 100, 0.7);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  .tabs {
    gap: 6px;
    padding: 8px 10px;
  }

  .tab-button {
    min-height: 42px;
    border-radius: 10px;
    font-size: 0.78rem;
  }
}
</style>

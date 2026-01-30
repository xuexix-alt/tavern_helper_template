<template>
  <details class="expand-panel glass-panel" :open="open">
    <summary class="expand-summary">
      <div class="summary-left">
        <span v-if="materialIcon" class="material-symbols-outlined summary-icon">{{ materialIcon }}</span>
        <i v-else-if="icon" :class="['summary-icon', icon]"></i>
        <span class="summary-title">{{ title }}</span>
      </div>
      <span class="material-symbols-outlined summary-chevron">expand_more</span>
    </summary>
    <div class="expand-body">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  icon?: string;
  materialIcon?: string;
  open?: boolean;
}>();
</script>

<style scoped lang="scss">
.expand-panel {
  border-radius: 18px;
  overflow: hidden;
}

.expand-summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.03);
}

.expand-summary::-webkit-details-marker {
  display: none;
}

.summary-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.summary-icon {
  font-size: 18px;
  color: rgba(216, 180, 254, 0.9);
}

.summary-title {
  font-size: 12px;
  font-weight: 700;
}

.summary-chevron {
  font-size: 18px;
  color: rgba(148, 163, 184, 0.7);
  transition: transform 0.2s ease;
}

.expand-panel[open] .summary-chevron {
  transform: rotate(180deg);
}

.expand-body {
  padding: 12px 14px;
  display: grid;
  gap: 10px;
}
</style>

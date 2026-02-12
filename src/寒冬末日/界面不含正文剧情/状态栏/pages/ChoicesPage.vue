<template>
  <section class="eden-page">
    <div class="eden-page-scroll">
      <ChoicesSection :options="options" />
    </div>
  </section>
</template>

<script setup lang="ts">
import ChoicesSection from '../components/ChoicesSection.vue';

defineProps<{
  options: string[];
}>();
</script>

<style scoped>
.eden-page {
  height: 100%;
  min-height: 0;
}

.eden-page-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  overscroll-behavior: contain;
}
</style>

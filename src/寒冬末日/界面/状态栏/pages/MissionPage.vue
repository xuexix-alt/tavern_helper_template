<template>
  <section class="eden-page">
    <div class="eden-page-scroll">
      <MissionSection :query="query" />
    </div>
  </section>
</template>

<script setup lang="ts">
import MissionSection from '../components/MissionSection.vue';

withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);
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
  padding: 8px 8px 10px;
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

@media (max-width: 420px) {
  .eden-page-scroll {
    padding: 6px 6px 8px;
  }
}
</style>

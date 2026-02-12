<template>
  <section class="eden-page">
    <div class="eden-page-scroll">
      <MissionSection />
    </div>
  </section>
</template>

<script setup lang="ts">
import MissionSection from '../components/MissionSection.vue';
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

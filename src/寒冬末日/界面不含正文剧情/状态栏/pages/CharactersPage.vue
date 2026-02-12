<template>
  <section class="eden-page">
    <div class="eden-page-scroll">
      <CharactersSection />
      <OtherResidentsSection />
    </div>
  </section>
</template>

<script setup lang="ts">
import CharactersSection from '../components/CharactersSection.vue';
import OtherResidentsSection from '../components/OtherResidentsSection.vue';
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

<template>
  <section class="eden-page">
    <div class="eden-page-scroll">
      <CharactersSection :query="query" mode="characters" />
      <OtherResidentsSection :query="query" />
    </div>
  </section>
</template>

<script setup lang="ts">
import CharactersSection from '../components/CharactersSection.vue';
import OtherResidentsSection from '../components/OtherResidentsSection.vue';

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

#eden-shell:not([style*='--eden-shell-height']) .eden-page {
  height: auto;
}

#eden-shell:not([style*='--eden-shell-height']) .eden-page-scroll {
  height: auto;
  overflow-y: visible;
  overflow-x: visible;
}

@media (max-width: 420px) {
  .eden-page-scroll {
    padding: 6px 6px 8px;
  }
}
</style>

<template>
  <BasePage>
    <CharactersSection :query="query" mode="characters" />
    <OtherResidentsSection :query="query" />
  </BasePage>
</template>

<script setup lang="ts">
import BasePage from './BasePage.vue';
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

<template>
  <BasePage>
    <ShelterSection :query="query" />
  </BasePage>
</template>

<script setup lang="ts">
import BasePage from './BasePage.vue';
import ShelterSection from '../components/ShelterSection.vue';

withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);
</script>

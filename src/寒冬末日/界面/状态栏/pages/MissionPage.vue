<template>
  <BasePage>
    <MissionSection :query="query" />
  </BasePage>
</template>

<script setup lang="ts">
import BasePage from './BasePage.vue';
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

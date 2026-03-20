<template>
  <BasePage>
    <WorldSection :query="query" />
    <ReportSection :query="query" />
  </BasePage>
</template>

<script setup lang="ts">
import BasePage from './BasePage.vue';
import ReportSection from '../components/ReportSection.vue';
import WorldSection from '../components/WorldSection.vue';

withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);
</script>

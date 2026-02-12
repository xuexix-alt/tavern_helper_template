<template>
  <section class="section" id="other-residents-section">
    <h2 class="section-title">🏢 其他楼层情况 🏢</h2>
    <div class="other-residents-item">
      <div class="label">💬 楼层言语</div>
      <div class="value"><TextHighlight :text="store.data.楼层其他住户.言语" :query="query" /></div>
    </div>
    <div class="other-residents-item">
      <div class="label">🏃 楼层行为</div>
      <div class="value"><TextHighlight :text="store.data.楼层其他住户.行为" :query="query" /></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import TextHighlight from './TextHighlight.vue';
import { useDataStore } from '../../store';

withDefaults(
  defineProps<{
    query?: string;
  }>(),
  {
    query: '',
  },
);
const store = useDataStore();
</script>

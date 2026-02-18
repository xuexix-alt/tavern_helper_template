<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span class="eden-highlight-text" v-html="highlightedHtml"></span>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    text: string | number | null | undefined;
    query?: string;
  }>(),
  {
    query: '',
  },
);

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const highlightedHtml = computed(() => {
  const plain = props.text == null ? '' : String(props.text);
  if (!plain) return '';

  const safeText = escapeHtml(plain);
  const q = props.query.trim();
  if (!q) return safeText;

  const safeQuery = escapeHtml(q);
  const pattern = new RegExp(`(${escapeRegex(safeQuery)})`, 'gi');
  return safeText.replace(pattern, '<mark class="eden-search-mark">$1</mark>');
});
</script>

<style>
.eden-search-mark {
  background: rgba(241, 250, 140, 0.65);
  color: #121212;
  border-radius: 4px;
  padding: 0 1px;
}
</style>

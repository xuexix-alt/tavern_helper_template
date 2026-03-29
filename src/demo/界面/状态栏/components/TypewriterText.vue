<template>
  <span>{{ displayedText }}<span v-if="isStreaming" class="inline-block w-2 h-4 ml-1 bg-primary animate-pulse align-middle" /></span>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

const props = withDefaults(defineProps<{
  text: string;
  isStreaming?: boolean;
  speed?: number;
}>(), {
  isStreaming: false,
  speed: 15,
});

const displayedText = ref('');

let interval: number | null = null;
let targetText = '';

watch(() => props.text, (newText) => {
  if (props.isStreaming) {
    targetText = newText;
    
    if (interval) {
      clearInterval(interval);
    }
    
    interval = window.setInterval(() => {
      if (displayedText.value.length < targetText.length) {
        const chunkSize = Math.floor(Math.random() * 4) + 1;
        displayedText.value = targetText.slice(0, displayedText.value.length + chunkSize);
      } else {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    }, props.speed);
  } else {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    displayedText.value = newText;
  }
}, { immediate: true });

watch(() => props.isStreaming, (streaming) => {
  if (!streaming && interval) {
    clearInterval(interval);
    interval = null;
    displayedText.value = targetText;
  }
});

onUnmounted(() => {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
});
</script>

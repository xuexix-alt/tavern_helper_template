<template>
  <section class="line-height-control">
    <div class="line-height-head">
      <span class="line-height-label">正文行距</span>
      <div class="line-height-value">
        <strong>{{ sliderValue.toFixed(2) }}</strong>
        <small>{{ isCustom ? '自定义' : '自动' }}</small>
      </div>
    </div>

    <input
      class="line-height-slider"
      type="range"
      min="1.3"
      max="2.1"
      step="0.05"
      :value="sliderValue"
      aria-label="正文行距"
      @input="updateLineHeight"
    />

    <div class="line-height-foot">
      <span>紧凑 1.30</span>
      <button type="button" :disabled="!isCustom" @click="$emit('update:modelValue', null)">恢复自动</button>
      <span>宽松 2.10</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { normalizeReaderBodyLineHeight, resolveReaderBodyLineHeight } from '../readerLineHeight';
import type { TranscriptDensity } from '../types';

const props = defineProps<{
  modelValue: number | null;
  density: TranscriptDensity;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: number | null): void;
}>();

const isCustom = computed(() => props.modelValue != null);
const sliderValue = computed(() => resolveReaderBodyLineHeight(props.density, props.modelValue));

function updateLineHeight(event: Event) {
  const value = normalizeReaderBodyLineHeight((event.target as HTMLInputElement).value);
  if (value != null) emit('update:modelValue', value);
}
</script>

<style scoped>
.line-height-control {
  display: flex;
  flex-direction: column;
  flex: 1 1 320px;
  min-width: min(100%, 260px);
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
}

.line-height-head,
.line-height-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.line-height-label {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--demo-text-secondary);
}

.line-height-value {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
}

.line-height-value strong {
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
  font-size: 14px;
}

.line-height-value small,
.line-height-foot {
  color: var(--demo-text-secondary);
  font-family: var(--demo-font-mono);
  font-size: 10px;
}

.line-height-slider {
  width: 100%;
  accent-color: var(--demo-text-accent);
  cursor: pointer;
}

.line-height-foot button {
  border: 1px solid color-mix(in srgb, var(--primary) 26%, transparent);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  color: var(--demo-text-accent);
  padding: 4px 9px;
  font: inherit;
  cursor: pointer;
}

.line-height-foot button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

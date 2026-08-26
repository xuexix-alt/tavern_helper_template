<template>
  <label class="pre-floor-slider">
    <span class="pre-floor-slider__copy">
      <strong>正文楼层</strong>
      <small>{{ displayLabel }}</small>
    </span>
    <input
      type="range"
      :value="draftValue"
      :min="effectiveMinimum"
      :max="effectiveMaximum"
      step="1"
      :disabled="isDisabled"
      aria-label="正文显示楼层数"
      :aria-valuetext="displayLabel"
      @input="handleInput"
      @change="handleChange"
    />
  </label>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: number;
  minimum: number;
  maximum: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void;
  (event: 'change', value: number): void;
}>();

const effectiveMaximum = computed(() => Math.max(0, Math.trunc(Number(props.maximum) || 0)));
const effectiveMinimum = computed(() =>
  Math.min(effectiveMaximum.value, Math.max(0, Math.trunc(Number(props.minimum) || 0))),
);
const draftValue = ref(0);
const isDisabled = computed(() => props.disabled === true || effectiveMaximum.value <= effectiveMinimum.value);
const displayLabel = computed(() =>
  draftValue.value >= effectiveMaximum.value
    ? `全部 ${effectiveMaximum.value} 层`
    : `最近 ${draftValue.value} 层 / 共 ${effectiveMaximum.value} 层`,
);

function clampValue(value: unknown) {
  const numeric = Math.trunc(Number(value) || 0);
  return Math.min(effectiveMaximum.value, Math.max(effectiveMinimum.value, numeric));
}

function syncDraft() {
  draftValue.value = clampValue(props.modelValue);
}

function handleInput(event: Event) {
  const next = clampValue((event.target as HTMLInputElement).value);
  draftValue.value = next;
  emit('update:modelValue', next);
}

function handleChange() {
  emit('change', draftValue.value);
}

watch([() => props.modelValue, effectiveMinimum, effectiveMaximum], syncDraft, { immediate: true });
</script>

<style scoped>
.pre-floor-slider {
  display: grid;
  min-width: 220px;
  gap: 8px;
  padding: 10px 12px;
  color: var(--demo-text-primary);
}

.pre-floor-slider__copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.pre-floor-slider__copy strong,
.pre-floor-slider__copy small {
  font-size: 12px;
}

.pre-floor-slider__copy small {
  color: var(--demo-text-tertiary);
}

.pre-floor-slider input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  margin: 0;
  accent-color: var(--primary);
  cursor: pointer;
}

.pre-floor-slider input:focus-visible {
  outline: 2px solid var(--demo-border-accent-active);
  outline-offset: 2px;
}

.pre-floor-slider input:disabled {
  cursor: default;
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .pre-floor-slider input {
    scroll-behavior: auto;
  }
}
</style>

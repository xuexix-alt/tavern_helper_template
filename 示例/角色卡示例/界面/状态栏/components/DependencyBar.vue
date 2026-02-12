<template>
  <div class="dependency-strip" :class="`dependency-strip--${dependency_tone}`">
    <span class="dependency-label">依存度</span>
    <div class="dependency-track">
      <div class="dependency-fill" :style="{ width: dependency + '%' }"></div>
      <span class="dependency-marker">{{ dependency }}%</span>
    </div>
    <div class="dependency-controls">
      <button
        class="dependency-button"
        :disabled="dependency <= 0"
        type="button"
        @click="adjustDependency(-1)"
      >
        -
      </button>
      <button
        class="dependency-button"
        :disabled="dependency >= 100"
        type="button"
        @click="adjustDependency(1)"
      >
        +
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDataStore } from '../store';

const store = useDataStore();
const dependency = computed(() => Math.min(100, Math.max(0, store.data.白娅.依存度)));
const dependency_tone = computed(() => {
  if (dependency.value >= 70) return 'high';
  if (dependency.value >= 35) return 'mid';
  return 'low';
});

function adjustDependency(delta: number) {
  store.data.白娅.依存度 = Math.min(100, Math.max(0, store.data.白娅.依存度 + delta));
}
</script>

<style lang="scss" scoped>
.dependency-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: rgba(255, 255, 255, 0.84);
  border-bottom: 1px dashed rgba(76, 98, 89, 0.45);
  transition: background-color 0.22s ease;
}

.dependency-label {
  font-weight: 700;
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.dependency-track {
  flex: 1;
  height: 14px;
  border: 1px solid rgba(60, 73, 63, 0.34);
  border-radius: 999px;
  background: rgba(232, 239, 235, 0.9);
  position: relative;
  overflow: hidden;
}

.dependency-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #91d8b7, #75c5a2);
  transition: width 0.22s ease;
}

.dependency-marker {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.66rem;
  font-weight: 700;
  color: #314137;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
}

.dependency-controls {
  display: flex;
  gap: 6px;
}

.dependency-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(60, 73, 63, 0.45);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(240, 247, 244, 0.82));
  color: var(--c-granite);
  font-family: inherit;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(20, 45, 35, 0.1);
  transition: transform 0.14s ease, box-shadow 0.14s ease;
}

.dependency-button:active:not(:disabled) {
  transform: translate(1px, 1px);
  box-shadow: 0 2px 4px rgba(20, 45, 35, 0.12);
}

.dependency-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.dependency-button:focus-visible {
  outline: 2px solid rgba(83, 117, 100, 0.6);
  outline-offset: 1px;
}

.dependency-strip--mid .dependency-fill {
  background: linear-gradient(90deg, #89c9f3, #74afd4);
}

.dependency-strip--high .dependency-fill {
  background: linear-gradient(90deg, #6f97ff, #7a6bf0);
}

@media (max-width: 640px) {
  .dependency-strip {
    padding: 8px 10px;
    gap: 6px;
  }

  .dependency-label {
    font-size: 0.76rem;
  }

  .dependency-track {
    height: 12px;
  }

  .dependency-marker {
    font-size: 0.62rem;
  }

  .dependency-button {
    width: 26px;
    height: 26px;
  }
}
</style>

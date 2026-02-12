<template>
  <div class="eden-searchbar" @click.stop>
    <div class="eden-searchbar-inner">
      <span class="eden-searchbar-label" aria-hidden="true">检索</span>
      <input
        id="eden-search-input"
        v-model="model"
        type="text"
        class="eden-searchbar-input text_pole"
        :placeholder="placeholderText"
        @keydown.esc="clearQuery"
        @click.stop
      />
      <button v-if="model" class="eden-searchbar-clear" type="button" @click.stop="clearQuery">
        {{ clearText }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';

const model = defineModel<string>({ required: true });
const compactMode = useMediaQuery('(max-width: 420px)');
const placeholderText = computed(() => (compactMode.value ? '搜索当前页（/）' : '输入关键词高亮当前页（/ 快捷聚焦）'));
const clearText = computed(() => (compactMode.value ? '×' : '清除'));

function clearQuery() {
  model.value = '';
}

function onSlashFocus(event: KeyboardEvent) {
  if (event.key !== '/') return;
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
  event.preventDefault();
  const input = document.getElementById('eden-search-input') as HTMLInputElement | null;
  input?.focus();
}

onMounted(() => {
  window.addEventListener('keydown', onSlashFocus);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSlashFocus);
});
</script>

<style scoped>
.eden-searchbar {
  padding: 0;
}

.eden-searchbar-inner {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 9px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
}

.eden-searchbar-inner:focus-within {
  border-color: rgba(139, 233, 253, 0.6);
  box-shadow: 0 0 0 2px rgba(139, 233, 253, 0.22);
}

.eden-searchbar-label {
  flex: 0 0 auto;
  font-size: 0.66em;
  line-height: 1;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(139, 233, 253, 0.2);
  border: 1px solid rgba(139, 233, 253, 0.45);
  color: var(--text-color);
}

.eden-searchbar-input {
  flex: 1;
  min-width: 0;
  width: 100%;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.22);
  color: var(--text-color);
  padding: 6px 8px;
  font: inherit;
  font-size: 0.88em;
}

.eden-searchbar-input::placeholder {
  color: rgba(248, 248, 242, 0.55);
}

.eden-searchbar-clear {
  flex: 0 0 auto;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  font: inherit;
  font-size: 0.76em;
  line-height: 1;
  padding: 6px 8px;
  cursor: pointer;
}

.eden-searchbar-clear:hover {
  background: rgba(139, 233, 253, 0.2);
}

@media (max-width: 420px) {
  .eden-searchbar-label {
    display: none;
  }

  .eden-searchbar-input {
    font-size: 0.84em;
    padding: 6px 7px;
  }

  .eden-searchbar-clear {
    min-width: 30px;
    padding: 5px 6px;
  }
}
</style>

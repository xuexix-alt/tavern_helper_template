<script setup lang="ts">
import { computed } from 'vue';
import { EDEN_GROUPS, getEdenRuntime, type EdenDocument, type EdenContext } from '../model';
const props = defineProps<{ document: EdenDocument; context: EdenContext; initialized: boolean; locked?: boolean }>();
const emit = defineEmits<{ edit: [] }>();
const state = computed(() => getEdenRuntime(props.document, props.context));
</script>
<template>
  <section class="ability-board">
    <header class="level-banner">
      <small>EDEN / {{ initialized ? '当前伊甸' : '待确认默认方案' }}</small>
      <button type="button" :disabled="locked" @click="emit('edit')">编辑</button>

      <h2>{{ document.levelNames[document.level - 1] }}</h2>
      <p>{{ document.level }}级 · {{ !initialized ? '待确认启用' : state.running ? '运行中' : '停机 / 停用' }}</p>
    </header>
    <section v-for="group in EDEN_GROUPS" :key="group">
      <h3>
        {{ group }}
        <small
          >{{
            Object.values(document.abilities).filter(a => a.group === group && a.level <= document.level).length
          }}
          项</small
        >
      </h3>
      <div class="grid">
        <article
          v-for="[id, ability] in Object.entries(document.abilities).filter(
            ([, a]) => a.group === group && a.level <= document.level,
          )"
          :key="id"
        >
          <strong>{{ ability.name }}</strong
          ><small>{{
            state.abilities.some(a => a.id === id)
              ? initialized
                ? '已启用'
                : '方案可用'
              : ability.level > document.level
                ? '等级未达'
                : ability.condition && !ability.conditionConfirmed
                  ? '条件待确认'
                  : '未启用'
          }}</small>
          <p>{{ ability.effect }}</p>
          <p v-if="ability.limit" class="muted">{{ ability.limit }}</p>
        </article>
      </div>
    </section>
  </section>
  <details>
    <summary>
      未解锁能力（{{ Object.values(document.abilities).filter(a => a.level > document.level).length }}）
    </summary>
    <article
      v-for="[id, a] in Object.entries(document.abilities).filter(([, a]) => a.level > document.level)"
      :key="id"
    >
      <strong>{{ a.name }} · {{ a.level }}级</strong>
      <p>{{ a.effect }}</p>
    </article>
  </details>
</template>
<style scoped>
.level-banner {
  padding: 20px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 12px;
}
.level-banner h2 {
  margin: 8px 0;
}
.muted,
small {
  color: var(--demo-text-secondary);
}
.ability-board article {
  border-radius: 10px;
}
.eden-editor,
fieldset,
section,
article {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
}
article {
  padding: 12px;
  border: 1px solid var(--demo-border-accent-soft);
}
label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--demo-text-secondary);
}
input,
textarea,
select,
button {
  font: inherit;
  color: var(--demo-text-primary);
  background: var(--surface);
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 6px;
  padding: 8px;
  max-width: 100%;
  box-sizing: border-box;
}
textarea {
  width: 100%;
  resize: vertical;
}
input[type='checkbox'] {
  align-self: flex-start;
}
header,
h3 {
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
}
p {
  margin: 0;
  overflow-wrap: anywhere;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  margin: 0;
}
footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
button:disabled {
  opacity: 0.5;
}
@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>

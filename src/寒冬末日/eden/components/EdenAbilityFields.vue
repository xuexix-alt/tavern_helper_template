<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cloneDeep } from 'lodash';
import { EDEN_GROUPS, getEdenRuntime, type EdenDocument, type EdenContext } from '../model';
const props = defineProps<{ modelValue: EdenDocument; context: EdenContext; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [document: EdenDocument] }>();
const draft = ref(cloneDeep(props.modelValue));
let syncing = false;
watch(
  () => props.modelValue,
  value => {
    syncing = true;
    draft.value = cloneDeep(value);
    syncing = false;
  },
  { deep: true, flush: 'sync' },
);
watch(
  draft,
  value => {
    if (!syncing && !props.disabled) emit('update:modelValue', cloneDeep(value));
  },
  { deep: true, flush: 'sync' },
);
const state = computed(() => getEdenRuntime(draft.value, props.context));
function add(group: (typeof EDEN_GROUPS)[number]) {
  if (draft.value && !props.disabled)
    draft.value.abilities[
      `custom-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
    ] = {
      name: '新能力',
      group,
      effect: '请填写效果',
      limit: '',
      level: 1,
      condition: '',
      conditionConfirmed: false,
      enabled: false,
      replaces: [],
    };
}
</script>
<template>
  <fieldset :disabled="disabled">
    <section>
      <div class="grid">
        <label v-for="(_, i) in draft.levelNames" :key="i"
          >{{ i + 1 }}级名称<input v-model="draft.levelNames[i]"
        /></label>
      </div>
      <label
        >本体等级<select v-model.number="draft.level">
          <option v-for="i in 4" :key="i" :value="i">{{ i }}级</option>
        </select></label
      ><label
        >状态<select v-model="draft.status">
          <option>运行</option>
          <option>停用</option>
        </select></label
      ><label
        >外接房号（逗号分隔）<input
          :value="draft.rooms.join(',')"
          @input="draft.rooms = ($event.target as HTMLInputElement).value.split(/[,，、\s]+/).filter(Boolean)"
      /></label>
      <section v-for="group in EDEN_GROUPS" :key="group">
        <h3>{{ group }}</h3>
        <article v-for="[id, a] in Object.entries(draft.abilities).filter(([, a]) => a.group === group)" :key="id">
          <strong
            >{{ a.name }} · {{ '草稿' }}{{ state?.abilities.some(item => item.id === id) ? '可用' : '未启用' }}</strong
          >
          <p>{{ a.effect }}</p>
          <p>限制：{{ a.limit || '无额外限制' }}</p>
          <details>
            <summary>编辑能力</summary>
            <label
              >分组<select v-model="a.group">
                <option v-for="g in EDEN_GROUPS" :key="g">{{ g }}</option>
              </select></label
            ><label>名称<input v-model="a.name" /></label><label>效果<textarea v-model="a.effect" rows="2" /></label
            ><label>限制<textarea v-model="a.limit" rows="2" /></label
            ><label
              >所需等级<select v-model.number="a.level">
                <option v-for="i in 4" :key="i" :value="i">{{ i }}</option>
              </select></label
            ><label>条件<input v-model="a.condition" /></label
            ><label><input v-model="a.conditionConfirmed" type="checkbox" />已确认条件</label
            ><label><input v-model="a.enabled" type="checkbox" />启用</label>
            <label
              >替代的旧能力（可选，多选）<select v-model="a.replaces" multiple>
                <option
                  v-for="[otherId, other] in Object.entries(draft.abilities).filter(([otherId]) => otherId !== id)"
                  :key="otherId"
                  :value="otherId"
                >
                  {{ other.name }}
                </option>
              </select></label
            >
            <p>
              {{
                !state?.running
                  ? '停机 / 停用'
                  : a.level > draft.level
                    ? '等级未达'
                    : a.condition && !a.conditionConfirmed
                      ? '条件待确认'
                      : a.enabled
                        ? '草稿可用'
                        : '未启用'
              }}
            </p>
            <button type="button" @click="delete draft.abilities[id]">移除能力</button>
          </details>
        </article>
        <button type="button" @click="add(group)">添加自定义能力</button>
      </section>
    </section>
  </fieldset>
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

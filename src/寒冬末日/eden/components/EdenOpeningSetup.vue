<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cloneDeep } from 'lodash';
import EdenAbilityBoard from './EdenAbilityBoard.vue';
import EdenAbilityFields from './EdenAbilityFields.vue';
import EdenMissionBoard from './EdenMissionBoard.vue';
import { EdenDocumentSchema, type EdenDocument, type InitialEdenTechnology } from '../model';
import { renderEdenEntries } from '../worldbook';
const props = defineProps<{
  document: EdenDocument;
  startDay: number;
  setupKey: string;
  locked?: boolean;
  busy?: boolean;
  initialized?: boolean;
}>();
const emit = defineEmits<{
  'update:document': [document: EdenDocument];
  'update:startDay': [day: number];
  'preview-ready': [ready: boolean];
}>();
const editing = ref(false);
const draft = ref(cloneDeep(props.document));
const day = ref(props.startDay);
const message = ref('');
const ready = ref(false);
const branch = ref<InitialEdenTechnology['branch']>('农业');
const techLevel = ref(0);
const techName = ref('');
const disabled = computed(() => !!props.locked || !!props.busy);
const context = computed(() => ({ day: props.startDay, messageId: 0 }));
const normalized = computed(() => ({
  ...cloneDeep(props.document),
  rescueStartDay: props.document.revision > 0 ? props.document.rescueStartDay : Math.max(0, props.startDay),
}));
const entries = computed(() =>
  ready.value
    ? renderEdenEntries(normalized.value, context.value).filter(
        entry => entry.enabled && ['当前伊甸', '当前救亡任务', '当前伊甸技术'].includes(entry.name),
      )
    : [],
);
function invalidatePreview() {
  ready.value = false;
  emit('preview-ready', false);
}
watch(
  () => [props.document, props.startDay, props.setupKey],
  () => {
    invalidatePreview();
    message.value = '';
  },
  { deep: true },
);
watch(
  () => props.setupKey,
  () => {
    editing.value = false;
  },
);
function edit() {
  if (disabled.value) return;
  draft.value = cloneDeep(props.document);
  day.value = props.startDay;
  editing.value = true;
  message.value = '';
  invalidatePreview();
}
function validate(document: EdenDocument, startDay: number) {
  if (!Number.isSafeInteger(startDay)) throw new Error('起始灾变天数必须为整数');
  return EdenDocumentSchema.parse({
    ...cloneDeep(document),
    rescueStartDay: document.revision > 0 ? document.rescueStartDay : Math.max(0, startDay),
  });
}
function finish() {
  if (disabled.value) return;
  try {
    const next = validate(draft.value, day.value);
    emit('update:document', cloneDeep(next));
    emit('update:startDay', day.value);
    editing.value = false;
    message.value = '';
    invalidatePreview();
  } catch (error) {
    message.value = String(error);
  }
}
function addTechnology() {
  if (disabled.value) return;
  if (
    draft.value.initialTechnologies.some(item => item.branch === branch.value && item.techLevel === techLevel.value)
  ) {
    message.value = '初始技术不能重复';
    return;
  }
  draft.value = {
    ...cloneDeep(draft.value),
    initialTechnologies: [
      ...draft.value.initialTechnologies,
      {
        branch: branch.value,
        techLevel: techLevel.value,
        name: techName.value.trim() || `${branch.value}lv${techLevel.value}`,
      },
    ],
  };
  techName.value = '';
  message.value = '';
}
function removeTechnology(index: number) {
  if (!disabled.value)
    draft.value = {
      ...cloneDeep(draft.value),
      initialTechnologies: draft.value.initialTechnologies.filter((_, i) => i !== index),
    };
}
function requestConfirmation(): boolean {
  if (props.busy) return false;
  if (editing.value) {
    message.value = '请先完成或取消编辑，再预览开局配置';
    return false;
  }
  try {
    validate(props.document, props.startDay);
  } catch (error) {
    message.value = String(error);
    invalidatePreview();
    return false;
  }
  if (ready.value) return true;
  ready.value = true;
  message.value = '';
  emit('preview-ready', true);
  return false;
}
defineExpose({ requestConfirmation, invalidatePreview });
</script>
<template>
  <section class="eden-opening">
    <header>
      <small>EDEN / OPENING</small>
      <h2>伊甸初始配置</h2>
      <p>选择本次开局的能力、时间与已掌握技术。</p>
    </header>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="locked" class="muted">已有剧情，初始配置已锁定。</p>
    <template v-if="!editing">
      <EdenAbilityBoard
        :document="normalized"
        :context="context"
        :initialized="!!initialized"
        :locked="disabled"
        @edit="edit"
      />
      <div class="summary">
        <strong>{{ startDay < 0 ? `灾前${Math.abs(startDay)}天` : `灾后第${startDay}天` }}</strong
        ><span>{{
          startDay < 0 ? '救亡计时将在灾变第0天开始' : `救亡计时从第${normalized.rescueStartDay}天开始`
        }}</span>
      </div>
      <section>
        <h3>初始已掌握技术</h3>
        <p v-if="!document.initialTechnologies.length" class="muted">尚未掌握</p>
        <div class="tags">
          <span v-for="tech in document.initialTechnologies" :key="`${tech.branch}-${tech.techLevel}`"
            >{{ tech.branch }} lv{{ tech.techLevel }} · {{ tech.name }}</span
          >
        </div>
      </section>
      <EdenMissionBoard
        :document="normalized"
        :context="context"
        tab="rescue"
        :initialized="!!initialized"
        :locked="true"
        :show-initial-technologies="false"
      />
    </template>
    <fieldset v-else :disabled="disabled">
      <label>起始灾变天数<input v-model.number="day" type="number" step="1" /></label>
      <p class="muted">负数为灾前，0及以上为灾后；灾前从第0天开始计时。</p>
      <EdenAbilityFields v-model="draft" :context="{ day, messageId: 0 }" :disabled="disabled" />
      <section>
        <h3>初始已掌握技术</h3>
        <p class="muted">选择高等级技术不会自动掌握低等级技术，也不会附送设备、人口、原料或生产体系。</p>
        <div
          v-for="(tech, index) in draft.initialTechnologies"
          :key="`${tech.branch}-${tech.techLevel}`"
          class="technology"
        >
          <span>{{ tech.branch }} lv{{ tech.techLevel }} · {{ tech.name }}</span
          ><button type="button" @click="removeTechnology(index)">移除技术</button>
        </div>
        <div class="grid">
          <label
            >技术分支<select v-model="branch">
              <option>农业</option>
              <option>工业</option>
              <option>气象</option>
            </select></label
          ><label
            >技术等级<select v-model.number="techLevel">
              <option v-for="level in 6" :key="level" :value="level - 1">lv{{ level - 1 }}</option>
            </select></label
          >
        </div>
        <label>技术名称<input v-model="techName" placeholder="可填写技术名称" /></label
        ><button type="button" @click="addTechnology">添加初始技术</button>
      </section>
      <footer>
        <button
          type="button"
          @click="
            editing = false;
            message = '';
          "
        >
          取消编辑</button
        ><button type="button" @click="finish">完成编辑</button>
      </footer>
    </fieldset>
    <section v-if="ready" class="preview">
      <h3>开局配置预览</h3>
      <p>
        {{ document.level }}级 · {{ document.status }} · 起始日 {{ startDay }} · 授权房间：{{
          document.rooms.join('、') || '无外接房间'
        }}
      </p>
      <p>首次期限：第 {{ normalized.rescueStartDay + 30 }} 天。请确认下列实际生效能力、条件、技术和任务。</p>
      <details v-for="entry in entries" :key="entry.name">
        <summary>{{ entry.name }}</summary>
        <pre>{{ entry.content }}</pre>
      </details>
    </section>
  </section>
</template>
<style scoped>
.eden-opening,
section,
fieldset {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.eden-opening {
  padding: 16px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 14px;
}
header,
h3 {
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
}
h2,
h3,
p {
  margin: 0;
  overflow-wrap: anywhere;
}
.muted,
small,
label {
  color: var(--demo-text-secondary);
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
input,
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
button:disabled {
  opacity: 0.5;
}
.summary,
.preview {
  padding: 12px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 10px;
}
.summary,
.technology,
footer,
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.tags span {
  padding: 6px 10px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 20px;
  overflow-wrap: anywhere;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .eden-opening {
    padding: 10px;
  }
}
</style>

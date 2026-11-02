<script setup lang="ts">
import { computed, watch, ref, onMounted, onBeforeUnmount } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import EdenMissionBoard from './EdenMissionBoard.vue';
import { cloneDeep } from 'lodash';
import {
  EdenDocumentSchema,
  EDEN_GROUPS,
  getEdenRuntime,
  confirmAchievement,
  type AchievementInput,
  type EdenDocument,
} from '../model';
import { createDefaultEdenDocument } from '../defaults';
import {
  loadEdenDocument,
  saveEdenDocument,
  renderEdenEntries,
  EdenWorldbookSaveError,
  type SavedEden,
} from '../worldbook';
import { currentEdenChatId, getEdenHostDeps, readEdenContext, readEdenSnapshot, notifyEdenSaved } from '../runtime';
import missionLore from '../../世界书/寒冬末日/末日救亡任务.txt?raw';
import technologyLore from '../../世界书/寒冬末日/伊甸技术.txt?raw';
const props = defineProps<{ tab: 'abilities' | 'rescue' | 'technology'; busy?: boolean }>();
const draft = ref<EdenDocument | null>(null),
  loaded = ref<SavedEden | null>(null),
  saving = ref(false),
  loading = ref(true),
  preview = ref(false),
  message = ref(''),
  high = ref(false),
  chosen = ref(false);
const loadFailed = ref(false),
  legacyLevel = ref(1);
const loadedBinding = ref<string | null>(null);
watch(
  () => JSON.stringify(draft.value),
  () => {
    preview.value = false;
  },
  { flush: 'sync' },
);
const context = ref(readEdenContext());
let chatId = currentEdenChatId(),
  epoch = 0;
let listener: { stop(): void } | undefined;
const locked = computed(() => props.busy || saving.value || loading.value);
const plain = () => EdenDocumentSchema.parse(cloneDeep(draft.value));
const valid = computed(
  () => draft.value && EdenDocumentSchema.safeParse(cloneDeep(draft.value)).success && (!high.value || chosen.value),
);
const state = computed(() => (draft.value ? getEdenRuntime(draft.value, context.value) : null));
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(loaded.value?.document ?? null));
const entries = computed(() =>
  preview.value && valid.value
    ? renderEdenEntries(plain(), context.value).filter(e => e.enabled && e.name === '当前伊甸')
    : [],
);
const editMode = ref(false);
const intel = ref<Record<string, any>>({});
const defaultView = createDefaultEdenDocument({ missionLore, technologyLore, startDay: 0 });
const formal = computed(
  () =>
    loaded.value?.document ?? {
      ...defaultView,
      rescueStartDay: Math.max(0, context.value.day ?? 0),
      level: Math.min(4, Math.max(1, legacyLevel.value)),
    },
);
const formalState = computed(() => getEdenRuntime(formal.value, context.value));
function refreshContext() {
  const nextContext = readEdenContext();
  if (JSON.stringify(context.value) !== JSON.stringify(nextContext)) preview.value = false;
  context.value = nextContext;
  intel.value = readEdenSnapshot().statData.主线任务?.情报碎片 ?? {};
}
function edit() {
  draft.value = cloneDeep(formal.value);
  editMode.value = true;
}
const deferredRefresh = useDebounceFn(refreshContext, 50);
async function registerAchievement(input: AchievementInput) {
  if (!loaded.value || editMode.value || locked.value) return;
  saving.value = true;
  const token = epoch;
  try {
    refreshContext();
    const next = confirmAchievement(cloneDeep(loaded.value.document), input, context.value);
    const saved = await saveEdenDocument(
      chatId,
      next,
      loaded.value.document.revision,
      context.value,
      getEdenHostDeps(),
      loadedBinding.value,
    );
    if (token !== epoch) return;
    loaded.value = saved;
    loadedBinding.value = saved.worldbookName;
    draft.value = cloneDeep(saved.document);
    message.value = '成果已确认';
    try {
      await notifyEdenSaved(saved, chatId);
    } catch (error) {
      if (token === epoch) message.value = `成果已确认，界面同步失败：${String(error)}`;
    }
  } catch (error) {
    if (token === epoch) message.value = String(error);
  } finally {
    if (token === epoch) saving.value = false;
  }
}
function recover() {
  refreshContext();
  if (!draft.value || context.value.day === null || context.value.day < 0) return;
  draft.value.rescueStartDay = context.value.day;
  draft.value.status = '运行';
  message.value = '恢复已加入草稿，请预览并确认写入';
}
const boardListeners: Array<{ stop(): void }> = [];
async function load() {
  const token = ++epoch;
  chatId = currentEdenChatId();
  draft.value = null;
  loaded.value = null;
  preview.value = false;
  message.value = '';
  loading.value = true;
  saving.value = false;
  loadFailed.value = false;
  try {
    refreshContext();
    editMode.value = false;
    legacyLevel.value = Number(readEdenSnapshot().statData.庇护所?.庇护所等级) || 1;
    high.value = legacyLevel.value > 4;
    chosen.value = false;
    loadedBinding.value = getEdenHostDeps().boundWorldbook();
    const result = await loadEdenDocument(chatId, getEdenHostDeps());
    if (token !== epoch) return;
    loaded.value = result;
    draft.value = result ? cloneDeep(result.document) : null;
  } catch (e) {
    if (token === epoch) {
      loadFailed.value = true;
      message.value = String(e);
    }
  } finally {
    if (token === epoch) loading.value = false;
  }
}
function cancel() {
  editMode.value = false;
  draft.value = loaded.value ? cloneDeep(loaded.value.document) : null;
  preview.value = false;
}
function add(group: (typeof EDEN_GROUPS)[number]) {
  if (draft.value)
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
function showPreview() {
  try {
    const now = readEdenContext();
    if (!loaded.value && draft.value) draft.value.rescueStartDay = Math.max(0, now.day ?? 0);
    plain();
    if (!valid.value) throw Error('请明确选择1至4级');
    context.value = now;
    preview.value = true;
    message.value = '';
  } catch (e) {
    message.value = String(e);
  }
}
async function save() {
  const token = epoch,
    target = chatId;
  const now = readEdenContext();
  if (JSON.stringify(now) !== JSON.stringify(context.value)) {
    preview.value = false;
    message.value = '剧情日期或楼层已改变，请重新预览';
    return;
  }
  saving.value = true;
  try {
    const saved = await saveEdenDocument(
      target,
      plain(),
      loaded.value?.document.revision ?? 0,
      readEdenContext(),
      getEdenHostDeps(),
      loadedBinding.value,
    );
    if (token !== epoch) return;
    loaded.value = saved;
    editMode.value = false;
    loadedBinding.value = saved.worldbookName;
    draft.value = cloneDeep(saved.document);
    message.value = `已保存至世界书：${saved.worldbookName}`;
    try {
      await notifyEdenSaved(saved, target);
    } catch (e) {
      if (token === epoch) message.value = `世界书已保存，旧面板同步失败：${String(e)}`;
    }
  } catch (e) {
    if (token === epoch) {
      if (
        e instanceof EdenWorldbookSaveError &&
        currentEdenChatId() === target &&
        getEdenHostDeps().boundWorldbook() === e.createdWorldbookName
      )
        loadedBinding.value = e.createdWorldbookName;
      message.value = String(e);
    }
  } finally {
    if (token === epoch) saving.value = false;
  }
}
onMounted(() => {
  void load();
  for (const name of [
    tavern_events.MESSAGE_UPDATED,
    tavern_events.MESSAGE_RECEIVED,
    tavern_events.MESSAGE_DELETED,
    tavern_events.MESSAGE_SWIPED,
  ]) {
    if (name) boardListeners.push(eventOn(name, deferredRefresh));
  }
  listener = eventOn(tavern_events.CHAT_CHANGED, () => {
    void load();
  });
});
onBeforeUnmount(() => {
  epoch++;
  listener?.stop();
  boardListeners.forEach(item => item.stop());
});
</script>
<template>
  <section class="eden-editor">
    <p role="status">{{ message }}</p>
    <p v-if="loading">正在读取世界书…</p>
    <template v-else-if="loadFailed"
      ><p>世界书读取失败，请重试。</p>
      <button type="button" :disabled="locked" @click="load">重新读取世界书</button></template
    ><template v-else>
      <EdenMissionBoard
        v-if="props.tab !== 'abilities'"
        :document="formal"
        :context="context"
        :tab="props.tab"
        :intel="intel"
        :initialized="!!loaded"
        :locked="!!locked || editMode"
        :error="message"
        @confirm="registerAchievement"
      />
      <section v-if="props.tab === 'abilities' && !editMode" class="ability-board">
        <header class="level-banner">
          <small>EDEN / {{ loaded ? '当前伊甸' : '待确认默认方案' }}</small>
          <button v-if="!editMode && props.tab === 'abilities'" type="button" :disabled="locked" @click="edit">
            编辑
          </button>

          <h2>{{ formal.levelNames[formal.level - 1] }}</h2>
          <p>{{ formal.level }}级 · {{ !loaded ? '待确认启用' : formalState.running ? '运行中' : '停机 / 停用' }}</p>
        </header>
        <section v-for="group in EDEN_GROUPS" :key="group">
          <h3>
            {{ group }}
            <small
              >{{
                Object.values(formal.abilities).filter(a => a.group === group && a.level <= formal.level).length
              }}
              项</small
            >
          </h3>
          <div class="grid">
            <article
              v-for="[id, ability] in Object.entries(formal.abilities).filter(
                ([, a]) => a.group === group && a.level <= formal.level,
              )"
              :key="id"
            >
              <strong>{{ ability.name }}</strong
              ><small>{{
                formalState.abilities.some(a => a.id === id)
                  ? loaded
                    ? '已启用'
                    : '方案可用'
                  : ability.level > formal.level
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
      <details v-if="props.tab === 'abilities' && !editMode">
        <summary>
          未解锁能力（{{ Object.values(formal.abilities).filter(a => a.level > formal.level).length }}）
        </summary>
        <article
          v-for="[id, a] in Object.entries(formal.abilities).filter(([, a]) => a.level > formal.level)"
          :key="id"
        >
          <strong>{{ a.name }} · {{ a.level }}级</strong>
          <p>{{ a.effect }}</p>
        </article>
      </details>
      <template v-if="editMode && draft && props.tab === 'abilities'">
        <button v-if="!dirty" type="button" :disabled="locked" @click="load">重新读取世界书</button>
        <header>
          {{ dirty ? '草稿预览' : '当前伊甸' }} · {{ draft.level }}级 · {{ state?.running ? '运行' : '停机 / 停用' }} ·
          {{ dirty ? '未保存草稿' : '已保存' }}
          <p v-if="loaded">世界书：{{ loaded.worldbookName }}</p>
        </header>
        <p v-if="high && !chosen">旧存档超过四级，请明确选择1至4级，不会自动降级。</p>
        <fieldset :disabled="locked">
          <button v-if="state?.rescue.overdue" type="button" @click="recover">人工确认恢复（预览后写入）</button>
          <button v-if="high && !chosen" type="button" @click="chosen = true">
            确认使用所选{{ draft.level }}级迁移
          </button>
          <section v-show="props.tab === 'abilities'">
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
              <article
                v-for="[id, a] in Object.entries(draft.abilities).filter(([, a]) => a.group === group)"
                :key="id"
              >
                <strong
                  >{{ a.name }} · {{ dirty ? '草稿' : ''
                  }}{{ state?.abilities.some(item => item.id === id) ? '可用' : '未启用' }}</strong
                >
                <p>{{ a.effect }}</p>
                <p>限制：{{ a.limit || '无额外限制' }}</p>
                <details>
                  <summary>编辑能力</summary>
                  <label
                    >分组<select v-model="a.group">
                      <option v-for="g in EDEN_GROUPS" :key="g">{{ g }}</option>
                    </select></label
                  ><label>名称<input v-model="a.name" /></label
                  ><label>效果<textarea v-model="a.effect" rows="2" /></label
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
                        v-for="[otherId, other] in Object.entries(draft.abilities).filter(
                          ([otherId]) => otherId !== id,
                        )"
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
        <footer>
          <button type="button" :disabled="locked" @click="cancel">取消编辑</button
          ><button type="button" :disabled="locked" @click="showPreview">预览世界书</button
          ><button v-if="preview && valid" type="button" :disabled="locked" @click="save">
            {{ saving ? '写入中…' : '确认写入' }}
          </button>
        </footer>
        <section v-if="preview">
          <article v-for="entry in entries" :key="entry.name">
            <h3>{{ entry.name }}</h3>
            <pre>{{ entry.content }}</pre>
          </article>
        </section></template
      ></template
    >
  </section>
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

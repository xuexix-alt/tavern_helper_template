<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getEdenMissionBoard, type EdenDocument, type AchievementInput, type EdenContext } from '../model';
const props = defineProps<{
  document: EdenDocument;
  context: EdenContext;
  tab: 'rescue' | 'technology';
  intel?: Record<string, any>;
  initialized?: boolean;
  locked?: boolean;
  error?: string;
  showInitialTechnologies?: boolean;
}>();
const board = computed(() => getEdenMissionBoard(props.document, props.context, props.intel));
const achievements = computed(() =>
  board.value.achievements.filter(a => props.tab !== 'technology' || a.kind === '技术'),
);
const emit = defineEmits<{ confirm: [input: AchievementInput] }>();
const dialog = ref<HTMLDialogElement>();
const form = ref<AchievementInput>({ kind: '技术', key: '', name: '', evidence: '', branch: '农业', techLevel: 0 });
watch(
  () => props.document.revision,
  () => dialog.value?.close(),
);
function submit() {
  emit('confirm', { ...form.value });
}
</script>
<template>
  <section class="mission-board">
    <header>
      <small>EDEN / {{ tab === 'rescue' ? '救亡任务' : '技术线索' }}</small>
      <h2>{{ initialized ? '当前任务' : '待确认任务预览' }}</h2>
      <strong>{{ board.currentTask.title }}</strong>
      <p>{{ board.currentTask.description }}</p>
    </header>
    <div v-if="initialized" class="badges">
      <span>{{ board.rescue.status }}</span
      ><span>{{
        context.day === null
          ? '日期未知'
          : context.day < 0
            ? `灾前${Math.abs(context.day)}天`
            : `灾后第${context.day}天`
      }}</span
      ><span v-if="context.day !== null && context.day >= 0">期限：第 {{ board.rescue.deadlineDay }} 天</span
      ><span v-if="context.day !== null && context.day >= 0"
        >剩余 {{ board.rescue.remainingDays ?? '尚未计时' }} 天</span
      >
    </div>
    <section>
      <h3>已知线索</h3>
      <article v-for="clue in board.clues" :key="clue.id">
        <div>
          <strong>{{ clue.title }}</strong
          ><small>{{ clue.status }}</small>
        </div>
        <p>{{ clue.description }}</p>
      </article>
      <p v-if="!board.clues.length" class="muted">尚无已知线索，继续探索以获取情报。</p>
    </section>
    <section v-if="showInitialTechnologies !== false && document.initialTechnologies.length">
      <h3>初始已掌握技术</h3>
      <article v-for="tech in document.initialTechnologies" :key="`${tech.branch}-${tech.techLevel}`">
        <strong>{{ tech.branch }} lv{{ tech.techLevel }} · {{ tech.name }}</strong>
        <p class="muted">开局条件，不计为新增成果。</p>
      </article>
    </section>
    <section>
      <h3>已确认成果</h3>
      <article v-for="item in achievements" :key="item.id">
        <strong>{{ item.name }}</strong>
        <p>{{ item.evidence }}</p>
        <small>第 {{ item.day }} 天 · {{ item.kind }}</small>
      </article>
      <p v-if="!achievements.length" class="muted">尚无已确认成果。</p>
    </section>
    <button v-if="initialized && !locked" type="button" class="register" @click="dialog?.showModal()">登记成果</button>
    <dialog ref="dialog">
      <form @submit.prevent="submit">
        <h3>登记剧情成果</h3>
        <p>根据已发生的剧情确认技术或生产成果。</p>
        <label
          >成果类型<select v-model="form.kind" :disabled="locked">
            <option>技术</option>
            <option>生产</option>
          </select></label
        >
        <template v-if="form.kind === '技术'"
          ><label
            >分支<select v-model="form.branch" :disabled="locked">
              <option>农业</option>
              <option>工业</option>
              <option>气象</option>
              <option>其他</option>
            </select></label
          ><label v-if="form.branch !== '其他'"
            >技术等级<select v-model.number="form.techLevel" :disabled="locked">
              <option v-for="level in [0, 1, 2, 3, 4, 5]" :key="level" :value="level">lv{{ level }}</option>
            </select></label
          ></template
        >
        <label v-if="form.kind === '生产' || form.branch === '其他'"
          >稳定编号<input v-model="form.key" required :disabled="locked"
        /></label>
        <label>名称<input v-model="form.name" required :disabled="locked" /></label
        ><label>剧情依据<textarea v-model="form.evidence" required rows="3" :disabled="locked" /></label>
        <p v-if="error" role="status">{{ error }}</p>
        <div class="badges">
          <button type="button" :disabled="locked" @click="dialog?.close()">取消</button
          ><button type="submit" :disabled="locked">{{ locked ? '确认中…' : '确认成果' }}</button>
        </div>
      </form>
    </dialog>
  </section>
</template>
<style scoped>
.mission-board,
section,
header,
article {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
header {
  padding: 20px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 12px;
}
h2,
h3,
p {
  margin: 0;
}
h2,
h3,
strong {
  color: var(--demo-text-accent);
}
p {
  line-height: 1.65;
  overflow-wrap: anywhere;
}
small,
.muted {
  color: var(--demo-text-secondary);
}
article {
  padding: 14px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 10px;
}
article > div,
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
}
.badges {
  justify-content: flex-start;
}
.badges span {
  padding: 6px 10px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 20px;
  font-size: 12px;
}
dialog {
  width: min(420px, calc(100% - 40px));
  box-sizing: border-box;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 14px;
  color: var(--demo-text-primary);
  background: var(--surface, #15251f);
  padding: 20px;
}
dialog::backdrop {
  background: #0008;
}
form,
label {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
input,
select,
textarea,
button {
  font: inherit;
  color: inherit;
  background: var(--surface);
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 7px;
  padding: 8px;
  box-sizing: border-box;
  max-width: 100%;
}
.register {
  align-self: flex-start;
}
</style>

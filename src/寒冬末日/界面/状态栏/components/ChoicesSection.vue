<template>
  <section class="section">
    <h2 class="section-title choices-title">⚜️ 快速剧情 ⚜️</h2>

    <div>
      <template v-if="filtered_options.length > 0">
        <button
          v-for="(opt, idx) in filtered_options"
          :key="idx"
          class="choice-item"
          type="button"
          @click.stop="openChoiceDialog(opt)"
        >
          <TextHighlight :text="opt" :query="props.query" />
        </button>
      </template>
      <template v-else-if="props.options.length > 0">
        <button class="choice-item" type="button" disabled>没有匹配当前关键词的选项。</button>
      </template>
      <template v-else>
        <button class="choice-item" type="button" disabled>当前无选项，请自由行动...</button>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="choiceDialogOpen" class="choice-modal-mask" @click.self="closeChoiceDialog">
        <div class="choice-modal" role="dialog" aria-modal="true">
          <div class="choice-modal-header">
            <div class="choice-modal-title">您还有要补充的吗？</div>
            <button class="choice-icon-btn" type="button" @click="closeChoiceDialog">✕</button>
          </div>

          <div class="choice-modal-body">
            <div class="choice-original-label">选项原文</div>
            <div class="choice-original">
              <TextHighlight :text="choiceDialogOriginal" :query="props.query" />
            </div>

            <div class="choice-edit-label">编辑后发送</div>
            <textarea
              ref="choiceTextareaRef"
              v-model="choiceDialogDraft"
              class="choice-textarea"
              rows="6"
              placeholder="在此补充或修改……"
            />
          </div>

          <div class="choice-modal-footer">
            <button
              class="choice-btn choice-btn--ghost"
              type="button"
              :disabled="choiceSending"
              @click="closeChoiceDialog"
            >
              取消
            </button>
            <button
              class="choice-btn choice-btn--primary"
              type="button"
              :disabled="choiceSending"
              @click="confirmChoiceDialog"
            >
              确认发送
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </section>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import { copyText, sendToChat } from '../../outbound';
import TextHighlight from './TextHighlight.vue';

const props = defineProps<{
  options: string[];
  query?: string;
}>();
const emit = defineEmits<{
  (event: 'choice-sent', payload: { text: string }): void;
}>();

const normalized_query = computed(() =>
  String(props.query ?? '')
    .trim()
    .toLowerCase(),
);
const filtered_options = computed(() => {
  if (!normalized_query.value) return props.options;
  return props.options.filter(opt =>
    String(opt ?? '')
      .toLowerCase()
      .includes(normalized_query.value),
  );
});

const choiceDialogOpen = ref(false);
const choiceDialogOriginal = ref('');
const choiceDialogDraft = ref('');
const choiceSending = ref(false);
const choiceTextareaRef = ref<HTMLTextAreaElement | null>(null);

async function openChoiceDialog(text: string) {
  choiceDialogOriginal.value = String(text ?? '');
  choiceDialogDraft.value = String(text ?? '');
  choiceDialogOpen.value = true;

  await nextTick();
  let el = choiceTextareaRef.value;
  if (!el) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    el = choiceTextareaRef.value;
  }
  if (!el) return;
  el?.focus?.();
  try {
    el?.setSelectionRange?.(el.value.length, el.value.length);
  } catch {
    // ignore
  }
}

function closeChoiceDialog() {
  choiceDialogOpen.value = false;
  choiceSending.value = false;
}

async function sendChoiceText(rawText: string): Promise<boolean> {
  const text = String(rawText ?? '').trim();
  if (!text) {
    toastr?.warning?.('请输入要发送的内容', '快速剧情');
    return false;
  }

  choiceSending.value = true;
  try {
    const res = sendToChat(text, {
      toast: true,
      successMessage: '已发送',
      failureMessage: '发送失败，已尝试复制，请手动发送',
      unavailableMessage: '无法直接发送，已尝试复制，请手动发送',
    });

    if (res.ok) {
      closeChoiceDialog();
      emit('choice-sent', { text });
      return true;
    }

    await copyText(text, { toast: false });
    if (!(toastr as any)?.error) {
      alert(`${res.reason}: ${res.sentText}`);
    }
    return false;
  } finally {
    choiceSending.value = false;
  }
}

async function confirmChoiceDialog() {
  if (choiceSending.value) return;
  await sendChoiceText(choiceDialogDraft.value);
}

</script>

<style scoped>
.choice-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2605;
  background: var(--theme-overlay-mask, rgba(0, 0, 0, 0.55));
  padding-top: calc(38px + env(safe-area-inset-top));
  padding-right: calc(12px + env(safe-area-inset-right));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  padding-left: calc(12px + env(safe-area-inset-left));
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.choice-modal {
  width: min(540px, calc(100% - 8px));
  max-height: calc(100% - 20px);
  background: var(--theme-modal-bg, rgba(25, 28, 35, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: var(--theme-elevated-shadow, 0 10px 30px rgba(0, 0, 0, 0.45));
  display: flex;
  flex-direction: column;
}

.choice-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 10px 6px;
}

.choice-modal-title {
  font-weight: 800;
  color: var(--text-strong, #f1fa8c);
}

.choice-icon-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 10px;
  padding: 6px 10px;
  min-height: 40px;
  cursor: pointer;
}

.choice-modal-body {
  padding: 6px 10px 0;
  overflow: auto;
}

.choice-original-label,
.choice-edit-label {
  font-size: 0.85em;
  opacity: 0.9;
  margin: 6px 0 6px;
}

.choice-original {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--theme-surface-soft, rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.1);
  line-height: 1.45;
  word-break: break-word;
}

.choice-textarea {
  width: 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--theme-input-bg, rgba(0, 0, 0, 0.22));
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-color);
  outline: none;
  resize: vertical;
  font-family: inherit;
}

.choice-textarea:focus {
  border-color: rgba(0, 180, 216, 0.55);
  box-shadow: 0 0 0 2px rgba(0, 180, 216, 0.2);
}

.choice-modal-footer {
  padding: 8px 10px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.choice-btn {
  padding: 8px 10px;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background-color: var(--theme-surface-soft, rgba(255, 255, 255, 0.06));
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9em;
}

.choice-btn--primary {
  border-color: rgba(0, 180, 216, 0.55);
  background-color: rgba(0, 180, 216, 0.18);
  color: #e8fbff;
  font-weight: 700;
}

.choice-btn--ghost {
  background-color: transparent;
}

.choice-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 420px) {
  .choice-modal {
    width: min(100%, calc(100% - 4px));
    border-radius: 12px;
  }

  .choice-modal-header,
  .choice-modal-body,
  .choice-modal-footer {
    padding-left: 9px;
    padding-right: 9px;
  }

  .choice-modal-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .choice-icon-btn,
  .choice-btn {
    min-height: 44px;
  }
}
</style>

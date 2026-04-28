<template>
  <section
    class="composer-shell"
    :class="[`layout-${(layoutMode ?? 'wide').replace('_', '-')}`, { 'desktop-tool-row-mode': desktopToolRowMode }]"
  >
    <div v-if="showToolbar !== false" class="composer-toolbar">
      <div class="composer-role-tabs" role="tablist" aria-label="快速角色切换">
        <button
          v-for="role in roleTabs"
          :key="role.key"
          type="button"
          class="role-tab-chip clip-corner-sm"
          :class="{ active: activeRoleKey === role.key }"
          @click="$emit('open-role', role.key)"
        >
          <span class="role-dot" :class="role.statusClass"></span>
          {{ role.label }}
        </button>
      </div>

      <div class="composer-quick-actions">
        <button type="button" class="quick-btn clip-corner-sm" :disabled="busy || !canRoll" @click="$emit('roll')">
          RE-SYNC
        </button>
      </div>
    </div>

    <div class="composer-input-shell clip-corner">
      <button
        v-if="showOptionTrigger !== false"
        type="button"
        class="composer-input-icon composer-option-trigger"
        :title="choiceOptions.length > 0 ? `查看选项（${choiceOptions.length}）` : '打开选项弹窗，可重试额外模型解析'"
        @click="openChoiceModal"
      >
        选项
      </button>
      <div class="composer-input-main">
        <textarea
          ref="composerTextareaRef"
          :value="modelValue"
          class="composer-textarea"
          placeholder="AWAITING_COMMAND..."
          @input="onInput"
        />
      </div>
      <button type="button" class="send-btn clip-corner-sm" :disabled="busy" @click="submitFromComposer">
        {{ busy ? '生成中…' : '发送' }}
      </button>
    </div>

    <Teleport to="body">
      <div v-if="choiceModalOpen" class="choice-modal-mask" @click.self="closeChoiceModal">
        <div class="choice-modal clip-corner" role="dialog" aria-modal="true">
          <div class="choice-modal-header">
            <div>
              <span class="demo-kicker">OPTIONS // QUICK SEND</span>
              <div class="choice-modal-title">剧情选项</div>
            </div>
            <button type="button" class="choice-icon-btn clip-corner-sm" @click="closeChoiceModal">✕</button>
          </div>

          <div class="choice-modal-body">
            <div class="choice-option-list">
              <button
                v-for="(option, index) in choiceOptions"
                :key="`${index}-${option}`"
                type="button"
                class="choice-item clip-corner-sm"
                :class="{ active: choiceDraft.trim() === String(option ?? '').trim() }"
                @click="pickChoice(option)"
              >
                {{ option }}
              </button>
              <div v-if="choiceOptions.length === 0" class="choice-empty clip-corner-sm">当前无选项，请自由行动。</div>
            </div>

            <div class="choice-edit-label">编辑后发送</div>
            <textarea
              ref="choiceTextareaRef"
              v-model="choiceDraft"
              class="choice-textarea"
              rows="6"
              placeholder="在此补充或修改……"
            />
          </div>

          <div class="choice-modal-footer">
            <button
              type="button"
              class="choice-btn choice-btn--ghost choice-btn--reprocess clip-corner-sm"
              :disabled="busy || choiceSending || reprocessVariablesPending || !canReprocessVariables"
              :title="reprocessVariablesHint"
              @click="handleReprocessVariablesClick"
            >
              {{ reprocessVariablesPending ? '模型解析中…' : '重试额外模型解析' }}
            </button>
            <button
              type="button"
              class="choice-btn choice-btn--ghost clip-corner-sm"
              :disabled="choiceSending"
              @click="closeChoiceModal"
            >
              取消
            </button>
            <button
              type="button"
              class="choice-btn choice-btn--primary clip-corner-sm"
              :disabled="busy || choiceSending || !choiceDraft.trim()"
              @click="confirmChoice"
            >
              {{ choiceSending ? '发送中…' : '确认发送' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { useBreakpoints, useTextareaAutosize } from '@vueuse/core';
import { computed, nextTick, ref } from 'vue';

const props = defineProps<{
  modelValue: string;
  busy: boolean;
  canRoll?: boolean;
  desktopToolRowMode?: boolean;
  roleTabs?: Array<{ key: string; label: string; statusClass?: string; statusText?: string }>;
  activeRoleKey?: string | null;
  choiceOptions?: string[];
  canReprocessVariables?: boolean;
  reprocessVariablesHint?: string;
  reprocessVariablesPending?: boolean;
  showOptionTrigger?: boolean;
  showToolbar?: boolean;
  layoutMode?: 'compact' | 'reader_desktop' | 'wide';
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'submit', value?: string): void;
  (event: 'roll'): void;
  (event: 'refresh'): void;
  (event: 'open-role', key: string): void;
  (event: 'reprocess-variables'): void;
}>();

function onInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update:modelValue', target?.value ?? '');
}

function requestSubmit(rawValue: string) {
  const text = String(rawValue ?? '').trim();
  if (!text || props.busy) return false;
  emit('update:modelValue', text);
  emit('submit', text);
  return true;
}

function submitFromComposer() {
  requestSubmit(props.modelValue);
}

const choiceModalOpen = ref(false);
const choiceDraft = ref('');
const choiceSending = ref(false);
const choiceTextareaRef = ref<HTMLTextAreaElement | null>(null);
const composerTextareaRef = ref<HTMLTextAreaElement | null>(null);
useTextareaAutosize({ element: composerTextareaRef, input: props.modelValue ?? '' });
const breakpoints = useBreakpoints({ mobile: 760 });
const isMobile = breakpoints.smallerOrEqual('mobile');
const choiceOptions = computed(() =>
  Array.isArray(props.choiceOptions)
    ? props.choiceOptions.map(option => String(option ?? '').trim()).filter(Boolean)
    : [],
);

async function openChoiceModal() {
  choiceDraft.value = choiceOptions.value[0] ?? '';
  choiceModalOpen.value = true;
  await nextTick();
  if (!isMobile.value) {
    choiceTextareaRef.value?.focus?.();
  }
}

function closeChoiceModal() {
  choiceModalOpen.value = false;
  choiceSending.value = false;
}

function pickChoice(option: string) {
  choiceDraft.value = String(option ?? '');
  nextTick(() => choiceTextareaRef.value?.focus?.());
}

function handleReprocessVariablesClick() {
  emit('reprocess-variables');
  closeChoiceModal();
}

async function confirmChoice() {
  const text = choiceDraft.value.trim();
  if (!text || props.busy || choiceSending.value) return;

  choiceSending.value = true;
  try {
    if (requestSubmit(text)) {
      closeChoiceModal();
    }
  } finally {
    choiceSending.value = false;
  }
}

defineExpose({
  openChoiceModal,
});
</script>

<style scoped>
.composer-shell,
.composer-toolbar,
.composer-role-tabs,
.composer-quick-actions,
.composer-input-shell {
  display: flex;
}
.composer-shell {
  width: 100%;
  max-width: min(100%, var(--reader-content-max, 72rem));
  margin: 0 auto;
  flex-direction: column;
  gap: 12px;
}
.composer-toolbar {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.composer-role-tabs {
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 2px;
  min-width: 0;
}
.role-tab-chip,
.quick-btn,
.send-btn {
  font-family: var(--demo-font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.role-tab-chip {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
  color: var(--demo-text-primary);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex: 0 0 auto;
}
.role-tab-chip.active {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}
.role-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 28%, transparent);
}
.role-dot.status-active {
  background: var(--demo-color-neon);
  box-shadow: 0 0 10px color-mix(in srgb, var(--demo-color-neon) 45%, transparent);
}
.role-dot.status-idle {
  background: var(--demo-color-idle);
}
.composer-quick-actions {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.quick-btn {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-secondary);
  font-size: 12px;
}
.composer-input-shell {
  align-items: stretch;
  gap: 0;
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  padding: 0;
  overflow: hidden;
}
.composer-input-icon {
  width: 54px;
  flex: 0 0 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--demo-text-accent);
}
.composer-option-trigger:disabled {
  opacity: 0.45;
}
.composer-option-trigger:not(:disabled) {
  cursor: pointer;
}
.composer-option-trigger:not(:disabled):hover {
  background: color-mix(in srgb, var(--primary) 8%, var(--surface) 92%);
}
.composer-input-main {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  padding: 0 14px;
}
.composer-textarea {
  width: 100%;
  min-height: 1.5em;
  max-height: 120px;
  resize: none;
  overflow-y: auto;
  border: 0;
  background: transparent;
  color: var(--demo-text-primary);
  padding: 14px 0;
  font-family: var(--demo-font-mono);
  font-size: 14px;
  line-height: 1.6;
}
.composer-textarea::placeholder {
  color: color-mix(in srgb, var(--demo-text-accent) 30%, transparent);
  letter-spacing: 0.12em;
}
.send-btn {
  min-height: 44px;
  min-width: 88px;
  margin: 10px;
  align-self: flex-end;
  padding: 0 16px;
  border: 1px solid transparent;
  background: var(--demo-gradient-primary);
  color: var(--demo-text-inverse);
  font-size: 12px;
  font-weight: 700;
}

.composer-shell.layout-compact .composer-input-icon,
.composer-shell.layout-reader-desktop .composer-input-icon {
  min-width: 44px;
  min-height: 44px;
  font-size: 12px;
}

.composer-shell.layout-compact .send-btn,
.composer-shell.layout-reader-desktop .send-btn {
  min-width: 44px;
  min-height: 44px;
  margin: 6px;
  padding: 0 12px;
  font-size: 12px;
}

.composer-shell.layout-compact .composer-textarea,
.composer-shell.layout-reader-desktop .composer-textarea {
  font-size: 14px;
}
.choice-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2605;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, black 46%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.choice-modal {
  width: min(680px, 100%);
  max-height: min(80vh, 760px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: 0 18px 44px color-mix(in srgb, var(--shadow-color) 78%, transparent);
}
.choice-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}
.choice-modal-title {
  margin-top: 6px;
  font-size: 16px;
  color: var(--demo-text-primary);
}
.choice-icon-btn {
  min-height: 36px;
  min-width: 36px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  color: var(--demo-text-primary);
}
.choice-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  overflow: auto;
}
.choice-option-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.choice-item,
.choice-empty {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  color: var(--demo-text-primary);
  font-size: 13px;
  line-height: 1.6;
  text-align: left;
}
.choice-item.active {
  border-color: var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--demo-text-accent);
}
.choice-edit-label {
  font-size: 12px;
  color: var(--demo-text-secondary);
}
.choice-textarea {
  width: 100%;
  min-height: 140px;
  padding: 12px 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 14%, transparent);
  color: var(--demo-text-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.65;
  resize: vertical;
}
.choice-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--demo-border-accent-soft);
}
.choice-btn {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--demo-border-accent-soft);
  color: var(--demo-text-primary);
}
.choice-btn--ghost {
  background: transparent;
}
.choice-btn--primary {
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
  color: var(--demo-text-accent);
}
.choice-btn--reprocess {
  margin-right: auto;
  color: var(--demo-text-accent);
}
@media (max-width: 760px) {
  .composer-textarea {
    max-height: 80px;
  }
  .composer-shell {
    gap: 6px;
  }

  .composer-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .composer-role-tabs {
    width: 100%;
    gap: 4px;
    padding-bottom: 0;
  }

  .role-tab-chip {
    min-height: 28px;
    padding: 0 8px;
    font-size: 10px;
    gap: 4px;
  }

  .composer-quick-actions {
    width: auto;
    margin-left: auto;
  }

  .quick-btn {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 0 8px;
    font-size: 9px;
  }

  .composer-input-icon {
    width: 32px;
    flex-basis: 32px;
    font-size: 10px;
  }

  .composer-input-main {
    padding: 0 6px;
  }

  .composer-textarea {
    min-height: 1.5em;
    max-height: 80px;
    font-size: 13px;
    line-height: 1.45;
    padding: 2px 0;
  }

  .send-btn {
    min-width: 44px;
    min-height: 44px;
    margin: 3px;
    padding: 0 8px;
    font-size: 12px;
  }
  .choice-modal-mask {
    padding: 8px;
    align-items: flex-end;
  }
  .choice-modal {
    width: 100%;
    max-height: min(68vh, 560px);
    border-radius: 18px 18px 12px 12px;
  }
  .choice-modal-header {
    padding: 10px 12px 8px;
  }
  .choice-modal-body {
    padding: 10px 12px;
  }
  .choice-textarea {
    min-height: 96px;
  }
  .choice-modal-footer {
    flex-direction: column;
    padding: 10px 12px 12px;
  }
  .choice-btn--reprocess {
    margin-right: 0;
  }
}

@media (min-width: 761px) {
  .composer-shell.desktop-tool-row-mode .composer-quick-actions {
    display: none;
  }
}
</style>

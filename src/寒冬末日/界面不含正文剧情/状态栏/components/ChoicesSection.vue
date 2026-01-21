<template>
  <section class="section">
    <button ref="palette_button" class="palette-button" type="button" @click.stop="togglePalette">🎨</button>
    <h2 class="section-title choices-title">⚜️ 快速剧情 ⚜️</h2>

    <div>
      <template v-if="props.options.length > 0">
        <button
          v-for="(opt, idx) in props.options"
          :key="idx"
          class="choice-item"
          type="button"
          @click="openChoiceDialog(opt)"
        >
          {{ opt }}
        </button>
      </template>
      <template v-else>
        <button class="choice-item" type="button" disabled>当前无选项，请自由行动...</button>
      </template>
    </div>

    <Teleport to="body">
      <div
        v-if="choiceDialogOpen"
        class="choice-modal-mask"
        :style="choiceModalMaskStyle"
        @click.self="closeChoiceDialog"
      >
        <div class="choice-modal" role="dialog" aria-modal="true">
          <div class="choice-modal-header">
            <div class="choice-modal-title">您还有要补充的吗？</div>
            <button class="choice-icon-btn" type="button" @click="closeChoiceDialog">✕</button>
          </div>

          <div class="choice-modal-body">
            <div class="choice-original-label">选项原文</div>
            <div class="choice-original">{{ choiceDialogOriginal }}</div>

            <div class="choice-edit-label">编辑后发送</div>
            <textarea v-model="choiceDialogDraft" class="choice-textarea" rows="6" placeholder="在此补充或修改……" />
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

    <div ref="palette_modal" class="palette-modal" :class="{ show: palette_open }">
      <h3>显示设置</h3>
      <div class="palette-option">
        <label>🎨 主题</label>
        <select v-model="theme">
          <option value="apocalypse_tech">末日科技 (默认)</option>
          <option value="jade_green">淡翡翠绿</option>
          <option value="parchment">复古羊皮纸</option>
          <option value="milky">清新奶白</option>
        </select>
      </div>
      <div class="palette-option">
        <label>🖋️ 字体</label>
        <select v-model="font_key">
          <option value="yahei">微软雅黑 (默认)</option>
          <option value="simsun">宋体</option>
          <option value="kaiti">楷体</option>
        </select>
      </div>
      <div class="palette-option">
        <label>↔️ 字体大小</label>
        <select v-model="font_size">
          <option value="12">12px (最小)</option>
          <option value="14">14px (较小)</option>
          <option value="15">15px (稍小)</option>
          <option value="16">16px (默认)</option>
          <option value="18">18px (稍大)</option>
          <option value="20">20px (较大)</option>
          <option value="22">22px (很大)</option>
          <option value="24">24px (最大)</option>
        </select>
      </div>
      <div class="palette-buttons">
        <button class="palette-close" type="button" @click="palette_open = false">关闭</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import { useEventListener, useThrottleFn } from '@vueuse/core';
import { CHAT_VAR_KEYS, copyText, sendToChat } from '../../outbound';

const props = defineProps<{
  options: string[];
}>();

const palette_open = ref(false);
const theme = useLocalStorage<string>('eden_theme', 'apocalypse_tech');
const font_key = useLocalStorage<string>('eden_font_key', 'yahei');
const font_size = useLocalStorage<string>('eden_font_size_key', '16');

function loadPersistedSettings() {
  const vars = getVariables({ type: 'chat' }) ?? {};
  const saved = _.get(vars, CHAT_VAR_KEYS.UI_SETTINGS, {}) as Record<string, string>;
  if (typeof saved.theme === 'string') theme.value = saved.theme;
  if (typeof saved.font_key === 'string') font_key.value = saved.font_key;
  if (typeof saved.font_size === 'string') font_size.value = saved.font_size;
}

watch(
  [theme, font_key, font_size],
  ([t, f, s]) => {
    updateVariablesWith(
      vars => {
        _.set(vars, CHAT_VAR_KEYS.UI_SETTINGS, { theme: t, font_key: f, font_size: s });
        return vars;
      },
      { type: 'chat' },
    );
  },
  { immediate: false },
);

const palette_button = ref<HTMLElement | null>(null);
const palette_modal = ref<HTMLElement | null>(null);

const choiceDialogOpen = ref(false);
const choiceDialogOriginal = ref('');
const choiceDialogDraft = ref('');
const choiceSending = ref(false);
const choiceModalViewportTop = ref(0);
const choiceModalViewportHeight = ref(0);
let choiceParentScrollTarget: HTMLElement | Window | null = null;
let stopChoiceScroll: (() => void) | null = null;
let stopChoiceResize: (() => void) | null = null;
let stopPaletteClick: (() => void) | null = null;

const choiceModalMaskStyle = computed(() => ({
  top: `${choiceModalViewportTop.value}px`,
  height: `${choiceModalViewportHeight.value}px`,
}));

function getParentScrollContainer(frameEl: HTMLElement): HTMLElement | Window {
  try {
    const doc = frameEl.ownerDocument;
    const win = doc.defaultView ?? window.parent;
    let cur: HTMLElement | null = frameEl.parentElement;
    while (cur) {
      const style = win.getComputedStyle(cur);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 1) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return win;
  } catch {
    return window.parent;
  }
}

function updateChoiceModalViewport() {
  const frameEl = window.frameElement as HTMLElement | null;
  if (!frameEl) return;
  const parentWin = window.parent as Window | null;
  if (!parentWin) return;

  const rect = frameEl.getBoundingClientRect();
  const topInIframeDoc = Math.max(0, -rect.top);
  choiceModalViewportTop.value = topInIframeDoc;
  choiceModalViewportHeight.value = Math.max(0, parentWin.innerHeight);
}

const throttledUpdateChoiceModalViewport = useThrottleFn(updateChoiceModalViewport, 50);

function bindChoiceParentScrollSync() {
  const frameEl = window.frameElement as HTMLElement | null;
  if (!frameEl) return;
  choiceParentScrollTarget = getParentScrollContainer(frameEl);
  const handler = throttledUpdateChoiceModalViewport;
  if (!choiceParentScrollTarget) return;
  stopChoiceScroll?.();
  stopChoiceResize?.();
  stopChoiceScroll = useEventListener(choiceParentScrollTarget, 'scroll', handler, { passive: true });
  const resizeTarget = choiceParentScrollTarget instanceof Window ? choiceParentScrollTarget : window.parent ?? window;
  stopChoiceResize = useEventListener(resizeTarget, 'resize', handler, { passive: true });
}

function unbindChoiceParentScrollSync() {
  stopChoiceScroll?.();
  stopChoiceResize?.();
  stopChoiceScroll = null;
  stopChoiceResize = null;
  choiceParentScrollTarget = null;
}

function togglePalette() {
  palette_open.value = !palette_open.value;
}

watch(
  theme,
  value => {
    if (value === 'apocalypse_tech') {
      delete document.documentElement.dataset.theme;
      return;
    }
    document.documentElement.dataset.theme = value;
  },
  { immediate: true },
);

watch(
  font_key,
  value => {
    const main = document.getElementById('eden-main-container');
    if (!main) return;

    const fontMap: Record<string, string> = {
      yahei: '"Microsoft YaHei", sans-serif',
      simsun: 'SimSun, serif',
      kaiti: 'KaiTi, serif',
    };

    main.style.fontFamily = fontMap[value] || fontMap.yahei;
  },
  { immediate: true },
);

watch(
  font_size,
  value => {
    const main = document.getElementById('eden-main-container');
    if (!main) return;
    main.style.setProperty('--font-size-main', `${value}px`);
  },
  { immediate: true },
);

async function openChoiceDialog(text: string) {
  choiceDialogOriginal.value = String(text ?? '');
  choiceDialogDraft.value = String(text ?? '');
  choiceDialogOpen.value = true;
  updateChoiceModalViewport();
  bindChoiceParentScrollSync();

  await nextTick();
  const el = document.querySelector<HTMLTextAreaElement>('.choice-textarea');
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
  unbindChoiceParentScrollSync();
}

async function confirmChoiceDialog() {
  if (choiceSending.value) return;
  const text = String(choiceDialogDraft.value ?? '').trim();
  if (!text) {
    toastr?.warning?.('请输入要发送的内容', '快速剧情');
    return;
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
      return;
    }

    await copyText(text, { toast: false });
    if (!(toastr as any)?.error) {
      alert(`${res.reason}: ${res.sentText}`);
    }
  } finally {
    choiceSending.value = false;
  }
}

function onDocumentClick(ev: MouseEvent) {
  if (!palette_open.value) return;
  const target = ev.target as Node | null;
  if (!target) return;

  if (palette_modal.value?.contains(target)) return;
  if (palette_button.value?.contains(target)) return;
  palette_open.value = false;
}

onMounted(() => {
  loadPersistedSettings();
  stopPaletteClick = useEventListener(document, 'click', onDocumentClick);
});

onBeforeUnmount(() => {
  stopPaletteClick?.();
  stopPaletteClick = null;
  unbindChoiceParentScrollSync();
});
</script>

<style scoped>
.choice-modal-mask {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  padding-top: calc(12px + env(safe-area-inset-top));
  padding-right: calc(12px + env(safe-area-inset-right));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  padding-left: calc(12px + env(safe-area-inset-left));
  display: flex;
  align-items: center;
  justify-content: center;
}

.choice-modal {
  width: min(560px, calc(100% - 8px));
  max-height: calc(100% - 8px);
  background: rgba(25, 28, 35, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
}

.choice-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px 8px;
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
  cursor: pointer;
}

.choice-modal-body {
  padding: 8px 12px 0;
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
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  line-height: 1.45;
  word-break: break-word;
}

.choice-textarea {
  width: 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.22);
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
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.choice-btn {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background-color: rgba(255, 255, 255, 0.06);
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
</style>

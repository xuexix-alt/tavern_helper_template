<template>
  <article class="message-shell" :class="[`is-${item.role}`, `density-${density}`, `font-${fontMode}`]">
    <div v-if="item.role === 'system'" class="system-message clip-corner-sm">
      <span class="system-icon">⚠</span>
      <span class="system-text">[ SYS_ALERT ] {{ item.content || '(系统消息)' }}</span>
    </div>

    <template v-else-if="item.role === 'user'">
      <div class="user-wrap">
        <div class="user-message">{{ item.content || '(空消息)' }}</div>
      </div>

      <div v-if="showEditRegenerate || item.canDeleteFrom || item.canOpenDetail" class="message-actions user-actions">
        <button
          v-if="showEditRegenerate && !isEditingUser"
          type="button"
          class="action-btn clip-corner-sm"
          :disabled="busy"
          @click="emit('start-edit', item)"
        >
          改词重生
        </button>
        <button
          v-if="item.canDeleteFrom && !showRollbackConfirm"
          type="button"
          class="action-btn danger clip-corner-sm"
          :disabled="busy"
          @click="emit('request-rollback', item)"
        >
          回退删除
        </button>
        <template v-if="item.canDeleteFrom && showRollbackConfirm">
          <span class="rollback-tip">删除当前及后续所有楼层</span>
          <button
            type="button"
            class="action-btn danger clip-corner-sm"
            :disabled="busy"
            @click="emit('confirm-rollback', item)"
          >
            确认回退
          </button>
          <button type="button" class="action-btn clip-corner-sm" :disabled="busy" @click="emit('cancel-rollback')">
            取消
          </button>
        </template>
        <button
          v-if="item.canOpenDetail"
          type="button"
          class="action-btn clip-corner-sm"
          @click="emit('open-detail', item)"
        >
          详情
        </button>
      </div>

      <div v-if="isEditingUser" class="editor-wrap">
        <textarea
          :value="editDraft"
          class="inline-editor"
          rows="4"
          placeholder="修改并确认后，重新生成"
          @input="onEditInput"
        />
        <div class="editor-actions">
          <button
            type="button"
            class="action-btn clip-corner-sm"
            :disabled="busy || !trimmedEditDraft"
            @click="emit('confirm-edit', item)"
          >
            确认重生</button
          ><button type="button" class="action-btn clip-corner-sm" :disabled="busy" @click="emit('cancel-edit')">
            取消
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <section
        class="assistant-card hud-panel clip-corner"
        :data-message-id="item.message_id"
        @pointerdown.capture="emit('image-intent', item)"
        @click.capture="emit('image-intent', item)"
      >
        <div class="assistant-corners tl"></div>
        <div class="assistant-corners tr"></div>
        <div class="assistant-corners bl"></div>
        <div class="assistant-corners br"></div>

        <div class="assistant-body-wrap">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-if="item.isStreaming"
            ref="assistantBodyRef"
            class="assistant-body html-body is-stream-stage"
            :data-message-id="item.message_id"
            v-html="item.streamHtml"
          ></div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-else
            ref="assistantBodyRef"
            class="assistant-body html-body"
            :data-message-id="item.message_id"
            v-html="item.finalHtml || '<p>(空回复)</p>'"
          ></div>
        </div>
      </section>
    </template>
  </article>
</template>

<script setup lang="ts">
import { recordComponentDebugTrace } from '../debugTrace';
import type { GeneratedImageActivationPayload } from '../generatedImageActivation';
import { parseGeneratedImageActivationPayload } from '../generatedImageActivation';
import { createGeneratedImageGestureController } from '../generatedImageGestureController';
import { isIdbSrc, parseIdbSrc } from '../imagePersistencePatch';
import { loadImage } from '../imageStore';
import { hydratePersistedImageElements } from '../transcriptImagePersistence';
import type { ReaderFontMode, TranscriptDensity, TranscriptItem } from '../types';

const props = defineProps<{
  item: TranscriptItem;
  density: TranscriptDensity;
  fontMode: ReaderFontMode;
  busy?: boolean;
  isEditingUser?: boolean;
  editDraft?: string;
  showEditRegenerate?: boolean;
  showRollbackConfirm?: boolean;
}>();

const emit = defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'image-intent', item: TranscriptItem): void;
  (event: 'image-view', payload: GeneratedImageActivationPayload): void;
  (event: 'image-regenerate', payload: GeneratedImageActivationPayload): void;
  (event: 'generate-image', messageId: number): void;
  (event: 'start-edit', item: TranscriptItem): void;
  (event: 'update-edit-draft', value: string): void;
  (event: 'confirm-edit', item: TranscriptItem): void;
  (event: 'cancel-edit'): void;
  (event: 'request-rollback', item: TranscriptItem): void;
  (event: 'confirm-rollback', item: TranscriptItem): void;
  (event: 'cancel-rollback'): void;
}>();

const assistantBodyRef = ref<HTMLElement | null>(null);
const assistantBodyCleanup = ref<Array<() => void>>([]);
const trimmedEditDraft = computed(() => String(props.editDraft ?? '').trim());

function recordComponentTrace(event: string, payload: Record<string, unknown> = {}) {
  recordComponentDebugTrace({
    scope: 'TranscriptMessageCard',
    event,
    payload: {
      messageId: props.item.message_id,
      variant: props.item.role,
      phase: props.item.phase,
      isStreaming: props.item.isStreaming,
      ...payload,
    },
  });
}

function onEditInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  if (!target) return;
  emit('update-edit-draft', target.value);
}

async function resolvePersistedImageSrc(src: string) {
  if (!isIdbSrc(src)) return src;
  const parsed = parseIdbSrc(src);
  if (!parsed) return null;
  try {
    return await loadImage(parsed.messageId, parsed.requestId);
  } catch {
    return null;
  }
}

async function hydrateAssistantBodyImages() {
  const root = assistantBodyRef.value;
  if (!root) return;
  const images = Array.from(
    root.querySelectorAll('img[src^="idb://"], img[data-persisted-image-src]'),
  ) as HTMLImageElement[];
  recordComponentTrace('hydrate_images', {
    imageCount: images.length,
  });
  if (images.length === 0) return;
  await hydratePersistedImageElements({
    elements: images,
    resolveSrc: async (src, element) => {
      const persistedSrc = String(element.getAttribute('data-persisted-image-src') ?? src).trim();
      return resolvePersistedImageSrc(persistedSrc);
    },
  });
}

function clearAssistantBodyInteractionBindings() {
  assistantBodyCleanup.value.forEach(dispose => dispose());
  assistantBodyCleanup.value = [];
}

function stopEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as Event & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
}

function bindAssistantBodyInteractions() {
  clearAssistantBodyInteractionBindings();
  const root = assistantBodyRef.value;
  if (!root) return;

  const promptButtons = Array.from(root.querySelectorAll('button.image-tag-button')) as HTMLButtonElement[];
  for (const button of promptButtons) {
    const handleClick = (event: Event) => {
      stopEvent(event);
      emit('generate-image', props.item.message_id);
    };
    button.addEventListener('click', handleClick, true);
    assistantBodyCleanup.value.push(() => {
      button.removeEventListener('click', handleClick, true);
    });
  }

  const carriers = Array.from(
    root.querySelectorAll('.assistant-fallback-inline-image, .assistant-fallback-generated-image'),
  ) as HTMLElement[];
  recordComponentTrace('bind_interactions', {
    promptButtonCount: promptButtons.length,
    carrierCount: carriers.length,
  });

  assistantBodyCleanup.value = carriers.map(carrier => {
    let suppressNextClick = false;
    let hitArea = carrier.querySelector('.generated-image-hitarea') as HTMLButtonElement | null;
    if (!hitArea) {
      hitArea = document.createElement('button');
      hitArea.type = 'button';
      hitArea.className = 'generated-image-hitarea';
      hitArea.setAttribute('aria-label', '查看或重生图片');
      carrier.appendChild(hitArea);
    }
    const image = carrier.querySelector('img') as HTMLImageElement | null;
    const payload = () =>
      parseGeneratedImageActivationPayload({
        carrierDataset: carrier.dataset,
        targetDataset: hitArea?.dataset ?? image?.dataset ?? {},
        targetAttrSrc: image?.getAttribute('src') ?? null,
        targetCurrentSrc: image?.currentSrc ?? null,
        targetSrc: image?.getAttribute('src') ?? null,
      });

    if (image) {
      image.style.pointerEvents = 'none';
      hitArea.dataset.messageId = image.dataset.messageId ?? carrier.dataset.messageId ?? '';
      hitArea.dataset.imageId = image.dataset.imageId ?? carrier.dataset.imageId ?? '';
      hitArea.dataset.promptToken = image.dataset.promptToken ?? carrier.dataset.promptToken ?? '';
      hitArea.dataset.requestId = image.dataset.requestId ?? carrier.dataset.requestId ?? '';
      hitArea.dataset.imageSrc = encodeURIComponent(image.getAttribute('src') ?? image.currentSrc ?? '');
    }

    const controller = createGeneratedImageGestureController({
      onView() {
        emit('image-view', payload());
      },
      onRegenerate() {
        emit('image-regenerate', payload());
      },
    });

    const handleClick = (event: Event) => {
      console.log('[TranscriptCard] handleClick called, suppressNextClick:', suppressNextClick);
      if (suppressNextClick) {
        suppressNextClick = false;
        console.log('[TranscriptCard] handleClick suppressed');
        return;
      }
      stopEvent(event);
      console.log('[TranscriptCard] handleClick -> controller.handleClick(), messageId:', props.item.message_id);
      controller.handleClick();
    };
    const handleDoubleClick = (event: Event) => {
      console.log('[TranscriptCard] handleDoubleClick called');
      stopEvent(event);
      suppressNextClick = true;
      console.log(
        '[TranscriptCard] handleDoubleClick -> controller.handleDoubleClick(), messageId:',
        props.item.message_id,
      );
      controller.handleDoubleClick();
    };
    const handlePointerDown = (event: Event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch') return;
      stopEvent(event);
      controller.handleTouchStart();
    };
    const handlePointerUp = (event: Event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch') return;
      stopEvent(event);
      controller.handleTouchEnd();
    };
    const handlePointerCancel = (event: Event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch') return;
      stopEvent(event);
      controller.handleTouchCancel();
    };

    hitArea.addEventListener('click', handleClick, true);
    hitArea.addEventListener('dblclick', handleDoubleClick, true);
    hitArea.addEventListener('pointerdown', handlePointerDown, true);
    hitArea.addEventListener('pointerup', handlePointerUp, true);
    hitArea.addEventListener('pointercancel', handlePointerCancel, true);

    // 阻止 dblclick 冒泡到宿主 ClickTrigger，避免双击已有图片时触发新生图菜单
    const handleCarrierDblclickBubbling = (e: Event) => {
      e.stopPropagation();
    };
    carrier.addEventListener('dblclick', handleCarrierDblclickBubbling, true);

    return () => {
      hitArea?.removeEventListener('click', handleClick, true);
      hitArea?.removeEventListener('dblclick', handleDoubleClick, true);
      hitArea?.removeEventListener('pointerdown', handlePointerDown, true);
      hitArea?.removeEventListener('pointerup', handlePointerUp, true);
      hitArea?.removeEventListener('pointercancel', handlePointerCancel, true);
      carrier?.removeEventListener('dblclick', handleCarrierDblclickBubbling, true);
      controller.dispose();
    };
  });
}

onMounted(() => {
  recordComponentTrace('mount');
  void hydrateAssistantBodyImages();
  nextTick(() => {
    bindAssistantBodyInteractions();
  });
});

onUpdated(() => {
  recordComponentTrace('update');
  void hydrateAssistantBodyImages();
  nextTick(() => {
    bindAssistantBodyInteractions();
  });
});

onBeforeUnmount(() => {
  recordComponentTrace('unmount');
  clearAssistantBodyInteractionBindings();
});
</script>

<style scoped>
.message-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.system-message {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  align-self: center;
  padding: 14px 20px;
  border: 1px solid color-mix(in srgb, var(--primary) 50%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--demo-text-accent);
  text-transform: uppercase;
}
.system-icon {
  font-size: 14px;
}
.system-text {
  line-height: 1.5;
}
.user-wrap {
  display: flex;
  justify-content: flex-end;
}
.user-message {
  max-width: min(100%, 42rem);
  padding: 12px 18px;
  border-right: 2px solid color-mix(in srgb, var(--primary) 48%, transparent);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 14px;
  line-height: 1.75;
  color: var(--demo-text-primary);
  text-align: right;
}

.message-shell.font-reading .user-message,
.message-shell.font-reading .assistant-body,
.message-shell.font-reading .inline-editor {
  font-family: var(--demo-font-sans);
}

.message-shell.density-minimal .user-message {
  max-width: min(100%, 36rem);
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.55;
}
.assistant-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 60rem;
  min-width: 0;
  padding: 24px 28px 18px;
}

.message-shell.density-minimal .assistant-card {
  gap: 10px;
  padding: 16px 18px 14px;
}
.assistant-corners {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: color-mix(in srgb, var(--primary) 36%, transparent);
  pointer-events: none;
}
.assistant-corners.tl {
  top: -2px;
  left: -2px;
  border-top: 2px solid;
  border-left: 2px solid;
}
.assistant-corners.tr {
  top: -2px;
  right: -2px;
  border-top: 2px solid;
  border-right: 2px solid;
}
.assistant-corners.bl {
  bottom: -2px;
  left: -2px;
  border-bottom: 2px solid;
  border-left: 2px solid;
}
.assistant-corners.br {
  bottom: -2px;
  right: -2px;
  border-bottom: 2px solid;
  border-right: 2px solid;
}
.meta-chip,
.action-btn {
  font-family: var(--demo-font-mono);
}
.assistant-body-wrap {
  position: relative;
  padding-top: 2px;
  min-width: 0;
}
.assistant-body {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  font-size: 15px;
  line-height: 1.9;
  color: var(--demo-text-panel-strong);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.assistant-body.is-stream-stage {
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  background: color-mix(in srgb, var(--surface) 22%, transparent);
  border-radius: 12px;
}

.message-shell.density-minimal .assistant-body {
  font-size: 14px;
  line-height: 1.7;
}

.message-shell.density-minimal .assistant-corners {
  display: none;
}
.assistant-body-wrap :deep(p) {
  margin: 0 0 1em;
}
.assistant-body-wrap :deep(p:last-child) {
  margin-bottom: 0;
}

.assistant-body-wrap :deep(.dialog-inline) {
  color: inherit;
  font: inherit;
}

.assistant-body-wrap :deep(.stream-stage-pre) {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--demo-text-panel-strong);
  font: inherit;
  line-height: 1.9;
}

.assistant-body-wrap :deep(.ai-image-container) {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 4px;
}

.assistant-body-wrap :deep(.image-tag-button) {
  position: relative;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--background) 70%, transparent);
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
  font-size: 12px;
  line-height: 1;
  letter-spacing: 0.08em;
  box-shadow:
    0 8px 18px color-mix(in srgb, var(--shadow-color) 28%, transparent),
    inset 0 0 0 1px color-mix(in srgb, white 4%, transparent);
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.assistant-body-wrap :deep(.image-tag-button)::before {
  content: '🎨';
  margin-right: 6px;
  font-size: 14px;
}

.assistant-body-wrap :deep(.image-tag-button:hover),
.assistant-body-wrap :deep(.image-tag-button:active) {
  background: color-mix(in srgb, var(--primary) 12%, var(--background) 88%);
  border-color: color-mix(in srgb, var(--primary) 42%, transparent);
}

.assistant-body-wrap :deep(.image-tag-placeholder),
.assistant-body-wrap :deep(.image-tag-container) {
  display: inline-flex;
  width: 0;
  height: 0;
  overflow: hidden;
}

.assistant-body-wrap :deep(.assistant-fallback-generated-gallery) {
  clear: both;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface) 22%, transparent),
      color-mix(in srgb, var(--surface) 10%, transparent)
    ),
    radial-gradient(circle at top, color-mix(in srgb, var(--primary) 10%, transparent), transparent 58%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 4%, transparent),
    0 10px 24px color-mix(in srgb, var(--shadow-color) 24%, transparent);
}

.assistant-body-wrap :deep(.assistant-fallback-generated-image) {
  position: relative;
  z-index: 2;
  pointer-events: none;
  margin: 0;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 12%, transparent);
  overflow: hidden;
  box-shadow:
    0 6px 14px color-mix(in srgb, black 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 3%, transparent);
}

.assistant-body-wrap :deep(.assistant-fallback-generated-image img) {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  background: color-mix(in srgb, var(--surface) 22%, transparent);
  opacity: 0.88;
}

.assistant-body-wrap :deep(.assistant-image-prompt-list) {
  pointer-events: auto;
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.assistant-body-wrap :deep(.assistant-image-prompt-token) {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed color-mix(in srgb, var(--primary) 18%, transparent);
  background: color-mix(in srgb, var(--surface) 14%, transparent);
  color: var(--demo-text-secondary);
  font-family: var(--demo-font-mono);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.assistant-body-wrap :deep(.assistant-fallback-inline-image) {
  position: relative;
  z-index: 2;
  pointer-events: auto;
  display: block;
  margin: 16px 0;
  border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent);
  border-radius: 16px;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface) 12%, transparent);
  box-shadow:
    0 8px 18px color-mix(in srgb, black 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 3%, transparent);
}

.assistant-body-wrap :deep(pre),
.assistant-body-wrap :deep(table) {
  max-width: 100%;
  overflow-x: auto;
}

.assistant-body-wrap :deep(code),
.assistant-body-wrap :deep(li),
.assistant-body-wrap :deep(ol),
.assistant-body-wrap :deep(ul),
.assistant-body-wrap :deep(blockquote) {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.assistant-body-wrap :deep(.generated-image-hitarea) {
  position: absolute;
  inset: 0;
  z-index: 3;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: transparent;
  cursor: pointer;
}

.assistant-inline-image-strip {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.assistant-body-wrap :deep(.st-chatu8-image-button),
.assistant-body-wrap :deep(.st-chatu8-image-span) {
  position: relative;
  z-index: 3;
  pointer-events: auto;
}

.assistant-toolbar,
.assistant-footer,
.assistant-footer-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.assistant-toolbar {
  justify-content: flex-start;
}
.assistant-footer {
  justify-content: space-between;
}
.message-actions,
.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-chip,
.action-btn {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-secondary);
}

.message-shell.density-minimal .meta-chip,
.message-shell.density-minimal .action-btn {
  min-height: 32px;
  padding: 0 10px;
  font-size: 10px;
}
.action-btn {
  color: var(--demo-text-accent);
}
.action-btn.danger {
  color: var(--demo-color-danger);
  border-color: color-mix(in srgb, var(--demo-color-danger) 34%, transparent);
}
.message-actions.user-actions {
  justify-content: flex-end;
}
.rollback-tip {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-warning);
}
.editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}
.inline-editor {
  width: min(100%, 42rem);
  min-height: 110px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  background: color-mix(in srgb, var(--surface) 14%, transparent);
  color: var(--demo-text-primary);
  font-family: var(--demo-font-mono);
  font-size: 13px;
  line-height: 1.7;
}
.editor-actions {
  justify-content: flex-end;
}

@media (min-width: 761px) {
  .assistant-card {
    width: 100%;
    max-width: 100%;
    border-color: var(--demo-border-accent-soft);
    box-shadow: 0 14px 30px color-mix(in srgb, var(--shadow-color) 42%, transparent);
  }

  .assistant-card::before,
  .assistant-card::after,
  .assistant-corners {
    display: none;
  }
}

@media (max-width: 760px) {
  .assistant-body-wrap :deep(.assistant-fallback-generated-gallery) {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin-top: 14px;
    padding: 10px;
    border-radius: 14px;
  }

  .assistant-body-wrap :deep(.assistant-fallback-generated-image) {
    border-radius: 12px;
  }

  .assistant-body-wrap :deep(.assistant-fallback-inline-image) {
    margin: 12px 0;
    border-radius: 12px;
  }

  .meta-chip,
  .detail-toggle,
  .action-btn {
    min-height: 28px;
    padding: 0 8px;
    font-size: 9px;
    letter-spacing: 0.08em;
  }

  .assistant-card {
    max-width: 100%;
    padding: 12px 10px 10px;
  }
  .assistant-toolbar {
    gap: 6px;
  }
  .assistant-body-wrap {
    padding-top: 2px;
  }
  .assistant-body {
    font-size: 14px;
  }
  .assistant-footer {
    align-items: flex-start;
  }
  .user-message,
  .inline-editor {
    max-width: 100%;
  }
  .user-message {
    padding: 10px 12px;
  }
  .inline-editor {
    padding: 10px 12px;
  }
}
</style>

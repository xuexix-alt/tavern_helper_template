<template>
  <figure
    :class="rootClass"
    tabindex="0"
    role="button"
    :aria-label="secondaryText"
    :data-message-id="entry.messageId"
    :data-marker-id="entry.markerId || ''"
    :data-image-id="entry.imageId || ''"
    :data-prompt-token="encodePromptToken(entry.promptToken)"
    :data-request-id="entry.requestId ?? ''"
    @click.stop="queueOpen"
    @dblclick.stop.prevent="triggerRegenerate"
    @keydown.enter.prevent="emit('open', entry)"
    @keydown.space.prevent="emit('open', entry)"
  >
    <img
      v-if="resolvedSource"
      class="generated-image-asset"
      :src="resolvedSource.src"
      :alt="resolvedSource.alt || entry.title"
      loading="lazy"
      :data-message-id="entry.messageId"
      :data-marker-id="resolvedSource.markerId"
      :data-image-id="resolvedSource.imageId"
      :data-prompt-token="encodePromptToken(entry.promptToken)"
      :data-request-id="entry.requestId ?? ''"
    />
    <div
      v-else
      class="generated-image-placeholder"
      :data-message-id="entry.messageId"
      :data-marker-id="entry.markerId || ''"
      :data-image-id="entry.imageId || ''"
      :data-prompt-token="encodePromptToken(entry.promptToken)"
      :data-request-id="entry.requestId ?? ''"
    >
      <span class="generated-image-kicker">{{ kickerText }}</span>
      <strong>{{ entry.characterName || entry.title }}</strong>
      <small>{{ secondaryText }}</small>
    </div>

    <button
      type="button"
      class="generated-image-hitarea"
      :data-message-id="activationPayload.messageId ?? ''"
      :data-image-id="entry.imageId || resolvedSource?.imageId || ''"
      :data-prompt-token="encodePromptToken(entry.promptToken)"
      :data-request-id="entry.requestId ?? ''"
      :data-image-src="encodePromptToken(activationPayload.imageSrc)"
      aria-label="查看或重生图片"
      @click.capture="handleClick"
      @dblclick.capture="handleDoubleClick"
      @pointerdown.capture="handlePointerDown"
      @pointerup.capture="handlePointerUp"
      @pointercancel.capture="handlePointerCancel"
    ></button>

    <figcaption v-if="showCaption" class="generated-image-caption">
      <strong>{{ entry.characterName || entry.title }}</strong>
      <small>{{ entry.title }}</small>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import type { GeneratedImageRef } from '../types';
<<<<<<< HEAD
import { useGeneratedImageEntityRevision } from '../generatedImageEntityRevision.ts';
import { readGeneratedImageSource, type ResolvedGeneratedImageSource } from '../generatedImageSourceResolver';
=======
import {
  readGeneratedImageSource,
  readGeneratedImageSourceAsync,
  type ResolvedGeneratedImageSource,
} from '../generatedImageSourceResolver';
import type { GeneratedImageActivationPayload } from '../generatedImageActivation';
import { createGeneratedImageGestureController } from '../generatedImageGestureController';
import { isIdbSrc } from '../imagePersistencePatch';
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)

const props = defineProps<{
  entry: GeneratedImageRef;
  variant?: 'inline' | 'gallery';
  showCaption?: boolean;
}>();
const emit = defineEmits<{
  (event: 'open', entry: GeneratedImageRef): void;
  (event: 'regenerate', entry: GeneratedImageRef): void;
}>();

const emit = defineEmits<{
  (event: 'view', payload: GeneratedImageActivationPayload): void;
  (event: 'regenerate', payload: GeneratedImageActivationPayload): void;
}>();

const resolvedSource = ref<ResolvedGeneratedImageSource | null>(null);
const generatedImageEntityRevision = useGeneratedImageEntityRevision();
let clickTimer = 0;

const rootClass = computed(() =>
  props.variant === 'gallery'
    ? 'assistant-gallery-image generated-image-asset-root'
    : 'assistant-fallback-inline-image generated-image-asset-root',
);

const kickerText = computed(() => (resolvedSource.value ? '单击查看' : '等待图片'));
const secondaryText = computed(() => (props.entry.requestId ? '双击重生' : '双击调用原图链'));

const activationPayload = computed<GeneratedImageActivationPayload>(() => ({
  messageId: Number.isFinite(Number(props.entry.messageId)) ? Math.trunc(Number(props.entry.messageId)) : null,
  promptToken: String(props.entry.promptToken ?? ''),
  requestId: String(props.entry.requestId ?? '').trim(),
  imageSrc: String(resolvedSource.value?.src ?? '').trim(),
}));

const gestureController = createGeneratedImageGestureController({
  onView() {
    emit('view', activationPayload.value);
  },
  onRegenerate() {
    emit('regenerate', activationPayload.value);
  },
});

function encodePromptToken(value: string) {
  return encodeURIComponent(String(value ?? ''));
}

<<<<<<< HEAD
function clearClickTimer() {
  if (!clickTimer) return;
  window.clearTimeout(clickTimer);
  clickTimer = 0;
}

function queueOpen() {
  clearClickTimer();
  clickTimer = window.setTimeout(() => {
    clickTimer = 0;
    emit('open', props.entry);
  }, 220);
}

function triggerRegenerate() {
  clearClickTimer();
  emit('regenerate', props.entry);
}

function resolveSource() {
  resolvedSource.value = readGeneratedImageSource({
=======
function stopEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as Event & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
}

function handleClick(event: MouseEvent) {
  stopEvent(event);
  gestureController.handleClick();
}

function handleDoubleClick(event: MouseEvent) {
  stopEvent(event);
  gestureController.handleDoubleClick();
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch') return;
  stopEvent(event);
  gestureController.handleTouchStart();
}

function handlePointerUp(event: PointerEvent) {
  if (event.pointerType !== 'touch') return;
  stopEvent(event);
  gestureController.handleTouchEnd();
}

function handlePointerCancel(event: PointerEvent) {
  if (event.pointerType !== 'touch') return;
  stopEvent(event);
  gestureController.handleTouchCancel();
}

async function resolveSource() {
  // 先同步尝试
  const syncResult = readGeneratedImageSource({
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
    messageId: props.entry.messageId,
    markerId: props.entry.markerId,
    imageId: props.entry.imageId,
    requestId: props.entry.requestId,
    promptToken: props.entry.promptToken,
  });

  // 如果 src 是 idb:// 引用，需要异步从 IndexedDB 加载
  if (syncResult && isIdbSrc(syncResult.src)) {
    resolvedSource.value = null; // 先显示占位
    const asyncResult = await readGeneratedImageSourceAsync({
      messageId: props.entry.messageId,
      imageId: props.entry.imageId,
      requestId: props.entry.requestId,
      promptToken: props.entry.promptToken,
    });
    resolvedSource.value = asyncResult;
  } else {
    resolvedSource.value = syncResult;
  }
}

watch(
  () =>
    [
      props.entry.messageId,
      props.entry.markerId,
      props.entry.imageId,
      props.entry.requestId,
      props.entry.promptToken,
      generatedImageEntityRevision.value,
    ].join('::'),
  () => {
    void resolveSource();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
<<<<<<< HEAD
  clearClickTimer();
=======
  gestureController.dispose();
>>>>>>> 148cf3e (feat: stabilize same-layer image persistence and interaction)
});
</script>

<style scoped>
.generated-image-asset-root {
  position: relative;
  margin: 0;
  display: grid;
  gap: 8px;
  cursor: pointer;
}

.generated-image-asset {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  pointer-events: none;
  user-select: none;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  background: color-mix(in srgb, var(--surface) 22%, transparent);
  box-shadow:
    0 10px 24px color-mix(in srgb, black 20%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
}

.generated-image-hitarea {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: transparent;
  cursor: pointer;
}

.generated-image-placeholder {
  display: grid;
  align-content: end;
  gap: 6px;
  width: 100%;
  aspect-ratio: 3 / 4;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface) 18%, transparent),
      color-mix(in srgb, var(--surface) 34%, transparent)
    ),
    radial-gradient(circle at top right, color-mix(in srgb, var(--primary) 14%, transparent), transparent 56%);
  box-shadow:
    0 10px 24px color-mix(in srgb, black 20%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
  color: var(--demo-text-primary);
}

.generated-image-placeholder strong,
.generated-image-placeholder small,
.generated-image-kicker,
.generated-image-caption strong,
.generated-image-caption small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generated-image-kicker {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--demo-text-muted);
}

.generated-image-caption {
  display: grid;
  gap: 2px;
}

.generated-image-caption small {
  color: var(--demo-text-muted);
}
</style>

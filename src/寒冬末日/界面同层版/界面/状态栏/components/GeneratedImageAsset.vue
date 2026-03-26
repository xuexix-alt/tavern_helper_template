<template>
  <figure
    :class="rootClass"
    :data-message-id="entry.messageId"
    :data-marker-id="entry.markerId || ''"
    :data-image-id="entry.imageId || ''"
    :data-prompt-token="encodePromptToken(entry.promptToken)"
    :data-request-id="entry.requestId ?? ''"
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
      :aria-label="secondaryText"
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
import type { GeneratedImageActivationPayload } from '../generatedImageActivation';
import { useGeneratedImageEntityRevision } from '../generatedImageEntityRevision';
import { createGeneratedImageGestureController } from '../generatedImageGestureController';
import {
  readGeneratedImageSource,
  readGeneratedImageSourceAsync,
  type ResolvedGeneratedImageSource,
} from '../generatedImageSourceResolver';
import type { GeneratedImageRef } from '../types';

const props = defineProps<{
  entry: GeneratedImageRef;
  variant?: 'inline' | 'gallery';
  showCaption?: boolean;
}>();

const emit = defineEmits<{
  (event: 'view', payload: GeneratedImageActivationPayload): void;
  (event: 'regenerate', payload: GeneratedImageActivationPayload): void;
}>();

const resolvedSource = ref<ResolvedGeneratedImageSource | null>(null);
const generatedImageEntityRevision = useGeneratedImageEntityRevision();

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

let suppressNextClick = false;

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

function stopEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as Event & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
}

function handleClick(event: MouseEvent) {
  console.log('[GalleryAsset] handleClick called, suppressNextClick:', suppressNextClick);
  if (suppressNextClick) {
    suppressNextClick = false;
    console.log('[GalleryAsset] handleClick suppressed');
    return;
  }
  stopEvent(event);
  gestureController.handleClick();
  console.log('[GalleryAsset] handleClick -> gestureController.handleClick()');
}

function handleDoubleClick(event: MouseEvent) {
  console.log('[GalleryAsset] handleDoubleClick called');
  stopEvent(event);
  suppressNextClick = true;
  console.log('[GalleryAsset] handleDoubleClick -> gestureController.handleDoubleClick()');
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
  // 优先使用 entry 中已有的 src（从 hostDomArtifacts 传递过来）
  if (props.entry.src) {
    resolvedSource.value = {
      src: props.entry.src,
      alt: props.entry.alt ?? props.entry.title,
      imageId: props.entry.imageId ?? props.entry.markerId ?? props.entry.id,
      markerId: props.entry.markerId ?? props.entry.id ?? '',
      source: 'extra',
      messageId: props.entry.messageId,
    };
    return;
  }

  // 备用：从 transcript-entry 的 DOM 中获取，按顺序分配
  const entryEl = document.querySelector(`.transcript-entry[data-message-id="${props.entry.messageId}"]`);
  if (entryEl) {
    // 获取所有容器
    const containers = Array.from(entryEl.querySelectorAll('.st-chatu8-image-container'));
    // 使用 createdOrder 或 index 作为容器索引
    const containerIndex = Math.min(props.entry.createdOrder ?? 0, containers.length - 1);
    const container = containers[containerIndex];
    const img = container?.querySelector('img');
    if (img && img.src && img.src.startsWith('data:image')) {
      resolvedSource.value = {
        src: img.src,
        alt: img.alt || props.entry.title,
        imageId: props.entry.imageId ?? props.entry.markerId ?? props.entry.id,
        markerId: props.entry.markerId ?? props.entry.id ?? '',
        source: 'extra',
        messageId: props.entry.messageId,
      };
      return;
    }
  }

  // 备用2：使用 readGeneratedImageSource
  const syncResult = readGeneratedImageSource({
    messageId: props.entry.messageId,
    markerId: props.entry.markerId,
    imageId: props.entry.imageId,
    requestId: props.entry.requestId,
    promptToken: props.entry.promptToken,
  });

  if (syncResult) {
    resolvedSource.value = syncResult;
    return;
  }

  // 备用3：异步从 IndexedDB 加载
  const asyncResult = await readGeneratedImageSourceAsync({
    messageId: props.entry.messageId,
    markerId: props.entry.markerId,
    imageId: props.entry.imageId,
    requestId: props.entry.requestId,
    promptToken: props.entry.promptToken,
  });
  resolvedSource.value = asyncResult;
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
  gestureController.dispose();
});
</script>

<style scoped>
.generated-image-asset-root {
  position: relative;
  margin: 0;
  display: grid;
  gap: 8px;
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

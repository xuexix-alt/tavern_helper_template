<template>
  <figure
    :class="rootClass"
    :data-message-id="entry.messageId"
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
      :data-image-id="resolvedSource.imageId"
      :data-prompt-token="encodePromptToken(entry.promptToken)"
      :data-request-id="entry.requestId ?? ''"
    />
    <div
      v-else
      class="generated-image-placeholder"
      :data-message-id="entry.messageId"
      :data-image-id="entry.imageId || ''"
      :data-prompt-token="encodePromptToken(entry.promptToken)"
      :data-request-id="entry.requestId ?? ''"
    >
      <span class="generated-image-kicker">{{ kickerText }}</span>
      <strong>{{ entry.characterName || entry.title }}</strong>
      <small>{{ secondaryText }}</small>
    </div>

    <figcaption v-if="showCaption" class="generated-image-caption">
      <strong>{{ entry.characterName || entry.title }}</strong>
      <small>{{ entry.title }}</small>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import type { GeneratedImageRef } from '../types';
import { readGeneratedImageSource, type ResolvedGeneratedImageSource } from '../generatedImageSourceResolver';

const props = defineProps<{
  entry: GeneratedImageRef;
  variant?: 'inline' | 'gallery';
  showCaption?: boolean;
}>();

const resolvedSource = ref<ResolvedGeneratedImageSource | null>(null);

const rootClass = computed(() =>
  props.variant === 'gallery'
    ? 'assistant-gallery-image generated-image-asset-root'
    : 'assistant-fallback-inline-image generated-image-asset-root',
);

const kickerText = computed(() => (resolvedSource.value ? '单击查看' : '等待图片'));
const secondaryText = computed(() => (props.entry.requestId ? '双击重生' : '双击调用原图链'));

function encodePromptToken(value: string) {
  return encodeURIComponent(String(value ?? ''));
}

function resolveSource() {
  resolvedSource.value = readGeneratedImageSource({
    messageId: props.entry.messageId,
    imageId: props.entry.imageId,
    requestId: props.entry.requestId,
    promptToken: props.entry.promptToken,
  });
}

watch(
  () => [props.entry.messageId, props.entry.imageId, props.entry.requestId, props.entry.promptToken].join('::'),
  () => {
    resolveSource();
  },
  { immediate: true },
);
</script>

<style scoped>
.generated-image-asset-root {
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
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  background: color-mix(in srgb, var(--surface) 22%, transparent);
  box-shadow:
    0 10px 24px color-mix(in srgb, black 20%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
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

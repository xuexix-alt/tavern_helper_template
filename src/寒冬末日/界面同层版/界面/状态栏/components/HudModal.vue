<template>
  <transition name="hud-modal-fade">
    <div v-if="open" class="hud-modal-root">
      <div class="hud-modal-backdrop" @click="$emit('close')"></div>
      <section class="hud-modal-panel" :class="[variantClass, { wide }]">
        <header class="hud-modal-head">
          <div class="hud-modal-head-main">
            <div v-if="iconSrc || icon" class="hud-modal-icon" :class="{ 'is-image': Boolean(iconSrc) }">
              <img v-if="iconSrc" class="hud-modal-icon-image" :src="iconSrc" :alt="iconAltText" />
              <span v-else>{{ icon }}</span>
            </div>
            <div class="hud-modal-copy">
              <span class="demo-kicker">{{ eyebrowText }}</span>
              <strong>{{ title }}</strong>
              <p v-if="subtitle">{{ subtitle }}</p>
            </div>
          </div>

          <button type="button" class="hud-modal-close" @click="$emit('close')">✕</button>
        </header>

        <div class="hud-modal-body" :class="`is-${variant}`">
          <slot />
        </div>
      </section>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';

const props = defineProps<{
  open: boolean;
  title: string;
  subtitle?: string;
  wide?: boolean;
  variant?: 'workspace' | 'map' | 'tasks' | 'typography' | 'library';
  icon?: string;
  iconSrc?: string;
  iconAlt?: string;
  eyebrow?: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

useEventListener(window, 'keydown', event => {
  if (!props.open) return;
  if (event.key === 'Escape') emit('close');
});

const variantClass = computed(() => `variant-${props.variant ?? 'workspace'}`);
const eyebrowText = computed(() => props.eyebrow ?? 'MODAL // WORKSPACE');
const iconAltText = computed(() => props.iconAlt ?? props.title);
</script>

<style scoped>
.hud-modal-root {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.hud-modal-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, black 48%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.hud-modal-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(100%, 52rem);
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 10px 40px var(--shadow-color);
}

.hud-modal-panel.wide {
  width: min(100%, 68rem);
}

.hud-modal-panel.variant-map.wide {
  width: min(100%, 82rem);
}

.hud-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.hud-modal-head-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.hud-modal-icon {
  width: 54px;
  height: 54px;
  flex: 0 0 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--primary) 32%, transparent);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--demo-text-accent);
  font-size: 24px;
  overflow: hidden;
}

.hud-modal-icon.is-image {
  padding: 0;
  background: color-mix(in srgb, var(--surface) 26%, transparent);
}

.hud-modal-icon-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.hud-modal-copy {
  min-width: 0;
}

.hud-modal-copy strong {
  display: block;
  margin-top: 5px;
  font-size: 18px;
  line-height: 1.2;
}

.hud-modal-copy p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--demo-text-secondary);
}

.hud-modal-close {
  width: 36px;
  aspect-ratio: 1;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-primary);
}

.hud-modal-body {
  min-height: 0;
  max-height: min(128vw, 42rem);
  overflow: auto;
  padding: 18px 22px 22px;
}

.hud-modal-body.is-map {
  position: relative;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 22%, transparent), transparent),
    linear-gradient(to right, color-mix(in srgb, var(--border) 14%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--border) 14%, transparent) 1px, transparent 1px);
  background-size:
    auto,
    48px 48px,
    48px 48px;
}

.hud-modal-body.is-map :deep(#shelter-section) {
  background: transparent;
  padding: 0;
}

.hud-modal-body.is-map :deep(#shelter-section > .section-title) {
  display: none;
}

.hud-modal-body.is-map :deep(.shelter-grid) {
  gap: 18px;
}

.hud-modal-body.is-map :deep(.shelter-item),
.hud-modal-body.is-map :deep(.map-zone),
.hud-modal-body.is-map :deep(.floor-zone),
.hud-modal-body.is-map :deep(.expansion-card),
.hud-modal-body.is-map :deep(.room-cell) {
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.hud-modal-body.is-map :deep(.map-container),
.hud-modal-body.is-map :deep(.floor-zone),
.hud-modal-body.is-map :deep(.map-zone) {
  border-color: color-mix(in srgb, var(--primary) 28%, transparent);
}

.hud-modal-body.is-tasks,
.hud-modal-body.is-library,
.hud-modal-body.is-workspace,
.hud-modal-body.is-typography {
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 18%, transparent), transparent);
}

.variant-library .hud-modal-head {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.variant-map .hud-modal-head,
.variant-tasks .hud-modal-head,
.variant-typography .hud-modal-head {
  background: color-mix(in srgb, var(--primary) 5%, transparent);
}

.hud-modal-fade-enter-active,
.hud-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.hud-modal-fade-enter-from,
.hud-modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .hud-modal-panel {
    border-radius: 18px;
  }

  .hud-modal-head {
    padding: 16px;
  }

  .hud-modal-body {
    padding: 14px 16px 16px;
  }

  .hud-modal-copy strong {
    font-size: 16px;
  }

  .hud-modal-icon {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
    font-size: 20px;
  }
}
</style>

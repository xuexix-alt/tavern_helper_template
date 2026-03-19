<template>
  <main class="doc-shell-root" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="doc-shell-grid demo-grid-bg"></div>
    <div class="doc-shell-vignette"></div>
    <StoryPage />
  </main>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue';
import StoryPage from './pages/StoryPage.vue';

const isFullscreen = inject('isFullscreen', ref(false));
</script>

<style scoped>
.doc-shell-root {
  position: relative;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border-radius: 22px;
  background: var(--demo-bg-gradient);
  border: 1px solid var(--demo-border-shell);
  box-shadow: var(--demo-shadow-shell);
  isolation: isolate;
}

.doc-shell-grid {
  position: absolute;
  inset: 0;
  opacity: 0.24;
  pointer-events: none;
}

.doc-shell-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary) 18%, transparent), transparent 34%),
    radial-gradient(circle at bottom right, color-mix(in srgb, var(--primary) 16%, transparent), transparent 28%),
    linear-gradient(180deg, transparent, color-mix(in srgb, black 14%, transparent));
}

@media (min-width: 761px) {
  .doc-shell-root {
    overflow: visible;
    isolation: auto;
    border-color: transparent;
    box-shadow: 0 22px 56px color-mix(in srgb, var(--shadow-color) 54%, transparent);
  }
}

@media (max-width: 760px) {
  .doc-shell-root {
    border-radius: 18px;
  }
}

/* 全屏模式：去掉外壳装饰，让内容铺满 */
.doc-shell-root.is-fullscreen {
  border-radius: 0;
  border: none;
  box-shadow: none;
  overflow: visible;
}
</style>

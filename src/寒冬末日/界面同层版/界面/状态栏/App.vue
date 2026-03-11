<template>
  <main class="doc-shell-root">
    <div class="doc-shell-grid demo-grid-bg"></div>
    <div class="doc-shell-vignette"></div>
    <StoryPage />
  </main>
</template>

<script setup lang="ts">
import StoryPage from './pages/StoryPage.vue';
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

@media (max-width: 760px) {
  .doc-shell-root {
    border-radius: 18px;
  }
}
</style>

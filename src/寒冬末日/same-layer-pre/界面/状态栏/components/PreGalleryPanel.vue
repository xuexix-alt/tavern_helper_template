<template>
  <section class="pre-gallery-panel" data-pre-gallery-placeholder="true">
    <div class="pre-gallery-panel__mark">PRE_GALLERY_PLACEHOLDER</div>
    <div class="pre-gallery-panel__empty">暂无图片</div>
  </section>
</template>

<script setup lang="ts">
const PRE_GALLERY_PLACEHOLDER = true;
void PRE_GALLERY_PLACEHOLDER;
</script>

<style scoped>
.pre-gallery-panel {
  display: grid;
  gap: 12px;
  height: 100%;
  min-height: 0;
  align-content: center;
  justify-items: center;
  padding: 18px;
  color: var(--demo-text-secondary);
}

.pre-gallery-panel__mark {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.pre-gallery-panel__empty {
  width: 100%;
  padding: 18px;
  border: 1px dashed var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  color: var(--demo-text-tertiary);
  text-align: center;
  font-size: 13px;
}
</style>

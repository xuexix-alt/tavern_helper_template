<template>
  <Teleport to="body">
    <div class="portrait-picker-mask" @click.self="emit('close')">
      <section class="portrait-picker clip-corner" role="dialog" aria-modal="true">
        <header class="portrait-picker-head">
          <div>
            <span class="demo-kicker">PORTRAIT // GALLERY</span>
            <strong>{{ roleLabel }} 设定图</strong>
          </div>
          <button type="button" class="portrait-close clip-corner-sm" @click="emit('close')">✕</button>
        </header>

        <div v-if="roleEntries.length === 0" class="portrait-empty clip-corner-sm">
          当前图廊里还没有能匹配到 {{ roleLabel }} 的图片。
        </div>

        <div v-else class="portrait-grid">
          <article
            v-for="entry in roleEntries"
            :key="entry.id"
            class="portrait-option clip-corner-sm"
          >
            <button type="button" class="portrait-option-main" @click="emit('select', entry)">
              <img :src="entry.src" :alt="entry.alt || entry.title || `${roleLabel} 图廊图片`" loading="lazy" />
              <span class="portrait-option-copy">
                <strong>{{ displayImageName(entry.title || entry.characterName || roleLabel) }}</strong>
                <small>#{{ entry.messageId }} · {{ displayImageName(entry.characterName || '图廊匹配') }}</small>
              </span>
            </button>
            <button
              type="button"
              class="portrait-add-btn clip-corner-sm"
              title="加入设定集"
              aria-label="加入设定集"
              @click.stop="emit('add', entry)"
            >
              +
            </button>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatImageDisplayName } from '../generatedImagePromptMetadata';
import { findGalleryEntriesForRole } from '../rolePortraits';
import type { ReaderGalleryEntry } from '../types';

const props = defineProps<{
  roleKey: string;
  roleLabel: string;
  entries: ReaderGalleryEntry[];
}>();

const emit = defineEmits<{
  (event: 'select', entry: ReaderGalleryEntry): void;
  (event: 'add', entry: ReaderGalleryEntry): void;
  (event: 'close'): void;
}>();

const roleLabel = computed(() => props.roleLabel);

const roleEntries = computed(() => {
  return findGalleryEntriesForRole({ key: props.roleKey, label: props.roleLabel }, props.entries);
});

function displayImageName(value: string) {
  return formatImageDisplayName(value, '');
}
</script>

<style scoped lang="scss">
.portrait-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 2700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: color-mix(in srgb, black 48%, transparent);
}

.portrait-picker {
  width: min(92vw, 40rem);
  max-height: min(84vh, 44rem);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: 0 18px 54px color-mix(in srgb, var(--shadow-color) 80%, transparent);
}

.portrait-picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px 10px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.portrait-picker-head strong {
  display: block;
  margin-top: 4px;
  font-size: 15px;
}

.portrait-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 32%, transparent);
  color: var(--demo-text-primary);
}

.portrait-empty {
  margin: 14px;
  padding: 16px;
  border: 1px dashed var(--demo-border-accent-soft);
  color: var(--demo-text-secondary);
  font-size: 13px;
}

.portrait-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.portrait-option {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
  color: var(--demo-text-primary);
  text-align: left;
}

.portrait-option-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.portrait-option:hover {
  border-color: var(--demo-border-accent-active);
}

.portrait-option img {
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  object-position: center top;
  background: color-mix(in srgb, var(--surface) 40%, black);
}

.portrait-option-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-right: 34px;
}

.portrait-option strong,
.portrait-option small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.portrait-option strong {
  font-size: 12px;
}

.portrait-option small {
  font-family: var(--demo-font-mono);
  font-size: 10px;
  color: var(--demo-text-secondary);
}

.portrait-add-btn {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--surface) 58%, transparent);
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
  font-size: 17px;
  line-height: 1;
}

.portrait-add-btn:hover,
.portrait-add-btn:focus-visible {
  outline: none;
  border-color: var(--demo-text-accent);
  background: color-mix(in srgb, var(--primary) 14%, var(--surface) 70%);
}
</style>

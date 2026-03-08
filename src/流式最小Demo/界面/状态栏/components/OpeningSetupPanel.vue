<template>
  <section class="opening-setup-card">
    <header class="opening-setup-head">
      <div>
        <span class="opening-setup-kicker">OPENING SETUP</span>
        <h3>开局配置</h3>
        <p>先由 UI 组装预制背景与用户定制化信息，再生成 opening，避免直接复读酒馆原始 0 层正文。</p>
      </div>
      <button type="button" class="opening-generate-btn" :disabled="busy" @click="$emit('submit')">
        {{ busy ? '生成中…' : '生成开局' }}
      </button>
    </header>

    <section class="opening-preview-block">
      <span class="opening-label">基础世界观背景</span>
      <div class="opening-preview-text">{{ payload.base.world_intro }}</div>
    </section>

    <section class="opening-preview-block">
      <span class="opening-label">开局第一句话</span>
      <div class="opening-preview-text">{{ payload.base.first_line }}</div>
    </section>

    <section class="opening-meta-grid">
      <div class="opening-meta-item">
        <span class="opening-label">{{ preset.meta_template.character_label }}</span>
        <input class="opening-input" :value="payload.meta.character" @input="emitMeta('character', $event)" />
      </div>
      <div class="opening-meta-item">
        <span class="opening-label">{{ preset.meta_template.time_label }}</span>
        <input class="opening-input" :value="payload.meta.time" @input="emitMeta('time', $event)" />
      </div>
      <div class="opening-meta-item full">
        <span class="opening-label">{{ preset.meta_template.location_label }}</span>
        <input class="opening-input" :value="payload.meta.location" @input="emitMeta('location', $event)" />
      </div>
    </section>

    <section class="opening-form-grid">
      <div v-for="field in preset.form_schema" :key="field.key" class="opening-form-item" :class="{ full: field.kind === 'textarea' }">
        <span class="opening-label">{{ field.label }}</span>
        <textarea
          v-if="field.kind === 'textarea'"
          class="opening-textarea"
          :rows="4"
          :placeholder="field.placeholder"
          :value="payload.user_input[field.key] || ''"
          @input="emitField(field.key, $event)"
        />
        <select
          v-else-if="field.kind === 'select'"
          class="opening-select"
          :value="payload.user_input[field.key] || ''"
          @change="emitField(field.key, $event)"
        >
          <option value="">请选择</option>
          <option v-for="option in field.options || []" :key="option" :value="option">{{ option }}</option>
        </select>
        <input
          v-else
          class="opening-input"
          :placeholder="field.placeholder"
          :value="payload.user_input[field.key] || ''"
          @input="emitField(field.key, $event)"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { OpeningPayload, OpeningPreset } from '../../../shared/opening.schema';

const props = defineProps<{
  preset: OpeningPreset;
  payload: OpeningPayload;
  busy: boolean;
}>();

const emit = defineEmits<{
  (event: 'update-meta', key: 'character' | 'time' | 'location', value: string): void;
  (event: 'update-field', key: string, value: string): void;
  (event: 'submit'): void;
}>();

function readInputValue(event: Event): string {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return String(target?.value ?? '');
}

function emitMeta(key: 'character' | 'time' | 'location', event: Event) {
  emit('update-meta', key, readInputValue(event));
}

function emitField(key: string, event: Event) {
  emit('update-field', key, readInputValue(event));
}
</script>

<style scoped>
.opening-setup-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--demo-surface-card-strong);
  border: 1px solid var(--demo-border-warning);
}

.opening-setup-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.opening-setup-kicker {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--demo-text-warning);
}

.opening-setup-head h3,
.opening-setup-head p {
  margin: 0;
}

.opening-setup-head p {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--demo-text-tertiary);
}

.opening-generate-btn {
  flex: 0 0 auto;
  min-height: 38px;
  border-radius: 10px;
  border: 1px solid var(--demo-border-warning-soft);
  background: var(--demo-surface-user-soft);
  color: var(--demo-text-warning);
  padding: 8px 12px;
}

.opening-label {
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.opening-preview-block,
.opening-meta-item,
.opening-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.opening-preview-text {
  padding: 10px;
  border-radius: 10px;
  background: var(--demo-surface-panel);
  border: 1px solid var(--demo-border-accent-soft);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.opening-meta-grid,
.opening-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.opening-meta-item.full,
.opening-form-item.full {
  grid-column: 1 / -1;
}

.opening-input,
.opening-textarea,
.opening-select {
  width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid var(--demo-border-accent-strong);
  background: var(--demo-surface-panel-strong);
  color: var(--demo-text-primary);
  padding: 10px;
}

.opening-textarea {
  resize: vertical;
  min-height: 96px;
}

@media (max-width: 680px) {
  .opening-setup-head {
    flex-direction: column;
  }

  .opening-meta-grid,
  .opening-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

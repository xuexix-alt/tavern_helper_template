<template>
  <section class="opening-setup-card">
    <header class="opening-setup-head">
      <div>
        <span class="opening-setup-kicker">OPENING SETUP</span>
        <h3>开局配置</h3>
        <p>按提示词变量直接填表；世界观变量和边界约束由当前选择自动带入。</p>
      </div>
      <div class="opening-head-actions">
        <label class="stream-toggle">
          <input type="checkbox" :checked="payload.use_stream" @change="emitStreamToggle($event)" />
          <span class="stream-toggle-slider"></span>
          <span class="stream-toggle-label">流式生成</span>
        </label>
        <button type="button" class="opening-generate-btn" :disabled="busy" @click="$emit('submit')">
          {{ busy ? '生成中…' : '生成开局' }}
        </button>
      </div>
    </header>

    <section class="opening-profile-grid">
      <div class="opening-form-item">
        <span class="opening-label">世界观档位</span>
        <select class="opening-select" :value="payload.world_mode_id" @change="emitWorldMode($event)">
          <option v-for="mode in worldModes" :key="mode.id" :value="mode.id">{{ mode.id }} · {{ mode.name }}</option>
        </select>
      </div>

      <div class="opening-form-item">
        <span class="opening-label">开局主流派</span>
        <select class="opening-select" :value="payload.route_id" @change="emitRoute($event)">
          <option v-for="route in routes" :key="route.id" :value="route.name">
            {{ route.name }}
          </option>
        </select>
      </div>
    </section>

    <section class="opening-form-grid">
      <div class="opening-form-item full">
        <span class="opening-label">世界观变量</span>
        <textarea class="opening-textarea opening-textarea-readonly" :rows="8" :value="worldModeAxisDictionaryText" readonly />
      </div>

      <div class="opening-form-item full">
        <span class="opening-label">边界约束</span>
        <textarea class="opening-textarea opening-textarea-readonly" :rows="4" :value="forbiddenDriftText" readonly />
      </div>
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
      <div
        v-for="field in preset.form_schema"
        :key="field.key"
        class="opening-form-item"
        :class="{ full: field.kind === 'textarea' }"
      >
        <span class="opening-label">{{ field.label }}</span>
        <textarea
          v-if="field.kind === 'textarea'"
          class="opening-textarea"
          :rows="4"
          :placeholder="field.placeholder"
          :value="payload.form_values[field.key] || ''"
          @input="emitField(field.key, $event)"
        />
        <select
          v-else-if="field.kind === 'select'"
          class="opening-select"
          :value="payload.form_values[field.key] || ''"
          @change="emitField(field.key, $event)"
        >
          <option value="">请选择</option>
          <option v-for="option in field.options || []" :key="option" :value="option">{{ option }}</option>
        </select>
        <input
          v-else
          class="opening-input"
          :placeholder="field.placeholder"
          :value="payload.form_values[field.key] || ''"
          @input="emitField(field.key, $event)"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { OpeningRouteOption, OpeningWorldModeOption } from '../../../shared/opening';
import type { OpeningPayload, OpeningPreset } from '../../../shared/opening.schema';

const props = defineProps<{
  preset: OpeningPreset;
  payload: OpeningPayload;
  busy: boolean;
  worldModes: OpeningWorldModeOption[];
  routes: OpeningRouteOption[];
}>();

const emit = defineEmits<{
  (event: 'update-meta', key: 'character' | 'time' | 'location', value: string): void;
  (event: 'update-field', key: string, value: string): void;
  (event: 'update-world-mode', value: string): void;
  (event: 'update-route', value: string): void;
  (event: 'update-stream', value: boolean): void;
  (event: 'submit'): void;
}>();

const selectedWorldMode = computed(
  () => props.worldModes.find(mode => mode.id === props.payload.world_mode_id) ?? null,
);
const selectedRoute = computed(() => props.routes.find(route => route.name === props.payload.route_id) ?? null);

const worldModeAxisDictionaryText = computed(() => {
  const worldMode = selectedWorldMode.value;
  if (!worldMode) return '未设定';

  const axisOrder = ['气候压力', '行动窗口', '社会残存度', '外部威胁主因', '生产残余度', '冲突密度', '外出死亡风险', '据点化程度'];

  return axisOrder
    .map(axisName => {
      const axis = worldMode.axes?.[axisName] as Record<string, unknown> | undefined;
      if (!axis || typeof axis !== 'object') return '';

      const label = String(axis.label ?? '').trim();
      const subtype = String(axis.subtype ?? '').trim();
      const numericParts = Object.entries(axis)
        .filter(([key, value]) => key !== 'label' && key !== 'subtype' && value != null && String(value).trim())
        .map(([key, value]) => `${key}=${String(value)}`);

      return [
        `${axisName}：${label || '未设定'}`,
        subtype ? `（${subtype}）` : '',
        numericParts.length > 0 ? `；${numericParts.join('，')}` : '',
      ].join('');
    })
    .filter(Boolean)
    .join('\n');
});

const forbiddenDriftText = computed(() => {
  const items = selectedRoute.value?.forbidden_drift ?? [];
  return items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '未设定';
});

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

function emitWorldMode(event: Event) {
  emit('update-world-mode', readInputValue(event));
}

function emitRoute(event: Event) {
  emit('update-route', readInputValue(event));
}

function emitStreamToggle(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit('update-stream', target?.checked === true);
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

.opening-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
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

.stream-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--demo-text-secondary);
  font-size: 12px;
}

.stream-toggle input {
  display: none;
}

.stream-toggle-slider {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--demo-surface-panel-strong);
  border: 1px solid var(--demo-border-accent-strong);
  transition: background-color 0.2s ease;
}

.stream-toggle-slider::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--demo-text-secondary);
  transition: transform 0.2s ease;
}

.stream-toggle input:checked + .stream-toggle-slider {
  background: var(--demo-surface-user-soft);
  border-color: var(--demo-border-warning-soft);
}

.stream-toggle input:checked + .stream-toggle-slider::before {
  transform: translateX(14px);
  background: var(--demo-text-warning);
}

.stream-toggle-label {
  white-space: nowrap;
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
.opening-form-grid,
.opening-profile-grid {
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

.opening-textarea-readonly {
  opacity: 0.92;
  background: color-mix(in srgb, var(--demo-surface-panel) 88%, black 12%);
}

@media (max-width: 680px) {
  .opening-setup-head {
    flex-direction: column;
  }

  .opening-meta-grid,
  .opening-form-grid,
  .opening-profile-grid {
    grid-template-columns: 1fr;
  }
}
</style>

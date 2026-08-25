<template>
  <section class="opening-setup-card hud-panel clip-corner">
    <header class="opening-setup-head">
      <div>
        <span class="opening-setup-kicker">OPENING SETUP</span>
        <h3>{{ runtimePreset?.ui.title || '开局配置' }}</h3>
        <p>{{ runtimePreset?.ui.intro || '表单内容会影响整个故事，请你按照你的喜好进行填写。' }}</p>
      </div>
      <div class="opening-head-actions">
        <label class="stream-toggle">
          <input type="checkbox" :checked="payload.use_stream" @change="emitStreamToggle($event)" />
          <span class="stream-toggle-slider"></span>
          <span class="stream-toggle-label">流式生成</span>
        </label>
        <button type="button" class="opening-generate-btn clip-corner-sm" :disabled="busy" @click="emitSubmit">
          {{ busy ? '生成中…' : runtimePreset?.ui.submit_label || '生成开局' }}
        </button>
      </div>
    </header>

    <template v-if="runtimePreset">
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
          v-for="field in runtimePreset.fields"
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
    </template>

    <template v-else>
      <section class="opening-story-menu">
        <div class="opening-form-item full">
          <span class="opening-label">故事模板</span>
          <select
            :value="selectedStoryKey"
            class="opening-select opening-story-select"
            @change="emitStoryTemplate($event)"
          >
            <option :value="CURRENT_STORY_KEY">末世寒冬-星球秩序</option>
            <option :value="NEW_STORY_KEY">新的故事</option>
          </select>
        </div>
      </section>

      <template v-if="isCurrentStorySelected">
        <section class="opening-profile-grid">
          <div class="opening-form-item">
            <span class="opening-label">世界观档位</span>
            <select class="opening-select" :value="payload.world_mode_id" @change="emitWorldMode($event)">
              <option v-for="mode in worldModes" :key="mode.id" :value="mode.id">
                {{ mode.id }} · {{ mode.name }}
              </option>
            </select>
          </div>

          <div class="opening-form-item">
            <span class="opening-label">游玩流派</span>
            <select class="opening-select" :value="payload.route_id" @change="emitRoute($event)">
              <option v-for="route in routes" :key="route.id" :value="route.name">
                {{ route.name }}
              </option>
            </select>
          </div>
        </section>

        <section class="opening-form-grid">
          <div class="opening-form-item full">
            <span class="opening-label">世界观档位</span>
            <textarea
              class="opening-textarea opening-textarea-readonly"
              :rows="8"
              :value="worldModeAxisDictionaryText"
              readonly
            />
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
            v-for="field in effectiveFormSchema"
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
            <div v-else-if="field.kind === 'text' && field.options?.length" class="opening-combo-field">
              <select
                class="opening-select opening-combo-select"
                :value="presetSelectValue(field)"
                @change="emitField(field.key, $event)"
              >
                <option value="">预设</option>
                <option v-for="option in getFieldOptions(field)" :key="option" :value="option">{{ option }}</option>
              </select>
              <input
                class="opening-input opening-combo-input"
                :placeholder="field.placeholder"
                :value="payload.form_values[field.key] || ''"
                @input="emitField(field.key, $event)"
              />
            </div>
            <input
              v-else
              class="opening-input"
              :placeholder="field.placeholder"
              :value="payload.form_values[field.key] || ''"
              @input="emitField(field.key, $event)"
            />
          </div>
        </section>
      </template>

      <template v-else>
        <section class="opening-new-story-brief clip-corner-sm">
          <div>
            <span class="opening-label">新的故事</span>
            <h4>通用故事开场</h4>
          </div>
          <p>用独立提示词生成原创或同人开场，不继承寒冬末日的世界观档位与流派约束。</p>
        </section>

        <section class="opening-meta-grid">
          <div class="opening-meta-item">
            <span class="opening-label">主角</span>
            <input class="opening-input" :value="payload.meta.character" @input="emitMeta('character', $event)" />
          </div>
          <div class="opening-meta-item">
            <span class="opening-label">故事时间</span>
            <input class="opening-input" :value="payload.meta.time" @input="emitMeta('time', $event)" />
          </div>
          <div class="opening-meta-item full">
            <span class="opening-label">开场地点</span>
            <input class="opening-input" :value="payload.meta.location" @input="emitMeta('location', $event)" />
          </div>
        </section>

        <section class="opening-form-grid">
          <div
            v-for="field in visibleNewStoryFormSchema"
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
            <div v-else-if="field.kind === 'text' && field.options?.length" class="opening-combo-field">
              <select
                class="opening-select opening-combo-select"
                :value="presetSelectValue(field)"
                @change="emitField(field.key, $event)"
              >
                <option value="">预设</option>
                <option v-for="option in getFieldOptions(field)" :key="option" :value="option">{{ option }}</option>
              </select>
              <input
                class="opening-input opening-combo-input"
                :placeholder="field.placeholder"
                :value="payload.form_values[field.key] || ''"
                @input="emitField(field.key, $event)"
              />
            </div>
            <input
              v-else
              class="opening-input"
              :placeholder="field.placeholder"
              :value="payload.form_values[field.key] || ''"
              @input="emitField(field.key, $event)"
            />
          </div>
        </section>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import {
  OPENING_STORY_TEMPLATE_GENERIC,
  OPENING_STORY_TEMPLATE_WINTER,
  buildWorldModeAxisDictionary,
  getEffectiveFormSchema,
  getGenericStoryFanworkOptionsForGenre,
  getOpeningFormSchema,
  type OpeningRouteOption,
  type OpeningWorldModeOption,
} from '../../../shared/opening';
import type { OpeningFormField, OpeningPayload, OpeningPreset } from '../../../shared/opening.schema';
import type { RuntimeOpeningPreset } from '../../../shared/runtimeOpeningPreset.schema';

const props = defineProps<{
  preset: OpeningPreset;
  payload: OpeningPayload;
  busy: boolean;
  worldModes: OpeningWorldModeOption[];
  routes: OpeningRouteOption[];
  runtimePreset?: RuntimeOpeningPreset | null;
}>();

const emit = defineEmits<{
  (event: 'update-meta', key: 'character' | 'time' | 'location', value: string): void;
  (event: 'update-field', key: string, value: string): void;
  (event: 'update-story-template', value: string): void;
  (event: 'update-world-mode', value: string): void;
  (event: 'update-route', value: string): void;
  (event: 'update-stream', value: boolean): void;
  (event: 'submit'): void;
}>();

const CURRENT_STORY_KEY = 'winter-apocalypse-order';
const NEW_STORY_KEY = 'new-story';
const selectedStoryKey = computed(() =>
  props.payload.story_template === OPENING_STORY_TEMPLATE_GENERIC ? NEW_STORY_KEY : CURRENT_STORY_KEY,
);
const isCurrentStorySelected = computed(() => selectedStoryKey.value === CURRENT_STORY_KEY);

const selectedWorldMode = computed(
  () => props.worldModes.find(mode => mode.id === props.payload.world_mode_id) ?? null,
);

const effectiveFormSchema = computed(() => getEffectiveFormSchema(props.preset, props.payload.world_mode_id));
const newStoryFormSchema = computed(() => getOpeningFormSchema(props.preset, props.payload));
const visibleNewStoryFormSchema = computed(() =>
  newStoryFormSchema.value.filter(field => {
    if (field.key === 'fanwork_name') return String(props.payload.form_values.is_fanwork ?? '').trim() === '是';
    return true;
  }),
);

const worldModeAxisDictionaryText = computed(() => {
  const worldMode = selectedWorldMode.value;
  return buildWorldModeAxisDictionary(worldMode);
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

function presetSelectValue(field: OpeningFormField): string {
  const currentValue = String(props.payload.form_values[field.key] ?? '').trim();
  return getFieldOptions(field).includes(currentValue) ? currentValue : '';
}

function getFieldOptions(field: OpeningFormField): string[] {
  if (field.key === 'fanwork_name') {
    return getGenericStoryFanworkOptionsForGenre(props.payload.form_values.generic_genre ?? '');
  }
  return field.options ?? [];
}

function emitStoryTemplate(event: Event) {
  const value =
    readInputValue(event) === NEW_STORY_KEY ? OPENING_STORY_TEMPLATE_GENERIC : OPENING_STORY_TEMPLATE_WINTER;
  emit('update-story-template', value);
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

function emitSubmit() {
  emit('submit');
}
</script>

<style scoped>
.opening-setup-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
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
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--demo-text-warning);
}

.opening-setup-head h3,
.opening-setup-head p {
  margin: 0;
}

.opening-setup-head p {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--demo-text-tertiary);
}

.opening-generate-btn {
  min-height: 40px;
  border: 1px solid var(--demo-border-warning-soft);
  background: var(--demo-gradient-primary);
  color: var(--demo-text-inverse);
  padding: 8px 14px;
  font-weight: 700;
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
  background: color-mix(in srgb, var(--surface) 42%, transparent);
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

.stream-toggle input:disabled + .stream-toggle-slider,
.stream-toggle input:disabled ~ .stream-toggle-label {
  opacity: 0.48;
}

.stream-toggle-label {
  white-space: nowrap;
}

.opening-label {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--demo-text-subtle);
}

.opening-meta-item,
.opening-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.opening-meta-grid,
.opening-form-grid,
.opening-story-menu,
.opening-profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.opening-meta-item.full,
.opening-form-item.full {
  grid-column: 1 / -1;
}

.opening-story-menu {
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--demo-border-accent-strong) 78%, transparent);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
}

.opening-story-select {
  min-height: 40px;
  font-weight: 700;
}

.opening-new-story-brief {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--demo-border-accent-strong) 72%, transparent);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
}

.opening-new-story-brief h4,
.opening-new-story-brief p {
  margin: 0;
}

.opening-new-story-brief h4 {
  margin-top: 4px;
  font-size: 16px;
  color: var(--demo-text-primary);
}

.opening-new-story-brief p {
  max-width: 520px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--demo-text-tertiary);
}

.opening-input,
.opening-textarea,
.opening-select {
  width: 100%;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid var(--demo-border-accent-strong);
  background: color-mix(in srgb, var(--surface) 46%, transparent);
  color: var(--demo-text-primary);
  padding: 10px;
}

.opening-combo-field {
  display: grid;
  grid-template-columns: minmax(128px, 0.45fr) minmax(0, 1fr);
  gap: 8px;
}

.opening-combo-select,
.opening-combo-input {
  min-width: 0;
}

.opening-textarea {
  resize: vertical;
  min-height: 96px;
}

.opening-textarea-readonly {
  opacity: 0.92;
  background: color-mix(in srgb, var(--surface) 34%, transparent);
}

@media (max-width: 680px) {
  .opening-setup-head {
    flex-direction: column;
  }

  .opening-new-story-brief {
    flex-direction: column;
  }

  .opening-combo-field {
    grid-template-columns: 1fr;
  }

  .opening-meta-grid,
  .opening-form-grid,
  .opening-story-menu,
  .opening-profile-grid {
    grid-template-columns: 1fr;
  }
}
</style>

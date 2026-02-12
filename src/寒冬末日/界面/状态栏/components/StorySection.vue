<template>
  <section class="section">
    <h2 class="section-title story-header-title">📖 正文剧情 📖</h2>

    <div class="story-toolbar">
      <div class="story-mini-tabs" role="tablist" aria-label="正文视图切换">
        <button
          v-for="tab in storyTabs"
          :key="tab.key"
          type="button"
          class="story-mini-tab"
          :class="{ active: activeStoryTab === tab.key }"
          @click="activeStoryTab = tab.key"
        >
          <span>{{ tab.label }}</span>
          <span class="story-mini-tab-count">{{ tab.count }}</span>
        </button>
      </div>
      <div class="story-zoom-controls">
        <button type="button" class="zoom-btn" @click="zoomOut">−</button>
        <span class="zoom-value">{{ zoomPercent }}%</span>
        <button type="button" class="zoom-btn" @click="zoomIn">+</button>
      </div>
    </div>

    <div v-if="activeStoryTab === 'story'" class="story-pane content-text" :style="storyContentStyle">
      <button type="button" class="story-filter-toggle" @click="isFilterExpanded = !isFilterExpanded">
        {{ isFilterExpanded ? '收起标签筛选' : '展开标签筛选' }}
      </button>
      <div v-if="isFilterExpanded" class="story-filter-panel">
        <button
          v-for="item in segmentFilterItems"
          :key="item.key"
          type="button"
          class="story-filter-chip"
          :class="{ active: enabledSegmentKinds.includes(item.key) }"
          @click="toggleSegmentKind(item.key)"
        >
          <span>{{ item.label }}</span>
          <span class="chip-count">{{ item.count }}</span>
        </button>
        <div class="story-filter-actions">
          <button type="button" class="story-filter-action-btn" @click="enableAllSegmentKinds">全选</button>
          <button type="button" class="story-filter-action-btn" @click="enableCoreSegmentKinds">正文优先</button>
        </div>
      </div>

      <template v-for="seg in filteredSegments" :key="seg.key">
        <div v-if="seg.isImage" class="story-image-wrap" :class="getImageWrapAlignmentClass()">
          <img
            :src="seg.imageUrl"
            :alt="seg.altText"
            class="story-image"
            :class="{ 'is-redrawable': !!seg.imagePromptRaw }"
            :title="getStoryImageTitle(seg)"
            @load="scheduleResize"
            @error="scheduleResize"
            @click="onStoryImageClick(seg)"
            @pointerdown="onStoryImagePointerDown(seg, $event)"
            @pointerup="onStoryImagePointerUp"
            @pointerleave="onStoryImagePointerUp"
            @pointercancel="onStoryImagePointerUp"
            @dblclick="onStoryImageDoubleClick(seg)"
          />
          <button
            v-if="shouldShowGenerateFab()"
            type="button"
            class="story-image-generate-fab"
            :title="getSegmentPromptUi(seg).isLoading ? '生图中…' : '生图'"
            :aria-label="getSegmentPromptUi(seg).isLoading ? '生图中' : '生图'"
            :disabled="getSegmentPromptUi(seg).isLoading"
            @click.stop="onStoryImageGenerate(seg)"
          >
            <i class="fa-solid fa-paintbrush" aria-hidden="true" />
          </button>
        </div>
        <table v-else-if="seg.isTable" class="markdown-table">
          <thead>
            <tr>
              <th v-for="(header, idx) in seg.tableHeaders" :key="idx">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIdx) in seg.tableRows" :key="rowIdx">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <td v-for="(cell, cellIdx) in row" :key="cellIdx" v-html="formatTableCell(cell)"></td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="seg.isSystem" class="system-message">
          <pre><TextHighlight :text="seg.text" :query="query" /></pre>
        </div>
        <div v-else-if="seg.className === 'image-prompt'" class="image-prompt-block">
          <pre class="image-prompt">
            <TextHighlight :text="seg.text" :query="query" />
          </pre>
          <div class="image-prompt-actions">
            <button
              type="button"
              class="image-prompt-action-btn primary"
              :disabled="getImagePromptUi(seg.text ?? '').isLoading"
              @click="onGenerateImageRequest(seg.text ?? '')"
            >
              {{ getImagePromptUi(seg.text ?? '').isLoading ? '生图中…' : '生图' }}
            </button>
            <button type="button" class="image-prompt-action-btn" @click="onCopyImagePrompt(seg.text ?? '')">复制提示词</button>
            <span
              v-if="getImagePromptUi(seg.text ?? '').message"
              class="image-prompt-status"
              :class="`is-${getImagePromptUi(seg.text ?? '').level}`"
            >
              {{ getImagePromptUi(seg.text ?? '').message }}
            </span>
          </div>
        </div>
        <span v-else :class="seg.className"><TextHighlight :text="seg.text" :query="query" /></span>
      </template>
    </div>

    <div v-else class="story-pane story-modules">
      <div v-if="metaBlocks.length === 0" class="story-modules-empty">当前楼层没有额外模块（如 profile / meow_FM）。</div>
      <details v-for="block in metaBlocks" :key="block.key" class="meta-block">
        <summary class="meta-block-title">
          <span>{{ block.title }}</span>
          <span class="meta-block-tag">{{ block.tag }}</span>
        </summary>
        <pre class="meta-block-body"><TextHighlight :text="block.content" :query="query" /></pre>
      </details>
    </div>

    <div v-if="imagePreview" class="story-image-preview-overlay" role="dialog" aria-modal="true" @click.self="closeImagePreview">
      <div class="story-image-preview-panel">
        <div class="story-image-preview-toolbar">
          <span class="story-image-preview-title">{{ imagePreview.alt || '图片预览' }}</span>
          <button type="button" class="story-image-preview-close" @click="closeImagePreview">关闭</button>
        </div>
        <div class="story-image-preview-media-wrap">
          <img :src="imagePreview.src" :alt="imagePreview.alt || '图片预览'" class="story-image-preview-media" />
        </div>
      </div>
    </div>

    <div
      v-if="imagePromptEditor"
      class="story-prompt-editor-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="closeImagePromptEditor"
    >
      <div class="story-prompt-editor-panel">
        <h3 class="story-prompt-editor-title">编辑生图提示词</h3>
        <label class="story-prompt-editor-field">
          <span>前缀标签</span>
          <input v-model="imagePromptEditorTag" type="text" maxlength="32" placeholder="image" />
        </label>
        <label class="story-prompt-editor-field">
          <span>提示词</span>
          <textarea
            v-model="imagePromptEditorValue"
            rows="6"
            placeholder="输入新的提示词，点击“应用并生图”后会直接请求重绘"
          />
        </label>
        <p v-if="imagePromptEditorError" class="story-prompt-editor-error">{{ imagePromptEditorError }}</p>
        <div class="story-prompt-editor-actions">
          <button type="button" class="story-prompt-editor-btn" @click="closeImagePromptEditor">取消</button>
          <button type="button" class="story-prompt-editor-btn primary" @click="onApplyImagePromptEditor">应用并生图</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import TextHighlight from './TextHighlight.vue';

type Segment = {
  key: string;
  text?: string;
  className?: string;
  isImage?: boolean;
  imageUrl?: string;
  altText?: string;
  imagePromptRaw?: string;
  isTable?: boolean;
  tableHeaders?: string[];
  tableRows?: string[][];
  isSystem?: boolean;
};
type SegmentKind = 'narrative' | 'dialog' | 'system' | 'table' | 'image' | 'image_prompt';
type StoryTab = 'story' | 'modules';
type MetaBlock = {
  key: string;
  tag: string;
  title: string;
  content: string;
};

const props = withDefaults(
  defineProps<{
    raw: string;
    query?: string;
  }>(),
  {
    query: '',
  },
);
const query = computed(() => props.query ?? '');
const storyTabs = computed<ReadonlyArray<{ key: StoryTab; label: string; count: number }>>(() => [
  { key: 'story', label: '正文', count: filteredSegments.value.length },
  { key: 'modules', label: '模块', count: metaBlocks.value.length },
]);

const activeStoryTab = useLocalStorage<StoryTab>('eden:story_active_tab', 'story');
const isFilterExpanded = useLocalStorage<boolean>('eden:story_filter_expanded', false);
const storyZoom = useLocalStorage<number>('eden:story_zoom', 1);
const enabledSegmentKinds = useLocalStorage<SegmentKind[]>('eden:story_segment_kinds', [
  'narrative',
  'dialog',
  'system',
  'table',
  'image',
  'image_prompt',
]);
const zoomPercent = computed(() => Math.round(storyZoom.value * 100));
const storyContentStyle = computed<Record<string, string>>(() => ({
  '--story-font-size': `${storyZoom.value.toFixed(2)}em`,
}));

function zoomIn() {
  storyZoom.value = _.clamp(Number((storyZoom.value + 0.08).toFixed(2)), 0.84, 1.32);
}

function zoomOut() {
  storyZoom.value = _.clamp(Number((storyZoom.value - 0.08).toFixed(2)), 0.84, 1.32);
}

type ResolvedDisplayedImage = {
  src: string;
  alt: string;
};

type ImagePromptUiLevel = 'idle' | 'loading' | 'success' | 'error';
type ImagePromptUiState = {
  isLoading: boolean;
  message: string;
  level: ImagePromptUiLevel;
};

type GenerateImageRequestPayload = {
  id: string;
  prompt: string;
  width: number | null;
  height: number | null;
  change?: string | null;
};

type GenerateImageResponsePayload = {
  id?: string;
  success?: boolean;
  imageData?: string;
  error?: string;
  prompt?: string;
  change?: string;
};

type GenerateImageResponseHandler = (responseData: GenerateImageResponsePayload) => void;
type GenerateImageRequestOptions = {
  promptOverride?: string;
  // 插件支持 change 覆盖/追加提示词，默认不传，仅在显式需要时发送。
  changeOverride?: string;
};
type ImagePromptOverride = {
  tag: string;
  prompt: string;
};
type ImagePreviewState = {
  src: string;
  alt: string;
};
type ImagePromptEditorState = {
  rawPrompt: string;
};
type Chatu8RuntimeConfig = {
  startTag: string;
  endTag: string;
  hideButton: boolean;
  clickToPreview: boolean;
  longPressToEdit: boolean;
  imageAlignment: 'left' | 'center' | 'right';
};
type Chatu8StorageImageItem = {
  uuid?: string;
  path?: string;
  thumbnail_uuid?: string;
  thumbnail_path?: string;
  date?: number;
};
type Chatu8StorageEntry = {
  images?: Chatu8StorageImageItem[];
  index?: number;
  change?: string;
};

const EventType = {
  GENERATE_IMAGE_REQUEST: 'generate-image-request',
  GENERATE_IMAGE_RESPONSE: 'generate-image-response',
} as const;

const IMAGE_TAG_HINTS = ['image', 'img', 'sd', 'draw', 'paint', 'picture', 'pic', '生图', '绘图', '图片', '插画'];

// 生图插件升级后，图片可能不再写回到消息“原始文本”里，而是只在酒馆的“显示层 DOM”里插入 <img>。
// 因此这里尝试从 retrieveDisplayedMessage(message_id) 中，把 xxx###...### 对应的图片 src 解析出来。
const resolvedImagesByPrompt = ref<Record<string, ResolvedDisplayedImage[]>>({});
const generatedImagesByPrompt = ref<Record<string, ResolvedDisplayedImage[]>>({});
const imagePromptUi = ref<Record<string, ImagePromptUiState>>({});
const imagePromptOverrides = ref<Record<string, ImagePromptOverride>>({});
const imagePreview = ref<ImagePreviewState | null>(null);
const imagePromptEditor = ref<ImagePromptEditorState | null>(null);
const imagePromptEditorTag = ref('image');
const imagePromptEditorValue = ref('');
const imagePromptEditorError = ref('');
const imagePromptRequestHandlers = new Map<string, GenerateImageResponseHandler>();
const imagePromptRequestTimers = new Map<string, number>();
const chatu8Runtime = ref<Chatu8RuntimeConfig>({
  startTag: '',
  endTag: '',
  hideButton: false,
  clickToPreview: true,
  longPressToEdit: true,
  imageAlignment: 'center',
});
let chatu8RuntimeTimer: number | null = null;
let storyImageClickTimer: number | null = null;
let storyImageLongPressTimer: number | null = null;
let storyImageIgnoreClickUntil = 0;

function normalizeForMatch(s: string): string {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeImageMap(
  base: Record<string, ResolvedDisplayedImage[]>,
  extra: Record<string, ResolvedDisplayedImage[]>,
): Record<string, ResolvedDisplayedImage[]> {
  const out: Record<string, ResolvedDisplayedImage[]> = { ...(base ?? {}) };
  for (const [prompt, list] of Object.entries(extra ?? {})) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const prev = Array.isArray(out[prompt]) ? out[prompt] : [];
    const merged = [...prev];
    const seen = new Set(prev.map(it => `${it.src}@@${it.alt}`));
    for (const item of list) {
      if (!item?.src) continue;
      const key = `${item.src}@@${item.alt ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ src: item.src, alt: item.alt ?? '' });
    }
    out[prompt] = merged;
  }
  return out;
}

function mergeImageMapWithPriority(
  primary: Record<string, ResolvedDisplayedImage[]>,
  fallback: Record<string, ResolvedDisplayedImage[]>,
  keys: string[],
): Record<string, ResolvedDisplayedImage[]> {
  const out: Record<string, ResolvedDisplayedImage[]> = {};
  for (const key of keys) {
    const preferred = primary[key];
    if (Array.isArray(preferred) && preferred.length > 0) {
      out[key] = preferred;
      continue;
    }
    const backup = fallback[key];
    if (Array.isArray(backup) && backup.length > 0) {
      out[key] = backup;
    }
  }
  return out;
}

function getImagePromptUi(rawPrompt: string): ImagePromptUiState {
  return (
    imagePromptUi.value?.[rawPrompt] ?? {
      isLoading: false,
      message: '',
      level: 'idle',
    }
  );
}

function setImagePromptUi(rawPrompt: string, patch: Partial<ImagePromptUiState>) {
  const prev = getImagePromptUi(rawPrompt);
  imagePromptUi.value = {
    ...(imagePromptUi.value ?? {}),
    [rawPrompt]: {
      ...prev,
      ...patch,
    },
  };
}

function readHostWindow(): (Window & typeof globalThis) | null {
  try {
    if (window.parent && window.parent !== window) return window.parent as Window & typeof globalThis;
  } catch {
    // ignore
  }
  return window;
}

function readHostDocument(): Document | null {
  const hostWindow = readHostWindow();
  if (hostWindow?.document) return hostWindow.document;
  return typeof document !== 'undefined' ? document : null;
}

function readHostInputValue(doc: Document, id: string): string | null {
  const el = doc.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) return null;
  return String(el.value ?? '').trim();
}

function readHostCheckboxValue(doc: Document, id: string): boolean | null {
  const el = doc.getElementById(id) as HTMLInputElement | null;
  if (!el || el.type !== 'checkbox') return null;
  return Boolean(el.checked);
}

function coerceBooleanSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function readChatu8ExtensionSettings(): Record<string, any> | null {
  const hostWindow = readHostWindow() as any;
  try {
    const ctx = hostWindow?.SillyTavern?.getContext?.();
    const ext = ctx?.extensionSettings?.['st-chatu8'];
    if (!ext || typeof ext !== 'object') return null;
    return ext as Record<string, any>;
  } catch {
    return null;
  }
}

function readChatu8RuntimeConfig(): Chatu8RuntimeConfig {
  const defaults: Chatu8RuntimeConfig = {
    startTag: '',
    endTag: '',
    hideButton: false,
    clickToPreview: true,
    longPressToEdit: true,
    imageAlignment: 'center',
  };
  const ext = readChatu8ExtensionSettings();

  let startTag = String(ext?.startTag ?? defaults.startTag).trim();
  let endTag = String(ext?.endTag ?? defaults.endTag).trim();
  let hideButton = coerceBooleanSetting(ext?.dbclike, defaults.hideButton);
  let clickToPreview = coerceBooleanSetting(ext?.clickToPreview, defaults.clickToPreview);
  let longPressToEdit = coerceBooleanSetting(ext?.longPressToEdit, defaults.longPressToEdit);
  let alignRaw = String(ext?.imageAlignment ?? defaults.imageAlignment).trim().toLowerCase();

  const hostDoc = readHostDocument();
  if (hostDoc) {
    const startTagFromDom = readHostInputValue(hostDoc, 'startTag');
    const endTagFromDom = readHostInputValue(hostDoc, 'endTag');
    const hideFromDom = readHostCheckboxValue(hostDoc, 'dbclike');
    const previewFromDom = readHostCheckboxValue(hostDoc, 'clickToPreview');
    const longPressFromDom = readHostCheckboxValue(hostDoc, 'longPressToEdit');
    const alignFromDom = readHostInputValue(hostDoc, 'imageAlignment');

    if (startTagFromDom !== null) startTag = startTagFromDom;
    if (endTagFromDom !== null) endTag = endTagFromDom;
    if (hideFromDom !== null) hideButton = hideFromDom;
    if (previewFromDom !== null) clickToPreview = previewFromDom;
    if (longPressFromDom !== null) longPressToEdit = longPressFromDom;
    if (alignFromDom !== null) alignRaw = alignFromDom.toLowerCase();
  }

  const imageAlignment: Chatu8RuntimeConfig['imageAlignment'] = alignRaw === 'left' || alignRaw === 'right' ? alignRaw : 'center';

  return {
    startTag,
    endTag,
    hideButton,
    clickToPreview,
    longPressToEdit,
    imageAlignment,
  };
}

function refreshChatu8RuntimeConfig() {
  chatu8Runtime.value = readChatu8RuntimeConfig();
}

function normalizePromptTag(rawTag: string): string {
  return String(rawTag ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function getConfiguredImagePromptTags(): string[] {
  const tags: string[] = [];

  const fromRuntime = String(chatu8Runtime.value.startTag ?? '').trim();
  if (fromRuntime) {
    tags.push(extractTagFromStartTag(fromRuntime));
  }

  try {
    const fromGlobal = (globalThis as any)?.CHTU8_IMAGE_PROMPT_TAGS;
    if (Array.isArray(fromGlobal)) tags.push(...fromGlobal.map((x: any) => String(x ?? '')).filter(Boolean));
  } catch {
    // ignore
  }

  try {
    const fromWindow = (window as any)?.chatu8ImagePromptTags;
    if (Array.isArray(fromWindow)) tags.push(...fromWindow.map((x: any) => String(x ?? '')).filter(Boolean));
  } catch {
    // ignore
  }

  return Array.from(new Set(tags.map(x => String(x ?? '').trim()).filter(Boolean)));
}

function extractTagFromStartTag(startTag: string): string {
  const raw = String(startTag ?? '').trim();
  if (!raw) return '';

  // 常见格式：image### 或 tag###，提取左侧 token 作为 tag。
  if (raw.includes('###')) {
    return String(raw.split('###')[0] ?? '').trim() || raw;
  }
  return raw;
}

function isLikelyImagePromptTag(tag: string): boolean {
  const normalized = normalizePromptTag(tag);
  if (!normalized) return false;

  const configured = getConfiguredImagePromptTags().map(normalizePromptTag);
  if (configured.length > 0) return configured.includes(normalized);

  if (IMAGE_TAG_HINTS.some(hint => normalized.includes(normalizePromptTag(hint)))) return true;

  // 插件允许自定义前缀标签，默认回退为“任意 token###...### 都视为生图请求”。
  return true;
}

function collectImagePromptMatches(input: string): Array<{ raw: string; tag: string; prompt: string; index: number }> {
  const text = String(input ?? '');
  const out: Array<{ raw: string; tag: string; prompt: string; index: number }> = [];
  const seen = new Set<string>();

  const configuredStart = String(chatu8Runtime.value.startTag ?? '').trim();
  const configuredEnd = String(chatu8Runtime.value.endTag ?? '').trim();
  if (configuredStart && configuredEnd) {
    let cursor = 0;
    while (cursor < text.length) {
      const startIndex = text.indexOf(configuredStart, cursor);
      if (startIndex < 0) break;
      const promptStart = startIndex + configuredStart.length;
      const endIndex = text.indexOf(configuredEnd, promptStart);
      if (endIndex < 0) break;
      const raw = text.slice(startIndex, endIndex + configuredEnd.length);
      const prompt = text.slice(promptStart, endIndex).trim();
      const tag = extractTagFromStartTag(configuredStart) || 'image';
      if (prompt) {
        const key = `${startIndex}@@${raw}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ raw, tag, prompt, index: startIndex });
        }
      }
      cursor = endIndex + configuredEnd.length;
    }
  }

  // fallback：兼容旧格式 token###...###。
  const re = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0] ?? '';
    const tag = m[1] ?? '';
    const prompt = (m[2] ?? '').trim();
    const index = m.index ?? -1;
    if (index < 0) continue;
    if (!raw || !prompt) continue;
    if (!isLikelyImagePromptTag(tag)) continue;
    const key = `${index}@@${raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ raw, tag, prompt, index });
  }

  return out.sort((a, b) => a.index - b.index);
}

function clearImagePromptRequest(rawPrompt: string) {
  const handler = imagePromptRequestHandlers.get(rawPrompt);
  if (handler) {
    try {
      if (typeof eventRemoveListener === 'function') {
        eventRemoveListener(EventType.GENERATE_IMAGE_RESPONSE, handler as any);
      }
    } catch {
      // ignore
    }
    imagePromptRequestHandlers.delete(rawPrompt);
  }
  const timer = imagePromptRequestTimers.get(rawPrompt);
  if (typeof timer === 'number') {
    window.clearTimeout(timer);
    imagePromptRequestTimers.delete(rawPrompt);
  }
}

function parseImagePromptBody(rawPrompt: string): string {
  const first = collectImagePromptMatches(rawPrompt)[0];
  return first?.prompt ?? '';
}

function parseImagePromptToken(rawPrompt: string): { tag: string; prompt: string } | null {
  const first = collectImagePromptMatches(rawPrompt)[0];
  if (!first) return null;
  return {
    tag: String(first.tag ?? '').trim() || 'image',
    prompt: String(first.prompt ?? '').trim(),
  };
}

function makeImageRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getEffectiveImagePrompt(rawPrompt: string): string {
  const edited = imagePromptOverrides.value?.[rawPrompt]?.prompt;
  if (edited) return String(edited ?? '').trim();
  return parseImagePromptBody(rawPrompt);
}

function getEffectiveImageTag(rawPrompt: string): string {
  const edited = imagePromptOverrides.value?.[rawPrompt]?.tag;
  if (edited) return String(edited ?? '').trim();
  const parsed = parseImagePromptToken(rawPrompt)?.tag;
  return String(parsed ?? 'image').trim() || 'image';
}

function getSegmentRawPrompt(seg: Segment): string {
  const raw = String(seg.imagePromptRaw ?? '').trim();
  if (raw) return raw;
  const alt = String(seg.altText ?? '').trim();
  if (!alt) return '';
  return collectImagePromptMatches(alt)[0]?.raw ?? '';
}

function getSegmentPromptKey(seg: Segment): string {
  const raw = getSegmentRawPrompt(seg);
  if (raw) return raw;
  const seed = String(seg.key ?? seg.imageUrl ?? '').trim() || 'story-image';
  return `__manual__${encodeURIComponent(seed)}`;
}

function getSegmentPromptUi(seg: Segment): ImagePromptUiState {
  return getImagePromptUi(getSegmentPromptKey(seg));
}

function shouldShowGenerateFab(): boolean {
  return !chatu8Runtime.value.hideButton;
}

function getImageWrapAlignmentClass(): string {
  const align = chatu8Runtime.value.imageAlignment;
  if (align === 'left') return 'align-left';
  if (align === 'right') return 'align-right';
  return 'align-center';
}

function getStoryImageTitle(seg: Segment): string {
  const parts: string[] = [];
  if (chatu8Runtime.value.clickToPreview) parts.push('单击预览');
  parts.push('双击重新生图');
  if (chatu8Runtime.value.longPressToEdit) parts.push('长按编辑提示词');
  const detail = parts.join(' · ');
  return detail || String(seg.altText ?? '').trim();
}

async function onGenerateImageRequest(rawPrompt: string, options: GenerateImageRequestOptions = {}) {
  const effectivePrompt = String(options.promptOverride ?? getEffectiveImagePrompt(rawPrompt)).trim();
  if (!effectivePrompt) {
    setImagePromptUi(rawPrompt, { isLoading: false, message: '提示词为空', level: 'error' });
    toastr?.warning?.('提示词为空，无法生图');
    return;
  }

  if (typeof eventEmit !== 'function' || typeof eventOn !== 'function' || typeof eventRemoveListener !== 'function') {
    setImagePromptUi(rawPrompt, { isLoading: false, message: '宿主未注入事件接口', level: 'error' });
    toastr?.error?.('当前环境不支持插件生图事件');
    return;
  }

  clearImagePromptRequest(rawPrompt);
  const requestId = makeImageRequestId();
  const originalPrompt = parseImagePromptBody(rawPrompt);
  const promptOverride = String(options.promptOverride ?? '').trim();
  const changeOverride = String(options.changeOverride ?? '').trim();

  // 兼容 st-chatu8: 当传入“覆盖提示词”时，优先走 prompt + change 协议。
  let requestPrompt = effectivePrompt;
  let requestChange: string | null = null;
  if (changeOverride) {
    requestChange = changeOverride;
  } else if (promptOverride && originalPrompt && promptOverride !== originalPrompt) {
    requestPrompt = originalPrompt;
    requestChange = promptOverride;
  }

  const payload: GenerateImageRequestPayload = {
    id: requestId,
    prompt: requestPrompt,
    width: null,
    height: null,
    change: requestChange,
  };

  setImagePromptUi(rawPrompt, { isLoading: true, message: '已发送生图请求，等待响应…', level: 'loading' });

  const imageResponseHandler: GenerateImageResponseHandler = (responseData: GenerateImageResponsePayload) => {
    if (!responseData || responseData.id !== requestId) return;

    try {
      eventRemoveListener(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler as any);
    } catch {
      // ignore
    }

    clearImagePromptRequest(rawPrompt);
    const { success, imageData, error, prompt: responsePrompt, change: responseChange } = responseData;

    if (success && imageData) {
      const displayPrompt = String(responseChange ?? responsePrompt ?? requestChange ?? effectivePrompt ?? '').trim();
      generatedImagesByPrompt.value = {
        ...(generatedImagesByPrompt.value ?? {}),
        [rawPrompt]: [{ src: imageData, alt: displayPrompt ? `生成图片：${displayPrompt}` : '生成图片' }],
      };
      setImagePromptUi(rawPrompt, { isLoading: false, message: '生图完成', level: 'success' });
      scheduleResize();
      return;
    }

    const reason = String(error ?? '生图失败');
    setImagePromptUi(rawPrompt, { isLoading: false, message: reason, level: 'error' });
  };

  eventOn(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler as any);

  imagePromptRequestHandlers.set(rawPrompt, imageResponseHandler);
  imagePromptRequestTimers.set(
    rawPrompt,
    window.setTimeout(() => {
      clearImagePromptRequest(rawPrompt);
      setImagePromptUi(rawPrompt, { isLoading: false, message: '生图超时，请重试', level: 'error' });
    }, 90_000),
  );

  try {
    await eventEmit(EventType.GENERATE_IMAGE_REQUEST, payload as any);
  } catch (error) {
    clearImagePromptRequest(rawPrompt);
    const reason = error instanceof Error ? error.message : String(error ?? '发送请求失败');
    setImagePromptUi(rawPrompt, { isLoading: false, message: reason, level: 'error' });
  }
}

async function onCopyImagePrompt(rawPrompt: string) {
  const prompt = getEffectiveImagePrompt(rawPrompt);
  if (!prompt) {
    toastr?.warning?.('提示词为空');
    return;
  }

  try {
    await navigator.clipboard.writeText(prompt);
    toastr?.success?.('提示词已复制');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = prompt;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toastr?.success?.('提示词已复制');
  }
}

function clearStoryImageClickTimer() {
  if (storyImageClickTimer !== null) {
    window.clearTimeout(storyImageClickTimer);
    storyImageClickTimer = null;
  }
}

function clearStoryImageLongPressTimer() {
  if (storyImageLongPressTimer !== null) {
    window.clearTimeout(storyImageLongPressTimer);
    storyImageLongPressTimer = null;
  }
}

function openImagePreview(seg: Segment) {
  const src = String(seg.imageUrl ?? '').trim();
  if (!src) return;
  imagePreview.value = {
    src,
    alt: String(seg.altText ?? '').trim(),
  };
}

function closeImagePreview() {
  imagePreview.value = null;
}

function openImagePromptEditor(seg: Segment) {
  const rawPrompt = getSegmentPromptKey(seg);
  const parsedRaw = getSegmentRawPrompt(seg);
  const prompt = getEffectiveImagePrompt(rawPrompt);
  imagePromptEditor.value = { rawPrompt };
  imagePromptEditorTag.value = getEffectiveImageTag(rawPrompt || parsedRaw || 'image');
  imagePromptEditorValue.value = prompt || '';
  imagePromptEditorError.value = '';
}

function closeImagePromptEditor() {
  imagePromptEditor.value = null;
  imagePromptEditorError.value = '';
}

async function onApplyImagePromptEditor() {
  const editor = imagePromptEditor.value;
  if (!editor) return;

  const tag = String(imagePromptEditorTag.value ?? '').trim() || 'image';
  const prompt = String(imagePromptEditorValue.value ?? '').trim();
  if (!prompt) {
    imagePromptEditorError.value = '提示词不能为空';
    return;
  }

  imagePromptOverrides.value = {
    ...(imagePromptOverrides.value ?? {}),
    [editor.rawPrompt]: {
      tag,
      prompt,
    },
  };

  closeImagePromptEditor();
  await onGenerateImageRequest(editor.rawPrompt, { promptOverride: prompt, changeOverride: prompt });
}

function onStoryImageClick(seg: Segment) {
  if (!chatu8Runtime.value.clickToPreview) return;
  if (Date.now() < storyImageIgnoreClickUntil) return;
  clearStoryImageClickTimer();
  storyImageClickTimer = window.setTimeout(() => {
    openImagePreview(seg);
    storyImageClickTimer = null;
  }, 220);
}

function onStoryImagePointerDown(seg: Segment, event: PointerEvent) {
  if (!chatu8Runtime.value.longPressToEdit) return;
  if (Date.now() < storyImageIgnoreClickUntil) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const rawPrompt = String(seg.imagePromptRaw ?? '').trim();
  if (!rawPrompt) return;

  clearStoryImageLongPressTimer();
  storyImageLongPressTimer = window.setTimeout(() => {
    storyImageIgnoreClickUntil = Date.now() + 320;
    clearStoryImageClickTimer();
    openImagePromptEditor(seg);
    storyImageLongPressTimer = null;
  }, 560);
}

function onStoryImagePointerUp() {
  clearStoryImageLongPressTimer();
}

function onStoryImageDoubleClick(seg: Segment) {
  clearStoryImageClickTimer();
  clearStoryImageLongPressTimer();
  storyImageIgnoreClickUntil = Date.now() + 320;
  closeImagePreview();
  const rawPrompt = getSegmentRawPrompt(seg);
  if (!rawPrompt) {
    openImagePromptEditor(seg);
    return;
  }
  onGenerateImageRequest(rawPrompt);
}

function onStoryImageGenerate(seg: Segment) {
  const rawPrompt = getSegmentRawPrompt(seg);
  if (!rawPrompt) {
    openImagePromptEditor(seg);
    return;
  }
  onGenerateImageRequest(rawPrompt);
}

function findNextImageElement(start: Element): HTMLImageElement | null {
  // 先从当前元素的后续兄弟节点开始找 img；若没找到，则向上逐层父节点扩展范围。
  let cur: Element | null = start;
  while (cur) {
    let sib = cur.nextElementSibling;
    while (sib) {
      if (sib.tagName === 'IMG') return sib as HTMLImageElement;
      const inner = sib.querySelector?.('img');
      if (inner) return inner as HTMLImageElement;
      sib = sib.nextElementSibling;
    }
    cur = cur.parentElement;
  }
  return null;
}

function getImageSrc(img: HTMLImageElement): string {
  const attrSrc = (img.getAttribute('src') ?? '').trim();
  if (attrSrc) return attrSrc;
  const dataSrc = (img.getAttribute('data-src') ?? '').trim();
  if (dataSrc) return dataSrc;
  const current = (img.currentSrc ?? '').trim();
  if (current) return current;
  return '';
}

function isRenderableStoryImage(img: HTMLImageElement): boolean {
  const src = getImageSrc(img);
  if (!src) return false;
  const lower = src.toLowerCase();
  if (lower.startsWith('about:blank')) return false;
  if (lower.includes('/thumbnail?type=avatar')) return false;
  if (lower.includes('/thumbnail?type=persona')) return false;

  // 排除头像及消息操作区图片，避免把头像/图标误识别为正文生图结果。
  const blockedContainer = img.closest('.avatar, .mesAvatarWrapper, .mes_buttons, .swipe_left, .swipe_right');
  if (blockedContainer) return false;

  return true;
}

function toResolvedDisplayedImage(img: HTMLImageElement): ResolvedDisplayedImage {
  return {
    src: getImageSrc(img),
    alt: (img.getAttribute('alt') ?? img.getAttribute('title') ?? '').trim(),
  };
}

function collectRenderableStoryImages(root: HTMLElement): ResolvedDisplayedImage[] {
  const out: ResolvedDisplayedImage[] = [];
  const seen = new Set<string>();

  for (const node of Array.from(root.querySelectorAll('img'))) {
    const img = node as HTMLImageElement;
    if (!isRenderableStoryImage(img)) continue;
    const item = toResolvedDisplayedImage(img);
    if (!item.src || seen.has(item.src)) continue;
    seen.add(item.src);
    out.push(item);
  }

  return out;
}

function getChatu8PromptHashCandidates(rawPrompt: string): string[] {
  const body = parseImagePromptBody(rawPrompt);
  const normalized = normalizeForMatch(body);
  const compact = String(body ?? '').replace(/[ \t]+\n/g, '\n').trim();
  const withoutWhitespace = String(body ?? '').replace(/\s+/g, '');
  return Array.from(new Set([body, normalized, compact, withoutWhitespace].map(x => String(x ?? '').trim()).filter(Boolean)));
}

function readChatu8StorageMap(): Record<string, Chatu8StorageEntry> {
  const ext = readChatu8ExtensionSettings();
  const storage = ext?.jiuguanStorage;
  if (!storage || typeof storage !== 'object') return {};
  return storage as Record<string, Chatu8StorageEntry>;
}

function hashPromptForChatu8(input: string): string | null {
  if (!input) return null;
  const hostWindow = readHostWindow() as any;
  const cryptoJs = hostWindow?.CryptoJS ?? (window as any)?.CryptoJS;
  if (typeof cryptoJs?.MD5 !== 'function') return null;
  try {
    return String(cryptoJs.MD5(String(input)));
  } catch {
    return null;
  }
}

function normalizeStoredImageSrc(src: string): string {
  const s = String(src ?? '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  return `/${s.replace(/^\/+/, '')}`;
}

function resolveImageFromStorageEntry(entry: Chatu8StorageEntry): ResolvedDisplayedImage[] {
  const images = Array.isArray(entry?.images) ? entry.images : [];
  if (images.length === 0) return [];

  const rawIndex = Number(entry?.index);
  const index = Number.isFinite(rawIndex) ? _.clamp(Math.trunc(rawIndex), 0, images.length - 1) : images.length - 1;
  const selected = images[index] ?? images[images.length - 1];
  const src = normalizeStoredImageSrc(selected?.path ?? selected?.thumbnail_path ?? '');
  if (!src) return [];

  return [{ src, alt: '缓存图片' }];
}

function tokenizePromptForCacheSearch(prompt: string): string[] {
  const normalized = normalizeForMatch(prompt).toLowerCase();
  if (!normalized) return [];
  const parts = normalized.split(/[\s,，;；|/]+/g);
  const tokens = parts.filter(token => token.length >= 3 && /[a-z0-9\u4e00-\u9fa5]/i.test(token));
  return Array.from(new Set(tokens)).slice(0, 12);
}

function scoreCacheEntryByPrompt(promptNorm: string, tokens: string[], changeNorm: string): number {
  if (!promptNorm || !changeNorm) return 0;
  if (changeNorm === promptNorm) return 200;
  if (changeNorm.includes(promptNorm)) return 120;

  let score = 0;
  if (promptNorm.length >= 24) {
    const head = promptNorm.slice(0, 48);
    if (changeNorm.includes(head)) score += 8;
  }
  for (const token of tokens) {
    if (changeNorm.includes(token)) score += token.length >= 8 ? 2 : 1;
  }
  return score;
}

function resolveImagesFromChatu8Cache(prompts: string[]) {
  if (!prompts.length) return {};
  const storageMap = readChatu8StorageMap();
  const entries = Object.entries(storageMap);
  if (entries.length === 0) return {};

  const out: Record<string, ResolvedDisplayedImage[]> = {};
  const usedStorageKeys = new Set<string>();

  for (const rawPrompt of prompts) {
    const candidates = getChatu8PromptHashCandidates(rawPrompt);
    for (const candidate of candidates) {
      const hash = hashPromptForChatu8(candidate);
      if (!hash) continue;
      const entry = storageMap[hash];
      if (!entry) continue;
      const list = resolveImageFromStorageEntry(entry);
      if (!list.length) continue;
      out[rawPrompt] = list;
      usedStorageKeys.add(hash);
      break;
    }
  }

  const unresolved = prompts.filter(prompt => !out[prompt]);
  if (unresolved.length === 0) return out;

  const searchable = entries
    .map(([key, entry]) => ({
      key,
      entry,
      changeNorm: normalizeForMatch(entry?.change ?? '').toLowerCase(),
    }))
    .filter(item => item.changeNorm.length > 0);

  for (const rawPrompt of unresolved) {
    const promptBody = parseImagePromptBody(rawPrompt);
    const promptNorm = normalizeForMatch(promptBody).toLowerCase();
    if (!promptNorm) continue;
    const tokens = tokenizePromptForCacheSearch(promptBody);
    if (!tokens.length) continue;

    let best:
      | {
          key: string;
          entry: Chatu8StorageEntry;
          score: number;
        }
      | null = null;

    for (const item of searchable) {
      if (usedStorageKeys.has(item.key)) continue;
      const score = scoreCacheEntryByPrompt(promptNorm, tokens, item.changeNorm);
      if (!best || score > best.score) {
        best = {
          key: item.key,
          entry: item.entry,
          score,
        };
      }
    }

    if (!best) continue;
    const threshold = Math.max(2, Math.min(7, Math.ceil(tokens.length * 0.45)));
    if (best.score < threshold) continue;

    const list = resolveImageFromStorageEntry(best.entry);
    if (!list.length) continue;
    out[rawPrompt] = list;
    usedStorageKeys.add(best.key);
  }

  return out;
}

function resolveImagesFromDisplayedMessage(messageId: number | null, prompts: string[]) {
  if (!messageId || !Number.isFinite(messageId)) return {};
  if (typeof retrieveDisplayedMessage !== 'function') return {};

  const $mes = retrieveDisplayedMessage(messageId);
  const root = $mes?.get?.(0) as HTMLElement | undefined;
  if (!root) return {};
  const availableImages = collectRenderableStoryImages(root);
  const stChatu8Buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
  const stChatu8PromptToImage = stChatu8Buttons
    .map(btn => {
      const prompt = String(btn.getAttribute('data-image-tag') ?? btn.getAttribute('data-link') ?? '').trim();
      if (!prompt) return null;

      const requestId = String(btn.dataset.requestId ?? btn.getAttribute('data-request-id') ?? '').trim();
      let img: HTMLImageElement | null = null;

      if (requestId) {
        const spans = Array.from(root.querySelectorAll('.st-chatu8-image-span')) as HTMLElement[];
        const span = spans.find(node => String(node.dataset.requestId ?? '').trim() === requestId) ?? null;
        const candidate = span?.querySelector('img') as HTMLImageElement | null;
        if (candidate && isRenderableStoryImage(candidate)) img = candidate;
      }
      if (!img) {
        const candidate = findNextImageElement(btn);
        if (candidate && isRenderableStoryImage(candidate)) img = candidate;
      }
      if (!img) return null;

      return {
        promptNorm: normalizeForMatch(prompt),
        image: toResolvedDisplayedImage(img),
      };
    })
    .filter(Boolean) as Array<{ promptNorm: string; image: ResolvedDisplayedImage }>;

  const promptEls = Array.from(root.querySelectorAll('pre, code, p, div, span')).filter(el =>
    normalizeForMatch(el.textContent ?? '').includes('###'),
  );

  const out: Record<string, ResolvedDisplayedImage[]> = {};

  for (const rawPrompt of prompts) {
    const needle = normalizeForMatch(rawPrompt);
    if (!needle) continue;
    const bodyNeedle = normalizeForMatch(parseImagePromptBody(rawPrompt));

    const mappedByButton = stChatu8PromptToImage.find(item => {
      if (!item.promptNorm) return false;
      if (bodyNeedle && item.promptNorm.includes(bodyNeedle)) return true;
      if (bodyNeedle && bodyNeedle.includes(item.promptNorm)) return true;
      return item.promptNorm.includes(needle) || needle.includes(item.promptNorm);
    });
    if (mappedByButton) {
      out[rawPrompt] = [mappedByButton.image];
      continue;
    }

    const el = promptEls.find(node => normalizeForMatch(node.textContent ?? '').includes(needle));
    if (!el) continue;

    // 优先取当前节点内的图片（常见结构：<p><img ...>xxx###...###</p>）
    const sameNodeImgs = [
      ...(el.tagName === 'IMG' ? [el as HTMLImageElement] : []),
      ...Array.from(el.querySelectorAll('img')).map(node => node as HTMLImageElement),
    ];
    let img = sameNodeImgs.find(candidate => isRenderableStoryImage(candidate)) ?? null;
    if (!img) {
      const next = findNextImageElement(el);
      if (next && isRenderableStoryImage(next)) img = next;
    }
    if (!img) continue;

    out[rawPrompt] = [toResolvedDisplayedImage(img)];
  }

  // fallback：若按“提示词邻近”没匹配到，使用正文可用图片按顺序兜底。
  const missing = prompts.filter(p => !out[p]);
  if (missing.length > 0 && availableImages.length > 0) {
    const usedSrc = new Set(Object.values(out).flatMap(list => list.map(it => it.src)));
    const candidates = availableImages.filter(it => !usedSrc.has(it.src));
    const max = Math.min(missing.length, candidates.length);
    for (let i = 0; i < max; i++) {
      out[missing[i]] = [candidates[i]];
    }
  }

  return out;
}

const segments = computed<Segment[]>(() => {
  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const text = normalizeStoryText(mainText);

  if (!text.trim()) return [{ key: 'empty', text: '(暂无正文)' }];
  const segs = buildSegments(text);

  const mapped = mergeImageMap(resolvedImagesByPrompt.value ?? {}, generatedImagesByPrompt.value ?? {});
  const out: Segment[] = [];
  let id = 0;
  for (const seg of segs) {
    if (seg.className === 'image-prompt' && seg.text) {
      const hits = mapped[seg.text] ?? [];
      if (hits.length > 0) {
        for (const hit of hits) {
          out.push({
            key: `img_resolved_${id++}`,
            isImage: true,
            imageUrl: hit.src,
            altText: hit.alt || '生成图片',
            imagePromptRaw: seg.text,
            text: hit.src,
          });
        }
        // 已有图片时默认不再显示提示词，避免占位刷屏
        continue;
      }
    }
    out.push(seg);
  }

  return out.length ? out : [{ key: 'empty', text: '(暂无正文)' }];
});

const segmentFilterItems = computed<Array<{ key: SegmentKind; label: string; count: number }>>(() => {
  const items: Array<{ key: SegmentKind; label: string }> = [
    { key: 'narrative', label: '叙述' },
    { key: 'dialog', label: '对话' },
    { key: 'system', label: '系统' },
    { key: 'table', label: '表格' },
    { key: 'image', label: '图片' },
    { key: 'image_prompt', label: '提示词' },
  ];
  const counts = new Map<SegmentKind, number>(items.map(it => [it.key, 0] as const));
  for (const seg of segments.value) {
    const kinds = detectSegmentKinds(seg);
    for (const kind of kinds) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return items.map(it => ({ ...it, count: counts.get(it.key) ?? 0 }));
});

const filteredSegments = computed<Segment[]>(() => {
  const enabled = new Set(enabledSegmentKinds.value);
  const list = segments.value.filter(seg => detectSegmentKinds(seg).some(kind => enabled.has(kind)));
  return list.length > 0 ? list : [{ key: 'empty_filtered', text: '(当前筛选条件下无正文内容)' }];
});

function detectSegmentKind(seg: Segment): SegmentKind {
  return detectSegmentKinds(seg)[0];
}

function detectSegmentKinds(seg: Segment): SegmentKind[] {
  if (seg.isImage) return ['image'];
  if (seg.isTable) return ['table'];
  if (seg.isSystem) return ['system'];
  // 生图提示词块既归类为“图片”，也归类为“提示词”，便于两种筛选入口都能命中。
  if (seg.className === 'image-prompt') return ['image', 'image_prompt'];
  if (seg.className === 'dialog-text') return ['dialog'];
  return ['narrative'];
}

function toggleSegmentKind(kind: SegmentKind) {
  const enabled = new Set(enabledSegmentKinds.value);
  if (enabled.has(kind)) {
    if (enabled.size <= 1) return;
    enabled.delete(kind);
  } else {
    enabled.add(kind);
  }
  enabledSegmentKinds.value = Array.from(enabled);
}

function enableAllSegmentKinds() {
  enabledSegmentKinds.value = ['narrative', 'dialog', 'system', 'table', 'image', 'image_prompt'];
}

function enableCoreSegmentKinds() {
  enabledSegmentKinds.value = ['narrative', 'dialog', 'system'];
}

const META_BLOCK_TAGS = [
  'meow_fm',
  'profile',
  'variablethink',
  'variableedit',
  'updatevariable',
  'jsonpatch',
  'analysis',
  'era_data',
  'variableinsert',
  'statusplaceholderimpl',
] as const;

const META_TITLE_MAP: Record<string, string> = {
  meow_fm: 'FM 摘要',
  profile: '角色档案',
  variablethink: '变量思考',
  variableedit: '变量编辑',
  updatevariable: '变量更新',
  jsonpatch: 'JSON Patch',
  analysis: '分析过程',
  era_data: 'ERA 数据',
  variableinsert: '变量插入',
  statusplaceholderimpl: '占位模块',
};

const metaBlocks = computed<MetaBlock[]>(() => {
  const raw = props.raw ?? '';
  const blocks: MetaBlock[] = [];
  let id = 0;
  for (const tag of META_BLOCK_TAGS) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    for (const m of raw.matchAll(re)) {
      const content = String(m[1] ?? '').trim();
      if (!content) continue;
      blocks.push({
        key: `${tag}_${id++}`,
        tag,
        title: META_TITLE_MAP[tag] ?? tag,
        content,
      });
    }
  }
  return blocks;
});

watchEffect(onCleanup => {
  // 在消息 iframe 中可用；非消息上下文则无法解析显示层 DOM
  const messageId = typeof getCurrentMessageId === 'function' ? Number(getCurrentMessageId() as any) : null;

  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const text = normalizeStoryText(mainText);
  const prompts = Array.from(new Set(collectImagePromptMatches(text).map(m => m.raw)));

  let canceled = false;
  const timers: number[] = [];
  let observer: MutationObserver | null = null;

  const run = () => {
    if (canceled) return;
    const fromCache = resolveImagesFromChatu8Cache(prompts);
    const fromDisplayed = resolveImagesFromDisplayedMessage(messageId, prompts);
    const next = mergeImageMapWithPriority(fromDisplayed, fromCache, prompts);
    // 只有在结果有变化时才写入，避免无意义触发重渲染
    const prev = resolvedImagesByPrompt.value ?? {};
    const prevJson = JSON.stringify(prev);
    const nextJson = JSON.stringify(next);
    if (prevJson !== nextJson) resolvedImagesByPrompt.value = next;
  };

  // 立即尝试一次，并在短时间内再重试（生图 DOM 插入通常是异步的）
  run();
  timers.push(window.setTimeout(run, 600));
  timers.push(window.setTimeout(run, 2000));
  timers.push(window.setTimeout(run, 5000));

  if (messageId && Number.isFinite(messageId) && typeof retrieveDisplayedMessage === 'function') {
    const $mes = retrieveDisplayedMessage(messageId);
    const root = $mes?.get?.(0) as HTMLElement | undefined;
    if (root) {
      observer = new MutationObserver(() => {
        run();
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'data-src'],
      });
    }
  }

  onCleanup(() => {
    canceled = true;
    observer?.disconnect();
    for (const t of timers) window.clearTimeout(t);
  });
});

onMounted(() => {
  refreshChatu8RuntimeConfig();
  chatu8RuntimeTimer = window.setInterval(() => {
    refreshChatu8RuntimeConfig();
  }, 1500);
});

onBeforeUnmount(() => {
  if (chatu8RuntimeTimer !== null) {
    window.clearInterval(chatu8RuntimeTimer);
    chatu8RuntimeTimer = null;
  }
  clearStoryImageClickTimer();
  clearStoryImageLongPressTimer();
  for (const handler of imagePromptRequestHandlers.values()) {
    try {
      if (typeof eventRemoveListener === 'function') {
        eventRemoveListener(EventType.GENERATE_IMAGE_RESPONSE, handler as any);
      }
    } catch {
      // ignore
    }
  }
  imagePromptRequestHandlers.clear();
  for (const timer of imagePromptRequestTimers.values()) {
    window.clearTimeout(timer);
  }
  imagePromptRequestTimers.clear();
});

let __resizeScheduled = false;
function scheduleResize() {
  if (__resizeScheduled) return;
  __resizeScheduled = true;
  requestAnimationFrame(() => {
    __resizeScheduled = false;
    window.dispatchEvent(new Event('resize'));
  });
}

function applyTavernDisplayRegex(text: string): string {
  if (!text) return '';
  try {
    if (typeof formatAsTavernRegexedString === 'function') {
      const out = formatAsTavernRegexedString(text, 'ai_output', 'display', { depth: 0 });
      return typeof out === 'string' ? out : text;
    }
  } catch {
    // ignore: 在非酒馆/未注入对应 API 的环境里可能不可用
  }
  return text;
}

function normalizeXmlishForDisplay(input: string): string {
  // 目标：
  // 1) 识别并优雅处理常见块标签（例如 <details>/<summary>）
  // 2) 其余“XML 风格标签”默认只作为包裹层：去掉标签但保留文本内容，避免 UI 里出现成片的 <tag>
  if (!input || !input.includes('<')) return input;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, 'text/html');
    const root = doc.body as HTMLElement | null;
    if (!root) return input;

    const STRIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'META', 'LINK', 'NOSCRIPT']);
    const INLINE_TAGS = new Set([
      'A',
      'ABBR',
      'B',
      'BDI',
      'BDO',
      'CITE',
      'CODE',
      'DATA',
      'DFN',
      'EM',
      'I',
      'KBD',
      'MARK',
      'Q',
      'S',
      'SAMP',
      'SMALL',
      'SPAN',
      'STRONG',
      'SUB',
      'SUP',
      'TIME',
      'U',
      'VAR',
      // 自定义标签通常是“块”语义；不放进 INLINE_TAGS 里，避免粘连成一行
    ]);
    const BLOCK_TAGS = new Set([
      'ADDRESS',
      'ARTICLE',
      'ASIDE',
      'BLOCKQUOTE',
      'DIV',
      'DL',
      'DT',
      'DD',
      'FIGCAPTION',
      'FIGURE',
      'FOOTER',
      'FORM',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'HEADER',
      'HR',
      'LI',
      'MAIN',
      'NAV',
      'OL',
      'P',
      'PRE',
      'SECTION',
      'TABLE',
      'TBODY',
      'THEAD',
      'TFOOT',
      'TR',
      'TD',
      'TH',
      'UL',
    ]);

    const append = (parts: string[], s: string) => {
      if (!s) return;
      parts.push(s);
    };

    const renderChildren = (nodes: ChildNode[]): string => {
      const parts: string[] = [];
      for (const n of nodes) append(parts, renderNode(n));
      return parts.join('');
    };

    const renderNode = (node: ChildNode): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const el = node as HTMLElement;
      const tag = (el.tagName ?? '').toUpperCase();
      if (!tag || STRIP_TAGS.has(tag)) return '';

      if (tag === 'BR') return '\n';

      if (tag === 'IMG') {
        // 兼容“模型直接输出 <img>”的情况：转成 markdown 图片，复用现有 mdImage 解析逻辑
        const src = (el.getAttribute('src') ?? '').trim();
        if (!src) return '';
        const alt = (el.getAttribute('alt') ?? el.getAttribute('title') ?? '').replace(/[\]\r\n]+/g, ' ').trim();
        const safeSrc = src.replace(/\)/g, '%29');
        return `\n![${alt}](${safeSrc})\n`;
      }

      if (tag === 'DETAILS') {
        const children = Array.from(el.childNodes) as ChildNode[];
        const summaryEl = Array.from(el.children).find(c => (c as HTMLElement).tagName?.toUpperCase() === 'SUMMARY') as
          | HTMLElement
          | undefined;

        const summary = summaryEl?.textContent?.trim() ?? '';
        const bodyNodes = children.filter(n => n !== summaryEl);
        const body = renderChildren(bodyNodes).trim();
        const header = summary ? `【${summary}】\n` : '';
        return `\n\n${header}${body}\n\n`;
      }

      if (tag === 'SUMMARY') {
        // <summary> 仅在 <details> 内使用；已由 <details> 分支处理
        return '';
      }

      if (tag === 'A') {
        const href = (el.getAttribute('href') ?? '').trim();
        const text = renderChildren(Array.from(el.childNodes) as ChildNode[]).trim();
        if (!href) return text;
        if (!text) return href;
        return `${text} (${href})`;
      }

      const childrenText = renderChildren(Array.from(el.childNodes) as ChildNode[]);
      const isInline =
        INLINE_TAGS.has(tag) ||
        (!BLOCK_TAGS.has(tag) && !childrenText.includes('\n') && childrenText.trim().length <= 120);

      // 默认：去标签保留内容；仅对“块语义”标签补一点换行，避免不同块粘连到一行
      if (isInline) return childrenText;
      return `\n${childrenText}\n`;
    };

    const rendered = renderChildren(Array.from(root.childNodes) as ChildNode[]);
    return (
      rendered
        // 防止块级标签产生大量空行
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  } catch {
    return input;
  }
}

function normalizeStoryText(raw: string): string {
  // 1) 隐藏绘图思维链
  // 2) 隐藏 <image> 包裹标签，但保留其中的 xxx###...### 供生图插件提取
  // 3) 优先应用“酒馆正则”，让用户能用酒馆自带正则更灵活地对齐/处理各种自定义 XML 块
  // 4) 将剩余的 XML/HTML 风格标签做“去标签保内容”的显示归一化（例如 <details>）
  // 5) 归一化空白行，减少图片/提示词前后的“被动拉高”
  const stripped = (raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/<imgthink>[\s\S]*?<\/imgthink>/gi, '')
    .replace(/<\/?image(?:\s[^>]*)?>/gi, '');

  const regexed = applyTavernDisplayRegex(stripped);
  const xmlNormalized = normalizeXmlishForDisplay(regexed);
  return xmlNormalized.replace(/\n{3,}/g, '\n\n');
}

type TagBlock = {
  start: number;
  end: number;
  openEnd: number;
  closeStart: number;
  tagName: 'content' | 'game';
  inner: string;
};

function findTagBlocks(raw: string): TagBlock[] {
  const re = /<(content|game)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  const blocks: TagBlock[] = [];
  for (const m of raw.matchAll(re)) {
    const tagName = (m[1]?.toLowerCase() as 'content' | 'game') ?? 'content';
    const full = m[0] ?? '';
    const inner = m[2] ?? '';
    const start = m.index ?? 0;
    const end = start + full.length;
    const openEnd = start + (full.indexOf('>') + 1);
    const closeStart = end - `</${tagName}>`.length;
    blocks.push({ start, end, openEnd, closeStart, tagName, inner });
  }
  return blocks;
}

function isInAnyRange(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some(r => pos >= r.start && pos < r.end);
}

function removeSpans(raw: string, spans: Array<{ start: number; end: number }>): string {
  if (spans.length === 0) return raw;
  const sorted = spans
    .slice()
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) continue;
    out += raw.slice(cursor, s.start);
    cursor = s.end;
  }
  out += raw.slice(cursor);
  return out;
}

function extractOptionBlock(raw: string): string {
  const m = raw.match(/<option(?:\s[^>]*)?>[\s\S]*?<\/option>/i);
  return m?.[0] ?? '';
}

function stripOptionBlock(raw: string): string {
  return raw.replace(/<option(?:\s[^>]*)?>[\s\S]*?<\/option>/gi, '');
}

function normalizeInjectedRaw(raw: string): string {
  const input = raw ?? '';
  if (!input.trim()) return '';

  const blocks = findTagBlocks(input);
  const ranges = blocks.map(b => ({ start: b.start, end: b.end }));

  // 收集已在 <content>/<game> 内的 xxx###...###，用于去重
  const promptsInBlocks = new Set<string>();
  for (const b of blocks) {
    for (const m of collectImagePromptMatches(b.inner)) promptsInBlocks.add(m.raw);
  }

  // 收集“块外”的 xxx###...###，并去重
  const outsideSpans: Array<{ start: number; end: number; raw: string }> = [];
  const outsidePrompts: string[] = [];
  for (const m of collectImagePromptMatches(input)) {
    const start = m.index ?? -1;
    if (start < 0) continue;
    const end = start + (m.raw?.length ?? 0);
    const inBlock = isInAnyRange(start, ranges);
    if (inBlock) continue;

    const rawPrompt = m.raw ?? '';
    if (!rawPrompt) continue;
    if (promptsInBlocks.has(rawPrompt)) continue;
    if (outsidePrompts.includes(rawPrompt)) continue;

    outsidePrompts.push(rawPrompt);
    outsideSpans.push({ start, end, raw: rawPrompt });
  }

  if (outsidePrompts.length === 0) return input;

  const removedOutside = removeSpans(input, outsideSpans);
  const optionBlock = extractOptionBlock(removedOutside);

  // 重新查找块（因为 removeSpans 会改变索引）
  const blocksAfter = findTagBlocks(removedOutside);
  const lastBlock = blocksAfter.length ? blocksAfter[blocksAfter.length - 1] : null;

  if (lastBlock) {
    const beforeClose = removedOutside.slice(0, lastBlock.closeStart);
    const afterClose = removedOutside.slice(lastBlock.closeStart);
    const injected = `\n\n${outsidePrompts.join('\n')}\n`;
    return `${beforeClose}${injected}${afterClose}`;
  }

  // 无 <content>/<game>：创建合成 <content>，并把 option 块保留在 raw 里供选项解析
  const bodyWithoutOption = stripOptionBlock(removedOutside).trim();
  const synthesized =
    `<content>\n` +
    `${bodyWithoutOption}\n\n` +
    `${outsidePrompts.join('\n')}\n` +
    `</content>\n` +
    `${optionBlock ? `\n${optionBlock}\n` : ''}`;
  return synthesized;
}

function extractMainStoryText(raw: string): string {
  const blocks = findTagBlocks(raw);
  if (blocks.length) return blocks.map(b => b.inner ?? '').join('\n');
  return stripOptionBlock(raw);
}

type TableBlock = {
  start: number;
  end: number;
  headers: string[];
  rows: string[][];
};

function buildSegments(text: string): Segment[] {
  // 系统消息块：>>> content <<<（可带 **）
  const systemBlockRe = /\*{0,2}>>>([\s\S]*?)<<<\*{0,2}/g;
  // 图片提示词块：<可变标签>###prompt###（保留供插件提取）
  const imagePromptRe = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;
  // markdown 图片：![](url)
  const mdImageRe = /!\[(.*?)\]\((.*?)\)/g;
  // 单行系统提示：伊甸：... / 系统：... / System: ...
  const systemLineRe = /^(?:伊甸|系统|System)[：:].*$/gm;

  const out: Segment[] = [];
  let cursor = 0;
  let segId = 0;

  const pushInline = (chunk: string) => {
    const normalized = normalizeInlineChunk(chunk);
    if (!normalized) return;
    for (const seg of splitInline(normalized, () => `t${segId++}`)) out.push(seg);
  };

  while (cursor < text.length) {
    const nextTable = findNextTable(text, cursor);
    const nextSystemBlock = execFrom(systemBlockRe, text, cursor);
    const nextImagePrompt = execFrom(imagePromptRe, text, cursor);
    const nextMdImage = execFrom(mdImageRe, text, cursor);
    const nextSystemLine = execFrom(systemLineRe, text, cursor);

    const candidates: Array<
      | { kind: 'table'; start: number; end: number; table: TableBlock }
      | { kind: 'systemBlock'; start: number; end: number; content: string }
      | { kind: 'imagePrompt'; start: number; end: number; raw: string }
      | { kind: 'mdImage'; start: number; end: number; alt: string; url: string }
      | { kind: 'systemLine'; start: number; end: number; content: string }
    > = [];

    if (nextTable) candidates.push({ kind: 'table', start: nextTable.start, end: nextTable.end, table: nextTable });
    if (nextSystemBlock)
      candidates.push({
        kind: 'systemBlock',
        start: nextSystemBlock.index ?? 0,
        end: (nextSystemBlock.index ?? 0) + nextSystemBlock[0].length,
        content: nextSystemBlock[1] ?? '',
      });
    if (nextImagePrompt)
      if (isLikelyImagePromptTag(nextImagePrompt[1] ?? '')) {
        candidates.push({
          kind: 'imagePrompt',
          start: nextImagePrompt.index ?? 0,
          end: (nextImagePrompt.index ?? 0) + nextImagePrompt[0].length,
          raw: nextImagePrompt[0],
        });
      }
    if (nextMdImage)
      candidates.push({
        kind: 'mdImage',
        start: nextMdImage.index ?? 0,
        end: (nextMdImage.index ?? 0) + nextMdImage[0].length,
        alt: nextMdImage[1] ?? '',
        url: nextMdImage[2] ?? '',
      });
    if (nextSystemLine)
      candidates.push({
        kind: 'systemLine',
        start: nextSystemLine.index ?? 0,
        end: (nextSystemLine.index ?? 0) + nextSystemLine[0].length,
        content: nextSystemLine[0] ?? '',
      });

    if (candidates.length === 0) {
      pushInline(text.slice(cursor));
      break;
    }

    // 选择最靠前的块；同位置时按优先级：table > systemBlock > imagePrompt > mdImage > systemLine
    const priority: Record<string, number> = { table: 1, systemBlock: 2, imagePrompt: 3, mdImage: 4, systemLine: 5 };
    candidates.sort((a, b) => (a.start !== b.start ? a.start - b.start : priority[a.kind] - priority[b.kind]));
    const pick = candidates[0];

    if (pick.start > cursor) {
      pushInline(text.slice(cursor, pick.start));
    }

    if (pick.kind === 'table') {
      out.push({
        key: `table${segId++}`,
        isTable: true,
        tableHeaders: pick.table.headers,
        tableRows: pick.table.rows,
      });
    } else if (pick.kind === 'systemBlock') {
      out.push({
        key: `system${segId++}`,
        isSystem: true,
        className: 'system-message',
        text: pick.content.trim(),
      });
    } else if (pick.kind === 'imagePrompt') {
      out.push({
        key: `imgprompt${segId++}`,
        className: 'image-prompt',
        text: pick.raw,
      });
    } else if (pick.kind === 'mdImage') {
      out.push({
        key: `img${segId++}`,
        isImage: true,
        imageUrl: pick.url,
        altText: pick.alt,
        text: pick.url,
      });
    } else if (pick.kind === 'systemLine') {
      out.push({
        key: `system${segId++}`,
        isSystem: true,
        className: 'system-message',
        text: pick.content.trim(),
      });
    }

    cursor = Math.max(cursor, pick.end);
  }

  return out.length ? out : [{ key: 'empty', text: '(暂无正文)' }];
}

function normalizeInlineChunk(chunk: string): string {
  // 收敛块与块之间的空白（尤其是生图结果插入后常出现的多余空行）
  const normalized = chunk.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (!normalized.trim()) return '';
  return normalized;
}

function execFrom(re: RegExp, text: string, from: number): RegExpExecArray | null {
  re.lastIndex = from;
  return re.exec(text);
}

function splitInline(chunk: string, nextKey: () => string): Segment[] {
  if (!chunk) return [];

  // 需求：仅保留【】高亮；所有中英文引号/单引号都作为对话高亮
  const inlineRe = /【[^】\n]+】|“[^”\n]+”|‘[^’\n]+’|「[^」\n]+」|"[^"\n]+"|'[^'\n]+'/g;
  const parts: Segment[] = [];
  let cursor = 0;

  for (const m of chunk.matchAll(inlineRe)) {
    const start = m.index ?? 0;
    const raw = m[0] ?? '';
    if (start > cursor) {
      parts.push({ key: nextKey(), text: chunk.slice(cursor, start) });
    }

    const isBracket = raw.startsWith('【');
    parts.push({ key: nextKey(), text: raw, className: isBracket ? 'inline-bracket' : 'dialog-text' });
    cursor = start + raw.length;
  }

  if (cursor < chunk.length) {
    parts.push({ key: nextKey(), text: chunk.slice(cursor) });
  }

  return parts;
}

function findNextTable(text: string, from: number): TableBlock | null {
  // 从 from 之后的下一行开始找，避免从行中间误判
  let i = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  if (i < from) {
    const nl = text.indexOf('\n', from);
    if (nl === -1) return null;
    i = nl + 1;
  }

  while (i < text.length) {
    const lineEnd = text.indexOf('\n', i);
    const end = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(i, end);
    const trimmed = line.trim();

    if (trimmed.startsWith('|')) {
      const headerLine = trimmed;

      // 下一行必须是分隔行
      const nextLineStart = end + 1;
      if (nextLineStart >= text.length) return null;
      const nextLineEnd = text.indexOf('\n', nextLineStart);
      const nextEnd = nextLineEnd === -1 ? text.length : nextLineEnd;
      const delimiterLine = text.slice(nextLineStart, nextEnd).trim();

      if (isMarkdownTableDelimiter(delimiterLine)) {
        const headers = splitMarkdownTableRow(headerLine);
        const rows: string[][] = [];

        let rowStart = nextEnd + 1;
        let tableEnd = nextEnd;
        while (rowStart < text.length) {
          const rowLineEnd = text.indexOf('\n', rowStart);
          const rowEnd = rowLineEnd === -1 ? text.length : rowLineEnd;
          const rowLine = text.slice(rowStart, rowEnd);
          const rowTrimmed = rowLine.trim();

          if (!rowTrimmed.startsWith('|')) break;

          const cells = splitMarkdownTableRow(rowTrimmed);
          rows.push(normalizeRowCells(cells, headers.length));
          tableEnd = rowEnd;
          rowStart = rowEnd + 1;
        }

        if (headers.length >= 2) {
          return {
            start: i,
            end: tableEnd,
            headers,
            rows: rows.length ? rows : [normalizeRowCells([], headers.length)],
          };
        }
      }
    }

    i = end + 1;
  }

  return null;
}

function isMarkdownTableDelimiter(line: string): boolean {
  // | --- | :---: | ---: | 等
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitMarkdownTableRow(row: string): string[] {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);

  const cells: string[] = [];
  let buf = '';
  let escaped = false;

  for (let idx = 0; idx < s.length; idx++) {
    const ch = s[idx];
    if (escaped) {
      buf += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '|') {
      cells.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }

  cells.push(buf.trim());
  return cells;
}

function normalizeRowCells(cells: string[], width: number): string[] {
  const out = cells.slice(0, width);
  while (out.length < width) out.push('');
  return out;
}

// 格式化表格单元格（支持粗体、斜体等）- 安全处理防止 XSS
function formatTableCell(cell: string): string {
  // 先转义 HTML 特殊字符
  const safe = cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 再处理支持的格式
  return (
    safe
      // 修复被转义的 inline-bracket span（表格内常见）
      .replace(/&lt;span class="inline-bracket"&gt;([\s\S]*?)&lt;\/span&gt;/g, '<span class="inline-bracket">$1</span>')
      // 修复被转义为 “inline-bracket> [xxx]” 的残留文本
      .replace(/inline-bracket[`'"]?\s*&gt;\s*\[([^\]]+)\]/g, '<span class="inline-bracket">【$1】</span>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/【([^】\n]+)】/g, '<span class="inline-bracket">【$1】</span>')
      .replace(/“([^”\n]+)”/g, '<span class="dialog-text">“$1”</span>')
      .replace(/‘([^’\n]+)’/g, '<span class="dialog-text">‘$1’</span>')
      .replace(/「([^」\n]+)」/g, '<span class="dialog-text">「$1」</span>')
      .replace(/"([^"\n]+)"/g, '<span class="dialog-text">"$1"</span>')
      .replace(/'([^'\n]+)'/g, '<span class="dialog-text">\'$1\'</span>')
  );
}
</script>

<style scoped>
.story-image {
  display: block;
  width: min(100%, 1024px);
  max-width: 100%;
  height: auto;
  margin: 0;
  border-radius: 10px;
  object-fit: contain;
}

.story-image.is-redrawable {
  cursor: pointer;
}

.story-image-wrap {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: 10px auto;
}

.story-image-wrap.align-left {
  margin-left: 0;
  margin-right: auto;
}

.story-image-wrap.align-center {
  margin-left: auto;
  margin-right: auto;
}

.story-image-wrap.align-right {
  margin-left: auto;
  margin-right: 0;
}

.story-image-generate-fab {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 4;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 30% 30%, #c8efff 0%, #a8dff7 55%, #84c8ea 100%);
  color: #ffffff;
  box-shadow:
    0 6px 16px rgba(20, 92, 124, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  cursor: pointer;
}

.story-image-generate-fab:hover {
  filter: brightness(1.04);
}

.story-image-generate-fab:active {
  transform: translateY(1px) scale(0.98);
}

.story-image-generate-fab:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

.story-image-generate-fab i {
  font-size: 0.95rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.story-image-preview-overlay,
.story-prompt-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(7, 15, 28, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
}

.story-image-preview-panel {
  width: min(100%, 960px);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(16, 24, 36, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.story-image-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.story-image-preview-title {
  color: var(--text-strong, #f2f2f2);
  font-size: 0.9em;
  line-height: 1.35;
}

.story-image-preview-close {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color, #fff);
  font-size: 0.84em;
}

.story-image-preview-media-wrap {
  min-height: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.story-image-preview-media {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 10px;
}

.story-prompt-editor-panel {
  width: min(100%, 760px);
  max-height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(16, 24, 36, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.story-prompt-editor-title {
  margin: 0;
  font-size: 1em;
  color: var(--text-strong, #f2f2f2);
}

.story-prompt-editor-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.story-prompt-editor-field span {
  font-size: 0.8em;
  color: var(--text-dim, rgba(255, 255, 255, 0.7));
}

.story-prompt-editor-field input,
.story-prompt-editor-field textarea {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, #fff);
  font-size: 0.9em;
  line-height: 1.45;
}

.story-prompt-editor-field textarea {
  resize: vertical;
}

.story-prompt-editor-error {
  margin: 0;
  color: #ff8f8f;
  font-size: 0.82em;
}

.story-prompt-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.story-prompt-editor-btn {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color, #fff);
  font-size: 0.84em;
}

.story-prompt-editor-btn.primary {
  border-color: rgba(56, 189, 248, 0.5);
  background: rgba(56, 189, 248, 0.18);
  color: #dff5ff;
}

.markdown-table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 0.9em;
  background-color: var(--bg-medium);
  border-radius: 8px;
  overflow: hidden;
}

.markdown-table th,
.markdown-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.markdown-table th {
  background-color: var(--bg-dark);
  color: var(--accent-gold);
  font-weight: bold;
  font-size: 0.85em;
}

.markdown-table td {
  color: var(--text-color);
  line-height: 1.5;
}

.markdown-table td :deep(strong) {
  color: var(--text-strong);
}

.markdown-table td :deep(em) {
  color: var(--accent-blue);
}

.markdown-table td :deep(.inline-bracket) {
  color: var(--accent-blue);
  font-weight: 600;
}

.markdown-table tr:last-child td {
  border-bottom: none;
}

.markdown-table tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

/* 系统消息样式（伊甸：消息、>>> 消息 <<<） */
.system-message {
  background-color: rgba(0, 180, 216, 0.1);
  border: 1px solid rgba(0, 180, 216, 0.4);
  border-radius: 8px;
  padding: 9px 12px;
  margin: 8px 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.85em;
  line-height: 1.5;
  color: var(--accent-cyan, #00b4d8);
  overflow-x: auto;
}

.system-message pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* 【系统】消息样式 - 黄色 */
.system-hint {
  color: var(--accent-gold, #f1fa8c);
  font-weight: 500;
}

/* 【角色名】样式 - 蓝色高亮 */
.character-name {
  color: var(--accent-blue, #bd93f9);
  font-weight: 600;
}

/* 图片提示词样式 - 代码块形式保留供插件提取 */
.image-prompt-block {
  margin: 6px 0;
}

.image-prompt {
  display: block;
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 6px 9px;
  margin: 6px 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.8em;
  color: var(--accent-gold);
  overflow-x: auto;
}

.image-prompt-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.image-prompt-action-btn {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  border-radius: 7px;
  padding: 4px 10px;
  font-size: 0.72em;
  line-height: 1.2;
  cursor: pointer;
}

.image-prompt-action-btn.primary {
  border-color: rgba(139, 233, 253, 0.5);
  background: rgba(139, 233, 253, 0.22);
}

.image-prompt-action-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.image-prompt-status {
  font-size: 0.72em;
  opacity: 0.9;
}

.image-prompt-status.is-success {
  color: var(--accent-cyan, #00b4d8);
}

.image-prompt-status.is-error {
  color: #ff8c8c;
}

.image-prompt-status.is-loading {
  color: var(--accent-gold, #f1fa8c);
}

.inline-bracket {
  color: var(--accent-blue, #bd93f9);
  font-weight: 600;
}

.story-header-title {
  margin-bottom: 6px;
  padding-bottom: 4px;
  font-size: 1.02em;
}

.story-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  position: sticky;
  top: 0;
  z-index: 4;
  padding: 4px 5px;
  border-radius: 9px;
  background: linear-gradient(180deg, rgba(26, 27, 38, 0.96), rgba(26, 27, 38, 0.8));
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(2px);
}

.story-mini-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.story-mini-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.75em;
  line-height: 1.2;
  cursor: pointer;
}

.story-mini-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 4px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.26);
  font-size: 0.78em;
  opacity: 0.9;
}

.story-mini-tab.active {
  border-color: rgba(139, 233, 253, 0.52);
  background: rgba(139, 233, 253, 0.22);
  color: var(--text-strong);
}

.story-mini-tab.active .story-mini-tab-count {
  border-color: rgba(139, 233, 253, 0.65);
  background: rgba(139, 233, 253, 0.24);
}

.story-zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.zoom-btn {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  font-size: 0.95em;
  cursor: pointer;
}

.zoom-value {
  min-width: 34px;
  text-align: center;
  font-size: 0.72em;
  opacity: 0.85;
}

.story-pane {
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 7px 8px;
}

.content-text.story-pane {
  font-size: var(--story-font-size, 1em);
}

.story-filter-toggle {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
  border-radius: 8px;
  padding: 5px 7px;
  font-size: 0.76em;
  text-align: left;
  margin-bottom: 6px;
  cursor: pointer;
}

.story-filter-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
}

.story-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.72em;
  cursor: pointer;
}

.story-filter-chip.active {
  border-color: rgba(80, 250, 123, 0.45);
  background: rgba(80, 250, 123, 0.18);
}

.chip-count {
  opacity: 0.78;
}

.story-filter-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.story-filter-action-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  border-radius: 7px;
  padding: 3px 7px;
  font-size: 0.7em;
  cursor: pointer;
}

.story-filter-action-btn:hover {
  border-color: rgba(139, 233, 253, 0.45);
  background: rgba(139, 233, 253, 0.14);
}

.story-modules {
  display: grid;
  gap: 8px;
}

.meta-block {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}

.meta-block-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  cursor: pointer;
  font-size: 0.8em;
  font-weight: 600;
  color: var(--accent-gold);
  list-style: none;
}

.meta-block-title::-webkit-details-marker {
  display: none;
}

.meta-block-tag {
  font-size: 0.74em;
  opacity: 0.72;
  color: var(--accent-blue);
}

.meta-block-body {
  margin: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 10px;
  font-size: 0.78em;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.story-modules-empty {
  font-size: 0.84em;
  opacity: 0.72;
  padding: 8px 9px;
}

@media (max-width: 480px) {
  .story-pane {
    padding: 6px 7px;
  }

  .story-mini-tab {
    padding: 3px 7px;
    font-size: 0.72em;
  }

  .story-filter-chip {
    font-size: 0.7em;
    padding: 3px 7px;
  }

  .story-filter-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>

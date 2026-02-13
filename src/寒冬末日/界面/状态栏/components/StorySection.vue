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
      <div class="story-toolbar-actions">
        <div class="story-zoom-controls">
          <button type="button" class="zoom-btn" @click="zoomOut">−</button>
          <span class="zoom-value">{{ zoomPercent }}%</span>
          <button type="button" class="zoom-btn" @click="zoomIn">+</button>
        </div>
        <button
          type="button"
          class="story-image-menu-btn"
          title="触发宿主正文双击，呼出生图菜单"
          aria-label="生图菜单"
          @click="onOpenHostImageMenu"
        >
          生图菜单
        </button>
      </div>
    </div>

    <div v-if="activeStoryTab === 'story'" class="story-filter-panel story-filter-panel-pinned">
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
        <button type="button" class="story-filter-action-btn" @click="enableImageOnlySegmentKinds">仅图片</button>
        <button type="button" class="story-filter-action-btn" @click="enableCoreSegmentKinds">正文优选</button>
      </div>
    </div>

    <div v-if="activeStoryTab === 'story'" class="story-pane content-text" :style="storyContentStyle">
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
          <div v-if="isImagePromptLoading(seg.text ?? '')" class="image-prompt-loading-tip" aria-live="polite">
            <i class="fa-solid fa-image" aria-hidden="true" />
            <span>ComfyUI 生图中，完成后将自动回填到正文</span>
          </div>
          <div class="image-prompt-actions">
            <button
              type="button"
              class="image-prompt-action-btn primary"
              :disabled="isImagePromptLoading(seg.text ?? '')"
              @click="onImagePromptPrimaryAction(seg.text ?? '')"
              @dblclick.prevent="onImagePromptPrimaryDoubleClick(seg.text ?? '')"
              @pointerdown="onImagePromptPrimaryPointerDown(seg.text ?? '', $event)"
              @pointerup="onImagePromptPrimaryPointerUp(seg.text ?? '')"
              @pointerleave="onImagePromptPrimaryPointerUp(seg.text ?? '')"
              @pointercancel="onImagePromptPrimaryPointerUp(seg.text ?? '')"
            >
              {{ isImagePromptLoading(seg.text ?? '') ? '生图中…' : '生图' }}
            </button>
            <button type="button" class="image-prompt-action-btn" @click="onCopyImagePrompt(seg.text ?? '')">
              复制提示词
            </button>
            <span
              v-if="getImagePromptStatus(seg.text ?? '').message"
              class="image-prompt-status"
              :class="`is-${getImagePromptStatus(seg.text ?? '').level}`"
            >
              {{ getImagePromptStatus(seg.text ?? '').message }}
            </span>
          </div>
        </div>
        <span v-else :class="seg.className"><TextHighlight :text="seg.text" :query="query" /></span>
      </template>
    </div>

    <div v-else class="story-pane story-modules">
      <div v-if="metaBlocks.length === 0" class="story-modules-empty">
        当前楼层没有额外模块（如 profile / meow_FM）。
      </div>
      <details v-for="block in metaBlocks" :key="block.key" class="meta-block">
        <summary class="meta-block-title">
          <span>{{ block.title }}</span>
          <span class="meta-block-tag">{{ block.tag }}</span>
        </summary>
        <pre class="meta-block-body"><TextHighlight :text="block.content" :query="query" /></pre>
      </details>
    </div>

    <div
      v-if="imagePreview"
      class="story-image-preview-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="closeImagePreview"
    >
      <div class="story-image-preview-panel">
        <div class="story-image-preview-toolbar">
          <span class="story-image-preview-title">{{ imagePreviewCurrent?.alt || '图片预览' }}</span>
          <div class="story-image-preview-toolbar-actions">
            <span v-if="imagePreviewTotal > 1" class="story-image-preview-counter">
              {{ imagePreviewIndex + 1 }} / {{ imagePreviewTotal }}
            </span>
            <button
              v-if="imagePreviewTotal > 1"
              type="button"
              class="story-image-preview-nav"
              :disabled="!canPreviewPrev"
              @click="previewPrev"
            >
              上一张
            </button>
            <button
              v-if="imagePreviewTotal > 1"
              type="button"
              class="story-image-preview-nav"
              :disabled="!canPreviewNext"
              @click="previewNext"
            >
              下一张
            </button>
            <button type="button" class="story-image-preview-close" @click="closeImagePreview">关闭</button>
          </div>
        </div>
        <div class="story-image-preview-media-wrap">
          <img
            v-if="imagePreviewCurrent?.src"
            :src="imagePreviewCurrent.src"
            :alt="imagePreviewCurrent.alt || '图片预览'"
            class="story-image-preview-media"
          />
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
          <button type="button" class="story-prompt-editor-btn primary" @click="onApplyImagePromptEditor">
            应用并生图
          </button>
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
    messageId?: number | null;
  }>(),
  {
    query: '',
    messageId: null,
  },
);
const query = computed(() => props.query ?? '');
const storyTabs = computed<ReadonlyArray<{ key: StoryTab; label: string; count: number }>>(() => [
  { key: 'story', label: '正文', count: filteredSegments.value.length },
  { key: 'modules', label: '模块', count: metaBlocks.value.length },
]);

const activeStoryTab = useLocalStorage<StoryTab>('eden:story_active_tab', 'story');
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
type HostImageButtonState = {
  found: boolean;
  loading: boolean;
};

type GenerateImageRequestPayload = {
  id: string;
  prompt: string;
  width: number | null;
  height: number | null;
  change?: string | null;
  retouchPrompt?: string | null;
  retouchImage?: string | null;
};

type GenerateImageResponsePayload = {
  id?: string;
  success?: boolean;
  imageData?: string;
  error?: string;
  prompt?: string;
  change?: string;
  isVideo?: boolean;
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
  rawPrompt: string;
  items: ResolvedDisplayedImage[];
  index: number;
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
const hostImageButtonStateByPrompt = ref<Record<string, HostImageButtonState>>({});
const imagePromptOverrides = ref<Record<string, ImagePromptOverride>>({});
const imagePreview = ref<ImagePreviewState | null>(null);
const imagePromptEditor = ref<ImagePromptEditorState | null>(null);
const imagePromptEditorTag = ref('image');
const imagePromptEditorValue = ref('');
const imagePromptEditorError = ref('');
const imagePromptRequestHandlers = new Map<string, GenerateImageResponseHandler>();
const imagePromptRequestTimers = new Map<string, number>();
const imagePromptPendingRequestIds = new Map<string, Set<string>>();
const chatu8Runtime = ref<Chatu8RuntimeConfig>({
  startTag: 'image###',
  endTag: '###',
  hideButton: false,
  clickToPreview: true,
  longPressToEdit: false,
  imageAlignment: 'center',
});
let chatu8RuntimeTimer: number | null = null;
let storyImageClickTimer: number | null = null;
let storyImageLongPressTimer: number | null = null;
let storyImageIgnoreClickUntil = 0;
const HOST_IMAGE_MENU_POLL_MS = 700;
const HOST_IMAGE_MENU_TIMEOUT_MS = 20_000;
let hostImageMenuAutoSessionId = 0;
let hostImageMenuPollTimer: number | null = null;
let hostImageMenuTimeoutTimer: number | null = null;

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

const mergedImagesByPrompt = computed<Record<string, ResolvedDisplayedImage[]>>(() =>
  mergeImageMap(resolvedImagesByPrompt.value ?? {}, generatedImagesByPrompt.value ?? {}),
);

function appendImageHistory(
  source: ResolvedDisplayedImage[],
  incoming: ResolvedDisplayedImage,
): ResolvedDisplayedImage[] {
  const out = Array.isArray(source) ? source.slice() : [];
  const key = `${incoming.src}@@${incoming.alt ?? ''}`;
  const seen = new Set(out.map(it => `${it.src}@@${it.alt ?? ''}`));
  if (!seen.has(key)) out.push({ src: incoming.src, alt: incoming.alt ?? '' });
  return out;
}

function normalizePromptBodyForCompare(rawPrompt: string): string {
  const body = parseImagePromptBody(rawPrompt);
  const source = body || String(rawPrompt ?? '');
  // 去掉 st-chatu8 的分角色占位块，避免同语义提示词因 ${...}$ 与展开文本形式不同而失配。
  const withoutRolePlaceholders = source.replace(/\$\{[\s\S]*?\}\$/g, ' ');
  return normalizeForMatch(withoutRolePlaceholders).toLowerCase();
}

function tokenizePromptForCompare(rawPrompt: string): string[] {
  const normalized = normalizePromptBodyForCompare(rawPrompt);
  if (!normalized) return [];
  const tokens = normalized
    .split(/[^a-z0-9\u4e00-\u9fa5_]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 3);
  return Array.from(new Set(tokens));
}

function scorePromptSimilarity(rawPromptA: string, rawPromptB: string): number {
  const normA = normalizePromptBodyForCompare(rawPromptA);
  const normB = normalizePromptBodyForCompare(rawPromptB);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.92;

  const tokensA = tokenizePromptForCompare(rawPromptA);
  const tokensB = tokenizePromptForCompare(rawPromptB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of tokensA) {
    if (setB.has(token)) intersection++;
  }
  if (intersection < 5) return 0;
  return intersection / Math.max(tokensA.length, tokensB.length);
}

function resolveImageHitsByPrompt(
  mapped: Record<string, ResolvedDisplayedImage[]>,
  rawPrompt: string,
): ResolvedDisplayedImage[] {
  const direct = mapped?.[rawPrompt];
  if (Array.isArray(direct) && direct.length > 0) return direct;

  const bodyNorm = normalizePromptBodyForCompare(rawPrompt);
  if (!bodyNorm) return [];

  let bestScore = 0;
  let bestHits: ResolvedDisplayedImage[] = [];
  for (const [candidatePrompt, hits] of Object.entries(mapped ?? {})) {
    if (!Array.isArray(hits) || hits.length === 0) continue;
    const candidateBody = normalizePromptBodyForCompare(candidatePrompt);
    if (!candidateBody) continue;
    if (candidateBody === bodyNorm || candidateBody.includes(bodyNorm) || bodyNorm.includes(candidateBody)) {
      return hits;
    }

    const score = scorePromptSimilarity(rawPrompt, candidatePrompt);
    if (score > bestScore) {
      bestScore = score;
      bestHits = hits;
    }
  }

  return bestScore >= 0.45 ? bestHits : [];
}

function pickLatestImageHit(hits: ResolvedDisplayedImage[]): ResolvedDisplayedImage | null {
  if (!Array.isArray(hits) || hits.length === 0) return null;
  const last = hits[hits.length - 1];
  return last?.src ? last : null;
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

function getHostImageButtonState(rawPrompt: string): HostImageButtonState {
  return (
    hostImageButtonStateByPrompt.value?.[rawPrompt] ?? {
      found: false,
      loading: false,
    }
  );
}

function isImagePromptLoading(rawPrompt: string): boolean {
  const pendingSet = imagePromptPendingRequestIds.get(rawPrompt);
  if (pendingSet && pendingSet.size > 0) return true;
  const host = getHostImageButtonState(rawPrompt);
  if (host.loading) return true;
  return getImagePromptUi(rawPrompt).isLoading;
}

function getImagePromptStatus(rawPrompt: string): ImagePromptUiState {
  const ui = getImagePromptUi(rawPrompt);
  if (ui.message) return ui;
  if (isImagePromptLoading(rawPrompt)) {
    return {
      isLoading: true,
      message: '插件生图中…',
      level: 'loading',
    };
  }
  return ui;
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

function setPromptPendingRequest(rawPrompt: string, requestId: string, pending: boolean) {
  const key = String(rawPrompt ?? '').trim();
  const rid = String(requestId ?? '').trim();
  if (!key || !rid) return;

  const current = imagePromptPendingRequestIds.get(key) ?? new Set<string>();
  if (pending) {
    current.add(rid);
    imagePromptPendingRequestIds.set(key, current);
  } else {
    current.delete(rid);
    if (current.size > 0) imagePromptPendingRequestIds.set(key, current);
    else imagePromptPendingRequestIds.delete(key);
  }
}

function listReachableHostWindows(): Array<Window & typeof globalThis> {
  const out: Array<Window & typeof globalThis> = [];
  const seen = new Set<Window>();

  const push = (candidate: Window | null | undefined) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    out.push(candidate as Window & typeof globalThis);
  };

  try {
    if (window.parent && window.parent !== window) push(window.parent);
  } catch {
    // ignore
  }
  try {
    if (window.top && window.top !== window) push(window.top);
  } catch {
    // ignore
  }
  push(window);
  return out;
}

function readHostWindow(): (Window & typeof globalThis) | null {
  const candidates = listReachableHostWindows();
  if (candidates.length === 0) return window;

  for (const candidate of candidates) {
    try {
      const host = candidate as any;
      if (host?.SillyTavern || host?.eventSource) return candidate;
    } catch {
      // ignore
    }
  }
  return candidates[0] ?? window;
}

function readHostEventSource(): any | null {
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const source = (hostWindow as any)?.eventSource;
      if (source && typeof source.on === 'function' && typeof source.emit === 'function') return source;
    } catch {
      // ignore
    }
  }
  return null;
}

function pluginEventOn(eventName: string, handler: (...args: any[]) => void): boolean {
  try {
    const source = readHostEventSource();
    if (source && typeof source.on === 'function') {
      source.on(eventName, handler);
      return true;
    }
  } catch {
    // ignore
  }

  try {
    if (typeof eventOn === 'function') {
      eventOn(eventName as any, handler as any);
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

function pluginEventOff(eventName: string, handler: (...args: any[]) => void) {
  try {
    const source = readHostEventSource();
    if (source && typeof source.off === 'function') {
      source.off(eventName, handler);
      return;
    }
    if (source && typeof source.removeListener === 'function') {
      source.removeListener(eventName, handler);
      return;
    }
  } catch {
    // ignore
  }

  try {
    if (typeof eventRemoveListener === 'function') {
      eventRemoveListener(eventName as any, handler as any);
      return;
    }
  } catch {
    // ignore
  }
}

function pluginEventEmit(eventName: string, payload: unknown): boolean {
  try {
    const source = readHostEventSource();
    if (source && typeof source.emit === 'function') {
      source.emit(eventName, payload);
      return true;
    }
  } catch {
    // ignore
  }

  try {
    if (typeof eventEmit === 'function') {
      eventEmit(eventName as any, payload as any);
      return true;
    }
  } catch {
    // ignore
  }

  return false;
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
    startTag: 'image###',
    endTag: '###',
    hideButton: false,
    clickToPreview: true,
    longPressToEdit: false,
    imageAlignment: 'center',
  };
  const ext = readChatu8ExtensionSettings();

  let startTag = String(ext?.startTag ?? defaults.startTag).trim();
  let endTag = String(ext?.endTag ?? defaults.endTag).trim();
  let hideButton = coerceBooleanSetting(ext?.dbclike, defaults.hideButton);
  let clickToPreview = coerceBooleanSetting(ext?.clickToPreview, defaults.clickToPreview);
  let longPressToEdit = coerceBooleanSetting(ext?.longPressToEdit, defaults.longPressToEdit);
  let alignRaw = String(ext?.imageAlignment ?? defaults.imageAlignment)
    .trim()
    .toLowerCase();

  const imageAlignment: Chatu8RuntimeConfig['imageAlignment'] =
    alignRaw === 'left' || alignRaw === 'right' ? alignRaw : 'center';

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

function clearImagePromptRequest(requestId: string) {
  const rid = String(requestId ?? '').trim();
  if (!rid) return;

  const handler = imagePromptRequestHandlers.get(rid);
  if (handler) {
    pluginEventOff(EventType.GENERATE_IMAGE_RESPONSE, handler as any);
    imagePromptRequestHandlers.delete(rid);
  }
  const timer = imagePromptRequestTimers.get(rid);
  if (typeof timer === 'number') {
    window.clearTimeout(timer);
    imagePromptRequestTimers.delete(rid);
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
  return getImagePromptStatus(getSegmentPromptKey(seg));
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

function normalizeGeneratedImageData(imageData: string): string {
  const raw = String(imageData ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `data:image/png;base64,${raw}`;
}

function pickRequestedImageSize(): { width: number | null; height: number | null } {
  const ext = readChatu8ExtensionSettings() ?? {};
  const candidates: Array<[string, string]> = [
    ['sd_cwidth', 'sd_cheight'],
    ['sd_width', 'sd_height'],
    ['comfyui_width', 'comfyui_height'],
    ['novelai_width', 'novelai_height'],
    ['banana_width', 'banana_height'],
    ['width', 'height'],
  ];

  for (const [widthKey, heightKey] of candidates) {
    const w = Number((ext as any)?.[widthKey]);
    const h = Number((ext as any)?.[heightKey]);
    const width = Number.isFinite(w) && w > 0 ? Math.round(w) : null;
    const height = Number.isFinite(h) && h > 0 ? Math.round(h) : null;
    if (width || height) return { width, height };
  }
  return { width: null, height: null };
}

async function onGenerateImageRequest(rawPrompt: string, options: GenerateImageRequestOptions = {}) {
  const key = String(rawPrompt ?? '').trim();
  if (!key) return;

  const promptOverride = String(options.promptOverride ?? '').trim();
  const prompt = promptOverride || getEffectiveImagePrompt(key);
  if (!prompt) {
    setImagePromptUi(key, { isLoading: false, message: '提示词为空', level: 'error' });
    toastr?.warning?.('提示词为空，无法生图');
    return;
  }

  const requestId = makeImageRequestId();
  const { width, height } = pickRequestedImageSize();
  const payload: GenerateImageRequestPayload = {
    id: requestId,
    prompt,
    width,
    height,
  };
  const change = String(options.changeOverride ?? '').trim();
  if (change) payload.change = change;

  const handler: GenerateImageResponseHandler = (responseData: GenerateImageResponsePayload) => {
    const responseId = String(responseData?.id ?? '').trim();
    if (!responseId || responseId !== requestId) return;

    clearImagePromptRequest(requestId);
    setPromptPendingRequest(key, requestId, false);

    if (responseData?.success === false) {
      const reason = String(responseData?.error ?? '').trim() || '插件返回失败';
      setImagePromptUi(key, { isLoading: false, message: reason, level: 'error' });
      return;
    }

    const imageSrc = normalizeGeneratedImageData(String(responseData?.imageData ?? ''));
    if (imageSrc) {
      const prev = generatedImagesByPrompt.value?.[key] ?? [];
      generatedImagesByPrompt.value = {
        ...(generatedImagesByPrompt.value ?? {}),
        [key]: appendImageHistory(prev, { src: imageSrc, alt: prompt }),
      };
      setImagePromptUi(key, { isLoading: false, message: '生图成功', level: 'success' });
      window.setTimeout(() => {
        const ui = getImagePromptUi(key);
        if (ui.level === 'success') setImagePromptUi(key, { message: '', level: 'idle' });
      }, 1800);
      return;
    }

    // 某些插件路径会只更新宿主 DOM，不回传 imageData，此时保持成功态并等待观察器回填。
    setImagePromptUi(key, { isLoading: false, message: '已提交，等待图片回填', level: 'success' });
  };

  if (!pluginEventOn(EventType.GENERATE_IMAGE_RESPONSE, handler as any)) {
    setImagePromptUi(key, { isLoading: false, message: '无法监听插件响应事件', level: 'error' });
    toastr?.error?.('st-chatu8 响应监听失败');
    return;
  }

  imagePromptRequestHandlers.set(requestId, handler);
  const timer = window.setTimeout(() => {
    clearImagePromptRequest(requestId);
    setPromptPendingRequest(key, requestId, false);
    setImagePromptUi(key, { isLoading: false, message: '等待插件响应超时', level: 'error' });
  }, 90_000);
  imagePromptRequestTimers.set(requestId, timer);
  setPromptPendingRequest(key, requestId, true);
  setImagePromptUi(key, { isLoading: true, message: '生图中…', level: 'loading' });

  const emitted = pluginEventEmit(EventType.GENERATE_IMAGE_REQUEST, payload);
  if (!emitted) {
    clearImagePromptRequest(requestId);
    setPromptPendingRequest(key, requestId, false);
    setImagePromptUi(key, { isLoading: false, message: '未能发送插件生图事件', level: 'error' });
    toastr?.error?.('st-chatu8 请求发送失败');
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

function triggerHostElementClick(target: HTMLElement): boolean {
  try {
    if (typeof target.click === 'function') {
      target.click();
      return true;
    }
    const doc = target.ownerDocument;
    const view = doc.defaultView;
    if (!view) return false;
    target.dispatchEvent(
      new view.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function dispatchHostMouseEvent(
  target: HTMLElement,
  type: 'click' | 'dblclick' | 'pointerdown' | 'pointerup',
  detail = 1,
): boolean {
  try {
    const doc = target.ownerDocument;
    const view = doc.defaultView;
    if (!view) return false;

    const rect = target.getBoundingClientRect();
    const width = Math.max(rect.width, 14);
    const height = Math.max(rect.height, 14);
    const clientX = Math.round(rect.left + Math.min(width - 7, Math.max(7, width * 0.5)));
    const clientY = Math.round(rect.top + Math.min(height - 7, Math.max(7, height * 0.5)));

    if ((type === 'pointerdown' || type === 'pointerup') && typeof (view as any).PointerEvent === 'function') {
      target.dispatchEvent(
        new (view as any).PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerdown' ? 1 : 0,
          clientX,
          clientY,
          detail,
        }),
      );
    } else {
      target.dispatchEvent(
        new view.MouseEvent(type === 'pointerdown' ? 'mousedown' : type === 'pointerup' ? 'mouseup' : type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view,
          button: 0,
          buttons: type === 'pointerdown' ? 1 : 0,
          clientX,
          clientY,
          detail,
        }),
      );
    }
    return true;
  } catch {
    return false;
  }
}

function collectHostDocuments(): Document[] {
  const docs: Document[] = [];
  const pushDoc = (doc: Document | null | undefined) => {
    if (!doc) return;
    if (docs.includes(doc)) return;
    docs.push(doc);
  };

  pushDoc(document);
  try {
    pushDoc(window.parent?.document);
  } catch {
    // ignore
  }
  try {
    pushDoc(window.top?.document);
  } catch {
    // ignore
  }
  return docs;
}

function resolveHostMessageRoots(messageId: number | null): HTMLElement[] {
  if (messageId == null || !Number.isFinite(messageId)) return [];
  const roots: HTMLElement[] = [];
  const pushRoot = (root: HTMLElement | null | undefined) => {
    if (!root) return;
    if (roots.includes(root)) return;
    roots.push(root);
  };

  if (typeof retrieveDisplayedMessage === 'function') {
    const $mes = retrieveDisplayedMessage(messageId);
    pushRoot($mes?.get?.(0) as HTMLElement | undefined);
  }

  const mesid = Math.trunc(messageId);
  for (const doc of collectHostDocuments()) {
    const selectors = [`#chat > .mes[mesid='${mesid}']`, `#chat .mes[mesid='${mesid}']`, `.mes[mesid='${mesid}']`];
    for (const selector of selectors) {
      const found = doc.querySelector(selector) as HTMLElement | null;
      if (found) pushRoot(found);
    }
  }

  return roots;
}

function resolveHostChatRoots(): HTMLElement[] {
  const roots: HTMLElement[] = [];
  for (const doc of collectHostDocuments()) {
    const chatRoot = doc.querySelector('#chat') as HTMLElement | null;
    if (!chatRoot) continue;
    if (roots.includes(chatRoot)) continue;
    roots.push(chatRoot);
  }
  return roots;
}

function resolveHostScanRoots(messageId: number | null): HTMLElement[] {
  const messageRoots = resolveHostMessageRoots(messageId);
  const needsChatFallback = messageRoots.every(
    root => !root.querySelector('.st-chatu8-image-button, .st-chatu8-image-span img, .mes_text img, .message_text img'),
  );
  if (!needsChatFallback) return messageRoots;

  const out = messageRoots.slice();
  for (const root of resolveHostChatRoots()) {
    if (!out.includes(root)) out.push(root);
  }
  return out;
}

function resolveHostMessageRoot(messageId: number | null): HTMLElement | null {
  return resolveHostMessageRoots(messageId)[0] ?? null;
}

function resolveHostImageButtonByRawPrompt(root: ParentNode, rawPrompt: string): HTMLElement | null {
  const normalizedRawPrompt = String(rawPrompt ?? '').trim();
  if (!normalizedRawPrompt) return null;
  const buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
  if (buttons.length === 0) return null;
  if (buttons.length === 1) return buttons[0];

  let bestButton: HTMLElement | null = null;
  let bestScore = 0;
  for (const button of buttons) {
    const payload = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
    if (!payload) continue;
    const candidateRaw = normalizeExternalPromptRawToken(payload);
    if (!candidateRaw) continue;

    let score = scorePromptSimilarity(normalizedRawPrompt, candidateRaw);
    if (candidateRaw === normalizedRawPrompt) score = 1;
    if (score > bestScore) {
      bestScore = score;
      bestButton = button;
    }
  }
  return bestButton && bestScore >= 0.28 ? bestButton : null;
}

function resolveHostImageButtonByRawPromptAcrossRoots(rawPrompt: string, messageId: number | null): HTMLElement | null {
  const normalizedRawPrompt = String(rawPrompt ?? '').trim();
  if (!normalizedRawPrompt) return null;

  const roots = resolveHostScanRoots(messageId);
  const allButtons = roots.flatMap(
    root => Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[],
  );
  if (allButtons.length === 1) return allButtons[0];
  let bestButton: HTMLElement | null = null;
  let bestScore = 0;
  for (const root of roots) {
    const buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
    if (buttons.length === 0) continue;
    for (const button of buttons) {
      const payload = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
      if (!payload) continue;
      const candidateRaw = normalizeExternalPromptRawToken(payload);
      if (!candidateRaw) continue;

      let score = scorePromptSimilarity(normalizedRawPrompt, candidateRaw);
      if (candidateRaw === normalizedRawPrompt) score = 1;
      if (score > bestScore) {
        bestScore = score;
        bestButton = button;
      }
    }
  }
  return bestButton && bestScore >= 0.28 ? bestButton : null;
}

function isHostImageButtonLoading(button: HTMLElement): boolean {
  const className = String(button.className ?? '').toLowerCase();
  if (className.includes('loading') || className.includes('generating') || className.includes('is-loading'))
    return true;
  const ariaBusy = String(button.getAttribute('aria-busy') ?? '').toLowerCase();
  if (ariaBusy === 'true') return true;
  if ((button as HTMLButtonElement).disabled) return true;
  const html = String(button.innerHTML ?? '').toLowerCase();
  if (html.includes('spinner') || html.includes('fa-spinner') || html.includes('circle-notch')) return true;
  const text = normalizeForMatch(button.textContent ?? '').toLowerCase();
  return text.includes('生图中') || text.includes('生成中') || text.includes('处理中');
}

function proxyHostImageButtonAction(
  rawPrompt: string,
  action: 'click' | 'dblclick' | 'pointerdown' | 'pointerup',
): boolean {
  const button = resolveHostImageButtonByRawPromptAcrossRoots(rawPrompt, resolveStoryMessageId());
  if (!button) return false;

  if (action === 'click') return triggerHostElementClick(button);
  if (action === 'dblclick') return dispatchHostMouseEvent(button, 'dblclick', 2);
  return dispatchHostMouseEvent(button, action, 1);
}

function readHostRequestIdFromElement(el: Element | null): string {
  if (!el) return '';
  const node = el as HTMLElement;
  return String(node.dataset?.requestId ?? node.getAttribute?.('data-request-id') ?? '').trim();
}

function normalizeImageSrcForMatch(src: string): string {
  return String(src ?? '')
    .trim()
    .split('#')[0];
}

function getImageSourceIdentity(src: string): string {
  const normalized = normalizeImageSrcForMatch(src);
  if (!normalized) return '';
  try {
    const url = new URL(normalized, window.location.href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return normalized;
  }
}

function isSameImageSource(a: string, b: string): boolean {
  const left = normalizeImageSrcForMatch(a);
  const right = normalizeImageSrcForMatch(b);
  if (!left || !right) return false;
  if (left === right) return true;

  try {
    const leftUrl = new URL(left, window.location.href);
    const rightUrl = new URL(right, window.location.href);
    if (leftUrl.href === rightUrl.href) return true;
    if (leftUrl.origin === rightUrl.origin && leftUrl.pathname === rightUrl.pathname) return true;
    if (
      leftUrl.origin === rightUrl.origin &&
      leftUrl.pathname === rightUrl.pathname &&
      leftUrl.search === rightUrl.search
    )
      return true;
  } catch {
    // ignore
  }

  return false;
}

function logHostResolveDiagnostic(tag: string, seg: Segment) {
  try {
    const messageId = resolveStoryMessageId();
    const roots = resolveHostScanRoots(messageId);
    const rawPrompt = getSegmentRawPrompt(seg);
    const imageUrl = String(seg.imageUrl ?? '').trim();
    const bySegButton = resolveHostImageButtonBySegment(seg);
    const bySegImage = resolveHostImageNodeBySegment(seg);
    const byPromptButton = rawPrompt ? resolveHostImageButtonByRawPromptAcrossRoots(rawPrompt, messageId) : null;
    console.warn('[StorySection][st-chatu8]', tag, {
      messageId,
      roots: roots.length,
      imageUrl,
      hasRawPrompt: !!rawPrompt,
      foundBySegButton: !!bySegButton,
      foundBySegImage: !!bySegImage,
      foundByPromptButton: !!byPromptButton,
    });
  } catch {
    // ignore
  }
}

function resolveHostImageButtonFromImageNode(img: HTMLImageElement, fallbackRoot: HTMLElement): HTMLElement | null {
  const span = img.closest('.st-chatu8-image-span') as HTMLElement | null;
  const requestId = readHostRequestIdFromElement(span);
  const ownerRoot = (img.closest('.mes') as HTMLElement | null) ?? fallbackRoot;

  if (requestId) {
    const buttonByRequestId = Array.from(ownerRoot.querySelectorAll('.st-chatu8-image-button')).find(
      node => readHostRequestIdFromElement(node as HTMLElement) === requestId,
    ) as HTMLElement | undefined;
    if (buttonByRequestId) return buttonByRequestId;
  }

  // 兜底：在图片前方兄弟层级里找最近的生图按钮。
  let cur: Element | null = img;
  while (cur) {
    let prev = cur.previousElementSibling;
    while (prev) {
      if ((prev as HTMLElement).classList?.contains('st-chatu8-image-button')) return prev as HTMLElement;
      const nested = prev.querySelector?.('.st-chatu8-image-button') as HTMLElement | null;
      if (nested) return nested;
      prev = prev.previousElementSibling;
    }
    cur = cur.parentElement;
  }

  return null;
}

function resolveHostImageButtonBySegment(seg: Segment): HTMLElement | null {
  const messageId = resolveStoryMessageId();
  const roots = resolveHostScanRoots(messageId);
  if (roots.length === 0) return null;

  const imageUrl = String(seg.imageUrl ?? '').trim();
  if (imageUrl) {
    for (const root of roots) {
      const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
      for (const img of imgs) {
        if (!isRenderableStoryImage(img)) continue;
        const src = getImageSrc(img);
        if (!isSameImageSource(src, imageUrl)) continue;
        const button = resolveHostImageButtonFromImageNode(img, root);
        if (button) return button;
      }
    }
  }

  const rawPrompt = getSegmentRawPrompt(seg);
  if (rawPrompt) {
    return resolveHostImageButtonByRawPromptAcrossRoots(rawPrompt, messageId);
  }

  return null;
}

function resolveHostImageNodeBySegment(seg: Segment): HTMLImageElement | null {
  const messageId = resolveStoryMessageId();
  const roots = resolveHostScanRoots(messageId);
  if (roots.length === 0) return null;

  const imageUrl = String(seg.imageUrl ?? '').trim();
  if (imageUrl) {
    for (const root of roots) {
      const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
      for (const img of imgs) {
        if (!isRenderableStoryImage(img)) continue;
        const src = getImageSrc(img);
        if (isSameImageSource(src, imageUrl)) return img;
      }
    }
  }

  for (const root of roots) {
    const target = resolveHostImagePreviewTarget(root, seg);
    if (!target) continue;
    if (target instanceof HTMLImageElement && isRenderableStoryImage(target)) return target;
    if ((target as HTMLElement).classList?.contains('st-chatu8-image-button')) {
      const candidate = findNextImageElement(target);
      if (candidate && isRenderableStoryImage(candidate)) return candidate;
    }
  }

  return null;
}

function proxyHostImageNativeDoubleClickForSegment(seg: Segment): boolean {
  const target = resolveHostImageNodeBySegment(seg);
  if (!target) return false;
  return dispatchHostMouseEvent(target, 'dblclick', 2);
}

function proxyHostImageButtonActionForSegment(
  seg: Segment,
  action: 'click' | 'dblclick' | 'pointerdown' | 'pointerup',
): boolean {
  const button = resolveHostImageButtonBySegment(seg);
  if (!button) return false;

  if (action === 'click') return triggerHostElementClick(button);
  if (action === 'dblclick') return dispatchHostMouseEvent(button, 'dblclick', 2);
  return dispatchHostMouseEvent(button, action, 1);
}

function resolveHostImagePreviewTarget(root: HTMLElement, seg: Segment): HTMLElement | null {
  const rawPrompt = getSegmentRawPrompt(seg);
  const imageUrl = String(seg.imageUrl ?? '').trim();

  if (rawPrompt) {
    const bestButton = resolveHostImageButtonByRawPrompt(root, rawPrompt);
    if (bestButton) {
      const requestId = String(bestButton.dataset.requestId ?? bestButton.getAttribute('data-request-id') ?? '').trim();
      if (requestId) {
        const spans = Array.from(root.querySelectorAll('.st-chatu8-image-span')) as HTMLElement[];
        const span = spans.find(node => String(node.dataset.requestId ?? '').trim() === requestId) ?? null;
        const img = span?.querySelector('img') as HTMLImageElement | null;
        if (img && isRenderableStoryImage(img)) return img;
      }
      const nextImg = findNextImageElement(bestButton);
      if (nextImg && isRenderableStoryImage(nextImg)) return nextImg;
      return bestButton;
    }
  }

  if (imageUrl) {
    const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    const direct = imgs.find(img => String(img.currentSrc || img.src || '').trim() === imageUrl);
    if (direct && isRenderableStoryImage(direct)) return direct;
  }

  return null;
}

function openHostImagePreview(seg: Segment): boolean {
  const messageId = resolveStoryMessageId();
  const roots = resolveHostScanRoots(messageId);
  for (const root of roots) {
    const target = resolveHostImagePreviewTarget(root, seg);
    if (!target) continue;
    if (triggerHostElementClick(target)) return true;
  }
  return false;
}

function openImagePreview(seg: Segment) {
  const src = String(seg.imageUrl ?? '').trim();
  if (!src) return;

  const rawPrompt = getSegmentRawPrompt(seg);
  const mapped = rawPrompt ? resolveImageHitsByPrompt(mergedImagesByPrompt.value ?? {}, rawPrompt) : [];
  const items = (Array.isArray(mapped) ? mapped : [])
    .filter(item => !!String(item?.src ?? '').trim())
    .map(item => ({ src: String(item.src), alt: String(item.alt ?? '') }));
  if (items.length === 0) {
    items.push({
      src,
      alt: String(seg.altText ?? '').trim(),
    });
  }
  let index = items.findIndex(item => item.src === src);
  if (index < 0) index = items.length - 1;

  imagePreview.value = {
    rawPrompt,
    items,
    index: _.clamp(index, 0, Math.max(0, items.length - 1)),
  };
}

function closeImagePreview() {
  imagePreview.value = null;
}

const imagePreviewCurrent = computed<ResolvedDisplayedImage | null>(() => {
  const state = imagePreview.value;
  if (!state || !Array.isArray(state.items) || state.items.length === 0) return null;
  const index = _.clamp(Number(state.index) || 0, 0, state.items.length - 1);
  const current = state.items[index];
  if (!current?.src) return null;
  return current;
});

const imagePreviewTotal = computed<number>(() => imagePreview.value?.items?.length ?? 0);
const imagePreviewIndex = computed<number>(() => {
  const state = imagePreview.value;
  if (!state || !Array.isArray(state.items) || state.items.length === 0) return 0;
  return _.clamp(Number(state.index) || 0, 0, state.items.length - 1);
});
const canPreviewPrev = computed<boolean>(() => imagePreviewTotal.value > 1 && imagePreviewIndex.value > 0);
const canPreviewNext = computed<boolean>(
  () => imagePreviewTotal.value > 1 && imagePreviewIndex.value < imagePreviewTotal.value - 1,
);

function previewPrev() {
  const state = imagePreview.value;
  if (!state || !canPreviewPrev.value) return;
  imagePreview.value = {
    ...state,
    index: _.clamp(imagePreviewIndex.value - 1, 0, state.items.length - 1),
  };
}

function previewNext() {
  const state = imagePreview.value;
  if (!state || !canPreviewNext.value) return;
  imagePreview.value = {
    ...state,
    index: _.clamp(imagePreviewIndex.value + 1, 0, state.items.length - 1),
  };
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

  const key = String(editor.rawPrompt ?? '').trim();
  if (!key) {
    imagePromptEditorError.value = '未找到可编辑的目标提示词';
    return;
  }

  imagePromptOverrides.value = {
    ...(imagePromptOverrides.value ?? {}),
    [key]: { tag, prompt },
  };

  closeImagePromptEditor();
  await onGenerateImageRequest(key, {
    promptOverride: prompt,
  });
}

function onStoryImageClick(seg: Segment) {
  if (!chatu8Runtime.value.clickToPreview) return;
  if (Date.now() < storyImageIgnoreClickUntil) return;
  clearStoryImageClickTimer();
  storyImageClickTimer = window.setTimeout(() => {
    if (!openHostImagePreview(seg)) openImagePreview(seg);
    storyImageClickTimer = null;
  }, 220);
}

function onImagePromptPrimaryAction(rawPrompt: string) {
  const key = String(rawPrompt ?? '').trim();
  if (!key) return;
  if (proxyHostImageButtonAction(key, 'click')) return;
  setImagePromptUi(key, { isLoading: false, message: '未找到插件生图按钮', level: 'error' });
  toastr?.warning?.('未找到 st-chatu8 生图按钮，无法按插件原生方式触发');
}

function onImagePromptPrimaryDoubleClick(rawPrompt: string) {
  const key = String(rawPrompt ?? '').trim();
  if (!key) return;
  if (proxyHostImageButtonAction(key, 'dblclick')) return;
  setImagePromptUi(key, { isLoading: false, message: '未找到插件重绘按钮', level: 'error' });
  toastr?.warning?.('未找到 st-chatu8 重绘按钮，无法按插件原生方式触发');
}

function onImagePromptPrimaryPointerDown(_rawPrompt: string, _event: PointerEvent) {
  // 纯插件事件模式：不再模拟宿主按钮按压事件。
}

function onImagePromptPrimaryPointerUp(_rawPrompt: string) {
  // 纯插件事件模式：不再模拟宿主按钮抬起事件。
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

  if (proxyHostImageNativeDoubleClickForSegment(seg)) return;
  if (proxyHostImageButtonActionForSegment(seg, 'dblclick')) return;

  const rawPrompt = getSegmentRawPrompt(seg);
  if (rawPrompt && proxyHostImageButtonAction(rawPrompt, 'dblclick')) return;
  logHostResolveDiagnostic('double_click_miss', seg);
  toastr?.warning?.('未找到 st-chatu8 图片/按钮，无法按插件原生方式重绘');
}

function onStoryImageGenerate(seg: Segment) {
  if (proxyHostImageButtonActionForSegment(seg, 'click')) return;

  const rawPrompt = getSegmentRawPrompt(seg);
  if (!rawPrompt) {
    logHostResolveDiagnostic('generate_click_no_prompt', seg);
    toastr?.warning?.('该图片缺少原始提示词，无法生图');
    return;
  }
  if (proxyHostImageButtonAction(rawPrompt, 'click')) return;
  logHostResolveDiagnostic('generate_click_miss', seg);
  toastr?.warning?.('未找到 st-chatu8 生图按钮，无法按插件原生方式触发');
}

function getFirstStoryPromptRaw(): string {
  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const text = normalizeStoryText(mainText);
  return collectImagePromptMatches(text)[0]?.raw ?? '';
}

type ImagePromptCandidate = {
  raw: string;
  source: 'story' | 'dom';
};
type HostPromptButtonCandidate = {
  raw: string;
  signature: string;
  requestId: string;
  button: HTMLElement;
};

function collectPromptRawsFromStoryRaw(): string[] {
  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const text = normalizeStoryText(mainText);
  return collectImagePromptMatches(text)
    .map(m => String(m.raw ?? '').trim())
    .filter(Boolean);
}

function buildRawPromptFromPlainPrompt(prompt: string): string {
  const normalizedPrompt = String(prompt ?? '').trim();
  if (!normalizedPrompt) return '';

  const startTag = String(chatu8Runtime.value.startTag ?? '').trim();
  const endTag = String(chatu8Runtime.value.endTag ?? '').trim() || '###';
  if (startTag && endTag) return `${startTag}${normalizedPrompt}${endTag}`;

  const tag = extractTagFromStartTag(startTag) || 'image';
  return `${tag}###${normalizedPrompt}###`;
}

function normalizeExternalPromptRawToken(value: string): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const parsed = collectImagePromptMatches(text)[0];
  if (parsed?.raw) return String(parsed.raw).trim();
  return buildRawPromptFromPlainPrompt(text);
}

function collectHostPromptButtonCandidates(messageId: number | null): HostPromptButtonCandidate[] {
  const roots = resolveHostScanRoots(messageId);
  if (roots.length === 0) return [];

  const out: HostPromptButtonCandidate[] = [];
  const seenButtons = new Set<HTMLElement>();
  let localIndex = 0;

  for (const root of roots) {
    const buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
    for (const btn of buttons) {
      if (seenButtons.has(btn)) continue;
      seenButtons.add(btn);

      const payload = String(btn.getAttribute('data-image-tag') ?? btn.getAttribute('data-link') ?? '').trim();
      const raw = normalizeExternalPromptRawToken(payload);
      if (!raw) continue;

      const requestId = String(btn.dataset.requestId ?? btn.getAttribute('data-request-id') ?? '').trim();
      const signature = `${raw}@@${requestId || `idx:${localIndex++}`}`;
      out.push({ raw, signature, requestId, button: btn });
    }
  }
  return out;
}

function collectPromptRawsFromDisplayedButtons(messageId: number | null): string[] {
  return collectHostPromptButtonCandidates(messageId).map(item => item.raw);
}

function collectPromptCandidatesForAutoGenerate(messageId: number | null): ImagePromptCandidate[] {
  const storyCandidates = collectPromptRawsFromStoryRaw().map(raw => ({ raw, source: 'story' as const }));
  const domCandidates = collectPromptRawsFromDisplayedButtons(messageId).map(raw => ({ raw, source: 'dom' as const }));
  return [...storyCandidates, ...domCandidates];
}

function buildPromptCounts(candidates: ImagePromptCandidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    const key = String(candidate.raw ?? '').trim();
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function stopHostImageMenuAutoGenerate() {
  if (hostImageMenuPollTimer !== null) {
    window.clearInterval(hostImageMenuPollTimer);
    hostImageMenuPollTimer = null;
  }
  if (hostImageMenuTimeoutTimer !== null) {
    window.clearTimeout(hostImageMenuTimeoutTimer);
    hostImageMenuTimeoutTimer = null;
  }
}

function startHostImageMenuAutoGenerate(messageId: number | null) {
  void messageId;
  stopHostImageMenuAutoGenerate();
}

function resolveHostStoryTriggerTarget(messageId: number | null): HTMLElement | null {
  if (messageId == null || !Number.isFinite(messageId)) return null;
  if (typeof retrieveDisplayedMessage !== 'function') return null;
  const $mes = retrieveDisplayedMessage(messageId);
  const root = $mes?.get?.(0) as HTMLElement | undefined;
  if (!root) return null;

  return (
    (root.querySelector('.mes_text') as HTMLElement | null) ??
    (root.querySelector('.mes_block') as HTMLElement | null) ??
    (root.querySelector('.message_text') as HTMLElement | null) ??
    root
  );
}

function dispatchHostDoubleClick(target: HTMLElement): boolean {
  try {
    const doc = target.ownerDocument;
    const view = doc.defaultView;
    if (!view) return false;

    const rect = target.getBoundingClientRect();
    const width = Math.max(rect.width, 16);
    const height = Math.max(rect.height, 16);
    const clientX = Math.round(rect.left + Math.min(width - 8, Math.max(8, width * 0.3)));
    const clientY = Math.round(rect.top + Math.min(height - 8, Math.max(8, height * 0.35)));

    const eventInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    };

    target.dispatchEvent(new view.MouseEvent('dblclick', { ...eventInit, detail: 2 }));
    return true;
  } catch {
    return false;
  }
}

async function onOpenHostImageMenu() {
  const messageId = resolveStoryMessageId();
  const triggerTarget = resolveHostStoryTriggerTarget(messageId);
  if (triggerTarget) {
    if (dispatchHostDoubleClick(triggerTarget)) {
      const messageHint = messageId != null && Number.isFinite(messageId) ? `楼层 #${messageId}` : '当前楼层';
      toastr?.info?.(`已触发${messageHint}的插件生图菜单`);
      return;
    }
  }

  toastr?.warning?.('未能触发宿主插件生图菜单；纯插件模式下无法兜底代发请求');
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
  if (img.closest('.st-chatu8-image-span')) return true;

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
  const compact = String(body ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  const withoutWhitespace = String(body ?? '').replace(/\s+/g, '');
  return Array.from(
    new Set([body, normalized, compact, withoutWhitespace].map(x => String(x ?? '').trim()).filter(Boolean)),
  );
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

  const out: ResolvedDisplayedImage[] = [];
  const seen = new Set<string>();
  for (const image of images) {
    const src = normalizeStoredImageSrc(image?.path ?? image?.thumbnail_path ?? '');
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({ src, alt: '缓存图片' });
  }
  if (out.length === 0) return [];
  return out;
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

    let best: {
      key: string;
      entry: Chatu8StorageEntry;
      score: number;
    } | null = null;

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
  const roots =
    messageId != null && Number.isFinite(messageId) ? resolveHostScanRoots(messageId) : resolveHostChatRoots();
  if (roots.length === 0) return resolveImagesFromChatu8Cache(prompts);

  const availableImages: ResolvedDisplayedImage[] = [];
  const seenImages = new Set<string>();
  for (const root of roots) {
    for (const image of collectRenderableStoryImages(root)) {
      const key = `${image.src}@@${image.alt ?? ''}`;
      if (seenImages.has(key)) continue;
      seenImages.add(key);
      availableImages.push(image);
    }
  }

  const stChatu8Buttons: HTMLElement[] = [];
  const seenButtons = new Set<HTMLElement>();
  for (const root of roots) {
    const list = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
    for (const button of list) {
      if (seenButtons.has(button)) continue;
      seenButtons.add(button);
      stChatu8Buttons.push(button);
    }
  }
  const stChatu8PromptToImage = stChatu8Buttons
    .map(btn => {
      const prompt = String(btn.getAttribute('data-image-tag') ?? btn.getAttribute('data-link') ?? '').trim();
      if (!prompt) return null;

      const requestId = String(btn.dataset.requestId ?? btn.getAttribute('data-request-id') ?? '').trim();
      const owner = btn.closest('.mes') as HTMLElement | null;
      const ownerRoot = owner ?? (btn.parentElement as HTMLElement | null) ?? null;
      let img: HTMLImageElement | null = null;

      if (requestId && ownerRoot) {
        const spans = Array.from(ownerRoot.querySelectorAll('.st-chatu8-image-span')) as HTMLElement[];
        const span =
          spans.find(
            node => String(node.dataset.requestId ?? node.getAttribute('data-request-id') ?? '').trim() === requestId,
          ) ?? null;
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

  const promptEls = roots.flatMap(root =>
    Array.from(root.querySelectorAll('pre, code, p, div, span')).filter(el =>
      normalizeForMatch(el.textContent ?? '').includes('###'),
    ),
  );

  const out: Record<string, ResolvedDisplayedImage[]> = {};

  for (const rawPrompt of prompts) {
    const needle = normalizeForMatch(rawPrompt);
    if (!needle) continue;
    const bodyNeedle = normalizeForMatch(parseImagePromptBody(rawPrompt));

    let mappedByButton: ResolvedDisplayedImage | null = null;
    for (let idx = stChatu8PromptToImage.length - 1; idx >= 0; idx -= 1) {
      const item = stChatu8PromptToImage[idx];
      if (!item.promptNorm) continue;
      const matched =
        (bodyNeedle && item.promptNorm.includes(bodyNeedle)) ||
        (bodyNeedle && bodyNeedle.includes(item.promptNorm)) ||
        item.promptNorm.includes(needle) ||
        needle.includes(item.promptNorm);
      if (matched) {
        mappedByButton = item.image;
        break;
      }
    }
    if (mappedByButton) {
      out[rawPrompt] = [mappedByButton];
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

  // 兜底：同层桥接隐藏楼层时，插件可能只更新 jiuguanStorage 而未刷新对应楼层 DOM。
  const stillMissing = prompts.filter(p => !out[p]);
  if (stillMissing.length > 0) {
    const fromCache = resolveImagesFromChatu8Cache(stillMissing);
    for (const rawPrompt of stillMissing) {
      const hit = fromCache[rawPrompt];
      if (Array.isArray(hit) && hit.length > 0) out[rawPrompt] = hit;
    }
  }

  return out;
}

function resolveHostImageButtonState(
  messageId: number | null,
  prompts: string[],
): Record<string, HostImageButtonState> {
  const out: Record<string, HostImageButtonState> = {};
  for (const prompt of prompts) {
    const button = resolveHostImageButtonByRawPromptAcrossRoots(prompt, messageId);
    out[prompt] = {
      found: !!button,
      loading: !!button && isHostImageButtonLoading(button),
    };
  }
  return out;
}

const segments = computed<Segment[]>(() => {
  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const mainTextWithoutMeta = stripMetaBlocks(mainText);
  const text = normalizeStoryText(mainTextWithoutMeta);

  if (!text.trim()) return [{ key: 'empty', text: '(暂无正文)' }];
  const segs = buildSegments(text);

  const mapped = mergedImagesByPrompt.value;
  const out: Segment[] = [];
  const renderedImageSources = new Set<string>();
  const storyPromptSet = new Set<string>();
  const promptHistorySources = new Set<string>();
  const promptLatestSources = new Set<string>();
  let id = 0;

  for (const seg of segs) {
    if (seg.className !== 'image-prompt' || !seg.text) continue;
    const hits = resolveImageHitsByPrompt(mapped, seg.text);
    for (const hit of hits) {
      const sourceId = getImageSourceIdentity(hit.src);
      if (sourceId) promptHistorySources.add(sourceId);
    }
    const latestHit = pickLatestImageHit(hits);
    if (latestHit?.src) {
      const sourceId = getImageSourceIdentity(latestHit.src);
      if (sourceId) promptLatestSources.add(sourceId);
    }
  }

  for (const seg of segs) {
    if (seg.className === 'image-prompt' && seg.text) {
      storyPromptSet.add(seg.text);
      const hits = resolveImageHitsByPrompt(mapped, seg.text);
      const latestHit = pickLatestImageHit(hits);
      if (latestHit) {
        const sourceId = getImageSourceIdentity(latestHit.src);
        if (!sourceId || !renderedImageSources.has(sourceId)) {
          if (sourceId) renderedImageSources.add(sourceId);
          out.push({
            key: `img_resolved_${id++}`,
            isImage: true,
            imageUrl: latestHit.src,
            altText: latestHit.alt || '生成图片',
            imagePromptRaw: seg.text,
            text: latestHit.src,
          });
        }
        // 已有图片时默认不再显示提示词，避免占位刷屏
        continue;
      }
    }

    if (seg.isImage && seg.imageUrl) {
      const sourceId = getImageSourceIdentity(seg.imageUrl);
      if (sourceId) {
        // 当图片命中提示词历史，但不是该提示词“最新图”时，视为过期重绘图，不在正文重复展示。
        if (promptHistorySources.has(sourceId) && !promptLatestSources.has(sourceId)) continue;
        if (renderedImageSources.has(sourceId)) continue;
        renderedImageSources.add(sourceId);
      }
    }

    out.push(seg);
  }

  // 若提示词只存在于插件宿主按钮（而不在正文文本中），也要在 UI 中展示加载占位或最终图片。
  for (const prompt of Object.keys(hostImageButtonStateByPrompt.value ?? {})) {
    const rawPrompt = String(prompt ?? '').trim();
    if (!rawPrompt) continue;
    if (storyPromptSet.has(rawPrompt)) continue;

    const hits = resolveImageHitsByPrompt(mapped, rawPrompt);
    const latestHit = pickLatestImageHit(hits);
    if (latestHit) {
      const sourceId = getImageSourceIdentity(latestHit.src);
      if (!sourceId || !renderedImageSources.has(sourceId)) {
        if (sourceId) renderedImageSources.add(sourceId);
        out.push({
          key: `img_resolved_host_${id++}`,
          isImage: true,
          imageUrl: latestHit.src,
          altText: latestHit.alt || '生成图片',
          imagePromptRaw: rawPrompt,
          text: latestHit.src,
        });
      }
      continue;
    }

    const hostState = getHostImageButtonState(rawPrompt);
    if (!hostState.found && !isImagePromptLoading(rawPrompt)) continue;
    out.push({
      key: `img_prompt_host_${id++}`,
      className: 'image-prompt',
      text: rawPrompt,
      imagePromptRaw: rawPrompt,
    });
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
  const enabledKinds = enabledSegmentKinds.value;
  const imageOnlyMode = enabledKinds.length === 1 && enabledKinds[0] === 'image';
  const enabled = new Set(enabledKinds);
  const list = segments.value.filter(seg => {
    if (imageOnlyMode) return seg.isImage === true;
    return detectSegmentKinds(seg).some(kind => enabled.has(kind));
  });
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

function enableImageOnlySegmentKinds() {
  enabledSegmentKinds.value = ['image'];
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

const META_TAG_PATTERN_SOURCE = META_BLOCK_TAGS.map(escapeRegExp).join('|');

function createMetaBlockRegex() {
  return new RegExp(`<(${META_TAG_PATTERN_SOURCE})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`, 'gi');
}

function createMetaSelfClosingRegex() {
  return new RegExp(`<(${META_TAG_PATTERN_SOURCE})(?:\\s[^>]*)?\\s*\\/\\s*>`, 'gi');
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectMetaBlocks(raw: string): MetaBlock[] {
  if (!raw) return [];

  const indexedBlocks: Array<{ start: number; tag: string; content: string }> = [];
  const re = createMetaBlockRegex();

  for (const m of raw.matchAll(re)) {
    const tag = String(m[1] ?? '').toLowerCase();
    const content = String(m[2] ?? '').trim();
    if (!tag || !content) continue;

    indexedBlocks.push({
      start: m.index ?? 0,
      tag,
      content,
    });
  }

  indexedBlocks.sort((a, b) => a.start - b.start);
  return indexedBlocks.map((item, idx) => ({
    key: `${item.tag}_${idx}`,
    tag: item.tag,
    title: META_TITLE_MAP[item.tag] ?? item.tag,
    content: item.content,
  }));
}

function stripMetaBlocks(raw: string): string {
  if (!raw) return '';

  const withoutBlock = raw.replace(createMetaBlockRegex(), '\n');
  const withoutSelfClosing = withoutBlock.replace(createMetaSelfClosingRegex(), '\n');
  return withoutSelfClosing.replace(/\n{3,}/g, '\n\n');
}

const metaBlocks = computed<MetaBlock[]>(() => {
  return collectMetaBlocks(props.raw ?? '');
});

function resolveStoryMessageId(): number | null {
  const rawPropId = props.messageId;
  if (rawPropId !== null && rawPropId !== undefined && `${rawPropId}`.trim() !== '') {
    const fromProp = Number(rawPropId);
    if (Number.isFinite(fromProp) && fromProp >= 0) return Math.trunc(fromProp);
  }
  if (typeof getCurrentMessageId === 'function') {
    try {
      const fromIframe = Number(getCurrentMessageId() as any);
      if (Number.isFinite(fromIframe) && fromIframe >= 0) return Math.trunc(fromIframe);
    } catch {
      // 同层卡脚本挂载上下文会抛错：不要对全局脚本 iframe 调用 getMessageId
      // ignore
    }
  }

  try {
    const getLast = (globalThis as any)?.getLastMessageId;
    if (typeof getLast === 'function') {
      const fromLast = Number(getLast());
      if (Number.isFinite(fromLast) && fromLast >= 0) return Math.trunc(fromLast);
    }
  } catch {
    // ignore
  }
  return null;
}

watchEffect(onCleanup => {
  // 优先使用外部传入的 messageId，同层脚本挂载时避免调用 getCurrentMessageId 抛错
  const messageId = resolveStoryMessageId();

  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const text = normalizeStoryText(mainText);
  const storyPrompts = collectImagePromptMatches(text).map(m => m.raw);
  const domPrompts = collectPromptRawsFromDisplayedButtons(messageId);
  const prompts = Array.from(new Set([...storyPrompts, ...domPrompts]));

  let canceled = false;
  const timers: number[] = [];
  const observers: MutationObserver[] = [];

  const run = () => {
    if (canceled) return;
    const next = resolveImagesFromDisplayedMessage(messageId, prompts);
    const nextHostState = resolveHostImageButtonState(messageId, prompts);
    // 只有在结果有变化时才写入，避免无意义触发重渲染
    const prev = resolvedImagesByPrompt.value ?? {};
    const prevJson = JSON.stringify(prev);
    const nextJson = JSON.stringify(next);
    if (prevJson !== nextJson) resolvedImagesByPrompt.value = next;
    const prevHostJson = JSON.stringify(hostImageButtonStateByPrompt.value ?? {});
    const nextHostJson = JSON.stringify(nextHostState);
    if (prevHostJson !== nextHostJson) hostImageButtonStateByPrompt.value = nextHostState;
  };

  // 立即尝试一次，并在短时间内再重试（生图 DOM 插入通常是异步的）
  run();
  timers.push(window.setTimeout(run, 600));
  timers.push(window.setTimeout(run, 2000));
  timers.push(window.setTimeout(run, 5000));

  const observeRoots =
    messageId != null && Number.isFinite(messageId) ? resolveHostScanRoots(messageId) : resolveHostChatRoots();
  for (const root of observeRoots) {
    const observer = new MutationObserver(() => {
      run();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src', 'class', 'aria-busy', 'disabled', 'data-request-id'],
    });
    observers.push(observer);
  }

  onCleanup(() => {
    canceled = true;
    for (const observer of observers) observer.disconnect();
    for (const t of timers) window.clearTimeout(t);
    hostImageButtonStateByPrompt.value = {};
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
  stopHostImageMenuAutoGenerate();
  clearStoryImageClickTimer();
  clearStoryImageLongPressTimer();
  for (const handler of imagePromptRequestHandlers.values()) {
    pluginEventOff(EventType.GENERATE_IMAGE_RESPONSE, handler as any);
  }
  imagePromptRequestHandlers.clear();
  for (const timer of imagePromptRequestTimers.values()) {
    window.clearTimeout(timer);
  }
  imagePromptRequestTimers.clear();
  imagePromptPendingRequestIds.clear();
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
  // 容错：部分楼层会出现 <content>/<game> 开标签缺少闭合标签的情况，
  // 此时退化为从首个开标签后截取到末尾，避免把前置模块（meow_FM/profile 等）并入正文。
  const loose = raw.match(/<(content|game)(?:\s[^>]*)?>([\s\S]*)$/i);
  if (loose) return stripOptionBlock(String(loose[2] ?? ''));
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

.story-image-preview-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.story-image-preview-title {
  color: var(--text-strong, #f2f2f2);
  font-size: 0.9em;
  line-height: 1.35;
}

.story-image-preview-counter {
  font-size: 0.78em;
  color: var(--text-dim, rgba(255, 255, 255, 0.72));
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
}

.story-image-preview-nav {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color, #fff);
  font-size: 0.82em;
}

.story-image-preview-nav:disabled {
  opacity: 0.62;
  cursor: not-allowed;
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

.image-prompt-loading-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 5px 9px;
  border-radius: 8px;
  border: 1px solid rgba(241, 250, 140, 0.36);
  background: rgba(241, 250, 140, 0.09);
  color: var(--accent-gold, #f1fa8c);
  font-size: 0.74em;
  line-height: 1.25;
}

.image-prompt-loading-tip i {
  font-size: 0.9em;
  opacity: 0.9;
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

.story-toolbar-actions {
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

.story-image-menu-btn {
  height: 22px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  font-size: 0.68em;
  line-height: 1;
  padding: 0 8px;
  cursor: pointer;
  white-space: nowrap;
}

.story-image-menu-btn:hover {
  border-color: rgba(139, 233, 253, 0.45);
  background: rgba(139, 233, 253, 0.14);
}

.story-image-menu-btn:active {
  transform: translateY(1px);
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

.story-filter-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
}

.story-filter-panel-pinned {
  margin-bottom: 6px;
  padding: 6px 8px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
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

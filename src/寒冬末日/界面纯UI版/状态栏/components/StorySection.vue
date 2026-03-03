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
        <button
          type="button"
          class="story-image-menu-btn"
          title="调用 st-chatu8 LLM 提示词接口"
          aria-label="获取LLM提示词"
          @click="onRequestLlmPrompt"
        >
          LLM提示词
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
            @pointerup="onStoryImagePointerUp(seg, $event)"
            @pointerleave="onStoryImagePointerUp(seg, $event)"
            @pointercancel="onStoryImagePointerUp(seg, $event)"
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
              class="image-prompt-proxy-btn st-chatu8-image-button"
              :class="{ 'is-loading': isImagePromptLoading(seg.text ?? '') }"
              :title="isImagePromptLoading(seg.text ?? '') ? '生图中…' : '生图 / 长按编辑提示词'"
              :aria-label="isImagePromptLoading(seg.text ?? '') ? '生图中' : '生图或长按编辑'"
              :disabled="isImagePromptLoading(seg.text ?? '')"
              @click="onImagePromptPrimaryAction(seg.text ?? '')"
              @pointerdown="onImagePromptPointerDown(seg.text ?? '', $event)"
              @pointerup="onImagePromptPointerUp(seg.text ?? '', $event)"
              @pointerleave="onImagePromptPointerUp(seg.text ?? '', $event)"
              @pointercancel="onImagePromptPointerUp(seg.text ?? '', $event)"
            >
              <i class="fa-solid fa-image" aria-hidden="true" />
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
  </section>
</template>

<script setup lang="ts">
import TextHighlight from './TextHighlight.vue';
import {
  SAMELAYER_EVENTS,
  type SameLayerCommandName,
  type SameLayerCommandResponsePayload,
} from '../../../samelayer_events';
import { RequestEventError, cancelPendingEventRequests, requestEventPayload } from '@util/requestEvent';

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
const chatu8DebugManual = useLocalStorage<boolean>('eden:story_chatu8_debug', false);
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

type Chatu8RuntimeConfig = {
  startTag: string;
  endTag: string;
  hideButton: boolean;
  clickToPreview: boolean;
  imageAlignment: 'left' | 'center' | 'right';
  debugLog: boolean;
};

const STORY_COMMAND_TIMEOUT_MS = {
  PING: 1200,
  GENERATE_IMAGE: 45000,
  GET_LLM_PROMPT: 45000,
  QUERY_IMAGE_CACHE: 2500,
} as const;

const STORY_COMMAND_CONCURRENCY_KEY = {
  PING: 'eden:story:cmd:ping',
  GENERATE_IMAGE: 'eden:story:cmd:generate_image',
  GET_LLM_PROMPT: 'eden:story:cmd:get_llm_prompt',
  QUERY_IMAGE_CACHE: 'eden:story:cmd:query_image_cache',
} as const;

const IMAGE_TAG_HINTS = ['image', 'img', 'sd', 'draw', 'paint', 'picture', 'pic', '生图', '绘图', '图片', '插画'];

// 生图插件升级后，图片可能不再写回到消息“原始文本”里，而是只在酒馆的“显示层 DOM”里插入 <img>。
// 因此这里尝试从 retrieveDisplayedMessage(message_id) 中，把 xxx###...### 对应的图片 src 解析出来。
const resolvedImagesByPrompt = ref<Record<string, ResolvedDisplayedImage[]>>({});
const generatedImagesByPrompt = ref<Record<string, ResolvedDisplayedImage[]>>({});
const cachedImagesByPrompt = ref<Record<string, ResolvedDisplayedImage[]>>({});
const imagePromptUi = ref<Record<string, ImagePromptUiState>>({});
const hostImageButtonStateByPrompt = ref<Record<string, HostImageButtonState>>({});
const externalPromptRaws = ref<string[]>([]);
const chatu8Runtime = ref<Chatu8RuntimeConfig>({
  startTag: 'image###',
  endTag: '###',
  hideButton: false,
  clickToPreview: true,
  imageAlignment: 'center',
  debugLog: false,
});
let chatu8RuntimeTimer: number | null = null;
let chatu8BridgeReady: boolean | null = null;
let chatu8BridgeProbePending: Promise<boolean> | null = null;
let chatu8BridgeLastProbeAt = 0;
const CHAUT8_DEBUG_SWITCH_KEY = '__edenStoryChatu8Debug';
let chatu8DebugExposeToken = 0;
const chatu8DebugExposedWindows = new Set<Window & typeof globalThis>();
const CHATU8_BRIDGE_REPROBE_MS = 1200;
let lastStoryMessageId: number | null = null;

function isChatu8DebugEnabled(): boolean {
  return chatu8DebugManual.value === true || chatu8Runtime.value.debugLog === true;
}

function collectChatu8DebugExposeWindows(): Array<Window & typeof globalThis> {
  const out: Array<Window & typeof globalThis> = [];
  const seen = new Set<Window>();
  const push = (candidate: Window | null | undefined) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    out.push(candidate as Window & typeof globalThis);
  };

  push(window);
  try {
    push(window.parent);
  } catch {
    // ignore
  }
  try {
    push(window.top);
  } catch {
    // ignore
  }

  return out;
}

function exposeChatu8DebugSwitch() {
  chatu8DebugExposeToken = Date.now() + Math.floor(Math.random() * 1000);
  const debugSwitch = (enabled?: boolean) => {
    if (typeof enabled === 'boolean') {
      chatu8DebugManual.value = enabled;
    }
    const status = isChatu8DebugEnabled();
    console.info('[StorySection][st-chatu8][debug] switch', {
      manual: chatu8DebugManual.value,
      runtime: chatu8Runtime.value.debugLog,
      enabled: status,
    });
    return status;
  };
  (debugSwitch as any).__eden_owner_token = chatu8DebugExposeToken;

  for (const hostWindow of collectChatu8DebugExposeWindows()) {
    try {
      (hostWindow as any)[CHAUT8_DEBUG_SWITCH_KEY] = debugSwitch;
      chatu8DebugExposedWindows.add(hostWindow);
    } catch {
      // ignore
    }
  }
}

function cleanupChatu8DebugSwitch() {
  for (const hostWindow of chatu8DebugExposedWindows) {
    try {
      const current = (hostWindow as any)[CHAUT8_DEBUG_SWITCH_KEY];
      if (typeof current !== 'function') continue;
      if ((current as any).__eden_owner_token !== chatu8DebugExposeToken) continue;
      delete (hostWindow as any)[CHAUT8_DEBUG_SWITCH_KEY];
    } catch {
      // ignore
    }
  }
  chatu8DebugExposedWindows.clear();
}

function chatu8DebugLog(tag: string, payload?: Record<string, unknown>) {
  if (!isChatu8DebugEnabled()) return;
  try {
    if (payload && Object.keys(payload).length > 0) {
      console.debug('[StorySection][st-chatu8][debug]', tag, payload);
      return;
    }
    console.debug('[StorySection][st-chatu8][debug]', tag);
  } catch {
    // ignore
  }
}

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
    const seen = new Set(prev.map(it => getImageSourceIdentity(it.src) || `${it.src}@@${it.alt}`));
    for (const item of list) {
      if (!item?.src) continue;
      const identity = getImageSourceIdentity(item.src) || `${item.src}@@${item.alt ?? ''}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      merged.push({ src: item.src, alt: item.alt ?? '' });
    }
    out[prompt] = merged;
  }
  return out;
}

const mergedImagesByPrompt = computed<Record<string, ResolvedDisplayedImage[]>>(() => {
  // 合并优先级：缓存(最低) → DOM抓取(中) → 事件通道(最高)
  const base = mergeImageMap(cachedImagesByPrompt.value ?? {}, resolvedImagesByPrompt.value ?? {});
  return mergeImageMap(base, generatedImagesByPrompt.value ?? {});
});
const standaloneHostImages = ref<ResolvedDisplayedImage[]>([]);

function appendImageHistory(
  source: ResolvedDisplayedImage[],
  incoming: ResolvedDisplayedImage,
): ResolvedDisplayedImage[] {
  const out = Array.isArray(source) ? source.slice() : [];
  const identity = getImageSourceIdentity(incoming.src) || `${incoming.src}@@${incoming.alt ?? ''}`;
  const seen = new Set(out.map(it => getImageSourceIdentity(it.src) || `${it.src}@@${it.alt ?? ''}`));
  if (!seen.has(identity)) out.push({ src: incoming.src, alt: incoming.alt ?? '' });
  return out;
}

function upsertPromptImage(
  source: Record<string, ResolvedDisplayedImage[]>,
  promptLike: string,
  image: ResolvedDisplayedImage,
): Record<string, ResolvedDisplayedImage[]> {
  const prompt = String(promptLike ?? '').trim();
  if (!prompt || !String(image?.src ?? '').trim()) return source ?? {};

  const next = { ...(source ?? {}) };
  const upsertAtKey = (key: string) => {
    const normalizedKey = String(key ?? '').trim();
    if (!normalizedKey) return;
    const current = next[normalizedKey] ?? [];
    next[normalizedKey] = appendImageHistory(current, image);
  };

  const rawPrompt = normalizeExternalPromptRawToken(prompt);
  const primaryKey = rawPrompt || prompt;
  upsertAtKey(primaryKey);

  // 同时维护 normalized key，降低 raw token 形态变化导致的匹配失败概率。
  const normalizedPromptKey = normalizePromptBodyForCompare(primaryKey);
  if (normalizedPromptKey && normalizedPromptKey !== primaryKey) upsertAtKey(normalizedPromptKey);

  return next;
}

function normalizePromptBodyForCompare(rawPrompt: string): string {
  const body = parseImagePromptBody(rawPrompt);
  const source = body || String(rawPrompt ?? '');
  // 去掉 st-chatu8 的分角色占位块，避免同语义提示词因 ${...}$ 与展开文本形式不同而失配。
  const withoutRolePlaceholders = source.replace(/\$\{[\s\S]*?\}\$/g, ' ');
  return normalizeForMatch(withoutRolePlaceholders).toLowerCase();
}

function isSameRawPromptToken(rawPromptA: string, rawPromptB: string): boolean {
  const left = String(rawPromptA ?? '').trim();
  const right = String(rawPromptB ?? '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return normalizePromptBodyForCompare(left) === normalizePromptBodyForCompare(right);
}

function resolveImageHitsByPrompt(
  mapped: Record<string, ResolvedDisplayedImage[]>,
  rawPrompt: string,
): ResolvedDisplayedImage[] {
  const direct = mapped?.[rawPrompt];
  if (Array.isArray(direct) && direct.length > 0) return direct;

  const bodyNorm = normalizePromptBodyForCompare(rawPrompt);
  if (!bodyNorm) return [];

  for (const [candidatePrompt, hits] of Object.entries(mapped ?? {})) {
    if (!Array.isArray(hits) || hits.length === 0) continue;
    if (isSameRawPromptToken(candidatePrompt, rawPrompt)) return hits;
    const candidateBody = normalizePromptBodyForCompare(candidatePrompt);
    if (!candidateBody) continue;
    if (candidateBody === bodyNorm) {
      return hits;
    }
  }

  return [];
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
    if (window.top && window.top !== window) push(window.top);
  } catch {
    // ignore
  }
  try {
    if (window.parent && window.parent !== window) push(window.parent);
  } catch {
    // ignore
  }
  push(window);
  return out;
}

function hasChatu8ExtensionContext(hostWindow: Window & typeof globalThis): boolean {
  try {
    const ctx = (hostWindow as any)?.SillyTavern?.getContext?.();
    return !!ctx?.extensionSettings?.['st-chatu8'];
  } catch {
    return false;
  }
}

function readHostWindow(): (Window & typeof globalThis) | null {
  const candidates = listReachableHostWindows();
  if (candidates.length === 0) return window;

  for (const candidate of candidates) {
    if (hasChatu8ExtensionContext(candidate)) return candidate;
  }

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

function createChatu8RequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type BridgeCommand = Extract<SameLayerCommandName, 'ping' | 'generate_image' | 'get_llm_prompt' | 'query_image_cache'>;

type RequestBridgeCommandOptions<TData> = {
  command: BridgeCommand;
  payload?: Record<string, unknown>;
  timeoutMs: number;
  concurrency?: 'allow' | 'join' | 'reject';
  concurrencyKey?: string;
  transformData: (response: SameLayerCommandResponsePayload) => TData;
};

async function requestBridgeCommand<TData>(
  options: RequestBridgeCommandOptions<TData>,
): Promise<Awaited<ReturnType<typeof requestEventPayload<Record<string, unknown>, TData>>>> {
  return requestEventPayload<Record<string, unknown>, TData>({
    requestEvent: SAMELAYER_EVENTS.COMMAND_REQUEST,
    responseEvent: SAMELAYER_EVENTS.COMMAND_RESPONSE,
    payload: {
      command: options.command,
      payload: options.payload ?? {},
      source: 'story',
    },
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency ?? 'allow',
    concurrencyKey: options.concurrencyKey,
    transformResponse: rawPayload => {
      const response = rawPayload as SameLayerCommandResponsePayload;
      if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new RequestEventError('Bridge response is malformed', { code: 'MALFORMED_RESPONSE' });
      }
      if (response.command !== options.command) {
        throw new RequestEventError(`Bridge command mismatch: ${String(response.command ?? '')}`, {
          code: 'MALFORMED_RESPONSE',
          details: { command: options.command, response },
        });
      }
      if (response.ok !== true) {
        const errorText = String(response.error ?? `${options.command} failed`).trim();
        throw new RequestEventError(errorText || `${options.command} failed`, {
          code: 'RESPONSE_ERROR',
          details: { response },
        });
      }
      return options.transformData(response);
    },
  });
}

async function probeChatu8Bridge(timeoutMs = 320, force = false): Promise<boolean> {
  if (!force && chatu8BridgeReady === true) return true;
  if (!force && chatu8BridgeReady === false && Date.now() - chatu8BridgeLastProbeAt < CHATU8_BRIDGE_REPROBE_MS) {
    return false;
  }
  if (chatu8BridgeProbePending) return chatu8BridgeProbePending;
  if (typeof eventEmit !== 'function' || typeof eventOn !== 'function') {
    chatu8BridgeReady = false;
    chatu8BridgeLastProbeAt = Date.now();
    return false;
  }

  chatu8BridgeLastProbeAt = Date.now();
  const pingId = createChatu8RequestId('bridge-ping');
  chatu8BridgeProbePending = requestBridgeCommand<boolean>({
    command: 'ping',
    payload: { pingId },
    timeoutMs: Math.max(300, Math.trunc(timeoutMs)),
    concurrency: 'join',
    concurrencyKey: STORY_COMMAND_CONCURRENCY_KEY.PING,
    transformData: response => {
      const data = (response.data ?? {}) as Record<string, unknown>;
      return data.ready !== false;
    },
  })
    .then(() => {
      chatu8BridgeReady = true;
      chatu8BridgeLastProbeAt = Date.now();
      chatu8DebugLog('bridge_probe_result', { pingId, ok: true });
      return true;
    })
    .catch(error => {
      chatu8BridgeReady = false;
      chatu8BridgeLastProbeAt = Date.now();
      chatu8DebugLog('bridge_probe_result', {
        pingId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    })
    .finally(() => {
      chatu8BridgeProbePending = null;
    });

  return chatu8BridgeProbePending;
}
function normalizeImageDataToSrc(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `data:image/png;base64,${raw}`;
}

function clearPendingChatu8Requests(reason: string) {
  cancelPendingEventRequests(`请求已取消（${reason}）`);
  const nextPromptUi: Record<string, ImagePromptUiState> = { ...(imagePromptUi.value ?? {}) };
  for (const [rawPrompt, ui] of Object.entries(nextPromptUi)) {
    if (!ui?.isLoading) continue;
    nextPromptUi[rawPrompt] = {
      ...ui,
      isLoading: false,
      message: `请求已取消（${reason}）`,
      level: 'error',
    };
  }
  imagePromptUi.value = nextPromptUi;
}

function pushExternalPromptRaw(rawPrompt: string) {
  const normalized = String(rawPrompt ?? '').trim();
  if (!normalized) return;
  if (externalPromptRaws.value.includes(normalized)) return;
  externalPromptRaws.value = [...externalPromptRaws.value, normalized];
}

function resolveRequestImageErrorMessage(error: unknown): string {
  if (error instanceof RequestEventError) {
    switch (error.code) {
      case 'TIMEOUT':
        return 'Image request timed out';
      case 'RESPONSE_ERROR':
      case 'MALFORMED_RESPONSE':
        return String(error.message || 'Image generation failed').trim() || 'Image generation failed';
      case 'EVENT_API_UNAVAILABLE':
      case 'EMIT_FAILED':
        return 'Bridge event channel unavailable';
      case 'CANCELED':
        return String(error.message || 'Request canceled').trim() || 'Request canceled';
      default:
        return String(error.message || 'Image generation failed').trim() || 'Image generation failed';
    }
  }
  if (error instanceof Error) {
    return String(error.message || 'Image generation failed').trim() || 'Image generation failed';
  }
  return 'Image generation failed';
}

function applyGeneratedImage(rawPrompt: string, src: string) {
  const normalizedSrc = normalizeImageDataToSrc(src);
  if (!normalizedSrc) return;

  const current = generatedImagesByPrompt.value?.[rawPrompt] ?? [];
  const imageEntry = { src: normalizedSrc, alt: 'generated image' };
  let updated = {
    ...(generatedImagesByPrompt.value ?? {}),
    [rawPrompt]: appendImageHistory(current, imageEntry),
  };
  updated = upsertPromptImage(updated, rawPrompt, imageEntry);
  generatedImagesByPrompt.value = updated;
}

function resolveLlmPromptRequestErrorMessage(error: unknown): string {
  if (error instanceof RequestEventError) {
    switch (error.code) {
      case 'TIMEOUT':
        return 'LLM prompt request timed out';
      case 'EVENT_API_UNAVAILABLE':
      case 'EMIT_FAILED':
        return 'Bridge event channel unavailable';
      case 'RESPONSE_ERROR':
      case 'MALFORMED_RESPONSE':
        return String(error.message || 'LLM prompt request failed').trim() || 'LLM prompt request failed';
      case 'CANCELED':
        return String(error.message || 'Request canceled').trim() || 'Request canceled';
      default:
        return String(error.message || 'LLM prompt request failed').trim() || 'LLM prompt request failed';
    }
  }
  if (error instanceof Error) {
    return String(error.message || 'LLM prompt request failed').trim() || 'LLM prompt request failed';
  }
  return 'LLM prompt request failed';
}

async function requestImageByPrompt(rawPrompt: string, source: string): Promise<boolean> {
  if (isImagePromptLoading(rawPrompt)) return true;
  const promptBody = parseImagePromptBody(rawPrompt);
  if (!promptBody) return false;

  const bridgeReady = await probeChatu8Bridge(320, chatu8BridgeReady !== true);
  if (!bridgeReady) {
    setImagePromptUi(rawPrompt, {
      isLoading: false,
      message: 'Bridge unavailable',
      level: 'error',
    });
    return false;
  }

  setImagePromptUi(rawPrompt, {
    isLoading: true,
    message: 'Image request sent...',
    level: 'loading',
  });

  let promise: Promise<Awaited<ReturnType<typeof requestBridgeCommand<{ id: string; imageData: string }>>>>;
  try {
    promise = requestBridgeCommand<{ id: string; imageData: string }>({
      command: 'generate_image',
      payload: {
        prompt: promptBody,
        change: null,
        width: null,
        height: null,
      },
      timeoutMs: STORY_COMMAND_TIMEOUT_MS.GENERATE_IMAGE,
      concurrency: 'join',
      concurrencyKey: `${STORY_COMMAND_CONCURRENCY_KEY.GENERATE_IMAGE}:${rawPrompt}`,
      transformData: response => {
        const data = (response.data ?? {}) as Record<string, unknown>;
        const result = (data.result ?? {}) as Record<string, unknown>;
        const imageData = normalizeImageDataToSrc(result.imageData ?? result.image);
        const success = result.success === true || (response.ok === true && !!imageData);
        if (!success || !imageData) {
          const errorText = String(result.error ?? response.error ?? 'Image generation failed').trim();
          throw new RequestEventError(errorText || 'Image generation failed', {
            code: 'RESPONSE_ERROR',
            details: { response, result },
          });
        }
        return {
          id: String(result.id ?? response.id ?? '').trim(),
          imageData,
        };
      },
    });
  } catch (error) {
    if (!getImagePromptUi(rawPrompt).isLoading) return false;
    setImagePromptUi(rawPrompt, {
      isLoading: false,
      message: resolveRequestImageErrorMessage(error),
      level: 'error',
    });
    return false;
  }

  chatu8DebugLog('image_request', {
    source,
    command: 'generate_image',
    promptLength: promptBody.length,
    bridgeReady: chatu8BridgeReady,
  });

  void promise
    .then(result => {
      if (!getImagePromptUi(rawPrompt).isLoading) return;
      applyGeneratedImage(rawPrompt, result.data.imageData);
      setImagePromptUi(rawPrompt, {
        isLoading: false,
        message: 'Image received',
        level: 'success',
      });
      chatu8DebugLog('image_response', {
        source,
        requestId: result.id,
        command: 'generate_image',
        hasImage: !!result.data.imageData,
      });
    })
    .catch(error => {
      if (!getImagePromptUi(rawPrompt).isLoading) return;
      setImagePromptUi(rawPrompt, {
        isLoading: false,
        message: resolveRequestImageErrorMessage(error),
        level: 'error',
      });
      chatu8DebugLog('image_request_failed', {
        source,
        command: 'generate_image',
        promptLength: promptBody.length,
        error: resolveRequestImageErrorMessage(error),
        errorCode: error instanceof RequestEventError ? error.code : null,
      });
    });
  return true;
}

async function requestLlmPrompt(source: string): Promise<boolean> {
  const bridgeReady = await probeChatu8Bridge(320, chatu8BridgeReady !== true);
  if (!bridgeReady) {
    toastr?.warning?.('Bridge unavailable');
    return false;
  }

  const requestId = createChatu8RequestId('llm');
  let promise: Promise<Awaited<ReturnType<typeof requestBridgeCommand<string>>>>;
  try {
    promise = requestBridgeCommand<string>({
      command: 'get_llm_prompt',
      payload: {},
      timeoutMs: STORY_COMMAND_TIMEOUT_MS.GET_LLM_PROMPT,
      concurrency: 'join',
      concurrencyKey: STORY_COMMAND_CONCURRENCY_KEY.GET_LLM_PROMPT,
      transformData: response => {
        const data = (response.data ?? {}) as Record<string, unknown>;
        const result = (data.result ?? {}) as Record<string, unknown>;
        const promptText = String(result.prompt ?? '').trim();
        if (!promptText) {
          throw new RequestEventError('LLM prompt missing', {
            code: 'MALFORMED_RESPONSE',
            details: { response, result },
          });
        }
        const rawPrompt = normalizeExternalPromptRawToken(promptText);
        if (!rawPrompt) {
          throw new RequestEventError('LLM prompt cannot be normalized', {
            code: 'MALFORMED_RESPONSE',
            details: { response, result },
          });
        }
        return rawPrompt;
      },
    });
  } catch (error) {
    const message = resolveLlmPromptRequestErrorMessage(error);
    chatu8DebugLog('llm_prompt_request_setup_failed', {
      requestId,
      source,
      error: message,
      errorCode: error instanceof RequestEventError ? error.code : null,
    });
    toastr?.warning?.(message);
    return false;
  }

  chatu8DebugLog('llm_prompt_request', {
    requestId,
    source,
    command: 'get_llm_prompt',
    bridgeReady: chatu8BridgeReady,
  });

  void promise
    .then(result => {
      const responseData = result.raw;
      const responseSource = String(responseData?.source ?? responseData?.from ?? '').trim();
      pushExternalPromptRaw(result.data);
      setImagePromptUi(result.data, {
        isLoading: false,
        message: 'LLM prompt received',
        level: 'success',
      });
      chatu8DebugLog('llm_prompt_response', {
        requestId: result.id,
        source: responseSource,
        success: true,
        promptLength: result.data.length,
      });
    })
    .catch(error => {
      const message = resolveLlmPromptRequestErrorMessage(error);
      chatu8DebugLog('llm_prompt_request_failed', {
        requestId,
        source,
        error: message,
        errorCode: error instanceof RequestEventError ? error.code : null,
      });
      toastr?.warning?.(message);
    });
  return true;
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

function readChatu8CacheFromHost(
  messageId: number | null,
  promptAllowlist: string[] = [],
): Record<string, ResolvedDisplayedImage[]> {
  const hostWindow = readHostWindow() as any;
  try {
    const ctx = hostWindow?.SillyTavern?.getContext?.();
    if (!ctx) return {};
    const chatMeta = ctx.chatMetadata?.['st-chatu8'];
    if (!chatMeta || typeof chatMeta !== 'object') return {};

    const entries = (chatMeta as any).imageCache ?? (chatMeta as any).images ?? chatMeta;
    if (!entries || typeof entries !== 'object') return {};

    const allowPromptNormSet = new Set(
      (promptAllowlist ?? []).map(item => normalizePromptBodyForCompare(String(item ?? '').trim())).filter(Boolean),
    );

    const parsedEntries: Array<{ prompt: string; promptNorm: string; src: string; entryMsgId: number | null }> = [];
    for (const [key, value] of Object.entries(entries)) {
      if (!value) continue;
      const rawEntryMsgId = (value as any)?.messageId ?? (value as any)?.message_id;
      const parsedEntryMsgId = Number(rawEntryMsgId);
      const entryMsgId = Number.isFinite(parsedEntryMsgId) ? Math.trunc(parsedEntryMsgId) : null;

      const prompt = String((value as any)?.prompt ?? (value as any)?.tag ?? key ?? '').trim();
      if (!prompt) continue;
      const promptNorm = normalizePromptBodyForCompare(prompt);
      if (!promptNorm) continue;

      const imgData = (value as any)?.imageData ?? (value as any)?.image ?? (value as any)?.src;
      if (!imgData) continue;

      const src = normalizeImageDataToSrc(imgData);
      if (!src) continue;
      parsedEntries.push({ prompt, promptNorm, src, entryMsgId });
    }

    let selectedEntries = parsedEntries;
    if (allowPromptNormSet.size > 0) {
      const promptMatched = parsedEntries.filter(item => allowPromptNormSet.has(item.promptNorm));
      if (promptMatched.length > 0) {
        selectedEntries = promptMatched;
      } else if (messageId != null) {
        selectedEntries = parsedEntries.filter(item => item.entryMsgId === messageId || item.entryMsgId == null);
      }
    } else if (messageId != null) {
      selectedEntries = parsedEntries.filter(item => item.entryMsgId === messageId || item.entryMsgId == null);
    }

    chatu8DebugLog('cache_query_direct_select', {
      messageId,
      allowPromptCount: allowPromptNormSet.size,
      totalEntries: parsedEntries.length,
      selectedEntries: selectedEntries.length,
    });

    let out: Record<string, ResolvedDisplayedImage[]> = {};
    for (const item of selectedEntries) {
      out = upsertPromptImage(out, item.prompt, { src: item.src, alt: '缓存图片' });
    }
    return out;
  } catch {
    return {};
  }
}

async function queryChatu8Cache(
  messageId: number | null,
  promptAllowlist: string[] = [],
): Promise<Record<string, ResolvedDisplayedImage[]>> {
  // Fast path: read cache directly from host context.
  const directResult = readChatu8CacheFromHost(messageId, promptAllowlist);
  if (Object.keys(directResult).length > 0) {
    chatu8DebugLog('cache_query_direct_hit', {
      messageId,
      keys: Object.keys(directResult).length,
      allowPromptCount: promptAllowlist.length,
    });
    return directResult;
  }

  // Slow path: ask bridge command bus.
  const bridgeReady = await probeChatu8Bridge(320, false);
  if (!bridgeReady) return {};

  const queryId = createChatu8RequestId('cache');
  try {
    const result = await requestBridgeCommand<Record<string, ResolvedDisplayedImage[]>>({
      command: 'query_image_cache',
      payload: {
        messageId,
        prompts: promptAllowlist,
      },
      timeoutMs: STORY_COMMAND_TIMEOUT_MS.QUERY_IMAGE_CACHE,
      concurrency: 'join',
      concurrencyKey: STORY_COMMAND_CONCURRENCY_KEY.QUERY_IMAGE_CACHE,
      transformData: response => {
        const data = (response.data ?? {}) as Record<string, unknown>;
        const resultPayload = (data.result ?? {}) as Record<string, unknown>;
        const rawImages = resultPayload.images as Record<string, Array<{ src: string; alt: string }>> | undefined;
        if (!rawImages || typeof rawImages !== 'object') return {};

        let out: Record<string, ResolvedDisplayedImage[]> = {};
        for (const [prompt, list] of Object.entries(rawImages)) {
          if (!Array.isArray(list) || list.length === 0) continue;
          for (const item of list) {
            if (!item?.src) continue;
            const normalizedSrc = normalizeImageDataToSrc(item.src);
            if (!normalizedSrc) continue;
            out = upsertPromptImage(out, prompt, {
              src: normalizedSrc,
              alt: item.alt || 'cached image',
            });
          }
        }
        return out;
      },
    });
    chatu8DebugLog('cache_query_bridge_hit', { queryId, keys: Object.keys(result.data).length });
    return result.data;
  } catch (error) {
    chatu8DebugLog('cache_query_bridge_fail', {
      queryId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}
function readChatu8RuntimeConfig(): Chatu8RuntimeConfig {
  const defaults: Chatu8RuntimeConfig = {
    startTag: 'image###',
    endTag: '###',
    hideButton: false,
    clickToPreview: true,
    imageAlignment: 'center',
    debugLog: false,
  };
  const ext = readChatu8ExtensionSettings();

  const startTag = String(ext?.startTag ?? defaults.startTag).trim();
  const endTag = String(ext?.endTag ?? defaults.endTag).trim();
  const hideButton = coerceBooleanSetting(ext?.dbclike, defaults.hideButton);
  const clickToPreview = coerceBooleanSetting(ext?.clickToPreview, defaults.clickToPreview);
  const debugLog = coerceBooleanSetting(ext?.debugLog ?? ext?.debug ?? ext?.enableDebugLog, defaults.debugLog);
  const alignRaw = String(ext?.imageAlignment ?? defaults.imageAlignment)
    .trim()
    .toLowerCase();

  const imageAlignment: Chatu8RuntimeConfig['imageAlignment'] =
    alignRaw === 'left' || alignRaw === 'right' ? alignRaw : 'center';

  return {
    startTag,
    endTag,
    hideButton,
    clickToPreview,
    imageAlignment,
    debugLog,
  };
}

function refreshChatu8RuntimeConfig() {
  chatu8Runtime.value = readChatu8RuntimeConfig();
  chatu8DebugLog('runtime_refresh', {
    startTag: chatu8Runtime.value.startTag,
    endTag: chatu8Runtime.value.endTag,
    debugLog: chatu8Runtime.value.debugLog,
    debugManual: chatu8DebugManual.value,
  });
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

function parseImagePromptBody(rawPrompt: string): string {
  const first = collectImagePromptMatches(rawPrompt)[0];
  return first?.prompt ?? '';
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
  if (chatu8Runtime.value.clickToPreview) parts.push('单击打开插件查看器');
  parts.push('双击按插件原生重绘');
  const detail = parts.join(' · ');
  return detail || String(seg.altText ?? '').trim();
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
  if (messageRoots.length > 0) return messageRoots;

  const out: HTMLElement[] = [];
  for (const root of resolveHostChatRoots()) {
    if (!out.includes(root)) out.push(root);
  }
  return out;
}

function resolveHostMessageScopedRoots(messageId: number | null): HTMLElement[] {
  if (messageId == null || !Number.isFinite(messageId)) return [];
  return resolveHostMessageRoots(messageId);
}

function isHostElementVisible(el: Element | null): boolean {
  if (!el) return false;
  const node = el as HTMLElement;
  if (!node.isConnected) return false;
  try {
    const view = node.ownerDocument?.defaultView ?? window;
    const style = view.getComputedStyle(node);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (node.hidden) return false;
  } catch {
    // ignore
  }
  return node.getClientRects().length > 0;
}

function isMessageFloorHidden(messageId: number | null): boolean {
  if (messageId == null) return false;
  for (const doc of collectHostDocuments()) {
    const el = doc.querySelector(`.mes[mesid='${messageId}']`) as HTMLElement | null;
    if (!el) continue;
    if (el.classList.contains('eden-samelayer-hidden')) return true;
  }
  return false;
}

function resolveHostImageButtonByRawPrompt(root: ParentNode, rawPrompt: string): HTMLElement | null {
  const normalizedRawPrompt = String(rawPrompt ?? '').trim();
  if (!normalizedRawPrompt) return null;
  const allButtons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
  const visibleButtons = allButtons.filter(btn => isHostElementVisible(btn));
  const buttons = visibleButtons.length > 0 ? visibleButtons : allButtons;
  if (buttons.length === 0) return null;
  if (buttons.length === 1) return buttons[0];

  for (const button of buttons) {
    const payload = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
    if (!payload) continue;
    const candidateRaw = normalizeExternalPromptRawToken(payload);
    if (!candidateRaw) continue;
    if (isSameRawPromptToken(normalizedRawPrompt, candidateRaw)) return button;
  }
  return null;
}

function resolveHostImageButtonByRawPromptAcrossRoots(rawPrompt: string, messageId: number | null): HTMLElement | null {
  const normalizedRawPrompt = String(rawPrompt ?? '').trim();
  if (!normalizedRawPrompt) return null;

  const roots = resolveHostScanRoots(messageId);
  const allButtons = roots.flatMap(
    root => Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[],
  );
  const visibleButtons = allButtons.filter(btn => isHostElementVisible(btn));
  const candidateButtons = visibleButtons.length > 0 ? visibleButtons : allButtons;
  if (candidateButtons.length === 1) return candidateButtons[0];
  for (const root of roots) {
    const button = resolveHostImageButtonByRawPrompt(root, normalizedRawPrompt);
    if (button) return button;
  }
  return null;
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
  if (normalized.startsWith('data:')) {
    // data URI 使用完整串作为 identity，避免不同图片在同路径场景下被误去重。
    return normalized;
  }
  try {
    const url = new URL(normalized, window.location.href);
    // 保留 query：st-chatu8 /thumbnail 常用 query 区分不同图片。
    return `${url.origin}${url.pathname}${url.search}`;
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
  if (!isChatu8DebugEnabled()) return;
  try {
    const messageId = resolveStoryMessageId();
    const roots = resolveHostScanRoots(messageId);
    const rawPrompt = getSegmentRawPrompt(seg);
    const imageUrl = String(seg.imageUrl ?? '').trim();
    const bySegButton = resolveHostImageButtonBySegment(seg);
    const bySegImage = resolveHostImageNodeBySegment(seg);
    const byPromptButton = rawPrompt ? resolveHostImageButtonByRawPromptAcrossRoots(rawPrompt, messageId) : null;
    console.debug('[StorySection][st-chatu8][debug]', tag, {
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

function onStoryImageClick(seg: Segment) {
  if (!chatu8Runtime.value.clickToPreview) return;
  if (openHostImagePreview(seg)) return;
  logHostResolveDiagnostic('image_click_preview_miss', seg);
}

async function onImagePromptPrimaryAction(rawPrompt: string) {
  const key = String(rawPrompt ?? '').trim();
  if (!key) return;
  if (proxyHostImageButtonAction(key, 'click')) {
    setImagePromptUi(key, { isLoading: true, message: '已触发宿主生图…', level: 'loading' });
    return;
  }
  if (await requestImageByPrompt(key, 'prompt_primary')) return;
  logHostResolveDiagnostic('prompt_button_click_miss', { key: 'prompt', imagePromptRaw: key });
  toastr?.warning?.('未找到可用的 st-chatu8 生图通道');
}

function onImagePromptPointerDown(rawPrompt: string, event: PointerEvent) {
  if (!rawPrompt) return;
  event.stopPropagation();
  void proxyHostImageButtonAction(rawPrompt, 'pointerdown');
}

function onImagePromptPointerUp(rawPrompt: string, event: PointerEvent) {
  if (!rawPrompt) return;
  event.stopPropagation();
  void proxyHostImageButtonAction(rawPrompt, 'pointerup');
}

function onStoryImagePointerDown(seg: Segment, event: PointerEvent) {
  event.stopPropagation();
  if (proxyHostImageButtonActionForSegment(seg, 'pointerdown')) return;
  const rawPrompt = getSegmentRawPrompt(seg);
  if (!rawPrompt) return;
  void proxyHostImageButtonAction(rawPrompt, 'pointerdown');
}

function onStoryImagePointerUp(seg: Segment, event: PointerEvent) {
  event.stopPropagation();
  if (proxyHostImageButtonActionForSegment(seg, 'pointerup')) return;
  const rawPrompt = getSegmentRawPrompt(seg);
  if (!rawPrompt) return;
  void proxyHostImageButtonAction(rawPrompt, 'pointerup');
}

function scheduleStoryImageDoubleClickFallback(seg: Segment, rawPrompt: string) {
  const prompt = String(rawPrompt ?? '').trim();

  window.setTimeout(() => {
    // 若宿主已进入生图中，则不再重复触发，避免双发。
    if (prompt && isImagePromptLoading(prompt)) return;

    // 优先按“当前图片楼层定位”触发，避免依赖 rawPrompt。
    if (proxyHostImageButtonActionForSegment(seg, 'click')) {
      if (prompt) {
        setImagePromptUi(prompt, {
          isLoading: true,
          message: '已触发宿主生图…',
          level: 'loading',
        });
      }
      chatu8DebugLog('double_click_fallback_segment_click', {
        promptLength: prompt.length,
        key: seg.key,
      });
      return;
    }

    if (prompt && proxyHostImageButtonAction(prompt, 'click')) {
      setImagePromptUi(prompt, {
        isLoading: true,
        message: '已触发宿主生图…',
        level: 'loading',
      });
      chatu8DebugLog('double_click_fallback_host_click', {
        promptLength: prompt.length,
        key: seg.key,
      });
      return;
    }

    if (!prompt) {
      chatu8DebugLog('double_click_fallback_no_prompt', { key: seg.key });
      return;
    }

    void requestImageByPrompt(prompt, 'story_image_dblclick_fallback').then(ok => {
      if (!ok) {
        chatu8DebugLog('double_click_fallback_request_miss', {
          promptLength: prompt.length,
          key: seg.key,
        });
      }
    });
  }, 260);
}

function onStoryImageDoubleClick(seg: Segment) {
  const rawPrompt = getSegmentRawPrompt(seg);
  const triggeredNative =
    proxyHostImageNativeDoubleClickForSegment(seg) ||
    proxyHostImageButtonActionForSegment(seg, 'dblclick') ||
    (!!rawPrompt && proxyHostImageButtonAction(rawPrompt, 'dblclick'));

  // 部分宿主配置下，双击仅会打开生图面板并生成提示词，不会直接发起生图。
  // 因此在原生双击成功后补一个短延迟兜底：若仍未进入“生图中”，则主动触发一次生图。
  if (triggeredNative) {
    scheduleStoryImageDoubleClickFallback(seg, rawPrompt ?? '');
    return;
  }

  if (rawPrompt && proxyHostImageButtonAction(rawPrompt, 'click')) return;
  logHostResolveDiagnostic('double_click_miss', seg);
  toastr?.warning?.('未找到 st-chatu8 图片/按钮，无法按插件原生方式重绘');
}

async function onStoryImageGenerate(seg: Segment) {
  if (proxyHostImageButtonActionForSegment(seg, 'click')) return;

  const rawPrompt = getSegmentRawPrompt(seg);
  if (!rawPrompt) {
    logHostResolveDiagnostic('generate_click_no_prompt', seg);
    toastr?.warning?.('该图片缺少原始提示词，无法生图');
    return;
  }
  if (proxyHostImageButtonAction(rawPrompt, 'click')) return;
  if (await requestImageByPrompt(rawPrompt, 'story_image')) return;
  logHostResolveDiagnostic('generate_click_miss', seg);
  toastr?.warning?.('未找到可用的 st-chatu8 生图通道');
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

function collectPromptRawsFromDisplayedButtons(messageId: number | null): string[] {
  // 仅采集"当前楼层"按钮，避免把整聊天历史里的按钮提示词混入正文渲染。
  const roots = resolveHostMessageScopedRoots(messageId);
  if (roots.length === 0) {
    chatu8DebugLog('collect_prompt_raws_skip_no_message_root', {
      messageId,
    });
    return [];
  }

  const floorHidden = isMessageFloorHidden(messageId);
  const out: string[] = [];
  const seenButtons = new Set<HTMLElement>();
  const seenRaws = new Set<string>();

  for (const root of roots) {
    const buttons = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
    for (const btn of buttons) {
      if (seenButtons.has(btn)) continue;
      seenButtons.add(btn);
      if (!floorHidden && !isHostElementVisible(btn)) continue;

      const payload = String(btn.getAttribute('data-image-tag') ?? btn.getAttribute('data-link') ?? '').trim();
      const raw = normalizeExternalPromptRawToken(payload);
      if (!raw) continue;
      if (seenRaws.has(raw)) continue;
      seenRaws.add(raw);
      out.push(raw);
    }
  }
  return out;
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

async function onRequestLlmPrompt() {
  if (await requestLlmPrompt('toolbar')) {
    toastr?.info?.('已发送 LLM 提示词请求');
    return;
  }
  toastr?.warning?.('未找到可用的 st-chatu8 LLM 通道');
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

function resolveImagesFromDisplayedMessage(messageId: number | null, prompts: string[]) {
  const roots = resolveHostMessageScopedRoots(messageId);
  if (roots.length === 0) {
    chatu8DebugLog('resolve_images_skip_no_message_root', {
      messageId,
      promptCount: prompts.length,
    });
    return {};
  }

  const floorHidden = isMessageFloorHidden(messageId);

  const stChatu8Buttons: Array<{
    rawPrompt: string;
    promptBodyNorm: string;
    image: ResolvedDisplayedImage;
    requestId: string;
    imageSource: 'request_id' | 'neighbor';
  }> = [];

  const seenButtons = new Set<HTMLElement>();
  for (const root of roots) {
    const all = Array.from(root.querySelectorAll('.st-chatu8-image-button')) as HTMLElement[];
    const visible = all.filter(btn => isHostElementVisible(btn));
    // 当楼层被桥接隐藏时，所有按钮都不可见，直接使用全部按钮
    const list = floorHidden ? all : visible.length > 0 ? visible : all;
    for (const button of list) {
      if (seenButtons.has(button)) continue;
      seenButtons.add(button);

      const payload = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
      if (!payload) continue;
      const rawPrompt = normalizeExternalPromptRawToken(payload);
      if (!rawPrompt) continue;
      const promptBodyNorm = normalizePromptBodyForCompare(rawPrompt);
      if (!promptBodyNorm) continue;

      const requestId = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
      const owner = button.closest('.mes') as HTMLElement | null;
      const ownerRoot = owner ?? (button.parentElement as HTMLElement | null) ?? null;
      let img: HTMLImageElement | null = null;
      let imageSource: 'request_id' | 'neighbor' = 'neighbor';

      if (requestId && ownerRoot) {
        const spans = Array.from(ownerRoot.querySelectorAll('.st-chatu8-image-span')) as HTMLElement[];
        const span =
          spans.find(
            node => String(node.dataset.requestId ?? node.getAttribute('data-request-id') ?? '').trim() === requestId,
          ) ?? null;
        const candidate = span?.querySelector('img') as HTMLImageElement | null;
        if (candidate && isRenderableStoryImage(candidate)) {
          img = candidate;
          imageSource = 'request_id';
        }
      }
      if (!img) {
        const candidate = findNextImageElement(button);
        if (candidate && isRenderableStoryImage(candidate)) img = candidate;
      }
      if (!img) continue;

      stChatu8Buttons.push({
        rawPrompt,
        promptBodyNorm,
        requestId,
        image: toResolvedDisplayedImage(img),
        imageSource,
      });
    }
  }

  const promptEls = roots.flatMap(root =>
    Array.from(root.querySelectorAll('pre, code, p, div, span')).filter(el =>
      normalizeForMatch(el.textContent ?? '').includes('###'),
    ),
  );

  const out: Record<string, ResolvedDisplayedImage[]> = {};

  for (const rawPrompt of prompts) {
    const bodyNeedle = normalizePromptBodyForCompare(rawPrompt);
    if (!bodyNeedle) continue;

    let mappedByButton: ResolvedDisplayedImage | null = null;
    let mappedByButtonMeta: {
      requestId: string;
      imageSource: 'request_id' | 'neighbor';
    } | null = null;
    for (let idx = stChatu8Buttons.length - 1; idx >= 0; idx -= 1) {
      const item = stChatu8Buttons[idx];
      if (!item.promptBodyNorm) continue;
      const matched = item.promptBodyNorm === bodyNeedle || isSameRawPromptToken(item.rawPrompt, rawPrompt);
      if (matched) {
        mappedByButton = item.image;
        mappedByButtonMeta = {
          requestId: item.requestId,
          imageSource: item.imageSource,
        };
        break;
      }
    }
    if (mappedByButton) {
      out[rawPrompt] = [mappedByButton];
      chatu8DebugLog('resolve_image_mapped', {
        messageId,
        source: 'button',
        imageSource: mappedByButtonMeta?.imageSource ?? 'neighbor',
        requestId: mappedByButtonMeta?.requestId ?? '',
        rawPromptLen: rawPrompt.length,
      });
      continue;
    }

    const el = promptEls.find(node => {
      if (!floorHidden && !isHostElementVisible(node)) return false;
      const textNorm = normalizePromptBodyForCompare(node.textContent ?? '');
      if (!textNorm) return false;
      return textNorm === bodyNeedle || isSameRawPromptToken(node.textContent ?? '', rawPrompt);
    });
    if (!el) {
      chatu8DebugLog('resolve_image_miss', {
        messageId,
        source: 'inline',
        rawPromptLen: rawPrompt.length,
      });
      continue;
    }

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
    if (!img) {
      chatu8DebugLog('resolve_image_miss', {
        messageId,
        source: 'inline_no_img',
        rawPromptLen: rawPrompt.length,
      });
      continue;
    }

    out[rawPrompt] = [toResolvedDisplayedImage(img)];
    chatu8DebugLog('resolve_image_mapped', {
      messageId,
      source: 'inline',
      rawPromptLen: rawPrompt.length,
    });
  }

  return out;
}

function collectStandaloneHostImages(messageId: number | null): ResolvedDisplayedImage[] {
  const roots = resolveHostMessageScopedRoots(messageId);
  if (roots.length === 0) return [];

  const floorHidden = isMessageFloorHidden(messageId);
  const out: ResolvedDisplayedImage[] = [];
  const seen = new Set<string>();
  const pushImage = (img: HTMLImageElement) => {
    if (!isRenderableStoryImage(img)) return;
    if (!floorHidden && !isHostElementVisible(img)) return;
    // 仅兜底 st-chatu8 相关图片，避免把普通插图误当作生图结果。
    if (!img.closest('.st-chatu8-image-span')) return;
    const resolved = toResolvedDisplayedImage(img);
    const sourceId = getImageSourceIdentity(resolved.src) || `${resolved.src}@@${resolved.alt}`;
    if (!sourceId) return;
    if (seen.has(sourceId)) return;
    seen.add(sourceId);
    out.push(resolved);
  };

  for (const root of roots) {
    const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    for (const img of imgs) {
      pushImage(img);
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
  chatu8DebugLog('segment_build', {
    segCount: segs.length,
    mappedKeys: Object.keys(mapped),
    mappedDetail: Object.entries(mapped).map(([k, v]) => ({ prompt: k.slice(0, 40), images: v.length })),
  });
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

  // 若提示词只存在于插件宿主按钮/LLM 回传（而不在正文文本中），也要在 UI 中展示加载占位或最终图片。
  const externalPromptSet = new Set(externalPromptRaws.value.map(item => String(item ?? '').trim()).filter(Boolean));
  const promptCandidates = Array.from(
    new Set([
      ...Object.keys(hostImageButtonStateByPrompt.value ?? {}),
      ...Object.keys(cachedImagesByPrompt.value ?? {}),
      ...externalPromptSet,
    ]),
  );
  for (const prompt of promptCandidates) {
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
    if (!hostState.found && !isImagePromptLoading(rawPrompt) && !externalPromptSet.has(rawPrompt)) continue;
    out.push({
      key: `img_prompt_host_${id++}`,
      className: 'image-prompt',
      text: rawPrompt,
      imagePromptRaw: rawPrompt,
    });
  }

  // 兜底：当插件已在楼层 DOM 里渲染出图片，但缺少 prompt/event 映射时，仍展示图片。
  for (const image of standaloneHostImages.value) {
    const sourceId = getImageSourceIdentity(image.src);
    if (sourceId && renderedImageSources.has(sourceId)) continue;
    if (sourceId) renderedImageSources.add(sourceId);
    out.push({
      key: `img_host_standalone_${id++}`,
      isImage: true,
      imageUrl: image.src,
      altText: image.alt || '生成图片',
      text: image.src,
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
  if (messageId !== lastStoryMessageId) {
    if (lastStoryMessageId !== null) {
      clearPendingChatu8Requests('message_changed');
    }
    lastStoryMessageId = messageId;
    externalPromptRaws.value = [];
    generatedImagesByPrompt.value = {};
    cachedImagesByPrompt.value = {};
    standaloneHostImages.value = [];
    imagePromptUi.value = {};
  }

  const normalizedRaw = normalizeInjectedRaw(props.raw ?? '');
  const mainText = extractMainStoryText(normalizedRaw);
  const text = normalizeStoryText(mainText);
  const allPromptMatches = collectImagePromptMatches(text);
  const storyPrompts = allPromptMatches.map(m => m.raw);
  chatu8DebugLog('prompt_extraction', {
    messageId,
    rawLen: props.raw?.length ?? 0,
    normalizedLen: normalizedRaw.length,
    mainTextLen: mainText.length,
    textLen: text.length,
    promptCount: allPromptMatches.length,
    prompts: allPromptMatches.map(m => ({ raw: m.raw.slice(0, 50), index: m.index })),
  });
  const domPromptsRaw = collectPromptRawsFromDisplayedButtons(messageId);
  const domPrompts =
    storyPrompts.length > 0
      ? domPromptsRaw.filter(rawPrompt =>
          storyPrompts.some(storyPrompt => isSameRawPromptToken(storyPrompt, rawPrompt)),
        )
      : domPromptsRaw.slice(-1);
  const prompts = Array.from(new Set([...storyPrompts, ...domPrompts, ...externalPromptRaws.value]));

  let canceled = false;
  const timers: number[] = [];
  const observers: MutationObserver[] = [];

  const run = () => {
    if (canceled) return;
    const next = resolveImagesFromDisplayedMessage(messageId, prompts);
    const nextHostState = resolveHostImageButtonState(messageId, prompts);
    const nextStandalone = collectStandaloneHostImages(messageId);
    // 只有在结果有变化时才写入，避免无意义触发重渲染
    const prev = resolvedImagesByPrompt.value ?? {};
    const prevJson = JSON.stringify(prev);
    const nextJson = JSON.stringify(next);
    if (prevJson !== nextJson) resolvedImagesByPrompt.value = next;
    const prevHostJson = JSON.stringify(hostImageButtonStateByPrompt.value ?? {});
    const nextHostJson = JSON.stringify(nextHostState);
    if (prevHostJson !== nextHostJson) hostImageButtonStateByPrompt.value = nextHostState;
    const prevStandaloneJson = JSON.stringify(standaloneHostImages.value ?? []);
    const nextStandaloneJson = JSON.stringify(nextStandalone);
    if (prevStandaloneJson !== nextStandaloneJson) standaloneHostImages.value = nextStandalone;
  };

  // 立即尝试一次，并在短时间内再重试（生图 DOM 插入通常是异步的）
  run();
  timers.push(window.setTimeout(run, 600));
  timers.push(window.setTimeout(run, 2000));
  timers.push(window.setTimeout(run, 5000));

  // DOM 扫描之后，尝试从插件缓存补全未命中的 prompt 图片
  const tryCacheQuery = () => {
    if (canceled) return;
    const resolved = resolvedImagesByPrompt.value ?? {};
    const generated = generatedImagesByPrompt.value ?? {};
    const missingPrompts = prompts.filter(p => {
      const hasResolved = Array.isArray(resolved[p]) && resolved[p].length > 0;
      const hasGenerated = Array.isArray(generated[p]) && generated[p].length > 0;
      return !hasResolved && !hasGenerated;
    });
    if (missingPrompts.length === 0 && Object.keys(cachedImagesByPrompt.value ?? {}).length > 0) return;

    void queryChatu8Cache(messageId, prompts).then(result => {
      if (canceled) return;
      const prevCacheJson = JSON.stringify(cachedImagesByPrompt.value ?? {});
      const nextCacheJson = JSON.stringify(result);
      if (prevCacheJson !== nextCacheJson) cachedImagesByPrompt.value = result;
    });
  };
  // 首次加载和延迟重试时都尝试缓存查询
  timers.push(window.setTimeout(tryCacheQuery, 800));
  timers.push(window.setTimeout(tryCacheQuery, 3000));

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
  void probeChatu8Bridge(420, true);
  exposeChatu8DebugSwitch();
  chatu8RuntimeTimer = window.setInterval(() => {
    refreshChatu8RuntimeConfig();
    if (chatu8BridgeReady !== true) {
      void probeChatu8Bridge(280, true);
    }
  }, 1500);
});

onBeforeUnmount(() => {
  clearPendingChatu8Requests('component_unmount');
  if (chatu8RuntimeTimer !== null) {
    window.clearInterval(chatu8RuntimeTimer);
    chatu8RuntimeTimer = null;
  }
  chatu8BridgeProbePending = null;
  chatu8BridgeReady = null;
  chatu8BridgeLastProbeAt = 0;
  cleanupChatu8DebugSwitch();
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

.image-prompt-proxy-btn {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.image-prompt-proxy-btn.is-loading {
  opacity: 0.7;
}

.image-prompt-proxy-btn i {
  font-size: 0.85em;
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
  flex-wrap: wrap;
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
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.story-mini-tabs::-webkit-scrollbar {
  display: none;
}

.story-mini-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
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
  margin-left: auto;
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
  .story-toolbar {
    flex-wrap: wrap;
    align-items: stretch;
    gap: 6px;
  }

  .story-mini-tabs {
    flex: 1 1 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;
  }

  .story-mini-tabs::-webkit-scrollbar {
    display: none;
  }

  .story-mini-tab {
    flex: 0 0 auto;
  }

  .story-toolbar-actions {
    flex: 1 1 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px;
    align-items: center;
  }

  .story-zoom-controls {
    min-width: 0;
  }

  .story-image-menu-btn {
    width: 100%;
    min-width: 0;
    padding: 0 6px;
    font-size: 0.64em;
    overflow: hidden;
    text-overflow: ellipsis;
  }

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

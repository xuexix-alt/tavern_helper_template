<template>
  <article class="message-shell" :class="[`is-${item.role}`, `density-${density}`, `font-${fontMode}`]">
    <div v-if="item.role === 'system'" class="system-message clip-corner-sm">
      <span class="system-icon">⚠</span>
      <span class="system-text">[ SYS_ALERT ] {{ item.content || '(系统消息)' }}</span>
    </div>

    <template v-else-if="item.role === 'user'">
      <div class="user-wrap">
        <div class="user-message">{{ item.content || '(空消息)' }}</div>
      </div>

      <div v-if="showEditRegenerate || item.canDeleteFrom || item.canOpenDetail" class="message-actions user-actions">
        <button
          v-if="showEditRegenerate && !isEditingUser"
          type="button"
          class="action-btn clip-corner-sm"
          :disabled="busy"
          @click="emit('start-edit', item)"
        >
          改词重生
        </button>
        <button
          v-if="item.canDeleteFrom && !showRollbackConfirm"
          type="button"
          class="action-btn danger clip-corner-sm"
          :disabled="busy"
          @click="emit('request-rollback', item)"
        >
          回退删除
        </button>
        <template v-if="item.canDeleteFrom && showRollbackConfirm">
          <span class="rollback-tip">删除当前及后续所有楼层</span>
          <button
            type="button"
            class="action-btn danger clip-corner-sm"
            :disabled="busy"
            @click="emit('confirm-rollback', item)"
          >
            确认回退
          </button>
          <button type="button" class="action-btn clip-corner-sm" :disabled="busy" @click="emit('cancel-rollback')">
            取消
          </button>
        </template>
        <button
          v-if="item.canOpenDetail"
          type="button"
          class="action-btn clip-corner-sm"
          @click="emit('open-detail', item)"
        >
          详情
        </button>
      </div>

      <div v-if="isEditingUser" class="editor-wrap">
        <textarea
          :value="editDraft"
          class="inline-editor"
          rows="4"
          placeholder="修改并确认后，重新生成"
          @input="onEditInput"
        />
        <div class="editor-actions">
          <button
            type="button"
            class="action-btn clip-corner-sm"
            :disabled="busy || !trimmedEditDraft"
            @click="emit('confirm-edit', item)"
          >
            确认重生</button
          ><button type="button" class="action-btn clip-corner-sm" :disabled="busy" @click="emit('cancel-edit')">
            取消
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <section
        class="assistant-card clip-corner"
        :class="{ 'is-streaming': item.isStreaming, 'is-collapsed': !expanded }"
        :data-message-id="item.message_id"
        @pointerdown.capture="handleAssistantCardImageIntent"
        @click.capture="handleAssistantCardImageIntent"
      >
        <div class="assistant-corners tl"></div>
        <div class="assistant-corners tr"></div>
        <div class="assistant-corners bl"></div>
        <div class="assistant-corners br"></div>

        <div class="assistant-card-controls is-top">
          <button
            type="button"
            class="assistant-control-btn clip-corner-sm"
            :aria-expanded="expanded"
            @click="emit('toggle-expanded', item)"
          >
            {{ expanded ? '折叠' : '展开' }}
          </button>
          <button
            v-if="item.canOpenDetail"
            type="button"
            class="assistant-control-btn is-detail clip-corner-sm"
            @click="emit('open-detail', item)"
          >
            详情
          </button>
        </div>

        <div
          class="assistant-body-wrap"
          :class="{ 'is-collapsed': !expanded }"
          @click.capture="handleAssistantBodyNativeImageClick"
          @dblclick.capture="handleAssistantBodyNativeImageDoubleClick"
          @pointerdown.capture="handleAssistantBodyNativeImagePointerDown"
          @pointermove.capture="handleAssistantBodyNativeImagePointerMove"
          @pointerup.capture="handleAssistantBodyNativeImagePointerUp"
          @pointercancel.capture="handleAssistantBodyNativeImagePointerCancel"
        >
          <div
            ref="assistantBodyRef"
            class="assistant-body html-body mes_text is-stream-stage"
            :data-message-id="item.message_id"
            :data-message-index="item.message_id"
            @click.capture="handleAssistantBodyNativeImageClick"
            @dblclick.capture="handleAssistantBodyNativeImageDoubleClick"
            @pointerdown.capture="handleAssistantBodyNativeImagePointerDown"
            @pointermove.capture="handleAssistantBodyNativeImagePointerMove"
            @pointerup.capture="handleAssistantBodyNativeImagePointerUp"
            @pointercancel.capture="handleAssistantBodyNativeImagePointerCancel"
            v-if="item.isStreaming"
          >
            <StreamRenderer
              :message="item.content"
              :role="item.role"
              :active="item.isStreaming"
              :message-id="item.message_id"
            />
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-else
            v-html="displayedAssistantHtml"
            ref="assistantBodyRef"
            class="assistant-body html-body mes_text"
            :data-message-id="item.message_id"
            :data-message-index="item.message_id"
            @click.capture="handleAssistantBodyNativeImageClick"
            @dblclick.capture="handleAssistantBodyNativeImageDoubleClick"
            @pointerdown.capture="handleAssistantBodyNativeImagePointerDown"
            @pointermove.capture="handleAssistantBodyNativeImagePointerMove"
            @pointerup.capture="handleAssistantBodyNativeImagePointerUp"
            @pointercancel.capture="handleAssistantBodyNativeImagePointerCancel"
          ></div>
        </div>

        <div class="assistant-card-controls is-bottom">
          <button
            type="button"
            class="assistant-control-btn clip-corner-sm"
            :aria-expanded="expanded"
            @click="emit('toggle-expanded', item)"
          >
            {{ expanded ? '折叠' : '展开' }}
          </button>
          <button
            v-if="item.canOpenDetail"
            type="button"
            class="assistant-control-btn is-detail clip-corner-sm"
            @click="emit('open-detail', item)"
          >
            详情
          </button>
        </div>
      </section>
    </template>
  </article>
</template>

<script setup lang="ts">
import { recordComponentDebugTrace } from '../debugTrace';
import type { GeneratedImageActivationPayload } from '../generatedImageActivation';
import { parseGeneratedImageActivationPayload } from '../generatedImageActivation';
import {
  createGeneratedImageGestureController,
  type GeneratedImageGesturePoint,
} from '../generatedImageGestureController';
import {
  collectReachableHostDocuments,
  isBridgedEvent,
  normalizeImageDataToSrc,
  normalizeImageSrcForCompare,
  readChatMessageDetail,
} from '../hostBridge';
import { getFallbackImageClasses } from '../imageFallbackClasses';
import {
  sanitizeSameLayerPluginNativeRequestIdElements,
  sanitizeSameLayerPluginNativeRequestIds,
} from '../pluginNativeImageDom';
import {
  stripVisibleChatu8PromptTokensHtml,
  preserveChatu8PromptTokenPlacementMarkersHtml,
} from '../chatu8PromptTokenDisplay';
import type { TranscriptImageHydrationMode } from '../transcriptImageHydrationMode';
import type { ReaderFontMode, ReaderGalleryEntry, TranscriptDensity, TranscriptItem } from '../types';
import StreamRenderer from './StreamRenderer.vue';

const DIRECT_HOST_IMAGE_BACKFILL_DELAYS_MS = [0, 300, 900, 1800, 3600, 7200, 15000] as const;
const PLUGIN_NATIVE_CARRIER_SELECTOR = '.st-chatu8-image-span, span.image-tag-placeholder';
const PLUGIN_NATIVE_BUTTON_SELECTOR =
  'button.image-tag-button, button.st-chatu8-image-button, .st-chatu8-image-button[role="button"]';

const props = defineProps<{
  item: TranscriptItem;
  density: TranscriptDensity;
  fontMode: ReaderFontMode;
  busy?: boolean;
  isEditingUser?: boolean;
  editDraft?: string;
  showEditRegenerate?: boolean;
  showRollbackConfirm?: boolean;
  galleryEntries?: ReaderGalleryEntry[];
  showTailGalleryImages?: boolean;
  imageHydrationMode?: TranscriptImageHydrationMode;
  expanded?: boolean;
}>();

const emit = defineEmits<{
  (event: 'open-detail', item: TranscriptItem): void;
  (event: 'toggle-expanded', item: TranscriptItem): void;
  (event: 'image-intent', item: TranscriptItem): void;
  (event: 'image-view', payload: GeneratedImageActivationPayload): void;
  (event: 'image-regenerate', payload: GeneratedImageActivationPayload): void;
  (event: 'image-tag', payload: GeneratedImageActivationPayload): void;
  (event: 'generate-image', messageId: number): void;
  (event: 'start-edit', item: TranscriptItem): void;
  (event: 'update-edit-draft', value: string): void;
  (event: 'confirm-edit', item: TranscriptItem): void;
  (event: 'cancel-edit'): void;
  (event: 'request-rollback', item: TranscriptItem): void;
  (event: 'confirm-rollback', item: TranscriptItem): void;
  (event: 'cancel-rollback'): void;
}>();

const assistantBodyRef = ref<HTMLElement | null>(null);
const assistantBodyCleanup = ref<Array<() => void>>([]);
const assistantBodyDelegatedGestureDisposers = ref<Array<() => void>>([]);
const directHostBackfillTimers = ref<number[]>([]);
const fallbackImageClasses = getFallbackImageClasses();
const trimmedEditDraft = computed(() => String(props.editDraft ?? '').trim());
const expanded = computed(() => props.expanded !== false);
const imageHydrationMode = computed<TranscriptImageHydrationMode>(() => props.imageHydrationMode ?? 'host-rendered-only');
const displayedAssistantHtml = computed(() => {
  if (props.item.role !== 'assistant') return '';
  // 完成态才走 v-html；流式态由 StreamRenderer 接管，这里仍保留一次清理以兼容未来复用路径。
  let html = props.item.finalHtml || '<p>(空回复)</p>';
  // 修复：保留提示词标记供图片占位符匹配使用
  const processed = preserveChatu8PromptTokenPlacementMarkersHtml(html);
  // 降级：如果处理后为空，使用原始HTML
  html = processed.trim() ? processed : html;
  return sanitizeSameLayerPluginNativeRequestIds(stripVisibleChatu8PromptTokensHtml(html));
});
const assistantBodySignature = computed(() => {
  if (props.item.role !== 'assistant') return `role:${props.item.role}:${props.item.message_id}`;
  return [props.item.message_id, props.item.isStreaming ? 'stream' : 'final', props.item.phase].join('::');
});
const galleryEntrySignature = computed(() =>
  (props.galleryEntries ?? [])
    .map(entry =>
      [
        entry.id,
        entry.messageId,
        entry.requestId ?? '',
        entry.markerId ?? '',
        entry.promptToken ?? '',
        String(entry.src ?? '').slice(0, 96),
        String(entry.src ?? '').length,
      ].join(':'),
    )
    .join('|'),
);

function recordComponentTrace(event: string, payload: Record<string, unknown> = {}) {
  recordComponentDebugTrace({
    scope: 'TranscriptMessageCard',
    event,
    payload: {
      messageId: props.item.message_id,
      variant: props.item.role,
      phase: props.item.phase,
      isStreaming: props.item.isStreaming,
      ...payload,
    },
  });
}

function collectNativePromptTokenScanState(root: HTMLElement) {
  const promptTokenMarkers = Array.from(
    root.querySelectorAll('[data-chatu8-native-prompt-token="true"]'),
  ) as HTMLElement[];
  const promptButtons = Array.from(
    root.querySelectorAll(
      'button.image-tag-button, button.st-chatu8-image-button, .st-chatu8-image-button[role="button"]',
    ),
  ) as HTMLElement[];
  const promptPlaceholders = Array.from(
    root.querySelectorAll('.st-chatu8-image-span, span.image-tag-placeholder'),
  ) as HTMLElement[];
  const readyImages = Array.from(
    root.querySelectorAll('.st-chatu8-image-span img, span.image-tag-placeholder img, .ai-image-container img'),
  ) as HTMLImageElement[];

  return {
    promptTokenMarkerCount: promptTokenMarkers.length,
    promptButtonCount: promptButtons.length,
    promptPlaceholderCount: promptPlaceholders.length,
    readyImageCount: readyImages.length,
    promptTokenSamples: promptTokenMarkers.slice(0, 4).map(marker =>
      String(marker.textContent ?? '')
        .replace(/\s+/g, ' ')
        .slice(0, 96),
    ),
  };
}

function recordNativePromptTokenScanState(reason: string) {
  const root = assistantBodyRef.value;
  if (!root || props.item.role !== 'assistant') return;
  recordComponentTrace('native_prompt_token_scan', {
    reason,
    ...collectNativePromptTokenScanState(root),
  });
}

function onEditInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  if (!target) return;
  emit('update-edit-draft', target.value);
}

function isAssistantControlEventTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest?.('.assistant-card-controls, .assistant-control-btn'));
}

function handleAssistantCardImageIntent(event: Event) {
  if (isAssistantControlEventTarget(event.target)) return;
  emit('image-intent', props.item);
}

function refreshAssistantBodyImagePresentation() {
  const root = assistantBodyRef.value;
  if (!root) return;
  sanitizeSameLayerPluginNativeRequestIdElements(root);
  root.classList.toggle('hide-tail-gallery-images', props.showTailGalleryImages === false);
  recordComponentTrace('refresh_image_presentation');
}

function encodeDatasetValue(value: string): string {
  return encodeURIComponent(String(value ?? ''));
}

function createGalleryEntryFigure(entry: ReaderGalleryEntry): HTMLElement | null {
  const src = String(entry.src ?? '').trim();
  if (!src) return null;

  const figure = document.createElement('figure');
  figure.className = fallbackImageClasses.inline;
  figure.dataset.messageId = String(entry.messageId);
  figure.dataset.imageId = entry.imageId ?? '';
  figure.dataset.markerId = entry.markerId ?? '';
  figure.dataset.promptToken = entry.promptToken ?? '';
  figure.dataset.requestId = entry.requestId ?? '';
  figure.dataset.imageSrc = encodeDatasetValue(src);
  figure.dataset.source = 'transcript';

  const image = document.createElement('img');
  image.src = src;
  image.alt = entry.alt || entry.title || 'generated image';
  image.loading = 'lazy';
  image.dataset.messageId = String(entry.messageId);
  image.dataset.imageId = entry.imageId ?? '';
  image.dataset.markerId = entry.markerId ?? '';
  image.dataset.promptToken = entry.promptToken ?? '';
  image.dataset.requestId = entry.requestId ?? '';
  image.dataset.imageSrc = encodeDatasetValue(src);
  image.dataset.source = 'transcript';

  figure.append(image);
  return figure;
}

function normalizeImageIdentity(value: unknown): string {
  return String(value ?? '').trim();
}

function collectImageIdentityKeysFromElement(element: HTMLElement | HTMLImageElement): string[] {
  const dataset = element.dataset ?? {};
  const keys = [
    dataset.imageId ? `image:${dataset.imageId}` : '',
    dataset.markerId ? `marker:${dataset.markerId}` : '',
    dataset.requestId ? `request:${dataset.requestId}` : '',
    dataset.imageSrc ? `src:${dataset.imageSrc}` : '',
  ];
  if (element instanceof HTMLImageElement) {
    const src = normalizeImageIdentity(element.getAttribute('src') || element.currentSrc || element.src);
    if (src) keys.push(`src:${encodeDatasetValue(src)}`);
  }
  return keys.filter(Boolean);
}

function collectExistingGalleryImageKeys(root: HTMLElement): Set<string> {
  const keys = new Set<string>();
  const carriers = Array.from(
    root.querySelectorAll(`.${fallbackImageClasses.inline}, .${fallbackImageClasses.item}`),
  ) as HTMLElement[];
  for (const carrier of carriers) {
    for (const key of collectImageIdentityKeysFromElement(carrier)) keys.add(key);
    const image = carrier.querySelector('img') as HTMLImageElement | null;
    if (image) {
      for (const key of collectImageIdentityKeysFromElement(image)) keys.add(key);
    }
  }
  return keys;
}

function collectGalleryEntryKeys(entry: ReaderGalleryEntry): string[] {
  const src = normalizeImageIdentity(entry.src);
  return [
    entry.imageId ? `image:${entry.imageId}` : '',
    entry.markerId ? `marker:${entry.markerId}` : '',
    entry.requestId ? `request:${entry.requestId}` : '',
    src ? `src:${encodeDatasetValue(src)}` : '',
  ].filter(Boolean);
}

function summarizeGalleryEntryForHydrationDebug(entry: ReaderGalleryEntry, index: number): Record<string, unknown> {
  const src = String(entry.src ?? '').trim();
  return {
    index,
    id: String(entry.id ?? '').slice(0, 80),
    messageId: entry.messageId,
    requestId: String(entry.requestId ?? '').slice(0, 80),
    markerId: String(entry.markerId ?? '').slice(0, 80),
    imageId: String(entry.imageId ?? '').slice(0, 80),
    promptTokenHead: String(entry.promptToken ?? '').replace(/\s+/g, ' ').slice(0, 120),
    hasSrc: Boolean(src),
    srcLength: src.length,
  };
}

function summarizePendingGalleryTargetForHydrationDebug(
  target: PendingGalleryImageTarget,
  index: number,
): Record<string, unknown> {
  return {
    index,
    kind: target.kind,
    tokenHead: target.tokenCompare.slice(0, 120),
    tagName: target.element.tagName,
    className: String(target.element.className ?? '').slice(0, 120),
  };
}

function isChatu8ImageRecord(input: unknown): input is Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  return ['src', 'image', 'imageData', 'path', 'url', 'prompt', 'tag', 'promptToken', 'requestId', 'request_id'].some(
    key => Object.prototype.hasOwnProperty.call(input, key),
  );
}

function flattenChatu8ImageRecords(input: unknown): Record<string, any>[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.flatMap(item => flattenChatu8ImageRecords(item));
  if (isChatu8ImageRecord(input)) return [input];
  if (typeof input === 'object')
    return Object.values(input as Record<string, unknown>).flatMap(item => flattenChatu8ImageRecords(item));
  return [];
}

function normalizeDirectHostPromptToken(entry: Record<string, any>): string {
  const token = String(entry.promptToken ?? entry.tag ?? '').trim();
  if (token) return token;
  const prompt = String(entry.prompt ?? '').trim();
  return prompt ? `image###${prompt}###` : '';
}

function collectDirectHostExtraImageEntries(): ReaderGalleryEntry[] {
  const messageId = Math.trunc(Number(props.item.message_id));
  if (!Number.isFinite(messageId) || messageId < 0) return [];
  const message = readChatMessageDetail(props.item.message_id);
  const swipeId = Number.isFinite(Number(message?.swipe_id)) ? Math.trunc(Number(message.swipe_id)) : 0;
  const rawSources = [
    message?.extra?.images?.[swipeId],
    message?.extra?.images,
    message?.swipe_info?.[swipeId]?.images,
  ];
  const records = rawSources.flatMap(flattenChatu8ImageRecords);
  const out: ReaderGalleryEntry[] = [];
  const seen = new Set<string>();

  records.forEach((entry, index) => {
    const src = normalizeImageDataToSrc(entry.src ?? entry.image ?? entry.imageData ?? entry.path ?? entry.url);
    const normalizedSrc = normalizeImageSrcForCompare(src);
    if (!normalizedSrc || seen.has(normalizedSrc)) return;
    seen.add(normalizedSrc);
    const requestId = String(entry.requestId ?? entry.request_id ?? '').trim();
    const promptToken = normalizeDirectHostPromptToken(entry);
    const imageId = String(entry.imageId ?? entry.image_id ?? '').trim() || requestId || promptToken || normalizedSrc;
    out.push({
      id: `direct-extra-${messageId}-${requestId || index}`,
      messageId,
      imageId,
      requestId: requestId || undefined,
      promptToken,
      anchorText: String(entry.regex ?? entry.anchorText ?? '').trim() || undefined,
      title: `楼层 #${messageId} · 图 ${index + 1}`,
      createdOrder: messageId * 100 + index,
      canRegenerate: Boolean(requestId || promptToken),
      src,
      alt: String(entry.alt ?? 'generated image').trim() || 'generated image',
    });
  });

  return out;
}

function resolvePluginPromptCarrierForImageContainer(carrier: HTMLElement | null): HTMLElement | null {
  if (!carrier) return null;
  const hasPromptPayload = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    if (!element.matches?.('button.image-tag-button, .st-chatu8-image-button')) return false;
    return Boolean(
      String(
        element.dataset.imageTag ??
          element.dataset.link ??
          element.getAttribute('data-image-tag') ??
          element.getAttribute('data-link') ??
          '',
      ).trim(),
    );
  };

  let sibling = carrier.previousElementSibling;
  while (sibling) {
    if (sibling.matches?.('button.image-tag-button, .st-chatu8-image-button') && hasPromptPayload(sibling)) {
      return sibling as HTMLElement;
    }
    sibling = sibling.previousElementSibling;
  }

  const parent = carrier.parentElement;
  const candidates = Array.from(parent?.querySelectorAll('button.image-tag-button, .st-chatu8-image-button') ?? []);
  return candidates.find(hasPromptPayload) ?? null;
}

function collectDirectHostDomImageEntries(): ReaderGalleryEntry[] {
  const messageId = Math.trunc(Number(props.item.message_id));
  if (!Number.isFinite(messageId) || messageId < 0) return [];
  const out: ReaderGalleryEntry[] = [];
  const seen = new Set<string>();

  const pushImage = (image: HTMLImageElement, carrier: HTMLElement | null, indexHint: number) => {
    const src = normalizeImageSrcForCompare(image.getAttribute('src') ?? image.currentSrc ?? '');
    if (!src || seen.has(src)) return;
    if (!src.startsWith('data:image') && !src.startsWith('blob:') && !src.startsWith('http') && !src.startsWith('/')) {
      return;
    }
    seen.add(src);
    const promptCarrier = resolvePluginPromptCarrierForImageContainer(carrier);
    const requestId = String(
      image.dataset.requestId ??
        carrier?.dataset.requestId ??
        promptCarrier?.dataset.requestId ??
        image.getAttribute('data-request-id') ??
        carrier?.getAttribute('data-request-id') ??
        promptCarrier?.getAttribute('data-request-id') ??
        '',
    ).trim();
    const promptToken = String(
      promptCarrier?.dataset.imageTag ??
        promptCarrier?.dataset.link ??
        promptCarrier?.getAttribute('data-image-tag') ??
        promptCarrier?.getAttribute('data-link') ??
        carrier?.dataset.imageTag ??
        carrier?.dataset.link ??
        carrier?.getAttribute('data-image-tag') ??
        carrier?.getAttribute('data-link') ??
        '',
    ).trim();
    out.push({
      id: `direct-dom-${messageId}-${requestId || indexHint}`,
      messageId,
      imageId: requestId || promptToken || src,
      requestId: requestId || undefined,
      promptToken,
      title: `楼层 #${messageId} · 图 ${out.length + 1}`,
      createdOrder: messageId * 100 + out.length,
      canRegenerate: Boolean(requestId || promptToken),
      src,
      alt: image.getAttribute('alt') ?? image.getAttribute('title') ?? 'generated image',
    });
  };

  for (const doc of collectReachableHostDocuments().filter(doc => doc !== document)) {
    const roots = Array.from(
      doc.querySelectorAll(`.mes[data-message-id='${messageId}'], .mes[mesid='${messageId}']`),
    ) as HTMLElement[];
    for (const root of roots) {
      const images = Array.from(
        root.querySelectorAll('.ai-image-container img, .st-chatu8-image-container img, .image-tag-placeholder img'),
      ) as HTMLImageElement[];
      images.forEach((image, index) => {
        const carrier = image.closest(
          '.ai-image-container, .st-chatu8-image-container, .image-tag-placeholder, .st-chatu8-image-span',
        ) as HTMLElement | null;
        pushImage(image, carrier, index);
      });
    }
  }

  return out;
}

function collectDirectHostBackfillEntries(): ReaderGalleryEntry[] {
  const out: ReaderGalleryEntry[] = [];
  const seen = new Set<string>();
  const push = (entry: ReaderGalleryEntry) => {
    const src = normalizeImageSrcForCompare(entry.src);
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push(entry);
  };

  collectDirectHostExtraImageEntries().forEach(push);
  collectDirectHostDomImageEntries().forEach(push);
  return out;
}

function ensureGalleryRecoveryStrip(root: HTMLElement): HTMLElement {
  let strip = root.querySelector('[data-gallery-recovery-strip="true"]') as HTMLElement | null;
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'assistant-inline-image-strip';
    strip.setAttribute('data-gallery-recovery-strip', 'true');
    root.append(strip);
  }
  return strip;
}

function appendMissingGalleryFigure(root: HTMLElement, entry: ReaderGalleryEntry): boolean {
  const figure = createGalleryEntryFigure(entry);
  if (!figure) return false;
  ensureGalleryRecoveryStrip(root).append(figure);
  return true;
}

function hasReadyGalleryEntries(): boolean {
  return (props.galleryEntries ?? []).some(entry => String(entry.src ?? '').trim());
}

function shouldRunDirectHostBackfill(): boolean {
  return (
    shouldRunTranscriptImageFallbacks() &&
    props.showTailGalleryImages !== false &&
    props.item.role === 'assistant' &&
    !props.item.isStreaming &&
    !hasReadyGalleryEntries()
  );
}

function shouldRunTranscriptImageFallbacks(): boolean {
  return imageHydrationMode.value === 'compat';
}

function hydrateDirectHostBackfillImages(reason = 'direct_host_backfill'): boolean {
  const root = assistantBodyRef.value;
  if (!root || props.item.role !== 'assistant' || props.item.isStreaming) return false;
  const existingKeys = collectExistingGalleryImageKeys(root);
  const entries = collectDirectHostBackfillEntries().filter(entry => {
    const keys = collectGalleryEntryKeys(entry);
    return keys.length > 0 && !keys.some(key => existingKeys.has(key));
  });
  if (entries.length === 0) return false;

  let appended = 0;
  for (const entry of entries) {
    if (appendMissingGalleryFigure(root, entry)) appended += 1;
  }
  if (appended > 0) {
    recordComponentTrace('direct_host_backfill_images', { reason, candidateCount: entries.length, appended });
    void nextTick().then(() => {
      refreshAssistantBodyImagePresentation();
      bindAssistantBodyInteractions();
    });
  }
  return appended > 0;
}

function clearDirectHostBackfillTimers() {
  for (const timer of directHostBackfillTimers.value) window.clearTimeout(timer);
  directHostBackfillTimers.value = [];
}

function scheduleDirectHostBackfillImages(reason = 'direct_host_backfill') {
  clearDirectHostBackfillTimers();
  if (!shouldRunDirectHostBackfill()) return;
  for (const delayMs of DIRECT_HOST_IMAGE_BACKFILL_DELAYS_MS) {
    const run = () => {
      if (!shouldRunDirectHostBackfill()) return false;
      const appended = hydrateDirectHostBackfillImages(`${reason}:${delayMs}`);
      if (appended) clearDirectHostBackfillTimers();
      return appended;
    };
    if (delayMs <= 0) {
      if (run()) break;
      continue;
    }
    const timer = window.setTimeout(run, delayMs);
    directHostBackfillTimers.value.push(timer);
  }
}

type PendingGalleryImageTarget = {
  element: HTMLElement;
  tokenCompare: string;
  kind: 'raw-image' | 'native-prompt-token';
};

function normalizePromptTokenForInlineCompare(value: unknown): string {
  const source = String(value ?? '').trim();
  if (!source) return '';
  const match = source.match(/([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/);
  const token = String(match?.[0] ?? source).trim();
  return token
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function resolveInlinePlacementTarget(element: HTMLElement): HTMLElement {
  const parent = element.parentElement;
  const parentOnlyContainsMarker =
    parent?.tagName === 'P' && String(parent.textContent ?? '').trim() === String(element.textContent ?? '').trim();
  return parentOnlyContainsMarker ? parent : element;
}

function collectPendingGalleryImageTargets(root: HTMLElement): PendingGalleryImageTarget[] {
  const rawTargets = Array.from(root.querySelectorAll('[data-raw-image-tag="true"]')) as HTMLElement[];
  const nativePromptTargets = Array.from(
    root.querySelectorAll('[data-chatu8-native-prompt-token="true"]'),
  ) as HTMLElement[];

  // 过滤：排除已经有相邻图片的提示词标记（避免重复插入）
  const filteredNativePromptTargets = nativePromptTargets.filter(element => {
    // 检查提示词标记的下一个兄弟节点是否已经是图片容器
    const nextSibling = element.nextElementSibling;
    if (nextSibling) {
      // 如果下一个元素是图片容器（插件已处理），跳过这个标记
      if (nextSibling.matches('.st-chatu8-image-span, .image-tag-placeholder, figure.assistant-inline-image')) {
        return false;
      }
      // 如果下一个元素包含图片，也跳过
      if (nextSibling.querySelector('img')) {
        return false;
      }
    }
    return true;
  });

  return [
    ...rawTargets.map(element => ({ element, kind: 'raw-image' as const })),
    ...filteredNativePromptTargets.map(element => ({ element, kind: 'native-prompt-token' as const })),
  ].map(({ element, kind }) => ({
    element: resolveInlinePlacementTarget(element),
    tokenCompare: normalizePromptTokenForInlineCompare(element.textContent ?? element.dataset.promptToken ?? ''),
    kind,
  }));
}

function takePendingGalleryImageTarget(
  targets: PendingGalleryImageTarget[],
  entry: ReaderGalleryEntry,
): PendingGalleryImageTarget | null {
  const tokenCompare = normalizePromptTokenForInlineCompare(entry.promptToken);
  const index = tokenCompare ? targets.findIndex(target => target.tokenCompare === tokenCompare) : 0;
  if (index < 0) return null;
  const [target] = targets.splice(index, 1);
  return target ?? null;
}

function hydratePendingImagesFromGalleryEntries() {
  const root = assistantBodyRef.value;
  if (!root || props.item.role !== 'assistant' || props.item.isStreaming) return;
  sanitizeSameLayerPluginNativeRequestIdElements(root);
  const tailGalleryHidden = props.showTailGalleryImages === false;
  const rawGalleryEntryCount = props.galleryEntries?.length ?? 0;
  const entries = (props.galleryEntries ?? []).filter(entry => String(entry.src ?? '').trim());
  if (entries.length === 0) {
    recordComponentTrace('hydrate_pending_gallery_images_probe', {
      stage: 'no_ready_gallery_entries',
      tailGalleryHidden,
      rawGalleryEntryCount,
      readyGalleryEntryCount: 0,
    });
    return;
  }
  const existingKeys = collectExistingGalleryImageKeys(root);
  const missingEntries = entries.filter(entry => {
    const keys = collectGalleryEntryKeys(entry);
    return keys.length > 0 && !keys.some(key => existingKeys.has(key));
  });
  if (missingEntries.length === 0) {
    recordComponentTrace('hydrate_pending_gallery_images_probe', {
      stage: 'no_missing_gallery_entries',
      tailGalleryHidden,
      rawGalleryEntryCount,
      readyGalleryEntryCount: entries.length,
      existingKeyCount: existingKeys.size,
      readyEntrySamples: entries.slice(0, 6).map(summarizeGalleryEntryForHydrationDebug),
    });
    return;
  }

  const targets = collectPendingGalleryImageTargets(root);
  recordComponentTrace('hydrate_pending_gallery_images_probe', {
    stage: 'before_placeholder_replacement',
    tailGalleryHidden,
    rawGalleryEntryCount,
    readyGalleryEntryCount: entries.length,
    missingEntryCount: missingEntries.length,
    existingKeyCount: existingKeys.size,
    targetCount: targets.length,
    targetSamples: targets.slice(0, 6).map(summarizePendingGalleryTargetForHydrationDebug),
    missingEntrySamples: missingEntries.slice(0, 6).map(summarizeGalleryEntryForHydrationDebug),
  });

  let injected = 0;
  let appended = 0;
  let noTargetCount = 0;
  let skippedCount = 0;
  for (const entry of missingEntries) {
    const target = takePendingGalleryImageTarget(targets, entry);
    if (!target) {
      noTargetCount += 1;
      if (appendMissingGalleryFigure(root, entry)) appended += 1;
      else skippedCount += 1;
      continue;
    }
    const figure = createGalleryEntryFigure(entry);
    if (!figure) {
      skippedCount += 1;
      continue;
    }
    if (target.kind === 'native-prompt-token') {
      target.element.after(figure);
    } else {
      target.element.replaceWith(figure);
    }
    injected += 1;
  }

  recordComponentTrace('hydrate_pending_gallery_images', {
    tailGalleryHidden,
    rawGalleryEntryCount,
    galleryEntryCount: entries.length,
    missingEntryCount: missingEntries.length,
    targetCount: targets.length + injected,
    injected,
    appended,
    noTargetCount,
    skippedCount,
    remainingTargetCount: targets.length,
    missingEntrySamples: missingEntries.slice(0, 6).map(summarizeGalleryEntryForHydrationDebug),
  });
}

function clearAssistantBodyInteractionBindings() {
  assistantBodyCleanup.value.forEach(dispose => dispose());
  assistantBodyCleanup.value = [];
  assistantBodyDelegatedGestureDisposers.value.forEach(dispose => dispose());
  assistantBodyDelegatedGestureDisposers.value = [];
  assistantBodyDelegatedGestureStates = new WeakMap();
}

function stopEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  const nativeEvent = event as Event & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
}

function toGesturePoint(event: PointerEvent): GeneratedImageGesturePoint {
  return { clientX: event.clientX, clientY: event.clientY };
}

function sanitizeAssistantBodyPluginNativeRequestIds(root: HTMLElement): number {
  const count = sanitizeSameLayerPluginNativeRequestIdElements(root);
  if (count > 0) {
    recordComponentTrace('sanitize_plugin_native_request_ids', { count });
  }
  return count;
}

function isPluginNativeInteractionMutationTarget(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const selector =
    '.st-chatu8-image-span, span.image-tag-placeholder, button.image-tag-button, button.st-chatu8-image-button, .st-chatu8-image-button[role="button"]';
  return node.matches?.(selector) || Boolean(node.querySelector?.(selector));
}

function observeAssistantBodyPluginNativeRequestIds(root: HTMLElement, disposers: Array<() => void>) {
  sanitizeAssistantBodyPluginNativeRequestIds(root);
  if (typeof MutationObserver !== 'function') return;

  let rebindTimer: number | null = null;
  const scheduleInteractionRebind = () => {
    if (rebindTimer != null) return;
    rebindTimer = window.setTimeout(() => {
      rebindTimer = null;
      bindAssistantBodyInteractions();
    }, 0);
  };

  const observer = new MutationObserver(records => {
    let shouldSanitize = false;
    let shouldRebind = false;
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'data-request-id') {
        shouldSanitize = true;
        continue;
      }
      if (record.type === 'childList' && record.addedNodes.length > 0) {
        shouldSanitize = true;
        for (const node of record.addedNodes) {
          if (isPluginNativeInteractionMutationTarget(node)) {
            shouldRebind = true;
            break;
          }
        }
      }
    }
    if (shouldSanitize) sanitizeAssistantBodyPluginNativeRequestIds(root);
    if (shouldRebind) scheduleInteractionRebind();
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-request-id'],
  });
  disposers.push(() => {
    observer.disconnect();
    if (rebindTimer != null) window.clearTimeout(rebindTimer);
  });
}

function resolvePluginPromptDatasetForCarrier(carrier: HTMLElement): DOMStringMap | null {
  const selector = 'button.image-tag-button, button.st-chatu8-image-button, .st-chatu8-image-button[role="button"]';
  const hasPromptPayload = (candidate: HTMLElement | null): candidate is HTMLElement =>
    Boolean(
      candidate &&
      (candidate.dataset.imageTag ||
        candidate.dataset.link ||
        candidate.getAttribute('data-image-tag') ||
        candidate.getAttribute('data-link')),
    );

  let sibling = carrier.previousElementSibling;
  while (sibling) {
    if (sibling.matches?.(selector) && hasPromptPayload(sibling as HTMLElement))
      return (sibling as HTMLElement).dataset;
    sibling = sibling.previousElementSibling;
  }

  const requestId = String(
    carrier.dataset.requestId ??
      carrier.dataset.samelayerRequestId ??
      carrier.getAttribute('data-request-id') ??
      carrier.getAttribute('data-samelayer-request-id') ??
      '',
  ).trim();
  const root = assistantBodyRef.value;
  const candidates = Array.from(root?.querySelectorAll(selector) ?? []) as HTMLElement[];
  if (requestId) {
    const matched = candidates.find(candidate => {
      const candidateRequestId = String(
        candidate.dataset.requestId ??
          candidate.dataset.samelayerRequestId ??
          candidate.getAttribute('data-request-id') ??
          candidate.getAttribute('data-samelayer-request-id') ??
          '',
      ).trim();
      return candidateRequestId === requestId && hasPromptPayload(candidate);
    });
    if (matched) return matched.dataset;
  }

  const container = carrier.closest('.ai-image-container, .st-chatu8-image-container');
  const containerButton = container?.querySelector(selector) as HTMLElement | null;
  if (hasPromptPayload(containerButton)) return containerButton.dataset;

  return candidates.find(hasPromptPayload)?.dataset ?? null;
}

function buildGeneratedImagePayload(carrier: HTMLElement, rawTarget: EventTarget | null = null) {
  const itemMessageId = String(props.item.message_id);
  if (!carrier.dataset.messageId) carrier.dataset.messageId = itemMessageId;
  const targetElement = rawTarget instanceof HTMLElement ? rawTarget : null;
  const targetImage =
    targetElement instanceof HTMLImageElement
      ? targetElement
      : ((targetElement?.querySelector?.('img') ?? carrier.querySelector('img')) as HTMLImageElement | null);
  const promptDataset = resolvePluginPromptDatasetForCarrier(carrier);
  const targetDataset = targetElement?.dataset ?? targetImage?.dataset ?? {};
  const payloadCarrierDataset = { ...promptDataset, ...carrier.dataset, messageId: itemMessageId };
  const payloadTargetDataset = { ...targetDataset, messageId: itemMessageId };
  return parseGeneratedImageActivationPayload({
    carrierDataset: payloadCarrierDataset,
    targetDataset: payloadTargetDataset,
    targetAttrSrc: targetImage?.getAttribute('src') ?? null,
    targetCurrentSrc: targetImage?.currentSrc ?? null,
    targetSrc: targetImage?.getAttribute('src') ?? null,
  });
}

type AssistantBodyDelegatedGestureState = {
  controller: ReturnType<typeof createGeneratedImageGestureController>;
  lastGestureTarget: EventTarget | null;
  suppressNextClick: boolean;
};

let assistantBodyDelegatedGestureStates = new WeakMap<HTMLElement, AssistantBodyDelegatedGestureState>();

function resolveAssistantBodyNativeImageCarrierFromEventTarget(target: EventTarget | null): HTMLElement | null {
  const root = assistantBodyRef.value;
  const element = target instanceof HTMLElement ? target : null;
  const carrier = element?.closest?.(PLUGIN_NATIVE_CARRIER_SELECTOR) as HTMLElement | null;
  if (!root || !carrier || !root.contains(carrier)) return null;
  return carrier;
}

function resolveAssistantBodyNativeImageButtonFromEventTarget(target: EventTarget | null): HTMLElement | null {
  const root = assistantBodyRef.value;
  const element = target instanceof HTMLElement ? target : null;
  const button = element?.closest?.(PLUGIN_NATIVE_BUTTON_SELECTOR) as HTMLElement | null;
  if (!root || !button || !root.contains(button)) return null;
  return button;
}

function getAssistantBodyDelegatedGestureState(carrier: HTMLElement): AssistantBodyDelegatedGestureState {
  let state = assistantBodyDelegatedGestureStates.get(carrier);
  if (state) return state;

  state = {
    lastGestureTarget: null,
    suppressNextClick: false,
    controller: createGeneratedImageGestureController({
      onView() {
        emit('image-view', buildGeneratedImagePayload(carrier, state?.lastGestureTarget ?? null));
      },
      onRegenerate() {
        emit('image-regenerate', buildGeneratedImagePayload(carrier, state?.lastGestureTarget ?? null));
      },
      onTag() {
        emit('image-tag', buildGeneratedImagePayload(carrier, state?.lastGestureTarget ?? null));
      },
    }),
  };
  assistantBodyDelegatedGestureStates.set(carrier, state);
  assistantBodyDelegatedGestureDisposers.value.push(() => state?.controller.dispose());
  return state;
}

function handleAssistantBodyNativeImageClick(event: Event) {
  if (isBridgedEvent(event)) return;
  const button = resolveAssistantBodyNativeImageButtonFromEventTarget(event.target);
  if (button) {
    if (!button.dataset.messageId) button.dataset.messageId = String(props.item.message_id);
    stopEvent(event);
    emit('image-regenerate', buildGeneratedImagePayload(button, event.target));
    return;
  }

  const carrier = resolveAssistantBodyNativeImageCarrierFromEventTarget(event.target);
  if (!carrier) return;
  const state = getAssistantBodyDelegatedGestureState(carrier);
  if (state.suppressNextClick) {
    state.suppressNextClick = false;
    stopEvent(event);
    return;
  }
  state.lastGestureTarget = event.target;
  stopEvent(event);
  state.controller.handleClick();
}

function handleAssistantBodyNativeImageDoubleClick(event: Event) {
  if (isBridgedEvent(event)) return;
  const carrier = resolveAssistantBodyNativeImageCarrierFromEventTarget(event.target);
  if (!carrier) return;
  const state = getAssistantBodyDelegatedGestureState(carrier);
  state.lastGestureTarget = event.target;
  state.suppressNextClick = true;
  stopEvent(event);
  state.controller.handleDoubleClick();
}

function handleAssistantBodyNativeImagePointerDown(event: Event) {
  if (isBridgedEvent(event)) return;
  const pointerEvent = event as PointerEvent;
  if (pointerEvent.pointerType !== 'touch') return;
  const carrier = resolveAssistantBodyNativeImageCarrierFromEventTarget(event.target);
  if (!carrier) return;
  const state = getAssistantBodyDelegatedGestureState(carrier);
  state.lastGestureTarget = event.target;
  stopEvent(event);
  state.controller.handleTouchStart(toGesturePoint(pointerEvent));
}

function handleAssistantBodyNativeImagePointerMove(event: Event) {
  if (isBridgedEvent(event)) return;
  const pointerEvent = event as PointerEvent;
  if (pointerEvent.pointerType !== 'touch') return;
  const carrier = resolveAssistantBodyNativeImageCarrierFromEventTarget(event.target);
  if (!carrier) return;
  const state = getAssistantBodyDelegatedGestureState(carrier);
  state.lastGestureTarget = event.target;
  state.controller.handleTouchMove(toGesturePoint(pointerEvent));
}

function handleAssistantBodyNativeImagePointerUp(event: Event) {
  if (isBridgedEvent(event)) return;
  const pointerEvent = event as PointerEvent;
  if (pointerEvent.pointerType !== 'touch') return;
  const carrier = resolveAssistantBodyNativeImageCarrierFromEventTarget(event.target);
  if (!carrier) return;
  const state = getAssistantBodyDelegatedGestureState(carrier);
  state.lastGestureTarget = event.target;
  stopEvent(event);
  state.controller.handleTouchEnd(toGesturePoint(pointerEvent));
}

function handleAssistantBodyNativeImagePointerCancel(event: Event) {
  if (isBridgedEvent(event)) return;
  const pointerEvent = event as PointerEvent;
  if (pointerEvent.pointerType !== 'touch') return;
  const carrier = resolveAssistantBodyNativeImageCarrierFromEventTarget(event.target);
  if (!carrier) return;
  const state = getAssistantBodyDelegatedGestureState(carrier);
  state.lastGestureTarget = event.target;
  stopEvent(event);
  state.controller.handleTouchCancel();
}

function bindAssistantBodyInteractions() {
  clearAssistantBodyInteractionBindings();
  const root = assistantBodyRef.value;
  if (!root) return;
  if (props.showTailGalleryImages === false) return;
  const itemMessageId = String(props.item.message_id);
  const disposers: Array<() => void> = [];
  observeAssistantBodyPluginNativeRequestIds(root, disposers);

  const buildPayload = buildGeneratedImagePayload;

  const bindGestureTarget = (gestureTarget: HTMLElement, carrier: HTMLElement) => {
    let suppressNextClick = false;
    let lastGestureTarget: EventTarget | null = null;
    const controller = createGeneratedImageGestureController({
      onView() {
        emit('image-view', buildPayload(carrier, lastGestureTarget));
      },
      onRegenerate() {
        emit('image-regenerate', buildPayload(carrier, lastGestureTarget));
      },
      onTag() {
        emit('image-tag', buildPayload(carrier, lastGestureTarget));
      },
    });

    const handleClick = (event: Event) => {
      if (isBridgedEvent(event)) return;
      if (suppressNextClick) {
        suppressNextClick = false;
        stopEvent(event);
        return;
      }
      lastGestureTarget = event.target;
      stopEvent(event);
      controller.handleClick();
    };
    const handleDoubleClick = (event: Event) => {
      if (isBridgedEvent(event)) return;
      lastGestureTarget = event.target;
      stopEvent(event);
      suppressNextClick = true;
      controller.handleDoubleClick();
    };
    const handlePointerDown = (event: Event) => {
      if (isBridgedEvent(event)) return;
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch') return;
      lastGestureTarget = event.target;
      stopEvent(event);
      controller.handleTouchStart(toGesturePoint(pointerEvent));
    };
    const handlePointerMove = (event: Event) => {
      if (isBridgedEvent(event)) return;
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch') return;
      lastGestureTarget = event.target;
      controller.handleTouchMove(toGesturePoint(pointerEvent));
    };
    const handlePointerUp = (event: Event) => {
      if (isBridgedEvent(event)) return;
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch') return;
      lastGestureTarget = event.target;
      stopEvent(event);
      controller.handleTouchEnd(toGesturePoint(pointerEvent));
    };
    const handlePointerCancel = (event: Event) => {
      if (isBridgedEvent(event)) return;
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerType !== 'touch') return;
      lastGestureTarget = event.target;
      stopEvent(event);
      controller.handleTouchCancel();
    };

    gestureTarget.addEventListener('click', handleClick, true);
    gestureTarget.addEventListener('dblclick', handleDoubleClick, true);
    gestureTarget.addEventListener('pointerdown', handlePointerDown, true);
    gestureTarget.addEventListener('pointermove', handlePointerMove, true);
    gestureTarget.addEventListener('pointerup', handlePointerUp, true);
    gestureTarget.addEventListener('pointercancel', handlePointerCancel, true);

    disposers.push(() => {
      gestureTarget.removeEventListener('click', handleClick, true);
      gestureTarget.removeEventListener('dblclick', handleDoubleClick, true);
      gestureTarget.removeEventListener('pointerdown', handlePointerDown, true);
      gestureTarget.removeEventListener('pointermove', handlePointerMove, true);
      gestureTarget.removeEventListener('pointerup', handlePointerUp, true);
      gestureTarget.removeEventListener('pointercancel', handlePointerCancel, true);
      controller.dispose();
    });
  };

  const promptButtons = Array.from(
    root.querySelectorAll(
      'button.image-tag-button, button.st-chatu8-image-button, .st-chatu8-image-button[role="button"]',
    ),
  ) as HTMLElement[];
  for (const button of promptButtons) {
    if (!button.dataset.messageId) button.dataset.messageId = itemMessageId;
  }

  const pluginNativeCarriers = Array.from(
    root.querySelectorAll('.st-chatu8-image-span, span.image-tag-placeholder'),
  ) as HTMLElement[];
  for (const carrier of pluginNativeCarriers) {
    if (!carrier.dataset.messageId) carrier.dataset.messageId = itemMessageId;
  }

  const fallbackCarriers = Array.from(
    root.querySelectorAll('.assistant-fallback-inline-image, .assistant-fallback-generated-image'),
  ) as HTMLElement[];
  recordComponentTrace('bind_interactions', {
    promptButtonCount: promptButtons.length,
    carrierCount: pluginNativeCarriers.length + fallbackCarriers.length,
    pluginNativeCarrierCount: pluginNativeCarriers.length,
    fallbackCarrierCount: fallbackCarriers.length,
  });

  for (const carrier of fallbackCarriers) {
    let hitArea = carrier.querySelector('.generated-image-hitarea') as HTMLButtonElement | null;
    if (!hitArea) {
      hitArea = document.createElement('button');
      hitArea.type = 'button';
      hitArea.className = 'generated-image-hitarea';
      hitArea.setAttribute('aria-label', '查看或重生图片');
      carrier.appendChild(hitArea);
    }
    const image = carrier.querySelector('img') as HTMLImageElement | null;
    if (!carrier.dataset.messageId) carrier.dataset.messageId = itemMessageId;

    if (image) {
      hitArea.dataset.messageId = image.dataset.messageId ?? carrier.dataset.messageId ?? itemMessageId;
      hitArea.dataset.imageId = image.dataset.imageId ?? carrier.dataset.imageId ?? '';
      hitArea.dataset.promptToken = image.dataset.promptToken ?? carrier.dataset.promptToken ?? '';
      hitArea.dataset.requestId =
        image.dataset.requestId ??
        image.dataset.samelayerRequestId ??
        carrier.dataset.requestId ??
        carrier.dataset.samelayerRequestId ??
        '';
      hitArea.dataset.imageSrc = encodeURIComponent(image.getAttribute('src') ?? image.currentSrc ?? '');
      hitArea.dataset.source = 'transcript';
    }

    bindGestureTarget(hitArea, carrier);
  }

  assistantBodyCleanup.value = disposers;
}

onMounted(() => {
  recordComponentTrace('mount');
});

watch(
  assistantBodySignature,
  async () => {
    if (props.item.role !== 'assistant') return;
    // 流式阶段只渲染轻量 regex 预览，不 hydrate/rebind 图片或插件按钮；等 phase 切到 done 再接管交互。
    if (props.item.isStreaming) return;
    recordComponentTrace('update');
    await nextTick();
    recordNativePromptTokenScanState('assistant_body_signature:before_hydration');
    if (shouldRunTranscriptImageFallbacks()) {
      hydratePendingImagesFromGalleryEntries();
      scheduleDirectHostBackfillImages('assistant_body_signature');
    }
    await nextTick();
    refreshAssistantBodyImagePresentation();
    await nextTick();
    bindAssistantBodyInteractions();
    recordNativePromptTokenScanState('assistant_body_signature:after_bind');
  },
  { immediate: true, flush: 'post' },
);

watch(
  galleryEntrySignature,
  async () => {
    if (props.item.role !== 'assistant' || props.item.isStreaming) return;
    if (!shouldRunTranscriptImageFallbacks()) return;
    if (hasReadyGalleryEntries()) clearDirectHostBackfillTimers();
    await nextTick();
    recordNativePromptTokenScanState('gallery_entries:before_hydration');
    hydratePendingImagesFromGalleryEntries();
    await nextTick();
    refreshAssistantBodyImagePresentation();
    await nextTick();
    bindAssistantBodyInteractions();
    recordNativePromptTokenScanState('gallery_entries:after_bind');
  },
  { flush: 'post' },
);

watch(
  () => props.showTailGalleryImages,
  () => {
    const root = assistantBodyRef.value;
    if (!root) return;
    root.classList.toggle('hide-tail-gallery-images', props.showTailGalleryImages === false);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  recordComponentTrace('unmount');
  clearDirectHostBackfillTimers();
  clearAssistantBodyInteractionBindings();
});
</script>

<style scoped>
.message-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: var(--transcript-prose-max, 100%);
  min-width: 0;
  margin-inline: auto;
}
.system-message {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  align-self: center;
  padding: 14px 20px;
  border: 1px solid color-mix(in srgb, var(--primary) 50%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--demo-text-accent);
  text-transform: uppercase;
}
.system-icon {
  font-size: 14px;
}
.system-text {
  line-height: 1.5;
}
.user-wrap {
  display: flex;
  justify-content: flex-end;
}
.user-message {
  max-width: min(100%, 42rem);
  padding: 12px 18px;
  border-right: 2px solid color-mix(in srgb, var(--primary) 48%, transparent);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 14px;
  line-height: 1.75;
  color: var(--demo-text-primary);
  text-align: right;
}

.message-shell.font-reading .user-message,
.message-shell.font-reading .assistant-body,
.message-shell.font-reading .inline-editor {
  font-family: var(--demo-font-sans);
}

.message-shell.density-minimal .user-message {
  max-width: min(100%, 36rem);
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.55;
}
.assistant-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 60rem;
  min-width: 0;
  padding: 24px 28px 18px;
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  background: var(--demo-assistant-card-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.assistant-card.is-streaming {
  border-color: color-mix(in srgb, var(--primary) 30%, transparent);
  box-shadow:
    0 14px 30px color-mix(in srgb, var(--shadow-color) 42%, transparent),
    inset 3px 0 0 color-mix(in srgb, var(--primary) 42%, transparent);
}

.message-shell.density-minimal .assistant-card {
  gap: 10px;
  padding: 16px 18px 14px;
}
.assistant-corners {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: color-mix(in srgb, var(--primary) 36%, transparent);
  pointer-events: none;
}
.assistant-corners.tl {
  top: -2px;
  left: -2px;
  border-top: 2px solid;
  border-left: 2px solid;
}
.assistant-corners.tr {
  top: -2px;
  right: -2px;
  border-top: 2px solid;
  border-right: 2px solid;
}
.assistant-corners.bl {
  bottom: -2px;
  left: -2px;
  border-bottom: 2px solid;
  border-left: 2px solid;
}
.assistant-corners.br {
  bottom: -2px;
  right: -2px;
  border-bottom: 2px solid;
  border-right: 2px solid;
}
.meta-chip,
.assistant-control-btn,
.action-btn {
  font-family: var(--demo-font-mono);
}
.assistant-body-wrap {
  position: relative;
  padding-top: 2px;
  min-width: 0;
}
.assistant-body-wrap.is-collapsed {
  max-height: 240px;
  overflow: hidden;
}
.assistant-body-wrap.is-collapsed::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  height: 56px;
  background: linear-gradient(180deg, transparent, var(--demo-assistant-card-bg));
  pointer-events: none;
}
.assistant-body {
  position: relative;
  z-index: 1;
  contain: inline-size;
  pointer-events: auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  font-size: 15px;
  line-height: 1.9;
  color: var(--demo-text-panel-strong);
  overflow-x: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.assistant-body.is-stream-stage {
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.message-shell.density-minimal .assistant-body {
  font-size: 14px;
  line-height: 1.7;
}

.message-shell.density-minimal .assistant-corners {
  display: none;
}
.assistant-body-wrap :deep(p) {
  margin: 0 0 1em;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.assistant-body-wrap :deep(p:last-child) {
  margin-bottom: 0;
}

.assistant-body-wrap :deep(.dialog-inline) {
  color: inherit;
  font: inherit;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.assistant-body-wrap :deep(.stream-stage-pre) {
  margin: 0;
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  color: var(--demo-text-panel-strong);
  font: inherit;
  line-height: inherit;
}

.assistant-body-wrap :deep(.ai-image-container) {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 4px;
  touch-action: pan-y;
}

.assistant-body-wrap :deep(.image-tag-button) {
  position: relative;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--background) 70%, transparent);
  color: var(--demo-text-accent);
  font-family: var(--demo-font-mono);
  font-size: 12px;
  line-height: 1;
  letter-spacing: 0.08em;
  box-shadow:
    0 8px 18px color-mix(in srgb, var(--shadow-color) 28%, transparent),
    inset 0 0 0 1px color-mix(in srgb, white 4%, transparent);
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.assistant-body-wrap :deep(.image-tag-button)::before {
  content: '🎨';
  margin-right: 6px;
  font-size: 14px;
}

.assistant-body-wrap :deep(.image-tag-button:hover),
.assistant-body-wrap :deep(.image-tag-button:active) {
  background: color-mix(in srgb, var(--primary) 12%, var(--background) 88%);
  border-color: color-mix(in srgb, var(--primary) 42%, transparent);
}

@media (max-width: 760px) {
  .assistant-card.is-streaming .assistant-body-wrap :deep(.image-tag-button) {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

.assistant-body-wrap :deep(.image-tag-placeholder),
.assistant-body-wrap :deep(.image-tag-container) {
  display: inline-flex;
  width: 0;
  height: 0;
  overflow: hidden;
}

.assistant-body-wrap :deep(.assistant-fallback-generated-gallery) {
  clear: both;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface) 22%, transparent),
      color-mix(in srgb, var(--surface) 10%, transparent)
    ),
    radial-gradient(circle at top, color-mix(in srgb, var(--primary) 10%, transparent), transparent 58%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 4%, transparent),
    0 10px 24px color-mix(in srgb, var(--shadow-color) 24%, transparent);
}

.assistant-body.hide-tail-gallery-images :deep(.assistant-fallback-generated-gallery),
.assistant-body.hide-tail-gallery-images :deep([data-tail-gallery-image='true']) {
  display: none;
}

.assistant-body-wrap :deep(.assistant-fallback-generated-image) {
  position: relative;
  z-index: 2;
  pointer-events: none;
  margin: 0;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 12%, transparent);
  overflow: hidden;
  box-shadow:
    0 6px 14px color-mix(in srgb, black 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 3%, transparent);
}

.assistant-body-wrap :deep(.assistant-fallback-generated-image img) {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  background: color-mix(in srgb, var(--surface) 22%, transparent);
  opacity: 0.88;
}

.assistant-body-wrap :deep(.assistant-image-prompt-list) {
  pointer-events: auto;
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.assistant-body-wrap :deep(.assistant-image-prompt-token) {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed color-mix(in srgb, var(--primary) 18%, transparent);
  background: color-mix(in srgb, var(--surface) 14%, transparent);
  color: var(--demo-text-secondary);
  font-family: var(--demo-font-mono);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.assistant-body-wrap :deep(.assistant-fallback-inline-image) {
  position: relative;
  z-index: 2;
  pointer-events: auto;
  display: block;
  margin: 16px 0;
  border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent);
  border-radius: 16px;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface) 12%, transparent);
  box-shadow:
    0 8px 18px color-mix(in srgb, black 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 3%, transparent);
  touch-action: pan-y;
}

.assistant-body-wrap :deep(pre),
.assistant-body-wrap :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.assistant-body-wrap :deep(pre) {
  white-space: pre;
}

.assistant-body-wrap :deep(img),
.assistant-body-wrap :deep(video),
.assistant-body-wrap :deep(canvas),
.assistant-body-wrap :deep(svg),
.assistant-body-wrap :deep(iframe) {
  max-width: 100%;
  height: auto;
}

.assistant-body-wrap :deep(div),
.assistant-body-wrap :deep(section),
.assistant-body-wrap :deep(article),
.assistant-body-wrap :deep(details),
.assistant-body-wrap :deep(summary),
.assistant-body-wrap :deep(figure) {
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.assistant-body-wrap :deep(code),
.assistant-body-wrap :deep(li),
.assistant-body-wrap :deep(ol),
.assistant-body-wrap :deep(ul),
.assistant-body-wrap :deep(blockquote) {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.assistant-body-wrap :deep(.generated-image-hitarea) {
  position: absolute;
  inset: 0;
  z-index: 3;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: transparent;
  cursor: pointer;
  touch-action: pan-y;
}

.assistant-inline-image-strip {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.assistant-body-wrap :deep(.st-chatu8-image-button),
.assistant-body-wrap :deep(.st-chatu8-image-span) {
  position: relative;
  z-index: 3;
  pointer-events: auto;
  touch-action: pan-y;
}

.assistant-toolbar,
.assistant-footer,
.assistant-footer-left,
.assistant-card-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.assistant-card-controls {
  position: relative;
  z-index: 6;
  justify-content: flex-end;
  min-height: 28px;
  margin: -4px 0 0;
}
.assistant-card-controls.is-bottom {
  margin: 0 0 -2px;
}
.assistant-toolbar {
  justify-content: flex-start;
}
.assistant-footer {
  justify-content: space-between;
}
.message-actions,
.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-chip,
.assistant-control-btn,
.action-btn {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 18%, transparent);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--demo-text-secondary);
}
.assistant-control-btn {
  min-height: 28px;
  padding: 0 9px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--demo-text-accent);
  cursor: pointer;
}
.assistant-control-btn.is-detail {
  color: var(--demo-text-primary);
}
.assistant-control-btn:hover {
  background: color-mix(in srgb, var(--primary) 10%, var(--surface) 90%);
  border-color: color-mix(in srgb, var(--primary) 32%, transparent);
}

.message-shell.density-minimal .meta-chip,
.message-shell.density-minimal .assistant-control-btn,
.message-shell.density-minimal .action-btn {
  min-height: 32px;
  padding: 0 10px;
  font-size: 11px;
}
.action-btn {
  color: var(--demo-text-accent);
}
.action-btn.danger {
  color: var(--demo-color-danger);
  border-color: color-mix(in srgb, var(--demo-color-danger) 34%, transparent);
}
.message-actions.user-actions {
  justify-content: flex-end;
}
.rollback-tip {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  color: var(--demo-text-warning);
}
.editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}
.inline-editor {
  width: min(100%, 42rem);
  min-height: 110px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  background: color-mix(in srgb, var(--surface) 14%, transparent);
  color: var(--demo-text-primary);
  font-family: var(--demo-font-mono);
  font-size: 13px;
  line-height: 1.7;
}
.editor-actions {
  justify-content: flex-end;
}

@media (min-width: 761px) {
  .assistant-card {
    width: 100%;
    max-width: 100%;
    border-color: var(--demo-border-accent-soft);
    box-shadow: 0 14px 30px color-mix(in srgb, var(--shadow-color) 42%, transparent);
  }

  .assistant-card::before,
  .assistant-card::after,
  .assistant-corners {
    display: none;
  }
}

@media (max-width: 760px) {
  .assistant-body-wrap :deep(.assistant-fallback-generated-gallery) {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin-top: 14px;
    padding: 10px;
    border-radius: 14px;
  }

  .assistant-body-wrap :deep(.assistant-fallback-generated-image) {
    border-radius: 12px;
  }

  .assistant-body-wrap :deep(.assistant-fallback-inline-image) {
    margin: 12px 0;
    border-radius: 12px;
  }

  .meta-chip,
  .detail-toggle,
  .assistant-control-btn,
  .action-btn {
    min-height: 28px;
    padding: 0 8px;
    font-size: 11px;
    letter-spacing: 0.08em;
  }

  .assistant-card {
    max-width: 100%;
    padding: 10px 8px 8px;
    box-shadow: none;
  }
  .assistant-corners {
    display: none;
  }
  .assistant-toolbar {
    gap: 6px;
  }
  .assistant-body-wrap {
    padding-top: 2px;
  }
  .assistant-body {
    font-size: 14px;
  }
  .assistant-footer {
    align-items: flex-start;
  }
  .user-message,
  .inline-editor {
    max-width: 100%;
  }
  .user-message {
    padding: 10px 12px;
  }
  .inline-editor {
    padding: 10px 12px;
  }
}
</style>

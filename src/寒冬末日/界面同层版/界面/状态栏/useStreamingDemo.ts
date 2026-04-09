import _ from 'lodash';
import { reprocessMessageVariablesById } from '../../../mvu_reprocess';
import {
  buildStreamDemoMessage,
  extractStreamDemoContent,
  extractStreamDemoOptions,
  extractStreamDemoPhase,
  isStreamDemoMessage,
  stripStreamDemoRuntimeTags,
  stripTagsForPreview,
} from '../../shared/message';
import {
  buildOpeningGeneratePrompt,
  extractOpeningContentLoose,
  extractOpeningOptions,
  getDefaultOpeningPayload,
  getDefaultOpeningPreset,
  getOpeningRoute,
  getOpeningRoutes,
  getOpeningWorldMode,
  getOpeningWorldModes,
  readOpeningPayloadFromChat,
  replaceOpeningPayloadInChat,
} from '../../shared/opening';
import { CHAT_VAR_KEYS } from '../../../界面/outbound';
import type { OpeningPayload, OpeningPreset } from '../../shared/opening.schema';
import { resolveAssistantMessageRefreshMode } from './assistantMessageRefreshMode';
import {
  createDebugTraceStore,
  createTraceId,
  installDebugTraceRuntime,
  recordComponentDebugTrace,
  recordDebugTrace,
} from './debugTrace';
import {
  buildAssistantRenderSource,
  buildDebugMessageSignature,
  createGenerationListenerEpochController,
  resolveAssistantDisplayRenderSource,
  resolveTranscriptRole,
  shouldCreateAssistantPlaceholderOnFirstToken,
  shouldEnsureAssistantPlaceholderBeforeFinalize,
  shouldIgnoreHostRefreshDuringBusy,
  shouldPrewarmHostMesTextAfterPatch,
  shouldSuppressLifecycleEchoHostRefresh,
  summarizeTranscriptForDebug,
} from './debugTraceLifecycle';
import { bumpGeneratedImageEntityRevision } from './generatedImageEntityRevision';
import { buildHideStateRecord, clearHideState, readHideState, writeHideState } from './hideStatePersistence';
import { shouldInjectTranscriptImages } from './generatedImageInteraction';
import { buildGeneratedImageMarkerId } from './generatedImageMarker';
import {
  callHostGetChatMessages,
  collectChatu8PromptTokens,
  collectReachableHostDocuments,
  normalizeImageDataToSrc,
  normalizeImageSrcForCompare,
  readChatMessageDetail,
  readHostContext,
} from './hostBridge';
import { dispatchHostPrimaryTrigger } from './hostGestureDispatch';
import { ensureHostMesTextRendered as ensureHostMesTextRenderedWithRefresh } from './hostMesTextRender';
import { resolveHostMessageRole } from './hostMessageRole';
import { isOpeningWorkbenchScopeActive, resolveActiveContainerMessageId } from './containerScope';
import { getFallbackImageClasses } from './imageFallbackClasses';
import { createImagePendingTaskManager } from './imagePendingTaskManager';
import { createImageRecentIntentStore } from './imageRecentIntent';
import { chooseImageRenderMode } from './imageRenderPriority';
import {
  isCurrentOpeningAssistantMessageByPayload,
  isCurrentOpeningSeedMessageByPayload,
  sanitizeInheritedMessageData,
} from './openingMessageFlags';
import { sendToNativeChat } from './nativeSendProxy';
import { collectPluginNativeCacheArtifacts } from './pluginNativeCacheArtifacts';
import {
  readNativeFirstImageArtifacts,
  readNativeFirstMembershipEntries,
  readNativeFirstPromptTokens,
  type NativeFirstArtifactSource,
  type NativeFirstImageArtifact,
} from './pluginNativeImageArtifacts';
import { countPluginNativeImageArtifacts, isPluginNativeMutationNode } from './pluginNativeImageDom';
import { stripPluginNativePlaceholderHtml } from './pluginNativePlaceholderCleanup';
import {
  normalizeDensity,
  normalizeFontMode,
  normalizeReadingMode,
  normalizeTheme,
  patchReaderChatState,
  READER_CHAT_STATE_VERSION,
  readReaderChatState,
} from './readerState';
import { resolveRefreshDomainsForEvent, type RefreshDomain } from './refreshDomains';
import { shouldForceTranscriptDomRefresh } from './transcriptDomRefresh';
import { applyTranscriptArtifacts } from './transcriptImagePersistence';
import { buildTranscriptWindowPageOptions, resolveTranscriptWindowRange } from './transcriptWindow';
import type {
  DemoStatus,
  DemoTheme,
  GeneratedImageRef,
  ReaderFontMode,
  ReaderLogItem,
  ReaderSummary,
  ReadingMode,
  TranscriptDensity,
  TranscriptFilterMode,
  TranscriptItem,
} from './types';

type StopHandle = { stop?: () => void } | null;
type HideRefreshMode = 'none' | 'affected';
type RenderableGeneratedImage = {
  markerId?: string;
  imageId?: string;
  src: string;
  alt: string;
  promptToken?: string;
  requestId?: string;
  anchorText?: string;
  title?: string;
  characterName?: string;
};
type NativeFirstRenderableGeneratedImage = RenderableGeneratedImage & {
  source: NativeFirstArtifactSource;
};
type TranscriptWindowMode = 'latest' | 'history';
type GenerationFlowOptions = {
  prompt: string;
  createUser: boolean;
  detachedUserInput?: boolean;
  maxChatHistory?: 'all' | number;
  emitLifecycleKind?: 'normal' | 'regenerate';
  onAssistantPlaceholderCreated?: (assistantMessageId: number | null) => Promise<void> | void;
};
type GenerationFlowResult =
  | { success: true; assistantMessageId: number | null; result: string }
  | { success: false; assistantMessageId: number | null; errorText: string; hadVisibleAssistantContent: boolean };

const DEMO_THEME_CLASS_NAMES = [
  'theme-tech',
  'theme-dark',
  'theme-gold',
  'theme-ios',
  'theme-ipod',
  'theme-amber',
] as const;
const TRANSCRIPT_UI_WINDOW_SIZE = 4;
const CHATU8_IMAGE_BUTTON_SELECTOR = '.st-chatu8-image-button';
const CHATU8_IMAGE_SPAN_SELECTOR = '.st-chatu8-image-span';
const FALLBACK_IMAGE_CLASSES = getFallbackImageClasses();

function applyDemoTheme(theme: DemoTheme) {
  const className = `theme-${theme}`;
  const roots = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
  roots.forEach(root => {
    root.classList.remove(...DEMO_THEME_CLASS_NAMES);
    root.classList.add(className);
  });
}

type BaseChatMessage = {
  message_id: number;
  role: 'assistant' | 'user' | 'system';
  message: string;
  is_hidden: boolean;
};

function applyRegexForDisplay(text: string, role: TranscriptItem['role']): string {
  if (!text) return '';
  try {
    if (typeof formatAsTavernRegexedString === 'function') {
      const source = role === 'user' ? 'user_input' : role === 'system' ? 'world_info' : 'ai_output';
      const out = formatAsTavernRegexedString(text, source, 'display', { depth: 0 });
      return typeof out === 'string' ? out : text;
    }
  } catch {
    // ignore
  }
  return text;
}

function hasRenderableAssistantMessageText(rawMessage: unknown): boolean {
  const raw = String(rawMessage ?? '').trim();
  if (!raw) return false;
  const strippedStreamDemo = stripTagsForPreview(stripStreamDemoRuntimeTags(raw)).trim();
  if (strippedStreamDemo && !strippedStreamDemo.startsWith('生成失败：')) return true;
  const stripped = stripTagsForPreview(raw).trim();
  return Boolean(stripped) && !stripped.startsWith('生成失败：');
}

function escapeHtml(input: string): string {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function encodeDataAttr(input: string): string {
  return encodeURIComponent(String(input ?? ''));
}

function buildStreamStageHtml(renderSource: string, role: TranscriptItem['role'], message_id: number): string {
  const source = String(renderSource ?? '').trim();
  if (!source) return '<pre class="stream-stage-pre">等待 token…</pre>';
  const regexText = applyRegexForDisplay(source, role);
  const readableText = String(regexText || source)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .trim();
  return `<pre class="stream-stage-pre">${escapeHtml(readableText || source)}</pre>`;
}

function buildRawTranscriptPreHtml(renderSource: string): string {
  const source = String(renderSource ?? '').trim();
  const text = source || '(空回复)';
  return `<pre class="stream-stage-pre">${escapeHtml(text)}</pre>`;
}

function normalizeDisplayedHtml(html: string): string {
  return stripPluginNativePlaceholderHtml(
    String(html ?? '')
      .replace(/<q(\s[^>]*)?>/gi, '<span class="dialog-inline">')
      .replace(/<\/q>/gi, '</span>'),
  );
}

function buildFinalHtml(renderSource: string, message_id: number, artifactSource?: string): string {
  let html = '';
  try {
    if (typeof formatAsDisplayedMessage === 'function') {
      html = normalizeDisplayedHtml(formatAsDisplayedMessage(renderSource || '(空回复)', { message_id }));
    }
  } catch {
    // ignore
  }
  if (!html) {
    html = normalizeDisplayedHtml(`<p>${escapeHtml(renderSource || '(空回复)')}</p>`);
  }
  return applyTranscriptArtifacts({
    html,
    renderSource: artifactSource ?? renderSource,
    messageId: message_id,
    appendArtifacts: appendChatu8ArtifactsToHtml,
  });
}

function readChatu8CacheEntries(messageId?: number | null): unknown[] {
  const ctx = readHostContext();
  return collectPluginNativeCacheArtifacts(ctx?.chatMetadata?.['st-chatu8'], messageId);
}

function collectImageSourceIdentitiesFromHtml(html: string): Set<string> {
  const identities = new Set<string>();
  const source = String(html ?? '').trim();
  if (!source) return identities;

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = source;
  const images = Array.from(doc.body.querySelectorAll('img')) as HTMLImageElement[];
  for (const image of images) {
    const src = normalizeImageSrcForCompare(image.getAttribute('src') ?? image.currentSrc ?? '');
    if (!src) continue;
    identities.add(src);
  }
  return identities;
}

function normalizeAnchorText(input: string): string {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAnchorSnippet(input: string): string {
  const normalized = normalizeAnchorText(input);
  if (!normalized) return '';
  if (normalized.length <= 72) return normalized;
  return normalized.slice(-72);
}

export function extractAnchorTextFromRawMessage(rawMessage: string, promptToken: string): string {
  const token = String(promptToken ?? '').trim();
  if (!token) return '';

  const normalizedRaw = stripStreamDemoRuntimeTags(String(rawMessage ?? '')).replace(/\r\n/g, '\n');
  const promptBody = parsePromptBodyFromToken(token);
  const candidates = [token, promptBody].filter(Boolean);

  for (const candidate of candidates) {
    const index = normalizedRaw.indexOf(candidate);
    if (index < 0) continue;
    const prefix = normalizedRaw
      .slice(0, index)
      .split(/\n{2,}/)
      .pop();
    const stripped = String(prefix ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const snippet = buildAnchorSnippet(stripped);
    if (snippet) return snippet;
  }

  return '';
}

function normalizeAnchorCompare(input: string): string {
  return normalizeAnchorText(input)
    .replace(/[“”"'`‘’《》【】（）(){}<>]/g, '')
    .replace(/\[|\]/g, '')
    .replace(/[，。！？；：、…,.!?;:]/g, '')
    .trim();
}

function splitAnchorFragments(input: string): string[] {
  return normalizeAnchorText(input)
    .split(/[，。！？；：、…,.!?;:\n\r]+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length >= 8)
    .sort((a, b) => b.length - a.length);
}

function createGeneratedImageFigureHtml(
  image: RenderableGeneratedImage,
  className: string,
  messageId?: number | null,
): string {
  const messageIdAttr =
    messageId != null && Number.isFinite(Number(messageId))
      ? ` data-message-id="${Math.trunc(Number(messageId))}"`
      : '';
  const promptTokenAttr = image.promptToken
    ? ` data-prompt-token="${encodeDataAttr(image.promptToken)}"`
    : ' data-prompt-token=""';
  const markerIdAttr = image.markerId ? ` data-marker-id="${escapeHtml(image.markerId)}"` : ' data-marker-id=""';
  const requestIdAttr = image.requestId ? ` data-request-id="${escapeHtml(image.requestId)}"` : ' data-request-id=""';
  const imageSrcAttr = image.src ? ` data-image-src="${encodeDataAttr(image.src)}"` : ' data-image-src=""';
  const imgSrcAttr = image.src ? ` src="${escapeHtml(image.src)}"` : '';
  return `<figure class="${className}"${messageIdAttr}${markerIdAttr}${promptTokenAttr}${requestIdAttr}${imageSrcAttr}><img${imgSrcAttr} alt="${escapeHtml(image.alt || 'generated image')}" loading="lazy"${messageIdAttr}${markerIdAttr}${promptTokenAttr}${requestIdAttr}${imageSrcAttr}></figure>`;
}

function readChatu8ExtraImages(messageId: number): RenderableGeneratedImage[] {
  const message = readChatMessageDetail(messageId);
  const extraImages = _.get(message, 'extra.images', null);
  const rawSwipeId = Number(_.get(message, 'swipe_id', null));
  const swipeId = Number.isFinite(rawSwipeId) ? Math.trunc(rawSwipeId) : null;

  let selectedEntries: any[] = [];
  if (Array.isArray(extraImages)) {
    if (swipeId != null && swipeId >= 0 && Array.isArray(extraImages[swipeId]) && extraImages[swipeId].length > 0) {
      selectedEntries = extraImages[swipeId] as any[];
    } else if (extraImages.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
      selectedEntries = extraImages as any[];
    } else {
      selectedEntries = extraImages.flatMap(item => (Array.isArray(item) ? item : []));
    }
  } else if (extraImages && typeof extraImages === 'object') {
    selectedEntries = Object.values(extraImages as Record<string, unknown>).flatMap(item =>
      Array.isArray(item) ? item : [item],
    );
  }

  const out: RenderableGeneratedImage[] = [];
  const seen = new Set<string>();
  for (const entry of selectedEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const src = normalizeImageDataToSrc(
      (entry as any).src ??
        (entry as any).image ??
        (entry as any).imageData ??
        (entry as any).path ??
        (entry as any).url,
    );
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({
      markerId: String((entry as any).markerId ?? '').trim() || undefined,
      imageId: String((entry as any).imageId ?? '').trim() || undefined,
      src,
      alt: String((entry as any).alt ?? 'generated image').trim(),
      promptToken: String((entry as any).promptToken ?? (entry as any).tag ?? (entry as any).prompt ?? '').trim(),
      requestId: String((entry as any).requestId ?? (entry as any).request_id ?? '').trim() || undefined,
      anchorText: buildAnchorSnippet(String((entry as any).regex ?? '').trim()) || undefined,
    });
  }
  return out;
}

function toRenderableImageFromNativeArtifact(
  artifact: NativeFirstImageArtifact,
): NativeFirstRenderableGeneratedImage | null {
  const src = normalizeImageSrcForCompare(artifact.src ?? '');
  if (!src) return null;
  return {
    source: artifact.source,
    markerId: String(artifact.markerId ?? '').trim() || undefined,
    imageId: String(artifact.imageId ?? '').trim() || undefined,
    src,
    alt: String(artifact.alt ?? 'generated image').trim() || 'generated image',
    promptToken: String(artifact.promptToken ?? '').trim() || undefined,
    requestId: String(artifact.requestId ?? '').trim() || undefined,
    anchorText: buildAnchorSnippet(String(artifact.anchorText ?? '')) || undefined,
  };
}

function readNativeFirstArtifactsForMessage(input: {
  messageId: number;
  rawMessage?: string;
  hostDomArtifacts?: RenderableGeneratedImage[];
}): NativeFirstImageArtifact[] {
  const messageId = Math.trunc(Number(input.messageId));
  if (!Number.isFinite(messageId) || messageId < 0) return [];

  const message = readChatMessageDetail(messageId);
  const rawMessage = String(input.rawMessage ?? message?.mes ?? '');
  return readNativeFirstImageArtifacts({
    messageId,
    rawMessage,
    hostDomArtifacts: input.hostDomArtifacts ?? [],
    extraImages: readChatu8ExtraImages(messageId),
    cacheArtifacts: readChatu8CacheEntries(messageId),
  });
}

function readNativeFirstRenderableImagesForMessage(input: {
  messageId: number;
  rawMessage?: string;
  hostDomArtifacts?: RenderableGeneratedImage[];
}): NativeFirstRenderableGeneratedImage[] {
  const out: NativeFirstRenderableGeneratedImage[] = [];
  const seen = new Set<string>();

  for (const artifact of readNativeFirstArtifactsForMessage(input)) {
    const rendered = toRenderableImageFromNativeArtifact(artifact);
    if (!rendered) continue;
    if (seen.has(rendered.src)) continue;
    seen.add(rendered.src);
    out.push(rendered);
  }

  return out;
}

function readNativeFirstPromptTokensForMessage(input: { messageId: number; rawMessage?: string }): string[] {
  const messageId = Math.trunc(Number(input.messageId));
  if (!Number.isFinite(messageId) || messageId < 0) return [];

  const message = readChatMessageDetail(messageId);
  const rawMessage = String(input.rawMessage ?? message?.mes ?? '');
  return readNativeFirstPromptTokens({
    messageId,
    rawMessage,
    extraImages: readChatu8ExtraImages(messageId),
    cacheArtifacts: readChatu8CacheEntries(messageId),
  });
}

export function readNativeFirstMembershipForMessage(input: {
  messageId: number;
  rawMessage?: string;
  hostDomArtifacts?: RenderableGeneratedImage[];
}) {
  const messageId = Math.trunc(Number(input.messageId));
  if (!Number.isFinite(messageId) || messageId < 0) return [];

  const message = readChatMessageDetail(messageId);
  const rawMessage = String(input.rawMessage ?? message?.mes ?? '');
  return readNativeFirstMembershipEntries({
    messageId,
    rawMessage,
    hostDomArtifacts: input.hostDomArtifacts ?? [],
    extraImages: readChatu8ExtraImages(messageId),
    cacheArtifacts: readChatu8CacheEntries(messageId),
  });
}

export function createPromptTokenMarkup(promptTokens: string[]): string {
  if (promptTokens.length === 0) return '';
  const items = promptTokens
    .map(token => `<pre class="assistant-image-prompt-token">${escapeHtml(token)}</pre>`)
    .join('');
  return `<section class="assistant-image-prompt-list">${items}</section>`;
}

function createGeneratedImageFigureElement(
  doc: Document,
  image: RenderableGeneratedImage,
  className: string,
  messageId?: number | null,
): HTMLElement {
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = createGeneratedImageFigureHtml(image, className, messageId);
  return (wrapper.firstElementChild as HTMLElement | null) ?? doc.createElement('figure');
}

function collectInlineAnchorCandidates(root: HTMLElement): HTMLElement[] {
  const preferred = Array.from(root.querySelectorAll('p, pre, blockquote, li, div')) as HTMLElement[];
  return preferred.filter(node => {
    if (node.closest(`.assistant-image-prompt-list`)) return false;
    if (node.matches(`.${FALLBACK_IMAGE_CLASSES.item}, .${FALLBACK_IMAGE_CLASSES.inline}`)) return false;
    if (node.querySelector('img, figure')) return false;
    if (node.tagName === 'DIV' && node.querySelector('p, pre, blockquote, li')) return false;
    return normalizeAnchorText(node.textContent ?? '').length >= 12;
  });
}

function resolveInlineAnchorTarget(root: HTMLElement, anchorText: string): HTMLElement | null {
  const needle = buildAnchorSnippet(anchorText);
  if (!needle) return null;
  const needleComparable = normalizeAnchorCompare(needle);
  const anchorFragments = splitAnchorFragments(anchorText);
  const candidates = collectInlineAnchorCandidates(root);
  let fallback: HTMLElement | null = null;

  for (const candidate of candidates) {
    const text = normalizeAnchorText(candidate.textContent ?? '');
    const comparableText = normalizeAnchorCompare(text);
    if (!text) continue;
    if (text.includes(needle) || needle.includes(text)) return candidate;
    if (
      needleComparable &&
      comparableText &&
      (comparableText.includes(needleComparable) || needleComparable.includes(comparableText))
    ) {
      return candidate;
    }
    if (
      anchorFragments.some(fragment => {
        const comparableFragment = normalizeAnchorCompare(fragment);
        return (
          fragment.length >= 8 &&
          (text.includes(fragment) || (comparableFragment && comparableText.includes(comparableFragment)))
        );
      })
    ) {
      return candidate;
    }
    if (
      !fallback &&
      (text.includes(needle.slice(0, Math.min(24, needle.length))) || needle.includes(text.slice(-24)))
    ) {
      fallback = candidate;
    }
  }

  return fallback;
}

function injectGeneratedImagesIntoHtml(
  html: string,
  images: RenderableGeneratedImage[],
  messageId: number,
  options: { appendUnanchoredToEnd?: boolean } = {},
): string {
  if (images.length === 0) return html;

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = html;
  const insertionRefs = new Map<HTMLElement, HTMLElement>();
  const fallbackFigures: HTMLElement[] = [];
  const appendUnanchoredToEnd = options.appendUnanchoredToEnd !== false;

  for (const image of images) {
    const figure = createGeneratedImageFigureElement(doc, image, FALLBACK_IMAGE_CLASSES.inline, messageId);
    const anchor = image.anchorText ? resolveInlineAnchorTarget(doc.body, image.anchorText) : null;
    if (!anchor) {
      if (appendUnanchoredToEnd) fallbackFigures.push(figure);
      continue;
    }
    const reference = insertionRefs.get(anchor) ?? anchor;
    reference.after(figure);
    insertionRefs.set(anchor, figure);
  }

  for (const figure of fallbackFigures) {
    doc.body.append(figure);
  }

  return doc.body.innerHTML;
}

function appendChatu8ArtifactsToHtml(html: string, renderSource: string, messageId: number): string {
  const promptTokens = collectChatu8PromptTokens(renderSource);
  const promptTokenSet = new Set(promptTokens);
  const iframeRoots = resolveIframeAssistantRoots(messageId);
  const nativeFirstImages = readNativeFirstRenderableImagesForMessage({
    messageId,
    rawMessage: renderSource,
    hostDomArtifacts: extractRenderedImagesFromRoots(messageId),
  });
  const pluginNativeImages = nativeFirstImages.filter(
    image => image.source === 'host_dom' || image.source === 'extra' || image.source === 'mes_tag',
  );
  const compatibilityImages = nativeFirstImages.filter(image => image.source === 'cache');
  const hasPluginNativeArtifacts = countPluginNativeImageArtifacts(iframeRoots) > 0;

  const renderMode = chooseImageRenderMode({
    hasPluginNativeDom: hasPluginNativeArtifacts,
    pluginNativeCount: pluginNativeImages.length,
    compatibilityCount: compatibilityImages.length,
  });

  const images =
    renderMode === 'plugin-native-data'
      ? pluginNativeImages
      : shouldInjectTranscriptImages(renderMode)
        ? compatibilityImages
        : [];

  const existingSources = collectImageSourceIdentitiesFromHtml(html);
  const extraSources = new Set<string>();
  for (const img of nativeFirstImages) {
    const s = normalizeImageSrcForCompare(img.src);
    if (s) extraSources.add(s);
  }
  const dedupedImages: RenderableGeneratedImage[] = [];
  const seenSources = new Set<string>();
  for (const image of images) {
    const normalizedSrc = normalizeImageSrcForCompare(image.src);
    if (!normalizedSrc || existingSources.has(image.src) || seenSources.has(normalizedSrc)) continue;
    if (image.promptToken && promptTokenSet.size > 0 && !promptTokenSet.has(image.promptToken)) continue;
    // Also skip if this src is already covered by extraImages (plugin-native path).
    // This prevents duplicate injection when extra images are managed by the
    // image strip but were temporarily missing from existingSources (DOM not yet updated).
    if (extraSources.has(normalizedSrc)) continue;
    seenSources.add(normalizedSrc);
    dedupedImages.push(image);
  }

  const htmlWithImages = injectGeneratedImagesIntoHtml(html, dedupedImages, messageId, {
    appendUnanchoredToEnd: renderMode !== 'plugin-native-data',
  });
  return htmlWithImages;
}

function resolveDisplayedMessageRoots(messageId: number): HTMLElement[] {
  const roots: HTMLElement[] = [];
  const pushRoot = (root: HTMLElement | null | undefined) => {
    if (!root) return;
    if (roots.includes(root)) return;
    roots.push(root);
  };

  try {
    if (typeof retrieveDisplayedMessage === 'function') {
      const $mes = retrieveDisplayedMessage(messageId);
      pushRoot($mes?.get?.(0) as HTMLElement | undefined);
    }
  } catch {
    // ignore
  }

  const mesid = Math.trunc(messageId);
  const selectors = [`#chat > .mes[mesid='${mesid}']`, `#chat .mes[mesid='${mesid}']`, `.mes[mesid='${mesid}']`];

  // 方式1：通过 SillyTavern 全局 window 对象直接查询宿主 DOM
  try {
    const hostWindow = globalThis.parent as WindowProxy & typeof globalThis;
    const hostDoc = hostWindow?.document;
    if (hostDoc) {
      for (const selector of selectors) {
        const el = hostDoc.querySelector(selector) as HTMLElement | null;
        if (el) pushRoot(el);
      }
    }
  } catch {
    // 跨域时忽略
  }

  // 方式2：尝试 retrieveDisplayedMessage 找到的父容器（它返回的是 mes_text，需要向上找 .mes）
  try {
    if (typeof retrieveDisplayedMessage === 'function') {
      const $mes = retrieveDisplayedMessage(messageId);
      const el = $mes?.get?.(0) as HTMLElement | undefined;
      if (el) {
        const parentMes = el.closest?.('.mes');
        if (parentMes) pushRoot(parentMes as HTMLElement);
      }
    }
  } catch {
    // ignore
  }

  // 方式3：回退搜索 collectReachableHostDocuments
  for (const doc of collectReachableHostDocuments()) {
    for (const selector of selectors) {
      pushRoot(doc.querySelector(selector) as HTMLElement | null);
    }
  }

  return roots;
}

function resolveIframeAssistantRoots(messageId: number): HTMLElement[] {
  const roots: HTMLElement[] = [];
  const mesid = Math.trunc(messageId);
  const selectors = [
    `.mes[data-message-id='${mesid}']`,
    `.mes[mesid='${mesid}']`,
    `.assistant-body[data-message-id='${mesid}']`,
    `.transcript-entry[data-message-id='${mesid}'] .assistant-body-wrap`,
    `.transcript-entry[data-message-id='${mesid}'] .assistant-body`,
  ];

  // 通过 SillyTavern 全局 window 对象直接查询宿主 DOM
  try {
    const hostWindow = globalThis.parent as WindowProxy & typeof globalThis;
    const hostDoc = hostWindow?.document;
    if (hostDoc) {
      for (const selector of selectors) {
        const nodes = Array.from(hostDoc.querySelectorAll(selector)) as HTMLElement[];
        for (const node of nodes) {
          if (roots.includes(node)) continue;
          roots.push(node);
        }
      }
    }
  } catch {
    // 跨域时忽略
  }

  // 回退：搜索 collectReachableHostDocuments
  for (const doc of collectReachableHostDocuments()) {
    for (const selector of selectors) {
      const nodes = Array.from(doc.querySelectorAll(selector)) as HTMLElement[];
      for (const node of nodes) {
        if (roots.includes(node)) continue;
        roots.push(node);
      }
    }
  }
  return roots;
}

function extractPromptTokensFromRoots(roots: HTMLElement[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const buttons = Array.from(root.querySelectorAll(CHATU8_IMAGE_BUTTON_SELECTOR)) as HTMLElement[];
    for (const button of buttons) {
      const payload = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
      if (!payload) continue;
      for (const token of collectChatu8PromptTokens(payload)) {
        if (seen.has(token)) continue;
        seen.add(token);
        out.push(token);
      }
    }
  }

  return out;
}

export function extractPromptTokensFromDisplayedMessage(messageId: number): string[] {
  const roots = [...resolveIframeAssistantRoots(messageId), ...resolveDisplayedMessageRoots(messageId)];
  const domTokens = roots.length > 0 ? extractPromptTokensFromRoots(roots) : [];
  if (domTokens.length > 0) return domTokens;

  return readNativeFirstPromptTokensForMessage({ messageId });
}

function extractAnchorTextForImageNode(node: Element, root: HTMLElement): string {
  const snippets: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(candidate) {
      const text = normalizeAnchorText(candidate.textContent ?? '');
      if (text.length < 10) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    const relation = current.compareDocumentPosition(node);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
      snippets.push(buildAnchorSnippet(current.textContent ?? ''));
      if (snippets.length > 3) snippets.shift();
      current = walker.nextNode();
      continue;
    }
    break;
  }

  return snippets.reverse().find(Boolean) ?? '';
}

function resolvePromptButtonForImageSpan(span: HTMLElement, root: HTMLElement): HTMLElement | null {
  const requestId = String(span.dataset.requestId ?? span.getAttribute('data-request-id') ?? '').trim();
  const buttons = Array.from(root.querySelectorAll(CHATU8_IMAGE_BUTTON_SELECTOR)) as HTMLElement[];
  if (requestId) {
    const matched = buttons.find(button => {
      const buttonRequestId = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
      return buttonRequestId === requestId;
    });
    if (matched) return matched;
  }

  let sibling: Element | null = span.previousElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLElement && sibling.matches(CHATU8_IMAGE_BUTTON_SELECTOR)) return sibling;
    sibling = sibling.previousElementSibling;
  }

  return buttons[0] ?? null;
}

function extractRenderedImagesFromRoots(messageId: number): RenderableGeneratedImage[] {
  const out: RenderableGeneratedImage[] = [];
  const seen = new Set<string>();
  const mesid = Math.trunc(messageId);

  const pushImage = (
    srcLike: unknown,
    altLike: unknown,
    promptLike?: unknown,
    requestIdLike?: unknown,
    anchorTextLike?: unknown,
  ) => {
    const src = normalizeImageSrcForCompare(srcLike);
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push({
      markerId: undefined,
      src,
      alt: String(altLike ?? 'generated image').trim(),
      promptToken: String(promptLike ?? '').trim(),
      requestId: String(requestIdLike ?? '').trim() || undefined,
      anchorText: buildAnchorSnippet(String(anchorTextLike ?? '')) || undefined,
    });
  };

  const allRoots = new Set<HTMLElement>();
  for (const root of resolveIframeAssistantRoots(messageId)) {
    allRoots.add(root);
  }
  for (const root of resolveDisplayedMessageRoots(messageId)) {
    allRoots.add(root);
  }

  const searchInDocument = (doc: Document) => {
    const iframeSelectors = [
      `.transcript-entry[data-message-id='${mesid}']`,
      `.transcript-entry[data-message-id='${mesid}'] .assistant-body-wrap`,
      `.transcript-entry[data-message-id='${mesid}'] .assistant-body`,
    ];
    const displayedSelectors = [`.mes[data-message-id='${mesid}']`, `.mes[mesid='${mesid}']`];
    for (const selector of [...iframeSelectors, ...displayedSelectors]) {
      for (const el of Array.from(doc.querySelectorAll(selector)) as HTMLElement[]) {
        allRoots.add(el);
      }
    }
  };

  searchInDocument(document);
  try {
    if (window.parent) searchInDocument(window.parent.document);
  } catch {
    /* cross-origin */
  }
  try {
    if (window.top) searchInDocument(window.top.document);
  } catch {
    /* cross-origin */
  }

  // 只从 .st-chatu8-image-container 中获取图片，避免收集头像和画廊自己的图片
  for (const root of allRoots) {
    const stChatu8Containers = Array.from(root.querySelectorAll('.st-chatu8-image-container')) as HTMLElement[];
    for (const container of stChatu8Containers) {
      const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      for (const image of images) {
        const src = image.getAttribute('src') ?? image.currentSrc;
        // 只收集 data:image 的图片（base64 或 blob）
        if (src && (src.startsWith('data:image') || src.startsWith('blob:'))) {
          pushImage(
            src,
            image.getAttribute('alt') ?? image.getAttribute('title'),
            undefined,
            image.dataset.requestId ?? image.getAttribute('data-request-id'),
            extractAnchorTextForImageNode(image, container),
          );
        }
      }
    }
  }

  for (const root of allRoots) {
    const spans = Array.from(root.querySelectorAll(CHATU8_IMAGE_SPAN_SELECTOR)) as HTMLElement[];
    for (const span of spans) {
      const image = span.querySelector('img') as HTMLImageElement | null;
      if (!image) continue;
      const button = resolvePromptButtonForImageSpan(span, root);
      pushImage(
        image.getAttribute('src') ?? image.currentSrc,
        image.getAttribute('alt') ?? image.getAttribute('title'),
        button?.getAttribute('data-image-tag') ?? button?.getAttribute('data-link') ?? '',
        span.dataset.requestId ?? span.getAttribute('data-request-id') ?? button?.dataset.requestId ?? '',
        extractAnchorTextForImageNode(span, root),
      );
    }
  }

  return out;
}

function parsePromptBodyFromToken(promptToken: string): string {
  const token = String(promptToken ?? '').trim();
  if (!token) return '';
  const match = token.match(/^[^#]+###([\s\S]*?)###$/);
  return String(match?.[1] ?? token).trim();
}

function normalizeImageLabel(input: string, fallback = '未命名图像'): string {
  const value = String(input ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value || fallback;
}

function pickFirstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

export function extractTitleFromAnchor(anchorText: string): string {
  const anchor = normalizeImageLabel(anchorText, '');
  if (!anchor) return '';
  return anchor.length > 26 ? `${anchor.slice(0, 26)}…` : anchor;
}

export function extractTitleFromSrc(src: string): string {
  const source = String(src ?? '').trim();
  if (!source || source.startsWith('data:')) return '';
  try {
    const pathname = source.startsWith('http') ? new URL(source).pathname : source;
    const filename = pathname.split('/').pop() ?? '';
    const stem = filename.replace(/\.[a-z0-9]+$/i, '');
    return normalizeImageLabel(stem, '');
  } catch {
    const filename = source.split('/').pop() ?? '';
    const stem = filename.replace(/\.[a-z0-9]+$/i, '');
    return normalizeImageLabel(stem, '');
  }
}

function extractCharacterNameFromPrompt(promptToken: string): string {
  const prompt = parsePromptBodyFromToken(promptToken);
  if (!prompt) return '';

  const loraMatch = prompt.match(/<lora:([^:>]+)(?::[\d.]+)?>/i);
  if (loraMatch?.[1]) return normalizeImageLabel(loraMatch[1]);

  const namedMatch = prompt.match(/(?:角色|人物|character|name)\s*[:：]\s*([^,，|\n<>]{1,32})/i);
  if (namedMatch?.[1]) return normalizeImageLabel(namedMatch[1]);

  const quoteMatch = prompt.match(/[“"'「『]([^“”"'」』]{1,24})[”"'」』]/);
  if (quoteMatch?.[1]) return normalizeImageLabel(quoteMatch[1]);

  const firstSegment = prompt
    .split(/[,，|\n]/)
    .map(segment => normalizeImageLabel(segment, ''))
    .find(
      segment =>
        segment.length >= 2 && segment.length <= 24 && !/\b(masterpiece|best quality|1girl|solo)\b/i.test(segment),
    );
  return firstSegment ?? '';
}

function extractImageTitleFromPrompt(promptToken: string): string {
  const prompt = parsePromptBodyFromToken(promptToken);
  if (!prompt) return '';

  const cleaned = prompt.replace(/<lora:[^>]+>/gi, '').trim();
  const firstSegment = cleaned
    .split(/[,，|\n]/)
    .map(segment => normalizeImageLabel(segment, ''))
    .find(Boolean);
  if (!firstSegment) return '';
  return firstSegment.length > 32 ? `${firstSegment.slice(0, 32)}…` : firstSegment;
}

function buildGeneratedImageRefsForMessage(input: {
  messageId: number;
  rawMessage: string;
  createdOrderBase?: number;
  hostDomArtifacts?: RenderableGeneratedImage[];
}): GeneratedImageRef[] {
  const messageId = Math.trunc(Number(input.messageId));
  if (!Number.isFinite(messageId) || messageId < 0) return [];

  const promptTokens = collectChatu8PromptTokens(input.rawMessage);
  const createdOrderBase = Math.trunc(Number(input.createdOrderBase ?? 0));
  const hostDomArtifacts = input.hostDomArtifacts ?? extractRenderedImagesFromRoots(messageId);

  // 按 promptTokens 数量创建 refs，src 按顺序从 hostDomArtifacts 映射
  const domSrcs = hostDomArtifacts.map(a => a.src);
  const result: GeneratedImageRef[] = [];

  for (let i = 0; i < promptTokens.length; i++) {
    const promptToken = promptTokens[i];
    const src = i < domSrcs.length ? domSrcs[i] : undefined;

    const markerId = buildGeneratedImageMarkerId({
      messageId,
      promptToken,
      order: i,
    });
    const title =
      pickFirstNonEmpty(
        extractImageTitleFromPrompt(promptToken),
        extractCharacterNameFromPrompt(promptToken),
        `楼层 #${messageId} · 图 ${i + 1}`,
      ) || `楼层 #${messageId} · 图 ${i + 1}`;

    result.push({
      id: markerId,
      messageId,
      markerId,
      imageId: undefined,
      promptToken,
      requestId: undefined,
      anchorText: undefined,
      title,
      characterName: extractCharacterNameFromPrompt(promptToken) || undefined,
      createdOrder: createdOrderBase * 100 + i,
      src,
    });
  }

  return result;
}

function hasRelevantChatu8Mutation(record: MutationRecord): boolean {
  if (record.type === 'attributes' && record.attributeName === 'src') {
    const target = record.target as HTMLElement;
    if (target.tagName === 'IMG' && target.closest('.st-chatu8-image-span, .mes')) {
      return true;
    }
  }

  const matchesRelevantNode = (node: Node | null | undefined) => isPluginNativeMutationNode(node);

  if (matchesRelevantNode(record.target)) return true;
  for (const node of Array.from(record.addedNodes)) {
    if (matchesRelevantNode(node)) return true;
  }
  for (const node of Array.from(record.removedNodes)) {
    if (matchesRelevantNode(node)) return true;
  }
  return false;
}

function normalizeMutationMessageId(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return null;
  return Math.trunc(normalized);
}

function readMutationMessageIdFromElement(element: Element | null): number | null {
  if (!element) return null;

  const directMessageId =
    element.getAttribute('data-message-id') ??
    (element as HTMLElement).dataset?.messageId ??
    element.getAttribute('mesid') ??
    '';
  const normalizedDirectMessageId = normalizeMutationMessageId(directMessageId);
  if (normalizedDirectMessageId != null) return normalizedDirectMessageId;

  const dataMessageCarrier = element.closest?.('[data-message-id]') as HTMLElement | null;
  const normalizedDataMessageId = normalizeMutationMessageId(
    dataMessageCarrier?.dataset?.messageId ?? dataMessageCarrier?.getAttribute('data-message-id') ?? '',
  );
  if (normalizedDataMessageId != null) return normalizedDataMessageId;

  const mesCarrier = element.closest?.('.mes[mesid]') as HTMLElement | null;
  return normalizeMutationMessageId(mesCarrier?.getAttribute('mesid') ?? '');
}

function readMutationMessageIdFromNode(node: Node | null | undefined): number | null {
  const element = node instanceof Element ? node : node?.parentElement instanceof Element ? node.parentElement : null;
  return readMutationMessageIdFromElement(element);
}

function collectMutationMessageIds(records: MutationRecord[]): number[] {
  const out = new Set<number>();
  const remember = (node: Node | null | undefined) => {
    const messageId = readMutationMessageIdFromNode(node);
    if (messageId != null) out.add(messageId);
  };

  for (const record of Array.isArray(records) ? records : []) {
    remember(record.target);
    for (const node of Array.from(record.addedNodes)) {
      remember(node);
    }
    for (const node of Array.from(record.removedNodes)) {
      remember(node);
    }
  }

  return [...out];
}

function bindHostPluginMutationObservers(onRelevantMutation: (records: MutationRecord[]) => void): MutationObserver[] {
  if (typeof MutationObserver === 'undefined') return [];

  const observers: MutationObserver[] = [];
  const hostDocs = collectReachableHostDocuments().filter(doc => doc && doc !== document);
  for (const hostDoc of hostDocs) {
    const target = (hostDoc.querySelector('#chat') as HTMLElement | null) ?? hostDoc.body;
    if (!target) continue;

    const observer = new MutationObserver(records => {
      if (!records.some(hasRelevantChatu8Mutation)) return;
      onRelevantMutation(records);
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false,
    });
    observers.push(observer);
  }

  return observers;
}

function readCurrentContainerMessageId(): number | null {
  try {
    const value = Number(getCurrentMessageId?.());
    return Number.isFinite(value) ? Math.trunc(value) : null;
  } catch {
    return null;
  }
}

async function waitUntilMessageStatDataReady({
  intervalMs = 50,
  timeoutMs = 5000,
}: { intervalMs?: number; timeoutMs?: number } = {}): Promise<void> {
  const start = Date.now();
  while (true) {
    try {
      if (_.has(getVariables({ type: 'message' }), 'stat_data')) return;
    } catch {
      // ignore and retry
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('[stream-demo] waitUntilMessageStatDataReady timeout');
    }

    await new Promise<void>(resolve => window.setTimeout(resolve, intervalMs));
  }
}

function normalizeRoleLabel(role: TranscriptItem['role']): string {
  if (role === 'user') return '用户';
  if (role === 'system') return '系统';
  return '助手';
}

function buildOpeningCompiledUserInput(preset: OpeningPreset, payload: OpeningPayload) {
  return buildOpeningGeneratePrompt(preset, payload);
}

function buildTranscriptItem(input: {
  id: number;
  role: TranscriptItem['role'];
  raw: string;
  hidden: boolean;
  isOpening?: boolean;
  canReroll?: boolean;
  latestAssistantId: number | null;
  status: DemoStatus;
}): TranscriptItem {
  const isDemoAssistant = input.role === 'assistant' && isStreamDemoMessage(input.raw);
  const structuredOptions = input.role === 'assistant' ? extractOpeningOptions(input.raw) : [];
  const hasStructuredContent = input.role === 'assistant' && /<content(?:\s[^>]*)?>/i.test(input.raw);
  const phase = isDemoAssistant ? extractStreamDemoPhase(input.raw) : 'plain';
  const content = isDemoAssistant
    ? extractStreamDemoContent(input.raw)
    : hasStructuredContent
      ? extractOpeningContentLoose(input.raw)
      : input.raw.trim();
  const strippedRenderSource = isDemoAssistant ? stripStreamDemoRuntimeTags(input.raw) : input.raw.trim();
  const options = isDemoAssistant ? extractStreamDemoOptions(input.raw) : structuredOptions;
  const renderSource = buildAssistantRenderSource({
    isDemoAssistant,
    hasStructuredContent,
    content,
    strippedRenderSource,
  });
  const displayRenderSource = resolveAssistantDisplayRenderSource({
    isDemoAssistant,
    hasStructuredContent,
    renderSource,
    strippedRenderSource,
  });
  const streamRenderSource = isDemoAssistant ? content : displayRenderSource;
  const regexText = applyRegexForDisplay(displayRenderSource, input.role);
  const streamHtml = isDemoAssistant
    ? buildFinalHtml(renderSource, input.id, strippedRenderSource)
    : buildFinalHtml(displayRenderSource, input.id, strippedRenderSource);
  const finalHtml = buildFinalHtml(displayRenderSource, input.id, strippedRenderSource);
  const generatedImages: GeneratedImageRef[] = [];
  const preview = '';

  return {
    message_id: input.id,
    role: input.role,
    roleLabel: normalizeRoleLabel(input.role),
    isOpening: input.isOpening === true,
    raw: input.raw,
    renderSource: displayRenderSource,
    content,
    preview,
    regexText,
    streamHtml,
    finalHtml,
    generatedImages,
    options,
    hidden: input.hidden,
    phase,
    isLatest: input.latestAssistantId === input.id,
    isStreaming: input.latestAssistantId === input.id && (input.status === 'streaming' || phase === 'stream'),
    canOpenDetail: true,
    canDeleteFrom: input.isOpening !== true,
    canReroll: input.canReroll === true,
  };
}

function sortTranscriptItems(items: TranscriptItem[]): TranscriptItem[] {
  return items.slice().sort((a, b) => a.message_id - b.message_id);
}

function clipTranscriptItemsForUi(items: TranscriptItem[]): TranscriptItem[] {
  return sortTranscriptItems(items).slice(-TRANSCRIPT_UI_WINDOW_SIZE);
}

export function useStreamingDemo() {
  const initialContainerMessageId = readCurrentContainerMessageId();
  const input = ref('');
  const busy = ref(false);
  const status = ref<DemoStatus>('idle');
  const streamText = ref('');
  const finalText = ref('');
  const errorText = ref('');
  const assistantMessageId = ref<number | null>(null);
  const transcript = ref<TranscriptItem[]>([]);
  const filterMode = ref<TranscriptFilterMode>('all');
  const density = ref<TranscriptDensity>('comfortable');
  const theme = ref<DemoTheme>('tech');
  const fontMode = ref<ReaderFontMode>('hud');
  const readingMode = ref<ReadingMode>('following_latest');
  const transcriptWindowMode = ref<TranscriptWindowMode>('latest');
  const transcriptHistoryAnchorLastId = ref<number | null>(null);
  const transcriptHistoryPageIndex = ref(0);
  const selectedItem = ref<TranscriptItem | null>(null);
  const transcriptDomRevision = ref(0);
  const galleryRevision = ref(0);
  const openingExpanded = ref(true);
  const logs = ref<ReaderLogItem[]>([]);
  const editingUserMessageId = ref<number | null>(null);
  const editingUserDraft = ref('');
  const rollbackConfirmMessageId = ref<number | null>(null);
  const openingPreset = ref<OpeningPreset>(getDefaultOpeningPreset());
  const openingPayload = ref<OpeningPayload>(getDefaultOpeningPayload(openingPreset.value));
  const openingWorldModes = getOpeningWorldModes();
  const openingRoutes = getOpeningRoutes();
  const isCalibratingDailyRoll = ref(false);
  function isOpeningWorkbenchHostActive(): boolean {
    return isOpeningWorkbenchScopeActive({
      initialContainerMessageId,
      currentContainerMessageId: readCurrentContainerMessageId(),
    });
  }

  function isActiveOpeningWorkbenchScope(): boolean {
    return isOpeningWorkbenchHostActive();
  }

  function getActiveContainerMessageId(): number | null {
    return resolveActiveContainerMessageId({
      initialContainerMessageId,
      currentContainerMessageId: readCurrentContainerMessageId(),
    });
  }

  const followLatest = computed(() => transcriptWindowMode.value === 'latest');

  const readingModeLabel = computed(() => (followLatest.value ? '跟随最新' : '浏览历史'));

  const debugTraceRuntime =
    typeof window !== 'undefined'
      ? installDebugTraceRuntime({ target: window as any, maxEvents: 500 })
      : createDebugTraceStore({ enabled: false });

  let patchQueue = Promise.resolve();
  let latestPatchedMessage = '';
  let activeGenerationTraceId = '';
  let latestLifecycleTraceId = '';
  let rebuildSequence = 0;
  let patchSequence = 0;
  let assistantPlaceholderCreating = false;
  let hostMesTextPrimedForCurrentGeneration = false;
  let nativeSendProxyActive = false;
  const generationListenerEpochController = createGenerationListenerEpochController();
  let generationStops: StopHandle[] = [];
  let historyStops: StopHandle[] = [];
  let mvuStops: StopHandle[] = [];
  let hidePolicyTimer = 0;
  let hidePolicyRunning = false;
  let hidePolicyRerun = false;
  const hostImageDataSyncSignatures = new Map<number, string>();
  let hideStatePersistTimer = 0;
  let externalSyncTimer = 0;
  let readerStatePersistTimer = 0;
  let openingPayloadPersistTimer = 0;
  let generatedImageDomMutationTimer = 0;
  let generatedImageDomObserver: MutationObserver | null = null;
  let hostPluginMutationObservers: MutationObserver[] = [];
  let lifecycleEchoSuppressUntilMs = 0;
  let lifecycleEchoSuppressedHostEvents: string[] = [];

  const mvuSourceRevision = ref(0);
  const imagePendingTaskManager = createImagePendingTaskManager();
  const imageRecentIntentStore = createImageRecentIntentStore();

  function resolveTraceId(fallbackPrefix = 'trace') {
    return activeGenerationTraceId || latestLifecycleTraceId || createTraceId(fallbackPrefix);
  }

  function recordLifecycleTrace(
    scope: string,
    event: string,
    payload: Record<string, unknown> = {},
    traceId = resolveTraceId(scope),
  ) {
    const entry = recordDebugTrace(debugTraceRuntime, {
      traceId,
      scope,
      event,
      payload: {
        busy: busy.value,
        status: status.value,
        assistantMessageId: assistantMessageId.value,
        ...payload,
      },
    });
    if (entry) {
      console.debug(`[stream-demo:debug] ${scope}.${event}`, entry);
    }
    return entry;
  }

  function logImageBridge(step: string, detail: Record<string, unknown> = {}) {
    console.info(`[stream-demo:image-bridge] ${step}`, detail);
  }

  function syncPendingRequestHintsFromDom() {
    const seen = new Set<string>();
    let registered = 0;

    for (const doc of collectReachableHostDocuments()) {
      const buttons = Array.from(doc.querySelectorAll(CHATU8_IMAGE_BUTTON_SELECTOR)) as HTMLElement[];
      for (const button of buttons) {
        const requestId = String(button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '').trim();
        if (!requestId || seen.has(requestId)) continue;

        const prompt = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
        const carrier =
          (button.closest(
            '.assistant-body[data-message-id], .assistant-card[data-message-id], .transcript-entry[data-message-id]',
          ) as HTMLElement | null) ?? (button.closest('.mes[mesid]') as HTMLElement | null);

        const messageId =
          Number(
            carrier?.dataset?.messageId ??
              carrier?.getAttribute?.('data-message-id') ??
              carrier?.getAttribute?.('mesid') ??
              '',
          ) || 0;
        const normalizedMessageId = Number.isFinite(messageId) && messageId >= 0 ? Math.trunc(messageId) : null;
        if (normalizedMessageId == null) continue;

        seen.add(requestId);
        imagePendingTaskManager.registerHint({
          messageId: normalizedMessageId,
          requestId,
          prompt,
        });
        registered += 1;
      }
    }

    syncTranscriptItemsFromHostData('host.plugin_native_data_sync');

    if (registered > 0) {
      logImageBridge('request-hints-synced', {
        registered,
        tasks: imagePendingTaskManager.getDebugState(),
      });
    }
  }

  function collectSelectedExtraImageEntries(message: any): Record<string, any>[] {
    const extraImages = _.get(message, 'extra.images', null);
    const rawSwipeId = Number(_.get(message, 'swipe_id', null));
    const swipeId = Number.isFinite(rawSwipeId) ? Math.trunc(rawSwipeId) : null;

    let selectedEntries: any[] = [];
    if (Array.isArray(extraImages)) {
      if (swipeId != null && swipeId >= 0 && Array.isArray(extraImages[swipeId]) && extraImages[swipeId].length > 0) {
        selectedEntries = extraImages[swipeId] as any[];
      } else if (extraImages.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
        selectedEntries = extraImages as any[];
      } else {
        selectedEntries = extraImages.flatMap(item => (Array.isArray(item) ? item : []));
      }
    } else if (extraImages && typeof extraImages === 'object') {
      selectedEntries = Object.values(extraImages as Record<string, unknown>).flatMap(item =>
        Array.isArray(item) ? item : [item],
      );
    }

    return selectedEntries.filter((entry): entry is Record<string, any> => Boolean(entry) && typeof entry === 'object');
  }

  function buildHostImageDataSignature(message: any): string {
    const rawMessage = String(message?.message ?? message?.mes ?? '').trim();
    const extraImages = _.get(message, 'extra.images', null);
    const rawSwipeId = Number(_.get(message, 'swipe_id', null));
    const swipeId = Number.isFinite(rawSwipeId) ? Math.trunc(rawSwipeId) : -1;
    const selectedEntries = collectSelectedExtraImageEntries(message);
    const promptTokenCount = collectChatu8PromptTokens(rawMessage).length;
    const extraImageShape = Array.isArray(extraImages)
      ? `arr:${extraImages.length}`
      : extraImages && typeof extraImages === 'object'
        ? `obj:${Object.keys(extraImages as Record<string, unknown>).length}`
        : 'none';
    const extraImageSignature = selectedEntries
      .map((entry, index) => {
        const src = normalizeImageDataToSrc(
          entry?.src ?? entry?.image ?? entry?.imageData ?? entry?.path ?? entry?.url ?? '',
        );
        return [
          index,
          String(entry?.requestId ?? entry?.request_id ?? '').trim(),
          String(entry?.markerId ?? '').trim(),
          String(entry?.imageId ?? entry?.image_id ?? '').trim(),
          String(entry?.promptToken ?? entry?.tag ?? entry?.prompt ?? '')
            .trim()
            .slice(0, 120),
          String(entry?.regex ?? '')
            .trim()
            .slice(0, 80),
          src ? `${src.slice(0, 64)}:${src.length}` : '',
        ].join('|');
      })
      .join('||');

    return [
      rawMessage.length,
      promptTokenCount,
      swipeId,
      extraImageShape,
      selectedEntries.length,
      extraImageSignature,
    ].join('::');
  }

  function listHostImageDataCandidates(messageIds: number[] = []): any[] {
    const containerId = getActiveContainerMessageId();
    const normalizedIds = new Set(
      messageIds.map(id => Math.trunc(Number(id))).filter(id => Number.isFinite(id) && id > 0),
    );

    return listAllChatMessages().filter(message => {
      const messageId = Math.trunc(Number(message?.message_id));
      if (!Number.isFinite(messageId) || messageId < 0) return false;
      if (containerId != null && messageId <= containerId) return false;
      if (normalizedIds.size > 0 && !normalizedIds.has(messageId)) return false;
      return resolveHostMessageRole(message) === 'assistant';
    });
  }

  function snapshotHostImageDataSignatures(messageIds: number[] = []) {
    for (const message of listHostImageDataCandidates(messageIds)) {
      const messageId = Math.trunc(Number(message?.message_id));
      if (!Number.isFinite(messageId) || messageId < 0) continue;
      hostImageDataSyncSignatures.set(messageId, buildHostImageDataSignature(message));
    }
  }

  function syncTranscriptItemsFromHostData(reason: string, messageIds: number[] = []) {
    const changedMessageIds: number[] = [];

    for (const message of listHostImageDataCandidates(messageIds)) {
      const messageId = Math.trunc(Number(message?.message_id));
      if (!Number.isFinite(messageId) || messageId < 0) continue;

      const nextSignature = buildHostImageDataSignature(message);
      const previousSignature = hostImageDataSyncSignatures.get(messageId);
      hostImageDataSyncSignatures.set(messageId, nextSignature);

      if (previousSignature == null || previousSignature === nextSignature) continue;
      changedMessageIds.push(messageId);
    }

    if (changedMessageIds.length === 0) return;

    queueGeneratedImageEntityRefresh(changedMessageIds);
    refreshTranscriptItemsByIds(changedMessageIds, reason);
    scheduleUiRefresh(['gallery'], reason);
    logImageBridge('host-data-synced', {
      reason,
      changedMessageIds,
    });
  }

  function resetTranscriptWindowToLatestState() {
    transcriptWindowMode.value = 'latest';
    transcriptHistoryAnchorLastId.value = null;
    transcriptHistoryPageIndex.value = 0;
  }

  const transcriptWindowRange = computed(() => {
    void transcript.value.length;
    const anchorLastId =
      transcriptWindowMode.value === 'history' && transcriptHistoryAnchorLastId.value != null
        ? transcriptHistoryAnchorLastId.value
        : getTrueChatLength();
    return resolveTranscriptWindowRange({
      anchorLastId,
      containerMessageId: getActiveContainerMessageId(),
      pageIndex: transcriptWindowMode.value === 'history' ? transcriptHistoryPageIndex.value : 0,
      pageSize: TRANSCRIPT_UI_WINDOW_SIZE,
    });
  });

  const transcriptWindowPages = computed(() => {
    void transcript.value.length;
    const anchorLastId =
      transcriptWindowMode.value === 'history' && transcriptHistoryAnchorLastId.value != null
        ? transcriptHistoryAnchorLastId.value
        : getTrueChatLength();
    return buildTranscriptWindowPageOptions({
      anchorLastId,
      containerMessageId: getActiveContainerMessageId(),
      pageSize: TRANSCRIPT_UI_WINDOW_SIZE,
    });
  });

  const transcriptWindowLabel = computed(() => {
    const currentPageIndex = transcriptWindowRange.value?.pageIndex ?? 0;
    return transcriptWindowPages.value.find(page => page.pageIndex === currentPageIndex)?.label ?? '';
  });
  const isTranscriptHistoryMode = computed(() => transcriptWindowMode.value === 'history');

  function selectTranscriptWindowPage(pageIndex: number) {
    const normalizedPageIndex = Math.max(0, Math.trunc(Number(pageIndex) || 0));
    if (normalizedPageIndex === 0) {
      resetTranscriptWindowToLatestState();
      readingMode.value = 'following_latest';
      queuePersistReaderChatState();
      rebuildTranscript('transcript_window_latest');
      return;
    }

    if (transcriptWindowMode.value !== 'history' || transcriptHistoryAnchorLastId.value == null) {
      transcriptHistoryAnchorLastId.value = getTrueChatLength();
    }
    const resolvedRange = resolveTranscriptWindowRange({
      anchorLastId: transcriptHistoryAnchorLastId.value,
      containerMessageId: getActiveContainerMessageId(),
      pageIndex: normalizedPageIndex,
      pageSize: TRANSCRIPT_UI_WINDOW_SIZE,
    });
    transcriptWindowMode.value = 'history';
    transcriptHistoryPageIndex.value = resolvedRange?.pageIndex ?? normalizedPageIndex;
    readingMode.value = 'browsing_history';
    queuePersistReaderChatState();
    rebuildTranscript('transcript_window_history');
  }

  const visibleTranscript = computed(() => {
    if (filterMode.value === 'all') return transcript.value;
    return transcript.value.filter(
      item => item.role === 'assistant' || item.isOpening || item.message_id === latestUserItem.value?.message_id,
    );
  });

  const transcriptStats = computed(() => ({
    total: transcriptWindowRange.value?.storyCount ?? transcript.value.length,
    assistant: transcript.value.filter(item => item.role === 'assistant').length,
  }));

  const hasSuccessfulOpeningAssistant = computed(() =>
    transcript.value.some(item => item.role === 'assistant' && hasRenderableAssistantMessageText(item.raw)),
  );
  const canDismissOpeningSetup = computed(() => hasSuccessfulOpeningAssistant.value);

  /**
   * 检查是否已有开局用户消息（开局种子或后续对话）。
   * 用于兜底检测：当 getVariables API 不可用、openingPayload 无法恢复时，
   * 如果已经有用户消息，说明开局流程已启动，不应再显示开局配置弹窗。
   */
  const hasOpeningSeedUserMessage = computed(() =>
    transcript.value.some(item => item.role === 'user' && item.message_id > 0),
  );

  const shouldShowOpeningSetup = computed(() => {
    if (!isOpeningWorkbenchHostActive()) return false;
    if (hasSuccessfulOpeningAssistant.value) return false;
    if (busy.value) return false;
    const result = true;
    console.log('[Debug] shouldShowOpeningSetup', {
      isOpeningWorkbenchHost: isOpeningWorkbenchHostActive(),
      state: openingPayload.value.state,
      openingAssistantMessageId: openingPayload.value.opening_assistant_message_id,
      hasCompiledPromptSnapshot: Boolean(String(openingPayload.value.compiled_prompt_snapshot ?? '').trim()),
      hasSuccessfulOpeningAssistant: hasSuccessfulOpeningAssistant.value,
      hasOpeningSeedUserMessage: hasOpeningSeedUserMessage.value,
      busy: busy.value,
      result,
    });
    return result;
  });

  const latestUserItem = computed(() => {
    for (let i = transcript.value.length - 1; i >= 0; i -= 1) {
      const item = transcript.value[i];
      if (item.role === 'user') return item;
    }
    return null;
  });
  const currentMvuAnchorMessageId = computed(() => {
    if (latestUserItem.value?.message_id != null) return latestUserItem.value.message_id;
    const openingAssistantMessageId = Math.trunc(Number(openingPayload.value.opening_assistant_message_id));
    if (Number.isFinite(openingAssistantMessageId) && openingAssistantMessageId > 0) return openingAssistantMessageId;
    return latestAssistantItem.value?.message_id ?? null;
  });

  const inputHasText = computed(() => String(input.value ?? '').trim().length > 0);

  function queuePersistReaderChatState() {
    if (readerStatePersistTimer) window.clearTimeout(readerStatePersistTimer);
    readerStatePersistTimer = window.setTimeout(() => {
      readerStatePersistTimer = 0;
      patchReaderChatState({
        reading_mode: readingMode.value,
        density: density.value,
        opening_expanded: openingExpanded.value,
        theme: theme.value,
        font_mode: fontMode.value,
      });
    }, 80);
  }

  function persistOpeningPayloadNow() {
    replaceOpeningPayloadInChat(openingPayload.value);
  }

  function queuePersistOpeningPayload(delay = 160) {
    if (openingPayloadPersistTimer) window.clearTimeout(openingPayloadPersistTimer);
    openingPayloadPersistTimer = window.setTimeout(() => {
      openingPayloadPersistTimer = 0;
      persistOpeningPayloadNow();
    }, delay);
  }

  function hydrateOpeningPayloadDefaults() {
    const fallback = getDefaultOpeningPayload(openingPreset.value);
    let changed = false;
    const nextFormValues = {
      ...(openingPayload.value.form_values ?? {}),
    } as Record<string, string>;

    for (const field of openingPreset.value.form_schema) {
      const key = field.key;
      const currentValue = String(nextFormValues[key] ?? '').trim();
      const fallbackValue = String(fallback.form_values?.[key] ?? '').trim();
      if (!currentValue && fallbackValue) {
        nextFormValues[key] = fallbackValue;
        changed = true;
      }
    }

    const nextWorldModeId =
      String(openingPayload.value.world_mode_id ?? '').trim() || String(fallback.world_mode_id ?? '').trim();
    const nextRouteId = String(openingPayload.value.route_id ?? '').trim() || String(fallback.route_id ?? '').trim();

    if (
      changed ||
      nextWorldModeId !== String(openingPayload.value.world_mode_id ?? '').trim() ||
      nextRouteId !== String(openingPayload.value.route_id ?? '').trim()
    ) {
      openingPayload.value = {
        ...openingPayload.value,
        world_mode_id: nextWorldModeId,
        route_id: nextRouteId,
        form_values: nextFormValues,
      };
      persistOpeningPayloadNow();
    }
  }

  function restoreReaderChatState() {
    const containerId = getActiveContainerMessageId();
    if (containerId !== 0) {
      return;
    }

    const state = readReaderChatState();
    const restoredMode = normalizeReadingMode(state.reading_mode);
    const restoredDensity = normalizeDensity(state.density);
    const restoredTheme = normalizeTheme(state.theme);
    const restoredFontMode = normalizeFontMode(state.font_mode);
    if (restoredMode) readingMode.value = restoredMode;
    if (restoredDensity) density.value = restoredDensity;
    if (restoredTheme) theme.value = restoredTheme;
    if (restoredFontMode) fontMode.value = restoredFontMode;
    if (typeof state.opening_expanded === 'boolean') openingExpanded.value = state.opening_expanded;
    if (state.version !== READER_CHAT_STATE_VERSION) {
      queuePersistReaderChatState();
    }

    const restoredOpeningPayload = readOpeningPayloadFromChat();
    console.log('[Debug] restoreReaderChatState openingPayload', {
      containerId,
      restoredFound: Boolean(restoredOpeningPayload),
      restoredState: restoredOpeningPayload?.state,
      restoredOpeningAssistantMessageId: restoredOpeningPayload?.opening_assistant_message_id,
      restoredHasCompiledPromptSnapshot: Boolean(restoredOpeningPayload?.compiled_prompt_snapshot),
    });
    if (restoredOpeningPayload) {
      openingPayload.value = restoredOpeningPayload;
      hydrateOpeningPayloadDefaults();
    } else {
      hydrateOpeningPayloadDefaults();
      persistOpeningPayloadNow();
    }
  }

  function appendLog(type: ReaderLogItem['type'], title: string, detail: string) {
    logs.value = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title,
        detail,
        createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      },
      ...logs.value,
    ].slice(0, 30);
  }

  const statusLabel = computed(() => {
    if (status.value === 'preparing') return '准备中';
    if (status.value === 'streaming') return '流式中';
    if (status.value === 'persisting') return '写回中';
    if (status.value === 'done') return '已完成';
    if (status.value === 'error') return '错误';
    return '空闲';
  });

  const latestAssistantItem = computed(() => {
    for (let i = transcript.value.length - 1; i >= 0; i -= 1) {
      const item = transcript.value[i];
      if (item.role === 'assistant') return item;
    }
    return null;
  });

  const readerSummary = computed<ReaderSummary>(() => {
    const turnCount = transcript.value.filter(item => item.role === 'assistant' && !item.isOpening).length;
    const latestUserPreview = '';
    const latestAssistantPreview = '';
    const assistantAnchorLabel = assistantMessageId.value != null ? `#${assistantMessageId.value}` : '-';
    const storySummary = '';

    return {
      turnCount,
      latestUserPreview,
      latestAssistantPreview,
      readingModeLabel: readingModeLabel.value,
      statusLabel: statusLabel.value,
      assistantAnchorLabel,
      storySummary,
    };
  });

  function closeDetail() {
    selectedItem.value = null;
  }

  function updateOpeningMeta(key: 'character' | 'time' | 'location', value: string) {
    const shouldResetResult = openingPayload.value.state === 'ready';
    openingPayload.value = {
      ...openingPayload.value,
      state: shouldResetResult ? 'configuring' : openingPayload.value.state,
      meta: {
        ...openingPayload.value.meta,
        [key]: String(value ?? ''),
      },
    };
    queuePersistOpeningPayload();
  }

  function updateOpeningWorldMode(value: string) {
    const worldMode = getOpeningWorldMode(value) ?? openingWorldModes[0] ?? null;
    const nextRouteId = String(openingPayload.value.route_id ?? '').trim() || worldMode?.recommended_main_route || '';
    const shouldResetResult = openingPayload.value.state === 'ready';
    openingPayload.value = {
      ...openingPayload.value,
      state: shouldResetResult ? 'configuring' : openingPayload.value.state,
      world_mode_id: worldMode?.id || value,
      route_id: nextRouteId,
    };
    queuePersistOpeningPayload();
  }

  function updateOpeningRoute(value: string) {
    const route = getOpeningRoute(value) ?? openingRoutes[0] ?? null;
    const shouldResetResult = openingPayload.value.state === 'ready';
    openingPayload.value = {
      ...openingPayload.value,
      state: shouldResetResult ? 'configuring' : openingPayload.value.state,
      route_id: route?.name || value,
    };
    queuePersistOpeningPayload();
  }

  function updateOpeningStream(value: boolean) {
    openingPayload.value = {
      ...openingPayload.value,
      use_stream: value === true,
    };
    queuePersistOpeningPayload();
  }

  function updateOpeningField(key: string, value: string) {
    const shouldResetResult = openingPayload.value.state === 'ready';
    const normalizedValue = String(value ?? '');

    openingPayload.value = {
      ...openingPayload.value,
      state: shouldResetResult ? 'configuring' : openingPayload.value.state,
      form_values: {
        ...openingPayload.value.form_values,
        [key]: normalizedValue,
      },
    };
    queuePersistOpeningPayload();
  }

  function setReadingMode(nextMode: ReadingMode) {
    if (readingMode.value === nextMode) return;
    readingMode.value = nextMode;
    queuePersistReaderChatState();
  }

  function toggleOpeningExpanded() {
    openingExpanded.value = !openingExpanded.value;
    queuePersistReaderChatState();
  }

  function openDetail(item: TranscriptItem) {
    selectedItem.value = item;
  }

  function refreshWorkbench() {
    rebuildTranscript();
    queueHidePolicy('manual_refresh');
    appendLog('info', '手动刷新', '已刷新 transcript，并重新收口 hidden 状态');
    toastr?.info?.('已刷新工作台');
  }

  async function calibrateDailyRollDate() {
    if (isCalibratingDailyRoll.value) return;
    isCalibratingDailyRoll.value = true;
    try {
      await waitGlobalInitialized('Mvu');

      const latestMessage = listAllChatMessages().at(-1);
      const targetMessageId = Math.trunc(Number(latestMessage?.message_id));
      if (!Number.isFinite(targetMessageId) || targetMessageId < 0) {
        toastr?.warning?.('无法校准：未能获取最新楼层号', '每日Roll');
        return;
      }

      const latestMvuData = Mvu.getMvuData({ type: 'message', message_id: targetMessageId }) as any;
      const today = String(_.get(latestMvuData, 'stat_data.世界.日期', '') ?? '').trim();
      if (!today) {
        toastr?.warning?.('无法校准：最新楼层没有世界日期', '每日Roll');
        return;
      }

      if (typeof updateVariablesWith === 'function') {
        const request = {
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          message_id: targetMessageId,
          today,
          ts: new Date().toISOString(),
        };
        updateVariablesWith(
          (vars: any) => {
            const raw = _.get(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, {});
            const next = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as any) } : {};
            next.manual_request = request;
            _.set(vars, CHAT_VAR_KEYS.EDEN_SHELTER_UPGRADE, next);
            return vars;
          },
          { type: 'chat' },
        );
      }

      await Mvu.replaceMvuData(latestMvuData, { type: 'message', message_id: targetMessageId });
      scheduleUiRefresh(['mvuSources'], 'daily_roll_calibrate_requested');
      rebuildTranscript('daily_roll_calibrate_requested');
      toastr?.info?.(`已请求校准/roll，目标最新楼层 #${targetMessageId}`, '每日Roll');
    } catch (error) {
      console.error('[stream-demo/daily_roll_calibrate] failed', error);
      toastr?.error?.('校准失败，请重试', '每日Roll');
    } finally {
      isCalibratingDailyRoll.value = false;
    }
  }

  function collectHostDocuments(): Document[] {
    return collectReachableHostDocuments();
  }

  /**
   * 将容器楼层之后的所有宿主楼层设为 is_hidden，
   * 让酒馆不渲染它们的 DOM（包括其中的 iframe 前端界面），
   * 同层 UI 通过 getChatMessages({ hide_state: 'all' }) 自行读取并渲染。
   */
  async function applyHidePolicy(reason: string) {
    if (!isOpeningWorkbenchHostActive() || !isActiveOpeningWorkbenchScope()) return;
    if (hidePolicyRunning) {
      hidePolicyRerun = true;
      return;
    }
    hidePolicyRunning = true;
    try {
      do {
        hidePolicyRerun = false;
        const patch = readMessagesAfterContainer()
          .filter(item => item.is_hidden !== true)
          .map(item => ({ message_id: item.message_id, is_hidden: true }));
        if (patch.length === 0) continue;
        await setChatMessages(patch, { refresh: 'none' });
      } while (hidePolicyRerun);
    } catch (error) {
      console.warn('[stream-demo] hide policy failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      hidePolicyRunning = false;
    }
    queuePersistHideState('apply_hide_policy');
  }

  function setEditingUserDraft(value: string) {
    editingUserDraft.value = String(value ?? '');
  }

  function cancelInlineEdit() {
    editingUserMessageId.value = null;
    editingUserDraft.value = '';
  }

  function startInlineEdit(item: TranscriptItem) {
    if (busy.value || item.role !== 'user' || item.message_id !== latestUserItem.value?.message_id) return;
    rollbackConfirmMessageId.value = null;
    editingUserMessageId.value = item.message_id;
    editingUserDraft.value = item.raw;
  }

  function cancelRollbackDelete() {
    rollbackConfirmMessageId.value = null;
  }

  function requestRollbackDelete(item: TranscriptItem) {
    if (busy.value || item.isOpening || item.canDeleteFrom !== true) return;
    cancelInlineEdit();
    rollbackConfirmMessageId.value = item.message_id;
  }

  function clearGenerationListeners() {
    generationStops.forEach(stop => stop?.stop?.());
    generationStops = [];
    generationListenerEpochController.invalidate();
  }

  async function emitOfficialGenerationLifecycle(messageId: number | null | undefined, type: 'normal' | 'regenerate') {
    const normalizedId = Number(messageId);
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;
    const traceId = resolveTraceId('lifecycle');
    lifecycleEchoSuppressUntilMs = Date.now() + 1200;
    lifecycleEchoSuppressedHostEvents = [
      String(tavern_events.MESSAGE_RECEIVED),
      String(tavern_events.GENERATION_ENDED),
      String(tavern_events.MESSAGE_UPDATED),
    ];

    recordLifecycleTrace(
      'emitOfficialGenerationLifecycle',
      'start',
      {
        messageId: Math.trunc(normalizedId),
        type,
      },
      traceId,
    );

    try {
      await eventEmit(tavern_events.MESSAGE_RECEIVED as any, Math.trunc(normalizedId), type);
      recordLifecycleTrace(
        'emitOfficialGenerationLifecycle',
        'message_received_emitted',
        {
          messageId: Math.trunc(normalizedId),
          type,
        },
        traceId,
      );
    } catch {
      // ignore
    }

    // 在 emit 生命周期事件前注入宿主 DOM 节点
    // autoLLMClick 的 findElement 在 GENERATION_ENDED 后立即查 DOM
    const hostRendered = await ensureHostMesTextRendered(Math.trunc(normalizedId));
    recordLifecycleTrace(
      'emitOfficialGenerationLifecycle',
      'host_mes_text_checked',
      {
        messageId: Math.trunc(normalizedId),
        hostRendered,
      },
      traceId,
    );
    try {
      await eventEmit(tavern_events.GENERATION_ENDED as any, Math.trunc(normalizedId));
      recordLifecycleTrace(
        'emitOfficialGenerationLifecycle',
        'generation_ended_emitted',
        {
          messageId: Math.trunc(normalizedId),
        },
        traceId,
      );
    } catch {
      // ignore
    }

    try {
      await eventEmit(tavern_events.MESSAGE_UPDATED as any, Math.trunc(normalizedId));
      recordLifecycleTrace(
        'emitOfficialGenerationLifecycle',
        'message_updated_emitted',
        {
          messageId: Math.trunc(normalizedId),
        },
        traceId,
      );
    } catch {
      // ignore
    }
  }

  function syncTranscriptFlags(items: TranscriptItem[]): TranscriptItem[] {
    return items.map(item => ({
      ...item,
      isLatest: assistantMessageId.value === item.message_id,
      isStreaming:
        assistantMessageId.value === item.message_id && (status.value === 'streaming' || item.phase === 'stream'),
    }));
  }

  function createLocalTranscriptItem(input: {
    id: number;
    role: TranscriptItem['role'];
    raw: string;
    hidden: boolean;
    isOpening?: boolean;
  }): TranscriptItem {
    return buildTranscriptItem({
      id: input.id,
      role: input.role,
      raw: input.raw,
      hidden: input.hidden,
      isOpening: input.isOpening,
      latestAssistantId: assistantMessageId.value,
      status: status.value,
    });
  }

  function upsertTranscriptItem(nextItem: TranscriptItem) {
    const current = transcript.value.filter(item => item.message_id !== nextItem.message_id);
    transcript.value = syncTranscriptFlags(clipTranscriptItemsForUi([...current, nextItem]));
    if (selectedItem.value) {
      selectedItem.value = transcript.value.find(item => item.message_id === selectedItem.value?.message_id) ?? null;
    }
  }

  function normalizeHostChatMessages(list: any[]): any[] {
    return list.map((message: any) => ({
      ...message,
      role: resolveHostMessageRole(message),
      message: String(message?.message ?? message?.mes ?? ''),
      is_hidden: message?.is_hidden === true,
    }));
  }

  function refreshTranscriptItemsByIds(messageIds: number[], reason = 'manual') {
    const normalizedMessageIds = [...new Set(messageIds.map(id => Math.trunc(Number(id))).filter(id => id > 0))];
    if (normalizedMessageIds.length === 0) return;

    const containerId = getActiveContainerMessageId();
    const allMessages = listAllChatMessages();
    const recentUiMessageIds = new Set(
      readRecentChatMessagesForUi()
        .map(message => Math.trunc(Number(message?.message_id)))
        .filter(id => Number.isFinite(id) && id > 0),
    );
    let refreshedCount = 0;

    for (const messageId of normalizedMessageIds) {
      if (containerId != null && messageId <= containerId) continue;

      const hostMessage = allMessages.find(message => Math.trunc(Number(message?.message_id)) === messageId);
      if (!hostMessage) continue;

      const existingItem = transcript.value.find(item => item.message_id === messageId);
      if (!existingItem && !recentUiMessageIds.has(messageId)) continue;
      const isOpeningResult = isCurrentOpeningAssistantMessageByPayload(hostMessage, openingPayload.value);
      const rawRole = resolveHostMessageRole(hostMessage);
      const role = resolveTranscriptRole({
        rawRole,
        rawMessage: String(hostMessage?.message ?? ''),
        isOpeningResult,
      });

      upsertTranscriptItem(
        buildTranscriptItem({
          id: messageId,
          role,
          raw: String(hostMessage?.message ?? ''),
          hidden: hostMessage?.is_hidden === true,
          isOpening: existingItem?.isOpening ?? isOpeningResult,
          canReroll: existingItem?.canReroll ?? false,
          latestAssistantId: null,
          status: status.value,
        }),
      );
      refreshedCount += 1;
    }

    snapshotHostImageDataSignatures(normalizedMessageIds);

    recordLifecycleTrace('refreshTranscriptItemsByIds', 'done', {
      reason,
      messageIds: normalizedMessageIds,
      refreshedCount,
    });
  }

  /**
   * 获取 chat 数组的真实最后一个索引，不受 is_hidden 影响。
   */
  function getTrueChatLength(): number {
    try {
      const ctx = readHostContext();
      const chat = ctx?.chat;
      if (Array.isArray(chat) && chat.length > 0) return chat.length - 1;
    } catch {
      /* ignore */
    }
    return getLastMessageId?.() ?? 0;
  }

  function readRecentChatMessagesForUi() {
    const range = transcriptWindowRange.value;
    if (!range) return [];
    const { startId, endId } = range;

    try {
      const list = callHostGetChatMessages(`${startId}-${endId}`, { hide_state: 'all' });
      if (Array.isArray(list)) {
        return normalizeHostChatMessages(list);
      }
    } catch (e) {
      console.warn('[Debug] readRecentChatMessagesForUi getChatMessages error', {
        error: String(e),
        startId,
        lastId: endId,
      });
    }

    return readAllChatMessagesRaw()
      .filter(item => Number.isFinite(item?.message_id) && item.message_id >= startId && item.message_id <= endId)
      .slice(-TRANSCRIPT_UI_WINDOW_SIZE);
  }

  /**
   * 直接从宿主 context.chat 数组读取所有消息，绕过 getChatMessages 的 hide_state 过滤问题。
   * 返回的对象同时包含宿主原始字段和酒馆助手 API 格式字段，确保下游代码兼容。
   */
  function readAllChatMessagesRaw(): any[] {
    try {
      // 优先使用 getChatMessages API，因为它能正确返回 is_hidden 字段
      // ctx.chat 中的消息对象可能缺少 is_hidden 字段
      try {
        const lastId = getTrueChatLength();
        const list = callHostGetChatMessages(`0-${lastId}`, { hide_state: 'all' });
        if (Array.isArray(list) && list.length > 0) {
          return normalizeHostChatMessages(list);
        }
      } catch (e) {
        console.warn('[Debug] readAllChatMessagesRaw getChatMessages error', { error: String(e) });
      }

      // 回退：从 ctx.chat 读取（但 is_hidden 字段可能不准确）
      const ctx = readHostContext();
      const chat = ctx?.chat;
      const chatLen =
        chat != null && typeof chat === 'object' && typeof (chat as any).length === 'number'
          ? (chat as any).length
          : -1;
      const hasIndexedAccess = chat != null && typeof chat === 'object';

      if (hasIndexedAccess && chatLen > 0) {
        const messages = Array.from({ length: chatLen }, function (_: any, index: number) {
          const message = (chat as any)[index];
          if (!message || typeof message !== 'object') return null;
          return {
            ...message,
            message_id: message?.message_id ?? index,
            role: resolveHostMessageRole(message),
            message: String(message?.mes ?? message?.message ?? ''),
            is_hidden: message?.is_hidden === true,
          };
        }).filter(Boolean);
        if (messages.length > 0) return messages;
      }

      return [];
    } catch (e) {
      console.warn('[Debug] readAllChatMessagesRaw error', { error: String(e) });
      return [];
    }
  }

  function readMessagesAfterContainer(): BaseChatMessage[] {
    const containerId = getActiveContainerMessageId();
    // 直接从宿主 chat 数组读取，绕过 getChatMessages 对 is_hidden 的潜在过滤
    const all = readAllChatMessagesRaw();
    return all.filter(
      item => Number.isFinite(item.message_id) && (containerId == null || item.message_id > containerId),
    );
  }

  function queueHidePolicy(reason: string) {
    if (hidePolicyTimer) window.clearTimeout(hidePolicyTimer);
    hidePolicyTimer = window.setTimeout(() => {
      hidePolicyTimer = 0;
      void applyHidePolicy(reason);
    }, 0);
  }

  function persistHideStateNow(reason: string) {
    if (!isOpeningWorkbenchHostActive() || !isActiveOpeningWorkbenchScope()) return;
    const containerId = getActiveContainerMessageId();
    if (containerId == null) return;

    const hiddenIds = readMessagesAfterContainer()
      .filter(item => item.is_hidden === true)
      .map(item => item.message_id);

    const record = buildHideStateRecord(containerId, hiddenIds);
    writeHideState(record);
    console.log('[stream-demo] hide state persisted', { reason, containerId, hiddenCount: hiddenIds.length });
  }

  function queuePersistHideState(reason: string) {
    if (hideStatePersistTimer) window.clearTimeout(hideStatePersistTimer);
    hideStatePersistTimer = window.setTimeout(() => {
      hideStatePersistTimer = 0;
      persistHideStateNow(reason);
    }, 80);
  }

  async function restoreHideState(): Promise<void> {
    if (!isOpeningWorkbenchHostActive() || !isActiveOpeningWorkbenchScope()) return;

    const savedState = readHideState();
    if (!savedState || savedState.hiddenMessageIds.length === 0) return;

    const containerId = getActiveContainerMessageId();
    if (containerId == null || savedState.containerMessageId !== containerId) {
      console.log('[stream-demo] hide state restore skipped', {
        savedContainer: savedState.containerMessageId,
        currentContainer: containerId,
      });
      return;
    }

    const allMessages = readMessagesAfterContainer();
    const validHiddenIds = savedState.hiddenMessageIds.filter(savedId =>
      allMessages.some(msg => msg.message_id === savedId),
    );

    if (validHiddenIds.length === 0) return;

    try {
      await setChatMessages(
        validHiddenIds.map(id => ({ message_id: id, is_hidden: true })),
        { refresh: 'none' },
      );
      console.log('[stream-demo] hide state restored', {
        containerId,
        restoredCount: validHiddenIds.length,
        totalCount: allMessages.length,
      });
    } catch (error) {
      console.warn('[stream-demo] hide state restore failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function queueExternalSync(reason: string) {
    if (externalSyncTimer) window.clearTimeout(externalSyncTimer);
    const scopedReason = `external:${reason}`;
    recordLifecycleTrace('queueExternalSync', 'queued', {
      reason: scopedReason,
    });
    externalSyncTimer = window.setTimeout(() => {
      externalSyncTimer = 0;
      recordLifecycleTrace('queueExternalSync', 'flush', {
        reason: scopedReason,
      });
      rebuildTranscript(scopedReason);
      queueHidePolicy(scopedReason);
    }, 80);
  }

  /**
   * 临时将容器之后的楼层设为 is_hidden: false，执行 action，再恢复 is_hidden: true。
   * 用于图片桥接等需要宿主 DOM 可见的场景。
   */
  async function withHostTranscriptVisible<T>(action: () => Promise<T> | T): Promise<T> {
    if (hidePolicyTimer) {
      window.clearTimeout(hidePolicyTimer);
      hidePolicyTimer = 0;
    }
    // 临时取消隐藏
    const messagesToReveal = readMessagesAfterContainer()
      .filter(item => item.is_hidden === true)
      .map(item => item.message_id);
    if (messagesToReveal.length > 0) {
      await setChatMessages(
        messagesToReveal.map(id => ({ message_id: id, is_hidden: false })),
        { refresh: 'none' },
      );
    }
    try {
      return await action();
    } finally {
      // 恢复隐藏
      queueHidePolicy('bridge_resume');
    }
  }

  function queueGeneratedImageEntityRefresh(messageIds: number[] = []) {
    if (generatedImageDomMutationTimer) window.clearTimeout(generatedImageDomMutationTimer);
    const normalizedMessageIds = [...new Set(messageIds.map(id => Math.trunc(Number(id))).filter(id => id >= 0))];
    generatedImageDomMutationTimer = window.setTimeout(() => {
      generatedImageDomMutationTimer = 0;
      if (normalizedMessageIds.length === 0) {
        bumpGeneratedImageEntityRevision();
        return;
      }
      normalizedMessageIds.forEach(messageId => {
        bumpGeneratedImageEntityRevision(messageId);
      });
    }, 40);
  }

  function scheduleUiRefresh(domains: RefreshDomain[], reason: string, targetedMessageIds: number[] = []) {
    recordLifecycleTrace('scheduleUiRefresh', 'received', {
      reason,
      domains,
      targetedMessageIds,
    });
    if (domains.includes('mvuSources')) {
      mvuSourceRevision.value += 1;
    }
    if (domains.includes('gallery')) {
      galleryRevision.value += 1;
    }

    if (domains.includes('transcriptItems')) {
      if (targetedMessageIds.length > 0) {
        refreshTranscriptItemsByIds(targetedMessageIds, reason);
      } else {
        queueExternalSync(reason);
      }
    }

    if (domains.includes('transcript')) {
      if (shouldForceTranscriptDomRefresh(reason)) {
        transcriptDomRevision.value += 1;
      }
      queueExternalSync(reason);
    }
  }

  function mapHostRefreshType(name: string): string {
    switch (name) {
      case tavern_events.GENERATION_STARTED:
        return 'host.generation_started';
      case tavern_events.GENERATION_ENDED:
        return 'host.generation_ended';
      case tavern_events.MESSAGE_SENT:
        return 'host.message_sent';
      case tavern_events.MESSAGE_EDITED:
        return 'host.message_edited';
      case tavern_events.MESSAGE_RECEIVED:
        return 'host.message_received';
      case tavern_events.MESSAGE_UPDATED:
        return 'host.message_updated';
      case tavern_events.MESSAGE_SWIPED:
        return 'host.message_swiped';
      case tavern_events.MESSAGE_DELETED:
        return 'host.message_deleted';
      case tavern_events.MORE_MESSAGES_LOADED:
        return 'host.more_messages_loaded';
      case tavern_events.STREAM_TOKEN_RECEIVED:
        return 'host.stream_token_received';
      case tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED:
        return 'host.smooth_stream_token_received';
      case tavern_events.CHAT_CHANGED:
        return 'host.chat_changed';
      default:
        return `host.${String(name ?? '').toLowerCase()}`;
    }
  }

  function resolveHostRefreshMessageId(name: string, payload: unknown[] = []): number | null {
    switch (name) {
      case String(tavern_events.MESSAGE_SENT):
      case String(tavern_events.MESSAGE_EDITED):
      case String(tavern_events.MESSAGE_RECEIVED):
      case String(tavern_events.MESSAGE_UPDATED):
      case String(tavern_events.MESSAGE_SWIPED):
      case String(tavern_events.MESSAGE_DELETED): {
        const messageId = Math.trunc(Number(payload[0]));
        return Number.isFinite(messageId) && messageId >= 0 ? messageId : null;
      }
      default:
        return null;
    }
  }

  async function ensureHostMesTextRendered(messageId: number): Promise<boolean> {
    return ensureHostMesTextRenderedWithRefresh(
      messageId,
      {
        currentDocument: document,
        collectHostDocuments,
        readChatMessageDetail: (id: number) => {
          // 使用统一的 readChatMessageDetail 函数
          return readChatMessageDetail(id);
        },
        setChatMessages,
      },
      {
        attempts: 6,
        delayMs: 50,
      },
    );
  }

  function beginPendingImageTask(messageId: number) {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;
    imagePendingTaskManager.startTask(normalizedId);
    imageRecentIntentStore.mark(normalizedId, 'transcript');
    logImageBridge('start-task', {
      messageId: normalizedId,
      tasks: imagePendingTaskManager.getDebugState(),
    });
  }

  function markRecentImageIntent(messageId: number, source: 'transcript' = 'transcript') {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;
    imageRecentIntentStore.mark(normalizedId, source);
    logImageBridge('mark-intent', {
      messageId: normalizedId,
      source,
      intent: imageRecentIntentStore.read(),
    });
  }

  async function triggerImageGenerationForMessage(messageId: number): Promise<void> {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;

    // Step 1: 确保宿主 DOM 有该楼层的 mes_text 节点（供插件读正文）
    const rendered = await ensureHostMesTextRendered(normalizedId);
    if (!rendered) {
      console.warn('[image] mes_text 注入失败，mesid:', normalizedId);
    }

    // Step 2: 注册持久化任务（imagePendingTaskManager 用）
    beginPendingImageTask(normalizedId);
    markRecentImageIntent(normalizedId, 'transcript');

    // Step 3: 向宿主 mes_text 派发合成 dblclick，让插件走完整 ClickTrigger 链路
    const mesText =
      collectHostDocuments()
        .map(doc => doc.querySelector(`.mes[mesid="${normalizedId}"] .mes_text`) as HTMLElement | null)
        .find(Boolean) ?? null;
    if (!mesText) {
      console.warn('[image] 注入节点未找到，mesid:', normalizedId);
      return;
    }

    if (!dispatchHostPrimaryTrigger(mesText)) {
      console.warn('[image] 宿主触发手势派发失败，mesid:', normalizedId);
    }
  }

  function listAssistantMessagesForPromptPersistence(): BaseChatMessage[] {
    const all = listAllChatMessages();
    const transcriptAssistantIds = transcript.value
      .filter(item => item.role === 'assistant')
      .map(item => Math.trunc(Number(item.message_id)))
      .filter(id => Number.isFinite(id) && id >= 0);

    const containerId = readCurrentContainerMessageId();
    const candidateIds = new Set<number>(transcriptAssistantIds);
    if (containerId != null && Number.isFinite(containerId) && containerId >= 0) {
      candidateIds.add(Math.trunc(containerId));
    }

    return all
      .map(message => ({
        message_id: Math.trunc(Number(message?.message_id)),
        role: ((message?.role as string) || 'assistant') as BaseChatMessage['role'],
        message: String(message?.message ?? ''),
        is_hidden: message?.is_hidden === true,
      }))
      .filter(item => Number.isFinite(item.message_id))
      .filter(item => item.role === 'assistant')
      .filter(item => candidateIds.has(item.message_id));
  }

  function listAllChatMessages() {
    const raw = readAllChatMessagesRaw();
    if (raw.length > 0) return raw;
    // 备用路径：通过宿主窗口调用 getChatMessages
    try {
      const lastId = getTrueChatLength();
      const list = callHostGetChatMessages(`0-${lastId}`, { hide_state: 'all' });
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function readMessageId(message: any): number | null {
    const id = Math.trunc(Number(message?.message_id));
    return Number.isFinite(id) ? id : null;
  }

  function canRerollOpeningFromMessages(messages: any[]) {
    const resultId = Math.trunc(Number(openingPayload.value.opening_assistant_message_id));
    if (!Number.isFinite(resultId) || resultId <= 0) return false;
    if (!messages.some(message => readMessageId(message) === resultId)) return false;
    return !messages.some(message => {
      const id = readMessageId(message);
      if (id == null || !Number.isFinite(id) || id <= resultId) return false;
      if (
        isCurrentOpeningSeedMessageByPayload(message, openingPayload.value) ||
        isCurrentOpeningAssistantMessageByPayload(message, openingPayload.value)
      )
        return false;
      return true;
    });
  }

  function handleHostRefreshEvent(name: string, payload: unknown[] = []) {
    const shouldSuppressLifecycleEcho = shouldSuppressLifecycleEchoHostRefresh({
      eventName: name,
      nowMs: Date.now(),
      suppressUntilMs: lifecycleEchoSuppressUntilMs,
      suppressedEventNames: lifecycleEchoSuppressedHostEvents,
    });
    const shouldIgnore = shouldIgnoreHostRefreshDuringBusy({
      busy: busy.value && nativeSendProxyActive !== true,
      eventName: name,
      generationStartedEventName: String(tavern_events.GENERATION_STARTED),
      generationEndedEventName: String(tavern_events.GENERATION_ENDED),
      streamTokenEventName: String(tavern_events.STREAM_TOKEN_RECEIVED),
      smoothStreamTokenEventName: String(tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED),
    });
    recordLifecycleTrace('handleHostRefreshEvent', 'received', {
      name,
      lifecycleEchoSuppressed: shouldSuppressLifecycleEcho,
      ignored: shouldIgnore,
    });

    if (shouldSuppressLifecycleEcho) {
      recordLifecycleTrace('handleHostRefreshEvent', 'ignored_lifecycle_echo', {
        name,
      });
      return;
    }

    if (shouldIgnore) {
      status.value = 'streaming';
      queuePersistReaderChatState();
      recordLifecycleTrace('handleHostRefreshEvent', 'ignored_busy_token', {
        name,
      });
      return; // 流式进行中，宿主 token 事件不触发 transcript 重建（由 bindGenerationEvents 的 iframe_events 链路独立维护）
    }

    const refreshType = mapHostRefreshType(name);
    const messageId = resolveHostRefreshMessageId(name, payload);
    const domains = resolveRefreshDomainsForEvent({
      type: refreshType,
      messageId: resolveHostRefreshMessageId(name, payload),
    });
    recordLifecycleTrace('handleHostRefreshEvent', 'scheduled', {
      name,
      refreshType,
      messageId,
      domains,
    });
    console.log('[Debug] handleHostRefreshEvent', {
      name,
      refreshType,
      messageId,
      domains,
      isOpeningWorkbenchHost: isOpeningWorkbenchHostActive(),
    });
    scheduleUiRefresh(domains, `event:${name}`, messageId != null ? [messageId] : []);
  }

  async function bindMvuRefreshEvents() {
    if (!isOpeningWorkbenchHostActive()) return;
    if (typeof eventOn !== 'function') return;
    try {
      await waitGlobalInitialized('Mvu');
    } catch {
      return;
    }

    const bind = (eventName: string, type: string) => {
      try {
        return eventOn(eventName as any, () => {
          scheduleUiRefresh(resolveRefreshDomainsForEvent({ type }), type);
        });
      } catch {
        return null;
      }
    };

    mvuStops = [
      bind(Mvu.events.VARIABLE_INITIALIZED, 'mvu.variable_initialized'),
      bind(Mvu.events.VARIABLE_UPDATE_STARTED, 'mvu.variable_update_started'),
      bind(Mvu.events.VARIABLE_UPDATE_ENDED, 'mvu.variable_update_ended'),
    ].filter(Boolean) as StopHandle[];
  }

  function rebuildTranscript(reason = 'manual') {
    const containerId = readCurrentContainerMessageId();
    const traceId = resolveTraceId('rebuild');
    const sequence = ++rebuildSequence;
    recordLifecycleTrace(
      'rebuildTranscript',
      'start',
      {
        reason,
        sequence,
        previousTranscriptCount: transcript.value.length,
        previousAssistantSummary: summarizeTranscriptForDebug(transcript.value),
      },
      traceId,
    );
    let all: any[] = [];
    try {
      const lastId = getTrueChatLength();
      const list = readRecentChatMessagesForUi();
      all = Array.isArray(list) ? list : [];
      console.log('[Debug] rebuildTranscript data', {
        reason,
        rawMessagesLength: 0,
        listSource: 'recent_window',
        lastId,
        allLength: all.length,
        allSample: all.map((m: any) => ({
          id: m.message_id,
          is_hidden: m.is_hidden,
          role: m.role,
          mes: String(m.message || m.mes || '').slice(0, 40),
        })),
      });

      const normalized: TranscriptItem[] = [];
      let nextLatestAssistantId: number | null = null;

      for (const message of all) {
        const message_id = Number(message?.message_id);
        if (!Number.isFinite(message_id)) continue;
        const id = Math.trunc(message_id);
        if (containerId != null && id <= containerId) continue;
        if (isCurrentOpeningSeedMessageByPayload(message, openingPayload.value)) continue;
        const isOpeningResult = isCurrentOpeningAssistantMessageByPayload(message, openingPayload.value);
        const rawRole = resolveHostMessageRole(message);
        const role = resolveTranscriptRole({
          rawRole,
          rawMessage: String(message?.message ?? ''),
          isOpeningResult,
        });
        if (role === 'assistant') nextLatestAssistantId = id;

        normalized.push(
          buildTranscriptItem({
            id,
            role,
            raw: String(message?.message ?? ''),
            hidden: message?.is_hidden === true,
            isOpening: isOpeningResult,
            canReroll: isOpeningResult && canRerollOpeningFromMessages(all),
            latestAssistantId: null,
            status: status.value,
          }),
        );
      }

      assistantMessageId.value = nextLatestAssistantId;
      transcript.value = syncTranscriptFlags(clipTranscriptItemsForUi(normalized));
      snapshotHostImageDataSignatures(transcript.value.map(item => item.message_id));
      console.log('[Debug] rebuildTranscript result', {
        reason,
        containerId,
        normalizedLength: normalized.length,
        transcriptLength: transcript.value.length,
        transcriptSample: transcript.value.map((t: any) => ({
          id: t.message_id,
          role: t.role,
          hidden: t.hidden,
          isOpening: t.isOpening,
          preview: stripTagsForPreview(String(t.content ?? t.raw ?? '')).slice(0, 60),
        })),
        openingPayload: {
          state: openingPayload.value.state,
          opening_assistant_message_id: openingPayload.value.opening_assistant_message_id,
          hasCompiledPromptSnapshot: Boolean(openingPayload.value.compiled_prompt_snapshot),
        },
      });
      recordLifecycleTrace(
        'rebuildTranscript',
        'done',
        {
          reason,
          sequence,
          chatCount: all.length,
          nextLatestAssistantId,
          transcriptCount: transcript.value.length,
          assistantSummary: summarizeTranscriptForDebug(transcript.value),
        },
        traceId,
      );
      if (selectedItem.value) {
        selectedItem.value = transcript.value.find(item => item.message_id === selectedItem.value?.message_id) ?? null;
      }
    } catch (err) {
      transcript.value = [];
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : '';
      console.error('[Debug] rebuildTranscript ERROR', {
        reason,
        sequence,
        error: errorMessage,
        stack: errorStack,
        containerId,
        rawMessagesLength: 0,
        allLength: all?.length,
        chatSample: Array.isArray(all)
          ? all.slice(0, 3).map((m: any) => ({
              id: m.message_id,
              role: m.role,
              mes: String(m?.message || m?.mes || '').slice(0, 40),
            }))
          : null,
      });
      recordLifecycleTrace(
        'rebuildTranscript',
        'error',
        {
          reason,
          sequence,
          error: errorMessage,
        },
        traceId,
      );
    }
    queueHidePolicy('rebuild');
    queuePersistReaderChatState();
  }

  async function patchAssistantMessage(phase: 'stream' | 'done') {
    const messageId = assistantMessageId.value;
    const traceId = resolveTraceId('patch');
    if (messageId == null) {
      recordLifecycleTrace(
        'patchAssistantMessage',
        'skip_missing_message_id',
        {
          phase,
        },
        traceId,
      );
      return;
    }

    const nextMessage = buildStreamDemoMessage(
      phase === 'done' ? finalText.value || streamText.value : streamText.value,
      phase,
    );
    const nextSignature = buildDebugMessageSignature(nextMessage);
    const previousSignature = buildDebugMessageSignature(latestPatchedMessage);
    const sequence = ++patchSequence;
    recordLifecycleTrace(
      'patchAssistantMessage',
      'requested',
      {
        phase,
        sequence,
        messageId,
        nextSignature,
        previousSignature,
      },
      traceId,
    );
    if (nextMessage === latestPatchedMessage) {
      recordLifecycleTrace(
        'patchAssistantMessage',
        'skip_same_content',
        {
          phase,
          sequence,
          messageId,
          nextSignature,
        },
        traceId,
      );
      return;
    }
    latestPatchedMessage = nextMessage;

    patchQueue = patchQueue.then(async () => {
      try {
        recordLifecycleTrace(
          'patchAssistantMessage',
          'commit_start',
          {
            phase,
            sequence,
            messageId,
            nextSignature,
          },
          traceId,
        );
        await setChatMessages([{ message_id: messageId, message: nextMessage, is_hidden: false }], {
          refresh: resolveAssistantMessageRefreshMode(phase),
        });
        upsertTranscriptItem(
          createLocalTranscriptItem({
            id: messageId,
            role: 'assistant',
            raw: nextMessage,
            hidden: false,
          }),
        );
        recordLifecycleTrace(
          'patchAssistantMessage',
          'commit_done',
          {
            phase,
            sequence,
            messageId,
            nextSignature,
            transcriptAssistantSummary: summarizeTranscriptForDebug(transcript.value),
          },
          traceId,
        );
      } catch (error) {
        console.warn('[stream-demo] patchAssistantMessage commit failed', {
          phase,
          sequence,
          messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    await patchQueue;
    if (
      shouldPrewarmHostMesTextAfterPatch({
        phase,
        assistantMessageId: messageId,
        hostMesTextPrimed: hostMesTextPrimedForCurrentGeneration,
      })
    ) {
      const hostRendered = await ensureHostMesTextRendered(messageId);
      if (phase === 'stream' && hostRendered) {
        hostMesTextPrimedForCurrentGeneration = true;
      }
      recordLifecycleTrace(
        'patchAssistantMessage',
        'host_mes_text_prewarmed',
        {
          phase,
          sequence,
          messageId,
          hostRendered,
        },
        traceId,
      );
    }
    recordLifecycleTrace(
      'patchAssistantMessage',
      'queue_settled',
      {
        phase,
        sequence,
        messageId,
        nextSignature,
      },
      traceId,
    );
  }

  async function ensureAssistantPlaceholderReady(reason: 'first_token' | 'finalize_fallback') {
    if (assistantMessageId.value != null || assistantPlaceholderCreating) {
      recordLifecycleTrace('createAssistantPlaceholder', 'ensure_skipped', {
        reason,
        assistantMessageId: assistantMessageId.value,
        placeholderCreating: assistantPlaceholderCreating,
      });
      return;
    }

    assistantPlaceholderCreating = true;
    try {
      recordLifecycleTrace('createAssistantPlaceholder', 'ensure_start', {
        reason,
      });
      await createAssistantPlaceholder();
      readingMode.value = 'following_latest';
      if (assistantMessageId.value != null) {
        const hostRendered = await ensureHostMesTextRendered(assistantMessageId.value);
        if (hostRendered) {
          hostMesTextPrimedForCurrentGeneration = true;
        }
        recordLifecycleTrace('createAssistantPlaceholder', 'host_mes_text_prewarmed', {
          reason,
          assistantMessageId: assistantMessageId.value,
          hostRendered,
        });
      }
      recordLifecycleTrace('createAssistantPlaceholder', 'ensure_done', {
        reason,
        assistantMessageId: assistantMessageId.value,
      });
    } finally {
      assistantPlaceholderCreating = false;
    }
  }

  async function deleteFromMessageId(messageId: number) {
    const target = Math.trunc(Number(messageId));
    if (!Number.isFinite(target)) return;
    const all = readMessagesAfterContainer();
    const ids = all
      .map(item => item.message_id)
      .filter(id => id >= target)
      .sort((a, b) => a - b);
    if (ids.length === 0) return;
    await deleteChatMessages(ids, { refresh: 'all' });
    if (assistantMessageId.value != null && ids.includes(assistantMessageId.value)) {
      assistantMessageId.value = null;
    }
    latestPatchedMessage = '';
    cancelInlineEdit();
    cancelRollbackDelete();
    rebuildTranscript();
    appendLog('action', '回退删除', `已删除楼层 #${ids[0]} 到 #${ids[ids.length - 1]}`);
  }

  async function runGenerationFlow(options: GenerationFlowOptions): Promise<GenerationFlowResult> {
    const prompt = String(options.prompt ?? '').trim();
    const traceId = createTraceId(
      options.createUser ? 'send' : options.detachedUserInput === true ? 'opening' : 'regenerate',
    );
    if (!prompt || busy.value) {
      recordLifecycleTrace(
        'runGenerationFlow',
        'skip',
        {
          reason: !prompt ? 'empty_prompt' : 'busy',
          createUser: options.createUser,
          promptSignature: buildDebugMessageSignature(prompt),
        },
        traceId,
      );
      return {
        success: false,
        assistantMessageId: assistantMessageId.value,
        errorText: !prompt ? 'empty_prompt' : 'busy',
        hadVisibleAssistantContent: false,
      };
    }

    resetTranscriptWindowToLatestState();
    readingMode.value = 'following_latest';
    queuePersistReaderChatState();

    activeGenerationTraceId = traceId;
    latestLifecycleTraceId = traceId;
    busy.value = true;
    status.value = 'preparing';
    streamText.value = '';
    finalText.value = '';
    errorText.value = '';
    assistantMessageId.value = null;
    latestPatchedMessage = '';
    hostMesTextPrimedForCurrentGeneration = false;
    bindGenerationEvents();
    recordLifecycleTrace(
      'runGenerationFlow',
      'start',
      {
        createUser: options.createUser,
        promptPreview: stripTagsForPreview(prompt).slice(0, 80),
        promptSignature: buildDebugMessageSignature(prompt),
      },
      traceId,
    );

    try {
      if (options.createUser) {
        // 通过宿主窗口获取倒数第二条消息（通常是最后一个 assistant）
        const lastMessages = callHostGetChatMessages(-2, { hide_state: 'all' });
        const lastAssistantMessage = Array.isArray(lastMessages) ? lastMessages[0] : null;
        const userData = sanitizeInheritedMessageData(lastAssistantMessage?.data);
        await createChatMessages([{ role: 'user', message: prompt, is_hidden: false, data: userData }], {
          refresh: 'none',
        });
        const userId = Number(getLastMessageId?.());
        recordLifecycleTrace(
          'runGenerationFlow',
          'user_created',
          {
            userId: Number.isFinite(userId) ? Math.trunc(userId) : null,
            promptSignature: buildDebugMessageSignature(prompt),
          },
          traceId,
        );
        if (Number.isFinite(userId)) {
          upsertTranscriptItem(
            createLocalTranscriptItem({
              id: Math.trunc(userId),
              role: 'user',
              raw: prompt,
              hidden: false,
            }),
          );
        }
        appendLog('action', '发送用户输入', stripTagsForPreview(prompt).slice(0, 80) || '(空输入)');
      }

      // 在 generate() 前主动创建 assistant 占位符，防止 ST 流式回调覆盖已有 assistant 消息
      await ensureAssistantPlaceholderReady('first_token');
      await options.onAssistantPlaceholderCreated?.(assistantMessageId.value);

      const hiddenIds =
        options.detachedUserInput === true
          ? []
          : readMessagesAfterContainer()
              .filter(item => item.is_hidden === true)
              .map(item => item.message_id);
      if (hiddenIds.length > 0) {
        await setChatMessages(
          hiddenIds.map(id => ({ message_id: id, is_hidden: false })),
          { refresh: 'none' },
        );
      }

      const generatePromise = generate(
        options.detachedUserInput === true
          ? {
              user_input: prompt,
              should_stream: true,
              max_chat_history: options.maxChatHistory ?? 0,
            }
          : {
              should_stream: true,
              max_chat_history: options.maxChatHistory ?? 'all',
            },
      );
      recordLifecycleTrace(
        'runGenerationFlow',
        'generate_requested',
        {
          createUser: options.createUser,
          detachedUserInput: options.detachedUserInput === true,
          maxChatHistory:
            options.detachedUserInput === true ? (options.maxChatHistory ?? 0) : (options.maxChatHistory ?? 'all'),
        },
        traceId,
      );

      const result = String(await generatePromise).trim();

      // 生成完成后重新隐藏
      if (hiddenIds.length > 0) {
        await setChatMessages(
          hiddenIds.map(id => ({ message_id: id, is_hidden: true })),
          { refresh: 'none' },
        );
      }

      finalText.value = result;
      status.value = 'persisting';
      if (
        shouldEnsureAssistantPlaceholderBeforeFinalize({
          assistantMessageId: assistantMessageId.value,
          placeholderCreating: assistantPlaceholderCreating,
          finalText: result,
        })
      ) {
        await ensureAssistantPlaceholderReady('finalize_fallback');
      }
      recordLifecycleTrace(
        'runGenerationFlow',
        'generate_resolved',
        {
          resultSignature: buildDebugMessageSignature(result),
        },
        traceId,
      );
      await patchAssistantMessage('done');
      if (assistantMessageId.value != null) {
        const reprocessResult = await reprocessMessageVariablesById(assistantMessageId.value, {
          force: true,
          refreshMessage: true,
        });
        if (reprocessResult.status === 'error') {
          console.warn('[stream-demo] direct MVU reprocess failed', reprocessResult);
        }
        recordLifecycleTrace(
          'runGenerationFlow',
          'mvu_reprocess_completed',
          {
            assistantMessageId: assistantMessageId.value,
            reprocessStatus: reprocessResult.status,
          },
          traceId,
        );
      }
      await emitOfficialGenerationLifecycle(
        assistantMessageId.value,
        options.emitLifecycleKind ?? (options.createUser ? 'normal' : 'regenerate'),
      );
      status.value = 'done';
      transcript.value = syncTranscriptFlags(transcript.value);
      queueHidePolicy('generation_done');
      recordLifecycleTrace(
        'runGenerationFlow',
        'done',
        {
          assistantMessageId: assistantMessageId.value,
          finalSignature: buildDebugMessageSignature(result),
          transcriptAssistantSummary: summarizeTranscriptForDebug(transcript.value),
        },
        traceId,
      );
      appendLog('action', '生成完成', stripTagsForPreview(result).slice(0, 80) || '(空回复)');
      return {
        success: true,
        assistantMessageId: assistantMessageId.value,
        result,
      };
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      const hadVisibleAssistantContent =
        Boolean(String(streamText.value ?? '').trim()) || hasRenderableAssistantMessageText(latestPatchedMessage);
      recordLifecycleTrace(
        'runGenerationFlow',
        'error',
        {
          assistantMessageId: assistantMessageId.value,
          message: errorText.value,
          hadVisibleAssistantContent,
        },
        traceId,
      );
      if (assistantMessageId.value != null) {
        finalText.value = `生成失败：${errorText.value}`;
        try {
          await patchAssistantMessage('done');
        } catch {
          // ignore
        }
      }
      transcript.value = syncTranscriptFlags(transcript.value);
      toastr?.error?.(`流式 demo 失败：${errorText.value}`);
      appendLog('error', '生成失败', errorText.value || '未知错误');
      return {
        success: false,
        assistantMessageId: assistantMessageId.value,
        errorText: errorText.value,
        hadVisibleAssistantContent,
      };
    } finally {
      clearGenerationListeners();
      busy.value = false;
      hostMesTextPrimedForCurrentGeneration = false;
      recordLifecycleTrace(
        'runGenerationFlow',
        'finally',
        {
          assistantMessageId: assistantMessageId.value,
          finalStatus: status.value,
        },
        traceId,
      );
      activeGenerationTraceId = '';
    }
  }

  async function triggerNativeRegenerate(anchorMessageId: number, promptOverride?: string) {
    const latestUser = latestUserItem.value;
    if (busy.value) return;
    if (!latestUser || latestUser.role !== 'user' || latestUser.message_id !== anchorMessageId) {
      toastr?.warning?.('未定位到最后一条 user，无法重生');
      return;
    }
    const nextPrompt = String(promptOverride ?? latestUser.raw ?? '').trim();
    if (!nextPrompt) {
      toastr?.warning?.('当前没有可用于重生的输入');
      return;
    }

    readingMode.value = 'following_latest';
    queuePersistReaderChatState();
    if (nextPrompt !== String(latestUser.raw ?? '').trim()) {
      await setChatMessages([{ message_id: anchorMessageId, message: nextPrompt, is_hidden: latestUser.hidden }], {
        refresh: 'none',
      });
    }
    const trailingAssistantIds = readMessagesAfterContainer()
      .filter(item => item.message_id > anchorMessageId && item.role === 'assistant')
      .map(item => item.message_id)
      .sort((a, b) => a - b);
    let shouldRefreshTranscript = nextPrompt !== String(latestUser.raw ?? '').trim();
    if (trailingAssistantIds.length > 0) {
      await deleteChatMessages(trailingAssistantIds, { refresh: 'none' });
      if (assistantMessageId.value != null && trailingAssistantIds.includes(assistantMessageId.value)) {
        assistantMessageId.value = null;
      }
      latestPatchedMessage = '';
      shouldRefreshTranscript = true;
    }
    if (shouldRefreshTranscript) {
      rebuildTranscript();
    }
    appendLog('action', '重新生成', `已删除旧 assistant 楼层并基于 #${anchorMessageId} 重新回复一条 assistant`);
    await runGenerationFlow({ prompt: nextPrompt, createUser: false });
  }

  async function rollLatestTurn() {
    const latestUser = latestUserItem.value;
    if (!latestUser || latestUser.role !== 'user') {
      toastr?.info?.('当前还没有可重新生成的 user 楼层');
      return;
    }
    const nextPrompt = String(input.value ?? '').trim();
    await triggerNativeRegenerate(latestUser.message_id, nextPrompt || undefined);
    if (status.value === 'done' && nextPrompt) {
      input.value = '';
    }
  }

  async function confirmInlineEditRegenerate(item: TranscriptItem) {
    const latestUser = latestUserItem.value;
    const targetId = Math.trunc(Number(item.message_id));
    const nextText = String(editingUserDraft.value ?? '').trim();
    if (!latestUser || latestUser.role !== 'user' || latestUser.message_id !== targetId) {
      toastr?.warning?.('只能修改最后一条 user 输入');
      cancelInlineEdit();
      return;
    }
    if (!nextText) {
      toastr?.warning?.('请输入修改后的提示词');
      return;
    }
    if (busy.value) return;

    busy.value = true;
    status.value = 'preparing';
    errorText.value = '';

    try {
      await setChatMessages([{ message_id: targetId, message: nextText, is_hidden: latestUser.hidden }], {
        refresh: 'none',
      });
      const trailingIds = readMessagesAfterContainer()
        .map(message => message.message_id)
        .filter(id => id > targetId)
        .sort((a, b) => a - b);
      if (trailingIds.length > 0) {
        await deleteChatMessages(trailingIds, { refresh: 'none' });
      }
      appendLog('action', '改词重生', stripTagsForPreview(nextText).slice(0, 80) || '(空输入)');
      cancelInlineEdit();
      rebuildTranscript();
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      toastr?.error?.(`改词失败：${errorText.value}`);
      appendLog('error', '改词失败', errorText.value || '未知错误');
      return;
    } finally {
      busy.value = false;
    }

    await triggerNativeRegenerate(targetId, nextText);
  }

  async function confirmRollbackDelete(item: TranscriptItem) {
    if (rollbackConfirmMessageId.value !== item.message_id) {
      rollbackConfirmMessageId.value = item.message_id;
      return;
    }
    await deleteFromMessageId(item.message_id);
  }

  async function deleteOpeningAssistantMessageById(messageId: number | null, reason: string) {
    const normalizedMessageId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedMessageId) || normalizedMessageId < 0) return;
    await deleteChatMessages([normalizedMessageId], { refresh: 'none' });
    if (assistantMessageId.value === normalizedMessageId) {
      assistantMessageId.value = null;
    }
    latestPatchedMessage = '';
    rebuildTranscript(reason);
  }

  function hasOpeningFollowUpTurns(openingAssistantMessageId: number | null): boolean {
    const normalizedOpeningAssistantMessageId = Math.trunc(Number(openingAssistantMessageId));
    if (!Number.isFinite(normalizedOpeningAssistantMessageId) || normalizedOpeningAssistantMessageId < 0) {
      return false;
    }
    return readMessagesAfterContainer().some(item => item.message_id > normalizedOpeningAssistantMessageId);
  }

  async function runOpeningDetachedGeneration(compiledPromptSnapshot: string): Promise<boolean> {
    const openingAssistantMessageId = Math.trunc(Number(openingPayload.value.opening_assistant_message_id));
    if (
      Number.isFinite(openingAssistantMessageId) &&
      openingAssistantMessageId > 0 &&
      hasSuccessfulOpeningAssistant.value !== true
    ) {
      await deleteOpeningAssistantMessageById(openingAssistantMessageId, 'opening_retry_cleanup');
    }

    openingPayload.value = {
      ...openingPayload.value,
      state: 'generating',
      compiled_prompt_snapshot: compiledPromptSnapshot,
      opening_assistant_message_id: null,
    };
    persistOpeningPayloadNow();

    const flowResult = await runGenerationFlow({
      prompt: compiledPromptSnapshot,
      createUser: false,
      detachedUserInput: true,
      maxChatHistory: 0,
      emitLifecycleKind: 'normal',
      onAssistantPlaceholderCreated: assistantId => {
        openingPayload.value = {
          ...openingPayload.value,
          state: 'generating',
          compiled_prompt_snapshot: compiledPromptSnapshot,
          opening_assistant_message_id: assistantId,
        };
        persistOpeningPayloadNow();
      },
    });

    if (flowResult.success) {
      openingPayload.value = {
        ...openingPayload.value,
        state: 'ready',
        compiled_prompt_snapshot: compiledPromptSnapshot,
        opening_assistant_message_id: flowResult.assistantMessageId,
      };
      persistOpeningPayloadNow();
      return true;
    }

    if (!flowResult.hadVisibleAssistantContent && flowResult.assistantMessageId != null) {
      await deleteOpeningAssistantMessageById(flowResult.assistantMessageId, 'opening_failure_cleanup');
    }

    openingPayload.value = {
      ...openingPayload.value,
      state: 'configuring',
      compiled_prompt_snapshot: compiledPromptSnapshot,
      opening_assistant_message_id: flowResult.hadVisibleAssistantContent ? flowResult.assistantMessageId : null,
    };
    persistOpeningPayloadNow();
    return false;
  }

  async function generateOpening() {
    if (busy.value) return;

    hydrateOpeningPayloadDefaults();

    if (!getOpeningWorldMode(openingPayload.value.world_mode_id)) {
      toastr?.warning?.('请先选择有效的世界观档位');
      return;
    }
    if (!getOpeningRoute(openingPayload.value.route_id)) {
      toastr?.warning?.('请先选择有效的开局主流派');
      return;
    }

    const missing = openingPreset.value.form_schema.find(
      field => field.required && !String(openingPayload.value.form_values[field.key] ?? '').trim(),
    );
    if (missing) {
      toastr?.warning?.(`请先填写：${missing.label}`);
      return;
    }
    const compiledPromptSnapshot = buildOpeningCompiledUserInput(openingPreset.value, openingPayload.value);
    const generated = await runOpeningDetachedGeneration(compiledPromptSnapshot);
    if (generated) {
      appendLog('action', '生成开局', stripTagsForPreview(compiledPromptSnapshot).slice(0, 80) || '(空开局)');
    }
  }

  async function rerollOpening() {
    if (busy.value) return;
    const compiledPromptSnapshot = String(openingPayload.value.compiled_prompt_snapshot ?? '').trim();
    if (!compiledPromptSnapshot) {
      toastr?.info?.('当前还没有可重ROLL的开局提示词');
      return;
    }
    if (hasOpeningFollowUpTurns(openingPayload.value.opening_assistant_message_id ?? null)) {
      toastr?.warning?.('已有正式剧情楼层，暂不支持在此阶段重ROLL开局');
      return;
    }
    await runOpeningDetachedGeneration(compiledPromptSnapshot);
  }

  function bindHistoryRefreshEvents() {
    console.log('[Debug] bindHistoryRefreshEvents called', {
      isOpeningWorkbenchHost: isOpeningWorkbenchHostActive(),
      eventOnType: typeof eventOn,
      tavern_eventsDefined: typeof tavern_events !== 'undefined',
      tavern_eventsKeys: typeof tavern_events !== 'undefined' ? Object.keys(tavern_events).slice(0, 20) : null,
      windowName: window.name,
    });
    if (!isOpeningWorkbenchHostActive()) return;
    if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') return;
    const names = [
      tavern_events.CHAT_CHANGED,
      tavern_events.GENERATION_STARTED,
      tavern_events.GENERATION_ENDED,
      tavern_events.MESSAGE_SENT,
      tavern_events.MESSAGE_EDITED,
      tavern_events.MESSAGE_RECEIVED,
      tavern_events.MESSAGE_UPDATED,
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MESSAGE_DELETED,
      tavern_events.MORE_MESSAGES_LOADED,
      tavern_events.STREAM_TOKEN_RECEIVED,
      tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED,
    ];
    historyStops = names.map(name => {
      try {
        return eventOn(name as any, (...payload: unknown[]) => handleHostRefreshEvent(String(name), payload));
      } catch {
        return null;
      }
    });
  }

  function bindGenerationEvents() {
    clearGenerationListeners();
    if (typeof eventOn !== 'function' || typeof iframe_events === 'undefined') return;
    const traceId = resolveTraceId('iframe');
    const listenerEpoch = generationListenerEpochController.activateNext();
    const isStaleListener = () => !generationListenerEpochController.isCurrent(listenerEpoch);
    recordLifecycleTrace('bindGenerationEvents', 'bind', { listenerEpoch }, traceId);

    try {
      generationStops.push(
        eventOn(iframe_events.GENERATION_STARTED as any, () => {
          if (isStaleListener()) {
            recordLifecycleTrace(
              'bindGenerationEvents',
              'generation_started_ignored_stale',
              {
                listenerEpoch,
              },
              traceId,
            );
            return;
          }
          status.value = 'streaming';
          transcript.value = syncTranscriptFlags(transcript.value);
          recordLifecycleTrace(
            'bindGenerationEvents',
            'generation_started',
            {
              listenerEpoch,
              transcriptAssistantSummary: summarizeTranscriptForDebug(transcript.value),
            },
            traceId,
          );
        }),
      );
    } catch {
      // ignore
    }

    try {
      generationStops.push(
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY as any, (token: string) => {
          if (isStaleListener()) {
            recordLifecycleTrace(
              'bindGenerationEvents',
              'token_incremental_ignored_stale',
              {
                listenerEpoch,
                tokenLength: String(token ?? '').length,
              },
              traceId,
            );
            return;
          }
          void (async () => {
            const tokenText = String(token ?? '');
            streamText.value += tokenText;
            status.value = 'streaming';
            recordLifecycleTrace(
              'bindGenerationEvents',
              'token_incremental',
              {
                listenerEpoch,
                tokenLength: tokenText.length,
                streamSignature: buildDebugMessageSignature(streamText.value),
              },
              traceId,
            );
            if (
              shouldCreateAssistantPlaceholderOnFirstToken({
                assistantMessageId: assistantMessageId.value,
                placeholderCreating: assistantPlaceholderCreating,
                token: tokenText,
              })
            ) {
              await ensureAssistantPlaceholderReady('first_token');
              return;
            }
            await patchAssistantMessage('stream');
          })();
        }),
      );
    } catch {
      // ignore
    }

    try {
      generationStops.push(
        eventOn(iframe_events.GENERATION_ENDED as any, (text: string) => {
          if (isStaleListener()) {
            recordLifecycleTrace(
              'bindGenerationEvents',
              'generation_ended_ignored_stale',
              {
                listenerEpoch,
              },
              traceId,
            );
            return;
          }
          finalText.value = String(text ?? '').trim();
          recordLifecycleTrace(
            'bindGenerationEvents',
            'generation_ended',
            {
              listenerEpoch,
              finalSignature: buildDebugMessageSignature(finalText.value),
            },
            traceId,
          );
        }),
      );
    } catch {
      // ignore
    }
  }

  async function createAssistantPlaceholder() {
    const traceId = resolveTraceId('placeholder');
    await createChatMessages([{ role: 'assistant', is_hidden: false, message: buildStreamDemoMessage('', 'stream') }], {
      refresh: 'none',
    });
    const id = Number(getLastMessageId?.());
    assistantMessageId.value = Number.isFinite(id) ? Math.trunc(id) : null;
    latestPatchedMessage = '';
    if (assistantMessageId.value != null) {
      upsertTranscriptItem(
        createLocalTranscriptItem({
          id: assistantMessageId.value,
          role: 'assistant',
          raw: buildStreamDemoMessage('', 'stream'),
          hidden: false,
        }),
      );
    }
    recordLifecycleTrace(
      'createAssistantPlaceholder',
      'created',
      {
        assistantMessageId: assistantMessageId.value,
        placeholderSignature: buildDebugMessageSignature(buildStreamDemoMessage('', 'stream')),
      },
      traceId,
    );
    await patchAssistantMessage('stream');
  }

  async function runDemo(nextPrompt?: string) {
    if (!hasSuccessfulOpeningAssistant.value) {
      toastr?.info?.('请先完成开局配置并生成 opening');
      return;
    }
    const prompt = String(nextPrompt ?? input.value ?? '').trim();
    if (!prompt || busy.value) return;
    await runGenerationFlow({ prompt, createUser: true });
    if (status.value === 'done' && (nextPrompt == null || prompt === String(input.value ?? '').trim())) {
      input.value = '';
    }
  }

  async function runNativeSendProxy(prompt: string): Promise<boolean> {
    const text = String(prompt ?? '').trim();
    if (!text || busy.value) return false;

    busy.value = true;
    nativeSendProxyActive = true;
    status.value = 'preparing';
    errorText.value = '';

    try {
      await withHostTranscriptVisible(async () => {
        await sendToNativeChat(text, true);
      });
      appendLog('action', '发送用户输入', stripTagsForPreview(text).slice(0, 80) || '(空输入)');
      status.value = 'done';
      return true;
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      toastr?.error?.(`发送失败：${errorText.value}`);
      appendLog('error', '发送失败', errorText.value || '未知错误');
      return false;
    } finally {
      nativeSendProxyActive = false;
      busy.value = false;
      queueHidePolicy('native_send_proxy');
    }
  }

  onMounted(async () => {
    restoreReaderChatState();

    if (isOpeningWorkbenchHostActive()) {
      bindHistoryRefreshEvents();
      void bindMvuRefreshEvents();

      await restoreHideState();

      if (document.body && typeof MutationObserver !== 'undefined') {
        generatedImageDomObserver = new MutationObserver(records => {
          if (!records.some(hasRelevantChatu8Mutation)) return;
          syncPendingRequestHintsFromDom();
          queueGeneratedImageEntityRefresh(collectMutationMessageIds(records));
        });
        generatedImageDomObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['src'],
        });
      }
      hostPluginMutationObservers = bindHostPluginMutationObservers(records => {
        const affectedMessageIds = collectMutationMessageIds(records);
        syncPendingRequestHintsFromDom();
        queueGeneratedImageEntityRefresh(affectedMessageIds);
        refreshTranscriptItemsByIds(affectedMessageIds, 'host.plugin_native_dom_mutation');
        scheduleUiRefresh(['gallery'], 'host.plugin_native_dom_mutation');
      });
    }

    rebuildTranscript();
    queueHidePolicy('mounted');
  });

  watch(
    theme,
    value => {
      applyDemoTheme(value);
      queuePersistReaderChatState();
    },
    { immediate: true },
  );

  watch(density, () => {
    queuePersistReaderChatState();
  });

  watch(fontMode, () => {
    queuePersistReaderChatState();
  });

  watch(
    () => latestUserItem.value?.message_id ?? null,
    latestId => {
      if (editingUserMessageId.value != null && editingUserMessageId.value !== latestId) {
        cancelInlineEdit();
      }
    },
  );

  watch(
    () => transcript.value.map(item => item.message_id).join(','),
    ids => {
      if (rollbackConfirmMessageId.value == null) return;
      if (!ids.split(',').includes(String(rollbackConfirmMessageId.value))) {
        cancelRollbackDelete();
      }
    },
  );

  function clearTimer(id: number): number {
    if (id) window.clearTimeout(id);
    return 0;
  }

  onBeforeUnmount(() => {
    if (isOpeningWorkbenchHostActive()) {
      persistHideStateNow('unmount');
      try {
        const hiddenMessages = readMessagesAfterContainer()
          .filter(item => item.is_hidden === true)
          .map(item => ({ message_id: item.message_id, is_hidden: false }));
        if (hiddenMessages.length > 0) {
          void setChatMessages(hiddenMessages, { refresh: 'all' });
        }
      } catch {
        // best-effort cleanup
      }
    }
    clearGenerationListeners();
    historyStops.forEach(stop => stop?.stop?.());
    historyStops = [];
    mvuStops.forEach(stop => stop?.stop?.());
    mvuStops = [];
    hidePolicyTimer = clearTimer(hidePolicyTimer);
    externalSyncTimer = clearTimer(externalSyncTimer);
    readerStatePersistTimer = clearTimer(readerStatePersistTimer);
    openingPayloadPersistTimer = clearTimer(openingPayloadPersistTimer);
    generatedImageDomMutationTimer = clearTimer(generatedImageDomMutationTimer);
    hideStatePersistTimer = clearTimer(hideStatePersistTimer);
    generatedImageDomObserver?.disconnect();
    generatedImageDomObserver = null;
    hostPluginMutationObservers.forEach(observer => observer.disconnect());
    hostPluginMutationObservers = [];
  });

  type GalleryGroup = { messageId: number; images: GeneratedImageRef[] };
  const galleryGroups = computed<GalleryGroup[]>(() => {
    void galleryRevision.value;

    const groups: GalleryGroup[] = [];
    for (const item of transcript.value) {
      if (item.role !== 'assistant' || item.isOpening) continue;
      const images = buildGeneratedImageRefsForMessage({
        messageId: item.message_id,
        rawMessage: item.raw,
      });
      if (images.length === 0) continue;
      groups.push({ messageId: item.message_id, images });
    }

    recordComponentDebugTrace({
      scope: 'galleryGroups',
      event: 'recompute',
      payload: {
        messageId: null,
        variant: 'computed',
        groupCount: groups.length,
        imageCount: groups.reduce((total, group) => total + group.images.length, 0),
        transcriptCount: transcript.value.length,
        galleryRevision: galleryRevision.value,
      },
    });

    return groups;
  });
  const galleryEntries = computed<GeneratedImageRef[]>(() => galleryGroups.value.flatMap(g => g.images));

  return {
    input,
    busy,
    status,
    streamText,
    finalText,
    errorText,
    assistantMessageId,
    filterMode,
    density,
    theme,
    fontMode,
    readingMode,
    readingModeLabel,
    followLatest,
    isTranscriptHistoryMode,
    transcriptWindowLabel,
    transcriptWindowPages,
    openingExpanded,
    selectedItem,
    transcript,
    visibleTranscript,
    transcriptStats,
    mvuSourceRevision,
    currentMvuAnchorMessageId,
    latestUserItem,
    latestAssistantItem,
    inputHasText,
    editingUserMessageId,
    editingUserDraft,
    rollbackConfirmMessageId,
    openingPreset,
    openingPayload,
    openingWorldModes,
    openingRoutes,
    shouldShowOpeningSetup,
    canDismissOpeningSetup,
    isCalibratingDailyRoll,
    readerSummary,
    logs,
    transcriptDomRevision,
    galleryGroups,
    galleryEntries,
    beginPendingImageTask,
    markRecentImageIntent,
    runDemo,
    rollLatestTurn,
    refreshWorkbench,
    updateOpeningMeta,
    updateOpeningField,
    updateOpeningWorldMode,
    updateOpeningRoute,
    updateOpeningStream,
    generateOpening,
    rerollOpening,
    deleteFromMessageId,
    startInlineEdit,
    setEditingUserDraft,
    cancelInlineEdit,
    confirmInlineEditRegenerate,
    requestRollbackDelete,
    cancelRollbackDelete,
    confirmRollbackDelete,
    setReadingMode,
    selectTranscriptWindowPage,
    resetTranscriptWindowToLatestState,
    toggleOpeningExpanded,
    rebuildTranscript,
    openDetail,
    closeDetail,
    withHostTranscriptVisible,
    ensureHostMesTextRendered,
    triggerImageGenerationForMessage,
    calibrateDailyRollDate,
  };
}

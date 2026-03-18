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
  extractOpeningContent,
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
  shouldLoadOpeningGenerator,
} from '../../shared/opening';
import type { OpeningPayload, OpeningPreset } from '../../shared/opening.schema';
import {
  normalizeDensity,
  normalizeFontMode,
  normalizeReadingMode,
  normalizeTheme,
  patchReaderChatState,
  READER_CHAT_STATE_VERSION,
  readReaderChatState,
} from './readerState';
import { buildPromptTokenFromCachePrompt, collectChatu8CacheEntries, type Chatu8CacheEntry } from './galleryCache';
import { createImagePendingTaskManager } from './imagePendingTaskManager';
import { getFallbackImageClasses } from './imageFallbackClasses';
import { chooseImageRenderMode } from './imageRenderPriority';
import { countPluginNativeImageArtifacts } from './pluginNativeImageDom';
import { buildGeneratedImagePersistencePatch, sanitizePluginImageExtra } from './imagePersistencePatch';
import { createImageRecentIntentStore } from './imageRecentIntent';
import { resolveImageRequestTargetMessageId } from './imageRequestTargetResolver';
import { resolveRefreshDomainsForEvent, type RefreshDomain } from './refreshDomains';
import { reprocessMessageVariablesById } from '../../../mvu_reprocess';
import type {
  DemoStatus,
  GeneratedImageRef,
  ReaderGalleryEntry,
  ReaderLogItem,
  DemoTheme,
  ReaderFontMode,
  ReaderSummary,
  ReadingMode,
  TranscriptDensity,
  TranscriptFilterMode,
  TranscriptItem,
} from './types';

type StopHandle = { stop?: () => void } | null;
type HideRefreshMode = 'none' | 'affected';
type RenderableGeneratedImage = {
  imageId?: string;
  src: string;
  alt: string;
  promptToken?: string;
  requestId?: string;
  anchorText?: string;
};
type ImageRequestBindingResult = ReturnType<ReturnType<typeof createImagePendingTaskManager>['registerRequest']>;

const DEMO_THEME_CLASS_NAMES = [
  'theme-tech',
  'theme-dark',
  'theme-gold',
  'theme-ios',
  'theme-ipod',
  'theme-amber',
] as const;
const CHATU8_IMAGE_BUTTON_SELECTOR = '.st-chatu8-image-button';
const CHATU8_IMAGE_SPAN_SELECTOR = '.st-chatu8-image-span';
const CHATU8_PROMPT_TOKEN_RE = /([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})###([\s\S]*?)###/g;
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

  try {
    return buildFinalHtml(source, message_id);
  } catch {
    // ignore
  }

  const regexText = applyRegexForDisplay(source, role);
  const maybeHtml = /<\/?[a-z][^>]*>/i.test(regexText);
  if (maybeHtml) return normalizeDisplayedHtml(regexText);
  return `<pre class="stream-stage-pre">${escapeHtml(regexText || source)}</pre>`;
}

function normalizeDisplayedHtml(html: string): string {
  return String(html ?? '')
    .replace(/<q(\s[^>]*)?>/gi, '<span class="dialog-inline">')
    .replace(/<\/q>/gi, '</span>');
}

function buildFinalHtml(renderSource: string, message_id: number): string {
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
  return html;
}

function listReachableHostWindows(): Array<Window & typeof globalThis> {
  const windows: Array<Window & typeof globalThis> = [];
  const seen = new Set<Window>();
  const push = (candidate: Window | null | undefined) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    windows.push(candidate as Window & typeof globalThis);
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

  return windows;
}

function readHostContext(): any {
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const ctx = (hostWindow as any)?.SillyTavern?.getContext?.();
      if (ctx) return ctx;
    } catch {
      // ignore
    }
  }
  return null;
}

function normalizeImageDataToSrc(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `data:image/png;base64,${raw}`;
}

function normalizeImageSrcForCompare(input: unknown): string {
  return String(input ?? '')
    .trim()
    .replace(/&amp;/g, '&');
}

function readChatu8CacheEntries(messageId?: number | null): Chatu8CacheEntry[] {
  const ctx = readHostContext();
  const chatMeta = ctx?.chatMetadata?.['st-chatu8'];
  return collectChatu8CacheEntries(chatMeta, messageId);
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
  const requestIdAttr = image.requestId ? ` data-request-id="${escapeHtml(image.requestId)}"` : ' data-request-id=""';
  const imageSrcAttr = image.src ? ` data-image-src="${encodeDataAttr(image.src)}"` : ' data-image-src=""';
  return `<figure class="${className}"${messageIdAttr}${promptTokenAttr}${requestIdAttr}${imageSrcAttr}><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || 'generated image')}" loading="lazy"${messageIdAttr}${promptTokenAttr}${requestIdAttr}${imageSrcAttr}></figure>`;
}

function readChatMessageDetail(messageId: number): any | null {
  try {
    const list = getChatMessages(messageId, { hide_state: 'all' }) as any[];
    return Array.isArray(list) ? (list[0] ?? null) : null;
  } catch {
    return null;
  }
}

function readPersistedGeneratedImages(messageId: number): RenderableGeneratedImage[] {
  const message = readChatMessageDetail(messageId);
  const list = _.get(message, 'data.stream_demo.generated_images', []);
  if (!Array.isArray(list)) return [];

  const out: RenderableGeneratedImage[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const src = String((item as any)?.src ?? '').trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({
      imageId: String((item as any)?.imageId ?? '').trim() || undefined,
      src,
      alt: String((item as any)?.alt ?? 'generated image').trim(),
      promptToken: String((item as any)?.promptToken ?? '').trim(),
      requestId: String((item as any)?.requestId ?? '').trim() || undefined,
      anchorText: String((item as any)?.anchorText ?? '').trim() || undefined,
    });
  }
  return out;
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
      imageId: String((entry as any).imageId ?? '').trim() || undefined,
      src,
      alt: String((entry as any).alt ?? 'generated image').trim(),
      promptToken: buildPromptTokenFromCachePrompt((entry as any).tag ?? (entry as any).prompt ?? ''),
      requestId: String((entry as any).requestId ?? (entry as any).request_id ?? '').trim() || undefined,
    });
  }
  return out;
}

function createPromptTokenMarkup(promptTokens: string[]): string {
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
    if (node.closest(`.${FALLBACK_IMAGE_CLASSES.gallery}, .assistant-image-prompt-list`)) return false;
    if (node.matches(`.${FALLBACK_IMAGE_CLASSES.item}, .${FALLBACK_IMAGE_CLASSES.inline}`)) return false;
    if (node.querySelector('img, figure')) return false;
    if (node.tagName === 'DIV' && node.querySelector('p, pre, blockquote, li')) return false;
    return normalizeAnchorText(node.textContent ?? '').length >= 12;
  });
}

function resolveInlineAnchorTarget(root: HTMLElement, anchorText: string): HTMLElement | null {
  const needle = buildAnchorSnippet(anchorText);
  if (!needle) return null;
  const candidates = collectInlineAnchorCandidates(root);
  let fallback: HTMLElement | null = null;

  for (const candidate of candidates) {
    const text = normalizeAnchorText(candidate.textContent ?? '');
    if (!text) continue;
    if (text.includes(needle) || needle.includes(text)) return candidate;
    if (
      !fallback &&
      (text.includes(needle.slice(0, Math.min(24, needle.length))) || needle.includes(text.slice(-24)))
    ) {
      fallback = candidate;
    }
  }

  return fallback;
}

function injectGeneratedImagesIntoHtml(html: string, images: RenderableGeneratedImage[], messageId: number): string {
  if (images.length === 0) return html;

  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = html;
  const insertionRefs = new Map<HTMLElement, HTMLElement>();
  const fallbackFigures: HTMLElement[] = [];

  for (const image of images) {
    const figure = createGeneratedImageFigureElement(doc, image, FALLBACK_IMAGE_CLASSES.inline, messageId);
    const anchor = image.anchorText ? resolveInlineAnchorTarget(doc.body, image.anchorText) : null;
    if (!anchor) {
      fallbackFigures.push(figure);
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
  const existingRoots = [...resolveIframeAssistantRoots(messageId), ...resolveDisplayedMessageRoots(messageId)];
  const compatibilityImages = readPersistedGeneratedImages(messageId);
  const pluginNativeImages = [
    ...readChatu8ExtraImages(messageId),
    ...readChatu8CacheEntries(messageId).map(item => ({
      imageId: item.imageId,
      src: item.src,
      alt: item.alt,
      promptToken: item.promptToken,
      requestId: item.requestId,
    })),
  ];

  const renderMode = chooseImageRenderMode({
    hasPluginNativeDom: countPluginNativeImageArtifacts(existingRoots) > 0,
    pluginNativeCount: pluginNativeImages.length,
    compatibilityCount: compatibilityImages.length,
  });

  const images =
    renderMode === 'compatibility'
      ? compatibilityImages
      : renderMode === 'plugin-native-data'
        ? pluginNativeImages
        : [];

  const existingSources = collectImageSourceIdentitiesFromHtml(html);
  const dedupedImages: RenderableGeneratedImage[] = [];
  const seenSources = new Set<string>();
  for (const image of images) {
    const normalizedSrc = normalizeImageSrcForCompare(image.src);
    if (!normalizedSrc || existingSources.has(image.src) || seenSources.has(normalizedSrc)) continue;
    if (image.promptToken && promptTokenSet.size > 0 && !promptTokenSet.has(image.promptToken)) continue;
    seenSources.add(normalizedSrc);
    dedupedImages.push(image);
  }

  const htmlWithImages = injectGeneratedImagesIntoHtml(html, dedupedImages, messageId);
  const promptMarkup = createPromptTokenMarkup(promptTokens);
  if (!promptMarkup) return htmlWithImages;
  return `${htmlWithImages}${promptMarkup}`;
}

function collectReachableHostDocuments(): Document[] {
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
  for (const doc of collectReachableHostDocuments()) {
    const selectors = [`#chat > .mes[mesid='${mesid}']`, `#chat .mes[mesid='${mesid}']`, `.mes[mesid='${mesid}']`];
    for (const selector of selectors) {
      pushRoot(doc.querySelector(selector) as HTMLElement | null);
    }
  }

  return roots;
}

function resolveIframeAssistantRoots(messageId: number): HTMLElement[] {
  const roots: HTMLElement[] = [];
  const selector = `.assistant-body[data-message-id='${Math.trunc(messageId)}']`;
  for (const doc of collectReachableHostDocuments()) {
    if (doc !== document) continue;
    const nodes = Array.from(doc.querySelectorAll(selector)) as HTMLElement[];
    for (const node of nodes) {
      if (roots.includes(node)) continue;
      roots.push(node);
    }
  }
  return roots;
}

function collectChatu8PromptTokens(input: string): string[] {
  const text = String(input ?? '');
  const out: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(CHATU8_PROMPT_TOKEN_RE)) {
    const raw = String(match[0] ?? '').trim();
    const prompt = String(match[2] ?? '').trim();
    if (!raw || !prompt) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }

  return out;
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

function extractPromptTokensFromDisplayedMessage(messageId: number): string[] {
  const roots = [...resolveIframeAssistantRoots(messageId), ...resolveDisplayedMessageRoots(messageId)];
  const domTokens = roots.length > 0 ? extractPromptTokensFromRoots(roots) : [];
  if (domTokens.length > 0) return domTokens;

  const cacheTokens = readChatu8CacheEntries(messageId)
    .map(item => item.promptToken)
    .filter(Boolean);
  return Array.from(new Set(cacheTokens));
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
      src,
      alt: String(altLike ?? 'generated image').trim(),
      promptToken: buildPromptTokenFromCachePrompt(promptLike),
      requestId: String(requestIdLike ?? '').trim() || undefined,
      anchorText: buildAnchorSnippet(String(anchorTextLike ?? '')) || undefined,
    });
  };

  for (const root of resolveIframeAssistantRoots(messageId)) {
    const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    for (const image of images) {
      pushImage(
        image.getAttribute('src') ?? image.currentSrc,
        image.getAttribute('alt') ?? image.getAttribute('title'),
        undefined,
        image.dataset.requestId ?? image.getAttribute('data-request-id'),
        extractAnchorTextForImageNode(image, root),
      );
    }
  }

  for (const root of resolveDisplayedMessageRoots(messageId)) {
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

  for (const item of readChatu8CacheEntries(messageId)) {
    pushImage(item.src, item.alt, item.promptToken, item.requestId);
  }

  return out;
}

function parsePromptBodyFromToken(promptToken: string): string {
  const token = String(promptToken ?? '').trim();
  if (!token) return '';
  const match = token.match(/^[^#]+###([\s\S]*?)###$/);
  return String(match?.[1] ?? token).trim();
}

function normalizeGalleryLabel(input: string, fallback = '未命名图像'): string {
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

function extractTitleFromAnchor(anchorText: string): string {
  const anchor = normalizeGalleryLabel(anchorText, '');
  if (!anchor) return '';
  return anchor.length > 26 ? `${anchor.slice(0, 26)}…` : anchor;
}

function extractTitleFromSrc(src: string): string {
  const source = String(src ?? '').trim();
  if (!source || source.startsWith('data:')) return '';
  try {
    const pathname = source.startsWith('http') ? new URL(source).pathname : source;
    const filename = pathname.split('/').pop() ?? '';
    const stem = filename.replace(/\.[a-z0-9]+$/i, '');
    return normalizeGalleryLabel(stem, '');
  } catch {
    const filename = source.split('/').pop() ?? '';
    const stem = filename.replace(/\.[a-z0-9]+$/i, '');
    return normalizeGalleryLabel(stem, '');
  }
}

function extractCharacterNameFromPrompt(promptToken: string): string {
  const prompt = parsePromptBodyFromToken(promptToken);
  if (!prompt) return '';

  const loraMatch = prompt.match(/<lora:([^:>]+)(?::[\d.]+)?>/i);
  if (loraMatch?.[1]) return normalizeGalleryLabel(loraMatch[1]);

  const namedMatch = prompt.match(/(?:角色|人物|character|name)\s*[:：]\s*([^,，|\n<>]{1,32})/i);
  if (namedMatch?.[1]) return normalizeGalleryLabel(namedMatch[1]);

  const quoteMatch = prompt.match(/[“"'「『]([^“”"'」』]{1,24})[”"'」』]/);
  if (quoteMatch?.[1]) return normalizeGalleryLabel(quoteMatch[1]);

  const firstSegment = prompt
    .split(/[,，|\n]/)
    .map(segment => normalizeGalleryLabel(segment, ''))
    .find(
      segment =>
        segment.length >= 2 && segment.length <= 24 && !/\b(masterpiece|best quality|1girl|solo)\b/i.test(segment),
    );
  return firstSegment ?? '';
}

function extractGalleryTitleFromPrompt(promptToken: string): string {
  const prompt = parsePromptBodyFromToken(promptToken);
  if (!prompt) return '';

  const cleaned = prompt.replace(/<lora:[^>]+>/gi, '').trim();
  const firstSegment = cleaned
    .split(/[,，|\n]/)
    .map(segment => normalizeGalleryLabel(segment, ''))
    .find(Boolean);
  if (!firstSegment) return '';
  return firstSegment.length > 32 ? `${firstSegment.slice(0, 32)}…` : firstSegment;
}

function buildGeneratedImageRefsForMessage(input: {
  messageId: number;
  rawMessage: string;
  createdOrderBase?: number;
}): GeneratedImageRef[] {
  const messageId = Math.trunc(Number(input.messageId));
  if (!Number.isFinite(messageId) || messageId < 0) return [];

  const promptTokens = collectChatu8PromptTokens(input.rawMessage);
  const createdOrderBase = Math.trunc(Number(input.createdOrderBase ?? 0));
  const imageKeys: string[] = [];
  const promptByKey = new Map<string, string>();
  const requestByKey = new Map<string, string>();
  const anchorByKey = new Map<string, string>();
  const titleByKey = new Map<string, string>();
  const characterByKey = new Map<string, string>();

  const mergeImage = (image: RenderableGeneratedImage) => {
    const src = normalizeImageSrcForCompare(image.src);
    const imageId = String(image.imageId ?? '').trim();
    const promptToken = String(image.promptToken ?? '').trim();
    const requestId = String(image.requestId ?? '').trim();
    const anchorText = String(image.anchorText ?? '').trim();
    const imageKey = imageId || requestId || src || promptToken || anchorText;
    if (!imageKey) return;
    if (!imageKeys.includes(imageKey)) imageKeys.push(imageKey);
    const characterName = extractCharacterNameFromPrompt(promptToken);
    const title = extractGalleryTitleFromPrompt(promptToken) || characterName;

    if (promptToken && !promptByKey.has(imageKey)) promptByKey.set(imageKey, promptToken);
    if (requestId && !requestByKey.has(imageKey)) requestByKey.set(imageKey, requestId);
    if (anchorText && !anchorByKey.has(imageKey)) anchorByKey.set(imageKey, anchorText);
    if (title && !titleByKey.has(imageKey)) titleByKey.set(imageKey, title);
    if (characterName && !characterByKey.has(imageKey)) characterByKey.set(imageKey, characterName);
  };

  const images = [
    ...readPersistedGeneratedImages(messageId),
    ...readChatu8ExtraImages(messageId),
    ...readChatu8CacheEntries(messageId).map(item => ({
      src: item.src,
      alt: item.alt,
      promptToken: item.promptToken,
      requestId: item.requestId,
    })),
  ];

  for (const image of images) mergeImage(image);

  let index = 0;
  return imageKeys.map(imageKey => {
    const promptToken = promptByKey.get(imageKey) ?? promptTokens[index] ?? '';
    const anchorText = anchorByKey.get(imageKey) || undefined;
    const characterNameValue = pickFirstNonEmpty(
      characterByKey.get(imageKey),
      extractCharacterNameFromPrompt(promptToken),
    );
    const characterName = characterNameValue || undefined;
    const title = pickFirstNonEmpty(
      titleByKey.get(imageKey),
      extractGalleryTitleFromPrompt(promptToken),
      characterName,
      extractTitleFromAnchor(anchorText ?? ''),
      extractTitleFromSrc(imageKey),
      `楼层 #${messageId} · 图 ${index + 1}`,
    );
    const requestId = requestByKey.get(imageKey) || undefined;
    const entry: GeneratedImageRef = {
      id: `${messageId}:${requestId ?? imageKey}:${index}`,
      messageId,
      imageId: requestId || imageKey,
      promptToken,
      requestId,
      anchorText,
      title: normalizeGalleryLabel(title),
      characterName: characterName ? normalizeGalleryLabel(characterName) : undefined,
      createdOrder: createdOrderBase * 100 + index,
    };
    index += 1;
    return entry;
  });
}

function buildGalleryEntriesForMessage(message: BaseChatMessage, createdOrder: number): ReaderGalleryEntry[] {
  return buildGeneratedImageRefsForMessage({
    messageId: message.message_id,
    rawMessage: message.message,
    createdOrderBase: createdOrder,
  });
}

function hasRelevantChatu8Mutation(record: MutationRecord): boolean {
  const matchesRelevantNode = (node: Node | null | undefined) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.matches(CHATU8_IMAGE_BUTTON_SELECTOR) || node.matches(CHATU8_IMAGE_SPAN_SELECTOR)) return true;
    if (node.querySelector(CHATU8_IMAGE_BUTTON_SELECTOR) || node.querySelector(CHATU8_IMAGE_SPAN_SELECTOR)) return true;
    return false;
  };

  if (matchesRelevantNode(record.target)) return true;
  for (const node of Array.from(record.addedNodes)) {
    if (matchesRelevantNode(node)) return true;
  }
  for (const node of Array.from(record.removedNodes)) {
    if (matchesRelevantNode(node)) return true;
  }
  return false;
}

function readCurrentContainerMessageId(): number | null {
  try {
    const value = Number(getCurrentMessageId?.());
    return Number.isFinite(value) ? Math.trunc(value) : null;
  } catch {
    return null;
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

function buildOpeningGenerateConfig(preset: OpeningPreset, payload: OpeningPayload) {
  return {
    user_input: buildOpeningCompiledUserInput(preset, payload),
    should_stream: payload.use_stream,
    max_chat_history: 0,
  } as GenerateConfig;
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
  const options = isDemoAssistant ? extractStreamDemoOptions(input.raw) : structuredOptions;
  const renderSource = isDemoAssistant ? stripStreamDemoRuntimeTags(input.raw) : input.raw.trim();
  const streamRenderSource = isDemoAssistant ? content : renderSource;
  const regexText = applyRegexForDisplay(renderSource, input.role);
  const streamHtml = buildStreamStageHtml(streamRenderSource, input.role, input.id);
  const finalHtml = buildFinalHtml(renderSource, input.id);
  const generatedImages =
    input.role === 'assistant'
      ? buildGeneratedImageRefsForMessage({
          messageId: input.id,
          rawMessage: renderSource,
        })
      : [];
  const preview = stripTagsForPreview(content || regexText).slice(0, 80);

  return {
    message_id: input.id,
    role: input.role,
    roleLabel: normalizeRoleLabel(input.role),
    isOpening: input.isOpening === true,
    raw: input.raw,
    renderSource,
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

function buildOpeningAssistantText(payload: OpeningPayload): string {
  const raw = String(payload.result?.raw ?? '').trim();
  if (raw) return raw;

  const body = String(payload.result?.content ?? '').trim();
  const options = Array.isArray(payload.result?.options)
    ? payload.result.options.map(option => String(option ?? '').trim()).filter(Boolean)
    : [];

  return [body, options.length > 0 ? ['', ...options.map((option, index) => `${index + 1}. ${option}`)].join('\n') : '']
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function isOpeningAssistantMessage(message: any): boolean {
  return _.get(message, 'data.stream_demo.opening_assistant') === true;
}

function isOpeningSeedMessage(message: any): boolean {
  return _.get(message, 'data.stream_demo.opening_seed') === true;
}

function buildOpeningTranscriptItem(
  payload: OpeningPayload,
  preset: OpeningPreset,
  status: DemoStatus,
): TranscriptItem {
  const streamedContent = String(payload.result?.content ?? '').trim();
  const isOpeningStreaming = payload.state === 'generating' || status === 'streaming';
  const renderSource = streamedContent || (isOpeningStreaming ? '（流式）等待中' : '开局尚未生成，请先完成开局配置。');
  const regexText = applyRegexForDisplay(renderSource, 'assistant');
  const finalHtml = buildFinalHtml(renderSource, 0);

  return {
    message_id: 0,
    role: 'assistant',
    roleLabel: '开局',
    isOpening: true,
    raw: renderSource,
    renderSource,
    content: renderSource,
    preview: stripTagsForPreview(renderSource || preset.first_line || preset.world_intro).slice(0, 80),
    regexText,
    streamHtml: buildStreamStageHtml(renderSource, 'assistant', 0),
    finalHtml,
    generatedImages: [],
    options: payload.result?.options ?? [],
    hidden: false,
    phase: isOpeningStreaming ? 'stream' : 'done',
    isLatest: false,
    isStreaming: isOpeningStreaming,
    canOpenDetail: true,
    canDeleteFrom: false,
    canReroll: Boolean(payload.opening_seed_user_message_id) && payload.state === 'ready',
  };
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
  const filterMode = ref<TranscriptFilterMode>('assistant');
  const density = ref<TranscriptDensity>('comfortable');
  const theme = ref<DemoTheme>('tech');
  const fontMode = ref<ReaderFontMode>('hud');
  const readingMode = ref<ReadingMode>('following_latest');
  const selectedItem = ref<TranscriptItem | null>(null);
  const openingExpanded = ref(true);
  const logs = ref<ReaderLogItem[]>([]);
  const editingUserMessageId = ref<number | null>(null);
  const editingUserDraft = ref('');
  const rollbackConfirmMessageId = ref<number | null>(null);
  const openingPreset = ref<OpeningPreset>(getDefaultOpeningPreset());
  const openingPayload = ref<OpeningPayload>(getDefaultOpeningPayload(openingPreset.value));
  const openingWorldModes = getOpeningWorldModes();
  const openingRoutes = getOpeningRoutes();
  const isOpeningWorkbenchHost = initialContainerMessageId === 0;

  const followLatest = computed(() => readingMode.value === 'following_latest');

  const readingModeLabel = computed(() => (readingMode.value === 'following_latest' ? '跟随最新' : '浏览历史'));

  let patchQueue = Promise.resolve();
  let latestPatchedMessage = '';
  let generationStops: StopHandle[] = [];
  let openingGenerationStops: StopHandle[] = [];
  let historyStops: StopHandle[] = [];
  let imageBridgeStops: StopHandle[] = [];
  let mvuStops: StopHandle[] = [];
  let hidePolicyTimer = 0;
  let hidePolicyRunning = false;
  let hidePolicyRerun = false;
  let externalSyncTimer = 0;
  let readerStatePersistTimer = 0;
  let openingPayloadPersistTimer = 0;

  const HOST_VISIBILITY_CLASS = 'stream-demo-workbench-active';
  const HOST_VISIBILITY_STYLE_ID = 'stream-demo-host-visibility-style';
  const galleryRevision = ref(0);
  const mvuSourceRevision = ref(0);
  const imagePendingTaskManager = createImagePendingTaskManager();
  const imageRecentIntentStore = createImageRecentIntentStore();

  function logImageBridge(step: string, detail: Record<string, unknown> = {}) {
    console.info(`[stream-demo:image-bridge] ${step}`, detail);
  }

  const visibleTranscript = computed(() => {
    if (filterMode.value === 'all') return transcript.value;
    return transcript.value.filter(
      item => item.role === 'assistant' || item.isOpening || item.message_id === latestUserItem.value?.message_id,
    );
  });

  const transcriptStats = computed(() => ({
    total: transcript.value.length,
    assistant: transcript.value.filter(item => item.role === 'assistant').length,
  }));

  const galleryEntries = computed<ReaderGalleryEntry[]>(() => {
    const galleryRevisionSeed = galleryRevision.value;
    const messages = listAllChatMessages()
      .map(message => ({
        message_id: Math.trunc(Number(message?.message_id)),
        role: ((message?.role as string) || 'assistant') as BaseChatMessage['role'],
        message: String(message?.message ?? ''),
        is_hidden: message?.is_hidden === true,
      }))
      .filter(message => Number.isFinite(message.message_id))
      .filter(message => message.role === 'assistant')
      .sort((a, b) => a.message_id - b.message_id);

    return messages
      .flatMap((message, index) => buildGalleryEntriesForMessage(message, index + galleryRevisionSeed * 0))
      .sort((a, b) => {
        if (a.messageId !== b.messageId) return b.messageId - a.messageId;
        return a.createdOrder - b.createdOrder;
      });
  });

  const hasStoryMessagesBeyondOpening = computed(() => transcript.value.some(item => item.message_id > 0));

  const shouldShowOpeningSetup = computed(
    () =>
      isOpeningWorkbenchHost && shouldLoadOpeningGenerator(openingPayload.value, hasStoryMessagesBeyondOpening.value),
  );

  const latestUserItem = computed(() => {
    for (let i = transcript.value.length - 1; i >= 0; i -= 1) {
      const item = transcript.value[i];
      if (item.role === 'user') return item;
    }
    return null;
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
    const containerId = readCurrentContainerMessageId();
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

  const latestAssistantSwipeState = computed(() => {
    try {
      const list = getChatMessages('0-{{lastMessageId}}', { include_swipes: true, hide_state: 'all' }) as any[];
      const messages = Array.isArray(list) ? list : [];

      for (let indexFromEnd = messages.length - 1; indexFromEnd >= 0; indexFromEnd -= 1) {
        const message = messages[indexFromEnd];
        const messageId = Math.trunc(Number(message?.message_id));
        if (!Number.isFinite(messageId)) continue;
        if (((message?.role as string) || 'assistant') !== 'assistant') continue;

        const swipes = Array.isArray(message?.swipes) ? message.swipes : [];
        const count = swipes.length;
        if (count <= 1) continue;

        const rawIndex = Number(message?.swipe_id);
        const index = Number.isFinite(rawIndex) ? Math.min(Math.max(Math.trunc(rawIndex), 0), count - 1) : count - 1;
        return {
          messageId,
          count,
          index,
          canPrev: index > 0,
          canNext: index < count - 1,
        };
      }

      return { messageId: null as number | null, count: 0, index: 0, canPrev: false, canNext: false };
    } catch {
      return { messageId: null as number | null, count: 0, index: 0, canPrev: false, canNext: false };
    }
  });

  const latestAssistantSwipeMessageId = computed(() => latestAssistantSwipeState.value.messageId);
  const canSwipeLatestAssistantPrev = computed(() => latestAssistantSwipeState.value.canPrev);
  const canSwipeLatestAssistantNext = computed(() => latestAssistantSwipeState.value.canNext);
  const latestAssistantSwipeLabel = computed(() => {
    const swipeState = latestAssistantSwipeState.value;
    if (swipeState.messageId == null || swipeState.count <= 1) return '';
    return `${swipeState.index + 1}/${swipeState.count}`;
  });

  const readerSummary = computed<ReaderSummary>(() => {
    const turnCount = transcript.value.filter(item => item.role === 'assistant' && !item.isOpening).length;
    const latestUserPreview = latestUserItem.value?.preview ?? '';
    const latestAssistantPreview = latestAssistantItem.value?.preview ?? '';
    const assistantAnchorLabel = assistantMessageId.value != null ? `#${assistantMessageId.value}` : '-';
    const storySummary = (() => {
      const source = latestAssistantItem.value?.preview || transcript.value.find(item => item.isOpening)?.preview || '';
      return source.slice(0, 120);
    })();

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
      ...(shouldResetResult ? { result: null } : {}),
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
      ...(shouldResetResult ? { result: null } : {}),
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
      ...(shouldResetResult ? { result: null } : {}),
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

  function clearOpeningGenerationListeners() {
    openingGenerationStops.forEach(stop => stop?.stop?.());
    openingGenerationStops = [];
  }

  function bindOpeningGenerationListeners() {
    clearOpeningGenerationListeners();
    let streamedRaw = '';
    let hasFullStreamEvent = false;

    try {
      openingGenerationStops.push(
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY as any, (text: string) => {
          hasFullStreamEvent = true;
          streamedRaw = String(text ?? '');
          status.value = 'streaming';
          openingPayload.value = {
            ...openingPayload.value,
            state: 'generating',
            result: {
              raw: streamedRaw,
              content: streamedRaw,
              options: extractOpeningOptions(streamedRaw),
              generated_at: String(openingPayload.value.result?.generated_at ?? ''),
            },
          };
          rebuildTranscript();
        }),
      );
    } catch {
      // ignore
    }

    try {
      openingGenerationStops.push(
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY as any, (token: string) => {
          if (hasFullStreamEvent) return;
          streamedRaw += String(token ?? '');
          status.value = 'streaming';
          openingPayload.value = {
            ...openingPayload.value,
            state: 'generating',
            result: {
              raw: streamedRaw,
              content: streamedRaw,
              options: extractOpeningOptions(streamedRaw),
              generated_at: String(openingPayload.value.result?.generated_at ?? ''),
            },
          };
          rebuildTranscript();
        }),
      );
    } catch {
      // ignore
    }
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
      ...(shouldResetResult ? { result: null } : {}),
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

  function collectHostDocuments(): Document[] {
    const docs: Document[] = [];
    const push = (doc: Document | null | undefined) => {
      if (!doc || docs.includes(doc)) return;
      docs.push(doc);
    };

    push(document);
    try {
      push(window.parent?.document);
    } catch {
      // ignore
    }
    try {
      push(window.top?.document);
    } catch {
      // ignore
    }
    return docs;
  }

  function setHostTranscriptVisibility(active: boolean) {
    for (const doc of collectHostDocuments()) {
      const body = doc.body;
      const head = doc.head;
      if (!body || !head) continue;

      const existing = doc.getElementById(HOST_VISIBILITY_STYLE_ID);
      if (active) {
        if (!existing) {
          const style = doc.createElement('style');
          style.id = HOST_VISIBILITY_STYLE_ID;
          style.textContent = `
            body.${HOST_VISIBILITY_CLASS} #chat > .mes[mesid]:not([mesid='0']) {
              position: absolute !important;
              left: -200vw !important;
              top: 0 !important;
              width: 1px !important;
              max-width: 1px !important;
              height: 1px !important;
              max-height: 1px !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              opacity: 0 !important;
              pointer-events: none !important;
              clip: rect(0 0 0 0) !important;
              clip-path: inset(50%) !important;
            }
          `;
          head.appendChild(style);
        }
        body.classList.add(HOST_VISIBILITY_CLASS);
      } else {
        body.classList.remove(HOST_VISIBILITY_CLASS);
        existing?.remove();
      }
    }
  }

  async function syncOpeningAssistantMessage(refresh: HideRefreshMode = 'none', createIfMissing = true) {
    if (readCurrentContainerMessageId() !== 0) return;
    if (openingPayload.value.state !== 'ready') return;

    const nextMessage = buildOpeningAssistantText(openingPayload.value);
    if (!nextMessage) return;
    const resultId = await upsertOpeningResultMessage(nextMessage, refresh, createIfMissing);
    if (!createIfMissing && resultId == null) return;
    if (resultId != null) {
      openingPayload.value = {
        ...openingPayload.value,
        opening_result_message_id: resultId,
      };
      persistOpeningPayloadNow();
    }
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
  }

  async function emitOfficialGenerationLifecycle(messageId: number | null | undefined, type: 'normal' | 'regenerate') {
    const normalizedId = Number(messageId);
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;

    try {
      await eventEmit(tavern_events.MESSAGE_RECEIVED as any, Math.trunc(normalizedId), type);
    } catch {
      // ignore
    }

    try {
      await eventEmit(tavern_events.GENERATION_ENDED as any, Math.trunc(normalizedId));
    } catch {
      // ignore
    }

    try {
      await eventEmit(tavern_events.MESSAGE_UPDATED as any, Math.trunc(normalizedId));
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
    transcript.value = syncTranscriptFlags(sortTranscriptItems([...current, nextItem]));
    if (selectedItem.value?.message_id === nextItem.message_id) {
      selectedItem.value = transcript.value.find(item => item.message_id === nextItem.message_id) ?? null;
    }
  }

  function readMessagesAfterContainer(): BaseChatMessage[] {
    const containerId = readCurrentContainerMessageId();
    try {
      const list = getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' }) as any[];
      return (Array.isArray(list) ? list : [])
        .map(message => ({
          message_id: Math.trunc(Number(message?.message_id)),
          role: ((message?.role as string) || 'assistant') as BaseChatMessage['role'],
          message: String(message?.message ?? ''),
          is_hidden: message?.is_hidden === true,
        }))
        .filter(item => Number.isFinite(item.message_id) && (containerId == null || item.message_id > containerId));
    } catch {
      return [];
    }
  }

  function resolveHidePolicyRefresh(reason: string): HideRefreshMode {
    if (reason === 'mounted') return 'affected';
    if (reason.startsWith('external:chat_id_changed')) return 'affected';
    if (reason.startsWith('external:message_sent')) return 'affected';
    if (reason.startsWith('external:message_received')) return 'affected';
    if (reason.startsWith('external:more_messages_loaded')) return 'affected';
    return 'none';
  }

  function resolveHidePolicyDelay(reason: string): number {
    return resolveHidePolicyRefresh(reason) === 'affected' ? 0 : 80;
  }

  async function applyHidePolicy(reason: string) {
    if (!isOpeningWorkbenchHost || readCurrentContainerMessageId() !== 0) return;
    setHostTranscriptVisibility(true);
    if (hidePolicyRunning) {
      hidePolicyRerun = true;
      return;
    }
    hidePolicyRunning = true;
    try {
      do {
        hidePolicyRerun = false;
        const refresh = resolveHidePolicyRefresh(reason);
        const patch = readMessagesAfterContainer()
          .filter(item => item.is_hidden === true)
          .map(item => ({ message_id: item.message_id, is_hidden: false }));
        if (patch.length === 0) continue;
        await setChatMessages(patch, { refresh });
      } while (hidePolicyRerun);
    } catch (error) {
      console.warn('[stream-demo] hide policy failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      hidePolicyRunning = false;
    }
  }

  function queueHidePolicy(reason: string) {
    if (hidePolicyTimer) window.clearTimeout(hidePolicyTimer);
    hidePolicyTimer = window.setTimeout(() => {
      hidePolicyTimer = 0;
      void applyHidePolicy(reason);
    }, resolveHidePolicyDelay(reason));
  }

  function queueExternalSync(reason: string) {
    if (externalSyncTimer) window.clearTimeout(externalSyncTimer);
    const scopedReason = `external:${reason}`;
    externalSyncTimer = window.setTimeout(() => {
      externalSyncTimer = 0;
      rebuildTranscript();
      queueHidePolicy(scopedReason);
    }, resolveHidePolicyDelay(scopedReason));
  }

  function scheduleUiRefresh(domains: RefreshDomain[], reason: string) {
    if (domains.includes('mvuSources')) {
      mvuSourceRevision.value += 1;
    }

    if (domains.includes('transcript')) {
      queueExternalSync(reason);
      return;
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

  function markRecentImageIntent(messageId: number, source: 'transcript' | 'gallery' = 'transcript') {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;
    imageRecentIntentStore.mark(normalizedId, source);
    logImageBridge('mark-intent', {
      messageId: normalizedId,
      source,
      intent: imageRecentIntentStore.read(),
    });
  }

  async function persistGeneratedImageResponse(result: {
    messageId: number;
    requestId: string;
    prompt: string;
    promptToken: string;
    imageData: string;
  }) {
    const fullMessage = readChatMessageDetail(result.messageId);
    if (!fullMessage) {
      logImageBridge('persist-skip-missing-message', {
        messageId: result.messageId,
        requestId: result.requestId,
        promptToken: result.promptToken,
      });
      return;
    }

    logImageBridge('persist-begin', {
      messageId: result.messageId,
      requestId: result.requestId,
      promptToken: result.promptToken,
      hasExtraImages: Array.isArray(fullMessage?.extra?.images),
      previousGeneratedCount: Array.isArray(fullMessage?.data?.stream_demo?.generated_images)
        ? fullMessage.data.stream_demo.generated_images.length
        : 0,
    });

    const patch = buildGeneratedImagePersistencePatch({
      message: fullMessage,
      response: {
        requestId: result.requestId,
        prompt: result.prompt,
        promptToken: result.promptToken,
        imageData: result.imageData,
      },
    });

    await setChatMessages(
      [
        {
          message_id: result.messageId,
          data: patch.nextData,
          extra: patch.nextExtra,
        } as any,
      ],
      { refresh: 'affected' },
    );

    logImageBridge('persist-success', {
      messageId: result.messageId,
      requestId: result.requestId,
      promptToken: result.promptToken,
      generatedCount: Array.isArray(patch.nextData?.stream_demo?.generated_images)
        ? patch.nextData.stream_demo.generated_images.length
        : 0,
      extraImagesShape: Array.isArray(patch.nextExtra?.images)
        ? patch.nextExtra.images.map((item: unknown) => (Array.isArray(item) ? item.length : 0))
        : [],
    });

    scheduleUiRefresh(['transcript', 'gallery'], `image:persist:${result.messageId}`);
  }

  function bindImagePersistenceEvents() {
    if (!isOpeningWorkbenchHost) return;
    if (typeof eventOn !== 'function') return;

    const bind = (eventName: string, listener: (...args: any[]) => void) => {
      try {
        return eventOn(eventName as any, listener as any);
      } catch {
        return null;
      }
    };

    imageBridgeStops = [
      bind('generate-image-request', (payload: Record<string, unknown>) => {
        let requestBinding: ImageRequestBindingResult = imagePendingTaskManager.registerRequest(payload ?? {});
        let targetMessageId = requestBinding?.messageId ?? null;
        if (targetMessageId == null) {
          const recentIntent = imageRecentIntentStore.read();
          if (recentIntent) {
            imagePendingTaskManager.startTask(recentIntent.messageId);
            requestBinding = imagePendingTaskManager.registerRequest(payload ?? {});
            targetMessageId = requestBinding?.messageId ?? null;
            logImageBridge('request-fallback-intent', {
              requestId: String(payload?.id ?? '').trim(),
              recentIntent,
              reboundMessageId: targetMessageId,
              tasks: imagePendingTaskManager.getDebugState(),
            });
          }
        }
        if (targetMessageId == null) {
          const domResolvedMessageId = resolveImageRequestTargetMessageId({
            prompt: String(payload?.prompt ?? ''),
            listButtons: () =>
              Array.from(document.querySelectorAll('.st-chatu8-image-button')) as Array<{
                getAttribute: (name: string) => string | null;
                closest: (selector: string) => { dataset?: Record<string, unknown> } | null;
              }>,
            listTokenMarkers: () =>
              Array.from(
                document.querySelectorAll(
                  '.assistant-image-prompt-token, [data-prompt-token], .mes[mesid] [data-prompt-token]',
                ),
              ) as Array<{
                getAttribute: (name: string) => string | null;
                closest: (
                  selector: string,
                ) => { dataset?: Record<string, unknown>; getAttribute?: (name: string) => string | null } | null;
                textContent?: string | null;
              }>,
          });
          if (domResolvedMessageId != null) {
            imagePendingTaskManager.startTask(domResolvedMessageId);
            requestBinding = imagePendingTaskManager.registerRequest(payload ?? {});
            targetMessageId = requestBinding?.messageId ?? null;
            logImageBridge('request-fallback-dom', {
              requestId: String(payload?.id ?? '').trim(),
              domResolvedMessageId,
              reboundMessageId: targetMessageId,
              tasks: imagePendingTaskManager.getDebugState(),
            });
          }
        }
        logImageBridge('request-received', {
          requestId: String(payload?.id ?? '').trim(),
          promptPreview: String(payload?.prompt ?? '')
            .trim()
            .slice(0, 120),
          targetMessageId,
          tasks: imagePendingTaskManager.getDebugState(),
        });

        if (requestBinding?.bufferedResponse) {
          logImageBridge('request-replay-buffered-response', {
            messageId: requestBinding.bufferedResponse.messageId,
            requestId: requestBinding.bufferedResponse.requestId,
            promptToken: requestBinding.bufferedResponse.promptToken,
          });

          void persistGeneratedImageResponse(requestBinding.bufferedResponse).catch(error => {
            logImageBridge('persist-failed', {
              messageId: requestBinding?.bufferedResponse?.messageId ?? null,
              requestId: requestBinding?.bufferedResponse?.requestId ?? '',
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      }),
      bind('generate-image-response', (payload: Record<string, unknown>) => {
        const imageData = String(payload?.imageData ?? payload?.image ?? '').trim();
        if (!imageData) {
          logImageBridge('response-skip-empty-image', {
            requestId: String(payload?.id ?? '').trim(),
            promptPreview: String(payload?.prompt ?? '')
              .trim()
              .slice(0, 120),
          });
          return;
        }
        const matched = imagePendingTaskManager.consumeResponse({
          id: payload?.id,
          prompt: payload?.prompt,
          imageData,
        });
        if (!matched) {
          logImageBridge('response-unmatched', {
            requestId: String(payload?.id ?? '').trim(),
            promptPreview: String(payload?.prompt ?? '')
              .trim()
              .slice(0, 120),
            tasks: imagePendingTaskManager.getDebugState(),
          });
          return;
        }

        logImageBridge('response-matched', {
          messageId: matched.messageId,
          requestId: matched.requestId,
          promptToken: matched.promptToken,
        });

        void persistGeneratedImageResponse(matched).catch(error => {
          logImageBridge('persist-failed', {
            messageId: matched.messageId,
            requestId: matched.requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }),
    ].filter(Boolean) as StopHandle[];
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
    try {
      const list = getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' }) as any[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function findFirstChatIdAfterZero(messages: any[]) {
    return messages.map(message => Math.trunc(Number(message?.message_id))).find(id => Number.isFinite(id) && id > 0);
  }

  function readMessageId(message: any): number | null {
    const id = Math.trunc(Number(message?.message_id));
    return Number.isFinite(id) ? id : null;
  }

  function findFirstStoryChatIdAfterOpening(messages: any[]) {
    for (const message of messages) {
      const id = readMessageId(message);
      if (id == null || id <= 0) continue;
      if (isOpeningSeedMessage(message)) continue;
      return id;
    }
    return null;
  }

  function findOpeningSeedChatMessage(messages: any[]) {
    const preferredId = Math.trunc(Number(openingPayload.value.opening_seed_user_message_id));
    if (Number.isFinite(preferredId) && preferredId > 0) {
      const matched = messages.find(message => readMessageId(message) === preferredId && isOpeningSeedMessage(message));
      if (matched) return matched;
    }
    return messages.find(message => isOpeningSeedMessage(message));
  }

  function findOpeningResultChatMessage(messages: any[]) {
    const preferredId = Math.trunc(Number(openingPayload.value.opening_result_message_id));
    if (Number.isFinite(preferredId) && preferredId > 0) {
      const matched = messages.find(
        message => readMessageId(message) === preferredId && isOpeningAssistantMessage(message),
      );
      if (matched) return matched;
    }
    return messages.find(message => isOpeningAssistantMessage(message));
  }

  function canRerollOpeningFromMessages(messages: any[]) {
    const resultId = readMessageId(findOpeningResultChatMessage(messages));
    if (resultId == null || resultId <= 0) return false;
    return !messages.some(message => {
      const id = readMessageId(message);
      if (!Number.isFinite(id) || id <= resultId) return false;
      if (isOpeningSeedMessage(message) || isOpeningAssistantMessage(message)) return false;
      return true;
    });
  }

  async function upsertOpeningSeedMessage(prompt: string, refresh: HideRefreshMode = 'none') {
    const messages = listAllChatMessages();
    const existing = findOpeningSeedChatMessage(messages);
    const nextData = existing?.data ? _.cloneDeep(existing.data) : {};
    _.set(nextData, 'stream_demo.opening_seed', true);

    if (existing) {
      const message_id = Math.trunc(Number(existing?.message_id));
      await setChatMessages([{ message_id, role: 'user', message: prompt, is_hidden: false, data: nextData }], {
        refresh,
      });
      return message_id;
    }

    const firstAfterZero = findFirstChatIdAfterZero(messages);
    await createChatMessages([{ role: 'user', is_hidden: false, message: prompt, data: nextData }], {
      insert_before: firstAfterZero ?? 'end',
      refresh,
    });
    const created = listAllChatMessages().find(
      message => isOpeningSeedMessage(message) && String(message?.message ?? '') === prompt,
    );
    return readMessageId(created);
  }

  async function upsertOpeningResultMessage(
    message: string,
    refresh: HideRefreshMode = 'none',
    createIfMissing = true,
  ) {
    const messages = listAllChatMessages();
    const existing = findOpeningResultChatMessage(messages);
    const nextData = existing?.data ? _.cloneDeep(existing.data) : {};
    _.set(nextData, 'stream_demo.opening_assistant', true);

    if (existing) {
      const message_id = Math.trunc(Number(existing?.message_id));
      await setChatMessages([{ message_id, role: 'assistant', message, is_hidden: false, data: nextData }], {
        refresh,
      });
      return message_id;
    }

    if (!createIfMissing) return null;

    const firstStoryMessageId = findFirstStoryChatIdAfterOpening(messages);
    await createChatMessages([{ role: 'assistant', is_hidden: false, message, data: nextData }], {
      insert_before: firstStoryMessageId ?? 'end',
      refresh,
    });
    const created = listAllChatMessages().find(
      item => isOpeningAssistantMessage(item) && String(item?.message ?? '') === message,
    );
    return readMessageId(created);
  }

  async function normalizeOpeningMessageOrder(refresh: HideRefreshMode = 'none') {
    const currentMessages = listAllChatMessages();
    const currentSeedId = readMessageId(findOpeningSeedChatMessage(currentMessages));
    const currentResultId = readMessageId(findOpeningResultChatMessage(currentMessages));

    if (
      currentSeedId != null &&
      currentResultId != null &&
      currentSeedId > 0 &&
      currentResultId > 0 &&
      currentSeedId > currentResultId
    ) {
      await rotateChatMessages(currentResultId, currentSeedId, currentSeedId + 1, { refresh });
    }

    const nextMessages = listAllChatMessages();
    return {
      seedMessageId: readMessageId(findOpeningSeedChatMessage(nextMessages)),
      resultMessageId: readMessageId(findOpeningResultChatMessage(nextMessages)),
    };
  }

  async function syncOpeningConfigToResultMvu(messageId: number | null | undefined) {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;
    if (typeof waitGlobalInitialized !== 'function' || typeof Mvu === 'undefined') return;

    try {
      await waitGlobalInitialized('Mvu');
      const current = Mvu.getMvuData({ type: 'message', message_id: normalizedId });
      const next = current && typeof current === 'object' ? _.cloneDeep(current) : ({ stat_data: {} } as any);
      const stat_data =
        _.get(next, 'stat_data', null) && typeof _.get(next, 'stat_data', null) === 'object'
          ? (_.get(next, 'stat_data', {}) as Record<string, unknown>)
          : {};

      const openingShelterSummary = String(openingPayload.value.form_values?.shelter_ability_summary ?? '').trim();

      if (!_.get(stat_data, '庇护所') || typeof _.get(stat_data, '庇护所') !== 'object') {
        _.set(stat_data, '庇护所', {});
      }
      if (!Number.isFinite(Number(_.get(stat_data, '庇护所.庇护所等级', null)))) {
        _.set(stat_data, '庇护所.庇护所等级', 1);
      }
      if (openingShelterSummary) {
        _.set(stat_data, '庇护所.庇护所能力总述', openingShelterSummary);
      }

      _.set(stat_data, '世界.开局配置', {
        sealed: true,
        world_mode_id: String(openingPayload.value.world_mode_id ?? '').trim(),
        route_id: String(openingPayload.value.route_id ?? '').trim(),
        pre_disaster_identity: String(openingPayload.value.form_values?.pre_disaster_identity ?? '').trim(),
        early_story_tone: String(openingPayload.value.form_values?.early_story_tone ?? '').trim(),
        opening_seed_user_message_id:
          Number.isFinite(Number(openingPayload.value.opening_seed_user_message_id)) &&
          Number(openingPayload.value.opening_seed_user_message_id) > 0
            ? Math.trunc(Number(openingPayload.value.opening_seed_user_message_id))
            : 0,
        opening_result_message_id: normalizedId,
        form_values: {
          supplemental_setting: String(openingPayload.value.form_values?.supplemental_setting ?? '').trim(),
        },
        meta: {
          source: 'opening_ui',
          version: 1,
        },
      });

      _.set(next, 'stat_data', stat_data);
      await Mvu.replaceMvuData(next as any, { type: 'message', message_id: normalizedId });
    } catch (error) {
      console.warn('[stream-demo] opening config -> mvu sync failed', {
        messageId: normalizedId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleHostRefreshEvent(name: string) {
    if (
      busy.value &&
      (name === tavern_events.GENERATION_STARTED ||
        name === tavern_events.STREAM_TOKEN_RECEIVED ||
        name === tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED)
    ) {
      status.value = 'streaming';
      queuePersistReaderChatState();
    }

    const domains = resolveRefreshDomainsForEvent({
      type: mapHostRefreshType(name),
    });
    scheduleUiRefresh(domains, `event:${name}`);
  }

  async function bindMvuRefreshEvents() {
    if (!isOpeningWorkbenchHost) return;
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

  function rebuildTranscript() {
    const containerId = readCurrentContainerMessageId();
    try {
      const list = getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' }) as any[];
      const all = Array.isArray(list) ? list : [];
      const normalized: TranscriptItem[] = [];
      let nextLatestAssistantId: number | null = null;

      if (containerId === 0) {
        const hasPersistedOpeningResult =
          Number.isFinite(Number(openingPayload.value.opening_result_message_id)) &&
          Number(openingPayload.value.opening_result_message_id) > 0;

        if (openingPayload.value.state !== 'placeholder' && !hasPersistedOpeningResult) {
          normalized.push(buildOpeningTranscriptItem(openingPayload.value, openingPreset.value, status.value));
        } else {
          const opening = all.find(message => Math.trunc(Number(message?.message_id)) === containerId);
          if (opening) {
            const openingRole = ((opening?.role as string) || 'assistant') as TranscriptItem['role'];
            if (openingRole === 'assistant') nextLatestAssistantId = containerId;
            normalized.push(
              buildTranscriptItem({
                id: containerId,
                role: openingRole,
                raw: String(opening?.message ?? ''),
                hidden: opening?.is_hidden === true,
                isOpening: true,
                latestAssistantId: null,
                status: status.value,
              }),
            );
          }
        }
      }

      for (const message of all) {
        const message_id = Number(message?.message_id);
        if (!Number.isFinite(message_id)) continue;
        const id = Math.trunc(message_id);
        if (containerId != null && id <= containerId) continue;
        if (isOpeningSeedMessage(message)) continue;
        const role = ((message?.role as string) || 'assistant') as TranscriptItem['role'];
        const isOpeningResult = isOpeningAssistantMessage(message);
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
      transcript.value = syncTranscriptFlags(normalized);
      if (selectedItem.value) {
        selectedItem.value = transcript.value.find(item => item.message_id === selectedItem.value?.message_id) ?? null;
      }
    } catch {
      transcript.value = [];
    }
    galleryRevision.value += 1;
    queueHidePolicy('rebuild');
    queuePersistReaderChatState();
  }

  async function patchAssistantMessage(phase: 'stream' | 'done') {
    const messageId = assistantMessageId.value;
    if (messageId == null) return;

    const nextMessage = buildStreamDemoMessage(
      phase === 'done' ? finalText.value || streamText.value : streamText.value,
      phase,
    );
    if (nextMessage === latestPatchedMessage) return;
    latestPatchedMessage = nextMessage;

    patchQueue = patchQueue.then(async () => {
      await setChatMessages([{ message_id: messageId, message: nextMessage, is_hidden: false }], { refresh: 'none' });
      upsertTranscriptItem(
        createLocalTranscriptItem({
          id: messageId,
          role: 'assistant',
          raw: nextMessage,
          hidden: false,
        }),
      );
    });
    await patchQueue;
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

  async function runGenerationFlow(options: { prompt: string; createUser: boolean }) {
    const prompt = String(options.prompt ?? '').trim();
    if (!prompt || busy.value) return;

    busy.value = true;
    status.value = 'preparing';
    streamText.value = '';
    finalText.value = '';
    errorText.value = '';
    assistantMessageId.value = null;
    latestPatchedMessage = '';
    bindGenerationEvents();

    try {
      if (options.createUser) {
        await createChatMessages([{ role: 'user', message: prompt, is_hidden: false }], { refresh: 'none' });
        const userId = Number(getLastMessageId?.());
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

      const generatePromise = generate({
        should_stream: true,
        max_chat_history: 'all',
      });
      await createAssistantPlaceholder();
      readingMode.value = 'following_latest';

      const result = String(await generatePromise).trim();
      finalText.value = result;
      status.value = 'persisting';
      await patchAssistantMessage('done');
      if (assistantMessageId.value != null) {
        const reprocessResult = await reprocessMessageVariablesById(assistantMessageId.value, {
          force: true,
          refreshMessage: true,
        });
        if (reprocessResult.status === 'error') {
          console.warn('[stream-demo] direct MVU reprocess failed', reprocessResult);
        }
      }
      await emitOfficialGenerationLifecycle(assistantMessageId.value, options.createUser ? 'normal' : 'regenerate');
      status.value = 'done';
      transcript.value = syncTranscriptFlags(transcript.value);
      queueHidePolicy('generation_done');
      appendLog('action', '生成完成', stripTagsForPreview(result).slice(0, 80) || '(空回复)');
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
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
    } finally {
      clearGenerationListeners();
      busy.value = false;
    }
  }

  async function triggerNativeRegenerate(anchorMessageId: number) {
    const latestUser = latestUserItem.value;
    if (busy.value) return;
    if (!latestUser || latestUser.role !== 'user' || latestUser.message_id !== anchorMessageId) {
      toastr?.warning?.('未定位到最后一条 user，无法重生');
      return;
    }

    readingMode.value = 'following_latest';
    queuePersistReaderChatState();
    appendLog('action', '重新生成', `已按楼层 #${anchorMessageId} 走受控 hidden 链重生`);
    await runGenerationFlow({ prompt: latestUser.raw, createUser: false });
  }

  async function rollLatestTurn() {
    const latestUser = latestUserItem.value;
    if (!latestUser || latestUser.role !== 'user') {
      toastr?.info?.('当前还没有可重新生成的 user 楼层');
      return;
    }
    await triggerNativeRegenerate(latestUser.message_id);
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
      busy.value = false;
      toastr?.error?.(`改词失败：${errorText.value}`);
      appendLog('error', '改词失败', errorText.value || '未知错误');
      return;
    }

    busy.value = false;
    await triggerNativeRegenerate(targetId);
  }

  async function confirmRollbackDelete(item: TranscriptItem) {
    if (rollbackConfirmMessageId.value !== item.message_id) {
      rollbackConfirmMessageId.value = item.message_id;
      return;
    }
    await deleteFromMessageId(item.message_id);
  }

  async function swipeLatestAssistant(direction: 'prev' | 'next') {
    const swipeState = latestAssistantSwipeState.value;
    const messageId = swipeState.messageId;
    if (messageId == null) {
      toastr?.info?.('当前最新 assistant 没有可切换的 swipe');
      return;
    }
    if (direction === 'prev' && !canSwipeLatestAssistantPrev.value) return;
    if (direction === 'next' && !canSwipeLatestAssistantNext.value) return;
    const nextSwipeId = direction === 'prev' ? swipeState.index - 1 : swipeState.index + 1;
    if (nextSwipeId < 0 || nextSwipeId >= swipeState.count) return;
    await setChatMessages([{ message_id: messageId, swipe_id: nextSwipeId, is_hidden: false }], { refresh: 'none' });
    appendLog('action', '切换 Swipe', `${direction === 'prev' ? '切到上一页' : '切到下一页'}（楼层 #${messageId}）`);
    rebuildTranscript();
    queueHidePolicy(`swipe:${direction}`);
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

    busy.value = true;
    status.value = 'preparing';
    errorText.value = '';
    const compiledPrompt = buildOpeningCompiledUserInput(openingPreset.value, openingPayload.value);
    const messages = listAllChatMessages();
    const resultId = readMessageId(findOpeningResultChatMessage(messages));
    const hasFollowUpTurns =
      resultId != null &&
      resultId > 0 &&
      messages.some(message => {
        const id = readMessageId(message);
        if (!Number.isFinite(id) || id <= resultId) return false;
        if (isOpeningSeedMessage(message) || isOpeningAssistantMessage(message)) return false;
        return true;
      });

    if (hasFollowUpTurns) {
      busy.value = false;
      status.value = 'idle';
      toastr?.warning?.('已有正式剧情楼层，暂不支持在此阶段重ROLL开局');
      return;
    }

    const seedMessageId = await upsertOpeningSeedMessage(compiledPrompt, 'none');
    const { seedMessageId: normalizedSeedMessageId, resultMessageId: normalizedResultMessageId } =
      await normalizeOpeningMessageOrder('none');

    openingPayload.value = {
      ...openingPayload.value,
      state: 'generating',
      opening_seed_user_message_id: normalizedSeedMessageId ?? seedMessageId,
      opening_result_message_id: normalizedResultMessageId,
      result: null,
    };
    persistOpeningPayloadNow();
    rebuildTranscript();

    try {
      if (openingPayload.value.use_stream) {
        bindOpeningGenerationListeners();
      }
      const result = await generate(buildOpeningGenerateConfig(openingPreset.value, openingPayload.value));
      const nextResult = {
        raw: String(result ?? '').trim(),
        content: extractOpeningContent(result),
        options: extractOpeningOptions(result),
        generated_at: new Date().toISOString(),
      };
      openingPayload.value = {
        ...openingPayload.value,
        state: 'ready',
        result: nextResult,
      };
      await upsertOpeningResultMessage(buildOpeningAssistantText(openingPayload.value), 'none');
      const { seedMessageId: normalizedSeedMessageId, resultMessageId: openingResultMessageId } =
        await normalizeOpeningMessageOrder('none');
      openingPayload.value = {
        ...openingPayload.value,
        state: 'ready',
        opening_seed_user_message_id: normalizedSeedMessageId,
        opening_result_message_id: openingResultMessageId,
        result: nextResult,
      };
      persistOpeningPayloadNow();
      await syncOpeningConfigToResultMvu(openingResultMessageId);
      rebuildTranscript();
      status.value = 'done';
      appendLog(
        'action',
        '生成开局',
        stripTagsForPreview(openingPayload.value.result?.content ?? '').slice(0, 80) || '(空开局)',
      );
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      openingPayload.value = {
        ...openingPayload.value,
        state: 'configuring',
      };
      persistOpeningPayloadNow();
      toastr?.error?.(`开局生成失败：${errorText.value}`);
    } finally {
      clearOpeningGenerationListeners();
      busy.value = false;
    }
  }

  async function rerollOpening() {
    if (busy.value) return;
    if (!openingPayload.value.opening_seed_user_message_id) {
      toastr?.info?.('当前还没有可重ROLL的开局 seed');
      return;
    }
    await generateOpening();
  }

  function bindHistoryRefreshEvents() {
    if (!isOpeningWorkbenchHost) return;
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
        return eventOn(name as any, () => handleHostRefreshEvent(String(name)));
      } catch {
        return null;
      }
    });
  }

  function bindGenerationEvents() {
    clearGenerationListeners();
    if (typeof eventOn !== 'function' || typeof iframe_events === 'undefined') return;

    try {
      generationStops.push(
        eventOn(iframe_events.GENERATION_STARTED as any, () => {
          status.value = 'streaming';
          transcript.value = syncTranscriptFlags(transcript.value);
        }),
      );
    } catch {
      // ignore
    }

    try {
      generationStops.push(
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY as any, (token: string) => {
          streamText.value += String(token ?? '');
          status.value = 'streaming';
          void patchAssistantMessage('stream');
        }),
      );
    } catch {
      // ignore
    }

    try {
      generationStops.push(
        eventOn(iframe_events.GENERATION_ENDED as any, (text: string) => {
          finalText.value = String(text ?? '').trim();
        }),
      );
    } catch {
      // ignore
    }
  }

  async function createAssistantPlaceholder() {
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
    await patchAssistantMessage('stream');
  }

  async function runDemo(nextPrompt?: string) {
    if (shouldLoadOpeningGenerator(openingPayload.value, hasStoryMessagesBeyondOpening.value)) {
      toastr?.info?.('请先完成开局配置并生成 opening');
      return;
    }
    const prompt = String(nextPrompt ?? input.value ?? '').trim();
    await runGenerationFlow({ prompt, createUser: true });
    if (nextPrompt == null || prompt === String(input.value ?? '').trim()) {
      input.value = '';
    }
  }

  onMounted(() => {
    restoreReaderChatState();
    void syncOpeningAssistantMessage('none', false);
    rebuildTranscript();
    if (isOpeningWorkbenchHost) {
      bindHistoryRefreshEvents();
      void bindMvuRefreshEvents();
      bindImagePersistenceEvents();
      queueHidePolicy('mounted');
    }
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

  onBeforeUnmount(() => {
    if (isOpeningWorkbenchHost) {
      setHostTranscriptVisibility(false);
    }
    clearGenerationListeners();
    historyStops.forEach(stop => stop?.stop?.());
    historyStops = [];
    imageBridgeStops.forEach(stop => stop?.stop?.());
    imageBridgeStops = [];
    mvuStops.forEach(stop => stop?.stop?.());
    mvuStops = [];
    if (hidePolicyTimer) {
      window.clearTimeout(hidePolicyTimer);
      hidePolicyTimer = 0;
    }
    if (externalSyncTimer) {
      window.clearTimeout(externalSyncTimer);
      externalSyncTimer = 0;
    }
    if (readerStatePersistTimer) {
      window.clearTimeout(readerStatePersistTimer);
      readerStatePersistTimer = 0;
    }
    if (openingPayloadPersistTimer) {
      window.clearTimeout(openingPayloadPersistTimer);
      openingPayloadPersistTimer = 0;
    }
    clearOpeningGenerationListeners();
  });

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
    openingExpanded,
    selectedItem,
    transcript,
    visibleTranscript,
    transcriptStats,
    galleryEntries,
    mvuSourceRevision,
    latestUserItem,
    latestAssistantItem,
    inputHasText,
    editingUserMessageId,
    editingUserDraft,
    rollbackConfirmMessageId,
    latestAssistantSwipeMessageId,
    canSwipeLatestAssistantPrev,
    canSwipeLatestAssistantNext,
    latestAssistantSwipeLabel,
    openingPreset,
    openingPayload,
    openingWorldModes,
    openingRoutes,
    shouldShowOpeningSetup,
    readerSummary,
    logs,
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
    swipeLatestAssistant,
    setReadingMode,
    toggleOpeningExpanded,
    rebuildTranscript,
    openDetail,
    closeDetail,
  };
}

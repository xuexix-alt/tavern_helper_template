import _ from 'lodash';
import { retryMessageExtraAnalysisByNativeMvu } from '../../../mvu_reprocess';
import { CHAT_VAR_KEYS } from '../../../界面/outbound';
import {
  STREAM_DEMO_MARKER,
  buildStreamDemoMessage,
  extractStreamDemoContent,
  extractStreamDemoOptions,
  extractStreamDemoPhase,
  isStreamDemoMessage,
  stripStreamDemoRuntimeTags,
  stripTagsForPreview,
} from '../../shared/message';
import {
  buildOpeningPromptContext,
  compileOpeningPromptTemplate,
  extractOpeningContentLoose,
  extractOpeningOptions,
  getDefaultOpeningPayload,
  getDefaultOpeningPreset,
  getEffectiveDefaultMeta,
  getEffectiveFormSchema,
  getOpeningRoute,
  getOpeningRoutes,
  getOpeningWorldMode,
  getOpeningWorldModes,
  readOpeningPayloadFromChat,
  replaceOpeningPayloadInChat,
  resolveOpeningPromptTemplateRaw,
} from '../../shared/opening';
import type { OpeningPayload, OpeningPreset } from '../../shared/opening.schema';
import { resolveAssistantMessageRefreshMode } from './assistantMessageRefreshMode';
import { stripVisibleChatu8PromptTokensHtml } from './chatu8PromptTokenDisplay';
import { isOpeningWorkbenchScopeActive, resolveActiveContainerMessageId } from './containerScope';
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
import { buildGeneratedImageEntities, filterReadyGeneratedImageEntities } from './generatedImageEntities';
import { bumpGeneratedImageEntityRevision } from './generatedImageEntityRevision';
import { shouldInjectTranscriptImages } from './generatedImageInteraction';
import { buildGeneratedImageMembership } from './generatedImageMembership';
import {
  extractCharacterNameFromPrompt,
  extractImageTitleFromPrompt,
  extractPromptFromPngDataUri,
  normalizeImageLabel,
  parsePromptBodyFromToken,
} from './generatedImagePromptMetadata';
import { buildHideStateRecord, clearHideState, readHideState, writeHideState } from './hideStatePersistence';
import {
  callHostGetChatMessages,
  collectChatu8PromptTokens,
  collectReachableHostDocuments,
  normalizeImageDataToSrc,
  normalizeImageSrcForCompare,
  readChatMessageDetail,
  readHostContext,
} from './hostBridge';
import { installHostChatInputBridge } from './hostChatInputBridge';
import { dispatchHostPrimaryTrigger, type HostGesturePoint } from './hostGestureDispatch';
import { ensureHostMesTextRendered as ensureHostMesTextRenderedWithRefresh } from './hostMesTextRender';
import { resolveHostMessageRole } from './hostMessageRole';
import { createHostVisualHideController } from './hostVisualHide';
import { getFallbackImageClasses } from './imageFallbackClasses';
import { createImageGenerationEventBridge, ImageGenerationBridgeHandle } from './imageGenerationEventBridge';
import { createImagePendingTaskManager } from './imagePendingTaskManager';
import { createImageRecentIntentStore } from './imageRecentIntent';
import { chooseImageRenderMode } from './imageRenderPriority';
import { collectGenerationRevealMessageIds, withLatestUserUnhidden } from './latestUserMacroVisibility';
import { sendToNativeChat } from './nativeSendProxy';
import {
  buildLeanInheritedMessageData,
  isCurrentOpeningAssistantMessageByPayload,
  isCurrentOpeningSeedMessageByPayload,
} from './openingMessageFlags';
import { collectPluginNativeCacheArtifacts } from './pluginNativeCacheArtifacts';
import {
  readNativeFirstImageArtifacts,
  readNativeFirstMembershipEntries,
  readNativeFirstPromptTokens,
  normalizePromptTokenForCompare,
  type NativeFirstArtifactSource,
  type NativeFirstImageArtifact,
} from './pluginNativeImageArtifacts';
import {
  countPluginNativeImageArtifacts,
  isPluginNativeMutationNode,
  isReadyPluginNativeMutationNode,
} from './pluginNativeImageDom';
import { stripPluginNativePlaceholderHtml } from './pluginNativePlaceholderCleanup';
import {
  createPostDoneSideEffectsQueue,
  runQueuedHostMessageUpdate,
  runQueuedPostDoneAssistantSideEffects,
} from './postDoneSideEffectsQueue';
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
import {
  clearSameLayerRuntimeHeartbeat,
  readSameLayerRuntimeHeartbeat,
  writeSameLayerRuntimeHeartbeat,
} from './runtimeLeaseHeartbeat';
import {
  clearSameLayerRuntimeLease,
  createSameLayerRuntimeLease,
  isSameLayerRuntimeLeaseRecoverable,
  readSameLayerRuntimeLease,
  writeSameLayerRuntimeLease,
  type SameLayerRuntimeLease,
  type SameLayerRuntimeLeaseStatus,
} from './runtimeLeasePersistence';
import { SAME_LAYER_LEASE_HEARTBEAT_MS } from './runtimeLeasePolicy';
import { installSameLayerSaveGuardian, SaveGuardianHandle, SaveGuardianHealth } from './samelayerSaveGuardian';
import {
  createReasoningStreamState,
  extractNativeReasoningText,
  readTavernReasoningConfig,
  resolveReasoningVisibleText,
} from './reasoningStreamBridge';
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
type ImageGenerationTriggerOptions = {
  hostPoint?: HostGesturePoint | null;
  afterPrimaryTrigger?: () => Promise<boolean | void> | boolean | void;
};
type HostTranscriptVisibleOptions = {
  beforeRelease?: () => Promise<void> | void;
};
type AssistantPlaceholderEnsureReason = 'first_token' | 'finalize_fallback' | 'native_reasoning' | `signal_${string}`;

const DEMO_THEME_CLASS_NAMES = [
  'theme-tech',
  'theme-dark',
  'theme-gold',
  'theme-ios',
  'theme-ipod',
  'theme-amber',
] as const;
const TRANSCRIPT_UI_WINDOW_SIZE = 4;
const STREAM_TRANSCRIPT_PATCH_INTERVAL_MS = 80;
const STREAMING_PREVIEW_RENDER_INTERVAL_MS = 320;
const GALLERY_HISTORY_SCAN_BATCH_SIZE = 24;
const GALLERY_HISTORY_MAX_GROUPS_PER_LOAD = 6;
const HOST_IMAGE_RESPONSE_RECONCILE_DELAYS_MS = [120, 360, 900, 1800, 3600, 7200] as const;
const PLUGIN_NATIVE_PROMPT_PLACEHOLDER_RECONCILE_DELAYS_MS = [0, 120, 360, 900, 1800, 3600, 7200] as const;
const SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES = 10;
const SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_MESSAGES = 96;
const SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_CHARS = 120_000;
const SAME_LAYER_CANCELLED_ERROR = '__same_layer_generation_cancelled__';
const IMAGE_GENERATION_HANDOFF_TIMEOUT_MS = 4500;
const IMAGE_GENERATION_LLM_HANDOFF_TIMEOUT_MS = 120_000;
const IMAGE_GENERATION_LLM_RESPONSE_HANDOFF_GRACE_MS = 8000;
const IMAGE_GENERATION_HANDOFF_POLL_MS = 80;
const CHATU8_LLM_IMAGE_GEN_REQUEST_EVENT = 'ch-llm-image-gen-request';
const CHATU8_LLM_IMAGE_GEN_RESPONSE_EVENT = 'ch-llm-image-gen-response';
const CHATU8_IMAGE_BUTTON_SELECTOR = '.st-chatu8-image-button, button.image-tag-button';
const CHATU8_IMAGE_SPAN_SELECTOR = '.st-chatu8-image-span, span.image-tag-placeholder';
const CHATU8_IMAGE_CONTAINER_SELECTOR = '.ai-image-container';
const FALLBACK_IMAGE_CLASSES = getFallbackImageClasses();

type StreamingPreviewCacheEntry = {
  source: string;
  html: string;
  renderedAt: number;
};

const streamingPreviewCache = new Map<number, StreamingPreviewCacheEntry>();

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
  data?: unknown;
};

type ChatMessageMeta = {
  message_id: number;
  role: 'assistant' | 'user' | 'system';
  is_hidden: boolean;
  messageLength?: number;
  hasDepthSummary?: boolean;
  depthSummaryLength?: number;
  data?: unknown;
};

function estimateDepthRegexSummaryInfo(rawMessage: unknown): { hasDepthSummary: boolean; depthSummaryLength: number } {
  if (typeof rawMessage !== 'string' || rawMessage.length <= 0) {
    return { hasDepthSummary: false, depthSummaryLength: 0 };
  }

  const sceneStart = rawMessage.indexOf('<scene>');
  if (sceneStart < 0) {
    return { hasDepthSummary: false, depthSummaryLength: 0 };
  }

  const detailsStart = rawMessage.indexOf('<details>', sceneStart);
  const detailsEnd = detailsStart >= 0 ? rawMessage.indexOf('</details>', detailsStart + '<details>'.length) : -1;
  if (detailsStart >= 0 && detailsEnd >= 0) {
    return {
      hasDepthSummary: true,
      depthSummaryLength: Math.max(0, detailsEnd - (detailsStart + '<details>'.length)),
    };
  }

  const sceneEnd = rawMessage.indexOf('</scene>', sceneStart + '<scene>'.length);
  if (sceneEnd < 0) {
    return { hasDepthSummary: false, depthSummaryLength: 0 };
  }

  const sceneBody = rawMessage.slice(sceneStart + '<scene>'.length, sceneEnd);
  return {
    hasDepthSummary: true,
    depthSummaryLength: sceneBody
      .replace(/<summary>摘要<\/summary>/g, '')
      .replace(/<\/?details>/g, '')
      .trim().length,
  };
}

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

function isVariableUpdateOnlyGenerationText(text: string): boolean {
  const source = String(text ?? '').trim();
  if (!/<UpdateVariable\b/i.test(source)) return false;
  const withoutRuntimeShell = stripStreamDemoRuntimeTags(source)
    .replace(/<content\b[^>]*>/gi, '')
    .replace(/<\/content>/gi, '');
  const withoutVariableBlocks = withoutRuntimeShell
    .replace(/<UpdateVariable\b[^>]*>[\s\S]*?<\/UpdateVariable>/gi, '')
    .replace(/<UpdateVariable\b[^>]*>[\s\S]*$/gi, '');
  const remainingVisibleText = withoutVariableBlocks
    .replace(/<StatusPlaceHolderImpl\b[^>]*\/\s*>/gi, '')
    .replace(/<StatusPlaceHolderImpl\b[^>]*>[\s\S]*?<\/StatusPlaceHolderImpl>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return remainingVisibleText.length === 0;
}

function extractMvuUpdateVariableBlocks(text: string): string[] {
  const source = String(text ?? '').trim();
  if (!source) return [];

  const blocks: string[] = [];
  const pattern = /<UpdateVariable\b[^>]*>[\s\S]*?(?:<\/UpdateVariable>|$)/gi;
  for (const match of source.matchAll(pattern)) {
    const block = String(match[0] ?? '').trim();
    if (block && !blocks.includes(block)) {
      blocks.push(block);
    }
  }
  return blocks;
}

function mergeMvuWritebackBlocksIntoAssistantText(existingText: string, writebackText: string): string {
  const existing = String(existingText ?? '').trim();
  const blocks = extractMvuUpdateVariableBlocks(writebackText).filter(block => !existing.includes(block));
  if (blocks.length === 0) return existing;
  if (isStreamDemoMessage(existing)) {
    const closingContentIndex = existing.lastIndexOf('</content>');
    if (closingContentIndex >= 0) {
      const prefix = existing.slice(0, closingContentIndex).trimEnd();
      const suffix = existing.slice(closingContentIndex);
      return [prefix, blocks.join('\n\n'), suffix].filter(Boolean).join('\n\n');
    }
  }
  return [existing, blocks.join('\n\n')].filter(Boolean).join('\n\n');
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

function sanitizeAssistantRuntimeTagsForStreamingPreview(source: string): string {
  return String(source ?? '');
}

function shouldRefreshStreamingPreview(
  cached: StreamingPreviewCacheEntry | undefined,
  source: string,
  now: number,
): boolean {
  if (!cached) return true;
  if (source === cached.source) return false;
  if (source.length < cached.source.length) return true;
  if (now - cached.renderedAt >= STREAMING_PREVIEW_RENDER_INTERVAL_MS) return true;
  return /(?:\n\n|[。！？!?]\s*)$/.test(source);
}

function buildStreamingPreviewHtml(renderSource: string, role: TranscriptItem['role'], message_id: number): string {
  const source = String(renderSource ?? '').trim();
  if (!source)
    return '<div class="stream-stage-preview"><span class="assistant-runtime-pending">等待 token...</span></div>';

  const cacheKey = Math.trunc(Number(message_id));
  const now = Date.now();
  const cached = streamingPreviewCache.get(cacheKey);
  if (Number.isFinite(cacheKey) && !shouldRefreshStreamingPreview(cached, source, now)) {
    return cached?.html ?? '';
  }

  const sanitized = sanitizeAssistantRuntimeTagsForStreamingPreview(source);
  const regexText = applyRegexForDisplay(sanitized, role);
  const rendered = sanitizeRawImageTagsInHtml(String(regexText || sanitized));
  const html = stripVisibleChatu8PromptTokensHtml(
    `<div class="stream-stage-preview">${rendered.trim() || '<span class="assistant-runtime-pending">生成中...</span>'}</div>`,
  );
  if (Number.isFinite(cacheKey)) {
    streamingPreviewCache.set(cacheKey, { source, html, renderedAt: now });
  }
  return html;
}

function normalizeDisplayedHtml(html: string): string {
  return stripPluginNativePlaceholderHtml(
    String(html ?? '')
      .replace(/<q(\s[^>]*)?>/gi, '<span class="dialog-inline">')
      .replace(/<\/q>/gi, '</span>'),
  );
}

function isHostRenderedStreamDemoWrapperOnlyHtml(html: string): boolean {
  const source = String(html ?? '').trim();
  if (!source) return false;
  const visibleText = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const compactText = visibleText.replace(/[\s:：_\-[\]()（）【】]+/g, '');
  return (
    compactText === 'streamingdone' ||
    compactText === 'steamingdone' ||
    compactText === 'streamdone' ||
    compactText === 'demophasedone' ||
    compactText === 'streamdemodone' ||
    compactText === 'streamdemominimaldone'
  );
}

function readHostRenderedMessageHtml(message_id: number): string {
  const normalizedId = Math.trunc(Number(message_id));
  if (!Number.isFinite(normalizedId) || normalizedId < 0) return '';
  try {
    if (typeof retrieveDisplayedMessage !== 'function') return '';
    const html = String(retrieveDisplayedMessage(normalizedId)?.html?.() ?? '').trim();
    if (!html) return '';
    if (html.includes(STREAM_DEMO_MARKER) || /<demo_phase\b/i.test(html)) return '';
    if (isHostRenderedStreamDemoWrapperOnlyHtml(html)) return '';
    return stripVisibleChatu8PromptTokensHtml(normalizeDisplayedHtml(html));
  } catch {
    return '';
  }
}

const RAW_IMAGE_TAG_PATTERN = /<image\b([^>]*)>([\s\S]*?)<\/image>|<image\b([^/>]*)\/\s*>/gi;

/**
 * 把 raw `<image>` 标签转成安全占位。
 *
 * st-chatu8 插件把生成的图片以 `<image>…</image>` 标签写进 `mes` 正文；插件自己在宿主
 * `.mes_text` 上跑一条 display regex 把这个标签替换成 `<span class="st-chatu8-image-span">…</span>`。
 * 但我们在同层 iframe 里走的是自己的 `formatAsDisplayedMessage` 管线，插件那条 regex 不会
 * 命中，结果就是 UI 打开时先短暂地把 `<image></image>` 当字面文本渲染出来，过几百毫秒后
 * 才被 MutationObserver + `appendChatu8ArtifactsToHtml` 灌进真实的 `<img>`。
 *
 * 这里先做一次保底：
 * - `<image src="...">...</image>` / `<image src="..." />`：提取 src，直接转成 `<img>`。
 * - 其他 `<image>` 形态（含空标签、无 src）：替换成一个 `st-chatu8-image-pending` 占位
 *   `<span>`，保证 UI 不会出现 `<image>` 字面字符串，等 MutationObserver 再把真实 img 注入进来。
 */
function sanitizeRawImageTagsInHtml(html: string): string {
  const source = String(html ?? '');
  if (!source || !source.includes('<image')) return source;
  return source.replace(
    RAW_IMAGE_TAG_PATTERN,
    (match, pairedAttrs: string | undefined, innerHtml: string | undefined, selfClosingAttrs: string | undefined) => {
      const attrs = String(pairedAttrs ?? selfClosingAttrs ?? '');
      const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
      const src = String(srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3] ?? '').trim();
      const altMatch = attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
      const alt = String(altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? '').trim();
      if (src) {
        return `<img class="st-chatu8-image-pending" src="${escapeHtml(src)}" alt="${escapeHtml(alt || 'generated image')}" loading="lazy" />`;
      }
      const innerText = String(innerHtml ?? '')
        .replace(/<[^>]+>/g, '')
        .trim();
      const nativePromptTokens = collectChatu8PromptTokens(innerText);
      if (nativePromptTokens.length > 0) {
        return nativePromptTokens
          .map(
            token =>
              `<span class="chatu8-native-prompt-token" data-chatu8-native-prompt-token="true">${escapeHtml(token)}</span>`,
          )
          .join('');
      }
      const shouldExposeInnerText = innerText && !/^image###/i.test(innerText) && innerText.length <= 64;
      const placeholderLabel = shouldExposeInnerText ? `正在加载图片：${innerText.slice(0, 32)}` : '正在加载图片…';
      return `<span class="st-chatu8-image-pending" aria-hidden="true" data-raw-image-tag="true">${escapeHtml(placeholderLabel)}</span>`;
    },
  );
}

function buildFallbackDisplayedHtml(renderSource: string): string {
  const source = String(renderSource || '(空回复)');
  const placeholders: Array<{ marker: string; html: string }> = [];
  const markedSource = source.replace(RAW_IMAGE_TAG_PATTERN, match => {
    const marker = `__ST_CHATU8_IMAGE_PLACEHOLDER_${placeholders.length}__`;
    placeholders.push({ marker, html: sanitizeRawImageTagsInHtml(match) });
    return marker;
  });
  let escaped = escapeHtml(markedSource);
  placeholders.forEach(({ marker, html }) => {
    escaped = escaped.replaceAll(marker, html);
  });
  return `<p>${escaped}</p>`;
}

function coerceBooleanRuntimeSetting(value: unknown): boolean {
  return (
    value === true ||
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function isChatu8AutoLlmImageGenerationEnabled(): boolean {
  try {
    const settings = readHostContext()?.extensionSettings?.['st-chatu8'];
    return coerceBooleanRuntimeSetting(settings?.autoLLMImageGen);
  } catch {
    return false;
  }
}

function buildFinalHtml(
  renderSource: string,
  message_id: number,
  artifactSource?: string,
  options: { appendArtifacts?: boolean } = {},
): string {
  let html = '';
  const renderSourceForDisplay = sanitizeRawImageTagsInHtml(renderSource || '(空回复)');
  try {
    if (typeof formatAsDisplayedMessage === 'function') {
      // 先清洗 raw `<image>`，否则 Tavern formatter 会把它解析成无 src 的空 <img>，后续就无法识别了。
      html = normalizeDisplayedHtml(formatAsDisplayedMessage(renderSourceForDisplay, { message_id }));
    }
  } catch {
    // ignore
  }
  if (!html) {
    html = normalizeDisplayedHtml(buildFallbackDisplayedHtml(renderSourceForDisplay));
  }
  // 保底把裸露的 `<image></image>` 转成占位或 <img>；不然它会被 v-html 当字面文本渲染。
  html = sanitizeRawImageTagsInHtml(html);
  if (options.appendArtifacts === false) {
    return stripVisibleChatu8PromptTokensHtml(html);
  }
  const htmlWithArtifacts = applyTranscriptArtifacts({
    html,
    renderSource: artifactSource ?? renderSource,
    messageId: message_id,
    appendArtifacts: appendChatu8ArtifactsToHtml,
  });
  return stripVisibleChatu8PromptTokensHtml(htmlWithArtifacts);
}

function buildHostRenderedHtml(
  hostRenderedHtml: string,
  renderSource: string,
  message_id: number,
  artifactSource?: string,
): string {
  let html = String(hostRenderedHtml ?? '').trim();
  if (!html) return '';
  html = sanitizeRawImageTagsInHtml(normalizeDisplayedHtml(html));
  const htmlWithArtifacts = applyTranscriptArtifacts({
    html,
    renderSource: artifactSource ?? renderSource,
    messageId: message_id,
    appendArtifacts: appendChatu8ArtifactsToHtml,
  });
  return stripVisibleChatu8PromptTokensHtml(htmlWithArtifacts);
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
    return Object.values(input as Record<string, unknown>).flatMap(flattenChatu8ImageRecords);
  return [];
}

function collectSelectedChatu8ImageEntries(message: any): Record<string, any>[] {
  const rawSwipeId = Number(_.get(message, 'swipe_id', null));
  const swipeId = Number.isFinite(rawSwipeId) ? Math.trunc(rawSwipeId) : null;
  const sources = [
    _.get(message, 'extra.images', null),
    swipeId != null && swipeId >= 0 ? _.get(message, ['swipe_info', swipeId, 'images'], null) : null,
  ];

  for (const source of sources) {
    const entries = flattenChatu8ImageRecords(source);
    if (entries.length > 0) return entries;
  }

  return [];
}

function readChatu8ExtraImages(messageId: number): RenderableGeneratedImage[] {
  const message = readChatMessageDetail(messageId);
  const selectedEntries = collectSelectedChatu8ImageEntries(message);

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

type NativePromptTokenPlacementTarget = {
  tokenCompare: string;
  target: HTMLElement;
};

function resolveInlinePlacementTarget(element: HTMLElement): HTMLElement {
  const parent = element.parentElement;
  const parentOnlyContainsMarker =
    parent?.tagName === 'P' &&
    normalizeAnchorText(parent.textContent ?? '') === normalizeAnchorText(element.textContent ?? '');
  return parentOnlyContainsMarker ? parent : element;
}

function collectNativePromptTokenPlacementTargets(root: HTMLElement): NativePromptTokenPlacementTarget[] {
  return Array.from(root.querySelectorAll('[data-chatu8-native-prompt-token="true"]')).flatMap(node => {
    const element = node as HTMLElement;
    return collectChatu8PromptTokens(element.textContent ?? '')
      .map(token => normalizePromptTokenForCompare(token))
      .filter(Boolean)
      .map(tokenCompare => ({
        tokenCompare,
        target: resolveInlinePlacementTarget(element),
      }));
  });
}

function takeNativePromptTokenPlacementTarget(
  targets: NativePromptTokenPlacementTarget[],
  promptToken?: string,
): HTMLElement | null {
  const needle = normalizePromptTokenForCompare(promptToken ?? '');
  const index = needle ? targets.findIndex(item => item.tokenCompare === needle) : targets.length === 1 ? 0 : -1;
  if (index < 0) return null;
  const [matched] = targets.splice(index, 1);
  return matched?.target ?? null;
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
  const nativePromptTokenTargets = collectNativePromptTokenPlacementTargets(doc.body);
  const rawImagePlaceholders = Array.from(doc.body.querySelectorAll('[data-raw-image-tag="true"]')).map(node => {
    const element = node as HTMLElement;
    return resolveInlinePlacementTarget(element);
  });

  for (const image of images) {
    const figure = createGeneratedImageFigureElement(doc, image, FALLBACK_IMAGE_CLASSES.inline, messageId);
    const nativePromptTarget = takeNativePromptTokenPlacementTarget(nativePromptTokenTargets, image.promptToken);
    if (nativePromptTarget) {
      nativePromptTarget.replaceWith(figure);
      continue;
    }
    const placeholderTarget = rawImagePlaceholders.shift();
    if (placeholderTarget) {
      placeholderTarget.replaceWith(figure);
      continue;
    }
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
    figure.setAttribute('data-tail-gallery-image', 'true');
    doc.body.append(figure);
  }

  return doc.body.innerHTML;
}

function appendChatu8ArtifactsToHtml(html: string, renderSource: string, messageId: number): string {
  const promptTokens = collectChatu8PromptTokens(renderSource);
  const promptTokenSet = new Set(promptTokens);
  const promptTokenCompareSet = new Set(promptTokens.map(normalizePromptTokenForCompare).filter(Boolean));
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
  const pluginNativeSources = new Set<string>();
  for (const img of pluginNativeImages) {
    const s = normalizeImageSrcForCompare(img.src);
    if (s) pluginNativeSources.add(s);
  }
  const dedupedImages: RenderableGeneratedImage[] = [];
  const seenSources = new Set<string>();
  for (const image of images) {
    const normalizedSrc = normalizeImageSrcForCompare(image.src);
    if (!normalizedSrc || existingSources.has(image.src) || seenSources.has(normalizedSrc)) continue;
    if (
      image.promptToken &&
      promptTokenSet.size > 0 &&
      !promptTokenSet.has(image.promptToken) &&
      !promptTokenCompareSet.has(normalizePromptTokenForCompare(image.promptToken))
    ) {
      continue;
    }
    // Also skip if this src is already covered by extraImages (plugin-native path).
    // This prevents duplicate injection when extra images are managed by the
    // image strip but were temporarily missing from existingSources (DOM not yet updated).
    if (image.source === 'cache' && pluginNativeSources.has(normalizedSrc)) continue;
    seenSources.add(normalizedSrc);
    dedupedImages.push(image);
  }

  const htmlWithImages = injectGeneratedImagesIntoHtml(html, dedupedImages, messageId, {
    appendUnanchoredToEnd: renderMode !== 'plugin-native-data' || hasPluginNativeArtifacts !== true,
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

  function resolvePluginGeneratedImageForButton(button: HTMLElement): HTMLImageElement | null {
    let sibling = button.nextElementSibling;
    while (sibling) {
      if (sibling.matches?.(CHATU8_IMAGE_BUTTON_SELECTOR)) return null;
      if (sibling.tagName === 'IMG') return sibling as HTMLImageElement;
      const nestedImage = sibling.querySelector?.('img') as HTMLImageElement | null;
      if (nestedImage) return nestedImage;
      sibling = sibling.nextElementSibling;
    }

    const parent = button.parentElement;
    if (!parent) return null;
    const images = Array.from(parent.querySelectorAll('img')) as HTMLImageElement[];
    return (
      images.find(image => {
        const source = image.getAttribute('src') ?? image.currentSrc;
        return Boolean(source && (source.startsWith('data:image') || source.startsWith('blob:')));
      }) ?? null
    );
  }

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
    const buttons = Array.from(root.querySelectorAll(CHATU8_IMAGE_BUTTON_SELECTOR)) as HTMLElement[];
    for (const button of buttons) {
      const image = resolvePluginGeneratedImageForButton(button);
      if (!image) continue;
      const src = image.getAttribute('src') ?? image.currentSrc;
      if (src && (src.startsWith('data:image') || src.startsWith('blob:'))) {
        pushImage(
          src,
          image.getAttribute('alt') ?? image.getAttribute('title'),
          button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '',
          button.dataset.requestId ?? button.getAttribute('data-request-id') ?? '',
          extractAnchorTextForImageNode(image, root),
        );
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
  const nativeRenderableImages = readNativeFirstRenderableImagesForMessage({
    messageId,
    rawMessage: input.rawMessage,
    hostDomArtifacts,
  });
  const persistedMembershipEntries = readNativeFirstMembershipForMessage({
    messageId,
    rawMessage: input.rawMessage,
    hostDomArtifacts,
  });
  const memberships = buildGeneratedImageMembership({
    messageId,
    promptTokens,
    persistedEntries: persistedMembershipEntries,
    createdOrderBase,
  });
  const entities = buildGeneratedImageEntities({
    messageId,
    memberships,
    nativeImages: nativeRenderableImages,
  });
  const readyEntities = filterReadyGeneratedImageEntities(entities);

  if (readyEntities.length === 0 && hostDomArtifacts.length > 0) {
    return hostDomArtifacts
      .map((image, index): GeneratedImageRef | null => {
        const src = normalizeImageSrcForCompare(image.src);
        if (!src) return null;
        const promptToken = String(image.promptToken ?? '').trim();
        const anchorText = String(image.anchorText ?? '').trim();
        const metadataPrompt = promptToken ? '' : extractPromptFromPngDataUri(src);
        const promptForLabel = promptToken || metadataPrompt;
        const title =
          pickFirstNonEmpty(
            extractImageTitleFromPrompt(promptForLabel),
            extractTitleFromAnchor(anchorText),
            extractTitleFromSrc(src),
            extractCharacterNameFromPrompt(promptForLabel),
            `楼层 #${messageId} · 图 ${index + 1}`,
          ) || `楼层 #${messageId} · 图 ${index + 1}`;
        const characterName = extractCharacterNameFromPrompt(promptForLabel);
        return {
          id: `host-dom-${messageId}-${image.requestId ?? index}-${index}`,
          messageId,
          markerId: image.markerId,
          imageId: image.imageId ?? image.requestId ?? src,
          promptToken,
          requestId: image.requestId,
          anchorText: anchorText || undefined,
          title,
          characterName: characterName || undefined,
          createdOrder: createdOrderBase * 100 + index,
          src,
          alt: image.alt,
        };
      })
      .filter((image): image is GeneratedImageRef => image !== null);
  }

  return readyEntities.map((entity, index) => {
    const promptToken = entity.promptToken;
    const anchorText = entity.anchorText;
    const metadataPrompt = promptToken ? '' : extractPromptFromPngDataUri(entity.src ?? '');
    const promptForLabel = promptToken || metadataPrompt;
    const title =
      pickFirstNonEmpty(
        extractImageTitleFromPrompt(promptForLabel),
        entity.title,
        extractTitleFromAnchor(anchorText ?? ''),
        extractTitleFromSrc(entity.src ?? ''),
        extractCharacterNameFromPrompt(promptForLabel),
        `楼层 #${messageId} · 图 ${index + 1}`,
      ) || `楼层 #${messageId} · 图 ${index + 1}`;
    const characterName = pickFirstNonEmpty(entity.characterName, extractCharacterNameFromPrompt(promptForLabel));

    return {
      id: entity.id,
      messageId,
      markerId: entity.markerId,
      imageId: entity.imageId,
      promptToken,
      requestId: entity.requestId,
      anchorText: anchorText || undefined,
      title,
      characterName: characterName || undefined,
      createdOrder: entity.createdOrder,
      src: entity.src,
      alt: entity.alt,
    };
  });
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

function hasReadyChatu8Mutation(record: MutationRecord): boolean {
  if (record.type === 'attributes' && record.attributeName === 'src') {
    const target = record.target as HTMLElement;
    if (target.tagName === 'IMG' && target.closest('.st-chatu8-image-span, .st-chatu8-image-container, .mes')) {
      return true;
    }
  }

  const matchesReadyNode = (node: Node | null | undefined) => isReadyPluginNativeMutationNode(node);

  if (matchesReadyNode(record.target)) return true;
  for (const node of Array.from(record.addedNodes)) {
    if (matchesReadyNode(node)) return true;
  }
  for (const node of Array.from(record.removedNodes)) {
    if (matchesReadyNode(node)) return true;
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
      attributes: true,
      attributeFilter: ['src'],
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

async function buildOpeningCompiledUserInput(
  preset: OpeningPreset,
  payload: OpeningPayload,
  options?: {
    messages?:
      | { message_id: number; role?: string | null; is_hidden?: boolean }[]
      | (() => { message_id: number; role?: string | null; is_hidden?: boolean }[]);
    setChatMessages?: (
      chat_messages: Array<{ message_id: number; is_hidden: boolean }>,
      options?: { refresh?: 'none' | 'affected' | 'all' },
    ) => Promise<void>;
  },
) {
  const context = buildOpeningPromptContext(preset, payload);
  const templateRaw = resolveOpeningPromptTemplateRaw(payload.world_mode_id);
  const compiledTemplate = compileOpeningPromptTemplate(String(templateRaw ?? '').trim(), context);
  const resolveExplicitMacros = () =>
    typeof substitudeMacros === 'function' ? substitudeMacros(compiledTemplate) : compiledTemplate;

  if (!options?.messages || typeof options.setChatMessages !== 'function') {
    return resolveExplicitMacros();
  }

  return await withLatestUserUnhidden({
    messages: options.messages,
    setChatMessages: options.setChatMessages,
    action: async () => resolveExplicitMacros(),
  });
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
  busy: boolean;
}): TranscriptItem {
  const isDemoAssistant = isStreamDemoMessage(input.raw);
  const structuredOptions = extractOpeningOptions(input.raw);
  const hasStructuredContent = /<content(?:\s[^>]*)?>/i.test(input.raw);
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
  const hostRenderedHtml = buildHostRenderedHtml(
    readHostRenderedMessageHtml(input.id),
    displayRenderSource,
    input.id,
    input.raw,
  );
  const hostRenderedHasReadyImage =
    /\bst-chatu8-image-span\b|\bassistant-fallback-(?:inline-image|generated-image)\b/.test(hostRenderedHtml);
  const isCurrentStreamingItem =
    input.latestAssistantId === input.id &&
    !hostRenderedHasReadyImage &&
    phase === 'stream' &&
    (input.status === 'streaming' || input.busy === true);
  const streamHtml = isCurrentStreamingItem
    ? hostRenderedHtml || buildStreamingPreviewHtml(displayRenderSource, input.role, input.id)
    : '';
  const regexText = isCurrentStreamingItem ? '' : applyRegexForDisplay(displayRenderSource, input.role);
  // finalHtml 无条件都构造：即使当前项处于流式，我们也要留一份能用的 finalHtml，
  // 否则 `syncTranscriptFlags` 将一个"曾经是最新"的条目翻成 `isStreaming: false` 时，
  // 该条目会落回 `<div v-html="finalHtml || '(空回复)'">`，显示空回复。
  // 当前流式项只保留已节流的预览 HTML，避免每 80ms 进入 formatAsDisplayedMessage；
  // 完成态或非 latest 楼层才构造完整 HTML 和图片 artifact。
  const finalHtml =
    hostRenderedHtml ||
    (isCurrentStreamingItem ? streamHtml : buildFinalHtml(displayRenderSource, input.id, input.raw));
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
    isStreaming: isCurrentStreamingItem,
    canOpenDetail: true,
    canDeleteFrom: input.isOpening !== true,
    canReroll: input.canReroll === true,
  };
}

function sortTranscriptItems(items: TranscriptItem[]): TranscriptItem[] {
  return items.slice().sort((a, b) => a.message_id - b.message_id);
}

function shouldTreatLatestAssistantAsStreaming(input: {
  isLatest: boolean;
  status: DemoStatus;
  phase: TranscriptItem['phase'];
  busy: boolean;
}): boolean {
  if (input.isLatest !== true) return false;
  if (input.phase !== 'stream') return false;
  return input.status === 'streaming' || input.busy === true;
}

function clipTranscriptItemsForUi(items: TranscriptItem[]): TranscriptItem[] {
  return sortTranscriptItems(items).slice(-TRANSCRIPT_UI_WINDOW_SIZE);
}

function createSameLayerGenerationId(traceId: string): string {
  const safeTraceId = String(traceId || 'generation').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `same-layer-${safeTraceId}`;
}

export function useStreamingDemo() {
  const initialContainerMessageId = readCurrentContainerMessageId();
  const input = ref('');
  const busy = ref(false);
  const status = ref<DemoStatus>('idle');
  const streamText = ref('');
  const finalText = ref('');
  const reasoningStreamState = createReasoningStreamState(readTavernReasoningConfig());
  const nativeReasoningText = ref('');
  const errorText = ref('');
  const assistantMessageId = ref<number | null>(null);
  const activeGenerationId = ref<string | null>(null);
  const generationCancelRequested = ref<boolean>(false);
  const transcript = ref<TranscriptItem[]>([]);
  const filterMode = ref<TranscriptFilterMode>('all');
  const density = ref<TranscriptDensity>('comfortable');
  const theme = ref<DemoTheme>('amber');
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
  let activeGenerationCancelReject: ((error: Error) => void) | null = null;
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

  const followLatest = computed(
    () => transcriptWindowMode.value === 'latest' && readingMode.value === 'following_latest',
  );

  const readingModeLabel = computed(() => (followLatest.value ? '跟随最新' : '浏览历史'));

  const debugTraceRuntime =
    typeof window !== 'undefined'
      ? installDebugTraceRuntime({ target: window as any, maxEvents: 500 })
      : createDebugTraceStore({ enabled: false });

  function debugConsoleLog(message: string, detail: Record<string, unknown> | (() => Record<string, unknown>) = {}) {
    if (!debugTraceRuntime.enabled) return;
    console.debug(message, typeof detail === 'function' ? detail() : detail);
  }

  let patchQueue = Promise.resolve();
  let latestPatchedMessage = '';
  let activeGenerationTraceId = '';
  let latestLifecycleTraceId = '';
  let rebuildSequence = 0;
  let patchSequence = 0;
  let assistantPlaceholderCreating = false;
  let hostMesTextPrimedForCurrentGeneration = false;
  let nativeSendProxyActive = false;
  let openingNativeGenerationActive = false;
  let nativeGenerationRevealActive = false;
  const generationListenerEpochController = createGenerationListenerEpochController();
  let generationStops: StopHandle[] = [];
  let historyStops: StopHandle[] = [];
  let mvuStops: StopHandle[] = [];
  let pluginNativeLlmImageGenerationStops: StopHandle[] = [];
  let hidePolicyTimer = 0;
  let hidePolicyRunning = false;
  let hidePolicyRerun = false;
  const hostImageDataSyncSignatures = new Map<number, string>();
  let hideStatePersistTimer = 0;
  let runtimeLeaseHeartbeatTimer = 0;
  let externalSyncTimer = 0;
  let readerStatePersistTimer = 0;
  let openingPayloadPersistTimer = 0;
  let generatedImageDomMutationTimer = 0;
  const hostImageDataReconcileTimers = new Set<number>();
  const pendingGeneratedImageRefreshMessageIds = new Set<number>();
  let streamTranscriptPatchTimer = 0;
  let streamTranscriptPatchDirty = false;
  let streamTranscriptPatchRunning = false;
  let generationSignalFinalizeTimer = 0;
  let generationSignalFinalizeReason = '';
  let generationSignalFinalizing = false;
  let generationSignalFinalized = false;
  let generatedImageDomObserver: MutationObserver | null = null;
  let hostPluginMutationObservers: MutationObserver[] = [];
  let lifecycleEchoSuppressUntilMs = 0;
  let lifecycleEchoSuppressedHostEvents: string[] = [];
  const runtimeLeaseSessionId = createTraceId('runtime-lease');
  const hostVisualHideController = createHostVisualHideController();
  let destroyHostChatInputBridge = () => {};
  let sameLayerDisableRequested = false;
  // 保存守护器句柄：onMounted 时安装，unmount 时拆掉。
  let saveGuardian: SaveGuardianHandle | null = null;
  // 图片生成事件桥：监听插件 `generate-image-request/response`，失败时弹 toast。
  let imageGenerationBridge: ImageGenerationBridgeHandle | null = null;
  // 最近一次生图失败的 toast 节流，避免插件连发多条失败时刷屏。
  let lastImageGenFailureToastAt = 0;
  const IMAGE_GEN_FAILURE_TOAST_MIN_INTERVAL_MS = 5_000;
  // 节流过的 toast：一次连续失败只弹一次，避免刷屏。
  let lastSaveFailureToastAt = 0;
  const SAVE_FAILURE_TOAST_MIN_INTERVAL_MS = 30_000;
  // reactive，给模板用来点亮 FAB 红点（`saveHealthIsFailing.value`）。
  const saveHealthIsFailing = ref(false);
  const saveHealthLastFailedAt = ref<number | null>(null);
  const saveHealthLastSucceededAt = ref<number | null>(null);
  const saveHealthConsecutiveFailures = ref(0);

  const mvuSourceRevision = ref(0);
  const reprocessVariablesPending = ref(false);
  const imagePendingTaskManager = createImagePendingTaskManager();
  const imageRecentIntentStore = createImageRecentIntentStore();
  const activePluginNativeLlmImageGenerationRequests = new Set<string>();
  let lastPluginNativeLlmImageGenerationSettledAt = 0;
  const postDoneSideEffectsQueue = createPostDoneSideEffectsQueue();

  function resolveTraceId(fallbackPrefix = 'trace') {
    return activeGenerationTraceId || latestLifecycleTraceId || createTraceId(fallbackPrefix);
  }

  function recordLifecycleTrace(
    scope: string,
    event: string,
    payload: Record<string, unknown> | (() => Record<string, unknown>) = {},
    traceId?: string,
  ) {
    if (!debugTraceRuntime.enabled) return null;
    const resolvedPayload = typeof payload === 'function' ? payload() : payload;
    const resolvedTraceId = traceId ?? resolveTraceId(scope);
    const entry = recordDebugTrace(debugTraceRuntime, {
      traceId: resolvedTraceId,
      scope,
      event,
      payload: {
        busy: busy.value,
        status: status.value,
        assistantMessageId: assistantMessageId.value,
        ...resolvedPayload,
      },
    });
    if (entry) {
      console.debug(`[stream-demo:debug] ${scope}.${event}`, entry);
    }
    return entry;
  }

  function readTraceNowMs(): number {
    try {
      const now = window?.performance?.now?.();
      if (Number.isFinite(now)) return now;
    } catch {
      // ignore
    }
    return Date.now();
  }

  function createStageTimingTrace(scope: string, traceId: string, basePayload: Record<string, unknown> = {}) {
    const startedAt = readTraceNowMs();
    let previousAt = startedAt;

    return function markStageTiming(stage: string, extraPayload: Record<string, unknown> = {}) {
      const now = readTraceNowMs();
      const sinceStartMs = Math.max(0, now - startedAt);
      const sincePreviousMs = Math.max(0, now - previousAt);
      previousAt = now;
      return recordLifecycleTrace(
        scope,
        'stage_timing',
        {
          debugKind: 'stage_timing',
          stage,
          elapsedMs: Math.round(sincePreviousMs * 10) / 10,
          sinceStartMs: Math.round(sinceStartMs * 10) / 10,
          ...basePayload,
          ...extraPayload,
        },
        traceId,
      );
    };
  }

  function logImageBridge(step: string, detail: Record<string, unknown> = {}) {
    debugConsoleLog(`[stream-demo:image-bridge] ${step}`, detail);
  }

  function normalizePluginNativeLlmImageGenerationRequestId(payload: unknown): string {
    if (payload && typeof payload === 'object') {
      const rawId =
        (payload as { id?: unknown; requestId?: unknown }).id ?? (payload as { requestId?: unknown }).requestId;
      const id = String(rawId ?? '').trim();
      if (id) return id;
    }
    return `anonymous-${Date.now()}`;
  }

  function markPluginNativeLlmImageGenerationStarted(payload: unknown) {
    const requestId = normalizePluginNativeLlmImageGenerationRequestId(payload);
    activePluginNativeLlmImageGenerationRequests.add(requestId);
    lastPluginNativeLlmImageGenerationSettledAt = 0;
    recordLifecycleTrace('pluginNativeLlmImageGeneration', 'request', {
      requestId,
      activeCount: activePluginNativeLlmImageGenerationRequests.size,
    });
  }

  function markPluginNativeLlmImageGenerationFinished(payload: unknown) {
    const requestId = normalizePluginNativeLlmImageGenerationRequestId(payload);
    activePluginNativeLlmImageGenerationRequests.delete(requestId);
    lastPluginNativeLlmImageGenerationSettledAt = Date.now();
    recordLifecycleTrace('pluginNativeLlmImageGeneration', 'response', {
      requestId,
      activeCount: activePluginNativeLlmImageGenerationRequests.size,
    });
    const recentIntent = imageRecentIntentStore.read();
    if (recentIntent?.messageId != null) {
      syncPendingRequestHintsFromDom();
      queueGeneratedImageEntityRefresh([recentIntent.messageId], 'plugin_native_llm_image_generation_response');
      scheduleHostImageDataReconcile('plugin_native_llm_image_generation_response', [recentIntent.messageId]);
      schedulePluginNativePromptPlaceholderReconcile('plugin_native_llm_image_generation_response', [recentIntent.messageId]);
    }
  }

  function hasActivePluginNativeLlmImageGenerationRequest(): boolean {
    return activePluginNativeLlmImageGenerationRequests.size > 0;
  }

  function isWithinPluginNativeLlmImageGenerationResponseGrace(): boolean {
    return (
      lastPluginNativeLlmImageGenerationSettledAt > 0 &&
      Date.now() - lastPluginNativeLlmImageGenerationSettledAt < IMAGE_GENERATION_LLM_RESPONSE_HANDOFF_GRACE_MS
    );
  }

  function shouldContinuePluginNativeHandoffWait(shortDeadline: number, extendedDeadline: number): boolean {
    if (Date.now() < shortDeadline) return true;
    if (Date.now() >= extendedDeadline) return false;
    return hasActivePluginNativeLlmImageGenerationRequest() || isWithinPluginNativeLlmImageGenerationResponseGrace();
  }

  function bindPluginNativeLlmImageGenerationEvents(): StopHandle[] {
    if (typeof eventOn !== 'function') return [];
    return [
      eventOn(CHATU8_LLM_IMAGE_GEN_REQUEST_EVENT as any, payload => {
        markPluginNativeLlmImageGenerationStarted(payload);
      }),
      eventOn(CHATU8_LLM_IMAGE_GEN_RESPONSE_EVENT as any, payload => {
        markPluginNativeLlmImageGenerationFinished(payload);
      }),
    ].filter(Boolean) as StopHandle[];
  }

  function syncPendingRequestHintsFromDom() {
    const seen = new Set<string>();
    let registered = 0;

    for (const doc of collectReachableHostDocuments()) {
      const buttons = Array.from(doc.querySelectorAll(CHATU8_IMAGE_BUTTON_SELECTOR)) as HTMLElement[];
      for (const button of buttons) {
        const requestId = String(
          button.dataset.requestId ??
            button.getAttribute('data-request-id') ??
            button.dataset.stableId ??
            button.getAttribute('data-stable-id') ??
            '',
        ).trim();
        if (!requestId || seen.has(requestId)) continue;

        const prompt = String(button.getAttribute('data-image-tag') ?? button.getAttribute('data-link') ?? '').trim();
        const carrier =
          (button.closest(
            '.assistant-body[data-message-id], .assistant-card[data-message-id], .transcript-entry[data-message-id]',
          ) as HTMLElement | null) ?? (button.closest('.mes[mesid]') as HTMLElement | null);

        const rawMessageId = Number(
          carrier?.dataset?.messageId ?? carrier?.getAttribute?.('data-message-id') ?? carrier?.getAttribute?.('mesid'),
        );
        const recentIntent = imageRecentIntentStore.read();
        const normalizedMessageId =
          Number.isFinite(rawMessageId) && rawMessageId >= 0
            ? Math.trunc(rawMessageId)
            : recentIntent?.source === 'transcript'
              ? recentIntent.messageId
              : null;
        if (normalizedMessageId == null) continue;

        seen.add(requestId);
        const hintBinding = imagePendingTaskManager.registerHint({
          messageId: normalizedMessageId,
          requestId,
          prompt,
        });
        registered += 1;
        if (hintBinding?.bufferedResponse) {
          syncTranscriptItemsFromHostData('host.plugin_native_response_after_dom_hint', [normalizedMessageId]);
          queueGeneratedImageEntityRefresh([normalizedMessageId], 'host.plugin_native_response_after_dom_hint');
          scheduleHostImageDataReconcile('host.plugin_native_response_after_dom_hint', [normalizedMessageId]);
        }
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
    return collectSelectedChatu8ImageEntries(message);
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

    if (changedMessageIds.length === 0) return changedMessageIds;

    queueGeneratedImageEntityRefresh(changedMessageIds, reason);
    logImageBridge('host-data-synced', {
      reason,
      changedMessageIds,
    });
    return changedMessageIds;
  }

  function scheduleHostImageDataReconcile(reason: string, messageIds: number[] = []) {
    const normalizedMessageIds = [
      ...new Set(messageIds.map(id => Math.trunc(Number(id))).filter(id => Number.isFinite(id) && id >= 0)),
    ];
    if (normalizedMessageIds.length === 0) return;

    for (const delayMs of HOST_IMAGE_RESPONSE_RECONCILE_DELAYS_MS) {
      const timer = window.setTimeout(() => {
        hostImageDataReconcileTimers.delete(timer);
        const changedMessageIds = syncTranscriptItemsFromHostData(`${reason}:delay_${delayMs}`, normalizedMessageIds);
        queueGeneratedImageEntityRefresh(normalizedMessageIds, `${reason}:delay_${delayMs}`);
        if (changedMessageIds.length > 0) {
          logImageBridge('host-data-reconcile-hit', {
            reason,
            delayMs,
            changedMessageIds,
          });
        }
      }, delayMs);
      hostImageDataReconcileTimers.add(timer);
    }
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
    debugConsoleLog('[Debug] shouldShowOpeningSetup', {
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

    const currentWorldModeId =
      String(openingPayload.value.world_mode_id ?? '').trim() || String(fallback.world_mode_id ?? '').trim();
    const effectiveSchema = getEffectiveFormSchema(openingPreset.value, currentWorldModeId);
    const effectiveDefaultMeta = getEffectiveDefaultMeta(openingPreset.value, currentWorldModeId);

    for (const field of effectiveSchema) {
      const key = field.key;
      const currentValue = String(nextFormValues[key] ?? '').trim();
      const fallbackValue =
        String(field.default_value ?? '').trim() || String(fallback.form_values?.[key] ?? '').trim();
      if (!currentValue && fallbackValue) {
        nextFormValues[key] = fallbackValue;
        changed = true;
      }
    }

    const nextWorldModeId = currentWorldModeId;
    const nextRouteId = String(openingPayload.value.route_id ?? '').trim() || String(fallback.route_id ?? '').trim();

    const currentMeta = openingPayload.value.meta ?? { time: '', location: '', character: '' };
    let metaChanged = false;
    const nextMeta = {
      character: String(currentMeta.character ?? '').trim(),
      time: String(currentMeta.time ?? '').trim(),
      location: String(currentMeta.location ?? '').trim(),
    };
    if (!nextMeta.character && effectiveDefaultMeta.character) {
      nextMeta.character = effectiveDefaultMeta.character;
      metaChanged = true;
    }
    if (!nextMeta.time && effectiveDefaultMeta.time) {
      nextMeta.time = effectiveDefaultMeta.time;
      metaChanged = true;
    }
    if (!nextMeta.location && effectiveDefaultMeta.location) {
      nextMeta.location = effectiveDefaultMeta.location;
      metaChanged = true;
    }

    if (
      changed ||
      metaChanged ||
      nextWorldModeId !== String(openingPayload.value.world_mode_id ?? '').trim() ||
      nextRouteId !== String(openingPayload.value.route_id ?? '').trim()
    ) {
      openingPayload.value = {
        ...openingPayload.value,
        world_mode_id: nextWorldModeId,
        route_id: nextRouteId,
        meta: nextMeta,
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
    debugConsoleLog('[Debug] restoreReaderChatState openingPayload', {
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
    const nextWorldModeId = worldMode?.id || value;
    const nextRouteId = String(openingPayload.value.route_id ?? '').trim() || worldMode?.recommended_main_route || '';
    const shouldResetResult = openingPayload.value.state === 'ready';

    const effectiveSchema = getEffectiveFormSchema(openingPreset.value, nextWorldModeId);
    const effectiveDefaults = getEffectiveDefaultMeta(openingPreset.value, nextWorldModeId);
    const currentFormValues = openingPayload.value.form_values ?? {};
    const nextFormValues: Record<string, string> = {};
    effectiveSchema.forEach(field => {
      const key = field.key;
      const existing = String(currentFormValues[key] ?? '').trim();
      nextFormValues[key] = existing || String(field.default_value ?? '').trim();
    });

    const currentMeta = openingPayload.value.meta ?? {
      time: '',
      location: '',
      character: '',
    };
    const nextMeta = {
      character: String(currentMeta.character ?? '').trim() || effectiveDefaults.character,
      time: String(currentMeta.time ?? '').trim() || effectiveDefaults.time,
      location: String(currentMeta.location ?? '').trim() || effectiveDefaults.location,
    };

    openingPayload.value = {
      ...openingPayload.value,
      state: shouldResetResult ? 'configuring' : openingPayload.value.state,
      world_mode_id: nextWorldModeId,
      route_id: nextRouteId,
      meta: nextMeta,
      form_values: nextFormValues,
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

  function collectPluginNativeHandoffDiagnostics(messageId: number): Record<string, unknown> {
    const normalizedId = Math.trunc(Number(messageId));
    const ctx = readHostContext();
    const chat = ctx?.chat;
    const chatLength = Number(chat?.length);
    const messageDetail = readChatMessageDetail(normalizedId);
    const messageText = String(messageDetail?.mes ?? messageDetail?.message ?? '');
    const chatu8Settings = ctx?.extensionSettings?.['st-chatu8'] ?? {};
    const hostDocuments = collectHostDocuments();
    const handoffSelector = `${CHATU8_IMAGE_BUTTON_SELECTOR}, ${CHATU8_IMAGE_SPAN_SELECTOR}, ${CHATU8_IMAGE_CONTAINER_SELECTOR}`;
    const hostMesTextSnapshots = hostDocuments.map((doc, index) => {
      const mes = doc.querySelector(`.mes[mesid="${normalizedId}"]`) as HTMLElement | null;
      const mesText = mes?.querySelector('.mes_text') as HTMLElement | null;
      const style = mes ? doc.defaultView?.getComputedStyle?.(mes) : null;
      return {
        index,
        isCurrentDocument: doc === document,
        hasMes: Boolean(mes),
        hasMesText: Boolean(mesText),
        injected: Boolean(mes?.hasAttribute('data-ui-injected-mes')),
        mesDisplay: style?.display ?? '',
        mesVisibility: style?.visibility ?? '',
        mesOpacity: style?.opacity ?? '',
        mesTextLength: String(mesText?.textContent ?? '').length,
        promptTokenCount: collectChatu8PromptTokens(String(mesText?.textContent ?? '')).length,
        imageButtonCount: mesText?.querySelectorAll(CHATU8_IMAGE_BUTTON_SELECTOR).length ?? 0,
        imageSpanCount: mesText?.querySelectorAll(CHATU8_IMAGE_SPAN_SELECTOR).length ?? 0,
        imageContainerCount: mesText?.querySelectorAll(CHATU8_IMAGE_CONTAINER_SELECTOR).length ?? 0,
        handoffNodeCount: mesText?.querySelectorAll(handoffSelector).length ?? 0,
      };
    });

    return {
      messageId: normalizedId,
      chatLength: Number.isFinite(chatLength) ? chatLength : null,
      lastMessageIndex: Number.isFinite(chatLength) ? chatLength - 1 : null,
      messageExists: Boolean(messageDetail),
      messageTextLength: messageText.length,
      messagePromptTokenCount: collectChatu8PromptTokens(messageText).length,
      autoLlmImageGen: isChatu8AutoLlmImageGenerationEnabled(),
      chatu8ScriptEnabled: chatu8Settings?.scriptEnabled ?? null,
      chatu8AutoClickGenerate: chatu8Settings?.zidongdianji ?? null,
      chatu8AutoClickGenerate2: chatu8Settings?.zidongdianji2 ?? null,
      chatu8StartTag: chatu8Settings?.startTag ?? null,
      chatu8EndTag: chatu8Settings?.endTag ?? null,
      pendingTasks: imagePendingTaskManager.getDebugState(),
      recentIntent: imageRecentIntentStore.read(),
      hostDocumentCount: hostDocuments.length,
      hostMesTextSnapshots,
    };
  }

  /**
   * 将容器楼层之后的所有宿主楼层设为 is_hidden，
   * 让酒馆不渲染它们的 DOM（包括其中的 iframe 前端界面），
   * 同层 UI 通过 getChatMessages({ hide_state: 'all' }) 自行读取并渲染。
   */
  async function applyHidePolicy(reason: string) {
    if (!isOpeningWorkbenchHostActive() || !isActiveOpeningWorkbenchScope()) return;
    if (nativeGenerationRevealActive) return;
    if (hidePolicyRunning) {
      hidePolicyRerun = true;
      return;
    }
    hidePolicyRunning = true;
    try {
      do {
        hidePolicyRerun = false;
        if (nativeGenerationRevealActive) return;
        const patch = readMessageMetasAfterContainer().map(item => ({ message_id: item.message_id, is_hidden: true }));
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
    syncHostVisualHideFromCurrentState();
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
    cancelScheduledStreamTranscriptPatch();
    generationStops.forEach(stop => stop?.stop?.());
    generationStops = [];
    generationListenerEpochController.invalidate();
  }

  function suppressLifecycleEchoEvents(eventNames: string[], durationMs = 1200) {
    lifecycleEchoSuppressUntilMs = Math.max(lifecycleEchoSuppressUntilMs, Date.now() + durationMs);
    lifecycleEchoSuppressedHostEvents = [
      ...new Set([...lifecycleEchoSuppressedHostEvents, ...eventNames.map(name => String(name))]),
    ];
  }

  async function emitOfficialGenerationStartLifecycle(type: 'normal' | 'regenerate') {
    const traceId = resolveTraceId('lifecycle');
    suppressLifecycleEchoEvents([String(tavern_events.GENERATION_STARTED)]);
    try {
      await eventEmit(tavern_events.GENERATION_STARTED as any, type);
      recordLifecycleTrace(
        'emitOfficialGenerationStartLifecycle',
        'generation_started_emitted',
        {
          type,
        },
        traceId,
      );
    } catch {
      // ignore
    }
  }

  async function emitOfficialGenerationLifecycle(messageId: number | null | undefined, type: 'normal' | 'regenerate') {
    const normalizedId = Number(messageId);
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;
    const traceId = resolveTraceId('lifecycle');
    suppressLifecycleEchoEvents([
      String(tavern_events.MESSAGE_RECEIVED),
      String(tavern_events.GENERATION_ENDED),
      String(tavern_events.MESSAGE_UPDATED),
    ]);

    recordLifecycleTrace(
      'emitOfficialGenerationLifecycle',
      'start',
      {
        messageId: Math.trunc(normalizedId),
        type,
      },
      traceId,
    );

    // 在 emit 生命周期事件前注入宿主 DOM 节点
    // autoLLMClick 的 findElement 在 GENERATION_ENDED 后立即查 DOM
    const hostRendered = await ensureHostMesTextRendered(Math.trunc(normalizedId));
    recordLifecycleTrace(
      'emitOfficialGenerationLifecycle',
      'host_mes_text_checked',
      {
        messageId: Math.trunc(normalizedId),
        hostRendered,
        diagnostics: collectPluginNativeHandoffDiagnostics(Math.trunc(normalizedId)),
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

    const messageDetail = readChatMessageDetail(Math.trunc(normalizedId));
    const messageText = String(messageDetail?.mes ?? messageDetail?.message ?? '');
    const shouldWaitForPluginNativeHandoff =
      collectChatu8PromptTokens(messageText).length > 0 || isChatu8AutoLlmImageGenerationEnabled();
    if (shouldWaitForPluginNativeHandoff) {
      recordLifecycleTrace(
        'emitOfficialGenerationLifecycle',
        'plugin_native_handoff_wait_start',
        {
          messageId: Math.trunc(normalizedId),
          hasPromptTokens: collectChatu8PromptTokens(messageText).length > 0,
          autoLlmImageGen: isChatu8AutoLlmImageGenerationEnabled(),
          diagnostics: collectPluginNativeHandoffDiagnostics(Math.trunc(normalizedId)),
        },
        traceId,
      );
      await waitForPluginImageGenerationHandoff(Math.trunc(normalizedId));
    }
  }

  async function waitForNativeMvuMessageWriteback(messageId: number) {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) {
      return Promise.resolve({ status: 'blocked', reason: 'invalid_message_id', message_id: null });
    }
    if (typeof eventOn !== 'function') {
      return Promise.resolve({ status: 'skipped', reason: 'event_unavailable', message_id: normalizedId });
    }
    if (typeof Mvu === 'undefined' || !Mvu?.events?.BEFORE_MESSAGE_UPDATE) {
      return Promise.resolve({ status: 'skipped', reason: 'mvu_event_unavailable', message_id: normalizedId });
    }

    return new Promise<{ status: string; reason: string; message_id: number }>(resolve => {
      let settled = false;
      let stop: StopHandle = null;
      function finish(result: { status: string; reason: string; message_id: number }) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        stop?.stop?.();
        resolve(result);
      }

      const timeoutId = window.setTimeout(() => {
        finish({ status: 'skipped', reason: 'timeout', message_id: normalizedId });
      }, 2500);

      try {
        stop = eventOn(Mvu.events.BEFORE_MESSAGE_UPDATE as any, async (context: any) => {
          const messageContent = String(context?.message_content ?? '').trim();
          const updateBlocks = extractMvuUpdateVariableBlocks(messageContent);
          if (updateBlocks.length === 0) return;

          try {
            const chatMessage = getChatMessages(normalizedId, { hide_state: 'all' })?.[0] as
              | { message?: unknown; mes?: unknown }
              | undefined;
            const existingMessage = String(chatMessage?.message ?? chatMessage?.mes ?? '');
            const mergedMessage = mergeMvuWritebackBlocksIntoAssistantText(existingMessage, messageContent);
            if (!mergedMessage || mergedMessage === existingMessage.trim()) {
              finish({ status: 'skipped', reason: 'already_present', message_id: normalizedId });
              return;
            }
            await setChatMessages([{ message_id: normalizedId, message: mergedMessage, is_hidden: false }], {
              refresh: 'affected',
            });
            upsertTranscriptItem(
              createLocalTranscriptItem({
                id: normalizedId,
                role: 'assistant',
                raw: mergedMessage,
                hidden: false,
              }),
            );
            mvuSourceRevision.value += 1;
            finish({ status: 'applied', reason: 'native_message_writeback_merged', message_id: normalizedId });
          } catch (error) {
            finish({
              status: 'error',
              reason: error instanceof Error ? error.message : String(error),
              message_id: normalizedId,
            });
          }
        }) as StopHandle;
      } catch (error) {
        finish({
          status: 'error',
          reason: error instanceof Error ? error.message : String(error),
          message_id: normalizedId,
        });
      }
    });
  }

  function syncTranscriptFlags(items: TranscriptItem[]): TranscriptItem[] {
    return items.map(item => {
      const isLatest = assistantMessageId.value === item.message_id;
      const isStreaming = shouldTreatLatestAssistantAsStreaming({
        isLatest,
        status: status.value,
        phase: item.phase,
        busy: busy.value,
      });
      if (item.isLatest === isLatest && item.isStreaming === isStreaming) return item;
      return {
        ...item,
        isLatest,
        isStreaming,
      };
    });
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
      busy: busy.value,
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
      const rawMessage = String(hostMessage?.message ?? hostMessage?.mes ?? '');
      const role = resolveTranscriptRole({
        rawRole,
        rawMessage,
        isOpeningResult,
      });

      upsertTranscriptItem(
        buildTranscriptItem({
          id: messageId,
          role,
          raw: rawMessage,
          hidden: hostMessage?.is_hidden === true,
          isOpening: existingItem?.isOpening ?? isOpeningResult,
          canReroll: existingItem?.canReroll ?? false,
          latestAssistantId: latestAssistantItem.value?.message_id ?? assistantMessageId.value,
          status: status.value,
          busy: busy.value,
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
            data: message?.data,
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

  function readPersistedHiddenIdSetForActiveContainer(): Set<number> {
    const containerId = getActiveContainerMessageId();
    const savedState = readHideState();
    if (!savedState || containerId == null || savedState.containerMessageId !== containerId) return new Set();
    return new Set(savedState.hiddenMessageIds.map(id => Math.trunc(Number(id))).filter(id => Number.isFinite(id)));
  }

  function readAllChatMessageMetasRaw(): ChatMessageMeta[] {
    const persistedHiddenIds = readPersistedHiddenIdSetForActiveContainer();
    try {
      const ctx = readHostContext();
      const chat = ctx?.chat;
      const chatLen =
        chat != null && typeof chat === 'object' && typeof (chat as any).length === 'number'
          ? (chat as any).length
          : -1;
      if (chat != null && typeof chat === 'object' && chatLen > 0) {
        const metas = Array.from({ length: chatLen }, function (_: any, index: number) {
          const message = (chat as any)[index];
          if (!message || typeof message !== 'object') return null;
          const messageId = Math.trunc(Number(message?.message_id ?? index));
          if (!Number.isFinite(messageId) || messageId < 0) return null;
          const depthSummaryInfo = estimateDepthRegexSummaryInfo(message?.mes);
          return {
            message_id: messageId,
            role: resolveHostMessageRole(message),
            is_hidden: message?.is_hidden === true || persistedHiddenIds.has(messageId),
            messageLength: typeof message?.mes === 'string' ? message.mes.length : 0,
            hasDepthSummary: depthSummaryInfo.hasDepthSummary,
            depthSummaryLength: depthSummaryInfo.depthSummaryLength,
            data: message?.data,
          };
        }).filter(Boolean) as ChatMessageMeta[];
        if (metas.length > 0) return metas;
      }
    } catch (e) {
      console.warn('[Debug] readAllChatMessageMetasRaw context error', { error: String(e) });
    }

    return readAllChatMessagesRaw().map(item => ({
      message_id: item.message_id,
      role: item.role,
      is_hidden: item.is_hidden === true || persistedHiddenIds.has(item.message_id),
      messageLength: typeof item.message === 'string' ? item.message.length : 0,
      ...estimateDepthRegexSummaryInfo(item.message),
      data: item.data,
    }));
  }

  function readMessagesAfterContainer(): BaseChatMessage[] {
    const containerId = getActiveContainerMessageId();
    // 直接从宿主 chat 数组读取，绕过 getChatMessages 对 is_hidden 的潜在过滤
    const all = readAllChatMessagesRaw();
    return all.filter(
      item => Number.isFinite(item.message_id) && (containerId == null || item.message_id > containerId),
    );
  }

  function readMessageMetasAfterContainer(): ChatMessageMeta[] {
    const containerId = getActiveContainerMessageId();
    return readAllChatMessageMetasRaw().filter(
      item => Number.isFinite(item.message_id) && (containerId == null || item.message_id > containerId),
    );
  }

  function collectBoundedNativeGenerationRevealIds(reason: string): number[] {
    const hiddenMessages = readMessageMetasAfterContainer()
      .filter(item => item.is_hidden === true)
      .map(item => ({
        message_id: item.message_id,
        messageLength: item.messageLength ?? 0,
        hasDepthSummary: item.hasDepthSummary === true,
        depthSummaryLength: item.depthSummaryLength ?? 0,
      }));
    const revealIds = collectGenerationRevealMessageIds({
      hiddenMessages,
      nearRawRevealMessages: SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES,
      maxFarSummaryMessages: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_MESSAGES,
      maxFarSummaryCharacters: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_CHARS,
    });
    const nearRawRevealIds = [...hiddenMessages]
      .sort((a, b) => b.message_id - a.message_id)
      .slice(0, SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES)
      .map(item => item.message_id)
      .filter(id => revealIds.includes(id));
    const farSummaryRevealIds = hiddenMessages
      .filter(item => revealIds.includes(item.message_id) && !nearRawRevealIds.includes(item.message_id))
      .filter(item => item.hasDepthSummary === true)
      .map(item => item.message_id);
    recordLifecycleTrace('nativeGenerationReveal', 'bounded_reveal_prepared', {
      reason,
      revealStrategy: 'regex_depth_summary',
      hiddenCount: hiddenMessages.length,
      revealCount: revealIds.length,
      nearRawRevealCount: nearRawRevealIds.length,
      farSummaryRevealCount: farSummaryRevealIds.length,
      summaryStructuredHiddenCount: hiddenMessages.filter(item => item.hasDepthSummary === true).length,
      hiddenCharacters: hiddenMessages.reduce((sum, item) => sum + (item.messageLength ?? 0), 0),
      revealCharacters: hiddenMessages
        .filter(item => revealIds.includes(item.message_id))
        .reduce((sum, item) => sum + (item.messageLength ?? 0), 0),
      estimatedPromptCharacters:
        hiddenMessages
          .filter(item => nearRawRevealIds.includes(item.message_id))
          .reduce((sum, item) => sum + (item.messageLength ?? 0), 0) +
        hiddenMessages
          .filter(item => farSummaryRevealIds.includes(item.message_id))
          .reduce((sum, item) => sum + (item.depthSummaryLength ?? 0), 0),
      nearRawRevealMessages: SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES,
      maxFarSummaryMessages: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_MESSAGES,
      maxFarSummaryCharacters: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_CHARS,
      nearRawRevealMessageIds: nearRawRevealIds,
      farSummaryRevealMessageIds: farSummaryRevealIds,
      revealMessageIds: revealIds,
      revealMessageIdsJson: JSON.stringify(revealIds),
    });
    return revealIds;
  }

  function readActiveContainerMessage(): BaseChatMessage | null {
    const containerId = getActiveContainerMessageId();
    if (containerId == null) return null;
    return readAllChatMessagesRaw().find(item => item.message_id === containerId) ?? null;
  }

  function readActiveContainerMessageMeta(): ChatMessageMeta | null {
    const containerId = getActiveContainerMessageId();
    if (containerId == null) return null;
    return readAllChatMessageMetasRaw().find(item => item.message_id === containerId) ?? null;
  }

  function resolveInheritedUserMessageData(): Record<string, unknown> {
    const messages = readMessageMetasAfterContainer()
      .filter(item => Number.isFinite(item.message_id))
      .sort((a, b) => a.message_id - b.message_id);
    const latestMessage = messages[messages.length - 1];
    const inheritanceSourceMessage = latestMessage ?? readActiveContainerMessageMeta();
    const inherited = buildLeanInheritedMessageData(inheritanceSourceMessage?.data);
    const latestMessageId = Number(inheritanceSourceMessage?.message_id);
    if (!Number.isFinite(latestMessageId) || latestMessageId < 0) {
      return inherited;
    }
    try {
      const latestMvuData = Mvu.getMvuData({ type: 'message', message_id: Math.trunc(latestMessageId) });
      if (!latestMvuData || typeof latestMvuData !== 'object') return inherited;
      const statData = _.get(latestMvuData, 'stat_data', null);
      const initializedLorebooks = _.get(latestMvuData, 'initialized_lorebooks', null);
      if (statData && typeof statData === 'object') {
        _.set(inherited, 'stat_data', _.cloneDeep(statData));
      }
      if (initializedLorebooks && typeof initializedLorebooks === 'object') {
        _.set(inherited, 'initialized_lorebooks', _.cloneDeep(initializedLorebooks));
      }
      return inherited;
    } catch {
      return inherited;
    }
  }

  function queueHidePolicy(reason: string) {
    if (nativeGenerationRevealActive) return;
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

    const hiddenIds = readMessageMetasAfterContainer().map(item => item.message_id);

    const record = buildHideStateRecord(containerId, hiddenIds);
    writeHideState(record);
    debugConsoleLog('[stream-demo] hide state persisted', { reason, containerId, hiddenCount: hiddenIds.length });
  }

  function queuePersistHideState(reason: string) {
    if (hideStatePersistTimer) window.clearTimeout(hideStatePersistTimer);
    hideStatePersistTimer = window.setTimeout(() => {
      hideStatePersistTimer = 0;
      persistHideStateNow(reason);
    }, 80);
  }

  function createCurrentRuntimeLease(status: SameLayerRuntimeLeaseStatus): SameLayerRuntimeLease | null {
    if (!isOpeningWorkbenchHostActive() || !isActiveOpeningWorkbenchScope()) return null;
    const containerId = getActiveContainerMessageId();
    if (containerId == null) return null;
    return createSameLayerRuntimeLease({
      sessionId: runtimeLeaseSessionId,
      containerMessageId: containerId,
      status,
    });
  }

  function writeRuntimeLeaseStatus(status: SameLayerRuntimeLeaseStatus) {
    const lease = createCurrentRuntimeLease(status);
    if (!lease) return;
    writeSameLayerRuntimeLease(lease);
    writeSameLayerRuntimeHeartbeat(lease);
  }

  function writeRuntimeLeaseHeartbeat() {
    const lease = createCurrentRuntimeLease('active');
    if (!lease) return;
    writeSameLayerRuntimeHeartbeat(lease);
  }

  function startRuntimeLeaseHeartbeat() {
    if (runtimeLeaseHeartbeatTimer) window.clearInterval(runtimeLeaseHeartbeatTimer);
    runtimeLeaseHeartbeatTimer = window.setInterval(() => {
      writeRuntimeLeaseHeartbeat();
    }, SAME_LAYER_LEASE_HEARTBEAT_MS);
  }

  function stopRuntimeLeaseHeartbeat() {
    if (runtimeLeaseHeartbeatTimer) {
      window.clearInterval(runtimeLeaseHeartbeatTimer);
      runtimeLeaseHeartbeatTimer = 0;
    }
  }

  async function restoreHostVisibilityAfterLeaseReset(reason: string, containerMessageId?: number | null) {
    const hiddenMessages = readMessageMetasAfterContainer().filter(item => item.is_hidden === true);
    if (hiddenMessages.length > 0) {
      await setChatMessages(
        hiddenMessages.map(item => ({ message_id: item.message_id, is_hidden: false })),
        { refresh: 'none' },
      );
    }
    hostVisualHideController.clearFromMessageIds(hiddenMessages.map(item => item.message_id));
    clearHideState();
    clearSameLayerRuntimeLease();
    const heartbeatContainerId = containerMessageId ?? getActiveContainerMessageId();
    if (heartbeatContainerId != null) clearSameLayerRuntimeHeartbeat(heartbeatContainerId);
    debugConsoleLog('[stream-demo] lease reset restored host visibility', {
      reason,
      restoredCount: hiddenMessages.length,
    });
  }

  function syncHostVisualHideFromCurrentState() {
    const hiddenIds = readMessageMetasAfterContainer().map(item => item.message_id);
    hostVisualHideController.applyToMessageIds(hiddenIds);
  }

  async function revealHiddenStoryMessagesForNativeGeneration(reason: string): Promise<void> {
    if (hidePolicyTimer) {
      window.clearTimeout(hidePolicyTimer);
      hidePolicyTimer = 0;
    }
    nativeGenerationRevealActive = true;
    const messagesToReveal = collectBoundedNativeGenerationRevealIds(reason);
    if (messagesToReveal.length > 0) {
      await setChatMessages(
        messagesToReveal.map(id => ({ message_id: id, is_hidden: false })),
        { refresh: 'none' },
      );
    }
  }

  function releaseHiddenStoryMessagesForNativeGeneration() {
    // Reserved for native-generation reveal cleanup that must run before the hide policy is queued again.
  }

  async function disableSameLayerUi(options: { restoreHost?: boolean } = {}) {
    const { restoreHost = true } = options;
    sameLayerDisableRequested = true;
    destroyHostChatInputBridge();
    destroyHostChatInputBridge = () => {};
    saveGuardian?.uninstall();
    saveGuardian = null;
    imageGenerationBridge?.uninstall();
    imageGenerationBridge = null;
    hostVisualHideController.destroy();
    stopRuntimeLeaseHeartbeat();
    writeRuntimeLeaseStatus('closing');

    const hiddenMessages = readMessageMetasAfterContainer()
      .filter(item => item.is_hidden === true)
      .map(item => ({ message_id: item.message_id, is_hidden: false }));
    if (restoreHost && hiddenMessages.length > 0) {
      await setChatMessages(hiddenMessages, { refresh: 'all' });
    }

    clearHideState();
    clearSameLayerRuntimeLease();
    const containerId = getActiveContainerMessageId();
    if (containerId != null) clearSameLayerRuntimeHeartbeat(containerId);
  }

  async function restoreHideState(): Promise<void> {
    if (!isOpeningWorkbenchHostActive() || !isActiveOpeningWorkbenchScope()) return;

    const runtimeLease = readSameLayerRuntimeLease();
    const runtimeHeartbeat =
      runtimeLease == null ? null : readSameLayerRuntimeHeartbeat(runtimeLease.containerMessageId);
    if (runtimeLease && isSameLayerRuntimeLeaseRecoverable(runtimeLease, runtimeHeartbeat) !== true) {
      await restoreHostVisibilityAfterLeaseReset('stale_runtime_lease', runtimeLease.containerMessageId);
      return;
    }

    const savedState = readHideState();
    if (!savedState || savedState.hiddenMessageIds.length === 0) return;

    const containerId = getActiveContainerMessageId();
    if (containerId == null || savedState.containerMessageId !== containerId) {
      debugConsoleLog('[stream-demo] hide state restore skipped', {
        savedContainer: savedState.containerMessageId,
        currentContainer: containerId,
      });
      return;
    }

    const allMessages = readMessageMetasAfterContainer();
    const validHiddenIds = savedState.hiddenMessageIds.filter(savedId =>
      allMessages.some(msg => msg.message_id === savedId),
    );

    if (validHiddenIds.length === 0) return;

    try {
      await setChatMessages(
        validHiddenIds.map(id => ({ message_id: id, is_hidden: true })),
        { refresh: 'none' },
      );
      debugConsoleLog('[stream-demo] hide state restored', {
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

  function hasPluginImageGenerationHandoff(messageId: number): boolean {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return false;

    const hasBoundRequest = imagePendingTaskManager
      .getDebugState()
      .some(task => task.messageId === normalizedId && task.requests.length > 0);
    if (hasBoundRequest) return true;

    const handoffSelector = `${CHATU8_IMAGE_BUTTON_SELECTOR}, ${CHATU8_IMAGE_SPAN_SELECTOR}, ${CHATU8_IMAGE_CONTAINER_SELECTOR}`;
    return collectHostDocuments().some(doc => {
      const mesText = doc.querySelector(`.mes[mesid="${normalizedId}"] .mes_text`) as HTMLElement | null;
      return Boolean(mesText?.querySelector(handoffSelector));
    });
  }

  async function waitForPluginImageGenerationHandoff(messageId: number): Promise<boolean> {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return false;

    const startedAt = Date.now();
    const shortDeadline = startedAt + IMAGE_GENERATION_HANDOFF_TIMEOUT_MS;
    const extendedDeadline = startedAt + IMAGE_GENERATION_LLM_HANDOFF_TIMEOUT_MS;
    const probeDelaysMs = [0, 400, 1200, 2400, 3600, 7500, 15000, 30000, 60000] as const;
    let nextProbeIndex = 0;
    while (shouldContinuePluginNativeHandoffWait(shortDeadline, extendedDeadline)) {
      syncPendingRequestHintsFromDom();
      const elapsedMs = Date.now() - startedAt;
      if (nextProbeIndex < probeDelaysMs.length && elapsedMs >= probeDelaysMs[nextProbeIndex]) {
        recordLifecycleTrace('imageGenerationHandoff', 'probe', {
          messageId: normalizedId,
          elapsedMs,
          probeDelayMs: probeDelaysMs[nextProbeIndex],
          activePluginNativeLlmImageGenerationRequests: activePluginNativeLlmImageGenerationRequests.size,
          withinPluginNativeLlmImageGenerationResponseGrace: isWithinPluginNativeLlmImageGenerationResponseGrace(),
          diagnostics: collectPluginNativeHandoffDiagnostics(normalizedId),
        });
        nextProbeIndex += 1;
      }
      if (hasPluginImageGenerationHandoff(normalizedId)) {
        recordLifecycleTrace('imageGenerationHandoff', 'observed', {
          messageId: normalizedId,
          elapsedMs: Date.now() - startedAt,
          tasks: imagePendingTaskManager.getDebugState(),
          diagnostics: collectPluginNativeHandoffDiagnostics(normalizedId),
        });
        return true;
      }
      await new Promise<void>(resolve => window.setTimeout(resolve, IMAGE_GENERATION_HANDOFF_POLL_MS));
    }

    recordLifecycleTrace('imageGenerationHandoff', 'timeout', {
      messageId: normalizedId,
      timeoutMs: IMAGE_GENERATION_HANDOFF_TIMEOUT_MS,
      extendedTimeoutMs: IMAGE_GENERATION_LLM_HANDOFF_TIMEOUT_MS,
      activePluginNativeLlmImageGenerationRequests: activePluginNativeLlmImageGenerationRequests.size,
      withinPluginNativeLlmImageGenerationResponseGrace: isWithinPluginNativeLlmImageGenerationResponseGrace(),
      tasks: imagePendingTaskManager.getDebugState(),
      diagnostics: collectPluginNativeHandoffDiagnostics(normalizedId),
    });
    return false;
  }

  /**
   * 临时将容器之后的楼层设为 is_hidden: false，执行 action，再恢复 is_hidden: true。
   * 用于图片桥接等需要宿主 DOM 可见的场景。
   */
  async function withHostTranscriptVisible<T>(
    action: () => Promise<T> | T,
    options: HostTranscriptVisibleOptions = {},
  ): Promise<T> {
    if (hidePolicyTimer) {
      window.clearTimeout(hidePolicyTimer);
      hidePolicyTimer = 0;
    }
    const releaseVisualHide = hostVisualHideController.suspend('bridge_visible');
    // 临时取消隐藏
    const messagesToReveal = readMessageMetasAfterContainer()
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
      try {
        await options.beforeRelease?.();
      } catch (error) {
        console.warn('[stream-demo] host transcript visible beforeRelease failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      releaseVisualHide();
      // 恢复隐藏
      queueHidePolicy('bridge_resume');
    }
  }

  async function withPluginNativeMessageLease<T>(
    messageId: number,
    action: () => Promise<T> | T,
    options: HostTranscriptVisibleOptions = {},
  ): Promise<T> {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) {
      return await action();
    }
    if (hidePolicyTimer) {
      window.clearTimeout(hidePolicyTimer);
      hidePolicyTimer = 0;
    }

    const wasHidden = readMessageMetasAfterContainer().some(
      item => item.message_id === normalizedId && item.is_hidden === true,
    );
    const releasePluginNativeLease = hostVisualHideController.leaseMessageIdsForPluginNativeHandoff(
      [normalizedId],
      'plugin_native_handoff',
    );
    if (wasHidden) {
      await setChatMessages([{ message_id: normalizedId, is_hidden: false }], { refresh: 'none' });
    }

    try {
      return await action();
    } finally {
      try {
        await options.beforeRelease?.();
      } catch (error) {
        console.warn('[stream-demo] plugin native message lease beforeRelease failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      releasePluginNativeLease();
      if (wasHidden) {
        await setChatMessages([{ message_id: normalizedId, is_hidden: true }], { refresh: 'none' });
      }
      queueHidePolicy('plugin_native_bridge_resume');
    }
  }

  function queueGeneratedImageEntityRefresh(messageIds: number[] = [], reason = 'generated_image_entity_refresh') {
    if (generatedImageDomMutationTimer) window.clearTimeout(generatedImageDomMutationTimer);
    const normalizedMessageIds = [...new Set(messageIds.map(id => Math.trunc(Number(id))).filter(id => id >= 0))];
    normalizedMessageIds.forEach(id => pendingGeneratedImageRefreshMessageIds.add(id));
    generatedImageDomMutationTimer = window.setTimeout(() => {
      generatedImageDomMutationTimer = 0;
      const recentIntent = imageRecentIntentStore.read();
      const fallbackMessageId = recentIntent?.messageId ?? null;
      if (fallbackMessageId != null) pendingGeneratedImageRefreshMessageIds.add(fallbackMessageId);
      const pendingMessageIds = [...pendingGeneratedImageRefreshMessageIds];
      pendingGeneratedImageRefreshMessageIds.clear();
      if (pendingMessageIds.length === 0) {
        bumpGeneratedImageEntityRevision();
        return;
      }
      pendingMessageIds.forEach(messageId => {
        bumpGeneratedImageEntityRevision(messageId);
        scheduleUiRefresh(['transcriptItems', 'gallery'], reason, [messageId]);
      });
    }, 40);
  }

  function schedulePluginNativePromptPlaceholderReconcile(reason: string, messageIds: number[] = []) {
    const recentIntent = imageRecentIntentStore.read();
    const normalizedMessageIds = [
      ...new Set(
        [
          ...messageIds.map(id => Math.trunc(Number(id))),
          recentIntent?.messageId != null ? Math.trunc(Number(recentIntent.messageId)) : null,
        ].filter((id): id is number => Number.isFinite(id) && id >= 0),
      ),
    ];
    if (normalizedMessageIds.length === 0) return;

    for (const delayMs of PLUGIN_NATIVE_PROMPT_PLACEHOLDER_RECONCILE_DELAYS_MS) {
      const runProbe = () => {
        syncPendingRequestHintsFromDom();
        for (const messageId of normalizedMessageIds) {
          recordLifecycleTrace('pluginNativePromptPlaceholderReconcile', 'probe', {
            reason,
            delayMs,
            messageId,
            diagnostics: collectPluginNativeHandoffDiagnostics(messageId),
          });
        }
        syncTranscriptItemsFromHostData(`${reason}:prompt_placeholder_delay_${delayMs}`, normalizedMessageIds);
        queueGeneratedImageEntityRefresh(normalizedMessageIds, `${reason}:prompt_placeholder_delay_${delayMs}`);
      };

      if (delayMs <= 0) {
        runProbe();
        continue;
      }

      const timer = window.setTimeout(() => {
        hostImageDataReconcileTimers.delete(timer);
        runProbe();
      }, delayMs);
      hostImageDataReconcileTimers.add(timer);
    }
  }

  function queueVisibleGeneratedImageEntityRefresh(reason = 'visible_generated_image_entity_refresh') {
    const visibleAssistantMessageIds = transcript.value
      .filter(item => item.role === 'assistant')
      .map(item => Math.trunc(Number(item.message_id)))
      .filter(id => Number.isFinite(id) && id >= 0);
    queueGeneratedImageEntityRefresh(visibleAssistantMessageIds, reason);
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

  function markOpeningNativeAssistantReady(messageId: number | null, reason: string) {
    if (!openingNativeGenerationActive) return;
    const normalizedMessageId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedMessageId) || normalizedMessageId < 0) return;

    const message = listAllChatMessages().find(item => readMessageId(item) === normalizedMessageId);
    const role = message ? resolveHostMessageRole(message) : 'assistant';
    if (role !== 'assistant') return;

    openingPayload.value = {
      ...openingPayload.value,
      state: 'ready',
      opening_assistant_message_id: normalizedMessageId,
    };
    persistOpeningPayloadNow();
    openingNativeGenerationActive = false;
    nativeSendProxyActive = false;
    nativeGenerationRevealActive = false;
    releaseHiddenStoryMessagesForNativeGeneration();
    busy.value = false;
    status.value = 'done';
    queueHidePolicy(reason);
    queuePersistReaderChatState();
    recordLifecycleTrace('runOpeningNativeGeneration', 'ready', {
      reason,
      openingAssistantMessageId: normalizedMessageId,
    });
  }

  function finishNativeSendProxy(reason: string) {
    if (!nativeSendProxyActive) return;
    if (openingNativeGenerationActive) return;
    nativeSendProxyActive = false;
    nativeGenerationRevealActive = false;
    releaseHiddenStoryMessagesForNativeGeneration();
    busy.value = false;
    status.value = 'done';
    queueHidePolicy(reason);
    recordLifecycleTrace('runNativeSendProxy', 'done', { reason });
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

  function beginPendingImageTask(messageId: number, source: 'transcript' | 'gallery' = 'transcript') {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;
    imagePendingTaskManager.startTask(normalizedId);
    imageRecentIntentStore.mark(normalizedId, source);
    logImageBridge('start-task', {
      messageId: normalizedId,
      source,
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

  async function triggerImageGenerationForMessage(
    messageId: number,
    options: ImageGenerationTriggerOptions = {},
  ): Promise<void> {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;

    await runQueuedHostMessageUpdate({
      queue: postDoneSideEffectsQueue,
      messageId: normalizedId,
      stage: 'auto-image',
      task: async () => {
        let shouldWaitForPluginHandoff = true;
        await withPluginNativeMessageLease(
          normalizedId,
          async () => {
            // Step 1: 确保宿主 DOM 有该楼层的 mes_text 节点（供插件读正文）
            const rendered = await ensureHostMesTextRendered(normalizedId);
            if (!rendered) {
              console.warn('[image] mes_text 注入失败，mesid:', normalizedId);
            }

            // Step 2: 注册持久化任务（imagePendingTaskManager 用）
            beginPendingImageTask(normalizedId);
            markRecentImageIntent(normalizedId, 'transcript');

            // Step 3: 向宿主 mes_text 派发主触发手势，让插件走完整 ClickTrigger 链路
            const mesText =
              collectHostDocuments()
                .map(doc => doc.querySelector(`.mes[mesid="${normalizedId}"] .mes_text`) as HTMLElement | null)
                .find(Boolean) ?? null;
            if (!mesText) {
              console.warn('[image] 注入节点未找到，mesid:', normalizedId);
              shouldWaitForPluginHandoff = false;
              return;
            }

            if (!dispatchHostPrimaryTrigger(mesText, { hostPoint: options.hostPoint ?? null })) {
              console.warn('[image] 宿主触发手势派发失败，mesid:', normalizedId);
            }

            const afterPrimaryTriggerResult = await options.afterPrimaryTrigger?.();
            if (afterPrimaryTriggerResult === false) {
              shouldWaitForPluginHandoff = false;
            }
          },
          {
            beforeRelease: async () => {
              if (!shouldWaitForPluginHandoff) return;
              await waitForPluginImageGenerationHandoff(normalizedId);
            },
          },
        );
      },
    });
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
    const isHostGenerationStarted = name === String(tavern_events.GENERATION_STARTED);
    const isHostStreamTokenEcho =
      name === String(tavern_events.STREAM_TOKEN_RECEIVED) ||
      name === String(tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED);
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
      if (isHostStreamTokenEcho && status.value === 'done') {
        recordLifecycleTrace('handleHostRefreshEvent', 'ignored_post_done_token_echo', {
          name,
        });
        return;
      }
      status.value = 'streaming';
      queuePersistReaderChatState();
      recordLifecycleTrace('handleHostRefreshEvent', 'ignored_busy_token', {
        name,
      });
      return; // 流式进行中，宿主 token 事件不触发 transcript 重建（由 bindGenerationEvents 的 iframe_events 链路独立维护）
    }

    if (name === String(tavern_events.GENERATION_ENDED) && busy.value) {
      queueGenerationFinalizeFromSignal('host.generation_ended', payload[0]);
    }

    if (isHostGenerationStarted) {
      status.value = 'streaming';
      transcript.value = syncTranscriptFlags(transcript.value);
      queuePersistReaderChatState();
    }

    const refreshType = mapHostRefreshType(name);
    const messageId = resolveHostRefreshMessageId(name, payload);
    if (refreshType === 'host.message_received') {
      markOpeningNativeAssistantReady(messageId, 'host.message_received');
    }
    if (refreshType === 'host.generation_ended' && openingNativeGenerationActive) {
      const latestAssistantId = readMessagesAfterContainer()
        .filter(item => item.role === 'assistant')
        .map(item => item.message_id)
        .sort((a, b) => b - a)[0];
      markOpeningNativeAssistantReady(latestAssistantId ?? null, 'host.generation_ended');
      if (openingNativeGenerationActive) {
        openingNativeGenerationActive = false;
        nativeSendProxyActive = false;
        nativeGenerationRevealActive = false;
        releaseHiddenStoryMessagesForNativeGeneration();
        busy.value = false;
        status.value = 'done';
        queueHidePolicy('host.generation_ended');
      }
    }
    if (refreshType === 'host.generation_ended') {
      finishNativeSendProxy('host.generation_ended');
    }
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
    debugConsoleLog('[Debug] handleHostRefreshEvent', {
      name,
      refreshType,
      messageId,
      domains,
      isOpeningWorkbenchHost: isOpeningWorkbenchHostActive(),
    });
    scheduleUiRefresh(domains, `event:${name}`, messageId != null ? [messageId] : []);
    queueHidePolicy(`event:${name}`);
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
      debugConsoleLog('[Debug] rebuildTranscript data', {
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

      // 先扫一遍确定最新的 assistant 楼层 id，避免 buildTranscriptItem 里
      // `latestAssistantId === id` 判定在流式/重建路径上早于 assistantMessageId 被写回而错失 streamHtml。
      type NormalizedEntry = {
        id: number;
        message: any;
        role: TranscriptItem['role'];
        isOpeningResult: boolean;
      };
      const normalizedEntries: NormalizedEntry[] = [];
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
        normalizedEntries.push({ id, message, role, isOpeningResult });
      }

      for (const entry of normalizedEntries) {
        normalized.push(
          buildTranscriptItem({
            id: entry.id,
            role: entry.role,
            raw: String(entry.message?.message ?? ''),
            hidden: entry.message?.is_hidden === true,
            isOpening: entry.isOpeningResult,
            canReroll: entry.isOpeningResult && canRerollOpeningFromMessages(all),
            latestAssistantId: nextLatestAssistantId,
            status: status.value,
            busy: busy.value,
          }),
        );
      }

      assistantMessageId.value = nextLatestAssistantId;
      transcript.value = syncTranscriptFlags(clipTranscriptItemsForUi(normalized));
      snapshotHostImageDataSignatures(transcript.value.map(item => item.message_id));
      debugConsoleLog('[Debug] rebuildTranscript result', {
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

  function queueNextStreamTranscriptPatch() {
    if (streamTranscriptPatchTimer || streamTranscriptPatchRunning) return;
    streamTranscriptPatchTimer = window.setTimeout(() => {
      streamTranscriptPatchTimer = 0;
      void flushScheduledStreamTranscriptPatch();
    }, STREAM_TRANSCRIPT_PATCH_INTERVAL_MS);
  }

  function scheduleStreamTranscriptPatch() {
    streamTranscriptPatchDirty = true;
    queueNextStreamTranscriptPatch();
  }

  function cancelScheduledStreamTranscriptPatch() {
    if (streamTranscriptPatchTimer) {
      window.clearTimeout(streamTranscriptPatchTimer);
      streamTranscriptPatchTimer = 0;
    }
    streamTranscriptPatchDirty = false;
  }

  function cancelGenerationSignalFinalize() {
    if (generationSignalFinalizeTimer) {
      window.clearTimeout(generationSignalFinalizeTimer);
      generationSignalFinalizeTimer = 0;
    }
    generationSignalFinalizeReason = '';
  }

  function hasGenerationSignalFinalizedVisibleContent(): boolean {
    return (
      generationSignalFinalized === true &&
      (Boolean(String(finalText.value || streamText.value || '').trim()) ||
        hasRenderableAssistantMessageText(latestPatchedMessage))
    );
  }

  function normalizeSignalFinalText(text: unknown): string {
    if (typeof text !== 'string') return '';
    const normalized = text.trim();
    if (/^\d{1,8}$/.test(normalized)) return '';
    if (isVariableUpdateOnlyGenerationText(normalized)) return '';
    return normalized;
  }

  function queueGenerationFinalizeFromSignal(
    reason: 'iframe.generation_ended' | 'host.generation_ended',
    text?: unknown,
  ) {
    const candidateFinalText = normalizeSignalFinalText(text);
    if (candidateFinalText) {
      finalText.value = candidateFinalText;
    }
    if (!busy.value && status.value !== 'streaming') return;
    cancelGenerationSignalFinalize();
    generationSignalFinalizeReason = reason;
    generationSignalFinalizeTimer = window.setTimeout(() => {
      const queuedReason = generationSignalFinalizeReason || reason;
      generationSignalFinalizeTimer = 0;
      generationSignalFinalizeReason = '';
      void finalizeAssistantMessageFromSignal(queuedReason);
    }, 120);
  }

  async function finalizeAssistantMessageFromSignal(reason: string) {
    if (generationSignalFinalizing || generationSignalFinalized) return;
    const fallbackText = String(finalText.value || streamText.value || '').trim();
    if (!fallbackText) return;

    generationSignalFinalizing = true;
    try {
      finalText.value = fallbackText;
      status.value = 'persisting';
      cancelScheduledStreamTranscriptPatch();
      if (
        shouldEnsureAssistantPlaceholderBeforeFinalize({
          assistantMessageId: assistantMessageId.value,
          placeholderCreating: assistantPlaceholderCreating,
          finalText: fallbackText,
        })
      ) {
        await ensureAssistantPlaceholderReady(`signal_${reason}`);
      }
      await patchAssistantMessage('done');
      generationSignalFinalized = true;
      status.value = 'done';
      transcript.value = syncTranscriptFlags(transcript.value);
      queueHidePolicy(reason);
      await flushExplicitChatSave(`generation_signal:${reason}`);
      recordLifecycleTrace('finalizeAssistantMessageFromSignal', 'done', {
        reason,
        assistantMessageId: assistantMessageId.value,
        finalSignature: buildDebugMessageSignature(fallbackText),
      });
    } catch (error) {
      recordLifecycleTrace('finalizeAssistantMessageFromSignal', 'error', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      generationSignalFinalizing = false;
    }
  }

  async function flushScheduledStreamTranscriptPatch() {
    if (streamTranscriptPatchTimer) {
      window.clearTimeout(streamTranscriptPatchTimer);
      streamTranscriptPatchTimer = 0;
    }
    if (streamTranscriptPatchRunning) {
      streamTranscriptPatchDirty = true;
      return;
    }
    if (!streamTranscriptPatchDirty) return;

    streamTranscriptPatchDirty = false;
    streamTranscriptPatchRunning = true;
    try {
      await patchAssistantMessage('stream');
    } finally {
      streamTranscriptPatchRunning = false;
      if (streamTranscriptPatchDirty && busy.value && status.value === 'streaming') {
        queueNextStreamTranscriptPatch();
      }
    }
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

    const reasoningVisibleText = resolveReasoningVisibleText(
      reasoningStreamState,
      phase === 'done' ? finalText.value : '',
      phase,
    );
    const latestNativeReasoningText = extractNativeReasoningText(readChatMessageDetail(messageId));
    if (latestNativeReasoningText) {
      nativeReasoningText.value = latestNativeReasoningText;
    }
    const hasNativeReasoning = nativeReasoningText.value.trim().length > 0;
    const nextMessageBody =
      reasoningVisibleText ||
      (phase === 'stream' && (hasNativeReasoning || reasoningStreamState.reasoningState === 'thinking')
        ? '思考中'
        : '');
    const nextMessage = buildStreamDemoMessage(nextMessageBody, phase);
    if (phase === 'done') {
      streamingPreviewCache.delete(Math.trunc(Number(messageId)));
    }
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
        nativeReasoningSignature: buildDebugMessageSignature(nativeReasoningText.value),
        hasNativeReasoning,
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
        await runQueuedHostMessageUpdate({
          queue: postDoneSideEffectsQueue,
          messageId,
          stage: 'host-message-update',
          task: async () => {
            await setChatMessages([{ message_id: messageId, message: nextMessage, is_hidden: false }], {
              refresh: resolveAssistantMessageRefreshMode(phase),
            });
          },
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
          () => ({
            phase,
            sequence,
            messageId,
            nextSignature,
            transcriptAssistantSummary: summarizeTranscriptForDebug(transcript.value),
          }),
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

  async function ensureAssistantPlaceholderReady(reason: AssistantPlaceholderEnsureReason) {
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

  function clearSubmittedComposerDraft(submittedPrompt: string) {
    const submitted = String(submittedPrompt ?? '').trim();
    if (submitted && submitted === String(input.value ?? '').trim()) {
      input.value = '';
    }
  }

  async function settleCancelledGeneration(
    traceId: string,
    caughtMessage: string,
    submittedPrompt: string,
  ): Promise<GenerationFlowResult> {
    cancelGenerationSignalFinalize();
    cancelScheduledStreamTranscriptPatch();
    const assistantId = assistantMessageId.value;
    const partialText = String(finalText.value || streamText.value || '').trim();
    const hasPartialText = partialText.length > 0;

    recordLifecycleTrace(
      'cancelActiveGeneration',
      'settle',
      {
        assistantMessageId: assistantId,
        generationId: activeGenerationId.value,
        hasPartialText,
        message: caughtMessage,
      },
      traceId,
    );
    clearSubmittedComposerDraft(submittedPrompt);

    if (assistantId != null && hasPartialText) {
      finalText.value = partialText;
      status.value = 'done';
      errorText.value = '';
      await patchAssistantMessage('done');
      await flushExplicitChatSave('generation_cancelled_partial');
      transcript.value = syncTranscriptFlags(transcript.value);
      appendLog('info', '已取消生成', '已保留取消前收到的部分正文，未触发额外模型解析。');
      return {
        success: false,
        assistantMessageId: assistantId,
        errorText: 'cancelled',
        hadVisibleAssistantContent: true,
      };
    }

    if (assistantId != null) {
      try {
        await deleteChatMessages([assistantId], { refresh: 'none' });
      } catch {
        // ignore cleanup failure; the explicit save below will still preserve any other completed changes.
      }
      transcript.value = transcript.value.filter(item => item.message_id !== assistantId);
    }
    assistantMessageId.value = null;
    latestPatchedMessage = '';
    status.value = 'idle';
    errorText.value = '';
    await flushExplicitChatSave('generation_cancelled_empty');
    appendLog('info', '已取消生成', '模型尚未返回正文，已清理占位楼层。');
    return {
      success: false,
      assistantMessageId: assistantId,
      errorText: 'cancelled',
      hadVisibleAssistantContent: false,
    };
  }

  function cancelActiveGeneration(): boolean {
    if (!busy.value) return false;
    const generationId = activeGenerationId.value;
    generationCancelRequested.value = true;
    let stopped = false;
    try {
      if (generationId && typeof stopGenerationById === 'function') {
        stopped = stopGenerationById(generationId) === true;
      } else if (!generationId && typeof stopAllGeneration === 'function') {
        stopped = stopAllGeneration() === true;
      }
    } catch (error) {
      console.warn('[stream-demo] cancelActiveGeneration stop request failed', {
        generationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    activeGenerationCancelReject?.(new Error(SAME_LAYER_CANCELLED_ERROR));
    activeGenerationCancelReject = null;
    appendLog(
      stopped ? 'info' : 'error',
      stopped ? '取消生成' : '取消生成（本地）',
      generationId || 'no_generation_id',
    );
    recordLifecycleTrace('cancelActiveGeneration', stopped ? 'requested' : 'requested_local_only', {
      generationId,
    });
    return stopped;
  }

  async function runGenerationFlow(options: GenerationFlowOptions): Promise<GenerationFlowResult> {
    const prompt = String(options.prompt ?? '').trim();
    const traceId = createTraceId(
      options.createUser ? 'send' : options.detachedUserInput === true ? 'opening' : 'regenerate',
    );
    const generationId = createSameLayerGenerationId(traceId);
    const markStageTiming = createStageTimingTrace('runGenerationFlow', traceId, {
      createUser: options.createUser,
      detachedUserInput: options.detachedUserInput === true,
      generationId,
    });
    markStageTiming('entry', {
      promptSignature: buildDebugMessageSignature(prompt),
      promptLength: prompt.length,
      busyAtEntry: busy.value,
    });
    if (!prompt || busy.value) {
      markStageTiming('skip_before_prepare', {
        reason: !prompt ? 'empty_prompt' : 'busy',
      });
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
    markStageTiming('reader_state_prepared');

    activeGenerationTraceId = traceId;
    latestLifecycleTraceId = traceId;
    activeGenerationId.value = generationId;
    generationCancelRequested.value = false;
    busy.value = true;
    status.value = 'preparing';
    streamText.value = '';
    finalText.value = '';
    reasoningStreamState.reset(readTavernReasoningConfig());
    nativeReasoningText.value = '';
    errorText.value = '';
    assistantMessageId.value = null;
    latestPatchedMessage = '';
    hostMesTextPrimedForCurrentGeneration = false;
    cancelScheduledStreamTranscriptPatch();
    cancelGenerationSignalFinalize();
    generationSignalFinalized = false;
    generationSignalFinalizing = false;
    bindGenerationEvents();
    markStageTiming('generation_state_prepared');
    let revealedHiddenIds: number[] = [];
    let hiddenRevealRestored = false;
    const restoreGenerationRevealWindow = async (reason: string) => {
      if (hiddenRevealRestored || revealedHiddenIds.length === 0) return;
      hiddenRevealRestored = true;
      await setChatMessages(
        revealedHiddenIds.map(id => ({ message_id: id, is_hidden: true })),
        { refresh: 'none' },
      );
      recordLifecycleTrace(
        'runGenerationFlow',
        'reveal_window_restored',
        {
          reason,
          revealMessageIds: revealedHiddenIds,
          revealMessageIdsJson: JSON.stringify(revealedHiddenIds),
        },
        traceId,
      );
    };
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
      const lifecycleKindForGenerationStart =
        options.emitLifecycleKind ?? (options.createUser ? 'normal' : 'regenerate');
      markStageTiming('official_generation_start_lifecycle_start');
      await emitOfficialGenerationStartLifecycle(lifecycleKindForGenerationStart);
      markStageTiming('official_generation_start_lifecycle_done');

      if (options.createUser) {
        markStageTiming('resolve_user_data_start');
        const userData = resolveInheritedUserMessageData();
        markStageTiming('resolve_user_data_done', {
          userDataKeys: Object.keys(userData ?? {}),
        });
        markStageTiming('create_user_message_start');
        await createChatMessages([{ role: 'user', message: prompt, is_hidden: false, data: userData }], {
          refresh: 'none',
        });
        markStageTiming('create_user_message_done', {
          lastMessageId: Number(getLastMessageId?.()),
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

      // Opening detached flows need a stable assistant id before generate() so the opening payload can track it.
      // Ordinary sends create the placeholder on the first stream token instead, keeping the host UI responsive
      // while the request is being prepared.
      if (options.detachedUserInput === true) {
        markStageTiming('detached_assistant_placeholder_start');
        await ensureAssistantPlaceholderReady('first_token');
        await options.onAssistantPlaceholderCreated?.(assistantMessageId.value);
        markStageTiming('detached_assistant_placeholder_done', {
          assistantMessageId: assistantMessageId.value,
        });
      }

      markStageTiming('hidden_meta_scan_start');
      const hiddenMessages = readMessageMetasAfterContainer()
        .filter(item => item.is_hidden === true)
        .map(item => ({
          message_id: item.message_id,
          messageLength: item.messageLength ?? 0,
          hasDepthSummary: item.hasDepthSummary === true,
          depthSummaryLength: item.depthSummaryLength ?? 0,
        }));
      const hiddenMessageIds = hiddenMessages.map(item => item.message_id);
      const latestHiddenUserMessageId =
        options.createUser === false && latestUserItem.value?.hidden === true ? latestUserItem.value.message_id : null;
      const hiddenIds = collectGenerationRevealMessageIds({
        detachedUserInput: options.detachedUserInput === true,
        hiddenMessages,
        latestHiddenUserMessageId,
        nearRawRevealMessages: SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES,
        maxFarSummaryMessages: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_MESSAGES,
        maxFarSummaryCharacters: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_CHARS,
      });
      const nearRawRevealIds = [...hiddenMessages]
        .sort((a, b) => b.message_id - a.message_id)
        .slice(0, SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES)
        .map(item => item.message_id)
        .filter(id => hiddenIds.includes(id));
      const farSummaryRevealIds = hiddenMessages
        .filter(item => hiddenIds.includes(item.message_id) && !nearRawRevealIds.includes(item.message_id))
        .filter(item => item.hasDepthSummary === true)
        .map(item => item.message_id);
      const estimatedPromptCharacters =
        hiddenMessages
          .filter(item => nearRawRevealIds.includes(item.message_id))
          .reduce((sum, item) => sum + (item.messageLength ?? 0), 0) +
        hiddenMessages
          .filter(item => farSummaryRevealIds.includes(item.message_id))
          .reduce((sum, item) => sum + (item.depthSummaryLength ?? 0), 0);
      recordLifecycleTrace(
        'runGenerationFlow',
        'reveal_window_prepared',
        {
          revealStrategy: 'regex_depth_summary',
          createUser: options.createUser,
          detachedUserInput: options.detachedUserInput === true,
          hiddenMessageIds,
          latestHiddenUserMessageId,
          revealMessageIds: hiddenIds,
          nearRawRevealCount: nearRawRevealIds.length,
          farSummaryRevealCount: farSummaryRevealIds.length,
          summaryStructuredHiddenCount: hiddenMessages.filter(item => item.hasDepthSummary === true).length,
          hiddenCharacters: hiddenMessages.reduce((sum, item) => sum + (item.messageLength ?? 0), 0),
          revealCharacters: hiddenMessages
            .filter(item => hiddenIds.includes(item.message_id))
            .reduce((sum, item) => sum + (item.messageLength ?? 0), 0),
          estimatedPromptCharacters,
          nearRawRevealMessages: SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES,
          maxFarSummaryMessages: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_MESSAGES,
          maxFarSummaryCharacters: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_CHARS,
          nearRawRevealMessageIds: nearRawRevealIds,
          farSummaryRevealMessageIds: farSummaryRevealIds,
          hiddenMessageIdsJson: JSON.stringify(hiddenMessageIds),
          revealMessageIdsJson: JSON.stringify(hiddenIds),
        },
        traceId,
      );
      markStageTiming('hidden_meta_scan_done', {
        hiddenCount: hiddenMessageIds.length,
        revealCount: hiddenIds.length,
        latestHiddenUserMessageId,
        nearRawRevealCount: nearRawRevealIds.length,
        farSummaryRevealCount: farSummaryRevealIds.length,
        hiddenCharacters: hiddenMessages.reduce((sum, item) => sum + (item.messageLength ?? 0), 0),
        revealCharacters: hiddenMessages
          .filter(item => hiddenIds.includes(item.message_id))
          .reduce((sum, item) => sum + (item.messageLength ?? 0), 0),
        estimatedPromptCharacters,
      });
      debugConsoleLog('[stream-demo] generation reveal window', {
        createUser: options.createUser,
        detachedUserInput: options.detachedUserInput === true,
        hiddenMessageIds,
        latestHiddenUserMessageId,
        revealMessageIds: hiddenIds,
      });
      if (hiddenIds.length > 0) {
        revealedHiddenIds = hiddenIds;
        markStageTiming('hidden_reveal_start', {
          revealCount: hiddenIds.length,
          revealMessageIds: hiddenIds,
        });
        await setChatMessages(
          hiddenIds.map(id => ({ message_id: id, is_hidden: false })),
          { refresh: 'none' },
        );
        markStageTiming('hidden_reveal_done', {
          revealCount: hiddenIds.length,
        });
      } else {
        markStageTiming('hidden_reveal_skipped');
      }

      const cancelPromise = new Promise<string>((_resolve, reject) => {
        activeGenerationCancelReject = reject;
      });
      markStageTiming('generate_call_start');
      const generateCallStartedAt = readTraceNowMs();
      const generatePromise = generate(
        options.detachedUserInput === true
          ? {
              user_input: prompt,
              generation_id: generationId,
              should_silence: true,
              should_stream: true,
              max_chat_history: options.maxChatHistory ?? 0,
            }
          : {
              generation_id: generationId,
              should_silence: true,
              should_stream: true,
              max_chat_history: options.maxChatHistory ?? 'all',
            },
      );
      markStageTiming('generate_call_returned', {
        syncDurationMs: Math.round(Math.max(0, readTraceNowMs() - generateCallStartedAt) * 10) / 10,
      });
      recordLifecycleTrace(
        'runGenerationFlow',
        'generate_requested',
        {
          createUser: options.createUser,
          detachedUserInput: options.detachedUserInput === true,
          generationId,
          maxChatHistory:
            options.detachedUserInput === true ? (options.maxChatHistory ?? 0) : (options.maxChatHistory ?? 'all'),
        },
        traceId,
      );

      markStageTiming('generate_await_start');
      const result = String(await Promise.race([generatePromise, cancelPromise])).trim();
      markStageTiming('generate_await_resolved', {
        resultSignature: buildDebugMessageSignature(result),
        resultLength: result.length,
      });
      activeGenerationCancelReject = null;

      finalText.value = result;
      if (result) {
        reasoningStreamState.setRawText(result);
      }
      status.value = 'persisting';
      cancelGenerationSignalFinalize();
      cancelScheduledStreamTranscriptPatch();
      if (
        shouldEnsureAssistantPlaceholderBeforeFinalize({
          assistantMessageId: assistantMessageId.value,
          placeholderCreating: assistantPlaceholderCreating,
          finalText: result,
        })
      ) {
        markStageTiming('finalize_placeholder_start');
        await ensureAssistantPlaceholderReady('finalize_fallback');
        markStageTiming('finalize_placeholder_done', {
          assistantMessageId: assistantMessageId.value,
        });
      }
      recordLifecycleTrace(
        'runGenerationFlow',
        'generate_resolved',
        {
          resultSignature: buildDebugMessageSignature(result),
        },
        traceId,
      );
      markStageTiming('patch_assistant_done_start', {
        assistantMessageId: assistantMessageId.value,
      });
      await patchAssistantMessage('done');
      markStageTiming('patch_assistant_done_done', {
        assistantMessageId: assistantMessageId.value,
      });
      const finalizedAssistantMessageId = assistantMessageId.value;
      const lifecycleKind = options.emitLifecycleKind ?? (options.createUser ? 'normal' : 'regenerate');
      markStageTiming('post_done_side_effects_start', {
        assistantMessageId: finalizedAssistantMessageId,
        lifecycleKind,
      });
      await runQueuedPostDoneAssistantSideEffects({
        queue: postDoneSideEffectsQueue,
        messageId: finalizedAssistantMessageId,
        lifecycleKind,
        traceId,
        emitOfficialGenerationLifecycle,
        waitForNativeMvuMessageWriteback,
        recordLifecycleTrace,
        warn: console.warn,
      });
      markStageTiming('post_done_side_effects_done', {
        assistantMessageId: finalizedAssistantMessageId,
        lifecycleKind,
      });
      // MVU 额外模型解析也会在官方生命周期后组装提示词；此时仍要保持楼层可见，避免宏为空。
      markStageTiming('restore_reveal_after_side_effects_start');
      await restoreGenerationRevealWindow('post_done_side_effects');
      markStageTiming('restore_reveal_after_side_effects_done');
      status.value = 'done';
      transcript.value = syncTranscriptFlags(transcript.value);
      queueHidePolicy('generation_done');
      // 把"done patch + 官方生命周期事件"合成一次显式 save。
      // 默认情况下这些步骤各自都会调用 saveChatConditionalDebounced，debounce 1s 才落盘；
      // 如果用户在那一秒内刷新页面，保存就丢了。显式 await saveChat 可以保证 jsonl 已经写入，
      // 并让守护器通过 fetch hook 判断本次保存真正成功还是撞 EPERM。
      markStageTiming('explicit_save_start');
      await flushExplicitChatSave('generation_done');
      markStageTiming('explicit_save_done');
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
      const caughtMessage = error instanceof Error ? error.message : String(error);
      if (Boolean(generationCancelRequested.value) || caughtMessage === SAME_LAYER_CANCELLED_ERROR) {
        markStageTiming('cancel_settle_start', {
          message: caughtMessage,
        });
        return await settleCancelledGeneration(traceId, caughtMessage, prompt);
      }
      if (generationSignalFinalizeTimer) {
        const queuedReason = generationSignalFinalizeReason || 'queued_generation_signal';
        cancelGenerationSignalFinalize();
        await finalizeAssistantMessageFromSignal(queuedReason);
      }
      const signalFinalizedVisibleContent = hasGenerationSignalFinalizedVisibleContent();
      if (signalFinalizedVisibleContent) {
        status.value = 'done';
        errorText.value = '';
        transcript.value = syncTranscriptFlags(transcript.value);
        recordLifecycleTrace(
          'runGenerationFlow',
          'error_after_signal_finalize_ignored',
          {
            assistantMessageId: assistantMessageId.value,
            message: caughtMessage,
          },
          traceId,
        );
        appendLog(
          'action',
          '生成完成',
          stripTagsForPreview(finalText.value || streamText.value).slice(0, 80) || '(空回复)',
        );
        return {
          success: true,
          assistantMessageId: assistantMessageId.value,
          result: String(finalText.value || streamText.value || '').trim(),
        };
      }
      status.value = 'error';
      errorText.value = caughtMessage;
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
      markStageTiming('error_caught', {
        message: caughtMessage,
        hadVisibleAssistantContent,
      });
      if (assistantMessageId.value != null) {
        finalText.value = `生成失败：${errorText.value}`;
        try {
          cancelScheduledStreamTranscriptPatch();
          markStageTiming('error_patch_assistant_start');
          await patchAssistantMessage('done');
          markStageTiming('error_patch_assistant_done');
          markStageTiming('error_explicit_save_start');
          await flushExplicitChatSave('generation_error');
          markStageTiming('error_explicit_save_done');
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
      try {
        markStageTiming('finally_restore_reveal_start');
        await restoreGenerationRevealWindow('finally');
        markStageTiming('finally_restore_reveal_done');
      } catch {
        // ignore
      }
      clearGenerationListeners();
      busy.value = false;
      activeGenerationId.value = null;
      activeGenerationCancelReject = null;
      generationCancelRequested.value = false;
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
      markStageTiming('finally_done', {
        finalStatus: status.value,
      });
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

  async function reprocessLatestAssistantVariables() {
    const traceId = createTraceId('mvu-extra-analysis');
    const markStageTiming = createStageTimingTrace('reprocessLatestAssistantVariables', traceId);
    markStageTiming('entry', {
      busyAtEntry: busy.value,
      pendingAtEntry: reprocessVariablesPending.value,
      latestAssistantMessageId: latestAssistantItem.value?.message_id ?? null,
    });
    const latestAssistant = latestAssistantItem.value;
    if (!latestAssistant || latestAssistant.role !== 'assistant') {
      markStageTiming('skip_no_assistant');
      toastr?.info?.('当前还没有可重新解析变量的 assistant 楼层');
      return;
    }
    if (busy.value) {
      markStageTiming('skip_busy', {
        assistantMessageId: latestAssistant.message_id,
      });
      toastr?.warning?.('正文生成中，等待生成结束后再重试变量解析');
      return;
    }
    if (reprocessVariablesPending.value) {
      markStageTiming('skip_pending', {
        assistantMessageId: latestAssistant.message_id,
      });
      return;
    }

    reprocessVariablesPending.value = true;
    recordLifecycleTrace(
      'reprocessLatestAssistantVariables',
      'start',
      {
        assistantMessageId: latestAssistant.message_id,
        assistantSignature: buildDebugMessageSignature(latestAssistant.raw),
      },
      traceId,
    );
    try {
      markStageTiming('hidden_reveal_start', {
        assistantMessageId: latestAssistant.message_id,
      });
      await revealHiddenStoryMessagesForNativeGeneration('mvu_extra_analysis_retry');
      markStageTiming('hidden_reveal_done', {
        assistantMessageId: latestAssistant.message_id,
      });
      markStageTiming('native_retry_click_start', {
        assistantMessageId: latestAssistant.message_id,
      });
      const reprocessResult = await retryMessageExtraAnalysisByNativeMvu(latestAssistant.message_id, {
        refreshMessage: true,
      });
      markStageTiming('native_retry_click_done', {
        assistantMessageId: latestAssistant.message_id,
        retryStatus: reprocessResult.status,
        retryReason: reprocessResult.reason,
      });
      mvuSourceRevision.value += 1;

      if (reprocessResult.status === 'applied') {
        markStageTiming('mvu_writeback_wait_start', {
          assistantMessageId: latestAssistant.message_id,
        });
        await waitForNativeMvuMessageWriteback(latestAssistant.message_id);
        markStageTiming('mvu_writeback_wait_done', {
          assistantMessageId: latestAssistant.message_id,
        });
        appendLog(
          'action',
          '重试额外模型解析',
          `已触发 MVU 原生重试额外模型解析：assistant #${latestAssistant.message_id}`,
        );
        toastr?.success?.('已触发 MVU 原生“重试额外模型解析”');
        recordLifecycleTrace(
          'reprocessLatestAssistantVariables',
          'done',
          {
            assistantMessageId: latestAssistant.message_id,
            retryStatus: reprocessResult.status,
          },
          traceId,
        );
        return;
      }

      const reason = String(reprocessResult.reason ?? reprocessResult.status ?? 'unknown');
      markStageTiming('native_retry_not_applied', {
        assistantMessageId: latestAssistant.message_id,
        reason,
      });
      appendLog('info', '重试额外模型解析未触发', `#${latestAssistant.message_id}: ${reason}`);
      toastr?.warning?.(`重试额外模型解析未触发：${reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markStageTiming('error_caught', {
        assistantMessageId: latestAssistant.message_id,
        message,
      });
      recordLifecycleTrace(
        'reprocessLatestAssistantVariables',
        'error',
        {
          assistantMessageId: latestAssistant.message_id,
          message,
        },
        traceId,
      );
      appendLog('error', '重试额外模型解析失败', message);
      toastr?.error?.(`重试额外模型解析失败：${message}`);
    } finally {
      markStageTiming('finally_start', {
        assistantMessageId: latestAssistant.message_id,
      });
      nativeGenerationRevealActive = false;
      releaseHiddenStoryMessagesForNativeGeneration();
      queueHidePolicy('mvu_extra_analysis_retry_done');
      reprocessVariablesPending.value = false;
      markStageTiming('finally_done', {
        assistantMessageId: latestAssistant.message_id,
      });
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

  async function runOpeningNativeGeneration(compiledPromptSnapshot: string): Promise<boolean> {
    const prompt = String(compiledPromptSnapshot ?? '').trim();
    if (!prompt || busy.value) return false;

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
      compiled_prompt_snapshot: prompt,
      opening_assistant_message_id: null,
    };
    persistOpeningPayloadNow();

    busy.value = true;
    nativeSendProxyActive = true;
    openingNativeGenerationActive = true;
    status.value = 'preparing';
    errorText.value = '';
    readingMode.value = 'following_latest';
    queuePersistReaderChatState();

    try {
      await revealHiddenStoryMessagesForNativeGeneration('opening_native_generation');
      await sendToNativeChat(compiledPromptSnapshot, false);
      appendLog('action', '生成开局', stripTagsForPreview(prompt).slice(0, 80) || '(空开局)');
      return true;
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      openingPayload.value = {
        ...openingPayload.value,
        state: 'configuring',
        compiled_prompt_snapshot: prompt,
        opening_assistant_message_id: null,
      };
      persistOpeningPayloadNow();
      toastr?.error?.(`开局发送失败：${errorText.value}`);
      appendLog('error', '开局发送失败', errorText.value || '未知错误');
      nativeSendProxyActive = false;
      openingNativeGenerationActive = false;
      nativeGenerationRevealActive = false;
      releaseHiddenStoryMessagesForNativeGeneration();
      busy.value = false;
      queueHidePolicy('opening_native_generation_failed');
      return false;
    }
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

    const missing = getEffectiveFormSchema(openingPreset.value, openingPayload.value.world_mode_id).find(
      field => field.required && !String(openingPayload.value.form_values[field.key] ?? '').trim(),
    );
    if (missing) {
      toastr?.warning?.(`请先填写：${missing.label}`);
      return;
    }
    const compiledPromptSnapshot = await buildOpeningCompiledUserInput(openingPreset.value, openingPayload.value, {
      messages: () => readMessagesAfterContainer(),
      setChatMessages,
    });
    await runOpeningDetachedGeneration(compiledPromptSnapshot);
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
    debugConsoleLog('[Debug] bindHistoryRefreshEvents called', {
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
            reasoningStreamState.appendRawToken(tokenText);
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
            }
            scheduleStreamTranscriptPatch();
          })();
        }),
      );
    } catch {
      // ignore
    }

    try {
      generationStops.push(
        eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY as any, (text: string) => {
          if (isStaleListener()) {
            recordLifecycleTrace(
              'bindGenerationEvents',
              'token_full_ignored_stale',
              {
                listenerEpoch,
                textLength: String(text ?? '').length,
              },
              traceId,
            );
            return;
          }
          void (async () => {
            const fullText = String(text ?? '');
            streamText.value = fullText;
            reasoningStreamState.setRawText(fullText);
            status.value = 'streaming';
            recordLifecycleTrace(
              'bindGenerationEvents',
              'token_full',
              {
                listenerEpoch,
                textLength: fullText.length,
                streamSignature: buildDebugMessageSignature(streamText.value),
              },
              traceId,
            );
            if (
              shouldCreateAssistantPlaceholderOnFirstToken({
                assistantMessageId: assistantMessageId.value,
                placeholderCreating: assistantPlaceholderCreating,
                token: fullText,
              })
            ) {
              await ensureAssistantPlaceholderReady('first_token');
            }
            scheduleStreamTranscriptPatch();
          })();
        }),
      );
    } catch {
      // ignore
    }

    try {
      generationStops.push(
        eventOn(
          tavern_events.STREAM_REASONING_DONE as any,
          (reasoning: string, _duration: number, messageId: number, state?: string) => {
            if (isStaleListener()) {
              recordLifecycleTrace(
                'bindGenerationEvents',
                'stream_reasoning_done_ignored_stale',
                {
                  listenerEpoch,
                },
                traceId,
              );
              return;
            }
            void (async () => {
              const eventMessageId = Math.trunc(Number(messageId));
              const currentAssistantId = assistantMessageId.value;
              if (
                Number.isFinite(eventMessageId) &&
                eventMessageId >= 0 &&
                currentAssistantId != null &&
                eventMessageId !== currentAssistantId
              ) {
                recordLifecycleTrace(
                  'bindGenerationEvents',
                  'stream_reasoning_done_ignored_message_id',
                  {
                    listenerEpoch,
                    eventMessageId,
                    assistantMessageId: currentAssistantId,
                  },
                  traceId,
                );
                return;
              }

              nativeReasoningText.value = String(reasoning ?? '').trim();
              if (!nativeReasoningText.value) return;
              status.value = 'streaming';
              if (assistantMessageId.value == null) {
                await ensureAssistantPlaceholderReady('native_reasoning');
              }
              recordLifecycleTrace(
                'bindGenerationEvents',
                'stream_reasoning_done',
                {
                  listenerEpoch,
                  eventMessageId: Number.isFinite(eventMessageId) ? eventMessageId : null,
                  state: String(state ?? ''),
                  reasoningSignature: buildDebugMessageSignature(nativeReasoningText.value),
                },
                traceId,
              );
              scheduleStreamTranscriptPatch();
            })();
          },
        ),
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
          const signalFinalText = normalizeSignalFinalText(text);
          if (signalFinalText) {
            finalText.value = signalFinalText;
            reasoningStreamState.setRawText(signalFinalText);
          }
          recordLifecycleTrace(
            'bindGenerationEvents',
            'generation_ended',
            {
              listenerEpoch,
              finalSignature: buildDebugMessageSignature(signalFinalText || finalText.value),
              signalIgnored: !signalFinalText,
            },
            traceId,
          );
          queueGenerationFinalizeFromSignal('iframe.generation_ended', text);
        }),
      );
    } catch {
      // ignore
    }
  }

  async function createAssistantPlaceholder() {
    const traceId = resolveTraceId('placeholder');
    const assistantData = resolveInheritedUserMessageData();
    await createChatMessages(
      [
        {
          role: 'assistant',
          is_hidden: false,
          message: buildStreamDemoMessage('流式请求中', 'stream'),
          data: assistantData,
        },
      ],
      {
        refresh: 'none',
      },
    );
    const id = Number(getLastMessageId?.());
    assistantMessageId.value = Number.isFinite(id) ? Math.trunc(id) : null;
    latestPatchedMessage = '';
    if (assistantMessageId.value != null) {
      upsertTranscriptItem(
        createLocalTranscriptItem({
          id: assistantMessageId.value,
          role: 'assistant',
          raw: buildStreamDemoMessage('流式请求中', 'stream'),
          hidden: false,
        }),
      );
    }
    recordLifecycleTrace(
      'createAssistantPlaceholder',
      'created',
      {
        assistantMessageId: assistantMessageId.value,
        placeholderSignature: buildDebugMessageSignature(buildStreamDemoMessage('流式请求中', 'stream')),
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
    const submitted = await submitPromptViaSameLayer(prompt, 'ui');
    if (submitted && (nextPrompt == null || prompt === String(input.value ?? '').trim())) {
      input.value = '';
    }
  }

  async function submitPromptViaSameLayer(prompt: string, _source: 'ui' | 'native-chat'): Promise<boolean> {
    const text = String(prompt ?? '').trim();
    if (!text || busy.value) return false;
    const result = await runGenerationFlow({ prompt: text, createUser: true });
    return result.success;
  }

  async function runNativeSendProxy(prompt: string): Promise<boolean> {
    const text = String(prompt ?? '').trim();
    if (!text || busy.value) return false;

    busy.value = true;
    nativeSendProxyActive = true;
    status.value = 'preparing';
    errorText.value = '';

    try {
      await revealHiddenStoryMessagesForNativeGeneration('native_send_proxy');
      await sendToNativeChat(text, false);
      appendLog('action', '发送用户输入', stripTagsForPreview(text).slice(0, 80) || '(空输入)');
      status.value = 'streaming';
      return true;
    } catch (error) {
      status.value = 'error';
      errorText.value = error instanceof Error ? error.message : String(error);
      toastr?.error?.(`发送失败：${errorText.value}`);
      appendLog('error', '发送失败', errorText.value || '未知错误');
      nativeSendProxyActive = false;
      nativeGenerationRevealActive = false;
      releaseHiddenStoryMessagesForNativeGeneration();
      busy.value = false;
      queueHidePolicy('native_send_proxy_failed');
      return false;
    }
  }

  onMounted(async () => {
    restoreReaderChatState();

    if (isOpeningWorkbenchHostActive()) {
      bindHistoryRefreshEvents();
      void bindMvuRefreshEvents();

      // 装保存守护器：一次 fetch 劫持，所有 ST 的 /api/chats/save 失败都会被记录 + toast。
      saveGuardian = installSameLayerSaveGuardian({
        onStateChange: handleSaveGuardianHealth,
      });

      // 装图片生成事件桥：插件 `generate-image-response` 失败时把错误 surface 给用户。
      // 插件内部的 zip 解析失败（"Can't read the data of 'the loaded zip file'"）此前只会 console.error，
      // 桥装上后能稳定显示一条 toast 并清理 pending，不再让用户对着占位图空等。
      if (typeof eventOn === 'function' && typeof eventRemoveListener === 'function') {
        imageGenerationBridge = createImageGenerationEventBridge({
          eventOn: (name, handler) => eventOn(name as any, handler as any),
          eventRemoveListener: (name, handler) => eventRemoveListener(name as any, handler as any),
          onRequest: ({ requestId, prompt }) => {
            syncPendingRequestHintsFromDom();
            const requestBinding = imagePendingTaskManager.registerRequest({ id: requestId, prompt });
            recordLifecycleTrace('imageGenerationEventBridge', 'on_request', () => ({
              requestId,
              promptHead: prompt.slice(0, 80),
              requestBinding,
              pendingTasks: imagePendingTaskManager.getDebugState(),
              diagnostics:
                requestBinding?.messageId != null
                  ? collectPluginNativeHandoffDiagnostics(requestBinding.messageId)
                  : collectPluginNativeHandoffDiagnostics(assistantMessageId.value ?? -1),
            }));
            if (requestBinding?.bufferedResponse) {
              const messageId = requestBinding.messageId;
              syncTranscriptItemsFromHostData('host.plugin_native_response_buffered', [messageId]);
              queueGeneratedImageEntityRefresh([messageId], 'host.plugin_native_response_buffered');
              scheduleHostImageDataReconcile('host.plugin_native_response_buffered', [messageId]);
            }
          },
          onResponseSuccess: ({ requestId, prompt, imageData }) => {
            const matchedResponse = imagePendingTaskManager.consumeResponse({ id: requestId, prompt, imageData });
            const recentIntent = imageRecentIntentStore.read();
            const targetMessageIds = [
              ...new Set(
                [matchedResponse?.messageId, recentIntent?.messageId ?? null]
                  .map(id => Math.trunc(Number(id)))
                  .filter((id): id is number => Number.isFinite(id) && id >= 0),
              ),
            ];

            recordLifecycleTrace('imageGenerationEventBridge', 'on_response_success', () => ({
              requestId,
              promptHead: prompt.slice(0, 80),
              imageDataLength: String(imageData ?? '').length,
              matchedResponse,
              recentIntent,
              targetMessageIds,
              pendingTasks: imagePendingTaskManager.getDebugState(),
              diagnostics:
                targetMessageIds.length > 0
                  ? targetMessageIds.map(messageId => collectPluginNativeHandoffDiagnostics(messageId))
                  : [collectPluginNativeHandoffDiagnostics(assistantMessageId.value ?? -1)],
            }));

            syncTranscriptItemsFromHostData('host.plugin_native_response_success', targetMessageIds);
            if (targetMessageIds.length > 0) {
              queueGeneratedImageEntityRefresh(targetMessageIds, 'host.plugin_native_response_success');
              scheduleHostImageDataReconcile('host.plugin_native_response_success', targetMessageIds);
              schedulePluginNativePromptPlaceholderReconcile('host.plugin_native_response_success', targetMessageIds);
            }
          },
          onResponseFailure: ({ requestId, prompt }) => {
            recordLifecycleTrace('imageGenerationEventBridge', 'on_response_failure', () => ({
              requestId,
              promptHead: prompt.slice(0, 60),
            }));
          },
          notifyError: message => {
            const now = Date.now();
            if (now - lastImageGenFailureToastAt < IMAGE_GEN_FAILURE_TOAST_MIN_INTERVAL_MS) return;
            lastImageGenFailureToastAt = now;
            try {
              toastr?.warning?.(message, '生图失败', { timeOut: 7000 });
            } catch {
              // toastr not ready yet
            }
          },
          recordTrace: (scope, event, payload) => {
            recordLifecycleTrace(scope, event, () => payload);
          },
        });
      }
      pluginNativeLlmImageGenerationStops = bindPluginNativeLlmImageGenerationEvents();

      await restoreHideState();
      writeRuntimeLeaseStatus('booting');
      writeRuntimeLeaseStatus('active');
      startRuntimeLeaseHeartbeat();
      syncHostVisualHideFromCurrentState();
      destroyHostChatInputBridge = installHostChatInputBridge({
        onSubmit: submitPromptViaSameLayer,
        isBusy: () => busy.value,
      }).destroy;

      window.addEventListener('pagehide', handleSameLayerPageHide);

      if (document.body && typeof MutationObserver !== 'undefined') {
        generatedImageDomObserver = new MutationObserver(records => {
          if (!records.some(hasRelevantChatu8Mutation)) return;
          syncPendingRequestHintsFromDom();
          const hasReadyNativeImageMutation = records.some(hasReadyChatu8Mutation);
          if (!hasReadyNativeImageMutation) return;
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
        syncPendingRequestHintsFromDom();
        const hasReadyNativeImageMutation = records.some(hasReadyChatu8Mutation);
        if (!hasReadyNativeImageMutation) return;
        const affectedMessageIds = collectMutationMessageIds(records);
        queueGeneratedImageEntityRefresh(affectedMessageIds, 'host.plugin_native_dom_mutation');
      });
    }

    rebuildTranscript();
    window.setTimeout(() => queueVisibleGeneratedImageEntityRefresh('mounted.host_plugin_native_probe'), 250);
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

  function handleSameLayerPageHide() {
    writeRuntimeLeaseStatus('suspended');
  }

  function handleSaveGuardianHealth(health: SaveGuardianHealth) {
    saveHealthIsFailing.value = health.status !== 'healthy';
    saveHealthLastFailedAt.value = health.lastFailedAt;
    saveHealthLastSucceededAt.value = health.lastSucceededAt;
    saveHealthConsecutiveFailures.value = health.consecutiveFailures;

    if (health.status === 'healthy') {
      lastSaveFailureToastAt = 0;
      return;
    }

    const now = Date.now();
    if (now - lastSaveFailureToastAt < SAVE_FAILURE_TOAST_MIN_INTERVAL_MS) return;
    lastSaveFailureToastAt = now;
    try {
      const latest = health.recentFailures[health.recentFailures.length - 1];
      const statusText =
        latest?.status === 'network' ? `网络错误：${latest.statusText ?? ''}` : `HTTP ${latest?.status ?? 'unknown'}`;
      toastr?.warning?.(
        `聊天保存失败（${statusText}）。最近生成 / 图片可能在刷新后丢失，建议检查杀软 / OneDrive 占用并重试。`,
        '同层聊天保存异常',
        { timeOut: 8000 },
      );
    } catch {
      // toastr not ready yet
    }
    recordLifecycleTrace('saveGuardian', 'failure_observed', () => ({
      consecutiveFailures: health.consecutiveFailures,
      lastFailure: health.recentFailures[health.recentFailures.length - 1],
    }));
  }

  async function flushExplicitChatSave(reason: string): Promise<boolean> {
    if (!saveGuardian) return false;
    const succeeded = await saveGuardian.requestExplicitSave(reason);
    recordLifecycleTrace('saveGuardian', 'explicit_save_attempted', () => ({
      reason,
      succeeded,
      lastFailedAt: saveGuardian?.health.lastFailedAt ?? null,
      lastSucceededAt: saveGuardian?.health.lastSucceededAt ?? null,
    }));
    return succeeded;
  }

  onBeforeUnmount(() => {
    if (isOpeningWorkbenchHostActive() && sameLayerDisableRequested !== true) {
      persistHideStateNow('unmount');
      writeRuntimeLeaseStatus('suspended');
      window.removeEventListener('pagehide', handleSameLayerPageHide);
    }
    if (sameLayerDisableRequested === true) {
      window.removeEventListener('pagehide', handleSameLayerPageHide);
    }
    clearGenerationListeners();
    historyStops.forEach(stop => stop?.stop?.());
    historyStops = [];
    mvuStops.forEach(stop => stop?.stop?.());
    mvuStops = [];
    pluginNativeLlmImageGenerationStops.forEach(stop => stop?.stop?.());
    pluginNativeLlmImageGenerationStops = [];
    activePluginNativeLlmImageGenerationRequests.clear();
    lastPluginNativeLlmImageGenerationSettledAt = 0;
    nativeGenerationRevealActive = false;
    releaseHiddenStoryMessagesForNativeGeneration();
    hidePolicyTimer = clearTimer(hidePolicyTimer);
    externalSyncTimer = clearTimer(externalSyncTimer);
    readerStatePersistTimer = clearTimer(readerStatePersistTimer);
    openingPayloadPersistTimer = clearTimer(openingPayloadPersistTimer);
    generatedImageDomMutationTimer = clearTimer(generatedImageDomMutationTimer);
    hostImageDataReconcileTimers.forEach(timer => window.clearTimeout(timer));
    hostImageDataReconcileTimers.clear();
    hideStatePersistTimer = clearTimer(hideStatePersistTimer);
    generationSignalFinalizeTimer = clearTimer(generationSignalFinalizeTimer);
    generatedImageDomObserver?.disconnect();
    generatedImageDomObserver = null;
    hostPluginMutationObservers.forEach(observer => observer.disconnect());
    hostPluginMutationObservers = [];
    destroyHostChatInputBridge();
    destroyHostChatInputBridge = () => {};
    hostVisualHideController.destroy();
    stopRuntimeLeaseHeartbeat();
    const unmountContainerId = getActiveContainerMessageId();
    if (unmountContainerId != null) clearSameLayerRuntimeHeartbeat(unmountContainerId);
    saveGuardian?.uninstall();
    saveGuardian = null;
    imageGenerationBridge?.uninstall();
    imageGenerationBridge = null;
  });

  type GalleryGroup = { messageId: number; images: GeneratedImageRef[] };
  const historicalGalleryGroups = ref<GalleryGroup[]>([]);
  const galleryHistoryCursor = ref<number | null>(null);
  const galleryHistoryExhausted = ref(false);
  const loadingOlderGalleryImages = ref(false);

  function flattenGalleryGroupsForEntries(groups: GalleryGroup[]): GeneratedImageRef[] {
    return groups.flatMap(g => g.images);
  }

  function mergeGalleryGroupsForEntries(currentGroups: GalleryGroup[], historyGroups: GalleryGroup[]): GalleryGroup[] {
    const groupsById = new Map<number, GalleryGroup>();
    for (const group of currentGroups) {
      groupsById.set(group.messageId, group);
    }
    for (const group of historyGroups) {
      if (!groupsById.has(group.messageId)) {
        groupsById.set(group.messageId, group);
      }
    }
    return Array.from(groupsById.values()).sort((a, b) => b.messageId - a.messageId);
  }

  const galleryGroups = computed<GalleryGroup[]>(() => {
    void galleryRevision.value;

    const groups: GalleryGroup[] = [];
    for (const item of transcript.value) {
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
  const mergedGalleryGroups = computed<GalleryGroup[]>(() =>
    mergeGalleryGroupsForEntries(galleryGroups.value, historicalGalleryGroups.value),
  );
  const galleryEntries = computed<GeneratedImageRef[]>(() => flattenGalleryGroupsForEntries(mergedGalleryGroups.value));
  const hasMoreOlderGalleryImages = computed(() => !galleryHistoryExhausted.value);

  watch(
    () => transcript.value.map(item => item.message_id).join(','),
    () => {
      const visibleIds = new Set(galleryGroups.value.map(group => group.messageId));
      historicalGalleryGroups.value = historicalGalleryGroups.value.filter(group => !visibleIds.has(group.messageId));
      galleryHistoryCursor.value = null;
      galleryHistoryExhausted.value = false;
    },
  );

  function resolveInitialGalleryHistoryCursor(messages: any[]): number {
    const visibleIds = transcript.value
      .map(item => Math.trunc(Number(item.message_id)))
      .filter(id => Number.isFinite(id) && id >= 0);
    if (visibleIds.length > 0) return Math.min(...visibleIds) - 1;
    const messageIds = messages
      .map(message => Math.trunc(Number(message?.message_id)))
      .filter(id => Number.isFinite(id) && id >= 0);
    return messageIds.length > 0 ? Math.max(...messageIds) : -1;
  }

  function isAssistantGalleryHistoryCandidate(message: any, rawMessage: string): boolean {
    const role = resolveTranscriptRole({
      rawRole: resolveHostMessageRole(message),
      rawMessage,
      isOpeningResult: false,
    });
    return role === 'assistant';
  }

  async function loadOlderGalleryImages() {
    if (loadingOlderGalleryImages.value || galleryHistoryExhausted.value) return;
    loadingOlderGalleryImages.value = true;
    try {
      const messages = readAllChatMessagesRaw();
      const messageById = new Map<number, any>();
      for (const message of messages) {
        const id = Math.trunc(Number(message?.message_id));
        if (!Number.isFinite(id) || id < 0) continue;
        messageById.set(id, message);
      }

      let cursor = galleryHistoryCursor.value ?? resolveInitialGalleryHistoryCursor(messages);
      const knownMessageIds = new Set(mergedGalleryGroups.value.map(group => group.messageId));
      const nextGroups: GalleryGroup[] = [];
      let scanned = 0;

      while (cursor >= 0 && scanned < GALLERY_HISTORY_SCAN_BATCH_SIZE) {
        const messageId = cursor;
        cursor -= 1;
        scanned += 1;
        if (knownMessageIds.has(messageId)) continue;

        const message = messageById.get(messageId);
        if (!message) continue;
        const rawMessage = String(message?.message ?? message?.mes ?? '');
        if (!isAssistantGalleryHistoryCandidate(message, rawMessage)) continue;

        const images = buildGeneratedImageRefsForMessage({
          messageId,
          rawMessage,
          createdOrderBase: messageId * 100,
          hostDomArtifacts: [],
        });
        if (images.length === 0) continue;

        knownMessageIds.add(messageId);
        nextGroups.push({ messageId, images });
        if (nextGroups.length >= GALLERY_HISTORY_MAX_GROUPS_PER_LOAD) break;
      }

      galleryHistoryCursor.value = cursor;
      if (cursor < 0 || messages.length === 0) {
        galleryHistoryExhausted.value = true;
      }
      if (nextGroups.length > 0) {
        historicalGalleryGroups.value = mergeGalleryGroupsForEntries(historicalGalleryGroups.value, nextGroups);
      }
    } finally {
      loadingOlderGalleryImages.value = false;
    }
  }

  function refreshGalleryImages(reason = 'gallery.manual_refresh') {
    scheduleUiRefresh(['gallery'], reason);
  }

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
    reprocessVariablesPending,
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
    loadingOlderGalleryImages,
    hasMoreOlderGalleryImages,
    loadOlderGalleryImages,
    refreshGalleryImages,
    submitPromptViaSameLayer,
    cancelActiveGeneration,
    disableSameLayerUi,
    beginPendingImageTask,
    markRecentImageIntent,
    runDemo,
    rollLatestTurn,
    reprocessLatestAssistantVariables,
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
    withPluginNativeMessageLease,
    withHostTranscriptVisible,
    ensureHostMesTextRendered,
    triggerImageGenerationForMessage,
    calibrateDailyRollDate,
    // 保存守护器状态 + 手动重试入口（给 FAB 红点 / 菜单上的"重试保存"按钮用）
    saveHealthIsFailing,
    saveHealthLastFailedAt,
    saveHealthLastSucceededAt,
    saveHealthConsecutiveFailures,
    requestExplicitSave: async (reason = 'manual') => flushExplicitChatSave(reason),
  };
}

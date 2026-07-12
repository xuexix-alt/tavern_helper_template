import {
  callHostGetChatMessages,
  collectChatu8PromptTokens,
  collectHostOnlyDocuments,
  normalizeImageDataToSrc,
  readHostContext,
} from '../../../界面同层版/界面/状态栏/hostBridge.ts';
import {
  collectPluginNativeCacheArtifacts,
  type PluginNativeCacheArtifact,
} from '../../../界面同层版/界面/状态栏/pluginNativeCacheArtifacts.ts';
import {
  dispatchHostPrimaryTrigger,
  type HostGestureDispatchStrategy,
} from '../../../界面同层版/界面/状态栏/hostGestureDispatch.ts';
import type { ReaderGalleryEntry } from '../../../界面同层版/界面/状态栏/types.ts';

export type PreGalleryImageSource = 'host-dom' | 'pre-render' | 'extra.images' | 'mes_tag' | 'cache';
export type PreGalleryGestureTargetHint = 'prompt-button' | 'ready-image' | 'message-text' | 'unknown';
export type PreGalleryGestureMode = 'click' | 'dblclick' | 'longpress';
export type PreGalleryScanLimit = number | 'all';

export type PreGalleryHostArtifact = {
  messageId: number;
  swipeId?: number;
  kind?: PreGalleryGestureTargetHint;
  className?: string;
  tag?: string;
  link?: string;
  requestId?: string;
  imageId?: string;
  promptToken?: string;
  src?: string;
  element?: HTMLElement;
  source?: PreGalleryImageSource;
};

export type PreGalleryImageRef = {
  id: string;
  lightKey: string;
  messageId: number;
  swipeId: number;
  sources: PreGalleryImageSource[];
  gestureTargetHint: PreGalleryGestureTargetHint;
  src: string;
  tag: string;
  link: string;
  requestId: string;
  imageId: string;
  promptToken: string;
  className: string;
  evidence: string[];
};

export type PreGalleryScanResult = {
  reason: string;
  scannedAt: number;
  selectedMessageId: number | null;
  refs: PreGalleryImageRef[];
  sourceCounts: Record<PreGalleryImageSource, number>;
  diagnostics: string[];
  scannedMessageCount?: number;
  totalMessageCount?: number;
};

export type PreGalleryScanOptions = {
  reason?: string;
  messages?: unknown[];
  context?: any;
  hostArtifacts?: PreGalleryHostArtifact[];
  messageIds?: number[];
  scanLimit?: PreGalleryScanLimit;
  now?: number;
};

export type PreGalleryDispatchResult = {
  ok: boolean;
  method: string;
  target: string;
  reason: string;
};

const SOURCE_ORDER: PreGalleryImageSource[] = ['host-dom', 'pre-render', 'extra.images', 'mes_tag', 'cache'];
const HOST_ELEMENT_REF_CACHE = new Map<string, HTMLElement>();
const HOST_IMAGE_ELEMENT_REF_CACHE = new Map<string, HTMLElement>();
const PLUGIN_NATIVE_SELECTORS = [
  'button.image-tag-button',
  '.st-chatu8-image-button',
  '.st-chatu8-image-span img',
  '.st-chatu8-image-container img',
  '.ai-image-container img',
  'span.image-tag-placeholder img',
  'span.image-tag-placeholder',
  '.st-chatu8-image-span',
  '.st-chatu8-image-container',
  '.ai-image-container',
].join(',');

function asRecord(input: unknown): Record<string, any> | null {
  return input && typeof input === 'object' ? (input as Record<string, any>) : null;
}

function normalizeId(input: unknown): number | null {
  const id = Math.trunc(Number(input));
  return Number.isFinite(id) && id >= 0 ? id : null;
}

function normalizeSwipeId(input: unknown): number {
  const id = Math.trunc(Number(input));
  return Number.isFinite(id) && id >= 0 ? id : 0;
}

function clean(input: unknown): string {
  return String(input ?? '').trim();
}

function normalizeScanLimit(input: PreGalleryScanLimit | undefined, total: number): number {
  if (input === 'all') return Math.max(0, total);
  const limit = Math.trunc(Number(input ?? 1));
  return Number.isFinite(limit) && limit > 0 ? Math.min(limit, Math.max(0, total)) : 1;
}

function describeScanLimit(limit: number, total: number, requestedIds: number[]): string {
  if (requestedIds.length > 0) return `定向 ${requestedIds.length} 楼`;
  if (limit >= total) return `全量 ${total} 楼`;
  return `最近 ${limit} 个含图楼层`;
}

function shortHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function normalizeSrc(input: unknown): string {
  return normalizeImageDataToSrc(input);
}

export function preGalleryRefToReaderGalleryEntry(ref: PreGalleryImageRef): ReaderGalleryEntry {
  const promptText = clean(ref.promptToken || ref.tag || ref.link);
  const imageIndex = Number.isFinite(Number(ref.swipeId)) ? Math.trunc(Number(ref.swipeId)) + 1 : 1;
  const title = `楼层 #${ref.messageId} · 图片 ${imageIndex}`;
  return {
    id: ref.id,
    messageId: ref.messageId,
    imageId: ref.imageId || undefined,
    requestId: ref.requestId || undefined,
    promptToken: promptText,
    anchorText: promptText || ref.evidence.join(' '),
    title,
    createdOrder: ref.swipeId,
    src: ref.src,
    alt: title,
  };
}

function readPromptToken(entry: Record<string, any>): string {
  const token = clean(entry.promptToken ?? entry.prompt_token ?? entry.tag ?? entry.link);
  if (token) return token;
  const prompt = clean(entry.prompt ?? entry.regex ?? entry.anchorText);
  return collectChatu8PromptTokens(prompt)[0] ?? (prompt ? `image###${prompt}###` : '');
}

function buildIdentity(parts: {
  messageId: number;
  swipeId: number;
  promptToken?: string;
  tag?: string;
  link?: string;
  requestId?: string;
  imageId?: string;
  src?: string;
}): string {
  const stable =
    clean(parts.requestId) ||
    clean(parts.imageId) ||
    clean(parts.promptToken) ||
    clean(parts.tag) ||
    clean(parts.link) ||
    (clean(parts.src) ? `srcHash:${shortHash(clean(parts.src))}` : 'unknown');
  return `${parts.messageId}:${parts.swipeId}:${stable}`;
}

function isSameArtifact(lhs: PreGalleryImageRef, rhs: Partial<PreGalleryImageRef>): boolean {
  const leftKeys = [lhs.requestId, lhs.imageId, lhs.promptToken, lhs.tag, lhs.link].filter(Boolean);
  const rightKeys = [rhs.requestId, rhs.imageId, rhs.promptToken, rhs.tag, rhs.link].map(clean).filter(Boolean);
  if (leftKeys.some(key => rightKeys.includes(key))) return true;
  const leftSrc = clean(lhs.src);
  const rightSrc = clean(rhs.src);
  return Boolean(leftSrc && rightSrc && leftSrc === rightSrc);
}

function buildLightKey(ref: PreGalleryImageRef): string {
  return [
    `mes:${ref.messageId}`,
    `swipe:${ref.swipeId}`,
    ref.requestId ? `req:${ref.requestId}` : '',
    ref.imageId ? `img:${ref.imageId}` : '',
    ref.promptToken ? `token:${shortHash(ref.promptToken)}` : '',
    ref.tag && ref.tag !== ref.promptToken ? `tag:${shortHash(ref.tag)}` : '',
    ref.link && ref.link !== ref.promptToken ? `link:${shortHash(ref.link)}` : '',
  ]
    .filter(Boolean)
    .join('|');
}

function readRuntimeMessages(): unknown[] {
  try {
    if (typeof getChatMessages === 'function') {
      const list = getChatMessages('0-{{lastMessageId}}', { hide_state: 'all' });
      if (Array.isArray(list)) return list;
    }
  } catch {
    /* host helper may not be injected yet */
  }

  try {
    const list = callHostGetChatMessages('0-{{lastMessageId}}', { hide_state: 'all' });
    if (Array.isArray(list)) return list;
  } catch {
    /* fallback below */
  }

  const ctx = readHostContext();
  const chat = ctx?.chat;
  if (Array.isArray(chat)) return chat.map((message, index) => ({ message_id: index, ...message }));
  if (chat && typeof chat === 'object') {
    return Object.entries(chat).map(([key, value]) => ({ message_id: Number(key), ...(asRecord(value) ?? {}) }));
  }
  return [];
}

function readRuntimeMessageById(messageId: number): Record<string, any> | null {
  try {
    if (typeof getChatMessages === 'function') {
      const list = getChatMessages(`${messageId}`, { hide_state: 'all' });
      const first = Array.isArray(list) ? asRecord(list[0]) : null;
      if (first) return { message_id: messageId, ...first };
    }
  } catch {
    /* host helper may not be injected yet */
  }

  try {
    const list = callHostGetChatMessages(`${messageId}`, { hide_state: 'all' });
    const first = Array.isArray(list) ? asRecord(list[0]) : null;
    if (first) return { message_id: messageId, ...first };
  } catch {
    /* fallback below */
  }

  const ctx = readHostContext();
  const chat = ctx?.chat;
  if (Array.isArray(chat)) {
    const item = asRecord(chat[messageId]);
    return item ? { message_id: messageId, ...item } : null;
  }
  const item = asRecord(chat?.[messageId]);
  return item ? { message_id: messageId, ...item } : null;
}

function readScanContext(options: PreGalleryScanOptions): any {
  if ('context' in options) return options.context;
  if (typeof window === 'undefined') return {};
  return readHostContext();
}

function getMessageId(message: Record<string, any>, fallback: number): number | null {
  return normalizeId(message.message_id ?? message.mesid ?? message.id ?? fallback);
}

function readSwipeEntries(message: Record<string, any>, swipeId: number): Record<string, any>[] {
  const extraImages = message?.extra?.images;
  if (!Array.isArray(extraImages)) return [];
  if (Array.isArray(extraImages[swipeId])) {
    return extraImages[swipeId]
      .filter(Boolean)
      .map(entry => asRecord(entry))
      .filter(Boolean) as Record<string, any>[];
  }
  return extraImages.flatMap(item =>
    Array.isArray(item)
      ? (item
          .filter(Boolean)
          .map(entry => asRecord(entry))
          .filter(Boolean) as Record<string, any>[])
      : [],
  );
}

function createEmptyRef(messageId: number, swipeId: number, entry: Partial<PreGalleryImageRef>): PreGalleryImageRef {
  const ref: PreGalleryImageRef = {
    id: '',
    lightKey: '',
    messageId,
    swipeId,
    sources: [],
    gestureTargetHint: 'unknown',
    src: '',
    tag: '',
    link: '',
    requestId: '',
    imageId: '',
    promptToken: '',
    className: '',
    evidence: [],
    ...entry,
  };
  ref.lightKey = buildLightKey(ref);
  ref.id = ref.lightKey || `${messageId}:${swipeId}:${shortHash(JSON.stringify(entry))}`;
  return ref;
}

function mergeSource(
  refs: Map<string, PreGalleryImageRef>,
  source: PreGalleryImageSource,
  messageId: number,
  swipeId: number,
  entry: Partial<PreGalleryImageRef>,
): PreGalleryImageRef {
  const identity = buildIdentity({
    messageId,
    swipeId,
    promptToken: entry.promptToken,
    tag: entry.tag,
    link: entry.link,
    requestId: entry.requestId,
    imageId: entry.imageId,
    src: entry.src,
  });
  let existing = refs.get(identity);
  if (!existing) {
    const compatibleEntry = Array.from(refs.entries()).find(
      ([, ref]) => ref.messageId === messageId && ref.swipeId === swipeId && isSameArtifact(ref, entry),
    );
    if (compatibleEntry) {
      refs.delete(compatibleEntry[0]);
      existing = compatibleEntry[1];
    }
  }
  existing = existing ?? createEmptyRef(messageId, swipeId, entry);

  if (!existing.sources.includes(source)) {
    existing.sources.push(source);
    existing.sources.sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b));
  }

  existing.src = existing.src || clean(entry.src);
  existing.tag = existing.tag || clean(entry.tag);
  existing.link = existing.link || clean(entry.link);
  existing.requestId = existing.requestId || clean(entry.requestId);
  existing.imageId = existing.imageId || clean(entry.imageId);
  existing.promptToken = existing.promptToken || clean(entry.promptToken);
  existing.className = existing.className || clean(entry.className);
  if (existing.gestureTargetHint === 'unknown' || entry.gestureTargetHint === 'prompt-button') {
    existing.gestureTargetHint = entry.gestureTargetHint ?? existing.gestureTargetHint;
  }
  if (entry.evidence) existing.evidence.push(...entry.evidence);
  existing.lightKey = buildLightKey(existing);
  existing.id = existing.lightKey;
  refs.set(identity, existing);
  return existing;
}

function isPluginPromptButton(element: Element | null | undefined) {
  return Boolean(element?.matches?.('button.image-tag-button,.st-chatu8-image-button'));
}

function isPluginImageElement(element: Element | null | undefined) {
  return Boolean(element?.matches?.('img,.st-chatu8-image-span,.st-chatu8-image-container,.ai-image-container'));
}

function resolvePluginImageInteractionElement(element: HTMLElement): HTMLElement | null {
  if (element instanceof HTMLImageElement || element.matches('video')) return element;
  const media = element.querySelector?.('img,video') as HTMLElement | null;
  if (media) return media;
  return isPluginImageElement(element) ? element : null;
}

function rememberHostElementForKey(key: string, element: HTMLElement) {
  const current = HOST_ELEMENT_REF_CACHE.get(key);
  if (isPluginPromptButton(current) && !isPluginPromptButton(element)) return;
  if (!current?.isConnected || !isPluginPromptButton(current) || isPluginPromptButton(element)) {
    HOST_ELEMENT_REF_CACHE.set(key, element);
  }
}

function rememberHostImageElementForKey(key: string, element: HTMLElement) {
  const imageElement = resolvePluginImageInteractionElement(element);
  if (!imageElement) return;
  const current = HOST_IMAGE_ELEMENT_REF_CACHE.get(key);
  if (
    !current?.isConnected ||
    imageElement instanceof HTMLImageElement ||
    current.matches('.st-chatu8-image-container')
  ) {
    HOST_IMAGE_ELEMENT_REF_CACHE.set(key, imageElement);
  }
}

function rememberHostElementRef(ref: PreGalleryImageRef, element: HTMLElement | null | undefined) {
  if (!element || !ref.lightKey) return;
  if (isPluginPromptButton(element)) {
    rememberHostElementForKey(ref.lightKey, element);
    if (ref.requestId) rememberHostElementForKey(`req:${ref.messageId}:${ref.swipeId}:${ref.requestId}`, element);
    if (ref.promptToken) {
      rememberHostElementForKey(`token:${ref.messageId}:${ref.swipeId}:${shortHash(ref.promptToken)}`, element);
    }
  }
}

function rememberHostImageElementRef(ref: PreGalleryImageRef, element: HTMLElement | null | undefined) {
  if (!element || !ref.lightKey) return;
  rememberHostImageElementForKey(ref.lightKey, element);
  if (ref.requestId) rememberHostImageElementForKey(`req:${ref.messageId}:${ref.swipeId}:${ref.requestId}`, element);
  if (ref.promptToken) {
    rememberHostImageElementForKey(`token:${ref.messageId}:${ref.swipeId}:${shortHash(ref.promptToken)}`, element);
  }
}

function artifactFromExtra(entry: Record<string, any>): Partial<PreGalleryImageRef> {
  const promptToken = readPromptToken(entry);
  return {
    src: normalizeSrc(entry.src ?? entry.image ?? entry.imageData ?? entry.path ?? entry.url),
    tag: clean(entry.tag) || promptToken,
    link: clean(entry.link) || promptToken,
    requestId: clean(entry.requestId ?? entry.request_id),
    imageId: clean(entry.imageId ?? entry.image_id),
    promptToken,
    gestureTargetHint: 'ready-image',
    evidence: ['extra.images 可读'],
  };
}

function artifactFromCache(entry: PluginNativeCacheArtifact): Partial<PreGalleryImageRef> {
  return {
    src: normalizeSrc(entry.src),
    tag: clean(entry.promptToken),
    link: clean(entry.promptToken),
    requestId: clean(entry.requestId),
    imageId: clean(entry.imageId),
    promptToken: clean(entry.promptToken),
    gestureTargetHint: 'ready-image',
    evidence: ['chatMetadata st-chatu8 cache 可读'],
  };
}

function artifactFromPromptToken(token: string): Partial<PreGalleryImageRef> {
  return {
    tag: token,
    link: token,
    promptToken: token,
    gestureTargetHint: 'prompt-button',
    evidence: ['正文 image###...### token 可读'],
  };
}

function normalizeHostArtifact(artifact: PreGalleryHostArtifact): Partial<PreGalleryImageRef> {
  const promptToken = clean(artifact.promptToken) || clean(artifact.tag) || clean(artifact.link);
  return {
    src: normalizeSrc(artifact.src),
    tag: clean(artifact.tag) || promptToken,
    link: clean(artifact.link) || promptToken,
    requestId: clean(artifact.requestId),
    imageId: clean(artifact.imageId),
    promptToken,
    className: clean(artifact.className),
    gestureTargetHint: artifact.kind ?? (artifact.src ? 'ready-image' : 'prompt-button'),
    evidence: [`宿主 DOM ${artifact.className || artifact.kind || 'artifact'} 可读`],
  };
}

function hasHostArtifactIdentity(artifact: PreGalleryHostArtifact): boolean {
  return Boolean(
    clean(artifact.src) ||
    clean(artifact.tag) ||
    clean(artifact.link) ||
    clean(artifact.requestId) ||
    clean(artifact.imageId) ||
    clean(artifact.promptToken),
  );
}

function readDataset(element: Element | null | undefined, keys: string[]): string {
  if (!element) return '';
  for (const key of keys) {
    const value = clean(
      (element as HTMLElement).dataset?.[key] ??
        element.getAttribute?.(`data-${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`),
    );
    if (value) return value;
  }
  return '';
}

function readElementSrc(element: Element): string {
  if (element instanceof HTMLImageElement) return clean(element.currentSrc || element.src);
  const nested = element.querySelector?.('img') as HTMLImageElement | null;
  return clean(nested?.currentSrc || nested?.src);
}

function summarizeProbeSrc(src: string) {
  if (!src) return 'empty';
  if (src.startsWith('data:image/')) return 'data-url';
  if (src.startsWith('blob:')) return 'blob-url';
  return 'url';
}

function countProbeNodes(root: ParentNode | null | undefined) {
  if (!root) return { carriers: 0, images: 0, ready: 0, srcKinds: 'empty' };
  const carriers = root.querySelectorAll(
    'button.image-tag-button,.st-chatu8-image-button,.st-chatu8-image-span,.st-chatu8-image-container,.ai-image-container,span.image-tag-placeholder',
  );
  const images = Array.from(root.querySelectorAll('img,video'));
  const srcKinds = Array.from(new Set(images.map(readElementSrc).map(summarizeProbeSrc))).join(',') || 'empty';
  return {
    carriers: carriers.length,
    images: images.length,
    ready: images.filter(element => Boolean(readElementSrc(element))).length,
    srcKinds,
  };
}

function collectPreGalleryRuntimeProbe(messageId: number) {
  if (typeof document === 'undefined') return '宿主节点: unavailable；pre正文节点: unavailable';
  const host = collectHostOnlyDocuments().reduce(
    (total, doc) => {
      const root = doc.querySelector(
        `.mes[mesid="${messageId}"],.mes[data-message-index="${messageId}"],.mes[data-message-id="${messageId}"]`,
      );
      const next = countProbeNodes(root?.querySelector('.mes_text') ?? root);
      return {
        roots: total.roots + Number(Boolean(root)),
        carriers: total.carriers + next.carriers,
        images: total.images + next.images,
        ready: total.ready + next.ready,
        srcKinds: new Set([...total.srcKinds, ...next.srcKinds.split(',')]),
      };
    },
    { roots: 0, carriers: 0, images: 0, ready: 0, srcKinds: new Set<string>() },
  );
  const preRoot = document.querySelector(`.pre-message-card[data-message-id="${messageId}"] .pre-message-card__body`);
  const pre = countProbeNodes(preRoot);
  return `宿主节点: roots=${host.roots} carriers=${host.carriers} images=${host.images} ready=${host.ready} src=${Array.from(host.srcKinds).join(',') || 'empty'}；pre正文节点: carriers=${pre.carriers} images=${pre.images} ready=${pre.ready} src=${pre.srcKinds}`;
}

function classifyHostElement(element: Element): PreGalleryGestureTargetHint {
  if (element.matches('button.image-tag-button,.st-chatu8-image-button')) return 'prompt-button';
  if (element.matches('img,.st-chatu8-image-span,.st-chatu8-image-container,.ai-image-container')) return 'ready-image';
  return 'unknown';
}

export function collectHostPreGalleryArtifacts(messageId: number): PreGalleryHostArtifact[] {
  const out: PreGalleryHostArtifact[] = [];
  // Known beta gap: mobile in-session images can render in the pre transcript before
  // the host .mes_text has a ready native image artifact, so the gallery may need a UI reload.
  const docs = collectHostOnlyDocuments();
  for (const doc of docs) {
    const root = doc.querySelector(
      `.mes[mesid="${messageId}"],.mes[data-message-index="${messageId}"],.mes[data-message-id="${messageId}"]`,
    );
    const mesText = root?.querySelector('.mes_text') ?? root;
    if (!mesText) continue;
    const elements = Array.from(mesText.querySelectorAll(PLUGIN_NATIVE_SELECTORS));
    for (const element of elements) {
      const tag = readDataset(element, ['imageTag', 'tag']);
      const link = readDataset(element, ['link']);
      const requestId = readDataset(element, ['requestId']);
      const imageId = readDataset(element, ['imageId']);
      const promptToken = readDataset(element, ['promptToken']) || tag || link;
      const src = readElementSrc(element);
      out.push({
        messageId,
        source: 'host-dom',
        kind: classifyHostElement(element),
        className: clean((element as HTMLElement).className),
        tag,
        link,
        requestId,
        imageId,
        promptToken,
        src,
        element: element as HTMLElement,
      });
    }
  }
  return out;
}

function collectPreVisibleGalleryArtifacts(messageId: number, rawMessage: string): PreGalleryHostArtifact[] {
  if (typeof document === 'undefined') return [];
  const body = document.querySelector(`.pre-message-card[data-message-id="${messageId}"] .pre-message-card__body`);
  if (!body) return [];

  const promptTokens = collectChatu8PromptTokens(rawMessage);
  return Array.from(body.querySelectorAll('img,video'))
    .map((element, index) => {
      const src = readElementSrc(element);
      if (!src) return null;
      const carrier = element.closest('.st-chatu8-image-span,.st-chatu8-image-container,.ai-image-container,span.image-tag-placeholder');
      const tag = readDataset(carrier, ['imageTag', 'tag']);
      const link = readDataset(carrier, ['link']);
      const promptToken = readDataset(carrier, ['promptToken']) || tag || link || promptTokens[index] || '';
      return {
        messageId,
        source: 'pre-render' as const,
        kind: 'ready-image' as const,
        className: clean((carrier as HTMLElement | null)?.className || (element as HTMLElement).className),
        tag: tag || promptToken,
        link: link || promptToken,
        requestId: readDataset(carrier, ['requestId']),
        imageId: readDataset(carrier, ['imageId']),
        promptToken,
        src,
      };
    })
    .filter((artifact): artifact is PreGalleryHostArtifact => Boolean(artifact && hasHostArtifactIdentity(artifact)));
}

function scanMessage(
  message: Record<string, any>,
  messageId: number,
  context: any,
  hostArtifacts: PreGalleryHostArtifact[],
) {
  const swipeId = normalizeSwipeId(message.swipe_id ?? message.swipeId);
  const rawMessage = clean(message.message ?? message.mes);
  const refs = new Map<string, PreGalleryImageRef>();
  const sourceCounts: Record<PreGalleryImageSource, number> = {
    'host-dom': 0,
    'pre-render': 0,
    'extra.images': 0,
    mes_tag: 0,
    cache: 0,
  };

  const renderArtifacts = [...hostArtifacts, ...collectPreVisibleGalleryArtifacts(messageId, rawMessage)];
  for (const artifact of renderArtifacts.filter(item => item.messageId === messageId)) {
    if (!hasHostArtifactIdentity(artifact)) continue;
    const source = artifact.source ?? 'host-dom';
    const existing = mergeSource(
      refs,
      source,
      messageId,
      normalizeSwipeId(artifact.swipeId ?? swipeId),
      normalizeHostArtifact(artifact),
    );
    if (source === 'host-dom') {
      rememberHostElementRef(existing, artifact.element);
      rememberHostImageElementRef(existing, artifact.element);
    }
    sourceCounts[source] += 1;
  }

  for (const entry of readSwipeEntries(message, swipeId)) {
    mergeSource(refs, 'extra.images', messageId, swipeId, artifactFromExtra(entry));
    sourceCounts['extra.images'] += 1;
  }

  for (const token of collectChatu8PromptTokens(rawMessage)) {
    mergeSource(refs, 'mes_tag', messageId, swipeId, artifactFromPromptToken(token));
    sourceCounts.mes_tag += 1;
  }

  const cacheEntries = collectPluginNativeCacheArtifacts(context?.chatMetadata?.['st-chatu8'], messageId);
  for (const entry of cacheEntries) {
    mergeSource(refs, 'cache', messageId, swipeId, artifactFromCache(entry));
    sourceCounts.cache += 1;
  }

  return { refs: Array.from(refs.values()), sourceCounts };
}

function hasNativeDisplayEvidence(refs: PreGalleryImageRef[]): boolean {
  return refs.some(ref => Boolean(ref.src) || ref.sources.some(source => source !== 'mes_tag'));
}

function isTagOnlyPlaceholder(ref: PreGalleryImageRef): boolean {
  return ref.sources.length === 1 && ref.sources[0] === 'mes_tag' && !ref.src && !ref.requestId && !ref.imageId;
}

function filterDisplayableRefs(refs: PreGalleryImageRef[]) {
  const hasDisplayableNativeRef = refs.some(
    ref => Boolean(ref.src) && ref.sources.some(source => source !== 'mes_tag'),
  );
  if (!hasDisplayableNativeRef) return { refs, hiddenTagOnlyCount: 0 };
  const next = refs.filter(ref => !isTagOnlyPlaceholder(ref));
  return { refs: next, hiddenTagOnlyCount: refs.length - next.length };
}

export function scanLatestPreGalleryImageRefs(options: PreGalleryScanOptions = {}): PreGalleryScanResult {
  const reason = clean(options.reason) || 'manual';
  const requestedIds = (options.messageIds ?? []).map(normalizeId).filter((id): id is number => id !== null);
  const messages = (
    options.messages ??
    (requestedIds.length > 0 ? requestedIds.map(readRuntimeMessageById).filter(Boolean) : readRuntimeMessages())
  )
    .map(asRecord)
    .filter(Boolean) as Record<string, any>[];
  const requestedSet = new Set(requestedIds);
  const scanLimit =
    requestedSet.size > 0 ? requestedIds.length : normalizeScanLimit(options.scanLimit, messages.length);
  const scanMessages =
    requestedSet.size > 0
      ? messages.filter((message, index) => {
          const messageId = getMessageId(message, index);
          return messageId !== null && requestedSet.has(messageId);
        })
      : messages;
  const context = readScanContext(options);
  const diagnostics: string[] = [];
  const sourceCounts: Record<PreGalleryImageSource, number> = {
      'host-dom': 0,
      'pre-render': 0,
      'extra.images': 0,
    mes_tag: 0,
    cache: 0,
  };

  const scanMessageAt = (message: Record<string, any>, index: number) => {
    const messageId = getMessageId(message, index);
    if (messageId === null) return null;
    const hostArtifacts = options.hostArtifacts ?? collectHostPreGalleryArtifacts(messageId);
    const scanned = scanMessage(message, messageId, context, hostArtifacts);
    const displayable = filterDisplayableRefs(scanned.refs);
    for (const source of SOURCE_ORDER) sourceCounts[source] += scanned.sourceCounts[source];
    if (displayable.refs.length === 0) return null;
    return {
      messageId,
      refs: displayable.refs,
      hiddenTagOnlyCount: displayable.hiddenTagOnlyCount,
      runtimeProbe: collectPreGalleryRuntimeProbe(messageId),
    };
  };

  let promptOnlyFallback: {
    messageId: number;
    refs: PreGalleryImageRef[];
    hiddenTagOnlyCount: number;
    runtimeProbe: string;
  } | null = null;
  const collected: Array<{
    messageId: number;
    refs: PreGalleryImageRef[];
    hiddenTagOnlyCount: number;
    runtimeProbe: string;
  }> = [];
  const skippedPromptOnlyDiagnostics: string[] = [];
  let visitedMessageCount = 0;

  for (let index = scanMessages.length - 1; index >= 0; index -= 1) {
    visitedMessageCount += 1;
    const scanned = scanMessageAt(scanMessages[index], index);
    if (!scanned) continue;
    if (requestedIds.length === 0 && !hasNativeDisplayEvidence(scanned.refs)) {
      if (!promptOnlyFallback) promptOnlyFallback = scanned;
      skippedPromptOnlyDiagnostics.push(`跳过楼层 #${scanned.messageId}：仅有正文 tag，继续寻找已有图片来源`);
      continue;
    }
    collected.push(scanned);
    if (collected.length >= scanLimit) break;
  }

  if (collected.length > 0) {
    const refs = collected.flatMap(item => item.refs);
    const hiddenTagOnlyCount = collected.reduce((total, item) => total + item.hiddenTagOnlyCount, 0);
    const selectedMessageId = collected[0].messageId;
    diagnostics.push(...skippedPromptOnlyDiagnostics);
    diagnostics.push(collected[0].runtimeProbe);
    if (requestedIds.length > 0 && collected.length === 1) {
      diagnostics.push(`定向刷新楼层 #${selectedMessageId}`);
    } else if (requestedIds.length > 0) {
      diagnostics.push(`定向刷新 ${collected.length} 个含图楼层`);
    } else if (scanLimit > 1) {
      diagnostics.push(
        `图片墙范围：${describeScanLimit(scanLimit, messages.length, requestedIds)}，命中 ${collected.length} 层`,
      );
    } else {
      diagnostics.push(`选中最新含图楼层 #${selectedMessageId}`);
    }
    if (hiddenTagOnlyCount > 0) diagnostics.push(`隐藏正文 tag-only 空占位 ${hiddenTagOnlyCount} 条`);
    diagnostics.push(`轻引用 ${refs.length} 条；图片 src 仅用于本次渲染，不进入 lightKey`);
    return {
      reason,
      scannedAt: options.now ?? Date.now(),
      selectedMessageId,
      refs,
      sourceCounts,
      diagnostics,
      scannedMessageCount: visitedMessageCount,
      totalMessageCount: messages.length,
    };
  }

  if (promptOnlyFallback) {
    diagnostics.push(promptOnlyFallback.runtimeProbe);
    diagnostics.push(`选中最新 tag-only 楼层 #${promptOnlyFallback.messageId}`);
    if (promptOnlyFallback.hiddenTagOnlyCount > 0)
      diagnostics.push(`隐藏正文 tag-only 空占位 ${promptOnlyFallback.hiddenTagOnlyCount} 条`);
    diagnostics.push(`轻引用 ${promptOnlyFallback.refs.length} 条；图片 src 仅用于本次渲染，不进入 lightKey`);
    return {
      reason,
      scannedAt: options.now ?? Date.now(),
      selectedMessageId: promptOnlyFallback.messageId,
      refs: promptOnlyFallback.refs,
      sourceCounts,
      diagnostics,
      scannedMessageCount: visitedMessageCount,
      totalMessageCount: messages.length,
    };
  }

  diagnostics.push(requestedIds.length > 0 ? '定向楼层没有找到插件图片引用' : '没有在最新窗口内找到插件图片引用');
  return {
    reason,
    scannedAt: options.now ?? Date.now(),
    selectedMessageId: null,
    refs: [],
    sourceCounts,
    diagnostics,
    scannedMessageCount: visitedMessageCount,
    totalMessageCount: messages.length,
  };
}

function scoreElementForRef(element: Element, ref: PreGalleryImageRef): number {
  const tag = readDataset(element, ['imageTag', 'tag']);
  const link = readDataset(element, ['link']);
  const requestId = readDataset(element, ['requestId']);
  const imageId = readDataset(element, ['imageId']);
  const promptToken = readDataset(element, ['promptToken']) || tag || link;
  const src = readElementSrc(element);
  let score = 0;
  if (ref.tag && tag && ref.tag === tag) score += 6;
  if (ref.link && link && ref.link === link) score += 6;
  if (ref.promptToken && promptToken && ref.promptToken === promptToken) score += 5;
  if (ref.requestId && requestId && ref.requestId === requestId) score += 4;
  if (ref.imageId && imageId && ref.imageId === imageId) score += 4;
  if (ref.src && src && ref.src === src) score += 2;
  if (ref.gestureTargetHint === 'prompt-button' && isPluginPromptButton(element)) score += 12;
  if (element.matches('button.image-tag-button,.st-chatu8-image-button')) score += 1;
  return score;
}

function scoreImageElementForRef(element: Element, ref: PreGalleryImageRef): number {
  const requestId = readDataset(element, ['requestId']);
  const imageId = readDataset(element, ['imageId']);
  const src = readElementSrc(element);
  let score = 0;
  if (ref.requestId && requestId && ref.requestId === requestId) score += 8;
  if (ref.imageId && imageId && ref.imageId === imageId) score += 8;
  if (ref.src && src && ref.src === src) score += 6;
  if (element instanceof HTMLImageElement || element.matches('img,video')) score += 4;
  if (element.matches('.st-chatu8-image-span,.ai-image-container')) score += 2;
  if (element.matches('.st-chatu8-image-container')) score += 1;
  if (isPluginPromptButton(element)) score -= 100;
  return score;
}

function findHostMesText(messageId: number): HTMLElement | null {
  for (const doc of collectHostOnlyDocuments()) {
    const root = doc.querySelector(
      `.mes[mesid="${messageId}"],.mes[data-message-index="${messageId}"],.mes[data-message-id="${messageId}"]`,
    );
    const mesText = root?.querySelector('.mes_text') ?? root;
    if (mesText instanceof HTMLElement) return mesText;
  }
  return null;
}

function findHostElementForRef(ref: PreGalleryImageRef): HTMLElement | null {
  const mesText = findHostMesText(ref.messageId);
  if (!mesText) return null;
  const candidates = Array.from(mesText.querySelectorAll(PLUGIN_NATIVE_SELECTORS)).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreElementForRef(candidate, ref);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function findHostImageElementForRef(ref: PreGalleryImageRef): HTMLElement | null {
  const mesText = findHostMesText(ref.messageId);
  if (!mesText) return null;
  const candidates = Array.from(
    mesText.querySelectorAll('img,video,.st-chatu8-image-span,.st-chatu8-image-container,.ai-image-container'),
  ).filter((element): element is HTMLElement => element instanceof HTMLElement);
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreImageElementForRef(candidate, ref);
    if (score > bestScore) {
      best = resolvePluginImageInteractionElement(candidate) ?? candidate;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function findCachedHostElementForRef(ref: PreGalleryImageRef): HTMLElement | null {
  const byLightKey = HOST_ELEMENT_REF_CACHE.get(ref.lightKey);
  if (byLightKey?.isConnected) return byLightKey;
  if (byLightKey) HOST_ELEMENT_REF_CACHE.delete(ref.lightKey);

  const keys = [
    ref.requestId ? `req:${ref.messageId}:${ref.swipeId}:${ref.requestId}` : '',
    ref.promptToken ? `token:${ref.messageId}:${ref.swipeId}:${shortHash(ref.promptToken)}` : '',
  ].filter(Boolean);
  for (const key of keys) {
    const element = HOST_ELEMENT_REF_CACHE.get(key);
    if (element?.isConnected) return element;
    if (element) HOST_ELEMENT_REF_CACHE.delete(key);
  }
  return null;
}

function findCachedHostImageElementForRef(ref: PreGalleryImageRef): HTMLElement | null {
  const byLightKey = HOST_IMAGE_ELEMENT_REF_CACHE.get(ref.lightKey);
  if (byLightKey?.isConnected) return byLightKey;
  if (byLightKey) HOST_IMAGE_ELEMENT_REF_CACHE.delete(ref.lightKey);

  const keys = [
    ref.requestId ? `req:${ref.messageId}:${ref.swipeId}:${ref.requestId}` : '',
    ref.promptToken ? `token:${ref.messageId}:${ref.swipeId}:${shortHash(ref.promptToken)}` : '',
  ].filter(Boolean);
  for (const key of keys) {
    const element = HOST_IMAGE_ELEMENT_REF_CACHE.get(key);
    if (element?.isConnected) return element;
    if (element) HOST_IMAGE_ELEMENT_REF_CACHE.delete(key);
  }
  return null;
}

function dispatchHostClick(target: HTMLElement): boolean {
  try {
    const view = target.ownerDocument.defaultView;
    if (!view) return false;
    const rect = target.getBoundingClientRect();
    const event = new view.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      view,
      clientX: rect.left + Math.max(8, rect.width * 0.5),
      clientY: rect.top + Math.max(8, rect.height * 0.5),
      button: 0,
      buttons: 1,
      detail: 1,
    });
    target.dispatchEvent(event);
    return true;
  } catch {
    return false;
  }
}

function dispatchHostLongPress(target: HTMLElement): boolean {
  try {
    const view = target.ownerDocument.defaultView;
    if (!view) return false;
    const rect = target.getBoundingClientRect();
    const point = {
      clientX: rect.left + Math.max(8, rect.width * 0.5),
      clientY: rect.top + Math.max(8, rect.height * 0.5),
    };
    const mouseDown = new view.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      view,
      clientX: point.clientX,
      clientY: point.clientY,
      button: 0,
      buttons: 1,
      detail: 1,
    });
    target.dispatchEvent(mouseDown);
    view.setTimeout(() => {
      const mouseUp = new view.MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view,
        clientX: point.clientX,
        clientY: point.clientY,
        button: 0,
        buttons: 0,
        detail: 1,
      });
      target.dispatchEvent(mouseUp);
    }, 620);
    return true;
  } catch {
    return false;
  }
}

export function dispatchPreGalleryImageRefGesture(
  ref: PreGalleryImageRef,
  mode: PreGalleryGestureMode,
): PreGalleryDispatchResult {
  const imageTarget = findCachedHostImageElementForRef(ref) ?? findHostImageElementForRef(ref);
  const buttonTarget = findCachedHostElementForRef(ref) ?? findHostElementForRef(ref);
  const hostTarget = ref.src ? imageTarget : buttonTarget;
  const mesText = findHostMesText(ref.messageId);
  const target = hostTarget ?? mesText;
  if (!target) {
    return { ok: false, method: mode, target: 'none', reason: `宿主楼层 #${ref.messageId} 未找到` };
  }

  if (mode === 'click' && !ref.src && buttonTarget) {
    const ok = dispatchHostClick(buttonTarget);
    return {
      ok,
      method: 'native-button-click',
      target: buttonTarget.className || buttonTarget.tagName.toLowerCase(),
      reason: ok ? '已把单击交回插件原始按钮' : '宿主按钮 click 派发失败',
    };
  }

  if (mode === 'click') {
    const ok = dispatchHostClick(target);
    return {
      ok,
      method: 'host-click',
      target: target.className || target.tagName.toLowerCase(),
      reason: ok ? '已把单击交回宿主图片节点' : '宿主图片 click 派发失败',
    };
  }

  if (mode === 'longpress') {
    const ok = dispatchHostLongPress(target);
    return {
      ok,
      method: 'host-longpress',
      target: target.className || target.tagName.toLowerCase(),
      reason: ok ? '已按插件图片长按时序派发 mousedown/mouseup' : '宿主图片长按派发失败',
    };
  }

  const strategy: HostGestureDispatchStrategy = 'dblclick';
  const ok = dispatchHostPrimaryTrigger(target, { strategy });
  return {
    ok,
    method: strategy,
    target: target.className || target.tagName.toLowerCase(),
    reason: ok
      ? mode === 'longpress'
        ? '已派发移动端三触序列模拟长按入口'
        : '已派发宿主 dblclick'
      : '宿主主手势派发失败',
  };
}

import {
  dispatchHostPrimaryTrigger,
  type HostGestureDispatchStrategy,
  type HostGesturePoint,
} from '../../../界面同层版/界面/状态栏/hostGestureDispatch';

export const PRE_MESSAGE_BODY_SELECTOR = '.pre-message-card__body';

const PRE_MESSAGE_CARD_SELECTOR = '.pre-message-card[data-message-id]';
const PRE_IMAGE_SELECTOR =
  'button.image-tag-button,.st-chatu8-image-button,img,video,.st-chatu8-image-span,.st-chatu8-image-container,.ai-image-container,span.image-tag-placeholder';
const HOST_PROMPT_SELECTOR = 'button.image-tag-button,.st-chatu8-image-button';
const HOST_IMAGE_SELECTOR =
  'img,video,.st-chatu8-image-span,.st-chatu8-image-container,.ai-image-container,span.image-tag-placeholder';
const TOUCH_TAP_WINDOW_MS = 560;
const TOUCH_TAP_RADIUS_PX = 42;
const TOUCH_TRIGGER_COUNT = 3;

type ForwardableEvent = MouseEvent | TouchEvent;

export type PreImageGestureSource = {
  messageId: number;
  swipeId: number;
  element: HTMLElement;
  tag: string;
  link: string;
  requestId: string;
  imageId: string;
  promptToken: string;
  src: string;
  key: string;
};

type TouchGestureState = {
  count: number;
  messageId: number | null;
  imageKey: string;
  point: HostGesturePoint | null;
  updatedAt: number;
};

function normalizeMessageId(value: unknown) {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id >= 0 ? id : null;
}

function normalizeSwipeId(value: unknown) {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id >= 0 ? id : 0;
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function collectHostOnlyDocuments(): Document[] {
  const docs: Document[] = [];
  const push = (doc: Document | null | undefined) => {
    if (!doc || doc === document || docs.includes(doc)) return;
    docs.push(doc);
  };
  try {
    push(window.parent?.document);
  } catch {
    /* cross-origin */
  }
  try {
    push(window.top?.document);
  } catch {
    /* cross-origin */
  }
  return docs;
}

function eventTargetElement(target: EventTarget | null) {
  if (!target) return null;
  if (target instanceof Element) return target;
  const parentElement = (target as Node | null)?.parentElement;
  return parentElement instanceof Element ? parentElement : null;
}

function resolvePreMessageId(target: EventTarget | null) {
  const element = eventTargetElement(target);
  const body = element?.closest?.(PRE_MESSAGE_BODY_SELECTOR);
  const card = body?.closest(PRE_MESSAGE_CARD_SELECTOR);
  return normalizeMessageId(card?.getAttribute('data-message-id'));
}

function resolveImageInteractionElement(element: Element | null) {
  if (!(element instanceof HTMLElement)) return null;
  if (element.matches('img,video')) return element;
  return (element.querySelector('img,video') as HTMLElement | null) ?? element;
}

function readElementSrc(element: Element | null) {
  if (!element) return '';
  if (element instanceof HTMLImageElement || element instanceof HTMLVideoElement)
    return clean(element.currentSrc || element.src);
  const media = element.querySelector('img,video') as HTMLImageElement | HTMLVideoElement | null;
  return media ? clean(media.currentSrc || media.src) : '';
}

function readIdentity(element: Element | null, card: Element | null) {
  if (!element) return { swipeId: 0, tag: '', link: '', requestId: '', imageId: '', promptToken: '', src: '' };
  const identityElement = (element.closest?.(
    '[data-samelayer-request-id],[data-request-id],[data-stable-id],[data-image-id],[data-prompt-token],[data-image-tag],[data-link],[data-swipe-id]',
  ) ?? element) as HTMLElement;
  const tag = clean(identityElement.dataset.imageTag || identityElement.dataset.tag);
  const link = clean(identityElement.dataset.link);
  return {
    swipeId: normalizeSwipeId(identityElement.dataset.swipeId || card?.getAttribute('data-swipe-id')),
    tag,
    link,
    requestId: clean(identityElement.dataset.samelayerRequestId || identityElement.dataset.requestId),
    imageId: clean(identityElement.dataset.stableId || identityElement.dataset.imageId),
    promptToken: clean(identityElement.dataset.promptToken || tag || link),
    src: readElementSrc(element),
  };
}

export function resolvePreImageGestureSource(target: EventTarget | null): PreImageGestureSource | null {
  const element = eventTargetElement(target);
  const body = element?.closest?.(PRE_MESSAGE_BODY_SELECTOR);
  const card = body?.closest(PRE_MESSAGE_CARD_SELECTOR);
  const messageId = normalizeMessageId(card?.getAttribute('data-message-id'));
  const preImage = element?.closest?.(PRE_IMAGE_SELECTOR) ?? null;
  const interactionElement = resolveImageInteractionElement(preImage);
  const identity = readIdentity(preImage, card);
  const key = `${identity.swipeId}:${identity.requestId || identity.imageId || identity.tag || identity.link || identity.promptToken || identity.src}`;
  if (messageId === null || !interactionElement || !key) return null;
  return { messageId, element: interactionElement, ...identity, key };
}

function scoreHostImageCandidate(candidate: Element, source: PreImageGestureSource) {
  const identity = readIdentity(candidate, null);
  const sourceHasStableIdentity = Boolean(source.requestId || source.imageId);
  const stableIdentityMatches =
    (source.requestId && source.requestId === identity.requestId) ||
    (source.imageId && source.imageId === identity.imageId);
  if (sourceHasStableIdentity && !stableIdentityMatches) return 0;
  let score = 0;
  if (source.tag && source.tag === identity.tag) score += 10;
  if (source.link && source.link === identity.link) score += 10;
  if (source.requestId && source.requestId === identity.requestId) score += 12;
  if (source.imageId && source.imageId === identity.imageId) score += 12;
  if (!sourceHasStableIdentity && source.promptToken && source.promptToken === identity.promptToken) score += 10;
  if (!sourceHasStableIdentity && source.src && source.src === identity.src) score += 8;
  if (candidate.matches('img,video')) score += 2;
  return score;
}

function resolveHostMessageText(messageId: number): HTMLElement | null {
  for (const doc of collectHostOnlyDocuments()) {
    const root = doc.querySelector(
      [
        `.mes[mesid='${messageId}']`,
        `.mes[data-message-index='${messageId}']`,
        `.mes[data-message-id='${messageId}']`,
      ].join(','),
    );
    const mesText = root?.querySelector?.('.mes_text') as HTMLElement | null;
    if (mesText) return mesText;
  }
  return null;
}

function resolveHostPromptTarget(source: PreImageGestureSource): HTMLElement | null {
  const hostMessageRoot = resolveHostMessageText(source.messageId);
  if (!hostMessageRoot) return null;

  let best: HTMLElement | null = null;
  let bestScore = 0;
  let bestTargetCount = 0;
  for (const candidate of Array.from(hostMessageRoot.querySelectorAll(HOST_PROMPT_SELECTOR))) {
    const score = scoreHostImageCandidate(candidate, source);
    if (score > bestScore) {
      best = candidate as HTMLElement;
      bestScore = score;
      bestTargetCount = 1;
    } else if (score > 0 && score === bestScore) {
      bestTargetCount += 1;
    }
  }
  return bestScore > 0 && bestTargetCount === 1 ? best : null;
}

export function resolveHostImageTarget(source: PreImageGestureSource): HTMLElement | null {
  for (const doc of collectHostOnlyDocuments()) {
    const root = doc.querySelector(
      [
        `.mes[mesid='${source.messageId}']`,
        `.mes[data-message-index='${source.messageId}']`,
        `.mes[data-message-id='${source.messageId}']`,
      ].join(','),
    );
    const hostMessageRoot = (root?.querySelector?.('.mes_text') ?? root) as HTMLElement | null;
    if (!hostMessageRoot) continue;

    let best: HTMLElement | null = null;
    let bestScore = 0;
    let bestTargetCount = 0;
    const seenTargets = new Set<HTMLElement>();
    for (const candidate of Array.from(hostMessageRoot.querySelectorAll(HOST_IMAGE_SELECTOR))) {
      const target = resolveImageInteractionElement(candidate);
      if (!target || seenTargets.has(target)) continue;
      seenTargets.add(target);
      const score = scoreHostImageCandidate(candidate, source);
      if (score > bestScore) {
        best = target;
        bestScore = score;
        bestTargetCount = 1;
      } else if (score > 0 && score === bestScore) {
        bestTargetCount += 1;
      }
    }
    if (bestScore > 0 && bestTargetCount === 1) return best;
  }
  return null;
}

function readEventPoint(event: ForwardableEvent): HostGesturePoint | null {
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const touch = event.changedTouches?.[0] ?? event.touches?.[0];
    if (!touch) return null;
    return { clientX: touch.clientX, clientY: touch.clientY };
  }
  return { clientX: event.clientX, clientY: event.clientY };
}

function readHostPointFromIframeEvent(event: ForwardableEvent): HostGesturePoint | null {
  const point = readEventPoint(event);
  if (!point) return null;
  const frame = window.frameElement as HTMLElement | null;
  if (!frame) return point;
  try {
    const rect = frame.getBoundingClientRect();
    return { clientX: rect.left + point.clientX, clientY: rect.top + point.clientY };
  } catch {
    return point;
  }
}

function distance(a: HostGesturePoint | null, b: HostGesturePoint | null) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function stopIframePluginCapture(event: Event) {
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function forwardPreMessageBodyGestureToHostMessage(
  messageId: number,
  event: ForwardableEvent,
  strategy?: HostGestureDispatchStrategy,
) {
  const hostPoint = readHostPointFromIframeEvent(event);
  const hostMesText = resolveHostMessageText(messageId);
  stopIframePluginCapture(event);
  if (!hostMesText) return false;
  return dispatchHostPrimaryTrigger(hostMesText, { hostPoint, strategy });
}

export function forwardPreImageGestureToHostMessage(
  source: PreImageGestureSource,
  event: ForwardableEvent,
  strategy?: HostGestureDispatchStrategy,
) {
  const hostPromptTarget = source.src ? null : resolveHostPromptTarget(source);
  const hostImageTarget = source.src ? resolveHostImageTarget(source) : null;
  const hostTarget = hostPromptTarget ?? hostImageTarget;
  const hostPoint = readHostPointFromIframeEvent(event);
  stopIframePluginCapture(event);
  if (!hostTarget) return false;
  const dispatchTarget = hostPromptTarget ? (resolveHostMessageText(source.messageId) ?? hostTarget) : hostTarget;
  return dispatchHostPrimaryTrigger(dispatchTarget, { hostPoint, strategy });
}

export function installPreHostImageGestureForwarder() {
  const touchState: TouchGestureState = { count: 0, messageId: null, imageKey: '', point: null, updatedAt: 0 };
  const resetTouchState = () => {
    touchState.count = 0;
    touchState.messageId = null;
    touchState.imageKey = '';
    touchState.point = null;
    touchState.updatedAt = 0;
  };

  const handleDoubleClick = (event: MouseEvent) => {
    const source = resolvePreImageGestureSource(event.target);
    const messageId = source?.messageId ?? resolvePreMessageId(event.target);
    if (messageId === null) return;
    if (source) return forwardPreImageGestureToHostMessage(source, event, 'dblclick');
    return forwardPreMessageBodyGestureToHostMessage(messageId, event, 'dblclick');
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (event.changedTouches.length !== 1) {
      resetTouchState();
      return;
    }
    const source = resolvePreImageGestureSource(event.target);
    const messageId = source?.messageId ?? resolvePreMessageId(event.target);
    if (messageId === null) {
      resetTouchState();
      return;
    }
    const imageKey = source?.key ?? `body:${messageId}`;
    const point = readEventPoint(event);
    const now = Date.now();
    const isSameGesture =
      touchState.messageId === messageId &&
      touchState.imageKey === imageKey &&
      now - touchState.updatedAt <= TOUCH_TAP_WINDOW_MS &&
      distance(touchState.point, point) <= TOUCH_TAP_RADIUS_PX;
    touchState.count = isSameGesture ? touchState.count + 1 : 1;
    touchState.messageId = messageId;
    touchState.imageKey = imageKey;
    touchState.point = point;
    touchState.updatedAt = now;
    if (touchState.count < TOUCH_TRIGGER_COUNT) return;

    resetTouchState();
    return source
      ? forwardPreImageGestureToHostMessage(source, event, 'mobile-touch-sequence')
      : forwardPreMessageBodyGestureToHostMessage(messageId, event, 'mobile-touch-sequence');
  };

  return { handleDoubleClick, handleTouchEnd };
}

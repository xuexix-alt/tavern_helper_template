import {
  dispatchHostPrimaryTrigger,
  type HostGestureDispatchStrategy,
  type HostGesturePoint,
} from '../../../界面同层版/界面/状态栏/hostGestureDispatch.ts';
import { readPluginField, readPluginMediaSrc } from './prePluginMedia.ts';

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
  if (value === null || value === undefined || value === '') return null;
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
  if (typeof (target as Element).closest === 'function') return target as Element;
  const parentElement = (target as Node | null)?.parentElement;
  return parentElement instanceof Element ? parentElement : null;
}

function resolvePreMessageId(target: EventTarget | null) {
  const element = eventTargetElement(target);
  if (
    element?.closest(
      'a,input,textarea,select,summary,[contenteditable="true"],button:not(.image-tag-button):not(.st-chatu8-image-button)',
    )
  )
    return null;
  const body = element?.closest?.(PRE_MESSAGE_BODY_SELECTOR);
  const card = body?.closest(PRE_MESSAGE_CARD_SELECTOR);
  const id = normalizeMessageId(card?.getAttribute('data-message-id'));
  if (id === null || !isCurrentSwipe(id, normalizeSwipeId(card?.getAttribute('data-swipe-id')))) return null;
  return id;
}

function isCurrentSwipe(messageId: number, swipeId: number) {
  for (const doc of collectHostOnlyDocuments()) {
    const context = (doc.defaultView as any)?.SillyTavern?.getContext?.();
    if (Array.isArray(context?.chat)) {
      const message = context.chat[messageId];
      return Boolean(message && normalizeSwipeId(message.swipe_id) === swipeId);
    }
  }
  return true;
}

function resolveImageInteractionElement(element: Element | null) {
  if (!element || typeof element.matches !== 'function') return null;
  if (element.matches('img,video')) return element as HTMLElement;
  return (element.querySelector('img,video') as HTMLElement | null) ?? (element as HTMLElement);
}

function readElementSrc(element: Element | null) {
  return readPluginMediaSrc(element);
}

function readIdentity(element: Element | null, card: Element | null) {
  if (!element) return { swipeId: 0, tag: '', link: '', requestId: '', imageId: '', promptToken: '', src: '' };
  const tag = readPluginField(element, ['imageTag', 'tag']);
  const link = readPluginField(element, ['link']);
  return {
    swipeId: normalizeSwipeId(readPluginField(element, ['swipeId']) || card?.getAttribute('data-swipe-id')),
    tag,
    link,
    requestId: readPluginField(element, ['samelayerRequestId', 'requestId']),
    imageId: readPluginField(element, ['stableId', 'imageId']),
    promptToken: readPluginField(element, ['promptToken']) || tag || link,
    src: readElementSrc(element),
  };
}

export function resolvePreImageGestureSource(target: EventTarget | null): PreImageGestureSource | null {
  const element = eventTargetElement(target);
  const body = element?.closest?.(PRE_MESSAGE_BODY_SELECTOR);
  const card = body?.closest(PRE_MESSAGE_CARD_SELECTOR);
  const messageId = resolvePreMessageId(target);
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
  if (score > 0 && candidate.matches('img,video')) score += 2;
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
  let bodyTouchStart: HostGesturePoint | null = null;
  let held: {
    target: HTMLElement;
    source: PreImageGestureSource;
    started: number;
    point: HostGesturePoint;
    pointerId: number;
  } | null = null;
  let suppressClickUntil = 0;
  const dispatchMouse = (target: HTMLElement, type: string) => {
    const view = target.ownerDocument.defaultView;
    if (!view) return false;
    target.dispatchEvent(new view.MouseEvent(type, { bubbles: true, cancelable: true, view, button: 0 }));
    return true;
  };
  const nativeTarget = (source: PreImageGestureSource) =>
    source.src ? resolveHostImageTarget(source) : resolveHostPromptTarget(source);
  const isMediaEvent = (event: Event) => {
    const el = eventTargetElement(event.target);
    return !!el?.closest(PRE_MESSAGE_BODY_SELECTOR) && !!el.closest(PRE_IMAGE_SELECTOR);
  };
  const handleClick = (event: MouseEvent) => {
    if (!isMediaEvent(event)) return;
    stopIframePluginCapture(event);
    if (Date.now() < suppressClickUntil) return;
    const source = resolvePreImageGestureSource(event.target);
    const target = source && nativeTarget(source);
    if (target) dispatchMouse(target, 'click');
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (!isMediaEvent(event) || event.button !== 0 || event.isPrimary === false) return;
    stopIframePluginCapture(event);
    const source = resolvePreImageGestureSource(event.target);
    if (!source) return;
    // Editing must use the host button so plugin context/tag saving binds to CHAT.
    const target = resolveHostPromptTarget(source);
    if (!target) return;
    cancelPointer();
    held = { target, source, started: Date.now(), point: event, pointerId: event.pointerId };
    dispatchMouse(target, 'mousedown');
  };
  const cancelPointer = () => {
    if (held) dispatchMouse(held.target, 'mouseup');
    held = null;
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (held && distance(held.point, event) > 15) {
      suppressClickUntil = Date.now() + 700;
      cancelPointer();
    }
  };
  const handlePointerUp = (event: PointerEvent) => {
    const session = held;
    if (!session || session.pointerId !== event.pointerId) return;
    stopIframePluginCapture(event);
    cancelPointer();
    const source = resolvePreImageGestureSource(event.target);
    const same = source?.key === session.source.key && source?.messageId === session.source.messageId;
    if (!same || Date.now() - session.started >= 1200) {
      suppressClickUntil = Date.now() + 700;
      return;
    }
    if (event.pointerType === 'touch') {
      suppressClickUntil = Date.now() + 700;
      const target = nativeTarget(session.source);
      if (target) dispatchMouse(target, 'click');
    }
  };
  const handleTouchStart = (event: TouchEvent) => {
    if (isMediaEvent(event)) {
      // Keep native page panning/pinch-zoom; only the plugin listener is blocked.
      event.stopPropagation();
      event.stopImmediatePropagation();
    } else
      bodyTouchStart =
        event.touches.length === 1 ? { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY } : null;
  };
  const touchState: TouchGestureState = { count: 0, messageId: null, imageKey: '', point: null, updatedAt: 0 };
  const resetTouchState = () => {
    touchState.count = 0;
    touchState.messageId = null;
    touchState.imageKey = '';
    touchState.point = null;
    touchState.updatedAt = 0;
  };

  const handleDoubleClick = (event: MouseEvent) => {
    // Browser click-click already performs the native image action. Never send
    // a third dblclick, or route media gestures through the body menu.
    if (isMediaEvent(event)) return stopIframePluginCapture(event);
    const source = resolvePreImageGestureSource(event.target);
    const messageId = source?.messageId ?? resolvePreMessageId(event.target);
    if (messageId === null) return;
    if (source) return forwardPreImageGestureToHostMessage(source, event, 'dblclick');
    return forwardPreMessageBodyGestureToHostMessage(messageId, event, 'dblclick');
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (isMediaEvent(event)) return stopIframePluginCapture(event);
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
    if (!bodyTouchStart || distance(bodyTouchStart, point) > 15) {
      resetTouchState();
      return;
    }
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
    // Own every body tap, not only the third: the plugin iframe listener must
    // never accumulate a competing body/HTML sequence using carrier floor #0.
    stopIframePluginCapture(event);
    if (touchState.count < TOUCH_TRIGGER_COUNT) return;

    resetTouchState();
    return source
      ? forwardPreImageGestureToHostMessage(source, event, 'mobile-touch-sequence')
      : forwardPreMessageBodyGestureToHostMessage(messageId, event, 'mobile-touch-sequence');
  };

  return {
    handleDoubleClick,
    handleTouchEnd,
    handleTouchStart,
    handleClick,
    handlePointerDown,
    handlePointerUp,
    handlePointerMove,
    cancelPointer,
    destroy: cancelPointer,
  };
}

import {
  dispatchHostPrimaryTrigger,
  type HostGestureDispatchStrategy,
  type HostGesturePoint,
} from '../../../界面同层版/界面/状态栏/hostGestureDispatch';

export const PRE_MESSAGE_BODY_SELECTOR = '.pre-message-card__body';

const PRE_MESSAGE_CARD_SELECTOR = '.pre-message-card[data-message-id]';
const TOUCH_TAP_WINDOW_MS = 560;
const TOUCH_TAP_RADIUS_PX = 42;
const TOUCH_TRIGGER_COUNT = 3;

type ForwardableEvent = MouseEvent | TouchEvent;

type TouchGestureState = {
  count: number;
  messageId: number | null;
  point: HostGesturePoint | null;
  updatedAt: number;
};

function normalizeMessageId(value: unknown) {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id >= 0 ? id : null;
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
  if (!body) return null;

  const card = body.closest(PRE_MESSAGE_CARD_SELECTOR);
  return normalizeMessageId(card?.getAttribute('data-message-id'));
}

function resolveHostMessageText(messageId: number) {
  const normalizedId = normalizeMessageId(messageId);
  if (normalizedId === null) return null;

  for (const doc of collectHostOnlyDocuments()) {
    const root = doc.querySelector(
      [
        `.mes[mesid='${normalizedId}']`,
        `.mes[data-message-index='${normalizedId}']`,
        `.mes[data-message-id='${normalizedId}']`,
      ].join(','),
    );
    const hostMesText = root?.querySelector?.('.mes_text') as HTMLElement | null;
    if (hostMesText) return hostMesText;
  }

  return null;
}

function readEventPoint(event: ForwardableEvent): HostGesturePoint | null {
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const touch = event.changedTouches?.[0] ?? event.touches?.[0];
    if (!touch) return null;
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
    };
  }

  return {
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

function readHostPointFromIframeEvent(event: ForwardableEvent): HostGesturePoint | null {
  const point = readEventPoint(event);
  if (!point) return null;

  const frame = window.frameElement as HTMLElement | null;
  if (!frame) return point;

  try {
    const rect = frame.getBoundingClientRect();
    return {
      clientX: rect.left + point.clientX,
      clientY: rect.top + point.clientY,
    };
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

export function forwardPreImageGestureToHostMessage(
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

export function installPreHostImageGestureForwarder() {
  const touchState: TouchGestureState = {
    count: 0,
    messageId: null,
    point: null,
    updatedAt: 0,
  };

  const resetTouchState = () => {
    touchState.count = 0;
    touchState.messageId = null;
    touchState.point = null;
    touchState.updatedAt = 0;
  };

  const handleDoubleClick = (event: MouseEvent) => {
    const messageId = resolvePreMessageId(event.target);
    if (messageId === null) return;
    forwardPreImageGestureToHostMessage(messageId, event, 'dblclick');
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (event.changedTouches.length !== 1) {
      resetTouchState();
      return;
    }

    const messageId = resolvePreMessageId(event.target);
    if (messageId === null) {
      resetTouchState();
      return;
    }

    const point = readEventPoint(event);
    const now = Date.now();
    const isSameGesture =
      touchState.messageId === messageId &&
      now - touchState.updatedAt <= TOUCH_TAP_WINDOW_MS &&
      distance(touchState.point, point) <= TOUCH_TAP_RADIUS_PX;

    touchState.count = isSameGesture ? touchState.count + 1 : 1;
    touchState.messageId = messageId;
    touchState.point = point;
    touchState.updatedAt = now;

    if (touchState.count < TOUCH_TRIGGER_COUNT) return;

    resetTouchState();
    forwardPreImageGestureToHostMessage(messageId, event, 'mobile-touch-sequence');
  };

  return {
    handleDoubleClick,
    handleTouchEnd,
  };
}

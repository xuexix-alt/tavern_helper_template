export type HostGesturePoint = {
  clientX: number;
  clientY: number;
};

export type HostGestureDispatchStrategy = 'auto' | 'dblclick' | 'mobile-touch-sequence';

type WindowLike = Window & typeof globalThis;

function resolveDispatchPoint(target: HTMLElement, hostPoint?: HostGesturePoint | null): HostGesturePoint {
  if (hostPoint?.clientX != null && hostPoint?.clientY != null) {
    return {
      clientX: Number(hostPoint.clientX),
      clientY: Number(hostPoint.clientY),
    };
  }

  const rect = target.getBoundingClientRect();
  const width = Math.max(rect.width, 16);
  const height = Math.max(rect.height, 16);
  return {
    clientX: Math.round(rect.left + Math.min(width - 8, Math.max(8, width * 0.3))),
    clientY: Math.round(rect.top + Math.min(height - 8, Math.max(8, height * 0.35))),
  };
}

function isLikelyMobileHostView(view: WindowLike | null | undefined): boolean {
  if (!view) return false;
  try {
    const touchCapable =
      'ontouchstart' in view || Number((view.navigator as Navigator | undefined)?.maxTouchPoints ?? 0) > 0;
    const width = Number(view.innerWidth ?? 0);
    return touchCapable && width > 0 && width <= 768;
  } catch {
    return false;
  }
}

function decorateTouchEvent(event: Event, target: HTMLElement, point: HostGesturePoint, phase: 'start' | 'end'): Event {
  const touchLike = {
    identifier: 1,
    target,
    clientX: point.clientX,
    clientY: point.clientY,
    pageX: point.clientX,
    pageY: point.clientY,
    screenX: point.clientX,
    screenY: point.clientY,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  };

  Object.defineProperties(event, {
    touches: {
      configurable: true,
      enumerable: true,
      value: phase === 'end' ? [] : [touchLike],
    },
    changedTouches: {
      configurable: true,
      enumerable: true,
      value: [touchLike],
    },
    targetTouches: {
      configurable: true,
      enumerable: true,
      value: phase === 'end' ? [] : [touchLike],
    },
  });

  return event;
}

function dispatchMobileTripleTouch(target: HTMLElement, view: WindowLike, point: HostGesturePoint): boolean {
  const dispatchTap = () => {
    const touchStart = decorateTouchEvent(
      new view.Event('touchstart', {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
      target,
      point,
      'start',
    );
    target.dispatchEvent(touchStart);

    const touchEnd = decorateTouchEvent(
      new view.Event('touchend', {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
      target,
      point,
      'end',
    );
    target.dispatchEvent(touchEnd);
  };

  dispatchTap();
  view.setTimeout(() => dispatchTap(), 80);
  view.setTimeout(() => dispatchTap(), 160);

  return true;
}

export function dispatchHostPrimaryTrigger(
  target: HTMLElement,
  options: {
    hostPoint?: HostGesturePoint | null;
    strategy?: HostGestureDispatchStrategy;
  } = {},
): boolean {
  try {
    const doc = target.ownerDocument;
    const view = doc.defaultView as WindowLike | null;
    if (!view) return false;

    const point = resolveDispatchPoint(target, options.hostPoint ?? null);
    const strategy = options.strategy ?? 'auto';
    const shouldDispatchTouchSequence =
      strategy === 'mobile-touch-sequence' || (strategy === 'auto' && isLikelyMobileHostView(view));
    if (shouldDispatchTouchSequence) {
      return dispatchMobileTripleTouch(target, view, point);
    }

    const dblClickEvent = new view.MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      composed: true,
      view,
      clientX: point.clientX,
      clientY: point.clientY,
      button: 0,
      buttons: 1,
      detail: 2,
    });
    target.dispatchEvent(dblClickEvent);
    return true;
  } catch {
    return false;
  }
}

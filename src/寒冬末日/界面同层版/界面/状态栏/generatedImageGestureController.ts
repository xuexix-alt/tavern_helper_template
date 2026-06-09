export type GeneratedImageGesturePoint = {
  clientX: number;
  clientY: number;
};

export type GeneratedImageGestureController = {
  handleClick: () => void;
  handleDoubleClick: () => void;
  handleTouchStart: (point?: GeneratedImageGesturePoint | null) => void;
  handleTouchMove: (point?: GeneratedImageGesturePoint | null) => void;
  handleTouchEnd: (point?: GeneratedImageGesturePoint | null) => void;
  handleTouchCancel: () => void;
  dispose: () => void;
};

export function createGeneratedImageGestureController(input: {
  clickDelayMs?: number;
  longPressMs?: number;
  maxTapMovePx?: number;
  onView: () => void;
  onRegenerate: () => void;
  onTag?: () => void;
}): GeneratedImageGestureController {
  const clickDelayMs = Math.max(0, Number(input.clickDelayMs ?? 350));
  const longPressMs = Math.max(0, Number(input.longPressMs ?? 420));
  const maxTapMovePx = Math.max(0, Number(input.maxTapMovePx ?? 10));
  const scheduleTimeout = globalThis.setTimeout.bind(globalThis);
  const cancelTimeout = globalThis.clearTimeout.bind(globalThis);
  let clickTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let longPressTriggered = false;
  let suppressClickUntil = 0;
  let touchDoubleTapPending = false;
  let touchStartPoint: GeneratedImageGesturePoint | null = null;
  let touchMovedBeyondTap = false;

  const clearClickTimer = () => {
    if (!clickTimer) return;
    cancelTimeout(clickTimer);
    clickTimer = 0;
  };

  const clearLongPressTimer = () => {
    if (!longPressTimer) return;
    cancelTimeout(longPressTimer);
    longPressTimer = 0;
  };

  const markTouchHandled = () => {
    suppressClickUntil = Date.now() + 600;
  };

  const normalizePoint = (point?: GeneratedImageGesturePoint | null): GeneratedImageGesturePoint | null => {
    const clientX = Number(point?.clientX);
    const clientY = Number(point?.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    return { clientX, clientY };
  };

  const resetTouchMovement = () => {
    touchStartPoint = null;
    touchMovedBeyondTap = false;
  };

  const noteTouchMovement = (point?: GeneratedImageGesturePoint | null) => {
    if (touchMovedBeyondTap) return;
    const currentPoint = normalizePoint(point);
    if (!touchStartPoint || !currentPoint) return;
    const deltaX = currentPoint.clientX - touchStartPoint.clientX;
    const deltaY = currentPoint.clientY - touchStartPoint.clientY;
    if (Math.hypot(deltaX, deltaY) <= maxTapMovePx) return;
    touchMovedBeyondTap = true;
    touchDoubleTapPending = false;
    clearClickTimer();
    clearLongPressTimer();
    markTouchHandled();
  };

  return {
    handleClick() {
      if (Date.now() < suppressClickUntil) {
        return;
      }
      clearClickTimer();
      clickTimer = scheduleTimeout(() => {
        clickTimer = 0;
        input.onView();
      }, clickDelayMs);
    },
    handleDoubleClick() {
      clearClickTimer();
      touchDoubleTapPending = false;
      suppressClickUntil = Date.now() + 700;
      input.onRegenerate();
    },
    handleTouchStart(point) {
      clearLongPressTimer();
      longPressTriggered = false;
      touchStartPoint = normalizePoint(point);
      touchMovedBeyondTap = false;
      if (clickTimer) {
        clearClickTimer();
        touchDoubleTapPending = true;
        return;
      }
      touchDoubleTapPending = false;
      longPressTimer = scheduleTimeout(() => {
        longPressTimer = 0;
        longPressTriggered = true;
        touchDoubleTapPending = false;
        markTouchHandled();
        (input.onTag ?? input.onView)();
      }, longPressMs);
    },
    handleTouchMove(point) {
      noteTouchMovement(point);
    },
    handleTouchEnd(point) {
      noteTouchMovement(point);
      clearLongPressTimer();
      if (touchMovedBeyondTap) {
        longPressTriggered = false;
        touchDoubleTapPending = false;
        markTouchHandled();
        resetTouchMovement();
        return;
      }
      if (longPressTriggered) {
        longPressTriggered = false;
        touchDoubleTapPending = false;
        resetTouchMovement();
        return;
      }
      markTouchHandled();
      if (touchDoubleTapPending) {
        touchDoubleTapPending = false;
        suppressClickUntil = Date.now() + 700;
        resetTouchMovement();
        input.onRegenerate();
        return;
      }
      clearClickTimer();
      clickTimer = scheduleTimeout(() => {
        clickTimer = 0;
        input.onView();
      }, clickDelayMs);
      resetTouchMovement();
    },
    handleTouchCancel() {
      clearLongPressTimer();
      longPressTriggered = false;
      touchDoubleTapPending = false;
      markTouchHandled();
      resetTouchMovement();
    },
    dispose() {
      clearClickTimer();
      clearLongPressTimer();
      touchDoubleTapPending = false;
      resetTouchMovement();
    },
  };
}

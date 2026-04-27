export type GeneratedImageGestureController = {
  handleClick: () => void;
  handleDoubleClick: () => void;
  handleTouchStart: () => void;
  handleTouchEnd: () => void;
  handleTouchCancel: () => void;
  dispose: () => void;
};

export function createGeneratedImageGestureController(input: {
  clickDelayMs?: number;
  longPressMs?: number;
  onView: () => void;
  onRegenerate: () => void;
}): GeneratedImageGestureController {
  const clickDelayMs = Math.max(0, Number(input.clickDelayMs ?? 350));
  const longPressMs = Math.max(0, Number(input.longPressMs ?? 420));
  const scheduleTimeout = globalThis.setTimeout.bind(globalThis);
  const cancelTimeout = globalThis.clearTimeout.bind(globalThis);
  let clickTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let longPressTriggered = false;
  let suppressClickUntil = 0;
  let touchDoubleTapPending = false;

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
    handleTouchStart() {
      clearLongPressTimer();
      longPressTriggered = false;
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
        input.onView();
      }, longPressMs);
    },
    handleTouchEnd() {
      clearLongPressTimer();
      if (longPressTriggered) {
        longPressTriggered = false;
        touchDoubleTapPending = false;
        return;
      }
      markTouchHandled();
      if (touchDoubleTapPending) {
        touchDoubleTapPending = false;
        suppressClickUntil = Date.now() + 700;
        input.onRegenerate();
        return;
      }
      clearClickTimer();
      clickTimer = scheduleTimeout(() => {
        clickTimer = 0;
        input.onView();
      }, clickDelayMs);
    },
    handleTouchCancel() {
      clearLongPressTimer();
      longPressTriggered = false;
      touchDoubleTapPending = false;
    },
    dispose() {
      clearClickTimer();
      clearLongPressTimer();
      touchDoubleTapPending = false;
    },
  };
}

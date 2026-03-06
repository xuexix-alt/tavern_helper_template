type TouchScrollBridgeOptions = {
  root: () => HTMLElement | null;
};

function isMobileTouchEnv(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const hasTouch = (navigator?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
  const narrowViewport = Number(window.innerWidth || 0) > 0 && Number(window.innerWidth || 0) <= 920;
  return (coarsePointer || hasTouch) && narrowViewport;
}

function isScrollableY(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  const allowOverflow = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  if (!allowOverflow) return false;
  return el.scrollHeight > el.clientHeight + 1;
}

function getScrollableAncestors(target: EventTarget | null, root: HTMLElement): HTMLElement[] {
  if (!(target instanceof Element)) return [];
  const chain: HTMLElement[] = [];
  let cur: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
  while (cur) {
    if (!root.contains(cur) && cur !== root) break;
    if (isScrollableY(cur)) chain.push(cur);
    if (cur === root) break;
    cur = cur.parentElement;
  }
  return chain;
}

function canScroll(el: HTMLElement, deltaY: number): boolean {
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 0.1) return false;
  if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  return el.scrollTop > 1;
}

function applyScrollDelta(el: HTMLElement, deltaY: number): boolean {
  const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
  const before = el.scrollTop;
  const next = Math.min(maxTop, Math.max(0, before + deltaY));
  if (Math.abs(next - before) < 0.1) return false;
  el.scrollTop = next;
  return true;
}

export function createMobileTouchScrollBridge(options: TouchScrollBridgeOptions): () => void {
  let active = false;
  let lastTouchY = 0;
  let scrollChain: HTMLElement[] = [];

  const onTouchStart = (event: TouchEvent) => {
    if (!isMobileTouchEnv()) return;
    const root = options.root();
    if (!root) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    lastTouchY = touch.clientY;
    scrollChain = getScrollableAncestors(event.target, root);
    active = scrollChain.length > 0;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!active) return;
    if (!isMobileTouchEnv()) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaY = lastTouchY - touch.clientY;
    if (Math.abs(deltaY) < 0.2) return;
    lastTouchY = touch.clientY;

    for (const node of scrollChain) {
      if (!canScroll(node, deltaY)) continue;
      if (applyScrollDelta(node, deltaY)) {
        event.preventDefault();
        return;
      }
    }
    // No scrollable container in this iframe can consume delta.
    // Keep default behavior so browser may chain to outer host scroll context.
  };

  const onTouchEnd = () => {
    active = false;
    scrollChain = [];
  };

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });

  return () => {
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);
  };
}

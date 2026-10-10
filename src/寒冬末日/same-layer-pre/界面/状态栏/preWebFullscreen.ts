const FULLSCREEN_ATTR = 'data-eden-pre-fullscreen';
const STYLE_ID = 'eden-pre-web-fullscreen-style';

export interface PreWebFullscreenState {
  active: boolean;
  height: number;
}

/** A host preview can open without moving focus out of the PRE iframe. */
export function forwardEscapeToHostOverlay(frame: HTMLIFrameElement): boolean {
  const doc = frame.ownerDocument;
  const host = doc.defaultView;
  if (!host) return false;
  const rect = frame.getBoundingClientRect();
  const front = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!front || front === frame || front.contains(frame)) return false;
  // Let the host's existing popup handler consume Escape; do not close PRE too.
  doc.dispatchEvent(
    new host.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
  );
  return true;
}

/** Keep the live iframe in its original .mes_text; only borrow presentation styles. */
export function createPreWebFullscreenController(
  frame: HTMLIFrameElement,
  onChange: (state: PreWebFullscreenState) => void = () => undefined,
) {
  const doc = frame.ownerDocument;
  const host = doc.defaultView!;
  let active = false;
  let style: HTMLStyleElement | null = null;
  let observer: MutationObserver | null = null;
  let ancestors: HTMLElement[] = [];
  const attributes: Array<{ element: HTMLElement; previous: string | null; owned: string }> = [];
  let scrollPositions: Array<{ element: HTMLElement; top: number; left: number }> = [];

  function mark(element: HTMLElement, value: string) {
    attributes.push({ element, previous: element.getAttribute(FULLSCREEN_ATTR), owned: value });
    element.setAttribute(FULLSCREEN_ATTR, value);
  }

  function exit() {
    if (!active) return;
    active = false;
    observer?.disconnect();
    observer = null;
    style?.remove();
    style = null;
    for (const { element, previous, owned } of attributes.splice(0)) {
      if (element.getAttribute(FULLSCREEN_ATTR) !== owned) continue;
      if (previous === null) element.removeAttribute(FULLSCREEN_ATTR);
      else element.setAttribute(FULLSCREEN_ATTR, previous);
    }
    for (const { element, top, left } of scrollPositions) {
      if (!element.isConnected) continue;
      element.scrollTop = top;
      element.scrollLeft = left;
    }
    scrollPositions = [];
    ancestors = [];
    onChange({ active: false, height: 0 });
  }

  function updateViewport() {
    if (!active || !style) return;
    const viewport = host.visualViewport;
    const width = Math.max(1, viewport?.width ?? host.innerWidth);
    const height = Math.max(1, viewport?.height ?? host.innerHeight);
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    // 900 sits below native image menus (10000) and TavernPhone's own overlay.
    // Ancestor fixed positioning, transforms and containment can trap a fixed iframe.
    style.textContent = `
[${FULLSCREEN_ATTR}="ancestor"], [${FULLSCREEN_ATTR}="root"] {
  position: static !important; z-index: auto !important; isolation: auto !important;
  transform: none !important; translate: none !important; rotate: none !important; scale: none !important;
  filter: none !important; backdrop-filter: none !important; perspective: none !important;
  contain: none !important; container-type: normal !important; content-visibility: visible !important;
  will-change: auto !important; clip: auto !important; clip-path: none !important;
  mask: none !important; opacity: 1 !important; mix-blend-mode: normal !important;
  animation: none !important; transition: none !important;
}
[${FULLSCREEN_ATTR}="ancestor"] { overflow: visible !important; }
[${FULLSCREEN_ATTR}="root"] { overflow: hidden !important; scroll-behavior: auto !important; }
/* Tavern's fixed navigation is above ordinary popups; keep it out of PRE's header. */
html[${FULLSCREEN_ATTR}="root"] #top-bar,
html[${FULLSCREEN_ATTR}="root"] #top-settings-holder { visibility: hidden !important; pointer-events: none !important; }
iframe[${FULLSCREEN_ATTR}="frame"] {
  position: fixed !important; inset: auto !important; left: ${left}px !important; top: ${top}px !important;
  width: ${width}px !important; height: ${height}px !important;
  min-width: 0 !important; min-height: 0 !important; max-width: none !important; max-height: none !important;
  margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important;
  box-sizing: border-box !important; display: block !important; z-index: 900 !important;
  transform: none !important; transition: none !important;
}`;
    onChange({ active: true, height });
  }

  function enter(): boolean {
    if (active) return true;
    // A second PRE must not take ownership of the first one's styles.
    if (!frame.isConnected || !host || doc.getElementById(STYLE_ID)) return false;
    let innerRoot: HTMLElement | undefined;
    try {
      innerRoot = frame.contentDocument?.documentElement;
    } catch {
      return false;
    }
    if (!innerRoot) return false;
    ancestors = [];
    for (let node = frame.parentElement; node; node = node.parentElement) ancestors.push(node);
    scrollPositions = ancestors.map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
    active = true;
    try {
      style = doc.createElement('style');
      style.id = STYLE_ID;
      for (const ancestor of ancestors) {
        mark(ancestor, ancestor === doc.body || ancestor === doc.documentElement ? 'root' : 'ancestor');
      }
      mark(frame, 'frame');
      mark(innerRoot, 'viewport');
      doc.head.append(style);
      updateViewport();
      // Host rerenders can remove the carrier without notifying the old Vue app.
      // Both observer AND callback must belong to the host realm. Browser callback
      // dispatch suppresses functions created in an iframe after it is detached.
      observer = new host.Function(
        'frame',
        'ancestors',
        'exit',
        `
        const observer = new MutationObserver(function () {
          if (!frame.isConnected || ancestors.some(function (node) { return !node.contains(frame); })) exit();
        });
        observer.observe(frame.ownerDocument.body, { childList: true, subtree: true });
        return observer;
      `,
      )(frame, ancestors, exit) as MutationObserver;
      return true;
    } catch (error) {
      exit();
      throw error;
    }
  }

  return {
    enter,
    exit,
    updateViewport,
    get active() {
      return active;
    },
  };
}

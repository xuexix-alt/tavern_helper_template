const HOST_VISUAL_HIDE_STYLE_ID = 'eden-same-layer-pre-host-visual-hide-style';
const HOST_VISUAL_HIDE_ATTR = 'data-eden-host-hidden';
const PRE_VISUAL_HIDE_OWNER_ATTR = 'data-eden-pre-host-hidden';

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

function ensureHostVisualHideStyle(doc: Document) {
  if (doc.getElementById(HOST_VISUAL_HIDE_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = HOST_VISUAL_HIDE_STYLE_ID;
  style.textContent = `
[${HOST_VISUAL_HIDE_ATTR}="true"] {
  visibility: hidden !important;
  pointer-events: none !important;
  overflow: hidden !important;
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border-top-width: 0 !important;
  border-bottom-width: 0 !important;
}
[${HOST_VISUAL_HIDE_ATTR}="true"] * {
  visibility: hidden !important;
}
`;
  doc.head?.appendChild(style);
}

type MessageIdInput = number | null | undefined | Array<number | null | undefined>;

const MES_SELECTORS = (messageId: number) => [
  `#chat > .mes[mesid='${messageId}']`,
  `#chat .mes[mesid='${messageId}']`,
  `.mes[mesid='${messageId}']`,
  `#chat > .mes[data-message-index='${messageId}']`,
  `#chat .mes[data-message-index='${messageId}']`,
  `.mes[data-message-index='${messageId}']`,
  `#chat .mes_text[data-message-index='${messageId}']`,
  `.mes_text[data-message-index='${messageId}']`,
];

function resolveHostMessageRoot(messageId: number): HTMLElement | null {
  const mesid = Math.trunc(messageId);
  if (!Number.isFinite(mesid) || mesid < 0) return null;

  for (const doc of collectHostOnlyDocuments()) {
    for (const selector of MES_SELECTORS(mesid)) {
      const el = doc.querySelector(selector) as HTMLElement | null;
      if (el) return (el.closest?.('.mes') as HTMLElement | null) ?? el;
    }
  }
  return null;
}

function normalizeMessageIds(messageIds: MessageIdInput) {
  const ids = new Set<number>();
  const rawIds = Array.isArray(messageIds) ? messageIds : [messageIds];
  for (const rawId of rawIds) {
    const id = Number(rawId);
    if (!Number.isFinite(id) || id < 0) continue;
    ids.add(Math.trunc(id));
  }
  return ids;
}

interface ApplyToMessageIdsOptions {
  excludeMessageIds?: MessageIdInput;
}

export function createPreHostVisualHideController() {
  const hiddenMessageIds = new Set<number>();
  const observedBodies = new WeakSet<HTMLElement>();
  const observers: MutationObserver[] = [];
  let reapplyTimer = 0;

  function applyOne(messageId: number) {
    const root = resolveHostMessageRoot(messageId);
    if (!root) return;
    ensureHostVisualHideStyle(root.ownerDocument);
    root.setAttribute(HOST_VISUAL_HIDE_ATTR, 'true');
    root.setAttribute(PRE_VISUAL_HIDE_OWNER_ATTR, 'true');
  }

  function clearOne(messageId: number) {
    const root = resolveHostMessageRoot(messageId);
    if (!root || root.getAttribute(PRE_VISUAL_HIDE_OWNER_ATTR) !== 'true') return;
    root.removeAttribute(HOST_VISUAL_HIDE_ATTR);
    root.removeAttribute(PRE_VISUAL_HIDE_OWNER_ATTR);
  }

  function reapplyHostVisualHide() {
    reapplyTimer = 0;
    for (const id of hiddenMessageIds) {
      applyOne(id);
    }
  }

  function reapply() {
    ensureHostMutationObservers();
    reapplyHostVisualHide();
  }

  function scheduleReapplyHostVisualHide() {
    if (reapplyTimer) return;
    reapplyTimer = window.setTimeout(reapplyHostVisualHide, 50);
  }

  function ensureHostMutationObservers() {
    for (const doc of collectHostOnlyDocuments()) {
      if (!doc.body || observedBodies.has(doc.body)) continue;
      const observer = new MutationObserver(() => {
        scheduleReapplyHostVisualHide();
      });
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
      });
      observedBodies.add(doc.body);
      observers.push(observer);
    }
  }

  function applyToMessageIds(messageIds: MessageIdInput, options?: ApplyToMessageIdsOptions) {
    ensureHostMutationObservers();
    const nextIds = normalizeMessageIds(messageIds);
    for (const id of normalizeMessageIds(options?.excludeMessageIds)) {
      nextIds.delete(id);
    }

    for (const id of nextIds) {
      applyOne(id);
      hiddenMessageIds.add(id);
    }
  }

  function replaceWithMessageIds(messageIds: MessageIdInput, options?: ApplyToMessageIdsOptions) {
    ensureHostMutationObservers();
    const nextIds = normalizeMessageIds(messageIds);
    for (const id of normalizeMessageIds(options?.excludeMessageIds)) {
      nextIds.delete(id);
    }

    for (const id of Array.from(hiddenMessageIds)) {
      if (!nextIds.has(id)) {
        clearOne(id);
        hiddenMessageIds.delete(id);
      }
    }

    for (const id of nextIds) {
      applyOne(id);
      hiddenMessageIds.add(id);
    }
  }

  function clearFromMessageIds(messageIds: MessageIdInput) {
    for (const id of normalizeMessageIds(messageIds)) {
      clearOne(id);
      hiddenMessageIds.delete(id);
    }
  }

  function destroy() {
    if (reapplyTimer) {
      window.clearTimeout(reapplyTimer);
      reapplyTimer = 0;
    }
    observers.splice(0).forEach(observer => observer.disconnect());
    clearFromMessageIds(Array.from(hiddenMessageIds));
  }

  return {
    applyToMessageIds,
    replaceWithMessageIds,
    clearFromMessageIds,
    reapply,
    destroy,
  };
}

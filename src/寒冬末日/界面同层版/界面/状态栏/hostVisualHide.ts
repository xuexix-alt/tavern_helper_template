import { collectReachableHostDocuments, resolveHostMessageRoot } from './hostBridge';

const HOST_VISUAL_HIDE_STYLE_ID = 'eden-same-layer-host-visual-hide-style';
const HOST_VISUAL_HIDE_ATTR = 'data-eden-host-hidden';
const HOST_PLUGIN_NATIVE_LEASE_ATTR = 'data-eden-plugin-native-lease';

// The visual-hide layer must preserve mes nodes in DOM for bridge transactions.
export const preserveMesNodesInDom = true;

function ensureHostVisualHideStyle(doc: Document) {
  if (doc.getElementById(HOST_VISUAL_HIDE_STYLE_ID)) return;

  const style = doc.createElement('style');
  style.id = HOST_VISUAL_HIDE_STYLE_ID;
  style.textContent = `
[${HOST_VISUAL_HIDE_ATTR}="true"] {
  visibility: hidden !important;
  pointer-events: none !important;
  min-height: 0 !important;
  max-height: 0 !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
}
[${HOST_PLUGIN_NATIVE_LEASE_ATTR}="true"] {
  visibility: visible !important;
  opacity: 0 !important;
  pointer-events: none !important;
  min-height: 0 !important;
  max-height: none !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: visible !important;
}
`;
  doc.head?.appendChild(style);
}

function resolveHostMessageRoots(messageId: number): HTMLElement[] {
  const roots: HTMLElement[] = [];
  const push = (node: HTMLElement | null | undefined) => {
    if (!node || roots.includes(node)) return;
    roots.push(node);
  };

  try {
    if (typeof retrieveDisplayedMessage === 'function') {
      const $mes = retrieveDisplayedMessage(messageId);
      const mesText = $mes?.get?.(0) as HTMLElement | undefined;
      push(mesText?.closest?.('.mes') as HTMLElement | null);
    }
  } catch {
    // ignore
  }

  push(resolveHostMessageRoot(messageId));
  return roots;
}

export function createHostVisualHideController() {
  let suspendDepth = 0;
  const hiddenMessageIds = new Set<number>();
  const pluginNativeLeaseMessageIds = new Set<number>();

  function applyStyleToReachableDocs() {
    for (const doc of collectReachableHostDocuments()) {
      ensureHostVisualHideStyle(doc);
    }
  }

  function writeNodeState(messageId: number, hidden: boolean) {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;

    if (hidden) hiddenMessageIds.add(normalizedId);
    else hiddenMessageIds.delete(normalizedId);

    const nextHidden = hidden && suspendDepth === 0;
    for (const root of resolveHostMessageRoots(normalizedId)) {
      if (nextHidden) {
        root.setAttribute(HOST_VISUAL_HIDE_ATTR, 'true');
      } else {
        root.removeAttribute(HOST_VISUAL_HIDE_ATTR);
      }
    }
  }

  function writePluginNativeLeaseState(messageId: number, leased: boolean) {
    const normalizedId = Math.trunc(Number(messageId));
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return;

    if (leased) pluginNativeLeaseMessageIds.add(normalizedId);
    else pluginNativeLeaseMessageIds.delete(normalizedId);

    for (const root of resolveHostMessageRoots(normalizedId)) {
      if (leased) {
        root.setAttribute(HOST_PLUGIN_NATIVE_LEASE_ATTR, 'true');
      } else {
        root.removeAttribute(HOST_PLUGIN_NATIVE_LEASE_ATTR);
      }
    }
  }

  return {
    applyToMessageIds(messageIds: number[]) {
      applyStyleToReachableDocs();
      for (const messageId of messageIds) {
        writeNodeState(messageId, true);
      }
    },
    clearFromMessageIds(messageIds: number[]) {
      for (const messageId of messageIds) {
        writeNodeState(messageId, false);
      }
    },
    leaseMessageIdsForPluginNativeHandoff(messageIds: number[], _reason: string) {
      applyStyleToReachableDocs();
      const normalizedIds = [
        ...new Set(
          messageIds
            .map(messageId => Math.trunc(Number(messageId)))
            .filter(messageId => Number.isFinite(messageId) && messageId >= 0),
        ),
      ];
      normalizedIds.forEach(messageId => writePluginNativeLeaseState(messageId, true));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        normalizedIds.forEach(messageId => {
          writePluginNativeLeaseState(messageId, false);
          if (hiddenMessageIds.has(messageId) && suspendDepth === 0) {
            writeNodeState(messageId, true);
          }
        });
      };
    },
    suspend(_reason: string) {
      suspendDepth += 1;
      for (const messageId of hiddenMessageIds) {
        writeNodeState(messageId, false);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        suspendDepth = Math.max(0, suspendDepth - 1);
        if (suspendDepth === 0) {
          this.applyToMessageIds([...hiddenMessageIds]);
        }
      };
    },
    destroy() {
      for (const messageId of hiddenMessageIds) {
        writeNodeState(messageId, false);
      }
      for (const messageId of pluginNativeLeaseMessageIds) {
        writePluginNativeLeaseState(messageId, false);
      }
      hiddenMessageIds.clear();
      pluginNativeLeaseMessageIds.clear();
    },
  };
}

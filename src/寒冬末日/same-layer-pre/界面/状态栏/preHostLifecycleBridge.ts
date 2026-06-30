type StopHandle = { stop: () => void } | (() => void) | void;

type HostVisualHideController = {
  applyToMessageIds: (messageIds: number[], options?: { excludeMessageIds?: number | null }) => void;
  clearFromMessageIds: (messageIds: number[]) => void;
  reapply: () => void;
};

type BindPreHostLifecycleBridgeOptions = {
  applyHostVisualHide: HostVisualHideController['applyToMessageIds'];
  clearHostVisualHide: HostVisualHideController['clearFromMessageIds'];
  reapplyHostVisualHide: HostVisualHideController['reapply'];
  readCarrierMessageId: () => number | null;
  scheduleTranscriptRefresh: (reason: string) => void;
  scheduleTargetedTranscriptRefresh: (messageIds: number[], reason: string) => void;
  updateStreamingPreviewText: (text: string) => void;
  clearStreamingPreviewText: () => void;
};

function normalizeMessageId(value: unknown) {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id >= 0 ? id : null;
}

function collectHostDocuments(): Document[] {
  const docs: Document[] = [];
  const push = (doc: Document | null | undefined) => {
    if (!doc || docs.includes(doc)) return;
    docs.push(doc);
  };

  push(document);
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

export function readHostLastMessageId() {
  for (const doc of collectHostDocuments()) {
    const element = doc.querySelector('#chat > .mes.last_mes, #chat .mes.last_mes, .mes.last_mes');
    const id = normalizeMessageId(
      element?.getAttribute('mesid') ??
        element?.getAttribute('data-message-index') ??
        element?.getAttribute('data-message-id'),
    );
    if (id !== null) return id;
  }

  try {
    if (typeof getLastMessageId !== 'function') return null;
    return normalizeMessageId(getLastMessageId());
  } catch {
    return null;
  }
}

function normalizeEventMessageIds(values: unknown[]) {
  const ids = new Set<number>();
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    const id = normalizeMessageId(value);
    if (id !== null) {
      ids.add(id);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    const record = value as Record<string, unknown>;
    ['message_id', 'messageId', 'mesid', 'id'].forEach(key => visit(record[key]));
    visit(record.detail);
    visit(record.data);
  };

  values.forEach(visit);
  return Array.from(ids).sort((a, b) => a - b);
}

function stopFrom(handle: StopHandle) {
  if (typeof handle === 'function') return handle;
  if (handle && typeof handle.stop === 'function') return () => handle.stop();
  return () => {};
}

function isAssistantHostMessage(messageId: number) {
  for (const doc of collectHostDocuments()) {
    const root = doc.querySelector(
      `#chat > .mes[mesid='${messageId}'], #chat .mes[mesid='${messageId}'], .mes[mesid='${messageId}']`,
    );
    if (!root) continue;
    const isUser = root.getAttribute('is_user');
    const isSystem = root.getAttribute('is_system');
    return isUser !== 'true' && isSystem !== 'true';
  }
  return true;
}

export function bindPreHostLifecycleBridge(options: BindPreHostLifecycleBridgeOptions) {
  const stops: Array<() => void> = [];
  const addStop = (handle: StopHandle) => stops.push(stopFrom(handle));
  let stableRefreshTimer = 0;
  let editingMessageId: number | null = null;

  const applyEarlyHostHide = (messageId: number, reason: string) => {
    options.applyHostVisualHide([messageId], {
      excludeMessageIds: options.readCarrierMessageId(),
    });
    options.scheduleTargetedTranscriptRefresh([messageId], reason);
  };

  const scheduleHostStableRefresh = (reason: string) => {
    if (stableRefreshTimer) return;
    stableRefreshTimer = window.setTimeout(() => {
      stableRefreshTimer = 0;
      options.scheduleTranscriptRefresh(reason);
      options.reapplyHostVisualHide();
    }, 180);
  };

  const bindEvent = <T extends EventType>(eventName: T, listener: ListenerType[T]) => {
    addStop(eventOn(eventName, errorCatched(listener) as ListenerType[T]));
  };

  addStop(
    eventMakeFirst(
      tavern_events.CHARACTER_MESSAGE_RENDERED,
      errorCatched(((...eventArgs: unknown[]) => {
        const messageId = normalizeEventMessageIds(eventArgs)[0] ?? readHostLastMessageId();
        if (messageId === null) {
          options.reapplyHostVisualHide();
          return;
        }
        applyEarlyHostHide(messageId, String(tavern_events.CHARACTER_MESSAGE_RENDERED));
        options.clearStreamingPreviewText();
      }) as ListenerType[typeof tavern_events.CHARACTER_MESSAGE_RENDERED]),
    ),
  );

  bindEvent(
    tavern_events.STREAM_TOKEN_RECEIVED,
    ((message: string) => {
      const messageId = readHostLastMessageId();
      if (messageId === null || !isAssistantHostMessage(messageId)) return;
      applyEarlyHostHide(messageId, String(tavern_events.STREAM_TOKEN_RECEIVED));
      options.updateStreamingPreviewText(String(message ?? ''));
    }) as ListenerType[typeof tavern_events.STREAM_TOKEN_RECEIVED],
  );

  bindEvent(
    tavern_events.MORE_MESSAGES_LOADED,
    (() => scheduleHostStableRefresh(String(tavern_events.MORE_MESSAGES_LOADED))) as ListenerType[
      typeof tavern_events.MORE_MESSAGES_LOADED
    ],
  );

  bindEvent(
    'chatLoaded' as EventType,
    (() => {
      requestAnimationFrame(() => {
        options.scheduleTranscriptRefresh('chatLoaded');
        options.reapplyHostVisualHide();
      });
    }) as ListenerType[EventType],
  );

  const checkEditingState = () => {
    let nextEditingMessageId: number | null = null;
    for (const doc of collectHostDocuments()) {
      const textarea = doc.querySelector('#curEditTextarea');
      const root = textarea?.closest?.('.mes');
      const id = normalizeMessageId(
        root?.getAttribute('mesid') ?? root?.getAttribute('data-message-index') ?? root?.getAttribute('data-message-id'),
      );
      if (id !== null) {
        nextEditingMessageId = id;
        break;
      }
    }

    if (nextEditingMessageId !== editingMessageId && editingMessageId !== null) {
      options.applyHostVisualHide([editingMessageId], {
        excludeMessageIds: options.readCarrierMessageId(),
      });
      options.scheduleTargetedTranscriptRefresh([editingMessageId], 'edit_end');
    }

    if (nextEditingMessageId !== null && nextEditingMessageId !== editingMessageId) {
      options.clearHostVisualHide([nextEditingMessageId]);
    }

    editingMessageId = nextEditingMessageId;
  };

  const observers: MutationObserver[] = [];
  for (const doc of collectHostDocuments()) {
    if (!doc.body) continue;
    const observer = new MutationObserver(checkEditingState);
    observer.observe(doc.body, { childList: true, subtree: true });
    observers.push(observer);
  }
  checkEditingState();

  return {
    stop() {
      if (stableRefreshTimer) {
        window.clearTimeout(stableRefreshTimer);
        stableRefreshTimer = 0;
      }
      observers.splice(0).forEach(observer => observer.disconnect());
      stops.splice(0).forEach(stop => stop());
    },
  };
}

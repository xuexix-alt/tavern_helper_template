import {
  decideGroupConversation,
  decidePrivateConversation,
  type ConversationLike,
  type ConversationPayload,
} from './conversationCreation';

type FailureReason = 'select-one' | 'select-at-least-two' | 'lookup-error' | 'create-error' | 'busy' | 'stale';
export type CreationResult =
  | { ok: false; reason: FailureReason }
  | { ok: true; kind: 'existing' | 'created'; conversation: ConversationLike };

export interface ConversationCreationDeps<TContext> {
  getConversations(): Promise<ConversationLike[]>;
  createConversation(payload: ConversationPayload): Promise<ConversationLike>;
  onCommit(conversation: ConversationLike): void;
  refreshConversations(): Promise<void>;
  onRefreshError(error: unknown): void;
  captureContext(): TContext;
  isCurrent(context: TContext): boolean;
}

export function createConversationCreationCoordinator<TContext>(deps: ConversationCreationDeps<TContext>) {
  let busy = false;

  const refreshLater = () => {
    void deps.refreshConversations().catch(error => deps.onRefreshError(error));
  };

  const createAndCommit = async (payload: ConversationPayload, context: TContext): Promise<CreationResult> => {
    try {
      const conversation = await deps.createConversation(payload);
      if (!deps.isCurrent(context)) return { ok: false, reason: 'stale' };
      deps.onCommit(conversation);
      refreshLater();
      return { ok: true, kind: 'created', conversation };
    } catch {
      return { ok: false, reason: 'create-error' };
    }
  };

  const confirmPrivate = async (selected: string[]): Promise<CreationResult> => {
    const initial = decidePrivateConversation(selected, []);
    if (!initial.ok) return initial;
    if (busy) return { ok: false, reason: 'busy' };
    const context = deps.captureContext();
    if (!deps.isCurrent(context)) return { ok: false, reason: 'stale' };
    busy = true;
    try {
      let conversations: ConversationLike[];
      try {
        conversations = await deps.getConversations();
      } catch {
        return { ok: false, reason: 'lookup-error' };
      }
      if (!deps.isCurrent(context)) return { ok: false, reason: 'stale' };
      const decision = decidePrivateConversation(selected, conversations);
      if (!decision.ok) return decision;
      if (decision.kind === 'existing') {
        deps.onCommit(decision.conversation);
        return { ok: true, kind: 'existing', conversation: decision.conversation };
      }
      return await createAndCommit(decision.payload, context);
    } finally {
      busy = false;
    }
  };

  const confirmGroup = async (selected: string[], customName: string): Promise<CreationResult> => {
    const decision = decideGroupConversation(selected, customName);
    if (!decision.ok) return decision;
    if (busy) return { ok: false, reason: 'busy' };
    const context = deps.captureContext();
    if (!deps.isCurrent(context)) return { ok: false, reason: 'stale' };
    busy = true;
    try {
      return await createAndCommit(decision.payload, context);
    } finally {
      busy = false;
    }
  };

  return { confirmPrivate, confirmGroup, isBusy: () => busy };
}

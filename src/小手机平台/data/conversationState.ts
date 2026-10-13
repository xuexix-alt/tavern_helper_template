import type { PhoneDb, PhoneMessage } from './phoneDb';

// Independent, per-message receipts survive full conversation replacement and
// concurrent visible-message acknowledgements. Inbox records are session scoped
// and already participate in export/import and identity migration.
const INITIALIZED = 'conversation-read:v1:initialized';
const receiptId = (id: string) => `conversation-read:v1:message:${id}`;

export function createConversationState(database: PhoneDb, onMessage?: (message: PhoneMessage) => void) {
  const initialization = new Map<string, Promise<void>>();
  function initialize(sessionKey: string): Promise<void> {
    let pending = initialization.get(sessionKey);
    if (!pending) {
      pending = (async () => {
        const records = await database.listRecords('inbox', sessionKey);
        if (records.some(record => record.id === INITIALIZED)) return;
        const history = await database.listMessages({ sessionKey });
        for (const message of history) await receipt(message);
        await database.putRecord('inbox', { id: INITIALIZED, sessionKey, kind: 'conversation-read-initialized' });
      })();
      initialization.set(sessionKey, pending);
      void pending.catch(() => initialization.delete(sessionKey));
    }
    return pending;
  }
  async function receipt(message: PhoneMessage) {
    await database.putRecord('inbox', {
      id: receiptId(message.id),
      sessionKey: message.sessionKey,
      conversationId: message.conversationId,
      messageId: message.id,
      kind: 'conversation-read-receipt',
    });
  }
  async function unread(sessionKey: string): Promise<PhoneMessage[]> {
    await initialize(sessionKey);
    const [messages, records] = await Promise.all([
      database.listMessages({ sessionKey }),
      database.listRecords('inbox', sessionKey),
    ]);
    const read = new Set(
      records.filter(record => record.kind === 'conversation-read-receipt').map(record => record.messageId),
    );
    return messages.filter(message => message.type !== 'broadcast' && message.sender !== '你' && !read.has(message.id));
  }
  const db: PhoneDb = new Proxy(database, {
    get(target, property) {
      if (property === 'addMessage' || property === 'addMessageWithInbox') {
        return async (...args: Parameters<PhoneDb['addMessageWithInbox']>) => {
          await initialize(args[0].sessionKey);
          const message =
            property === 'addMessage'
              ? await target.addMessage(args[0])
              : await target.addMessageWithInbox(args[0], args[1]);
          onMessage?.(message);
          return message;
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    db,
    initialize,
    unread,
    async count(sessionKey: string) {
      return (await unread(sessionKey)).length;
    },
    async markRead(sessionKey: string, conversationId: string, messageIds: readonly string[]) {
      const visible = new Set(messageIds);
      const messages = await unread(sessionKey);
      await Promise.all(
        messages.filter(message => message.conversationId === conversationId && visible.has(message.id)).map(receipt),
      );
    },
  };
}

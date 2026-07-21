export interface ConversationOperation {
  chatId: string;
}

export interface ConversationCreationData {
  type: 'private' | 'group';
  members: string[];
  name?: string;
}

export function buildConversationRecord(operation: ConversationOperation, data: ConversationCreationData, now: number) {
  const name = data.name || (data.type === 'private' ? data.members[0] : `群聊_${now}`);
  return {
    id: `conv_${operation.chatId}_${data.type}_${name}_${now}`,
    chatId: operation.chatId,
    type: data.type,
    name,
    members: data.members,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createConversationForOperation<TDatabase, TResult>(
  operation: ConversationOperation & { dbPromise: Promise<TDatabase> },
  data: ConversationCreationData,
  now: number,
  write: (database: TDatabase, record: ReturnType<typeof buildConversationRecord>) => TResult | Promise<TResult>,
): Promise<TResult> {
  const database = await operation.dbPromise;
  return write(database, buildConversationRecord(operation, data, now));
}

export async function queryConversationsForOperation<TDatabase, TResult>(
  operation: ConversationOperation & { dbPromise: Promise<TDatabase> },
  getIndex: (database: TDatabase) => { getAll(chatId: string): TResult | Promise<TResult> },
): Promise<TResult> {
  const database = await operation.dbPromise;
  return getIndex(database).getAll(operation.chatId);
}

type LatestUserMacroVisibilityMessage = {
  message_id: number;
  role?: string | null;
  is_hidden?: boolean;
  messageLength?: number;
};

type LatestUserMacroVisibilityMessages =
  | LatestUserMacroVisibilityMessage[]
  | (() => LatestUserMacroVisibilityMessage[] | Promise<LatestUserMacroVisibilityMessage[]>);

type LatestUserMacroVisibilityOptions<T> = {
  messages: LatestUserMacroVisibilityMessages;
  setChatMessages: (
    chat_messages: Array<{ message_id: number; is_hidden: boolean }>,
    options?: { refresh?: 'none' | 'affected' | 'all' },
  ) => Promise<void>;
  action: () => T | Promise<T>;
};

async function resolveMessages(input: LatestUserMacroVisibilityMessages): Promise<LatestUserMacroVisibilityMessage[]> {
  if (typeof input === 'function') {
    const result = await input();
    return Array.isArray(result) ? result : [];
  }
  return Array.isArray(input) ? input : [];
}

export async function withLatestUserUnhidden<T>({
  messages,
  setChatMessages,
  action,
}: LatestUserMacroVisibilityOptions<T>): Promise<T> {
  const allMessages = await resolveMessages(messages);
  const latestUser = [...allMessages]
    .filter(item => item && Number.isFinite(Number(item.message_id)))
    .sort((a, b) => Math.trunc(Number(a.message_id)) - Math.trunc(Number(b.message_id)))
    .reverse()
    .find(
      item =>
        String(item.role ?? '')
          .trim()
          .toLowerCase() === 'user',
    );

  if (!latestUser) {
    return await action();
  }

  const messageId = Math.trunc(Number(latestUser.message_id));
  const wasHidden = latestUser.is_hidden === true;
  if (!wasHidden) {
    return await action();
  }

  await setChatMessages([{ message_id: messageId, is_hidden: false }], { refresh: 'none' });
  try {
    return await action();
  } finally {
    await setChatMessages([{ message_id: messageId, is_hidden: wasHidden }], { refresh: 'none' });
  }
}

export function collectGenerationRevealMessageIds({
  detachedUserInput,
  hiddenMessageIds,
  hiddenMessages,
  latestHiddenUserMessageId,
  maxRevealMessages,
  maxRevealCharacters,
}: {
  detachedUserInput?: boolean;
  hiddenMessageIds?: number[];
  hiddenMessages?: Array<{ message_id: number; messageLength?: number | null }>;
  latestHiddenUserMessageId?: number | null;
  maxRevealMessages?: number;
  maxRevealCharacters?: number;
}): number[] {
  if (detachedUserInput === true) return [];

  const normalizedHiddenMessages =
    Array.isArray(hiddenMessages) && hiddenMessages.length > 0
      ? hiddenMessages
          .map(item => ({
            message_id: Math.trunc(Number(item?.message_id)),
            messageLength: Math.max(0, Math.trunc(Number(item?.messageLength) || 0)),
          }))
          .filter(item => Number.isFinite(item.message_id) && item.message_id >= 0)
      : (Array.isArray(hiddenMessageIds) ? hiddenMessageIds : [])
          .map(id => ({
            message_id: Math.trunc(Number(id)),
            messageLength: 0,
          }))
          .filter(item => Number.isFinite(item.message_id) && item.message_id >= 0);

  const maxMessages = Math.trunc(Number(maxRevealMessages));
  const maxCharacters = Math.trunc(Number(maxRevealCharacters));
  const boundedHiddenMessages =
    Number.isFinite(maxMessages) && maxMessages > 0
      ? [...normalizedHiddenMessages]
          .sort((a, b) => b.message_id - a.message_id)
          .filter((item, index, list) => list.findIndex(candidate => candidate.message_id === item.message_id) === index)
          .reduce<Array<{ message_id: number; messageLength: number }>>((selected, item) => {
            if (selected.length >= maxMessages) return selected;
            const selectedCharacters = selected.reduce((sum, current) => sum + current.messageLength, 0);
            if (
              Number.isFinite(maxCharacters) &&
              maxCharacters > 0 &&
              selected.length > 0 &&
              selectedCharacters + item.messageLength > maxCharacters
            ) {
              return selected;
            }
            selected.push(item);
            return selected;
          }, [])
      : normalizedHiddenMessages;

  const combined = [
    ...(Number.isFinite(Number(latestHiddenUserMessageId)) ? [Math.trunc(Number(latestHiddenUserMessageId))] : []),
    ...boundedHiddenMessages.map(item => item.message_id),
  ];

  return [...new Set(combined)].sort((a, b) => a - b);
}

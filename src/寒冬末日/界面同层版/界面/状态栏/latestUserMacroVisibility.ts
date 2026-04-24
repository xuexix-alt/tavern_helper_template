type LatestUserMacroVisibilityMessage = {
  message_id: number;
  role?: string | null;
  is_hidden?: boolean;
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
  latestHiddenUserMessageId,
}: {
  detachedUserInput?: boolean;
  hiddenMessageIds: number[];
  latestHiddenUserMessageId?: number | null;
}): number[] {
  if (detachedUserInput === true) return [];

  const combined = [
    ...(Number.isFinite(Number(latestHiddenUserMessageId)) ? [Math.trunc(Number(latestHiddenUserMessageId))] : []),
    ...hiddenMessageIds.map(id => Math.trunc(Number(id))).filter(id => Number.isFinite(id) && id >= 0),
  ];

  return [...new Set(combined)].sort((a, b) => a - b);
}

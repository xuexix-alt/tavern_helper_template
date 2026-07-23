import type { PhoneMessage, PhoneMessageType } from './phoneDb';

export interface LoreSummaryOptions {
  type: PhoneMessageType;
  messages: readonly (PhoneMessage | (Omit<PhoneMessage, 'syncedToLore'> & { syncedToLore?: boolean }))[];
  conversationId?: string;
}

const CONTENT_LIMIT = 80;
const ENTRY_LIMIT = 800;
const OMISSION = '…[中间省略]…';

function takeCharacters(value: string, count: number, fromEnd = false): string {
  const characters = Array.from(value);
  return (fromEnd ? characters.slice(-count) : characters.slice(0, count)).join('');
}

function timeLabel(message: LoreSummaryOptions['messages'][number]): string {
  const value = [message.gameDate, message.gameTime].filter(Boolean).join(' ');
  return value ? `[${value}] ` : '';
}

function boundEntry(value: string): string {
  if (Array.from(value).length <= ENTRY_LIMIT) return value;
  return `${takeCharacters(value, 200)}${OMISSION}${takeCharacters(value, 200, true)}`;
}

export function buildLoreSummary(options: LoreSummaryOptions): string {
  const limit = options.type === 'group' ? 10 : 8;
  const selected = options.messages
    .filter(message => message.type === options.type)
    .filter(
      message =>
        options.type !== 'broadcast' ||
        (Boolean(message.source?.trim()) && (message.trust === 'confirmed' || message.trust === 'unverified')),
    )
    .filter(
      message =>
        options.type !== 'group' ||
        options.conversationId === undefined ||
        message.conversationId === options.conversationId,
    )
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
    .slice(-limit);

  if (options.type === 'private') {
    const lines = selected.map(
      message => `${timeLabel(message)}${message.sender}: ${takeCharacters(message.content, CONTENT_LIMIT)}`,
    );
    return boundEntry(`【微信私聊】\n${lines.join('\n')}`);
  }

  if (options.type === 'group') {
    const group = selected.at(-1);
    const groupName = group?.groupName ?? options.conversationId ?? '未命名群聊';
    const participants = group?.participants?.length ? `（参与者：${group.participants.join('、')}）` : '';
    const lines = selected.map(
      message => `${timeLabel(message)}${message.sender}: ${takeCharacters(message.content, CONTENT_LIMIT)}`,
    );
    return boundEntry(`【微信群聊】${groupName}${participants}\n${lines.join('\n')}`);
  }

  const lines = selected.map(message => {
    return `[${message.trust}][${message.source}] ${timeLabel(message)}${message.sender}: ${takeCharacters(message.content, CONTENT_LIMIT)}`;
  });
  return boundEntry(`【微信广播】\n${lines.join('\n')}`);
}

export interface ConversationLike {
  id: string;
  type: 'private' | 'group';
  members: string[];
  name: string;
}

export type ConversationPayload = {
  type: 'private' | 'group';
  members: string[];
  name: string;
};

export type ConversationDecision =
  | { ok: false; reason: 'select-one' | 'select-at-least-two' }
  | { ok: true; kind: 'existing'; conversation: ConversationLike }
  | { ok: true; kind: 'create'; payload: ConversationPayload };

export type GroupConversationDecision =
  | { ok: false; reason: 'select-at-least-two' }
  | { ok: true; payload: ConversationPayload };

const uniqueNames = (names: string[]) => [...new Set(names.map(name => name.trim()).filter(Boolean))];

export function decidePrivateConversation(selected: string[], conversations: ConversationLike[]): ConversationDecision {
  const names = uniqueNames(selected);
  if (names.length !== 1) return { ok: false, reason: 'select-one' };
  const existing = conversations.find(
    item => item.type === 'private' && item.members.length === 1 && item.members[0] === names[0],
  );
  if (existing) return { ok: true, kind: 'existing', conversation: existing };
  return { ok: true, kind: 'create', payload: { type: 'private', members: names, name: names[0] } };
}

export function decideGroupConversation(selected: string[], customName: string): GroupConversationDecision {
  const members = uniqueNames(selected);
  if (members.length < 2) return { ok: false, reason: 'select-at-least-two' };
  const fallback = members.join('、');
  return {
    ok: true,
    payload: { type: 'group', members, name: customName.trim() || fallback },
  };
}

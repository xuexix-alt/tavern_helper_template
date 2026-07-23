import type { PhoneMessage } from '../data/phoneDb';
import type { ProfileStoryMessage } from './profileTypes';

export interface StoryCounterState {
  count: number;
  committedFingerprints: Readonly<Record<string, string>>;
  pendingFingerprints: Readonly<Record<string, string>>;
  changedMessageKeys: readonly string[];
}

export interface WechatIncrementSelection {
  contextMessages: readonly PhoneMessage[];
  newMessages: readonly PhoneMessage[];
  fallbackReason?: 'first-analysis' | 'anchor-missing';
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function storyKey(message: ProfileStoryMessage): string {
  return `${message.role}:${message.id}`;
}

export function reconcileStoryCounter(
  previous: StoryCounterState | undefined,
  current: readonly ProfileStoryMessage[],
): StoryCounterState {
  const committed = previous?.committedFingerprints ?? {};
  const pending: Record<string, string> = {};
  const changed: string[] = [];
  for (const message of current) {
    const key = storyKey(message);
    const currentFingerprint = fingerprint(message.content);
    const committedFingerprint = committed[key];
    if (committedFingerprint === undefined) pending[key] = currentFingerprint;
    else if (committedFingerprint !== currentFingerprint) changed.push(key);
  }
  return {
    count: Object.keys(pending).length,
    committedFingerprints: Object.freeze({ ...committed }),
    pendingFingerprints: Object.freeze(pending),
    changedMessageKeys: Object.freeze(changed),
  };
}

export function commitStoryCounter(state: StoryCounterState): StoryCounterState {
  const committedEntries = Object.entries({
    ...state.committedFingerprints,
    ...state.pendingFingerprints,
  }).slice(-200);
  return {
    count: 0,
    committedFingerprints: Object.freeze(Object.fromEntries(committedEntries)),
    pendingFingerprints: Object.freeze({}),
    changedMessageKeys: Object.freeze([]),
  };
}

export function selectWechatIncrement(
  messages: readonly PhoneMessage[],
  anchorId: string | undefined,
  firstWindow = 20,
  contextCount = 4,
): WechatIncrementSelection {
  if (!Number.isSafeInteger(firstWindow) || firstWindow <= 0) throw new Error('首次微信窗口必须是正安全整数');
  if (!Number.isSafeInteger(contextCount) || contextCount < 0) throw new Error('微信上下文数量必须是非负安全整数');
  const sorted = [...messages].sort(
    (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
  if (!anchorId) {
    return {
      contextMessages: Object.freeze([]),
      newMessages: Object.freeze(sorted.slice(-firstWindow)),
      fallbackReason: 'first-analysis',
    };
  }
  const anchorIndex = sorted.findIndex(message => message.id === anchorId);
  if (anchorIndex < 0) {
    return {
      contextMessages: Object.freeze([]),
      newMessages: Object.freeze(sorted.slice(-firstWindow)),
      fallbackReason: 'anchor-missing',
    };
  }
  return {
    contextMessages: Object.freeze(sorted.slice(Math.max(0, anchorIndex - contextCount + 1), anchorIndex + 1)),
    newMessages: Object.freeze(sorted.slice(anchorIndex + 1)),
  };
}

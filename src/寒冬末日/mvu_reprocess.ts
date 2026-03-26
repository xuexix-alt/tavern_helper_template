import _ from 'lodash';
import { getViewMessageState, resolveViewMessageId } from './界面/viewMessage';

const REPROCESS_GUARD_PATH = 'eden.mvu_reprocess_guard.by_message';
const REPROCESS_GUARD_MAX_ENTRIES = 80;
const ROLE_CONTROL_META_PATH = 'stat_data.主线任务.$meta.角色控制';

type ReprocessStatus = 'applied' | 'skipped' | 'blocked' | 'error';
type ReprocessReason =
  | 'reprocessed'
  | 'history_mode'
  | 'invalid_message_id'
  | 'empty_message'
  | 'same_digest'
  | 'missing_mvu_data'
  | 'parse_failed'
  | 'replace_failed'
  | 'error'
  | 'not_latest_message_mutation';

export type ReprocessResult = {
  status: ReprocessStatus;
  reason: ReprocessReason;
  message_id: number | null;
  error?: string;
};

export type ReprocessOptions = {
  allowHistory?: boolean;
  force?: boolean;
  refreshMessage?: boolean;
};

const inFlightByMessageId = new Map<number, Promise<ReprocessResult>>();

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildDigest(messageId: number, messageText: string): string {
  return `${messageId}:${fnv1a32(messageText)}`;
}

function readGuardMap(): Record<string, string> {
  try {
    const chatVars = getVariables({ type: 'chat' }) ?? {};
    const guard = _.get(chatVars, REPROCESS_GUARD_PATH, null);
    return guard && typeof guard === 'object' ? { ...(guard as Record<string, string>) } : {};
  } catch {
    return {};
  }
}

function writeGuardDigest(messageId: number, digest: string) {
  try {
    updateVariablesWith(
      vars => {
        const next = vars && typeof vars === 'object' ? vars : {};
        const guard = _.get(next, REPROCESS_GUARD_PATH, {});
        const nextGuard: Record<string, string> =
          guard && typeof guard === 'object' ? { ...(guard as Record<string, string>) } : {};
        nextGuard[String(messageId)] = digest;

        const keys = Object.keys(nextGuard);
        if (keys.length > REPROCESS_GUARD_MAX_ENTRIES) {
          const toDrop = keys
            .map(key => Number(key))
            .filter(id => Number.isFinite(id))
            .sort((a, b) => a - b)
            .slice(0, Math.max(0, keys.length - REPROCESS_GUARD_MAX_ENTRIES));
          for (const id of toDrop) {
            delete nextGuard[String(id)];
          }
        }

        _.set(next, REPROCESS_GUARD_PATH, nextGuard);
        return next;
      },
      { type: 'chat' },
    );
  } catch {
    // ignore guard write failure
  }
}

function resolveBaseMvuData(targetMessageId: number, currentMvuData: Mvu.MvuData): Mvu.MvuData {
  if (targetMessageId <= 0) {
    return ensureValidMvuData(currentMvuData);
  }
  try {
    const prevData = Mvu.getMvuData({ type: 'message', message_id: targetMessageId - 1 });
    if (prevData && typeof prevData === 'object' && prevData !== null) {
      return ensureValidMvuData(prevData as Mvu.MvuData);
    }
  } catch {
    // ignore and fallback
  }
  return ensureValidMvuData(currentMvuData);
}

function ensureValidMvuData(data: Mvu.MvuData | null | undefined): Mvu.MvuData {
  if (data && typeof data === 'object' && data !== null) {
    const valid: Mvu.MvuData = {
      initialized_lorebooks: data.initialized_lorebooks && typeof data.initialized_lorebooks === 'object' ? data.initialized_lorebooks : {},
      stat_data: data.stat_data && typeof data.stat_data === 'object' ? data.stat_data : {},
    };
    return valid;
  }
  return { initialized_lorebooks: {}, stat_data: {} };
}

function finalizeParsedMvuData(parsed: any, fallback: Mvu.MvuData): Mvu.MvuData {
  const next = parsed && typeof parsed === 'object' ? (parsed as Mvu.MvuData) : (_.cloneDeep(fallback) as Mvu.MvuData);
  if (!next.stat_data || typeof next.stat_data !== 'object') {
    next.stat_data = {};
  }
  if (!next.initialized_lorebooks || typeof next.initialized_lorebooks !== 'object') {
    next.initialized_lorebooks = {};
  }
  return next;
}

export async function reprocessMessageVariablesById(
  messageId: number,
  options: ReprocessOptions = {},
): Promise<ReprocessResult> {
  const normalizedMessageId = Number(messageId);
  if (!Number.isFinite(normalizedMessageId) || normalizedMessageId < 0) {
    return { status: 'blocked', reason: 'invalid_message_id', message_id: null };
  }

  const targetMessageId = Math.trunc(normalizedMessageId);
  const inFlight = inFlightByMessageId.get(targetMessageId);
  if (inFlight) {
    return inFlight;
  }

  const runner = (async (): Promise<ReprocessResult> => {
    try {
      await waitGlobalInitialized('Mvu');

      const chatMessage = getChatMessages(targetMessageId)?.[0];
      const messageText = typeof chatMessage?.message === 'string' ? chatMessage.message : '';
      if (!messageText.trim()) {
        return { status: 'blocked', reason: 'empty_message', message_id: targetMessageId };
      }

      const digest = buildDigest(targetMessageId, messageText);
      if (!options.force) {
        const guardMap = readGuardMap();
        if (guardMap[String(targetMessageId)] === digest) {
          return { status: 'skipped', reason: 'same_digest', message_id: targetMessageId };
        }
      }

      const currentMvuData = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
      if (!currentMvuData || typeof currentMvuData !== 'object') {
        return { status: 'error', reason: 'missing_mvu_data', message_id: targetMessageId };
      }

      const roleControlMeta = _.cloneDeep(_.get(currentMvuData, ROLE_CONTROL_META_PATH));
      const baseMvuData = resolveBaseMvuData(targetMessageId, currentMvuData);

      let parsed: Mvu.MvuData | undefined;
      try {
        parsed = await Mvu.parseMessage(messageText, _.cloneDeep(baseMvuData));
      } catch (err: any) {
        return {
          status: 'error',
          reason: 'parse_failed',
          message_id: targetMessageId,
          error: err?.message ?? String(err),
        };
      }

      const nextMvuData = finalizeParsedMvuData(parsed, baseMvuData);
      if (roleControlMeta !== undefined && _.get(nextMvuData, ROLE_CONTROL_META_PATH) == null) {
        _.set(nextMvuData, ROLE_CONTROL_META_PATH, roleControlMeta);
      }

      try {
        await Mvu.replaceMvuData(nextMvuData, { type: 'message', message_id: targetMessageId });
      } catch (err: any) {
        return {
          status: 'error',
          reason: 'replace_failed',
          message_id: targetMessageId,
          error: err?.message ?? String(err),
        };
      }

      writeGuardDigest(targetMessageId, digest);

      if (options.refreshMessage && typeof setChatMessages === 'function') {
        await setChatMessages([{ message_id: targetMessageId }], { refresh: 'affected' });
      }

      return { status: 'applied', reason: 'reprocessed', message_id: targetMessageId };
    } catch (err: any) {
      return {
        status: 'error',
        reason: 'error',
        message_id: targetMessageId,
        error: err?.message ?? String(err),
      };
    }
  })();

  inFlightByMessageId.set(targetMessageId, runner);
  try {
    return await runner;
  } finally {
    if (inFlightByMessageId.get(targetMessageId) === runner) {
      inFlightByMessageId.delete(targetMessageId);
    }
  }
}

export async function reprocessLatestMessageVariables(options: ReprocessOptions = {}): Promise<ReprocessResult> {
  const allowHistory = options.allowHistory === true;
  if (!allowHistory && getViewMessageState().mode === 'history') {
    return { status: 'blocked', reason: 'history_mode', message_id: null };
  }

  const resolved = Number(resolveViewMessageId({ preferHistory: false }));
  if (!Number.isFinite(resolved) || resolved < 0) {
    return { status: 'blocked', reason: 'invalid_message_id', message_id: null };
  }
  return reprocessMessageVariablesById(Math.trunc(resolved), options);
}

export async function autoReprocessWhenLatestMessageMutated(messageId: number): Promise<ReprocessResult> {
  const updatedMessageId = Number(messageId);
  if (!Number.isFinite(updatedMessageId) || updatedMessageId < 0) {
    return { status: 'blocked', reason: 'invalid_message_id', message_id: null };
  }

  const latestMessageId = Number(resolveViewMessageId({ preferHistory: false }));
  if (!Number.isFinite(latestMessageId) || latestMessageId < 0) {
    return { status: 'blocked', reason: 'invalid_message_id', message_id: null };
  }

  const normalizedLatest = Math.trunc(latestMessageId);
  const normalizedUpdated = Math.trunc(updatedMessageId);
  if (normalizedLatest !== normalizedUpdated) {
    return { status: 'skipped', reason: 'not_latest_message_mutation', message_id: normalizedUpdated };
  }

  return reprocessMessageVariablesById(normalizedUpdated, {
    allowHistory: true,
    force: false,
    refreshMessage: false,
  });
}

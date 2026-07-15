import _ from 'lodash';
import { getViewMessageState, resolveViewMessageId } from './界面/viewMessage';

const REPROCESS_GUARD_PATH = 'eden.mvu_reprocess_guard.by_message';
const REPROCESS_GUARD_MAX_ENTRIES = 80;
const ROLE_CONTROL_META_PATH = 'stat_data.主线任务.$meta.角色控制';
const NATIVE_EXTRA_ANALYSIS_RESULT_TIMEOUT_MS = 15000;
const NATIVE_EXTRA_ANALYSIS_RESULT_POLL_MS = 120;
const NATIVE_UPDATE_VARIABLE_TAG_PATTERN = /<updatevariable(?:variable)?\s*>[\s\S]*<\/updatevariable(?:variable)?\s*>/i;
const NATIVE_MVU_RETRY_BUTTON_NAME = '重试额外模型解析';

type ReprocessStatus = 'applied' | 'skipped' | 'blocked' | 'error';
type ReprocessReason =
  | 'reprocessed'
  | 'native_extra_analysis_retry_triggered'
  | 'native_extra_analysis_no_result'
  | 'history_mode'
  | 'invalid_message_id'
  | 'empty_message'
  | 'same_digest'
  | 'missing_mvu_data'
  | 'native_extra_analysis_retry_unavailable'
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
  const normalizedCurrent = ensureValidMvuData(currentMvuData);
  const hasState = (data: Mvu.MvuData): boolean => {
    const statData = data.stat_data && typeof data.stat_data === 'object' ? data.stat_data : {};
    const initializedLorebooks =
      data.initialized_lorebooks && typeof data.initialized_lorebooks === 'object' ? data.initialized_lorebooks : {};
    return Object.keys(statData).length > 0 || Object.keys(initializedLorebooks).length > 0;
  };
  const lookupStartId = Math.max(0, targetMessageId - 1);
  const LOOKBACK_LIMIT = 120;
  for (let offset = 0; offset < LOOKBACK_LIMIT; offset += 1) {
    const lookupId = lookupStartId - offset;
    if (lookupId < 0) break;
    try {
      const prevData = Mvu.getMvuData({ type: 'message', message_id: lookupId });
      if (prevData && typeof prevData === 'object' && prevData !== null) {
        const normalizedPrev = ensureValidMvuData(prevData as Mvu.MvuData);
        if (hasState(normalizedPrev)) {
          return normalizedPrev;
        }
      }
    } catch {
      // ignore and keep looking backward
    }
  }
  return normalizedCurrent;
}

function ensureValidMvuData(data: Mvu.MvuData | null | undefined): Mvu.MvuData {
  if (data && typeof data === 'object' && data !== null) {
    const valid: Mvu.MvuData = {
      initialized_lorebooks:
        data.initialized_lorebooks && typeof data.initialized_lorebooks === 'object' ? data.initialized_lorebooks : {},
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

async function waitForNativeExtraAnalysisResult(messageId: number, originalText: string): Promise<string> {
  const deadline = Date.now() + NATIVE_EXTRA_ANALYSIS_RESULT_TIMEOUT_MS;
  while (true) {
    const updatedChatMessage = getChatMessages(messageId, { hide_state: 'all' })?.[0];
    const messageText = typeof updatedChatMessage?.message === 'string' ? updatedChatMessage.message : '';
    const mesText = typeof updatedChatMessage?.mes === 'string' ? updatedChatMessage.mes : '';
    const updatedMessageText =
      NATIVE_UPDATE_VARIABLE_TAG_PATTERN.test(mesText) &&
      (!NATIVE_UPDATE_VARIABLE_TAG_PATTERN.test(messageText) || mesText.length > messageText.length)
        ? mesText
        : messageText || mesText;
    if (updatedMessageText !== originalText && NATIVE_UPDATE_VARIABLE_TAG_PATTERN.test(updatedMessageText)) {
      return updatedMessageText;
    }

    if (Date.now() >= deadline) return '';
    await new Promise<void>(resolve => setTimeout(resolve, NATIVE_EXTRA_ANALYSIS_RESULT_POLL_MS));
  }
}

function findNativeMvuRetryEvent(): string {
  const getAllEnabledScriptButtons = (globalThis as any).getAllEnabledScriptButtons;
  if (typeof getAllEnabledScriptButtons === 'function') {
    try {
      const buttonMap = getAllEnabledScriptButtons();
      if (buttonMap && typeof buttonMap === 'object') {
        for (const buttons of Object.values(buttonMap as Record<string, unknown>)) {
          if (!Array.isArray(buttons)) continue;
          const match = buttons.find(button => {
            if (!button || typeof button !== 'object') return false;
            const candidate = button as { button_id?: unknown; button_name?: unknown; name?: unknown };
            return (
              String(candidate.button_name ?? candidate.name ?? '').trim() === NATIVE_MVU_RETRY_BUTTON_NAME &&
              String(candidate.button_id ?? '').trim() !== ''
            );
          }) as { button_id?: unknown } | undefined;
          const buttonId = String(match?.button_id ?? '').trim();
          if (buttonId) return buttonId;
        }
      }
    } catch {
      // Fall through to the owning-script iframe lookup below.
    }
  }

  const scriptWindows: Window[] = [];
  const visitedWindows = new Set<Window>();
  const enqueueWindow = (candidate: Window | null | undefined) => {
    if (!candidate || visitedWindows.has(candidate)) return;
    visitedWindows.add(candidate);
    scriptWindows.push(candidate);
  };
  try {
    enqueueWindow(window);
    enqueueWindow(window.parent);
    enqueueWindow(window.top);
  } catch {
    // Ignore detached or inaccessible host windows.
  }

  for (let index = 0; index < scriptWindows.length; index += 1) {
    const ownerWindow = scriptWindows[index];
    try {
      const frames = Array.from(ownerWindow.document?.querySelectorAll('iframe') ?? []);
      for (const frame of frames) {
        const frameWindow = (frame as HTMLIFrameElement).contentWindow;
        const frameIdentity = String((frame as HTMLElement).id || frameWindow?.name || '');
        if (frameWindow && frameIdentity.startsWith('TH-script--')) {
          enqueueWindow(frameWindow);
        }
      }
    } catch {
      // Ignore a frame that is being removed or is not same-origin.
    }
  }

  for (const scriptWindow of scriptWindows) {
    try {
      const getScriptButtons = (scriptWindow as any).getScriptButtons;
      const getButtonEvent = (scriptWindow as any).getButtonEvent;
      if (typeof getScriptButtons !== 'function' || typeof getButtonEvent !== 'function') continue;
      const buttons = getScriptButtons.call(scriptWindow);
      if (
        !Array.isArray(buttons) ||
        !buttons.some(button => String((button as any)?.name ?? '').trim() === NATIVE_MVU_RETRY_BUTTON_NAME)
      ) {
        continue;
      }
      const buttonEvent = String(getButtonEvent.call(scriptWindow, NATIVE_MVU_RETRY_BUTTON_NAME) ?? '').trim();
      if (buttonEvent) return buttonEvent;
    } catch {
      // Try the next enabled script iframe.
    }
  }

  return '';
}

export async function retryMessageExtraAnalysisByNativeMvu(
  messageId: number,
  _options: ReprocessOptions = {},
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

      const chatMessage = getChatMessages(targetMessageId, { hide_state: 'all' })?.[0];
      if (!chatMessage || chatMessage.role !== 'assistant') {
        return { status: 'blocked', reason: 'empty_message', message_id: targetMessageId };
      }
      const messageText =
        typeof chatMessage.message === 'string'
          ? chatMessage.message
          : typeof chatMessage.mes === 'string'
            ? chatMessage.mes
            : '';
      if (!messageText.trim()) {
        return { status: 'blocked', reason: 'empty_message', message_id: targetMessageId };
      }
      const latestMessage = getChatMessages(-1, { hide_state: 'all' })?.[0];
      if (Math.trunc(Number(latestMessage?.message_id)) !== targetMessageId) {
        return { status: 'skipped', reason: 'not_latest_message_mutation', message_id: targetMessageId };
      }

      const nativeRetryEvent = findNativeMvuRetryEvent();
      if (typeof eventEmit !== 'function' || !nativeRetryEvent) {
        return { status: 'error', reason: 'native_extra_analysis_retry_unavailable', message_id: targetMessageId };
      }

      // MVU 源码把“重试额外模型解析”注册为脚本按钮事件。这里优先使用全局
      // button_id 映射，缺失时再进入 MVU 所在脚本 iframe 的上下文获取事件，
      // 直接进入它的 force=true 处理链，不需要快捷回复按钮 DOM 可见。
      await eventEmit(nativeRetryEvent as any);

      const updatedMessageText = await waitForNativeExtraAnalysisResult(targetMessageId, messageText);
      if (!updatedMessageText) {
        return {
          status: 'error',
          reason: 'native_extra_analysis_no_result',
          message_id: targetMessageId,
          error: 'MVU 原生重试事件已返回，但当前楼层没有追加新的 UpdateVariable 结果',
        };
      }

      return { status: 'applied', reason: 'native_extra_analysis_retry_triggered', message_id: targetMessageId };
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

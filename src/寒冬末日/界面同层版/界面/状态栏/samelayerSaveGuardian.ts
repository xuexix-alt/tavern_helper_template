/**
 * 同层聊天保存守护器
 *
 * ── 背景 ──────────────────────────────────────────────────────────────
 * SillyTavern 的 `/api/chats/save` 在 Windows 上偶发 EPERM：
 *   write-file-atomic renameSync tmpfile -> jsonl
 *   触发条件：杀软/索引器/OneDrive 短窗口占用、并发 save 撞车。
 * 宿主 `saveChatConditional` 会吞掉这个错误（只 console.error），
 * 所以"聊天保存失败但 UI 以为成功"会静默发生，用户刷新后内容回滚。
 *
 * 守护器做三件事：
 * 1. 在宿主/自己 window 的 `fetch` 上挂一层监听，当 `/api/chats/save`
 *    返回非 2xx（典型是 500）或网络异常时记一次失败并广播。
 * 2. 暴露一个只读的 `health`：UI 可以在守护器 unhealthy 时亮红点、弹 toast。
 * 3. 提供 `requestExplicitSave()`：通过 `SillyTavern.getContext().saveChat`
 *    再同步保存一次；是否真的写盘成功仍靠 fetch hook 观察。
 *
 * 所有 side effect 都在 `installSameLayerSaveGuardian` 里挂载；
 * 调用方（`useStreamingDemo.ts`）只需要保存 `uninstall` 在 cleanup 时调用。
 */

import { reactive, readonly } from 'vue';

export type SaveGuardianStatus = 'healthy' | 'failing';

export type SaveGuardianFailureEntry = {
  at: number;
  status: number | 'network';
  statusText?: string;
};

export type SaveGuardianHealth = {
  status: SaveGuardianStatus;
  /** Unix ms of the last observed save failure. */
  lastFailedAt: number | null;
  /** Unix ms of the last observed save success. */
  lastSucceededAt: number | null;
  /** Number of consecutive failures since the most recent success. */
  consecutiveFailures: number;
  /** 仅保留最近几条失败记录，避免无限增长。 */
  recentFailures: SaveGuardianFailureEntry[];
};

const MAX_RECENT_FAILURES = 8;
const SAVE_ENDPOINT_RE = /\/api\/chats\/save(?:$|[?#])/;

function nowMs(): number {
  return Date.now();
}

function extractRequestUrl(input: Request | string | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input ?? '');
}

function matchesSaveEndpoint(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost');
    return SAVE_ENDPOINT_RE.test(parsed.pathname);
  } catch {
    return SAVE_ENDPOINT_RE.test(url);
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SaveGuardianOptions = {
  /**
   * 守护器发现保存成功/失败时的回调。UI 层可以在这里弹 toast / 亮红点，
   * 守护器本身只维护状态，不直接操作 UI。
   */
  onStateChange?: (health: SaveGuardianHealth) => void;
};

export type SaveGuardianHandle = {
  health: Readonly<SaveGuardianHealth>;
  /** 立刻再存一次；返回 true 表示在最近观测窗口里看到保存成功了。 */
  requestExplicitSave: (reason?: string) => Promise<boolean>;
  /** 拆除 fetch 劫持。 */
  uninstall: () => void;
};

type ContextResolver = () => { saveChat?: () => Promise<void> } | null | undefined;

type CreateInput = {
  /**
   * 安装 wrapper。实现方需要对每个挂钩目标调用 `makeWrapper(thatWindowNativeFetch)`
   * 来生成一个**与该 window 同 realm**的 wrapper，避免跨 realm 返回 Response。
   * 返回 `nativeFetch` 是给 `requestExplicitSave` 之类"在当前 realm 里直接发原请求"用的，
   * 不是给 wrapper 反向调用的。
   */
  installFetchHook: (makeWrapper: (localNativeFetch: FetchLike) => FetchLike) => {
    nativeFetch: FetchLike;
    restore: () => void;
  };
  /** 每次需要 native fetch 时调用。分离出去方便单测注入。 */
  contextResolver: ContextResolver;
  options?: SaveGuardianOptions;
};

/**
 * 不直接依赖 window，便于单测。单测里可以传一个 fake 的 `installFetchHook` + `contextResolver`。
 */
export function createSameLayerSaveGuardian(input: CreateInput): SaveGuardianHandle {
  const health = reactive<SaveGuardianHealth>({
    status: 'healthy',
    lastFailedAt: null,
    lastSucceededAt: null,
    consecutiveFailures: 0,
    recentFailures: [],
  });

  const fireStateChange = () => {
    try {
      input.options?.onStateChange?.({
        status: health.status,
        lastFailedAt: health.lastFailedAt,
        lastSucceededAt: health.lastSucceededAt,
        consecutiveFailures: health.consecutiveFailures,
        recentFailures: [...health.recentFailures],
      });
    } catch (error) {
      console.warn('[save-guardian] onStateChange callback failed', error);
    }
  };

  const recordSuccess = () => {
    const wasUnhealthy = health.status !== 'healthy';
    health.status = 'healthy';
    health.lastSucceededAt = nowMs();
    health.consecutiveFailures = 0;
    if (wasUnhealthy) fireStateChange();
  };

  const recordFailure = (entry: SaveGuardianFailureEntry) => {
    health.status = 'failing';
    health.lastFailedAt = entry.at;
    health.consecutiveFailures += 1;
    health.recentFailures = [...health.recentFailures.slice(-(MAX_RECENT_FAILURES - 1)), entry];
    fireStateChange();
  };

  let nativeFetch: FetchLike = async () => {
    throw new Error('[save-guardian] fetch hook not installed yet');
  };

  // 这个 wrapper 只做"观察"——用调用方本地的 fetch 实现去真正发请求，再在成功/失败时更新 health。
  // 绝对不能"用别的 window 的 fetch 替调用方发请求"，否则跨 realm 的 Response / ArrayBuffer / Blob
  // 会让 JSZip / FileReader 之类做 instanceof 检查的代码炸（这就是 st-chatu8 插件
  // "Can't read the data of 'the loaded zip file'" 报错的根因：把 parent 的 fetch 换成从 iframe
  // realm 里跑的 fetch，返回的 Response 在 parent 代码看起来不是"本地 ArrayBuffer"）。
  const makeWrapper =
    (localNativeFetch: FetchLike): FetchLike =>
    async (reqInput, init) => {
      const url = extractRequestUrl(reqInput as any);
      const isSaveCall = matchesSaveEndpoint(url);
      try {
        const response = await localNativeFetch(reqInput, init);
        if (isSaveCall) {
          if (response.ok) recordSuccess();
          else
            recordFailure({
              at: nowMs(),
              status: response.status,
              statusText: response.statusText,
            });
        }
        return response;
      } catch (error) {
        if (isSaveCall) {
          recordFailure({
            at: nowMs(),
            status: 'network',
            statusText: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      }
    };

  const { nativeFetch: installedNative, restore } = input.installFetchHook(makeWrapper);
  nativeFetch = installedNative;

  const requestExplicitSave = async (reason?: string): Promise<boolean> => {
    const ctx = input.contextResolver();
    const saveChat = ctx?.saveChat;
    if (typeof saveChat !== 'function') return false;

    const observedSuccessBefore = health.lastSucceededAt ?? 0;
    try {
      await saveChat();
    } catch (error) {
      recordFailure({
        at: nowMs(),
        status: 'network',
        statusText: `explicit save (${reason ?? 'unknown'}) threw: ${error instanceof Error ? error.message : String(error)}`,
      });
      return false;
    }
    // `saveChatConditional` 不抛错；是否成功看 fetch hook 在这段时间内有没有 record success。
    return (health.lastSucceededAt ?? 0) > observedSuccessBefore;
  };

  return {
    health: readonly(health) as Readonly<SaveGuardianHealth>,
    requestExplicitSave,
    uninstall: () => {
      restore();
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// 生产环境安装：挂钩到 iframe 自身 + parent + top 的 fetch。
// ──────────────────────────────────────────────────────────────────────

let activeHandle: SaveGuardianHandle | null = null;

export function getSameLayerSaveGuardian(): SaveGuardianHandle | null {
  return activeHandle;
}

function resolveSaveTargetWindows(): Window[] {
  const out: Window[] = [];
  const seen = new Set<Window>();
  const push = (win: Window | null | undefined) => {
    if (!win || seen.has(win)) return;
    seen.add(win);
    out.push(win);
  };
  try {
    push(typeof window !== 'undefined' ? window : null);
  } catch {
    /* ignore */
  }
  try {
    const parent = typeof window !== 'undefined' ? window.parent : null;
    if (parent) push(parent as Window);
  } catch {
    /* cross-origin */
  }
  try {
    const top = typeof window !== 'undefined' ? window.top : null;
    if (top) push(top as Window);
  } catch {
    /* ignore */
  }
  return out;
}

export function installSameLayerSaveGuardian(options: SaveGuardianOptions = {}): SaveGuardianHandle | null {
  if (activeHandle) return activeHandle;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return null;

  const targets = resolveSaveTargetWindows();
  if (targets.length === 0) return null;

  const originals = new Map<Window, FetchLike>();
  let primaryNative: FetchLike | null = null;

  const handle = createSameLayerSaveGuardian({
    installFetchHook: makeWrapper => {
      for (const win of targets) {
        try {
          // 捕获**该 window 自己的**原生 fetch，并把它绑定到该 window 上；
          // 生成一个绑定这一份 native 的 wrapper，然后把 wrapper 写回那个 window。
          // 这样每个 window 的代码调用 `window.fetch(...)` 时，实际还是在**本 realm**内跑，
          // 返回的 Response / ArrayBuffer / Blob 也都是本 realm 的对象，
          // 不会触发 st-chatu8 插件那边 JSZip "Can't read the data of 'the loaded zip file'"
          // 这种跨 realm instanceof 失败。
          const native = (win.fetch as FetchLike).bind(win) as FetchLike;
          originals.set(win, native);
          if (!primaryNative) primaryNative = native;
          const perWindowWrapper = makeWrapper(native);
          (win as any).fetch = (inputArg: RequestInfo | URL, initArg?: RequestInit) =>
            perWindowWrapper(inputArg as any, initArg);
        } catch {
          /* ignore cross-origin */
        }
      }
      const nativeFetch: FetchLike = (inputArg, initArg) => {
        if (primaryNative) return primaryNative(inputArg, initArg);
        return window.fetch(inputArg, initArg);
      };
      const restore = () => {
        for (const [win, native] of originals) {
          try {
            (win as any).fetch = native;
          } catch {
            /* ignore */
          }
        }
        originals.clear();
        primaryNative = null;
        if (activeHandle === handle) activeHandle = null;
      };
      return { nativeFetch, restore };
    },
    contextResolver: () => {
      try {
        const parent = window.parent as any;
        const ctx =
          parent?.SillyTavern?.getContext?.() ??
          (typeof (window as any).SillyTavern?.getContext === 'function'
            ? (window as any).SillyTavern.getContext()
            : null);
        return ctx ?? null;
      } catch {
        return null;
      }
    },
    options,
  });

  activeHandle = handle;
  return handle;
}

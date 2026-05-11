/**
 * 图片生成事件桥（监听 st-chatu8 插件的请求/响应事件）
 *
 * 当前同层 UI **不**亲自发起 `generate-image-request`：插件会在拿到 LLM 输出后解析
 * `<image>` 标签并自动发请求。所以我们只做两件事：
 *
 * 1. 监听 `generate-image-request`：记录一次 pending（用来和响应匹配 + 兜底超时）。
 * 2. 监听 `generate-image-response`：
 *    - `success: true` → 图片会通过 MutationObserver 灌进同层，UI 不用再做什么。
 *      这里只做清理和一次 debug trace。
 *    - `success: false` 或缺少 `imageData` → 弹 toast 把错误告诉用户，并清理 pending。
 *
 * 这条桥的意义是：**插件内部失败（比如 NovelAI 返回不可解析的 zip，"Can't read the data
 * of 'the loaded zip file'"）原本只会 console.error，UI 没有任何提示。**
 * 我们把失败显式地 surface 给用户，不再让他盯着转圈占位图发呆。
 *
 * 所有回调都在 `createImageGenerationEventBridge` 里装好；返回 `uninstall` 清理监听。
 * 事件名来自 `docs/前端接入插件的说明.txt`：
 *   - `generate-image-request`
 *   - `generate-image-response`
 */

export type ImageGenerationEventPayload = {
  id?: unknown;
  prompt?: unknown;
  change?: unknown;
  width?: unknown;
  height?: unknown;
};

export type ImageGenerationResponsePayload = ImageGenerationEventPayload & {
  success?: unknown;
  imageData?: unknown;
  error?: unknown;
};

export type ImageGenerationBridgeDeps = {
  eventOn: (event: string, handler: (payload: any) => void) => unknown;
  eventRemoveListener: (event: string, handler: (payload: any) => void) => void;
  /** 成功回调（上层想做什么都行；本桥不强制上层做持久化）。 */
  onRequest?: (payload: { requestId: string; prompt: string }) => void;
  onResponseSuccess?: (payload: { requestId: string; prompt: string; imageData: string }) => void;
  onResponseFailure?: (payload: { requestId: string; prompt: string; error: string }) => void;
  /** 桥内部对外界的 toast 渠道，注入进来方便单测。 */
  notifyError?: (message: string, detail?: string) => void;
  /** debug trace，桥内部记一些事件（可选）。 */
  recordTrace?: (scope: string, event: string, payload: Record<string, unknown>) => void;
};

export const GENERATE_IMAGE_REQUEST_EVENT = 'generate-image-request';
export const GENERATE_IMAGE_RESPONSE_EVENT = 'generate-image-response';

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function describeRequestId(requestId: string): string {
  return requestId ? ` (ID: ${requestId.slice(0, 16)}${requestId.length > 16 ? '…' : ''})` : '';
}

export function summarizeImageGenerationFailure(input: { requestId: string; prompt: string; error: string }): {
  short: string;
  detail: string;
} {
  const rawError = normalizeString(input.error);
  const lower = rawError.toLowerCase();

  let short: string;
  if (!rawError) {
    short = '生图失败：插件未返回错误详情，可能是请求被中断。';
  } else if (lower.includes("can't read the data") && lower.includes('zip')) {
    short = '生图失败：NovelAI 返回的数据无法解析（可能是账户额度不足或服务端异常）。';
  } else if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    short = '生图失败：已达 NovelAI 限流，请稍后重试。';
  } else if (lower.includes('401') || lower.includes('unauthor') || lower.includes('forbidden')) {
    short = '生图失败：NovelAI 凭据无效或余额不足，请在插件设置里确认 Token。';
  } else if (lower.includes('timeout') || lower.includes('aborted')) {
    short = '生图失败：请求超时，请稍后重试。';
  } else {
    short = `生图失败：${rawError.slice(0, 96)}`;
  }

  const detail = `[${input.requestId || 'unknown'}] prompt=${input.prompt.slice(0, 64)}${input.prompt.length > 64 ? '…' : ''} | ${rawError.slice(0, 240)}`;

  return { short: `${short}${describeRequestId(input.requestId)}`, detail };
}

export type ImageGenerationBridgeHandle = {
  uninstall: () => void;
  /** 当前视为"还在生图中"的请求数量（主要给 UI 亮 loading 指示器用）。 */
  getInFlightCount: () => number;
};

export function createImageGenerationEventBridge(deps: ImageGenerationBridgeDeps): ImageGenerationBridgeHandle {
  const inflight = new Map<string, { prompt: string; startedAt: number }>();

  const onRequest = (payload: ImageGenerationEventPayload) => {
    const requestId = normalizeString(payload?.id);
    const prompt = normalizeString(payload?.prompt);
    if (!requestId) return;
    inflight.set(requestId, { prompt, startedAt: Date.now() });
    deps.recordTrace?.('imageGenerationEventBridge', 'request', { requestId, promptHead: prompt.slice(0, 60) });
    deps.onRequest?.({ requestId, prompt });
  };

  const onResponse = (payload: ImageGenerationResponsePayload) => {
    const requestId = normalizeString(payload?.id);
    const prompt = normalizeString(payload?.prompt) || inflight.get(requestId)?.prompt || '';
    const imageData = normalizeString(payload?.imageData);
    const rawSuccess = payload?.success;
    const rawError = normalizeString(payload?.error);

    // `success` 可能是 true / false / "true" / "false" / undefined；统一成 boolean。
    const isSuccess =
      rawSuccess === true ||
      (typeof rawSuccess === 'string' && rawSuccess.toLowerCase() === 'true') ||
      (rawSuccess == null && imageData.length > 0 && !rawError);

    if (requestId) inflight.delete(requestId);

    if (isSuccess && imageData) {
      deps.recordTrace?.('imageGenerationEventBridge', 'response_success', {
        requestId,
        promptHead: prompt.slice(0, 60),
        imageDataBytes: imageData.length,
      });
      deps.onResponseSuccess?.({ requestId, prompt, imageData });
      return;
    }

    const summary = summarizeImageGenerationFailure({ requestId, prompt, error: rawError });
    deps.recordTrace?.('imageGenerationEventBridge', 'response_failure', {
      requestId,
      promptHead: prompt.slice(0, 60),
      rawError,
      summaryShort: summary.short,
    });
    deps.onResponseFailure?.({ requestId, prompt, error: rawError });
    deps.notifyError?.(summary.short, summary.detail);
  };

  deps.eventOn(GENERATE_IMAGE_REQUEST_EVENT, onRequest);
  deps.eventOn(GENERATE_IMAGE_RESPONSE_EVENT, onResponse);

  return {
    getInFlightCount: () => inflight.size,
    uninstall: () => {
      try {
        deps.eventRemoveListener(GENERATE_IMAGE_REQUEST_EVENT, onRequest);
      } catch {
        /* ignore */
      }
      try {
        deps.eventRemoveListener(GENERATE_IMAGE_RESPONSE_EVENT, onResponse);
      } catch {
        /* ignore */
      }
      inflight.clear();
    },
  };
}

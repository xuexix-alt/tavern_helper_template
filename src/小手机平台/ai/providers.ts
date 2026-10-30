import { buildRolePrompts, type AiPromptMode, type JailbreakLayerOptions, type RolePrompt } from './jailbreakLayers';

export type { RolePrompt } from './jailbreakLayers';
export type { AiPromptMode } from './jailbreakLayers';
export type { JailbreakLayerOptions } from './jailbreakLayers';

export interface RequestHandle<T> {
  readonly id: string;
  readonly promise: Promise<T>;
  cancel(): void;
}

export interface AiDetailedResponse {
  content: string;
  reasoningContent?: string;
}

export interface AiRequestOptions {
  /** 长任务的最低等待时间；只延长本次请求，不缩短已配置的超时。 */
  minimumTimeoutMs?: number;
  mode?: AiPromptMode;
  systemPrompt?: string;
  jsonMode?: boolean;
  /** 回复身份标签：私聊为对象名，群聊为“群名成员（A、B）”；缺省保留“作为指定角色” */
  replyAs?: string;
  /** 本轮玩家消息，用于替换仅酒馆环境支持的 {{lastUserMessage}} 宏 */
  playerMessage?: string;
  /** 破限层开关：缺省全开；适配器可按角色卡定位或用户偏好关闭 identity/nsfw/prefill 层 */
  jailbreakLayers?: JailbreakLayerOptions;
}

export class ProviderError extends Error {
  readonly code:
    | 'http'
    | 'timeout'
    | 'cancelled'
    | 'network'
    | 'invalid_response'
    | 'missing_key'
    | 'credential'
    | 'setup'
    | 'cleanup';
  readonly status?: number;

  constructor(
    message: string,
    code:
      | 'http'
      | 'timeout'
      | 'cancelled'
      | 'network'
      | 'invalid_response'
      | 'missing_key'
      | 'credential'
      | 'setup'
      | 'cleanup',
    status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}

function defaultId(): string {
  return `phone-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

interface TavernGenerateOptions {
  generation_id: string;
  should_stream: false;
  should_silence: true;
  max_chat_history: 0;
  ordered_prompts: RolePrompt[];
}

export interface TavernProviderDependencies {
  generateRaw(options: TavernGenerateOptions): Promise<string>;
  stopGenerationById(id: string): unknown | Promise<unknown>;
  idFactory?: () => string;
  onCancelError?: (error: ProviderError) => void;
}

export class TavernProvider {
  readonly #dependencies: TavernProviderDependencies;

  constructor(dependencies: TavernProviderDependencies) {
    this.#dependencies = dependencies;
  }

  request(assembledPrompt: string, requestOptions: AiRequestOptions = {}): RequestHandle<string> {
    return mapContentHandle(this.requestDetailed(assembledPrompt, requestOptions));
  }

  requestDetailed(assembledPrompt: string, requestOptions: AiRequestOptions = {}): RequestHandle<AiDetailedResponse> {
    const id = (this.#dependencies.idFactory ?? defaultId)();
    const generateOptions: TavernGenerateOptions = {
      generation_id: id,
      should_stream: false,
      should_silence: true,
      max_chat_history: 0,
      ordered_prompts: [
        ...buildRolePrompts(
          assembledPrompt,
          requestOptions.mode,
          requestOptions.systemPrompt,
          requestOptions.replyAs,
          requestOptions.playerMessage,
          requestOptions.jailbreakLayers,
        ),
      ],
    };
    let promise: Promise<AiDetailedResponse>;
    try {
      promise = Promise.resolve(this.#dependencies.generateRaw(generateOptions)).then(content => ({ content }));
    } catch (error) {
      promise = Promise.reject(error);
    }
    let cancelled = false;
    return {
      id,
      promise,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        const reportCancelError = (): void => {
          try {
            this.#dependencies.onCancelError?.(new ProviderError('Tavern generation cancellation failed', 'cancelled'));
          } catch {
            // Diagnostics must not turn cancellation into an unhandled error.
          }
        };
        try {
          void Promise.resolve(this.#dependencies.stopGenerationById(id)).catch(reportCancelError);
        } catch {
          reportCancelError();
        }
      },
    };
  }
}

function mapContentHandle(handle: RequestHandle<AiDetailedResponse>): RequestHandle<string> {
  return {
    id: handle.id,
    promise: handle.promise.then(response => response.content),
    cancel: () => handle.cancel(),
  };
}

/** 流式响应体只需要 getReader，避免把 DOM 流类型渗透进测试替身。 */
export interface StreamReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
  cancel?(reason?: unknown): Promise<void> | void;
}

export interface StreamBodyLike {
  getReader(): StreamReaderLike;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  /**
   * 流式响应体。缺省、或网关不支持流式时退回 `json()` 一次性解析，
   * 因此自定义 fetch 只实现 ok/status/json 也能正常工作。
   */
  readonly body?: StreamBodyLike | null;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;
type TimerHandle = ReturnType<typeof setTimeout> | number;

/** 按空行切分 SSE 帧；`rest` 是尚未收完的尾巴。兼容 CRLF 与裸 CR。 */
function splitSseFrames(buffer: string): { frames: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const segments = normalized.split('\n\n');
  return { frames: segments.slice(0, -1), rest: segments[segments.length - 1] ?? '' };
}

/**
 * 取一帧的 data 字段。注释行（以 `:` 开头，常见于 keep-alive）返回 null：
 * 这类帧不能用来续命空闲计时，否则一个只发心跳的连接可以永不超时。
 */
function sseFrameData(frame: string): string | null {
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    if (field !== 'data') continue;
    const value = separator === -1 ? '' : line.slice(separator + 1);
    data.push(value.startsWith(' ') ? value.slice(1) : value);
  }
  return data.length > 0 ? data.join('\n') : null;
}

/** 流式增量帧：DeepSeek 的思维链放在 delta.reasoning_content。 */
function streamDeltaOf(payload: unknown): { content: string; reasoningContent: string } {
  const delta = (payload as { choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }> })
    ?.choices?.[0]?.delta;
  return {
    content: typeof delta?.content === 'string' ? delta.content : '',
    reasoningContent: typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : '',
  };
}

/** 非流式（或把 stream:true 当普通 JSON 返回的网关）的整段响应。 */
function messageContentOf(payload: unknown): { content: string; reasoningContent: string } {
  const message = (payload as { choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }> })
    ?.choices?.[0]?.message;
  return {
    content: typeof message?.content === 'string' ? message.content : '',
    reasoningContent: typeof message?.reasoning_content === 'string' ? message.reasoning_content : '',
  };
}

export interface OpenAIModelListOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
}

/** 形如 v1 / v1beta / v2 / v4 / v1.1 / v3preview 的末段视为已有版本号，不再强补 /v1。 */
const OPENAI_VERSION_SEGMENT = /^v\d+(?:[._]\d+)*(?:beta\d*|preview\d*|alpha\d*)?$/i;

function openAiBase(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error('OpenAI-compatible API URL 无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('OpenAI-compatible API URL 只支持 http/https');
  }
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

function openAiResourceUrl(baseUrl: string, resource: 'chat/completions' | 'models', withV1: boolean): string {
  const url = openAiBase(baseUrl);
  const path = url.pathname;
  const lastSegment = path.split('/').pop() ?? '';
  const effectivePath = withV1 && !OPENAI_VERSION_SEGMENT.test(lastSegment) ? `${path}/v1` : path;
  url.pathname = `${effectivePath}/${resource}`.replace(/\/{2,}/g, '/');
  return url.toString();
}

function openAiEndpoint(baseUrl: string, resource: 'chat/completions' | 'models'): string {
  return openAiEndpointCandidates(baseUrl, resource)[0];
}

function openAiEndpointCandidates(baseUrl: string, resource: 'chat/completions' | 'models'): string[] {
  // 完整端点表示用户明确选定的路由，不再偷偷补版本号。
  const explicitEndpoint = /\/(?:chat\/completions|models)\/?$/.test(new URL(baseUrl.trim()).pathname);
  const primary = openAiResourceUrl(baseUrl, resource, !explicitEndpoint);
  if (explicitEndpoint) return [primary];
  return [...new Set([primary, openAiResourceUrl(baseUrl, resource, false)])];
}

export function openAiModelsEndpoint(baseUrl: string): string {
  return openAiEndpoint(baseUrl, 'models');
}

export async function fetchOpenAiCompatibleModels(options: OpenAIModelListOptions): Promise<readonly string[]> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error('OpenAI-compatible API Key 缺失');

  const fetchLike = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  // 中转网关布局不一：优先规范化的 /v1/models；404/405 时降级尝试不带 /v1 的 /models（部分网关按路径直出）。
  const candidates = openAiEndpointCandidates(options.baseUrl, 'models');

  let response: FetchResponseLike | null = null;
  let firstErrorStatus = 0;
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      response = await fetchLike(candidates[index], {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (response.ok) break;
      if (index === 0) firstErrorStatus = response.status;
      // 只有「端点不存在」（404/405）才值得换路径重试；鉴权与限流错误换端点无意义
      if (response.status !== 404 && response.status !== 405) break;
      response = null;
    }
  } catch {
    throw new Error('拉取模型失败：网络请求失败');
  }
  if (!response || !response.ok) throw new Error(`拉取模型失败：HTTP ${firstErrorStatus || (response?.status ?? 0)}`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('拉取模型失败：响应不是有效 JSON');
  }
  const data = (payload as { data?: unknown })?.data;
  const ids = Array.isArray(data)
    ? data
        .map(item => {
          if (!item || typeof item !== 'object') return '';
          const entry = item as { id?: unknown; name?: unknown };
          const value = entry.id ?? entry.name;
          return typeof value === 'string' ? value.trim() : '';
        })
        .filter(Boolean)
    : [];
  const models = [...new Set(ids)];
  if (models.length === 0) throw new Error('模型接口没有返回可用模型');
  return Object.freeze(models);
}

export interface ApiKeyAccessor {
  <T>(callback: (apiKey: string | undefined) => T): T;
}

/**
 * OpenAI-compatible 请求的默认超时。
 * 默认走流式，此时这是「多久没有收到新增量」的空闲超时；每段增量都会重置计时。
 * 非流式（stream:false）时退回整体超时语义。30s 对 DeepSeek 一类长提示词 + 四栏结构化输出
 * 太短，会在正常耗时内误判超时，因此默认放宽到 2 分钟并允许在设置里调整。
 */
export const DEFAULT_OPENAI_TIMEOUT_MS = 120_000;
export const MIN_OPENAI_TIMEOUT_MS = 10_000;
export const MAX_OPENAI_TIMEOUT_MS = 600_000;

export interface OpenAICompatibleProviderOptions {
  baseUrl: string;
  model: string;
  parameters?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  /**
   * 是否请求 SSE 流式响应，默认 true。
   * 流式下 `timeoutMs` 的含义变为「多久没有收到新增量」，长生成不会再被总时长砍断；
   * 遇到不兼容的网关可显式传 false 退回一次性 JSON。
   */
  stream?: boolean;
  fetch?: FetchLike;
  withApiKey: ApiKeyAccessor;
  idFactory?: () => string;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  onCleanupError?: (error: ProviderError) => void;
}

export class OpenAICompatibleProvider {
  readonly #endpoints: readonly string[];
  readonly #model: string;
  readonly #parameters: Readonly<Record<string, unknown>>;
  readonly #timeoutMs: number;
  readonly #stream: boolean;
  readonly #fetch: FetchLike;
  readonly #withApiKey: OpenAICompatibleProviderOptions['withApiKey'];
  readonly #idFactory: () => string;
  readonly #setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  readonly #clearTimer: (handle: TimerHandle) => void;
  readonly #onCleanupError?: (error: ProviderError) => void;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.#endpoints = openAiEndpointCandidates(options.baseUrl, 'chat/completions');
    if (options.model.trim().length === 0) throw new Error('OpenAI-compatible model 不得为空');
    this.#model = options.model;
    this.#parameters = Object.freeze({ ...(options.parameters ?? {}) });
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs <= 0) throw new Error('timeoutMs 必须是正安全整数');
    this.#stream = options.stream ?? true;
    // Response.body 与 StreamBodyLike 结构一致，这里只需绕过 lib.dom 的流类型差异。
    this.#fetch = options.fetch ?? (async (url, init) => (await fetch(url, init)) as unknown as FetchResponseLike);
    this.#withApiKey = options.withApiKey;
    this.#idFactory = options.idFactory ?? defaultId;
    this.#setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#clearTimer = options.clearTimer ?? (handle => clearTimeout(handle));
    this.#onCleanupError = options.onCleanupError;
  }

  request(assembledPrompt: string, requestOptions: AiRequestOptions = {}): RequestHandle<string> {
    return mapContentHandle(this.requestDetailed(assembledPrompt, requestOptions));
  }

  requestDetailed(assembledPrompt: string, options: AiRequestOptions = {}): RequestHandle<AiDetailedResponse> {
    const minimumTimeoutMs = options.minimumTimeoutMs ?? 0;
    if (!Number.isSafeInteger(minimumTimeoutMs) || minimumTimeoutMs < 0) {
      throw new Error('minimumTimeoutMs 必须是非负安全整数');
    }
    const timeoutMs = Math.max(this.#timeoutMs, minimumTimeoutMs);
    const id = this.#idFactory();
    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;

    const interruptedError = (): ProviderError | undefined => {
      if (timedOut) {
        const detail = this.#stream ? `${timeoutMs}ms 内没有收到新数据` : `${timeoutMs}ms`;
        return new ProviderError(`OpenAI-compatible 请求超时（${detail}）`, 'timeout');
      }
      if (cancelled) return new ProviderError('OpenAI-compatible 请求已取消 (cancelled)', 'cancelled');
      return undefined;
    };
    const assertNotInterrupted = (): void => {
      const error = interruptedError();
      if (error) throw error;
    };
    const reportCleanupError = (): void => {
      try {
        this.#onCleanupError?.(new ProviderError('OpenAI-compatible timer cleanup failed', 'cleanup'));
      } catch {
        // Diagnostics must never replace the request result.
      }
    };

    let timer: TimerHandle | undefined;
    let fetched: Promise<FetchResponseLike> | undefined;
    const armTimer = (): TimerHandle =>
      this.#setTimer(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    try {
      timer = armTimer();
    } catch {
      fetched = Promise.reject(new ProviderError('OpenAI-compatible timer setup failed', 'setup'));
    }
    // 流式下每收到一段新增量就重置计时，把「总时长」改成「空闲时长」。
    const touchTimer = (): void => {
      if (timer === undefined) return;
      let next: TimerHandle;
      try {
        // 先建新计时器再清旧的：新计时器建不起来时，原期限仍然有效，请求不会永不超时
        next = armTimer();
      } catch {
        return;
      }
      try {
        this.#clearTimer(timer);
      } catch {
        reportCleanupError();
      }
      timer = next;
    };

    const requestMessages = buildRolePrompts(
      assembledPrompt,
      options.mode,
      options.systemPrompt,
      options.replyAs,
      options.playerMessage ?? '',
      options.jailbreakLayers,
    );
    const send = (endpoint: string): Promise<FetchResponseLike> => {
      try {
        assertNotInterrupted();
        return Promise.resolve(
          this.#withApiKey(apiKey => {
            if (apiKey === undefined || apiKey.trim().length === 0) {
              throw new ProviderError('OpenAI-compatible API key 缺失', 'missing_key');
            }
            try {
              return this.#fetch(endpoint, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  ...this.#parameters,
                  model: this.#model,
                  messages: requestMessages,
                  ...(options.jsonMode && this.#parameters.response_format === undefined
                    ? { response_format: { type: 'json_object' } }
                    : {}),
                  // 接收策略必须和发送开关一致，不能被高级参数里残留的 stream 覆盖。
                  stream: this.#stream,
                }),
                signal: controller.signal,
              });
            } catch {
              return Promise.reject(new ProviderError('OpenAI-compatible 网络请求失败', 'network'));
            }
          }),
        );
      } catch (error) {
        return Promise.reject(
          error instanceof ProviderError
            ? error
            : new ProviderError('OpenAI-compatible API key access failed', 'credential'),
        );
      }
    };
    if (timer !== undefined) {
      // 首次调用仍同步取密钥；回退请求重新通过 accessor 获取，不在异步闭包中保存密钥。
      fetched = send(this.#endpoints[0]);
      for (const endpoint of this.#endpoints.slice(1)) {
        fetched = fetched.then(response => {
          assertNotInterrupted();
          return !response.ok && (response.status === 404 || response.status === 405) ? send(endpoint) : response;
        });
      }
    }

    const promise = (fetched ?? Promise.reject(new ProviderError('OpenAI-compatible timer setup failed', 'setup')))
      .catch((error: unknown) => {
        assertNotInterrupted();
        if (error instanceof ProviderError) throw error;
        throw new ProviderError('OpenAI-compatible 网络请求失败', 'network');
      })
      .then(async response => {
        assertNotInterrupted();
        if (!response.ok) {
          throw new ProviderError(`OpenAI-compatible HTTP ${response.status}`, 'http', response.status);
        }
        if (this.#stream && response.body && typeof response.body.getReader === 'function') {
          return await this.#consumeStream(response.body, { touch: touchTimer, assertNotInterrupted });
        }
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          assertNotInterrupted();
          throw new ProviderError('OpenAI-compatible 响应不是有效 JSON', 'invalid_response');
        }
        assertNotInterrupted();
        const message = messageContentOf(payload);
        if (message.content.length === 0) {
          throw new ProviderError('OpenAI-compatible 响应缺少 choices[0].message.content', 'invalid_response');
        }
        return {
          content: message.content,
          ...(message.reasoningContent.length > 0 ? { reasoningContent: message.reasoningContent } : {}),
        };
      })
      .finally(() => {
        if (timer === undefined) return;
        try {
          this.#clearTimer(timer);
        } catch {
          reportCleanupError();
        }
      });

    return {
      id,
      promise,
      cancel: () => {
        if (cancelled || timedOut) return;
        cancelled = true;
        controller.abort();
      },
    };
  }

  /**
   * 逐帧消费 SSE：拼接 delta.content，兼容 DeepSeek 的 delta.reasoning_content。
   * 网关忽略 stream:true 直接回整段 JSON 时，退回普通解析而不是报错。
   */
  async #consumeStream(
    body: StreamBodyLike,
    hooks: { touch: () => void; assertNotInterrupted: () => void },
  ): Promise<AiDetailedResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let raw = '';
    let content = '';
    let reasoningContent = '';
    let sawFrame = false;
    let finished = false;
    try {
      while (!finished) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!chunk.value || chunk.value.length === 0) continue;
        const text = decoder.decode(chunk.value, { stream: true });
        raw += text;
        pending += text;
        const split = splitSseFrames(pending);
        pending = split.rest;
        let touched = false;
        for (const frame of split.frames) {
          const data = sseFrameData(frame);
          if (data === null) continue; // 注释/keep-alive：不续命
          sawFrame = true;
          if (data === '[DONE]') {
            finished = true;
            break;
          }
          let payload: unknown;
          try {
            payload = JSON.parse(data);
          } catch {
            continue; // 半截或非 JSON 帧直接跳过
          }
          const apiError = (payload as { error?: unknown })?.error;
          if (apiError) {
            const detail =
              typeof apiError === 'object' && apiError !== null
                ? String((apiError as { message?: unknown }).message ?? '')
                : String(apiError);
            throw new ProviderError(
              `OpenAI-compatible 流式响应返回错误${detail ? `：${detail}` : ''}`,
              'invalid_response',
            );
          }
          const delta = streamDeltaOf(payload);
          if (delta.content.length > 0 || delta.reasoningContent.length > 0) touched = true;
          content += delta.content;
          reasoningContent += delta.reasoningContent;
        }
        if (touched) hooks.touch();
      }
      if (!finished && pending.trim() !== '') {
        // 收尾时可能缺最后一个空行分隔，把残帧当一帧处理
        const tail = sseFrameData(pending);
        if (tail !== null && tail !== '[DONE]') {
          try {
            const delta = streamDeltaOf(JSON.parse(tail));
            content += delta.content;
            reasoningContent += delta.reasoningContent;
            if (delta.content.length > 0 || delta.reasoningContent.length > 0) sawFrame = true;
          } catch {
            // 尾巴不完整就丢弃
          }
        }
      }
    } catch (error) {
      hooks.assertNotInterrupted();
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('OpenAI-compatible 流式响应中断', 'network');
    } finally {
      try {
        await reader.cancel?.();
      } catch {
        // 已结束的流取消失败无需上报
      }
    }

    if (!sawFrame) {
      try {
        const message = messageContentOf(JSON.parse(raw));
        if (message.content.length > 0) {
          return {
            content: message.content,
            ...(message.reasoningContent.length > 0 ? { reasoningContent: message.reasoningContent } : {}),
          };
        }
      } catch {
        // 落到下面的统一报错
      }
      throw new ProviderError('OpenAI-compatible 流式响应不是有效 SSE', 'invalid_response');
    }
    if (content.length === 0) {
      throw new ProviderError('OpenAI-compatible 响应缺少 choices[0].delta.content', 'invalid_response');
    }
    return { content, ...(reasoningContent.length > 0 ? { reasoningContent } : {}) };
  }
}

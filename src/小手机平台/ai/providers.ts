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

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;
type TimerHandle = ReturnType<typeof setTimeout> | number;

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
    url = new URL(baseUrl);
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
  return openAiResourceUrl(baseUrl, resource, true);
}

export function openAiModelsEndpoint(baseUrl: string): string {
  return openAiEndpoint(baseUrl, 'models');
}

export async function fetchOpenAiCompatibleModels(options: OpenAIModelListOptions): Promise<readonly string[]> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error('OpenAI-compatible API Key 缺失');

  const fetchLike = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  // 中转网关布局不一：优先规范化的 /v1/models；404/405 时降级尝试不带 /v1 的 /models（部分网关按路径直出）。
  const candidates = [openAiModelsEndpoint(options.baseUrl), openAiResourceUrl(options.baseUrl, 'models', false)];

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

export interface OpenAICompatibleProviderOptions {
  baseUrl: string;
  model: string;
  parameters?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  fetch?: FetchLike;
  withApiKey: ApiKeyAccessor;
  idFactory?: () => string;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  onCleanupError?: (error: ProviderError) => void;
}

function endpointFor(baseUrl: string): string {
  // 与模型发现共用同一套规范化：保留用户提供的代理/网关路径，末段为版本号时不重复补 /v1。
  return openAiEndpoint(baseUrl, 'chat/completions');
}

export class OpenAICompatibleProvider {
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #parameters: Readonly<Record<string, unknown>>;
  readonly #timeoutMs: number;
  readonly #fetch: FetchLike;
  readonly #withApiKey: OpenAICompatibleProviderOptions['withApiKey'];
  readonly #idFactory: () => string;
  readonly #setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  readonly #clearTimer: (handle: TimerHandle) => void;
  readonly #onCleanupError?: (error: ProviderError) => void;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.#baseUrl = endpointFor(options.baseUrl);
    if (options.model.trim().length === 0) throw new Error('OpenAI-compatible model 不得为空');
    this.#model = options.model;
    this.#parameters = Object.freeze({ ...(options.parameters ?? {}) });
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs <= 0) throw new Error('timeoutMs 必须是正安全整数');
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
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
    const id = this.#idFactory();
    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;

    const interruptedError = (): ProviderError | undefined => {
      if (timedOut) return new ProviderError(`OpenAI-compatible 请求超时（${this.#timeoutMs}ms）`, 'timeout');
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
    try {
      timer = this.#setTimer(() => {
        timedOut = true;
        controller.abort();
      }, this.#timeoutMs);
    } catch {
      fetched = Promise.reject(new ProviderError('OpenAI-compatible timer setup failed', 'setup'));
    }

    if (timer !== undefined) {
      try {
        assertNotInterrupted();
        fetched = Promise.resolve(
          this.#withApiKey(apiKey => {
            if (apiKey === undefined || apiKey.trim().length === 0) {
              throw new ProviderError('OpenAI-compatible API key 缺失', 'missing_key');
            }
            try {
              return this.#fetch(this.#baseUrl, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  ...this.#parameters,
                  model: this.#model,
                  messages: buildRolePrompts(
                    assembledPrompt,
                    options.mode,
                    options.systemPrompt,
                    options.replyAs,
                    options.playerMessage ?? '',
                    options.jailbreakLayers,
                  ),
                  ...(options.jsonMode && this.#parameters.response_format === undefined
                    ? { response_format: { type: 'json_object' } }
                    : {}),
                }),
                signal: controller.signal,
              });
            } catch {
              return Promise.reject(new ProviderError('OpenAI-compatible 网络请求失败', 'network'));
            }
          }),
        );
      } catch (error) {
        fetched = Promise.reject(
          error instanceof ProviderError
            ? error
            : new ProviderError('OpenAI-compatible API key access failed', 'credential'),
        );
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
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          assertNotInterrupted();
          throw new ProviderError('OpenAI-compatible 响应不是有效 JSON', 'invalid_response');
        }
        assertNotInterrupted();
        const message = (
          payload as {
            choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }>;
          }
        )?.choices?.[0]?.message;
        const content = message?.content;
        if (typeof content !== 'string' || content.length === 0) {
          throw new ProviderError('OpenAI-compatible 响应缺少 choices[0].message.content', 'invalid_response');
        }
        const reasoningContent = message?.reasoning_content;
        return {
          content,
          ...(typeof reasoningContent === 'string' && reasoningContent.length > 0 ? { reasoningContent } : {}),
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
}

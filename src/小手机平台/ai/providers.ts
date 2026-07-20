import { buildRolePrompts, type RolePrompt } from './jailbreakLayers';

export type { RolePrompt } from './jailbreakLayers';

export interface RequestHandle<T> {
  readonly id: string;
  readonly promise: Promise<T>;
  cancel(): void;
}

export class ProviderError extends Error {
  readonly code: 'http' | 'timeout' | 'cancelled' | 'network' | 'invalid_response';
  readonly status?: number;

  constructor(
    message: string,
    code: 'http' | 'timeout' | 'cancelled' | 'network' | 'invalid_response',
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
  ordered_prompts: readonly RolePrompt[];
}

export interface TavernProviderDependencies {
  generateRaw(options: TavernGenerateOptions): Promise<string>;
  stopGenerationById(id: string): void | Promise<void>;
  idFactory?: () => string;
}

export class TavernProvider {
  readonly #dependencies: TavernProviderDependencies;

  constructor(dependencies: TavernProviderDependencies) {
    this.#dependencies = dependencies;
  }

  request(assembledPrompt: string): RequestHandle<string> {
    const id = (this.#dependencies.idFactory ?? defaultId)();
    const options: TavernGenerateOptions = {
      generation_id: id,
      should_stream: false,
      should_silence: true,
      max_chat_history: 0,
      ordered_prompts: buildRolePrompts(assembledPrompt),
    };
    let promise: Promise<string>;
    try {
      promise = Promise.resolve(this.#dependencies.generateRaw(options));
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
        void this.#dependencies.stopGenerationById(id);
      },
    };
  }
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;
type TimerHandle = ReturnType<typeof setTimeout> | number;

export interface OpenAICompatibleProviderOptions {
  baseUrl: string;
  model: string;
  parameters?: Readonly<Record<string, unknown>>;
  timeoutMs?: number;
  fetch?: FetchLike;
  withApiKey(callback: (apiKey: string) => Promise<string>): Promise<string> | string;
  idFactory?: () => string;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

function endpointFor(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('OpenAI-compatible baseUrl 只支持 http/https');
  return new URL('/v1/chat/completions', url).toString();
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
  }

  request(assembledPrompt: string): RequestHandle<string> {
    const id = this.#idFactory();
    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;

    const promise = this.#withApiKey(async apiKey => {
      let timer: TimerHandle | undefined;
      try {
        timer = this.#setTimer(() => {
          timedOut = true;
          controller.abort();
        }, this.#timeoutMs);
        let response: FetchResponseLike;
        try {
          response = await this.#fetch(this.#baseUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...this.#parameters,
              model: this.#model,
              messages: buildRolePrompts(assembledPrompt),
            }),
            signal: controller.signal,
          });
        } catch {
          if (timedOut) throw new ProviderError(`OpenAI-compatible 请求超时（${this.#timeoutMs}ms）`, 'timeout');
          if (cancelled) throw new ProviderError('OpenAI-compatible 请求已取消 (cancelled)', 'cancelled');
          throw new ProviderError('OpenAI-compatible 网络请求失败', 'network');
        }
        if (!response.ok) {
          throw new ProviderError(`OpenAI-compatible HTTP ${response.status}`, 'http', response.status);
        }
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ProviderError('OpenAI-compatible 响应不是有效 JSON', 'invalid_response');
        }
        const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message
          ?.content;
        if (typeof content !== 'string' || content.length === 0) {
          throw new ProviderError('OpenAI-compatible 响应缺少 choices[0].message.content', 'invalid_response');
        }
        return content;
      } finally {
        if (timer !== undefined) this.#clearTimer(timer);
      }
    });

    return {
      id,
      promise: Promise.resolve(promise),
      cancel: () => {
        if (cancelled || timedOut) return;
        cancelled = true;
        controller.abort();
      },
    };
  }
}

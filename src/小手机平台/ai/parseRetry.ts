import { parseResponse, ResponseParseError, type ParsedMessage } from './responseParser';

/** 与 providers 的 RequestHandle<string> 结构兼容的最小接口 */
export interface RequestHandleLike {
  readonly promise: Promise<string>;
  cancel(): void;
}

/** 由调用方闭包捕获 Provider 选项的提示词请求器；平台层无需了解具体 Provider */
export type PromptRequester = (promptText: string) => RequestHandleLike;

export interface ParsedRetryResult {
  /** 最后一次 AI 原始输出（成功那次） */
  raw: string;
  messages: readonly ParsedMessage[];
  /** 实际发出的 AI 请求次数；1 表示首次即成功未触发重试 */
  attempts: number;
  /** 每次触发重试的解析失败原因；长度 = attempts - 1 */
  retryReasons: readonly string[];
}

export interface ParseRetryOptions {
  /** 解析失败后的最大重试次数（不含首次请求）；默认 1，0 表示禁用重试 */
  maxRetries?: number;
  /** 喂回 AI 的上次输出最大长度，超出截断；默认 4000 */
  rawEchoLimit?: number;
}

/**
 * 构造喂回 AI 的修正提示词：原提示词 + 上次输出 + 失败原因 + 契约重述。
 * 始终基于原始提示词构造（而非上次的重试提示词），避免多轮重试时提示词无限增长。
 */
export function buildParseRetryPrompt(input: {
  originalPrompt: string;
  raw: string;
  error: string;
  members: readonly string[];
  rawEchoLimit?: number;
}): string {
  const limit = input.rawEchoLimit ?? 4_000;
  const echoed = input.raw.length > limit ? `${input.raw.slice(0, limit)}…（已截断）` : input.raw;
  return [
    input.originalPrompt,
    '',
    '─── 上一次输出无法解析，请修正后重新输出 ───',
    '【上一次的输出】',
    echoed,
    '',
    '【解析失败原因】',
    input.error,
    '',
    '【修正要求】',
    '只输出一个 JSON 对象，禁止 JSON 以外的任何文字：',
    '{"messages":[{"sender":"成员姓名","content":"纯文本消息"}]}',
    `sender 必须属于：${input.members.join('、')}`,
  ].join('\n');
}

/**
 * 解析失败喂回重试回路：请求 -> 解析失败 -> 带错误信息与上次输出重新请求 -> 再解析。
 * 只对 ResponseParseError 重试；网络/取消等非解析错误原样抛出，不做无意义重试。
 */
export function requestParsedWithRetry(
  request: PromptRequester,
  promptText: string,
  members: readonly string[],
  options: ParseRetryOptions = {},
): { promise: Promise<ParsedRetryResult>; cancel(): void } {
  const maxRetries = options.maxRetries ?? 1;
  const retryReasons: string[] = [];
  let currentHandle: RequestHandleLike | null = null;
  let cancelled = false;

  const promise = (async (): Promise<ParsedRetryResult> => {
    let prompt = promptText;
    for (let attempt = 0; ; attempt += 1) {
      if (cancelled) throw new Error('AI 解析重试请求已取消');
      currentHandle = request(prompt);
      const raw = await currentHandle.promise;
      if (cancelled) throw new Error('AI 解析重试请求已取消');
      try {
        const parsed = parseResponse(raw, members);
        return { raw, messages: parsed.messages, attempts: attempt + 1, retryReasons: [...retryReasons] };
      } catch (error) {
        if (!(error instanceof ResponseParseError)) throw error;
        if (attempt >= maxRetries) throw error;
        retryReasons.push(error.message);
        prompt = buildParseRetryPrompt({
          originalPrompt: promptText,
          raw,
          error: error.message,
          members,
          rawEchoLimit: options.rawEchoLimit,
        });
      }
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      currentHandle?.cancel();
    },
  };
}

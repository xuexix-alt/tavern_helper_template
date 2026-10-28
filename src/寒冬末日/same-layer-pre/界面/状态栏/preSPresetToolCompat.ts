/** SPreset-owned processing functions: no preview API, no tool execution, no request rewriting. */
export type SPresetSettings = {
  enabled?: boolean;
  consumeToolCalls?: boolean;
  script?: string;
  toolCallFormatter?: { enabled?: boolean; script?: string };
};
type Json = Record<string, any>;
type Snapshot = { output: string; failed: boolean };
type Session = {
  updateCumulative: (text: string, final?: boolean) => Promise<Snapshot>;
  finish: () => Promise<Snapshot>;
};
export type SPresetRuntime = {
  createSession: (script: string, options: { stream: boolean; channel: string }) => Session;
  formatCalls: (
    calls: Json[],
    settings: SPresetSettings,
    options: { stream: boolean; channel: string },
  ) => Promise<string>;
  consumeResponse: (data: Json, settings: SPresetSettings) => Promise<Json | null>;
};
export type PreResponseRecovery = { error: string; rawResponse: string; toolCalls: Json[] };
type Options = {
  settings: SPresetSettings;
  runtime: SPresetRuntime | null;
  stream: boolean;
  onFailure?: (recovery: PreResponseRecovery) => void;
};

export function resolvePreGenerationText(result: unknown): string {
  const detail = result && typeof result === 'object' ? (result as Json) : null;
  if (Array.isArray(detail?.tool_calls) && detail.tool_calls.length)
    throw new Error('工具调用尚未转换为正文，未创建助手楼层');
  const text = typeof result === 'string' ? result : typeof detail?.content === 'string' ? detail.content : '';
  if (!text.trim()) throw new Error('生成返回空内容，未创建助手楼层');
  return text;
}

function check(snapshot: Snapshot): string {
  if (snapshot.failed) throw new Error('SPreset 输出预处理失败，原响应已保留');
  return snapshot.output;
}
function responseHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  for (const key of ['content-length', 'content-encoding', 'transfer-encoding']) headers.delete(key);
  return headers;
}
function report(error: unknown, rawResponse: string, toolCalls: Json[], options: Options): never {
  const message = error instanceof Error ? error.message : String(error);
  options.onFailure?.({ error: message, rawResponse, toolCalls: JSON.parse(JSON.stringify(toolCalls)) });
  throw new Error('PRE 响应处理失败：' + message);
}
const channelFor = (index: number) => (index === 0 ? 'main' : 'swipe:' + (index - 1));

export async function adaptSPresetResponse(response: Response, options: Options): Promise<Response> {
  if (!options.settings.enabled || !response.ok) return response;
  const runtime = options.runtime;
  if (!runtime) throw new Error('当前 SPreset 缺少运行处理接口，无法安全适配');
  const contentType = response.headers.get('content-type') ?? '';
  if (options.stream) {
    if (!contentType.includes('text/event-stream')) {
      return report(new Error('流式请求收到非 SSE 响应'), await response.text(), [], options);
    }
    return adaptStream(response, runtime, options);
  }
  // Use the original .json() method, including SPreset/Kunlun hooks already installed.
  // A clone is retained solely for recovery, not used to bypass those hooks.
  const rawCopy = response
    .clone()
    .text()
    .catch(() => '');
  let calls: Json[] = [];
  try {
    const original = await response.json();
    if (original.error)
      return new Response(JSON.stringify(original), { status: response.status, headers: responseHeaders(response) });
    if (!Array.isArray(original.choices) || !original.choices.length)
      throw new Error('尚未支持此响应结构，请保留原响应');
    calls = original.choices.flatMap((c: Json) => c.message?.tool_calls ?? []);
    const consumed = options.settings.consumeToolCalls
      ? await runtime.consumeResponse(original, options.settings)
      : null;
    const data = consumed ?? original;
    for (const choice of data.choices) {
      if (choice.message?.tool_calls?.length || choice.message?.function_call)
        throw new Error('响应中仍有未消费的工具调用');
      const text = choice.message?.content;
      if (text != null && typeof text !== 'string') throw new Error('尚未支持此正文结构');
      const session = runtime.createSession(options.settings.script ?? '', {
        stream: false,
        channel: channelFor(choice.index ?? 0),
      });
      choice.message.content = check(await session.updateCumulative(text ?? '', true));
      if ((choice.index ?? 0) === 0 && !choice.message.content.trim())
        throw new Error('SPreset 处理后正文为空，原响应已保留');
    }
    await rawCopy;
    return new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders(response),
    });
  } catch (error) {
    return report(error, await rawCopy.catch(() => ''), calls, options);
  }
}

type ChoiceState = { raw: string; emitted: string; calls: Map<number, Json>; session: Session };
function adaptStream(response: Response, runtime: SPresetRuntime, options: Options): Response {
  if (!response.body) throw new Error('生成响应没有可读取的内容');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const rawChunks: string[] = [];
  const states = new Map<number, ChoiceState>();
  const endings: Json[] = [];
  let sawEnd = false;
  let sawDone = false;
  let cancelled = false;
  const allCalls = () => [...states.values()].flatMap(s => [...s.calls.values()]);
  const stateFor = (index: number) => {
    let state = states.get(index);
    if (!state) {
      state = {
        raw: '',
        emitted: '',
        calls: new Map(),
        session: runtime.createSession(options.settings.script ?? '', { stream: true, channel: channelFor(index) }),
      };
      states.set(index, state);
    }
    return state;
  };
  function deltaFor(state: ChoiceState, output: string): string {
    if (!output.startsWith(state.emitted)) throw new Error('预处理修改了已经显示的正文前缀，已停止写入');
    const delta = output.slice(state.emitted.length);
    state.emitted = output;
    return delta;
  }
  function accumulate(state: ChoiceState, fragments: Json[]) {
    for (const fragment of fragments) {
      const index = fragment.index ?? 0;
      let call = state.calls.get(index);
      if (!call) {
        call = { id: '', type: 'function', function: { name: '', arguments: '' } };
        state.calls.set(index, call);
      }
      if (fragment.id) call.id = fragment.id;
      if (fragment.function?.name) call.function.name += fragment.function.name;
      if (typeof fragment.function?.arguments === 'string') call.function.arguments += fragment.function.arguments;
    }
  }
  const encode = (data: Json) => encoder.encode('data: ' + JSON.stringify(data) + '\n\n');

  async function* transform() {
    let pending = '';
    async function handle(frame: string): Promise<Uint8Array | null> {
      const lines = frame.split(/\r?\n/);
      const dataLines = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, ''));
      if (!dataLines.length) return encoder.encode(frame + '\n\n');
      const payload = dataLines.join('\n');
      if (payload.trim() === '[DONE]') {
        sawEnd = true;
        sawDone = true;
        return null;
      }
      const data = JSON.parse(payload);
      if (data.error) throw new Error(data.error.message || '模型接口返回错误');
      if (!Array.isArray(data.choices)) throw new Error('尚未支持此 SSE 协议，请保留原响应');
      if (!data.choices.length) {
        endings.push(data);
        return null;
      }
      const terminalChoices = [];
      for (const choice of data.choices) {
        const index = choice.index ?? 0;
        const state = stateFor(index);
        const delta = choice.delta ?? choice.message ?? {};
        if (delta.function_call) throw new Error('尚未支持旧式 function_call 流');
        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
          accumulate(state, delta.tool_calls);
          if (!options.settings.consumeToolCalls) throw new Error('当前预设未启用工具调用消费');
          delete delta.tool_calls;
        }
        if (delta.content != null && typeof delta.content !== 'string') throw new Error('尚未支持此流式正文结构');
        state.raw += delta.content ?? '';
        const text = deltaFor(state, check(await state.session.updateCumulative(state.raw)));
        if (text) delta.content = text;
        else delete delta.content;
        choice.delta = delta;
        delete choice.message;
        if (choice.finish_reason) {
          sawEnd = true;
          terminalChoices.push({
            index,
            delta: {},
            finish_reason: ['tool_calls', 'function_call'].includes(choice.finish_reason)
              ? 'stop'
              : choice.finish_reason,
          });
          choice.finish_reason = null;
        }
      }
      if (terminalChoices.length) endings.push({ ...data, choices: terminalChoices });
      return encode(data);
    }
    try {
      while (true) {
        const { value, done } = await reader.read();
        const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
        rawChunks.push(chunk);
        pending += chunk;
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(pending))) {
          const frame = pending.slice(0, boundary.index);
          pending = pending.slice(boundary.index + boundary[0].length);
          if (frame) {
            const output = await handle(frame);
            if (output) yield output;
          }
          if (sawDone) break;
        }
        if (done || sawDone) break;
      }
      if (!sawDone && pending.trim()) {
        const output = await handle(pending);
        if (output) yield output;
      }
      if (allCalls().length && !sawEnd) throw new Error('工具调用流在结束标记前中断');
      for (const [index, state] of states) {
        if (state.calls.size) {
          const toolText = await runtime.formatCalls([...state.calls.values()], options.settings, {
            stream: true,
            channel: channelFor(index),
          });
          const combined =
            state.raw && toolText
              ? state.raw + (state.raw.endsWith('\n') ? '' : '\n') + toolText
              : state.raw || toolText;
          const delta = deltaFor(state, check(await state.session.updateCumulative(combined)));
          if (delta) yield encode({ choices: [{ index, delta: { content: delta }, finish_reason: null }] });
        }
        const tail = deltaFor(state, check(await state.session.finish()));
        if (tail) yield encode({ choices: [{ index, delta: { content: tail }, finish_reason: null }] });
      }
      if (!states.get(0)?.emitted.trim()) throw new Error('SPreset 处理后正文为空，原响应已保留');
      for (const ending of endings) yield encode(ending);
      yield encoder.encode('data: [DONE]\n\n');
    } catch (error) {
      if (!cancelled) report(error, rawChunks.join(''), allCalls(), options);
      throw error;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  const iterator = transform();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      cancelled = true;
      await reader.cancel(reason).catch(() => {});
      await iterator.return(undefined);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(response),
  });
}

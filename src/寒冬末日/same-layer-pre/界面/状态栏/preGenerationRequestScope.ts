type Listener = (...args: any[]) => void;
type Events = {
  on: (event: string, listener: Listener) => unknown;
  makeFirst?: (event: string, listener: Listener) => unknown;
  removeListener: (event: string, listener: Listener) => unknown;
};
type Host = { fetch: typeof fetch; location: { href: string } };

/**
 * Helper's wire payload has no generation ID. Require both its ID-bearing start
 * event and the exact final settings body; never adopt an arbitrary next fetch.
 * Ambiguous overlapping preparation is rejected, not assigned to PRE.
 */
export function createPreGenerationRequestScope(options: {
  host: Host;
  events: Events;
  generationId: string;
  adapt: (response: Response, stream: boolean) => Promise<Response>;
}) {
  const { host, events, generationId } = options;
  const originalFetch = host.fetch;
  let active = true;
  let started = false;
  let ambiguous = false;
  let claimed = false;
  let finalSettings: Record<string, unknown> | null = null;
  const listeners: Array<[string, Listener]> = [];
  const bind = (name: string, listener: Listener) => {
    // Helper does not await its start event. Observe it before async plugin listeners.
    if (name !== 'chat_completion_settings_ready' && events.makeFirst) events.makeFirst(name, listener);
    else events.on(name, listener);
    listeners.push([name, listener]);
  };
  const otherGeneration = (id?: string) => {
    if (active && !claimed && id !== generationId) ambiguous = true;
  };
  bind('js_generation_requested', otherGeneration);
  bind('js_generation_started', id => {
    if (id === generationId) started = true;
    else otherGeneration(id);
  });
  bind('generation_started', () => otherGeneration());
  bind('chat_completion_settings_ready', data => {
    if (active && started && !claimed && !ambiguous) {
      if (finalSettings && finalSettings !== data) ambiguous = true;
      else finalSettings = data;
    }
  });

  const wrapped: typeof fetch = async function (input, init) {
    let matches = false;
    let stream = false;
    if (active && started && !claimed && !ambiguous && finalSettings && !init?.signal?.aborted) {
      try {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          host.location.href,
        );
        matches =
          url.origin === new URL(host.location.href).origin &&
          url.pathname === '/api/backends/chat-completions/generate' &&
          init?.method?.toUpperCase() === 'POST' &&
          typeof init.body === 'string' &&
          init.body === JSON.stringify(finalSettings);
        stream = finalSettings.stream === true;
      } catch {
        matches = false;
      }
    }
    if (matches) claimed = true;
    const response = await originalFetch.call(host, input, init);
    if (!matches || !active || init?.signal?.aborted) return response;
    return options.adapt(response, stream);
  };
  host.fetch = wrapped;
  return {
    originalFetch,
    assertClaimed() {
      if (ambiguous) throw new Error('检测到并发生成，无法确认响应归属；此次未执行 PRE 适配');
      if (!claimed) throw new Error('未识别到本次生成的响应，无法确认工具输出是否完整');
    },
    dispose() {
      if (!active) return;
      active = false;
      for (const [name, listener] of listeners) events.removeListener(name, listener);
      if (host.fetch === wrapped) host.fetch = originalFetch;
      finalSettings = null;
    },
  };
}

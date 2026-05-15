function normalizeOptionalString(input: unknown): string | null {
  const value = String(input ?? '').trim();
  return value ? value : null;
}

export function normalizeNativeSendText(input: string): string {
  const raw = String(input ?? '');
  const noNewlines = raw.replace(/\r?\n+/g, ' ').trim();
  return noNewlines.replaceAll('|', '｜');
}

export function buildNativeSendSlashCommand(
  text: string,
  _options: boolean | { awaitTrigger?: boolean } = { awaitTrigger: false },
): string {
  const normalized = normalizeNativeSendText(text);
  return `/send ${normalized}`;
}

function resolveNativeSlashExecutor(): ((cmd: string) => Promise<unknown>) | null {
  if (typeof triggerSlash === 'function') {
    return async (cmd: string) => {
      await triggerSlash(cmd);
    };
  }

  const resolveFromSillyTavernContext = (targetWindow: Window | null): ((cmd: string) => Promise<unknown>) | null => {
    if (!targetWindow) return null;
    try {
      const ctx = (targetWindow as any)?.SillyTavern?.getContext?.();
      if (typeof ctx?.executeSlashCommandsWithOptions === 'function') {
        return async (cmd: string) => {
          await ctx.executeSlashCommandsWithOptions(cmd, { source: 'eden-ui' });
        };
      }
      if (typeof ctx?.executeSlashCommands === 'function') {
        return async (cmd: string) => {
          await ctx.executeSlashCommands(cmd);
        };
      }
    } catch {
      // ignore
    }
    return null;
  };

  const directTargets = [window, window.parent ?? null, window.top ?? null];
  for (const target of directTargets) {
    const resolved = resolveFromSillyTavernContext(target ?? null);
    if (resolved) return resolved;
  }

  let cur: Window | null = window;
  for (let i = 0; i < 8 && cur; i += 1) {
    try {
      const candidate = (cur as any)?.triggerSlash;
      if (typeof candidate === 'function') {
        return async (cmd: string) => {
          await candidate.call(cur, cmd);
        };
      }
    } catch {
      // ignore
    }

    try {
      if (!cur.parent || cur.parent === cur) break;
      cur = cur.parent;
    } catch {
      break;
    }
  }

  return null;
}

function resolveNativeGenerator(): (() => void) | null {
  const resolveFromSillyTavernContext = (targetWindow: Window | null): (() => void) | null => {
    if (!targetWindow) return null;
    try {
      const ctx = (targetWindow as any)?.SillyTavern?.getContext?.();
      if (typeof ctx?.generate === 'function') {
        return () => {
          const generation = ctx.generate.call(ctx, 'normal', { automatic_trigger: false });
          Promise.resolve(generation).catch(error => {
            console.error('[eden-ui] native generation failed after /send', error);
          });
        };
      }
    } catch {
      // ignore
    }
    return null;
  };

  const directTargets = [window, window.parent ?? null, window.top ?? null];
  for (const target of directTargets) {
    const resolved = resolveFromSillyTavernContext(target ?? null);
    if (resolved) return resolved;
  }

  return null;
}

export async function sendToNativeChat(
  text: string,
  options: boolean | { awaitTrigger?: boolean } = { awaitTrigger: false },
): Promise<void> {
  const normalized = normalizeOptionalString(normalizeNativeSendText(text));
  if (!normalized) {
    throw new Error('空文本');
  }

  const executor = resolveNativeSlashExecutor();
  if (!executor) {
    throw new Error('triggerSlash 不可用');
  }

  await executor(buildNativeSendSlashCommand(normalized, options));

  const generator = resolveNativeGenerator();
  if (generator) {
    generator();
    return;
  }

  const awaitTrigger = typeof options === 'boolean' ? options : options.awaitTrigger === true;
  await executor(awaitTrigger ? '/trigger await=true' : '/trigger');
}

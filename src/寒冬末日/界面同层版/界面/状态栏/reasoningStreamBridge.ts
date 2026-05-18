export type ReasoningStreamStateName = 'idle' | 'thinking' | 'done';

export type TavernReasoningConfig = {
  enabled?: boolean;
  prefix?: string;
  suffix?: string;
  autoExpand?: boolean;
  showHidden?: boolean;
  parseReasoningFromString?: (text: string, options?: { strict?: boolean }) => any | null;
};

export type ReasoningStreamSnapshot = {
  rawText: string;
  visibleText: string;
  reasoningText: string;
  state: ReasoningStreamStateName;
  hasReasoning: boolean;
};

export type ReasoningStreamState = ReasoningStreamSnapshot & {
  config: TavernReasoningConfig;
  reasoningState: ReasoningStreamStateName;
  appendRawToken(token: unknown): ReasoningStreamSnapshot;
  setRawText(text: unknown): ReasoningStreamSnapshot;
  reset(config?: TavernReasoningConfig): ReasoningStreamSnapshot;
};

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function normalizeReasoningConfig(config?: TavernReasoningConfig): Required<TavernReasoningConfig> {
  return {
    enabled: config?.enabled === true,
    prefix: String(config?.prefix ?? ''),
    suffix: String(config?.suffix ?? ''),
    autoExpand: config?.autoExpand === true,
    showHidden: config?.showHidden === true,
    parseReasoningFromString:
      typeof config?.parseReasoningFromString === 'function' ? config.parseReasoningFromString : () => null,
  };
}

function shouldParseReasoning(config: Required<TavernReasoningConfig>): boolean {
  return config.enabled && config.prefix.length > 0 && config.suffix.length > 0;
}

export function splitReasoningStreamText(text: unknown, config?: TavernReasoningConfig): ReasoningStreamSnapshot {
  const rawText = String(text ?? '');
  const normalized = normalizeReasoningConfig(config);
  if (!shouldParseReasoning(normalized)) {
    return {
      rawText,
      visibleText: rawText,
      reasoningText: '',
      state: 'idle',
      hasReasoning: false,
    };
  }

  const prefixIndex = rawText.indexOf(normalized.prefix);
  if (prefixIndex < 0) {
    return {
      rawText,
      visibleText: rawText,
      reasoningText: '',
      state: 'idle',
      hasReasoning: false,
    };
  }

  const nativeParsed = normalized.parseReasoningFromString(rawText, { strict: true });
  const nativeReasoning = firstNonEmptyString(nativeParsed?.reasoning, nativeParsed?.reasoningText);
  const nativeContent =
    nativeParsed && typeof nativeParsed === 'object' && 'content' in nativeParsed
      ? String(nativeParsed.content ?? '')
      : '';
  if (nativeReasoning || nativeContent) {
    return {
      rawText,
      visibleText: nativeContent,
      reasoningText: nativeReasoning,
      state: 'done',
      hasReasoning: Boolean(nativeReasoning),
    };
  }

  const beforeReasoning = rawText.slice(0, prefixIndex);
  const afterPrefix = rawText.slice(prefixIndex + normalized.prefix.length);
  const suffixIndex = afterPrefix.indexOf(normalized.suffix);
  if (suffixIndex < 0) {
    return {
      rawText,
      visibleText: beforeReasoning,
      reasoningText: afterPrefix,
      state: 'thinking',
      hasReasoning: true,
    };
  }

  const reasoningText = afterPrefix.slice(0, suffixIndex);
  const afterReasoning = afterPrefix.slice(suffixIndex + normalized.suffix.length);
  return {
    rawText,
    visibleText: `${beforeReasoning}${afterReasoning}`,
    reasoningText,
    state: 'done',
    hasReasoning: true,
  };
}

export function createReasoningStreamState(config?: TavernReasoningConfig): ReasoningStreamState {
  const state = {
    config: { ...normalizeReasoningConfig(config) },
    rawText: '',
    visibleText: '',
    reasoningText: '',
    reasoningState: 'idle' as ReasoningStreamStateName,
    state: 'idle' as ReasoningStreamStateName,
    hasReasoning: false,
    appendRawToken(token: unknown) {
      return applySnapshot(String(state.rawText ?? '') + String(token ?? ''));
    },
    setRawText(text: unknown) {
      return applySnapshot(text);
    },
    reset(nextConfig?: TavernReasoningConfig) {
      state.config = { ...normalizeReasoningConfig(nextConfig ?? state.config) };
      return applySnapshot('');
    },
  };

  function applySnapshot(text: unknown): ReasoningStreamSnapshot {
    const snapshot = splitReasoningStreamText(text, state.config);
    state.rawText = snapshot.rawText;
    state.visibleText = snapshot.visibleText;
    state.reasoningText = snapshot.reasoningText;
    state.reasoningState = snapshot.state;
    state.state = snapshot.state;
    state.hasReasoning = snapshot.hasReasoning;
    return snapshot;
  }

  return state;
}

export function resolveReasoningVisibleText(
  state: Pick<ReasoningStreamState, 'config' | 'rawText' | 'visibleText' | 'reasoningState'>,
  finalText: unknown,
  phase: 'stream' | 'done',
): string {
  if (phase === 'stream') return String(state.visibleText ?? '');

  const finalRaw = String(finalText ?? '');
  if (finalRaw.trim()) {
    const finalSnapshot = splitReasoningStreamText(finalRaw, state.config);
    if (finalSnapshot.state === 'thinking' && !finalSnapshot.visibleText.trim()) return finalRaw;
    return finalSnapshot.visibleText || finalRaw;
  }

  if (state.reasoningState === 'thinking' && !String(state.visibleText ?? '').trim()) {
    return String(state.rawText ?? '');
  }
  return String(state.visibleText || state.rawText || '');
}

export function extractNativeReasoningText(message: unknown): string {
  const source = message != null && typeof message === 'object' ? (message as any) : null;
  if (!source) return '';
  return firstNonEmptyString(
    source?.extra?.reasoning_display_text,
    source?.extra?.reasoning,
    source?.reasoning_display_text,
    source?.reasoning,
    source?.state?.reasoning,
  );
}

export function readTavernReasoningConfig(hostWindow?: any): TavernReasoningConfig {
  try {
    const root = hostWindow ?? globalThis;
    const context =
      typeof root?.SillyTavern?.getContext === 'function'
        ? root.SillyTavern.getContext()
        : typeof root?.parent?.SillyTavern?.getContext === 'function'
          ? root.parent.SillyTavern.getContext()
          : typeof root?.top?.SillyTavern?.getContext === 'function'
            ? root.top.SillyTavern.getContext()
            : null;
    const reasoning =
      context?.powerUserSettings?.reasoning ??
      root?.power_user?.reasoning ??
      root?.parent?.power_user?.reasoning ??
      root?.top?.power_user?.reasoning;
    return {
      enabled: reasoning?.auto_parse === true,
      prefix: String(reasoning?.prefix ?? ''),
      suffix: String(reasoning?.suffix ?? ''),
      autoExpand: reasoning?.auto_expand === true,
      showHidden: reasoning?.show_hidden === true,
      parseReasoningFromString:
        typeof context?.parseReasoningFromString === 'function' ? context.parseReasoningFromString : undefined,
    };
  } catch {
    return { enabled: false, prefix: '', suffix: '' };
  }
}

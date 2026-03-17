export type ReadMvuStatDataResult<TData> = { ok: true; data: TData; messageId: number | 'latest' } | { ok: false };

export type ResolveMvuSnapshotStateInput<TData> = {
  target: number | 'latest';
  current: ReadMvuStatDataResult<TData>;
  latest?: ReadMvuStatDataResult<TData>;
  ready: boolean;
  previousSource: 'current' | 'latest' | 'default';
  previousResolvedMessageId: number | 'latest';
  extraAnalysis: boolean;
};

export type ResolvedMvuSnapshotState<TData> =
  | {
      mode: 'resolved';
      data: TData;
      source: 'current' | 'latest';
      resolvedMessageId: number | 'latest';
      ready: true;
      isRetrying: false;
    }
  | {
      mode: 'empty';
      source: 'default';
      resolvedMessageId: 'latest';
      ready: false;
      isRetrying: boolean;
    };

export function resolveMvuSnapshotState<TData>(
  input: ResolveMvuSnapshotStateInput<TData>,
): ResolvedMvuSnapshotState<TData> {
  if (input.current.ok) {
    return {
      mode: 'resolved',
      data: input.current.data,
      source: input.target === 'latest' ? 'latest' : 'current',
      resolvedMessageId: input.current.messageId,
      ready: true,
      isRetrying: false,
    };
  }

  return {
    mode: 'empty',
    source: 'default',
    resolvedMessageId: 'latest',
    ready: false,
    isRetrying: input.extraAnalysis === true,
  };
}

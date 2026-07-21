export function cancelPendingTimers<TKey, TTimer>(
  timers: Map<TKey, TTimer>,
  clear: (timer: TTimer) => void,
): void {
  for (const timer of timers.values()) clear(timer);
  timers.clear();
}

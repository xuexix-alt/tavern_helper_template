type EventMapShape<TEvents> = { [K in keyof TEvents]: unknown[] };
type StoredListener = (...args: unknown[]) => void;

export class EventBus<TEvents extends EventMapShape<TEvents>> {
  private readonly listeners = new Map<keyof TEvents, Set<StoredListener>>();

  constructor(private readonly onListenerError?: (error: unknown, event: keyof TEvents) => void) {}

  on<K extends keyof TEvents>(event: K, listener: (...args: TEvents[K]) => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set<StoredListener>();
    const storedListener = listener as unknown as StoredListener;
    listeners.add(storedListener);
    this.listeners.set(event, listeners);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(storedListener);
      if (listeners.size === 0) this.listeners.delete(event);
    };
  }

  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    const unreportedErrors: unknown[] = [];
    [...listeners].forEach(listener => {
      try {
        listener(...(args as unknown[]));
      } catch (error) {
        if (!this.onListenerError) {
          unreportedErrors.push(error);
          return;
        }
        try {
          this.onListenerError(error, event);
        } catch (reportingError) {
          unreportedErrors.push(new AggregateError([error, reportingError], 'Event listener error reporting failed'));
        }
      }
    });
    if (unreportedErrors.length > 0) {
      throw new AggregateError(unreportedErrors, `Unhandled errors from event ${String(event)}`);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

type Handler<T> = (payload: T) => void;

export class EventEmitter<TEventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof TEventMap, Set<Handler<any>>>();

  on<K extends keyof TEventMap>(
    event: K,
    handler: Handler<TEventMap[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof TEventMap>(
    event: K,
    handler: Handler<TEventMap[K]>,
  ): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    this.listeners.get(event)?.forEach(h => h(payload));
  }

  clear(event?: keyof TEventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

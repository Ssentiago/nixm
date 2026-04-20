import { logger } from '@/lib/logger';

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

    const handlers = this.listeners.get(event)!;
    handlers.add(handler);

    logger.debug(`Event listener added`, {
      event: String(event),
      totalListeners: handlers.size,
    });

    return () => this.off(event, handler);
  }

  off<K extends keyof TEventMap>(
    event: K,
    handler: Handler<TEventMap[K]>,
  ): void {
    const deleted = this.listeners.get(event)?.delete(handler);

    if (deleted) {
      logger.debug(`Event listener removed`, {
        event: String(event),
        remainingListeners: this.listeners.get(event)?.size ?? 0,
      });
    }
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const handlers = this.listeners.get(event);

    if (!handlers || handlers.size === 0) {
      logger.debug(`Event emitted but no listeners found`, {
        event: String(event),
      });
      return;
    }

    logger.debug(`Emitting event`, {
      event: String(event),
      listenersCount: handlers.size,
      payload: payload, // Vite-плагин автоматически добавит контекст вызова!
    });

    handlers.forEach(h => {
      try {
        h(payload);
      } catch (e) {
        logger.error(`Error in event handler`, {
          event: String(event),
          error: String(e),
        });
      }
    });
  }

  clear(event?: keyof TEventMap): void {
    if (event) {
      this.listeners.delete(event);
      logger.info(`Cleared all listeners for specific event`, {
        event: String(event),
      });
    } else {
      const count = this.listeners.size;
      this.listeners.clear();
      logger.info(`Cleared all event listeners from emitter`, {
        eventsCount: count,
      });
    }
  }
}

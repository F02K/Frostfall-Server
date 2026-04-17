import type { GameEvent, GameEventType } from './types';

type EventHandler<T = unknown> = (event: GameEvent<T>) => void;

/**
 * Extended typed event bus.
 * Systems communicate exclusively through this — never by calling each other directly.
 *
 * Supports:
 *   - Typed handlers per event type
 *   - Wildcard '*' listener (receives all events)
 *   - One-time handlers via once()
 *   - Error isolation (one bad handler won't stop others)
 */
export class ExtendedEventBus {
  private listeners = new Map<GameEventType | '*', Set<EventHandler<unknown>>>();

  on<T = unknown>(type: GameEventType | '*', handler: EventHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler as EventHandler<unknown>);
    // Return unsubscribe function
    return () => this.off(type, handler);
  }

  once<T = unknown>(type: GameEventType | '*', handler: EventHandler<T>): void {
    const wrapper: EventHandler<T> = (event) => {
      this.off(type, wrapper);
      handler(event);
    };
    this.on(type, wrapper);
  }

  off<T = unknown>(type: GameEventType | '*', handler: EventHandler<T>): void {
    this.listeners.get(type)?.delete(handler as EventHandler<unknown>);
  }

  dispatch<T = unknown>(event: GameEvent<T>): void {
    const targeted = this.listeners.get(event.type);
    const wildcard = this.listeners.get('*');

    const all = [
      ...(targeted ? [...targeted] : []),
      ...(wildcard ? [...wildcard] : []),
    ];

    for (const handler of all) {
      try {
        handler(event as GameEvent<unknown>);
      } catch (e) {
        console.error(`[EventBus] Uncaught error in handler for "${event.type}":`, e);
      }
    }
  }
}

// Re-export old name for backward compat with existing systems
export { ExtendedEventBus as EventBus };

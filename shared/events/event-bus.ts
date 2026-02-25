import type { SystemEventName, SystemEventPayloadMap } from './system-events';

type EventHandler<TEvent extends SystemEventName> = (
  payload: SystemEventPayloadMap[TEvent],
) => void | Promise<void>;

class EventBus {
  private readonly listeners = new Map<SystemEventName, Set<EventHandler<SystemEventName>>>();

  on<TEvent extends SystemEventName>(
    event: TEvent,
    handler: EventHandler<TEvent>,
  ): () => void {
    const current = this.listeners.get(event) ?? new Set<EventHandler<SystemEventName>>();
    current.add(handler as EventHandler<SystemEventName>);
    this.listeners.set(event, current);

    return () => this.off(event, handler);
  }

  off<TEvent extends SystemEventName>(
    event: TEvent,
    handler: EventHandler<TEvent>,
  ): void {
    const current = this.listeners.get(event);
    if (!current) return;
    current.delete(handler as EventHandler<SystemEventName>);
    if (current.size === 0) this.listeners.delete(event);
  }

  emit<TEvent extends SystemEventName>(
    event: TEvent,
    payload: SystemEventPayloadMap[TEvent],
  ): void {
    const current = this.listeners.get(event);
    if (!current || current.size === 0) return;

    // Never block callers; each handler runs in a microtask and failures are isolated.
    current.forEach((handler) => {
      queueMicrotask(() => {
        Promise.resolve(handler(payload as SystemEventPayloadMap[SystemEventName])).catch((error) => {
          console.error(`[eventBus] handler failed for "${event}":`, error);
        });
      });
    });
  }
}

export const eventBus = new EventBus();

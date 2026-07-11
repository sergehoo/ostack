export interface OStackEvent<T = unknown> {
  id: string;
  type: string;
  occurredAt: string;
  source: string;
  data: T;
  correlationId?: string;
}

type EventHandler<T = unknown> = (event: OStackEvent<T>) => void | Promise<void>;

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  on<T>(type: string, handler: EventHandler<T>): () => void {
    const handlers = this.handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.handlers.set(type, handlers);
    return () => handlers.delete(handler as EventHandler);
  }

  async publish<T>(event: OStackEvent<T>): Promise<void> {
    const handlers = [...(this.handlers.get(event.type) ?? []), ...(this.handlers.get("*") ?? [])];
    await Promise.all(handlers.map((handler) => handler(event)));
  }
}

export function createEvent<T>(type: string, source: string, data: T, correlationId?: string): OStackEvent<T> {
  return {
    id: crypto.randomUUID(),
    type,
    source,
    data,
    occurredAt: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {})
  };
}

import { getDb, events } from '@tela/db';
import type { EventSource } from '@tela/types';
import type { EventType } from './types.js';

export interface LogEventInput {
  userId: string;
  type: EventType;
  source: EventSource;
  contextSnapshot?: unknown;
  payload?: unknown;
}

/**
 * Log an event to the events table.
 * This is the single entry point for all event logging in the system.
 * Events are append-only — nothing updates or deletes them.
 */
export async function logEvent(input: LogEventInput): Promise<string> {
  const db = getDb();

  const [event] = await db
    .insert(events)
    .values({
      userId: input.userId,
      type: input.type,
      source: input.source,
      contextSnapshot: input.contextSnapshot ?? null,
      payload: input.payload ?? null,
    })
    .returning({ id: events.id });

  return event.id;
}

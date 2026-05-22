import { z } from 'zod';
import { desc, sql as drizzleSql } from 'drizzle-orm';
import { getDb, events, users } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  /** Page size. Capped at 100 to keep the response cheap. */
  limit: z.number().int().min(1).max(100).default(50),
  /**
   * Cursor returned from a prior call as `nextCursor`, encoded
   * `${timestampIso}__${eventId}`. Pagination orders by
   * (timestamp, id) DESC to break ties stably under concurrent inserts.
   */
  before: z.string().optional(),
});

const activityEntry = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  type: z.string(),
  payload: z.unknown().nullable(),
  timestamp: z.string(),
});

const output = z.object({
  entries: z.array(activityEntry),
  /** True if at least one more page exists past the last entry returned. */
  hasMore: z.boolean(),
  /**
   * Pass this back as `before` on the next call. Null when `hasMore` is
   * false. Encoded `${timestampIso}__${eventId}`.
   */
  nextCursor: z.string().nullable(),
});

function decodeCursor(raw: string): { timestamp: Date; id: string } | null {
  const sep = raw.indexOf('__');
  if (sep < 0) return null;
  const ts = raw.slice(0, sep);
  const id = raw.slice(sep + 2);
  if (!ts || !id) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return { timestamp: date, id };
}

/**
 * Paginated reverse-chronological event feed for the admin activity page.
 * Joins each event with its user for display (email / displayName).
 *
 * Cursor pagination on (timestamp, id) so ties on a single timestamp
 * (e.g., a burst of events from one user action) paginate stably under
 * concurrent inserts. Admin only.
 */
export const getActivity = registerCapability({
  name: 'admin.getActivity',
  description:
    'Reverse-chronological event feed across all users for the admin activity page. Returns paginated entries with actor (email / displayName) joined. Cursor on (timestamp, id) for stable pagination. Admin only.',
  input,
  output,
  requiresAdmin: true,
  chatTool: true,

  async execute({ limit, before }) {
    const db = getDb();

    const cursor = before ? decodeCursor(before) : null;
    const overfetch = limit + 1;

    const whereSql = cursor
      ? drizzleSql`(${events.timestamp}, ${events.id}) < (${cursor.timestamp.toISOString()}::timestamptz, ${cursor.id}::uuid)`
      : drizzleSql`true`;

    const rows = await db
      .select({
        id: events.id,
        userId: events.userId,
        type: events.type,
        payload: events.payload,
        timestamp: events.timestamp,
        email: users.email,
        displayName: users.displayName,
      })
      .from(events)
      .leftJoin(users, drizzleSql`${users.id} = ${events.userId}`)
      .where(whereSql)
      .orderBy(desc(events.timestamp), desc(events.id))
      .limit(overfetch);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? `${last.timestamp.toISOString()}__${last.id}` : null;

    return {
      entries: page.map((r) => ({
        id: r.id,
        userId: r.userId,
        email: r.email,
        displayName: r.displayName,
        type: r.type,
        payload: r.payload,
        timestamp: r.timestamp.toISOString(),
      })),
      hasMore,
      nextCursor,
    };
  },
});

/**
 * Server-side activity feed for the admin dashboard.
 * Mirrors admin.getActivity capability — keep return shapes aligned.
 * If schema changes, BOTH sites need updating.
 */
import 'server-only';
import { getSql } from '@tela/db';

export interface ActivityEntry {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  type: string;
  payload: Record<string, unknown> | null;
  timestamp: string;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  hasMore: boolean;
  /** Pass back as the `before` arg to fetch the next page; null at end. */
  nextCursor: string | null;
}

function decodeCursor(raw: string): { timestamp: string; id: string } | null {
  const sep = raw.indexOf('__');
  if (sep < 0) return null;
  const ts = raw.slice(0, sep);
  const id = raw.slice(sep + 2);
  if (!ts || !id) return null;
  if (Number.isNaN(new Date(ts).getTime())) return null;
  return { timestamp: ts, id };
}

/**
 * Reverse-chronological event feed joined with user info, paginated by
 * cursor on (timestamp, id). Mirrors `admin.getActivity` capability.
 *
 * Pass `before` from a prior call's `nextCursor` to advance.
 */
export async function getActivity(opts: { limit?: number; before?: string } = {}): Promise<ActivityPage> {
  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const overfetch = limit + 1;
  const cursor = opts.before ? decodeCursor(opts.before) : null;

  const rows = cursor
    ? await sql<
        {
          id: string;
          user_id: string;
          email: string | null;
          display_name: string | null;
          type: string;
          payload: Record<string, unknown> | null;
          timestamp: Date;
        }[]
      >`
        SELECT
          e.id, e.user_id, u.email, u.display_name,
          e.type, e.payload, e.timestamp
        FROM events e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE (e.timestamp, e.id) < (${cursor.timestamp}::timestamptz, ${cursor.id}::uuid)
        ORDER BY e.timestamp DESC, e.id DESC
        LIMIT ${overfetch}
      `
    : await sql<
        {
          id: string;
          user_id: string;
          email: string | null;
          display_name: string | null;
          type: string;
          payload: Record<string, unknown> | null;
          timestamp: Date;
        }[]
      >`
        SELECT
          e.id, e.user_id, u.email, u.display_name,
          e.type, e.payload, e.timestamp
        FROM events e
        LEFT JOIN users u ON u.id = e.user_id
        ORDER BY e.timestamp DESC, e.id DESC
        LIMIT ${overfetch}
      `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const lastTs = last
    ? new Date(last.timestamp as string | Date).toISOString()
    : null;
  const nextCursor = hasMore && last && lastTs ? `${lastTs}__${last.id}` : null;

  return {
    entries: page.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      displayName: r.display_name,
      type: r.type,
      payload: r.payload,
      timestamp: new Date(r.timestamp as string | Date).toISOString(),
    })),
    hasMore,
    nextCursor,
  };
}

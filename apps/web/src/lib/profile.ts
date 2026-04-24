import 'server-only';
import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  _sql = postgres(process.env.DATABASE_URL!, {
    max: 5,
    idle_timeout: 10,
    connect_timeout: 10,
  });
  return _sql;
}

export interface StyleProfileSummary {
  profileText: string;
  dimensions: Record<string, number>;
  signals: Array<{ tag: string; strength: number }>;
}

export async function getStyleProfileForUser(
  userId: string,
): Promise<StyleProfileSummary | null> {
  const sql = getSql();
  const rows = await sql<
    {
      profile_text: string;
      dimensions: Record<string, number>;
      signals: Array<{ tag: string; strength: number }>;
    }[]
  >`
    SELECT profile_text, dimensions, signals
    FROM style_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    profileText: r.profile_text,
    dimensions: r.dimensions,
    signals: r.signals,
  };
}

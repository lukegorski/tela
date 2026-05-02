import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

/**
 * Get the Drizzle database client.
 * Lazily initialized on first call using DATABASE_URL from environment.
 */
export function getDb() {
  if (_db) return _db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Supabase's transaction-mode pooler (port 6543, host *.pooler.supabase.com)
  // is incompatible with prepared statements: pgbouncer rebinds each query
  // to a different backend connection, so the prepared statement set up on
  // one connection isn't visible on the next, leading to silent transaction
  // rollbacks under parallel load. Disable prepared statements when we
  // detect we're going through the pooler. Direct connections (port 5432)
  // keep prepared statements on for the small perf win.
  const isPgBouncer = /pooler|:6543/.test(databaseUrl);

  _sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: !isPgBouncer,
  });

  _db = drizzle(_sql, { schema });
  return _db;
}

export type Database = ReturnType<typeof getDb>;

/**
 * Close the database connection pool.
 * Call this during graceful shutdown.
 */
export async function closeDb() {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
  }
}

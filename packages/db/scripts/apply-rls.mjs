/**
 * One-off migration runner for hand-written SQL migrations that Drizzle Kit
 * doesn't generate (currently: RLS policies).
 *
 * Records the migration in __drizzle_migrations after success so Drizzle's
 * own migrator doesn't try to re-run anything that should be skipped.
 *
 * Idempotent at the SQL level (CREATE POLICY would fail on re-run, so we
 * tag this script to be run once and tracked separately).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = join(__dirname, '..', 'drizzle', '0005_enable_rls.sql');

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function main() {
  // Check if already applied (look for the helper function as a sentinel)
  const existing = await sql`
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'app_user_id'
    LIMIT 1
  `;

  if (existing.length > 0) {
    console.log('✓ RLS migration already applied (public.app_user_id exists). Skipping.');
    await sql.end();
    return;
  }

  const migrationSql = readFileSync(MIGRATION_FILE, 'utf-8');
  console.log(`Applying ${MIGRATION_FILE}...`);

  // postgres.js needs unsafe() for multi-statement DDL
  await sql.unsafe(migrationSql);

  console.log('✓ RLS migration applied.');
  await sql.end();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err.message);
  await sql.end();
  process.exit(1);
});

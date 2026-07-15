/**
 * Apply the out-of-journal manual_*.sql migrations in order, each guarded by
 * a sentinel so re-runs are safe (mirrors apply-rls.mjs, which this supersedes
 * for environment standup — apply-rls covers manual_001 only).
 *
 * Refuses to run against the production project (dev-environment split rule).
 *
 * Run: doppler run --project tela --config dev -- node packages/db/scripts/apply-manual.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const PROD_REF = 'cyupcwfvtbfkupbdcoql';
for (const v of ['SUPABASE_URL', 'DATABASE_URL']) {
  const val = process.env[v] ?? '';
  if (!val) { console.error(`assert-not-prod: ${v} is empty — run via doppler`); process.exit(1); }
  if (val.includes(PROD_REF)) { console.error(`assert-not-prod: ${v} points at PRODUCTION — refusing`); process.exit(1); }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(__dirname, '..', 'drizzle');

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

// file → SQL that returns >=1 row iff already applied
const MANUALS = [
  {
    file: 'manual_001_enable_rls.sql',
    applied: () => sql`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'app_user_id' LIMIT 1`,
  },
  {
    file: 'manual_002_grant_users_self_read.sql',
    applied: () => sql`SELECT 1 FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'features'
        AND grantee = 'authenticated' AND privilege_type = 'SELECT' LIMIT 1`,
  },
  {
    file: 'manual_003_rls_hardening.sql',
    applied: () => sql`SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls' LIMIT 1`,
  },
];

async function main() {
  for (const m of MANUALS) {
    const done = await m.applied();
    if (done.length > 0) {
      console.log(`✓ ${m.file} already applied — skipping`);
      continue;
    }
    const body = readFileSync(join(DRIZZLE_DIR, m.file), 'utf-8');
    console.log(`Applying ${m.file}…`);
    await sql.unsafe(body);
    console.log(`✓ ${m.file} applied`);
  }
  await sql.end();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err.message);
  await sql.end();
  process.exit(1);
});

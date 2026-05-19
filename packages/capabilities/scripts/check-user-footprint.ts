#!/usr/bin/env tsx
/**
 * One-off helper to report a user's database footprint before destructive
 * cleanup. Reads only — no writes. Used during Phase 11 multi-user
 * migration to confirm "skipped" users have no FK references that would
 * make a plain DELETE FROM users fail.
 *
 * Usage:
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/check-user-footprint.ts --email <email>
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@tela/db';

const args = process.argv.slice(2);
const emailIdx = args.indexOf('--email');
if (emailIdx === -1 || !args[emailIdx + 1]) {
  console.error('Usage: check-user-footprint.ts --email <email>');
  process.exit(2);
}
const email = args[emailIdx + 1].trim().toLowerCase();

const db = getDb();
const userRows = await db.execute(sql`
  SELECT id, auth_user_id, onboarding_complete, created_at
  FROM users WHERE lower(email) = ${email}
`);
if (userRows.length === 0) {
  console.log(`No users row for ${email}.`);
  process.exit(0);
}
const userId = userRows[0].id as string;
console.log(`User: ${email}`);
console.log(`  app users.id     = ${userId}`);
console.log(`  auth_user_id     = ${userRows[0].auth_user_id}`);
console.log(`  onboarded        = ${userRows[0].onboarding_complete}`);
console.log(`  created_at       = ${userRows[0].created_at}`);
console.log('');
console.log('FK-referencing rows (sorted alphabetically):');

const checks: Array<{ table: string; q: ReturnType<typeof sql> }> = [
  { table: 'chat_conversations', q: sql`SELECT count(*)::int AS c FROM chat_conversations WHERE user_id = ${userId}` },
  { table: 'closet_items',       q: sql`SELECT count(*)::int AS c FROM closet_items WHERE user_id = ${userId}` },
  { table: 'closets',            q: sql`SELECT count(*)::int AS c FROM closets WHERE user_id = ${userId}` },
  { table: 'contexts',           q: sql`SELECT count(*)::int AS c FROM contexts WHERE user_id = ${userId}` },
  { table: 'generations',        q: sql`SELECT count(*)::int AS c FROM generations WHERE user_id = ${userId}` },
  { table: 'item_photos',        q: sql`SELECT count(*)::int AS c FROM item_photos WHERE user_id = ${userId}` },
  { table: 'migration_failures', q: sql`SELECT count(*)::int AS c FROM migration_failures WHERE user_id = ${userId}` },
  { table: 'migration_log',      q: sql`SELECT count(*)::int AS c FROM migration_log WHERE user_id = ${userId}` },
  { table: 'outfits',            q: sql`SELECT count(*)::int AS c FROM outfits WHERE user_id = ${userId}` },
  { table: 'try_on_jobs',        q: sql`SELECT count(*)::int AS c FROM try_on_jobs WHERE user_id = ${userId}` },
  { table: 'wardrobe_gaps',      q: sql`SELECT count(*)::int AS c FROM wardrobe_gaps WHERE user_id = ${userId}` },
];

let total = 0;
for (const { table, q } of checks) {
  try {
    const rows = await db.execute(q);
    const c = Number((rows[0] as Record<string, unknown>).c ?? 0);
    total += c;
    if (c > 0) {
      console.log(`  ${table.padEnd(22)} ${c}`);
    }
  } catch (err) {
    // Table may not exist depending on schema state — that's fine for a forensic check.
    console.log(`  ${table.padEnd(22)} (skip: ${err instanceof Error ? err.message : String(err)})`);
  }
}

if (total === 0) {
  console.log(`  (none)`);
  console.log('');
  console.log('SAFE to DELETE FROM users — no FK references.');
} else {
  console.log('');
  console.log(`Total related rows: ${total} — DELETE FROM users will FAIL on FK constraint until these are removed.`);
}
process.exit(0);

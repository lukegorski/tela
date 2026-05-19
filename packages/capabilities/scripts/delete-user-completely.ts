#!/usr/bin/env tsx
/**
 * Completely remove a user from the new Tela platform:
 *   - All data rows (closet_items, outfits, try-ons, chat, migration log, etc.)
 *   - Supabase Storage blobs under item-photos/{userId}/ and try-on-results/{userId}/
 *   - The app `users` row
 *   - The Supabase auth.users row
 *
 * Legacy Firebase is NEVER touched (per the READ-ONLY rule).
 *
 * Use for: rolling back a migration that shouldn't have happened, deleting
 * test users, or removing users who shouldn't have an account in the
 * post-cutover platform.
 *
 * Usage:
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/delete-user-completely.ts --email <email> [--yes]
 *
 *   --yes   Skip the confirmation prompt.
 *   --dry-run  Preview deletions without performing them.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { sql } from 'drizzle-orm';
import { getDb } from '@tela/db';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET, TRY_ON_BUCKET } from '../src/storage/supabase.js';

const args = process.argv.slice(2);
function getFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}
function hasFlag(name: string): boolean {
  return args.includes(name);
}

const email = getFlag('--email')?.trim().toLowerCase();
const skipConfirm = hasFlag('--yes') || hasFlag('-y');
const dryRun = hasFlag('--dry-run');

if (!email) {
  console.error('Usage: delete-user-completely.ts --email <email> [--yes] [--dry-run]');
  process.exit(2);
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function listStorageObjects(bucket: string, prefix: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const out: string[] = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit, offset });
    if (error) {
      // If the prefix doesn't exist, list returns []; surface other errors.
      console.warn(`  [warn] storage.list(${bucket}/${prefix}): ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    for (const f of data) {
      if (f.name) out.push(`${prefix}/${f.name}`);
    }
    if (data.length < limit) break;
    offset += data.length;
  }
  return out;
}

// ─── Resolve user ───
const db = getDb();
const userRows = await db.execute(sql`SELECT id, auth_user_id FROM users WHERE lower(email) = ${email}`);
if (userRows.length === 0) {
  console.log(`No users row for ${email}.`);

  // Best-effort: see if there's an orphan auth user we should still nuke.
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const orphan = data?.users.find((u) => (u.email ?? '').toLowerCase() === email);
  if (orphan) {
    console.log(`Found orphan auth.users row: ${orphan.id} (no app users row). Would delete.`);
    if (!dryRun) {
      if (!skipConfirm) {
        const ok = await confirm(`Delete orphan auth row for ${email}? [yN]: `);
        if (!ok) {
          console.log('Aborted.');
          process.exit(0);
        }
      }
      const { error } = await supabase.auth.admin.deleteUser(orphan.id);
      if (error) {
        console.error(`auth.admin.deleteUser failed: ${error.message}`);
        process.exit(1);
      }
      console.log(`✓ Deleted orphan auth row ${orphan.id}.`);
    }
  } else {
    console.log('No orphan auth row either. Nothing to do.');
  }
  process.exit(0);
}

const userId = userRows[0].id as string;
const authUserId = userRows[0].auth_user_id as string | null;
console.log(`Target user: ${email}`);
console.log(`  app users.id  = ${userId}`);
console.log(`  auth_user_id  = ${authUserId ?? '(null)'}`);
console.log('');

// ─── Inventory rows + storage ───
const tables: Array<{ table: string; q: ReturnType<typeof sql> }> = [
  { table: 'try_on_jobs',        q: sql`SELECT count(*)::int AS c FROM try_on_jobs WHERE user_id = ${userId}` },
  { table: 'outfit_items',       q: sql`SELECT count(*)::int AS c FROM outfit_items oi JOIN outfits o ON oi.outfit_id = o.id WHERE o.user_id = ${userId}` },
  { table: 'outfits',            q: sql`SELECT count(*)::int AS c FROM outfits WHERE user_id = ${userId}` },
  { table: 'chat_messages',      q: sql`SELECT count(*)::int AS c FROM chat_messages cm JOIN chat_conversations cc ON cm.conversation_id = cc.id WHERE cc.user_id = ${userId}` },
  { table: 'chat_conversations', q: sql`SELECT count(*)::int AS c FROM chat_conversations WHERE user_id = ${userId}` },
  { table: 'closet_items',       q: sql`SELECT count(*)::int AS c FROM closet_items WHERE user_id = ${userId}` },
  { table: 'item_photos',        q: sql`SELECT count(*)::int AS c FROM item_photos WHERE user_id = ${userId}` },
  { table: 'closets',            q: sql`SELECT count(*)::int AS c FROM closets WHERE user_id = ${userId}` },
  { table: 'contexts',           q: sql`SELECT count(*)::int AS c FROM contexts WHERE user_id = ${userId}` },
  { table: 'generations',        q: sql`SELECT count(*)::int AS c FROM generations WHERE user_id = ${userId}` },
  { table: 'wardrobe_gaps',      q: sql`SELECT count(*)::int AS c FROM wardrobe_gaps WHERE user_id = ${userId}` },
  { table: 'migration_failures', q: sql`SELECT count(*)::int AS c FROM migration_failures WHERE user_id = ${userId}` },
  { table: 'migration_log',      q: sql`SELECT count(*)::int AS c FROM migration_log WHERE user_id = ${userId}` },
];

console.log('Will delete (in FK-safe order):');
for (const { table, q } of tables) {
  try {
    const rows = await db.execute(q);
    const c = Number((rows[0] as Record<string, unknown>).c ?? 0);
    if (c > 0) console.log(`  ${table.padEnd(22)} ${c} row(s)`);
  } catch (err) {
    console.log(`  ${table.padEnd(22)} (skip: ${err instanceof Error ? err.message : String(err)})`);
  }
}
console.log(`  ${'users'.padEnd(22)} 1 row`);

// Storage inventory
const itemPhotos = await listStorageObjects(ITEM_PHOTOS_BUCKET, userId);
const tryOnObjs = await listStorageObjects(TRY_ON_BUCKET, userId);
console.log('');
console.log('Storage:');
console.log(`  ${ITEM_PHOTOS_BUCKET}/${userId}/  ${itemPhotos.length} object(s)`);
console.log(`  ${TRY_ON_BUCKET}/${userId}/  ${tryOnObjs.length} object(s)`);

console.log('');
console.log('Auth:');
console.log(`  auth.users id=${authUserId ?? '(null)'} will be deleted via supabase.auth.admin.deleteUser`);

if (dryRun) {
  console.log('\n[dry-run] No deletions performed.');
  process.exit(0);
}

if (!skipConfirm) {
  console.log('');
  const ok = await confirm(`Proceed with FULL deletion of ${email}? [yN]: `);
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }
}

// ─── Delete: child rows first (FK order), then user, then auth, then storage ───
console.log('\n[delete] starting...');

// Order matters. References must be removed before their targets.
// Notes:
//   - migration_log + migration_failures reference users.id only.
//   - outfit_items references outfits.id; outfits references users.id.
//   - chat_messages references chat_conversations.id; chat_conversations references users.id.
//   - closet_items references item_photos.id + closets.id + users.id.
//   - try_on_jobs references outfits.id + users.id.
//   - item_photos references users.id (photos belong to a user, not a closet).
//   - contexts + generations reference users.id and are referenced by outfits → delete after outfits.

const stmts: Array<{ label: string; q: ReturnType<typeof sql> }> = [
  { label: 'try_on_jobs',        q: sql`DELETE FROM try_on_jobs WHERE user_id = ${userId}` },
  { label: 'outfit_items',       q: sql`DELETE FROM outfit_items WHERE outfit_id IN (SELECT id FROM outfits WHERE user_id = ${userId})` },
  { label: 'outfits',            q: sql`DELETE FROM outfits WHERE user_id = ${userId}` },
  { label: 'chat_messages',      q: sql`DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ${userId})` },
  { label: 'chat_conversations', q: sql`DELETE FROM chat_conversations WHERE user_id = ${userId}` },
  { label: 'closet_items',       q: sql`DELETE FROM closet_items WHERE user_id = ${userId}` },
  { label: 'item_photos',        q: sql`DELETE FROM item_photos WHERE user_id = ${userId}` },
  { label: 'closets',            q: sql`DELETE FROM closets WHERE user_id = ${userId}` },
  { label: 'contexts',           q: sql`DELETE FROM contexts WHERE user_id = ${userId}` },
  { label: 'generations',        q: sql`DELETE FROM generations WHERE user_id = ${userId}` },
  { label: 'wardrobe_gaps',      q: sql`DELETE FROM wardrobe_gaps WHERE user_id = ${userId}` },
  { label: 'migration_failures', q: sql`DELETE FROM migration_failures WHERE user_id = ${userId}` },
  { label: 'migration_log',      q: sql`DELETE FROM migration_log WHERE user_id = ${userId}` },
];

for (const { label, q } of stmts) {
  try {
    const res = await db.execute(q);
    const rc = (res as unknown as { rowCount?: number }).rowCount ?? '?';
    console.log(`  ✓ DELETE ${label} (${rc} rows)`);
  } catch (err) {
    console.error(`  ✗ DELETE ${label} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

try {
  const res = await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  const rc = (res as unknown as { rowCount?: number }).rowCount ?? '?';
  console.log(`  ✓ DELETE users (${rc} rows)`);
} catch (err) {
  console.error(`  ✗ DELETE users failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

// Auth side
if (authUserId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(authUserId);
  if (error) {
    console.error(`  ✗ auth.admin.deleteUser(${authUserId}) failed: ${error.message}`);
  } else {
    console.log(`  ✓ DELETE auth.users id=${authUserId}`);
  }
}

// Storage
const supabase = getSupabaseAdmin();
if (itemPhotos.length > 0) {
  const { error } = await supabase.storage.from(ITEM_PHOTOS_BUCKET).remove(itemPhotos);
  if (error) {
    console.error(`  ✗ storage.remove(${ITEM_PHOTOS_BUCKET}): ${error.message}`);
  } else {
    console.log(`  ✓ DELETE ${ITEM_PHOTOS_BUCKET} (${itemPhotos.length} objects)`);
  }
}
if (tryOnObjs.length > 0) {
  const { error } = await supabase.storage.from(TRY_ON_BUCKET).remove(tryOnObjs);
  if (error) {
    console.error(`  ✗ storage.remove(${TRY_ON_BUCKET}): ${error.message}`);
  } else {
    console.log(`  ✓ DELETE ${TRY_ON_BUCKET} (${tryOnObjs.length} objects)`);
  }
}

console.log(`\n✓ User ${email} fully removed from new Tela platform.`);
console.log('  (Legacy Firebase Auth + Firestore untouched.)');
process.exit(0);

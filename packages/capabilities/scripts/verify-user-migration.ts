#!/usr/bin/env tsx
/**
 * Programmatic per-user migration verification (Phase 11 pivot from
 * magic-link UI walkthrough).
 *
 * For a given email, reports:
 *   - Legacy Firestore counts: wardrobe items, outfits, completed try-ons, chat messages
 *   - New Supabase counts:     closet_items, outfits, try_on_jobs (complete), chat_messages
 *   - Per-table delta
 *   - Foreign-key integrity:   every outfit has valid context_id + generation_id;
 *                              every outfit_item references an existing closet_item;
 *                              every try_on_job references an existing outfit
 *   - Signed-URL spot check:   5 random closet_items, HEAD each signed URL, count 2xx vs failures
 *
 * Exits 0 if all checks pass (counts match within expected bounds, FKs clean,
 * spot-checks 5/5). Exits 1 on any anomaly.
 *
 * Usage:
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/verify-user-migration.ts --email <email>
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@tela/db';
import { getLegacyDb, getLegacyAuth } from '../src/migration/firebase.js';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../src/storage/supabase.js';

const i = process.argv.indexOf('--email');
if (i === -1 || !process.argv[i + 1]) {
  console.error('Usage: verify-user-migration.ts --email <email>');
  process.exit(2);
}
const email = process.argv[i + 1].trim().toLowerCase();

// ─── Resolve identities ───
const legacyAuth = getLegacyAuth();
let legacyUid: string;
try {
  const u = await legacyAuth.getUserByEmail(email);
  legacyUid = u.uid;
} catch (err) {
  console.error(`No legacy Firebase Auth user for ${email}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const db = getDb();
const userRows = await db.execute(sql`SELECT id FROM users WHERE lower(email) = ${email}`);
if (userRows.length === 0) {
  console.error(`No app users row for ${email}. Pre-create + migrate first.`);
  process.exit(1);
}
const newUserId = userRows[0].id as string;

console.log(`\n══ Verification: ${email} ══`);
console.log(`  legacy uid:   ${legacyUid}`);
console.log(`  new user_id:  ${newUserId}\n`);

// ─── Legacy counts (Firestore) ───
const legacyDb = getLegacyDb();
const userRef = legacyDb.collection('users').doc(legacyUid);

const [itemsSnap, outfitsSnap, chatSnap] = await Promise.all([
  userRef.collection('wardrobeItems').get(),
  userRef.collection('outfits').get(),
  userRef.collection('chatMessages').get(),
]);

const legacyItemCount = itemsSnap.size;
const legacyOutfitCount = outfitsSnap.size;
const legacyChatCount = chatSnap.size;
let legacyCompletedTryOnCount = 0;
let legacyHeicCandidates = 0;
for (const doc of outfitsSnap.docs) {
  const data = doc.data() as { tryOnStatus?: string };
  if (data.tryOnStatus === 'completed') legacyCompletedTryOnCount += 1;
}

// ─── New counts (Supabase) ───
type CountRow = { c: number };
const [newItems, newPhotos, newOutfits, newOutfitItems, newTryOns, newCompletedTryOns, newConvos, newMsgs] = await Promise.all([
  db.execute(sql`SELECT count(*)::int AS c FROM closet_items WHERE user_id = ${newUserId}`),
  db.execute(sql`SELECT count(*)::int AS c FROM item_photos WHERE user_id = ${newUserId}`),
  db.execute(sql`SELECT count(*)::int AS c FROM outfits WHERE user_id = ${newUserId}`),
  db.execute(sql`SELECT count(*)::int AS c FROM outfit_items oi JOIN outfits o ON oi.outfit_id = o.id WHERE o.user_id = ${newUserId}`),
  db.execute(sql`SELECT count(*)::int AS c FROM try_on_jobs WHERE user_id = ${newUserId}`),
  db.execute(sql`SELECT count(*)::int AS c FROM try_on_jobs WHERE user_id = ${newUserId} AND status = 'complete'`),
  db.execute(sql`SELECT count(*)::int AS c FROM chat_conversations WHERE user_id = ${newUserId}`),
  db.execute(sql`SELECT count(*)::int AS c FROM chat_messages cm JOIN chat_conversations cc ON cm.conversation_id = cc.id WHERE cc.user_id = ${newUserId}`),
]);

const n = (r: unknown): number => Number((r as CountRow[])[0]?.c ?? 0);

// ─── Failures from migration_failures table ───
// migration_failures is APPEND-ONLY across retries (per Phase 11 M1 spec).
// So an entity that failed initially but later succeeded shows up here AND
// in migration_log. For verification, we only care about entities that are
// STILL not in the log — those are the real misses.
const allFailures = await db.execute(sql`
  SELECT legacy_entity_type, legacy_id, reason, attempt_at
  FROM migration_failures
  WHERE user_id = ${newUserId}
  ORDER BY attempt_at DESC
`);
const stillFailingRows = await db.execute(sql`
  SELECT DISTINCT ON (mf.legacy_entity_type, mf.legacy_id)
         mf.legacy_entity_type, mf.legacy_id, mf.reason, mf.attempt_at
  FROM migration_failures mf
  WHERE mf.user_id = ${newUserId}
    AND NOT EXISTS (
      SELECT 1 FROM migration_log ml
      WHERE ml.user_id = mf.user_id
        AND ml.legacy_entity_type = mf.legacy_entity_type
        AND ml.legacy_id = mf.legacy_id
    )
  ORDER BY mf.legacy_entity_type, mf.legacy_id, mf.attempt_at DESC
`);

// ─── FK integrity ───
const orphanOutfits = await db.execute(sql`
  SELECT o.id FROM outfits o
  WHERE o.user_id = ${newUserId}
    AND (
      NOT EXISTS (SELECT 1 FROM contexts c WHERE c.id = o.context_id)
      OR NOT EXISTS (SELECT 1 FROM generations g WHERE g.id = o.generation_id)
    )
`);
const orphanOutfitItems = await db.execute(sql`
  SELECT oi.id FROM outfit_items oi
  JOIN outfits o ON oi.outfit_id = o.id
  WHERE o.user_id = ${newUserId}
    AND NOT EXISTS (SELECT 1 FROM closet_items ci WHERE ci.id = oi.closet_item_id)
`);
const orphanTryOns = await db.execute(sql`
  SELECT toj.id FROM try_on_jobs toj
  WHERE toj.user_id = ${newUserId}
    AND NOT EXISTS (SELECT 1 FROM outfits o WHERE o.id = toj.outfit_id)
`);

// ─── Signed URL spot-check (5 random closet_items) ───
const sampleItems = await db.execute(sql`
  SELECT ci.id, ip.storage_path
  FROM closet_items ci
  JOIN item_photos ip ON ip.id = ci.photo_id
  WHERE ci.user_id = ${newUserId}
  ORDER BY random()
  LIMIT 5
`);
const supabase = getSupabaseAdmin();
let urlOk = 0;
let urlFail = 0;
const urlFailDetails: Array<{ path: string; status: number | string }> = [];
for (const row of sampleItems as Array<{ id: string; storage_path: string }>) {
  const { data: signed, error: signErr } = await supabase.storage
    .from(ITEM_PHOTOS_BUCKET)
    .createSignedUrl(row.storage_path, 60);
  if (signErr || !signed?.signedUrl) {
    urlFail += 1;
    urlFailDetails.push({ path: row.storage_path, status: `sign-err: ${signErr?.message ?? 'no url'}` });
    continue;
  }
  try {
    const res = await fetch(signed.signedUrl, { method: 'HEAD' });
    if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
      urlOk += 1;
    } else {
      urlFail += 1;
      urlFailDetails.push({ path: row.storage_path, status: res.status });
    }
  } catch (err) {
    urlFail += 1;
    urlFailDetails.push({ path: row.storage_path, status: `fetch-err: ${err instanceof Error ? err.message : String(err)}` });
  }
}

// ─── Print report ───
type Row = { label: string; legacy: number; new: number; note?: string };
const rows: Row[] = [
  { label: 'wardrobe items', legacy: legacyItemCount, new: n(newItems) },
  { label: 'item_photos', legacy: legacyItemCount, new: n(newPhotos), note: 'one photo per item' },
  { label: 'outfits', legacy: legacyOutfitCount, new: n(newOutfits) },
  { label: 'outfit_items', legacy: 0, new: n(newOutfitItems), note: 'compare to legacy outfit.items[] sum (not tracked here)' },
  { label: 'completed try-ons', legacy: legacyCompletedTryOnCount, new: n(newCompletedTryOns) },
  { label: 'try_on_jobs (any status)', legacy: 0, new: n(newTryOns) },
  { label: 'chat conversations', legacy: legacyChatCount > 0 ? 1 : 0, new: n(newConvos), note: '1 convo per user if any messages' },
  { label: 'chat messages', legacy: legacyChatCount, new: n(newMsgs) },
];

// Categories that are inherently un-comparable (legacy count not tracked at
// this entity-level granularity). These columns always report delta=0
// against legacy=0 — informational only.
const informational = new Set(['outfit_items', 'try_on_jobs (any status)']);

console.log('Counts (legacy → new):');
console.log(`  ${'category'.padEnd(28)}  legacy  →  new   delta   note`);
let negativeDelta = false;
const positiveDeltaCategories: string[] = [];
for (const r of rows) {
  const delta = r.new - r.legacy;
  const deltaStr = delta === 0 ? '   0' : (delta > 0 ? `+${delta}`.padStart(4) : `${delta}`.padStart(4));
  if (!informational.has(r.label) && r.legacy > 0 && delta < 0) {
    // New count is LESS than legacy → data loss. Always a fail signal.
    negativeDelta = true;
  } else if (!informational.has(r.label) && delta > 0 && r.legacy >= 0) {
    // New > legacy → user added data in new app since migration. Not a fail
    // but worth surfacing so an operator can sanity-check.
    positiveDeltaCategories.push(`${r.label} +${delta}`);
  }
  console.log(`  ${r.label.padEnd(28)}  ${String(r.legacy).padStart(5)}  →  ${String(r.new).padStart(4)}  ${deltaStr}    ${r.note ?? ''}`);
}
if (positiveDeltaCategories.length > 0) {
  console.log(`\n  Note: positive deltas (new > legacy) usually mean the user has been actively`);
  console.log(`        using the new app since migration. Not a failure signal.`);
  console.log(`        Categories with positive deltas: ${positiveDeltaCategories.join(', ')}`);
}

console.log(`\nMigration failures: ${stillFailingRows.length} still-failing (of ${allFailures.length} historical attempts):`);
if (stillFailingRows.length === 0 && allFailures.length > 0) {
  console.log(`  (all ${allFailures.length} historical failures eventually succeeded — entities present in migration_log)`);
} else if (stillFailingRows.length === 0) {
  console.log('  (none)');
} else {
  for (const f of stillFailingRows.slice(0, 20) as Array<{ legacy_entity_type: string; legacy_id: string; reason: string }>) {
    console.log(`  - ${f.legacy_entity_type} ${f.legacy_id}: ${f.reason.split('\n')[0].slice(0, 200)}`);
  }
}

console.log('\nForeign-key integrity:');
console.log(`  outfits with bad context/generation FK:   ${orphanOutfits.length}`);
console.log(`  outfit_items with bad closet_item FK:     ${orphanOutfitItems.length}`);
console.log(`  try_on_jobs with bad outfit FK:           ${orphanTryOns.length}`);

console.log('\nSigned URL spot-check (5 random items):');
console.log(`  ${urlOk}/${urlOk + urlFail} returned image/* (0 expected failures)`);
if (urlFail > 0) {
  for (const f of urlFailDetails) {
    console.log(`    ✗ ${f.path}: ${f.status}`);
  }
}

// ─── Verdict ───
const fkFail = orphanOutfits.length + orphanOutfitItems.length + orphanTryOns.length > 0;
const urlFailed = urlFail > 0 && sampleItems.length > 0;

console.log('\n─── Verdict ───');
const issues: string[] = [];
if (negativeDelta) issues.push('NEGATIVE count delta — data loss vs legacy');
if (stillFailingRows.length > 0) issues.push(`${stillFailingRows.length} entities still failing (never made it into migration_log)`);
if (fkFail) issues.push('FK orphans');
if (urlFailed) issues.push('signed URL failures');

if (issues.length === 0) {
  console.log(`✓ PASS for ${email}`);
  process.exit(0);
} else {
  console.log(`✗ FAIL for ${email}: ${issues.join('; ')}`);
  process.exit(1);
}

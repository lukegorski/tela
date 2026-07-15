#!/usr/bin/env node
/**
 * Clone one user's closet (rows + storage objects) from PRODUCTION into a
 * NON-PROD environment, for realistic dev data (dev-environment split, Phase 3).
 *
 * - Source (prod): PROD_DATABASE_URL / PROD_SUPABASE_URL / PROD_SUPABASE_SECRET_KEY
 *   env vars. The SQL session is forced read-only (`SET default_transaction_read_only`),
 *   and storage access is download-only.
 * - Target (dev): the regular doppler-injected DATABASE_URL / SUPABASE_URL /
 *   SUPABASE_SECRET_KEY. Refuses to run if the target is the prod project.
 * - Row ids are preserved (users, closets, item_photos, closet_items), so FKs
 *   and storage paths stay valid verbatim. Only the users row is rewritten:
 *   email → CLONE_EMAIL, auth_user_id → a freshly created dev auth user.
 * - Idempotent: ON CONFLICT DO NOTHING on rows, upsert on storage objects,
 *   auth user reused if it already exists.
 *
 * Run (values resolved inline, never printed):
 *   PROD_DATABASE_URL=$(doppler secrets get DATABASE_URL -p tela -c prd --plain) \
 *   PROD_SUPABASE_URL=$(doppler secrets get SUPABASE_URL -p tela -c prd --plain) \
 *   PROD_SUPABASE_SECRET_KEY=$(doppler secrets get SUPABASE_SECRET_KEY -p tela -c prd --plain) \
 *   doppler run -p tela -c dev -- node packages/capabilities/scripts/clone-closet-to-dev.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireCaps = createRequire(join(__dirname, '_resolve.cjs'));
const requireDb = createRequire(join(__dirname, '..', '..', 'db', 'scripts', '_resolve.cjs'));
const { createClient } = requireCaps('@supabase/supabase-js');
const postgres = requireDb('postgres');

const PROD_REF = 'cyupcwfvtbfkupbdcoql';
const SOURCE_EMAIL = process.env.CLONE_SOURCE_EMAIL ?? 'luke@lukegorski.com';
const CLONE_EMAIL = process.env.CLONE_EMAIL ?? 'luke@tela.test';
const BUCKET = 'item-photos';

// ── guards ──
const tgt = { db: process.env.DATABASE_URL ?? '', url: process.env.SUPABASE_URL ?? '', key: process.env.SUPABASE_SECRET_KEY ?? '' };
const src = { db: process.env.PROD_DATABASE_URL ?? '', url: process.env.PROD_SUPABASE_URL ?? '', key: process.env.PROD_SUPABASE_SECRET_KEY ?? '' };
if (!tgt.db || !tgt.url || !tgt.key) { console.error('target env missing — run via doppler dev'); process.exit(1); }
if (!src.db || !src.url || !src.key) { console.error('PROD_* source env missing'); process.exit(1); }
if (tgt.db.includes(PROD_REF) || tgt.url.includes(PROD_REF)) { console.error('assert-not-prod: TARGET is production — refusing'); process.exit(1); }
if (!src.db.includes(PROD_REF) || !src.url.includes(PROD_REF)) { console.error('source is not production — wrong env wiring, refusing'); process.exit(1); }

const srcSql = postgres(src.db, { max: 1, prepare: false });
const tgtSql = postgres(tgt.db, { max: 1, prepare: false });
const srcStore = createClient(src.url, src.key, { auth: { autoRefreshToken: false, persistSession: false } });
const tgtSupa = createClient(tgt.url, tgt.key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  await srcSql`SET default_transaction_read_only = on`; // hard read-only on prod

  const [srcUser] = await srcSql`SELECT * FROM users WHERE email = ${SOURCE_EMAIL}`;
  if (!srcUser) throw new Error(`source user ${SOURCE_EMAIL} not found`);
  console.log(`source user found (id ${srcUser.id})`);

  // ── dev auth user (password auth, pre-confirmed → no SMTP dependency) ──
  let authUserId = null;
  let password = null;
  const { data: existing } = await tgtSupa.auth.admin.listUsers({ perPage: 200 });
  const found = existing?.users?.find((u) => u.email === CLONE_EMAIL);
  if (found) {
    authUserId = found.id;
    console.log(`dev auth user ${CLONE_EMAIL} already exists — reusing`);
  } else {
    password = `tela-dev-${randomBytes(6).toString('hex')}`;
    const { data, error } = await tgtSupa.auth.admin.createUser({
      email: CLONE_EMAIL,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    authUserId = data.user.id;
    console.log(`created dev auth user ${CLONE_EMAIL}`);
  }

  // ── users row: same id, rewritten email + auth link ──
  const userRow = { ...srcUser, email: CLONE_EMAIL, auth_user_id: authUserId };
  await tgtSql`INSERT INTO users ${tgtSql(userRow)} ON CONFLICT (id) DO NOTHING`;

  // ── closets / item_photos / closet_items — ids preserved ──
  const closets = await srcSql`SELECT * FROM closets WHERE user_id = ${srcUser.id}`;
  for (const r of closets) await tgtSql`INSERT INTO closets ${tgtSql(r)} ON CONFLICT (id) DO NOTHING`;
  const photos = await srcSql`SELECT * FROM item_photos WHERE user_id = ${srcUser.id}`;
  for (const r of photos) await tgtSql`INSERT INTO item_photos ${tgtSql(r)} ON CONFLICT (id) DO NOTHING`;
  const items = await srcSql`SELECT * FROM closet_items WHERE user_id = ${srcUser.id}`;
  for (const r of items) await tgtSql`INSERT INTO closet_items ${tgtSql(r)} ON CONFLICT (id) DO NOTHING`;
  console.log(`rows: ${closets.length} closets, ${photos.length} photos, ${items.length} items`);

  // ── storage objects: every referenced path, prod → dev, same bucket/path ──
  const paths = new Set();
  for (const p of photos) {
    for (const c of [p.storage_path, p.enhanced_storage_path, p.cutout_storage_path]) {
      if (c) paths.add(c);
    }
  }
  let copied = 0, missing = 0;
  for (const path of paths) {
    const { data: blob, error: dlErr } = await srcStore.storage.from(BUCKET).download(path);
    if (dlErr || !blob) { console.warn(`  missing on prod: ${path} (${dlErr?.message ?? 'no data'})`); missing++; continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const { error: upErr } = await tgtSupa.storage.from(BUCKET).upload(path, buf, {
      contentType: blob.type || 'application/octet-stream',
      upsert: true,
    });
    if (upErr) throw new Error(`upload ${path}: ${upErr.message}`);
    copied++;
  }
  console.log(`storage: ${copied} copied (upsert), ${missing} missing on prod`);

  if (password) {
    console.log(`\n== DEV TEST CREDENTIALS (dev-only user, safe to note down) ==`);
    console.log(`   ${CLONE_EMAIL}  /  ${password}`);
  }
  console.log('✅ clone complete');
}

main()
  .catch((err) => { console.error('❌ clone failed:', err.message); process.exitCode = 1; })
  .finally(async () => { await srcSql.end(); await tgtSql.end(); });

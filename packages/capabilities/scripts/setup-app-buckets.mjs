#!/usr/bin/env node
/**
 * Create the app's private storage buckets (`item-photos`, `try-on-results`)
 * with settings mirroring production (inventoried 2026-07-14, dev-split Phase 0).
 * The public `models` bucket has its own script (setup-models-bucket.mjs).
 *
 * Idempotent — skips buckets that already exist. Refuses to run against the
 * production project.
 *
 *   doppler run --project tela --config dev -- \
 *     node packages/capabilities/scripts/setup-app-buckets.mjs
 */
import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'cyupcwfvtbfkupbdcoql';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY required (run via doppler)');
  process.exit(1);
}
if (url.includes(PROD_REF) || (process.env.DATABASE_URL ?? '').includes(PROD_REF)) {
  console.error('assert-not-prod: refusing to run against PRODUCTION');
  process.exit(1);
}

// Mirrors prod storage.buckets rows exactly (public flag, size limit, mime allowlist)
const BUCKETS = [
  {
    name: 'item-photos',
    options: {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    },
  },
  {
    name: 'try-on-results',
    options: { public: false, fileSizeLimit: 10 * 1024 * 1024 },
  },
];

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: listErr } = await supabase.storage.listBuckets();
if (listErr) {
  console.error('listBuckets failed:', listErr.message);
  process.exit(1);
}

for (const b of BUCKETS) {
  if (existing?.some((e) => e.name === b.name)) {
    console.log(`✓ bucket "${b.name}" already exists — skipping`);
    continue;
  }
  const { error } = await supabase.storage.createBucket(b.name, b.options);
  if (error) {
    console.error(`createBucket ${b.name} failed:`, error.message);
    process.exit(1);
  }
  console.log(`✓ created bucket "${b.name}"`);
}
console.log('Done.');

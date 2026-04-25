#!/usr/bin/env node
/**
 * One-off setup: create the public `models` bucket in Supabase Storage and
 * upload the built-in try-on model images (man.jpg, woman.jpg) so Fashn can
 * fetch them.
 *
 * Idempotent — safe to re-run. Reads SUPABASE_URL + SUPABASE_SECRET_KEY from
 * env (provide via doppler).
 *
 *   ~/bin/doppler run --project tela --config dev -- \
 *     node packages/capabilities/scripts/setup-models-bucket.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/ is at packages/capabilities/scripts/ — go up 3 to repo root
const REPO_ROOT = join(__dirname, '..', '..', '..');

const BUCKET = 'models';
const SOURCES = [
  { file: 'man.jpg', contentType: 'image/jpeg' },
  { file: 'woman.jpg', contentType: 'image/jpeg' },
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY required (run via doppler)');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
if (listErr) {
  console.error('listBuckets failed:', listErr.message);
  process.exit(1);
}

if (!buckets?.some((b) => b.name === BUCKET)) {
  console.log(`Creating public bucket "${BUCKET}"…`);
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (createErr) {
    console.error('createBucket failed:', createErr.message);
    process.exit(1);
  }
} else {
  console.log(`Bucket "${BUCKET}" already exists`);
}

for (const { file, contentType } of SOURCES) {
  const path = join(REPO_ROOT, 'apps/web/public/models', file);
  const buffer = await readFile(path);
  console.log(`Uploading ${file} (${buffer.length} bytes)…`);
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(file, buffer, {
      contentType,
      cacheControl: '31536000',
      upsert: true,
    });
  if (uploadErr) {
    console.error(`upload ${file} failed:`, uploadErr.message);
    process.exit(1);
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(file);
  console.log(`  → ${data.publicUrl}`);
}

console.log('Done.');

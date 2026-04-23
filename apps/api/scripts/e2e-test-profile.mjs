/**
 * Week 3 end-to-end test: build a wardrobe, then run closet read.
 *
 * Usage:
 *   doppler run -- node scripts/e2e-test-profile.mjs <image-dir>
 *
 * Uploads up to 8 images from <image-dir>, analyzes each via item.analyze,
 * saves them to the closet, then runs profile.closetRead and prints the
 * generated style profile.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const imageDir = process.argv[2];
if (!imageDir) {
  console.error('Usage: doppler run -- node scripts/e2e-test-profile.mjs <image-dir>');
  process.exit(1);
}

const API_BASE = process.env.API_BASE ?? 'http://localhost:3001';
const MAX_ITEMS = 8;

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function trpc(procedure, input) {
  const res = await fetch(`${API_BASE}/trpc/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${procedure}: ${data.error.message}`);
  return data.result.data;
}

async function uploadAndAnalyze(userId, imagePath) {
  const filename = basename(imagePath);
  const upload = await trpc('wardrobe.requestPhotoUpload', {
    userId,
    filename,
    mimeType: 'image/jpeg',
  });

  const fileBuffer = readFileSync(imagePath);
  const uploadRes = await supabase.storage
    .from('item-photos')
    .uploadToSignedUrl(upload.storagePath, upload.token, fileBuffer, {
      contentType: 'image/jpeg',
    });
  if (uploadRes.error) throw new Error(`Upload failed: ${uploadRes.error.message}`);

  const confirmed = await trpc('wardrobe.confirmPhotoUpload', {
    userId,
    storagePath: upload.storagePath,
  });

  const analysis = await trpc('item.analyze', {
    userId,
    photoId: confirmed.photoId,
    locale: 'en',
  });

  const item = await trpc('wardrobe.addItem', {
    userId,
    photoId: confirmed.photoId,
    metadata: { ...analysis.metadata, analysisLocale: 'en' },
  });

  return { item, analysis, costCents: analysis.costCents };
}

async function main() {
  console.log(`\n→ Image directory: ${imageDir}`);
  console.log(`→ API: ${API_BASE}`);

  const allImages = readdirSync(imageDir)
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('_'))
    .map((f) => join(imageDir, f))
    .slice(0, MAX_ITEMS);

  console.log(`→ Loading ${allImages.length} images\n`);

  console.log('1. Creating test user...');
  const [user] = await sql`
    INSERT INTO users (email, display_name, locale)
    VALUES (${'profile-test-' + Date.now() + '@tela.test'}, ${'Profile Test'}, ${'en'})
    RETURNING id
  `;
  console.log(`   ✓ user_id: ${user.id}`);

  console.log(`\n2. Building wardrobe (${allImages.length} items)...`);
  let totalAnalysisCost = 0;
  for (let i = 0; i < allImages.length; i++) {
    const path = allImages[i];
    const { analysis, costCents } = await uploadAndAnalyze(user.id, path);
    totalAnalysisCost += costCents;
    console.log(
      `   ${i + 1}/${allImages.length} ${basename(path)} → ${analysis.metadata.category}/${analysis.metadata.subcategory ?? '—'} (${analysis.metadata.primaryColor})`,
    );
  }
  console.log(`   total analysis cost: ${totalAnalysisCost.toFixed(4)}¢`);

  console.log(`\n3. Running profile.closetRead...`);
  const profile = await trpc('profile.closetRead', {
    userId: user.id,
    locale: 'en',
    reason: 'initial_read',
  });
  console.log(`   ✓ profileId: ${profile.profileId}`);
  console.log(`   ✓ versionId: ${profile.versionId}`);
  console.log(`   ✓ items analyzed: ${profile.itemsAnalyzed}`);
  console.log(`   ✓ closet read cost: ${profile.totalCostCents.toFixed(4)}¢`);
  console.log('\n   Dimensions:');
  for (const [k, v] of Object.entries(profile.dimensions)) {
    console.log(`     ${k.padEnd(18)} ${v.toFixed(2)}`);
  }

  console.log('\n   ─── PROFILE TEXT ───\n');
  console.log(
    profile.profileText
      .split('\n')
      .map((l) => '   ' + l)
      .join('\n'),
  );

  console.log('\n4. Fetching profile via profile.get...');
  const fetched = await trpc('profile.get', { userId: user.id });
  console.log(`   ✓ retrieved profile, ${fetched.signals.length} signals`);
  if (fetched.signals.length > 0) {
    console.log('   Signals:');
    fetched.signals.slice(0, 5).forEach((s) => {
      console.log(`     ${s.tag.padEnd(28)} ${s.strength >= 0 ? '+' : ''}${s.strength}`);
    });
  }

  console.log('\n5. Verifying events + generation provenance...');
  const events = await sql`SELECT type FROM events WHERE user_id = ${user.id} ORDER BY timestamp ASC`;
  const generations = await sql`SELECT operation, model, cost_cents FROM generations WHERE user_id = ${user.id} ORDER BY created_at`;
  console.log(`   ✓ ${events.length} events recorded`);
  console.log(`   ✓ ${generations.length} AI generations recorded`);
  const totalAiCost = generations.reduce((s, g) => s + parseFloat(g.cost_cents), 0);
  console.log(`   ✓ total AI cost: ${totalAiCost.toFixed(4)}¢`);

  console.log('\n✅ Week 3 closet read flow complete.\n');
  await sql.end();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err.message);
  await sql.end();
  process.exit(1);
});

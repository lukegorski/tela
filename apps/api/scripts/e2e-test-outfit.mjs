/**
 * Week 4 end-to-end test: build wardrobe → closet read → context → generate outfits.
 *
 * Usage:
 *   API_BASE=... doppler run -- node scripts/e2e-test-outfit.mjs <image-dir>
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const imageDir = process.argv[2];
if (!imageDir) {
  console.error('Usage: doppler run -- node scripts/e2e-test-outfit.mjs <image-dir>');
  process.exit(1);
}

const API_BASE = process.env.API_BASE ?? 'http://localhost:3001';
const MAX_ITEMS = 10;

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
  let attempt = 0;
  while (true) {
    try {
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
      if (uploadRes.error) throw new Error(`Upload: ${uploadRes.error.message}`);
      const confirmed = await trpc('wardrobe.confirmPhotoUpload', {
        userId,
        storagePath: upload.storagePath,
      });
      const analysis = await trpc('item.analyze', {
        userId,
        photoId: confirmed.photoId,
        locale: 'en',
      });
      await trpc('wardrobe.addItem', {
        userId,
        photoId: confirmed.photoId,
        metadata: { ...analysis.metadata, analysisLocale: 'en' },
      });
      return analysis;
    } catch (err) {
      attempt++;
      if (attempt >= 3) throw err;
      console.log(`     retry ${attempt}/3: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function main() {
  console.log(`\n→ Image directory: ${imageDir}`);
  console.log(`→ API: ${API_BASE}\n`);

  const allImages = readdirSync(imageDir)
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('_'))
    .map((f) => join(imageDir, f))
    .slice(0, MAX_ITEMS);

  console.log('1. Creating test user...');
  const [user] = await sql`
    INSERT INTO users (email, display_name, locale)
    VALUES (${'outfit-test-' + Date.now() + '@tela.test'}, ${'Outfit Test'}, ${'en'})
    RETURNING id
  `;
  console.log(`   ✓ ${user.id}`);

  console.log(`\n2. Building wardrobe (${allImages.length} items)...`);
  for (let i = 0; i < allImages.length; i++) {
    const a = await uploadAndAnalyze(user.id, allImages[i]);
    console.log(`   ${i + 1}/${allImages.length} → ${a.metadata.category}/${a.metadata.subcategory ?? '—'} ${a.metadata.primaryColor}`);
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n3. profile.closetRead...`);
  const profile = await trpc('profile.closetRead', {
    userId: user.id,
    locale: 'en',
    reason: 'initial',
  });
  console.log(`   ✓ profileId: ${profile.profileId}`);
  console.log(`   ✓ cost: ${profile.totalCostCents.toFixed(4)}¢`);

  console.log(`\n4. context.assemble (work occasion)...`);
  const ctx = await trpc('context.assemble', {
    userId: user.id,
    occasion: 'work',
    location: { lat: 40.7128, lon: -74.006 },
    calendarContext: 'Standup at 10am, lunch with cofounder',
  });
  console.log(`   ✓ contextId: ${ctx.contextId}`);
  console.log(`   ✓ season: ${ctx.season}, time: ${ctx.timeOfDay}`);
  if (ctx.weather) {
    console.log(`   ✓ weather: ${ctx.weather.temperatureCelsius}°C, ${ctx.weather.condition} (${ctx.weather.location})`);
  } else {
    console.log(`   ✓ weather: not available (no OWM key)`);
  }

  console.log(`\n5. outfit.generate...`);
  const result = await trpc('outfit.generate', {
    userId: user.id,
    contextId: ctx.contextId,
    count: 3,
  });
  console.log(`   ✓ ${result.outfits.length} outfits saved (${result.duplicatesRejected} rejected)`);
  console.log(`   ✓ generation cost: ${result.costCents.toFixed(4)}¢`);

  for (let i = 0; i < result.outfits.length; i++) {
    const o = result.outfits[i];
    console.log(`\n   Outfit ${i + 1} (id=${o.outfitId.slice(0, 8)}…):`);
    console.log(`     items: ${o.items.length}`);
    o.items.forEach((it) => console.log(`       - ${it.role}`));
    console.log(`     rationale: ${o.rationale}`);
  }

  console.log(`\n6. outfit.list...`);
  const list = await trpc('outfit.list', { userId: user.id, limit: 10 });
  console.log(`   ✓ total: ${list.total}`);

  console.log(`\n7. outfit.save (save first outfit)...`);
  const saved = await trpc('outfit.save', {
    userId: user.id,
    outfitId: result.outfits[0].outfitId,
    saved: true,
  });
  console.log(`   ✓ saved: ${saved.saved}`);

  console.log(`\n8. Try generating again (should dedupe)...`);
  const second = await trpc('outfit.generate', {
    userId: user.id,
    contextId: ctx.contextId,
    count: 3,
  });
  console.log(`   ✓ ${second.outfits.length} new outfits, ${second.duplicatesRejected} rejected by dedup`);

  console.log(`\n9. Event + generation provenance...`);
  const events = await sql`SELECT type, COUNT(*) as n FROM events WHERE user_id = ${user.id} GROUP BY type ORDER BY n DESC`;
  console.log(`   Events:`);
  events.forEach((e) => console.log(`     ${e.type.padEnd(35)} ${e.n}`));
  const totalCost = await sql`SELECT SUM(cost_cents) as c FROM generations WHERE user_id = ${user.id}`;
  console.log(`   Total AI spend for this user: ${parseFloat(totalCost[0].c).toFixed(4)}¢`);

  console.log('\n✅ Week 4 outfit generation flow complete.\n');
  await sql.end();
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err.message);
  await sql.end();
  process.exit(1);
});

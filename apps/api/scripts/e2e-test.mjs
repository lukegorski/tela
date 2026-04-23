/**
 * End-to-end test: create real auth user, upload photo, analyze, save item.
 * Uses Supabase Auth + auth.whoami for the app user lookup.
 *
 * Run with: doppler run -- node scripts/e2e-test.mjs <path-to-image>
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, teardownTestUser, trpcCall } from './_lib/test-user.mjs';

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: doppler run -- node scripts/e2e-test.mjs <path-to-image>');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function main() {
  console.log(`\n→ Test image: ${imagePath}`);
  console.log(`→ API: ${process.env.API_BASE ?? 'http://localhost:3001'}\n`);

  let user;

  try {
    console.log('1. Creating Supabase Auth user + signing in...');
    user = await createTestUser({ prefix: 'e2e-basic' });
    console.log(`   ✓ authUserId: ${user.authUserId}`);
    console.log(`   ✓ appUserId: ${user.appUserId}`);

    console.log('2. Requesting signed upload URL...');
    const filename = basename(imagePath);
    const upload = await trpcCall(
      'wardrobe.requestPhotoUpload',
      { filename, mimeType: 'image/jpeg' },
      user.authHeader,
    );
    console.log(`   ✓ storagePath: ${upload.storagePath}`);

    console.log('3. Uploading photo to Supabase Storage...');
    const fileBuffer = readFileSync(imagePath);
    const uploadRes = await storage.storage
      .from('item-photos')
      .uploadToSignedUrl(upload.storagePath, upload.token, fileBuffer, {
        contentType: 'image/jpeg',
      });
    if (uploadRes.error) throw new Error(`Upload failed: ${uploadRes.error.message}`);
    console.log(`   ✓ uploaded`);

    console.log('4. Confirming upload...');
    const confirmed = await trpcCall(
      'wardrobe.confirmPhotoUpload',
      { storagePath: upload.storagePath },
      user.authHeader,
    );
    console.log(`   ✓ photoId: ${confirmed.photoId}`);

    console.log('5. Analyzing photo with AI...');
    const analysis = await trpcCall(
      'item.analyze',
      { photoId: confirmed.photoId, locale: 'en' },
      user.authHeader,
    );
    console.log(`   ✓ generationId: ${analysis.generationId}`);
    console.log(`   ✓ cost: ${analysis.costCents.toFixed(4)}¢`);
    console.log(`   ✓ category: ${analysis.metadata.category} / ${analysis.metadata.subcategory}`);
    console.log(`   ✓ color: ${analysis.metadata.primaryColor}`);
    console.log(`   ✓ formality: ${analysis.metadata.formalityScore}`);

    console.log('6. Saving item to closet...');
    const item = await trpcCall(
      'wardrobe.addItem',
      {
        photoId: confirmed.photoId,
        metadata: { ...analysis.metadata, analysisLocale: 'en' },
      },
      user.authHeader,
    );
    console.log(`   ✓ itemId: ${item.itemId}`);

    console.log('7. Listing items...');
    const list = await trpcCall('wardrobe.listItems', { limit: 50, offset: 0 }, user.authHeader);
    console.log(`   ✓ total items: ${list.total}`);

    console.log('8. Fetching single item...');
    const fetched = await trpcCall('wardrobe.getItem', { itemId: item.itemId }, user.authHeader);
    console.log(`   ✓ retrieved ${fetched.category}`);

    console.log('9. Checking event log...');
    const events = await sql`
      SELECT type FROM events WHERE user_id = ${user.appUserId} ORDER BY timestamp ASC
    `;
    console.log(`   ✓ ${events.length} events: ${events.map((e) => e.type).join(', ')}`);

    console.log('10. Checking generation provenance...');
    const generations = await sql`
      SELECT operation, model, cost_cents FROM generations WHERE user_id = ${user.appUserId}
    `;
    console.log(`   ✓ ${generations.length} generation(s):`);
    for (const g of generations) {
      console.log(`      - ${g.operation} (${g.model}, ${parseFloat(g.cost_cents).toFixed(4)}¢)`);
    }

    console.log('\n✅ End-to-end flow complete.\n');
  } finally {
    if (user) await teardownTestUser({ authUserId: user.authUserId });
    await sql.end();
  }
}

main().catch(async (err) => {
  console.error('\n❌ E2E test failed:', err.message);
  process.exit(1);
});

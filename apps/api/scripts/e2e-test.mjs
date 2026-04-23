/**
 * End-to-end test: create user, upload photo, analyze, save item.
 * Run with: doppler run -- node scripts/e2e-test.mjs <path-to-image>
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: doppler run -- node scripts/e2e-test.mjs <path-to-image>');
  process.exit(1);
}

const API_BASE = process.env.API_BASE ?? 'http://localhost:3001';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function trpcMutation(procedure, input) {
  const res = await fetch(`${API_BASE}/trpc/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${procedure}: ${data.error.message}`);
  return data.result.data;
}

async function main() {
  console.log(`\n→ Test image: ${imagePath}`);
  console.log(`→ API: ${API_BASE}\n`);

  // Step 1: create a test user (directly in DB — auth not built yet)
  console.log('1. Creating test user...');
  const [user] = await sql`
    INSERT INTO users (email, display_name, locale)
    VALUES (${'e2e-test-' + Date.now() + '@tela.test'}, ${'E2E Test User'}, ${'en'})
    RETURNING id, email
  `;
  console.log(`   ✓ user_id: ${user.id}`);

  // Step 2: request signed upload URL
  console.log('2. Requesting signed upload URL...');
  const filename = basename(imagePath);
  const upload = await trpcMutation('wardrobe.requestPhotoUpload', {
    userId: user.id,
    filename,
    mimeType: 'image/jpeg',
  });
  console.log(`   ✓ storagePath: ${upload.storagePath}`);

  // Step 3: upload the image to Supabase via the signed URL
  console.log('3. Uploading photo to Supabase Storage...');
  const fileBuffer = readFileSync(imagePath);
  const uploadRes = await supabase.storage
    .from('item-photos')
    .uploadToSignedUrl(upload.storagePath, upload.token, fileBuffer, {
      contentType: 'image/jpeg',
    });
  if (uploadRes.error) throw new Error(`Upload failed: ${uploadRes.error.message}`);
  console.log(`   ✓ uploaded`);

  // Step 4: confirm upload
  console.log('4. Confirming upload (registers item_photo)...');
  const confirmed = await trpcMutation('wardrobe.confirmPhotoUpload', {
    userId: user.id,
    storagePath: upload.storagePath,
  });
  console.log(`   ✓ photoId: ${confirmed.photoId}`);

  // Step 5: analyze the photo with AI
  console.log('5. Analyzing photo with AI...');
  const analysis = await trpcMutation('item.analyze', {
    userId: user.id,
    photoId: confirmed.photoId,
    locale: 'en',
  });
  console.log(`   ✓ generationId: ${analysis.generationId}`);
  console.log(`   ✓ cost: ${analysis.costCents.toFixed(4)}¢`);
  console.log(`   ✓ category: ${analysis.metadata.category} / ${analysis.metadata.subcategory}`);
  console.log(`   ✓ color: ${analysis.metadata.primaryColor}`);
  console.log(`   ✓ formality: ${analysis.metadata.formalityScore}`);
  console.log(`   ✓ description: "${analysis.metadata.description}"`);

  // Step 6: save the item to the closet
  console.log('6. Saving item to closet...');
  const item = await trpcMutation('wardrobe.addItem', {
    userId: user.id,
    photoId: confirmed.photoId,
    metadata: { ...analysis.metadata, analysisLocale: 'en' },
  });
  console.log(`   ✓ itemId: ${item.itemId}`);
  console.log(`   ✓ closetId: ${item.closetId}`);

  // Step 7: list items
  console.log('7. Listing closet items...');
  const list = await trpcMutation('wardrobe.listItems', {
    userId: user.id,
    limit: 50,
    offset: 0,
  });
  console.log(`   ✓ total items: ${list.total}`);

  // Step 8: get single item
  console.log('8. Fetching single item...');
  const fetched = await trpcMutation('wardrobe.getItem', {
    userId: user.id,
    itemId: item.itemId,
  });
  console.log(`   ✓ retrieved ${fetched.category}`);

  // Step 9: verify event log
  console.log('9. Checking event log...');
  const events = await sql`
    SELECT type FROM events WHERE user_id = ${user.id} ORDER BY timestamp ASC
  `;
  console.log(`   ✓ ${events.length} events: ${events.map(e => e.type).join(', ')}`);

  // Step 10: verify generation logged
  console.log('10. Checking generation provenance...');
  const generations = await sql`
    SELECT operation, model, cost_cents FROM generations WHERE user_id = ${user.id}
  `;
  console.log(`   ✓ ${generations.length} generation(s):`);
  for (const g of generations) {
    console.log(`      - ${g.operation} (${g.model}, ${parseFloat(g.cost_cents).toFixed(4)}¢)`);
  }

  console.log('\n✅ End-to-end flow complete.\n');
  await sql.end();
}

main().catch(async (err) => {
  console.error('\n❌ E2E test failed:', err.message);
  await sql.end();
  process.exit(1);
});

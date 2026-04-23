/**
 * Phase 7 e2e test: upload photo → enhancement job is enqueued → worker
 * processes it → enhancement.getStatus eventually returns 'complete' with
 * a signed URL for the enhanced JPEG.
 *
 * Run with: doppler run -- node scripts/e2e-test-enhancement.mjs <path-to-image>
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, teardownTestUser, trpcCall } from './_lib/test-user.mjs';

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: doppler run -- node scripts/e2e-test-enhancement.mjs <path-to-image>');
  process.exit(1);
}

const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function main() {
  console.log(`\n→ Test image: ${imagePath}`);
  console.log(`→ API: ${process.env.API_BASE ?? 'http://localhost:3001'}\n`);

  let user;
  try {
    console.log('1. Creating Supabase Auth user...');
    user = await createTestUser({ prefix: 'enhance' });
    console.log(`   ✓ appUserId: ${user.appUserId}`);

    console.log('2. Requesting signed upload URL...');
    const filename = basename(imagePath);
    const upload = await trpcCall(
      'wardrobe.requestPhotoUpload',
      { filename, mimeType: 'image/jpeg' },
      user.authHeader,
    );

    console.log('3. Uploading photo to Supabase Storage...');
    const fileBuffer = readFileSync(imagePath);
    const r = await storage.storage
      .from('item-photos')
      .uploadToSignedUrl(upload.storagePath, upload.token, fileBuffer, {
        contentType: 'image/jpeg',
      });
    if (r.error) throw new Error(`Upload: ${r.error.message}`);
    console.log('   ✓ uploaded');

    console.log('4. Confirming upload (this enqueues an enhancement job)...');
    const confirmed = await trpcCall(
      'wardrobe.confirmPhotoUpload',
      { storagePath: upload.storagePath },
      user.authHeader,
    );
    console.log(`   ✓ photoId: ${confirmed.photoId}`);

    console.log('5. Polling enhancement.getStatus (timeout: 3 min)...');
    const startedAt = Date.now();
    const TIMEOUT_MS = 180_000;
    let status = null;
    let lastStatus = null;

    while (Date.now() - startedAt < TIMEOUT_MS) {
      status = await trpcCall(
        'enhancement.getStatus',
        { photoId: confirmed.photoId },
        user.authHeader,
      );
      if (status.status !== lastStatus) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`   [${elapsed}s] status: ${status.status} (attempts=${status.attempts})`);
        lastStatus = status.status;
      }
      if (status.status === 'complete' || status.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 3000));
    }

    if (!status || status.status !== 'complete') {
      throw new Error(
        `Enhancement did not complete in ${TIMEOUT_MS / 1000}s. Final status: ${status?.status ?? 'null'}, error: ${status?.error ?? 'none'}`,
      );
    }

    console.log(`   ✓ background color: ${status.backgroundColor}`);
    console.log(`   ✓ enhanced URL signed: ${status.enhancedSignedUrl?.slice(0, 60)}...`);

    console.log('6. Verifying the enhanced image is downloadable...');
    const enhRes = await fetch(status.enhancedSignedUrl);
    if (!enhRes.ok) throw new Error(`Enhanced fetch: ${enhRes.status}`);
    const sizeKb = ((await enhRes.arrayBuffer()).byteLength / 1024).toFixed(1);
    console.log(`   ✓ enhanced JPEG size: ${sizeKb}KB`);

    console.log('\n✅ Enhancement pipeline complete.\n');
  } finally {
    if (user) await teardownTestUser({ authUserId: user.authUserId });
  }
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
});

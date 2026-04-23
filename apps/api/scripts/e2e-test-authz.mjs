/**
 * Cross-user authorization test: verifies user A cannot access user B's data.
 *
 * This is the security-critical test for Phase 5. If this passes, the
 * RequestContext / capability migration is correctly enforcing per-user isolation.
 *
 * Run with: doppler run -- node scripts/e2e-test-authz.mjs <path-to-image>
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, teardownTestUser, trpcCall } from './_lib/test-user.mjs';

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: doppler run -- node scripts/e2e-test-authz.mjs <path-to-image>');
  process.exit(1);
}

const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

let passed = 0;
let failed = 0;

function assert(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function uploadAndSaveItem(user, label) {
  const filename = basename(imagePath);
  const upload = await trpcCall(
    'wardrobe.requestPhotoUpload',
    { filename, mimeType: 'image/jpeg' },
    user.authHeader,
  );
  const fileBuffer = readFileSync(imagePath);
  const r = await storage.storage
    .from('item-photos')
    .uploadToSignedUrl(upload.storagePath, upload.token, fileBuffer, {
      contentType: 'image/jpeg',
    });
  if (r.error) throw new Error(`upload ${label}: ${r.error.message}`);
  const confirmed = await trpcCall(
    'wardrobe.confirmPhotoUpload',
    { storagePath: upload.storagePath },
    user.authHeader,
  );
  const item = await trpcCall(
    'wardrobe.addItem',
    {
      photoId: confirmed.photoId,
      metadata: {
        category: 'top',
        primaryColor: 'navy',
        analysisLocale: 'en',
      },
    },
    user.authHeader,
  );
  return { itemId: item.itemId, photoId: confirmed.photoId };
}

async function main() {
  console.log('\n→ Cross-user authorization test\n');
  let alice, bob;

  try {
    console.log('Setup: creating Alice and Bob...');
    alice = await createTestUser({ prefix: 'authz-alice' });
    bob = await createTestUser({ prefix: 'authz-bob' });
    console.log(`  Alice: ${alice.appUserId}`);
    console.log(`  Bob:   ${bob.appUserId}`);
    if (alice.appUserId === bob.appUserId) throw new Error('user IDs collided');

    console.log('\nSetup: Alice uploads an item...');
    const aliceItem = await uploadAndSaveItem(alice, 'alice');
    console.log(`  ✓ Alice's item: ${aliceItem.itemId}`);

    console.log('\nTests:');

    // Test 1: Alice can read her own item
    let result;
    try {
      result = await trpcCall(
        'wardrobe.getItem',
        { itemId: aliceItem.itemId },
        alice.authHeader,
      );
      assert('Alice can read her own item', result.id === aliceItem.itemId);
    } catch (err) {
      assert('Alice can read her own item', false, err.message);
    }

    // Test 2: Bob cannot read Alice's item
    let bobReadFailed = false;
    try {
      await trpcCall('wardrobe.getItem', { itemId: aliceItem.itemId }, bob.authHeader);
    } catch {
      bobReadFailed = true;
    }
    assert("Bob cannot read Alice's item", bobReadFailed, 'expected getItem to throw');

    // Test 3: Bob's listItems returns 0 even though Alice has 1
    const bobList = await trpcCall(
      'wardrobe.listItems',
      { limit: 50, offset: 0 },
      bob.authHeader,
    );
    assert(
      "Bob's listItems excludes Alice's items",
      bobList.total === 0,
      `expected 0, got ${bobList.total}`,
    );

    // Test 4: Bob cannot remove Alice's item
    let bobRemoveFailed = false;
    try {
      await trpcCall('wardrobe.removeItem', { itemId: aliceItem.itemId }, bob.authHeader);
    } catch {
      bobRemoveFailed = true;
    }
    assert("Bob cannot remove Alice's item", bobRemoveFailed, 'expected removeItem to throw');

    // Verify Alice's item still exists after Bob's failed attempt
    const aliceListAfter = await trpcCall(
      'wardrobe.listItems',
      { limit: 50, offset: 0 },
      alice.authHeader,
    );
    assert(
      "Alice's item survived Bob's removeItem attempt",
      aliceListAfter.total === 1,
      `expected 1, got ${aliceListAfter.total}`,
    );

    // Test 5: No auth header → 401
    let noAuthFailed = false;
    try {
      await trpcCall('wardrobe.listItems', { limit: 10, offset: 0 });
    } catch (err) {
      noAuthFailed = true;
      // Verify the error message
      if (!err.message.toLowerCase().includes('auth')) {
        console.log(`     (warning: error didn't mention auth: ${err.message})`);
      }
    }
    assert('No-auth request rejected', noAuthFailed, 'expected throw');

    // Test 6: Invalid token → 401
    let badTokenFailed = false;
    try {
      await trpcCall('wardrobe.listItems', { limit: 10, offset: 0 }, 'Bearer notavalidjwt');
    } catch {
      badTokenFailed = true;
    }
    assert('Invalid-token request rejected', badTokenFailed, 'expected throw');

    // Test 7: Bob can't claim a storage path under Alice's user folder
    let pathTraversalFailed = false;
    try {
      await trpcCall(
        'wardrobe.confirmPhotoUpload',
        { storagePath: `${alice.appUserId}/some-fake-photo.jpg` },
        bob.authHeader,
      );
    } catch {
      pathTraversalFailed = true;
    }
    assert(
      "Bob cannot register a photo in Alice's storage folder",
      pathTraversalFailed,
      'expected confirmPhotoUpload to throw',
    );

    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failed > 0) {
      console.log('❌ Cross-user authorization tests FAILED');
      process.exit(1);
    }
    console.log('✅ Cross-user authorization tests passed');
  } finally {
    if (alice) await teardownTestUser({ authUserId: alice.authUserId });
    if (bob) await teardownTestUser({ authUserId: bob.authUserId });
  }
}

main().catch((err) => {
  console.error('\n❌ Test errored:', err.message);
  process.exit(1);
});

/**
 * Founder cutout backfill (spec §4: proactive for founders during beta).
 * Executes enhancement.cutout for every founder photo that is enhanced,
 * not folded, and missing a cutout. Local model — $0, ~1s/item.
 *
 * ⚠ Writes to the LIVE database + storage (there is no separate dev env).
 *
 * Usage:
 *   doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx scripts/backfill-cutouts.ts [--apply]
 */
import { randomUUID } from 'node:crypto';
import { and, inArray, isNull, isNotNull, or, eq } from 'drizzle-orm';
import { getDb, closetItems, itemPhotos } from '@tela/db';
import '../src/index.js';
import { executeCapability } from '../src/registry.js';
import { runInContext } from '../src/context/requestContext.js';

const FOUNDERS: Record<string, string> = {
  'cd83153d-1d56-4ac2-8c6b-4d03945c2244': 'luke',
  '1a54b5eb-d39d-4bae-836a-3c92ddde52fa': 'marina',
};
const CATEGORIES = ['top', 'bottom', 'outerwear', 'shoes', 'dress'];
const APPLY = process.argv.includes('--apply');

const db = getDb();

// Photo per item: prefer the photo row that carries the enhanced image.
const items = await db
  .select({
    itemId: closetItems.id,
    userId: closetItems.userId,
    category: closetItems.category,
    subcategory: closetItems.subcategory,
    presentation: closetItems.presentation,
    photoId: itemPhotos.id,
    enhancedStoragePath: itemPhotos.enhancedStoragePath,
    cutoutStoragePath: itemPhotos.cutoutStoragePath,
  })
  .from(closetItems)
  .innerJoin(
    itemPhotos,
    or(eq(itemPhotos.id, closetItems.photoId), eq(itemPhotos.id, closetItems.enhancedPhotoId)),
  )
  .where(
    and(
      inArray(closetItems.userId, Object.keys(FOUNDERS)),
      inArray(closetItems.category, CATEGORIES),
      isNotNull(itemPhotos.enhancedStoragePath),
      isNull(itemPhotos.cutoutStoragePath),
    ),
  );

const eligible = items.filter((i) => i.presentation !== 'folded');
const skippedFolded = items.length - eligible.length;
console.log(
  `${eligible.length} founder photos need cutouts (${skippedFolded} folded skipped) ${APPLY ? '(APPLY — live writes)' : '(dry run)'}`,
);
if (!APPLY) {
  const byOwner: Record<string, number> = {};
  for (const i of eligible) byOwner[FOUNDERS[i.userId]] = (byOwner[FOUNDERS[i.userId]] ?? 0) + 1;
  console.log('by owner:', byOwner);
  process.exit(0);
}

let done = 0;
let failed = 0;
const t0 = Date.now();
for (const item of eligible) {
  const owner = FOUNDERS[item.userId];
  try {
    const res = (await runInContext(
      { userId: item.userId, source: 'script', requestId: randomUUID(), isServiceAccount: true, isAdmin: true },
      () => executeCapability('enhancement.cutout', { photoId: item.photoId }),
    )) as { cutoutStoragePath: string | null; skippedReason: string | null };
    done++;
    console.log(
      `${owner}  ${item.category}/${item.subcategory ?? '-'}  → ${res.skippedReason ?? res.cutoutStoragePath}`,
    );
  } catch (err) {
    failed++;
    console.log(`FAIL ${owner} ${item.itemId}: ${err instanceof Error ? err.message : err}`);
  }
}
console.log(`\n${done} done, ${failed} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s ($0.00 — local model)`);
process.exit(0);

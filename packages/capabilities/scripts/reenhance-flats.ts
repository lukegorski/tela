/**
 * Founder re-enhancement pass — enhancement prompt v2, FLAT items only
 * (approved by Luke 2026-07-08: angled/folded keep their v1 enhancements;
 * the v2 canonical pose is destructive on angled inputs).
 *
 * Per photo: enhancement.retry (reset to pending) → enhancement.process
 * (runs with the latest synced prompt). The new process code invalidates
 * the derived cutout, so a cutout pass right after regenerates everything.
 *
 * ⚠ LIVE database + storage + OpenAI spend (~6.3¢/item, ~30s/item).
 *
 * Usage:
 *   doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx scripts/reenhance-flats.ts [--apply]
 */
import { randomUUID } from 'node:crypto';
import { and, inArray, eq, or, isNotNull } from 'drizzle-orm';
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
const ABORT_AT_CENTS = 450; // run-level cap; expected ~38 × 6.3¢ ≈ 240¢ + crop retries

const db = getDb();

const items = await db
  .select({
    itemId: closetItems.id,
    userId: closetItems.userId,
    category: closetItems.category,
    subcategory: closetItems.subcategory,
    photoId: itemPhotos.id,
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
      eq(closetItems.presentation, 'flat'),
      isNotNull(itemPhotos.enhancedStoragePath), // only photos that HAVE a v1 enhancement to replace
    ),
  );

console.log(`${items.length} flat founder photos to re-enhance with v2 ${APPLY ? '(APPLY — live writes + spend)' : '(dry run)'}`);
const byOwner: Record<string, number> = {};
for (const i of items) byOwner[FOUNDERS[i.userId]] = (byOwner[FOUNDERS[i.userId]] ?? 0) + 1;
console.log('by owner:', byOwner);
if (!APPLY) process.exit(0);

let done = 0;
let failed = 0;
let spentCents = 0;
const t0 = Date.now();

for (const item of items) {
  if (spentCents > ABORT_AT_CENTS) {
    console.error(`ABORT: spend ${spentCents.toFixed(1)}¢ > ${ABORT_AT_CENTS}¢ cap; ${items.length - done - failed} items left un-run`);
    break;
  }
  const owner = FOUNDERS[item.userId];
  const ctx = {
    userId: item.userId,
    source: 'script' as const,
    requestId: randomUUID(),
    isServiceAccount: true,
    isAdmin: true,
  };
  try {
    await runInContext(ctx, () => executeCapability('enhancement.retry', { photoId: item.photoId }));
    const res = (await runInContext(ctx, () =>
      executeCapability('enhancement.process', { photoId: item.photoId }),
    )) as { totalCostCents: number; retried: boolean };
    spentCents += res.totalCostCents;
    done++;
    console.log(
      `${owner}  ${item.category}/${item.subcategory ?? '-'}  ok${res.retried ? ' (crop-retried)' : ''}  ${res.totalCostCents.toFixed(1)}¢  cum ${spentCents.toFixed(1)}¢  [${done}/${items.length}]`,
    );
  } catch (err) {
    failed++;
    console.log(`FAIL ${owner} ${item.itemId}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`\n${done} re-enhanced, ${failed} failed, ${spentCents.toFixed(1)}¢ in ${((Date.now() - t0) / 60000).toFixed(1)}min`);
process.exit(0);

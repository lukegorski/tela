/**
 * Backfill closet_items.presentation for founder closets (spec §2a #12).
 *
 * Runs item.analyze on each founder item whose presentation is NULL and
 * writes ONLY the presentation column — never the curated analysis fields
 * (category, colors, description, …), which may have been corrected by hand.
 *
 * Usage:
 *   doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx scripts/backfill-presentation.ts [--apply]
 *
 * Dry run (default) classifies nothing; --apply calls the AI and writes.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, closetItems } from '@tela/db';
import '../src/index.js'; // side-effect: register all capabilities
import { executeCapability } from '../src/registry.js';
import { runInContext } from '../src/context/requestContext.js';

const FOUNDERS: Record<string, string> = {
  'cd83153d-1d56-4ac2-8c6b-4d03945c2244': 'luke',
  '1a54b5eb-d39d-4bae-836a-3c92ddde52fa': 'marina',
};
// Builder-relevant categories only; accessories are out of builder v1 scope.
const CATEGORIES = ['top', 'bottom', 'outerwear', 'shoes', 'dress'];
const APPLY = process.argv.includes('--apply');

const db = getDb();
const items = await db
  .select({
    id: closetItems.id,
    userId: closetItems.userId,
    photoId: closetItems.photoId,
    category: closetItems.category,
    subcategory: closetItems.subcategory,
  })
  .from(closetItems)
  .where(
    and(
      inArray(closetItems.userId, Object.keys(FOUNDERS)),
      inArray(closetItems.category, CATEGORIES),
      isNull(closetItems.presentation),
    ),
  );

console.log(`${items.length} founder items need presentation classification ${APPLY ? '(APPLY)' : '(dry run)'}`);
if (!APPLY) {
  const byOwner: Record<string, number> = {};
  for (const it of items) byOwner[FOUNDERS[it.userId]] = (byOwner[FOUNDERS[it.userId]] ?? 0) + 1;
  console.log('by owner:', byOwner);
  process.exit(0);
}

let totalCostCents = 0;
const tally: Record<string, Record<string, number>> = {};

for (const item of items) {
  const owner = FOUNDERS[item.userId];
  try {
    const result = (await runInContext(
      {
        userId: item.userId,
        source: 'script',
        requestId: randomUUID(),
        isServiceAccount: true,
        isAdmin: true,
      },
      () => executeCapability('item.analyze', { photoId: item.photoId, locale: 'en' }),
    )) as { metadata: { presentation: 'flat' | 'folded' | 'angled' | null }; costCents: number };

    totalCostCents += result.costCents;
    const p = result.metadata.presentation ?? 'null';
    (tally[owner] ??= {})[p] = (tally[owner]?.[p] ?? 0) + 1;

    if (result.metadata.presentation) {
      await db
        .update(closetItems)
        .set({ presentation: result.metadata.presentation })
        .where(eq(closetItems.id, item.id));
    }
    console.log(`${owner}  ${item.category}/${item.subcategory ?? '-'}  → ${p}  (${result.costCents.toFixed(2)}¢, cum ${totalCostCents.toFixed(2)}¢)`);
  } catch (err) {
    console.log(`FAIL ${owner} ${item.id}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log('\n== tally ==');
console.log(JSON.stringify(tally, null, 2));
console.log(`total cost: ${totalCostCents.toFixed(2)}¢`);
process.exit(0);

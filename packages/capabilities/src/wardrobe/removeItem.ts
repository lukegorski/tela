import { z } from 'zod';
import { and, eq, sql, inArray } from 'drizzle-orm';
import { getDb, closetItems, closets, outfitItems, outfits } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  itemId: z.string().uuid(),
});

const output = z.object({
  removed: z.boolean(),
  cascadedOutfitIds: z.array(z.string().uuid()),
});

/**
 * Remove a closet item and any outfits that reference it.
 *
 * Behaviour matches legacy `useWardrobe.deleteItem`: an outfit with a
 * missing item is broken UX, so deleting an item also deletes every
 * outfit that includes it. The DB-level cascade on `outfit_items` and
 * `try_on_jobs` clears child rows automatically; the parent `outfits`
 * rows are removed inside the same transaction so the cascade is atomic.
 *
 * The underlying `item_photos` row is preserved (in case it's referenced
 * elsewhere or used as a try-on result).
 */
export const removeItem = registerCapability({
  name: 'wardrobe.removeItem',
  chatTool: true,
  description:
    "Remove a closet item from the user's closet. Any outfits containing the item are also removed. The underlying photo file is preserved.",
  input,
  output,

  async execute({ itemId }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    const item = await db.query.closetItems.findFirst({
      where: and(eq(closetItems.id, itemId), eq(closetItems.userId, userId)),
    });
    if (!item) {
      throw new Error('Item not found');
    }

    const cascadedOutfitIds = await db.transaction(async (tx) => {
      const affectedOutfitRows = await tx
        .selectDistinct({ outfitId: outfitItems.outfitId })
        .from(outfitItems)
        .innerJoin(outfits, eq(outfits.id, outfitItems.outfitId))
        .where(and(eq(outfitItems.closetItemId, itemId), eq(outfits.userId, userId)));

      const affectedOutfitIds = affectedOutfitRows.map((r) => r.outfitId);

      if (affectedOutfitIds.length > 0) {
        await tx.delete(outfits).where(inArray(outfits.id, affectedOutfitIds));
      }

      await tx.delete(closetItems).where(eq(closetItems.id, itemId));

      await tx
        .update(closets)
        .set({
          itemCount: sql`GREATEST(${closets.itemCount} - 1, 0)`,
          lastUpdatedAt: new Date(),
        })
        .where(eq(closets.id, item.closetId));

      return affectedOutfitIds;
    });

    await Promise.all(
      cascadedOutfitIds.map((outfitId) =>
        logEvent({
          userId,
          type: 'outfit.deleted',
          source,
          payload: { outfitId, reason: 'wardrobe_item_removed', triggeringItemId: itemId },
        }),
      ),
    );

    await logEvent({
      userId,
      type: 'wardrobe.item_removed',
      source,
      payload: { itemId, category: item.category, cascadedOutfitCount: cascadedOutfitIds.length },
    });

    return { removed: true, cascadedOutfitIds };
  },
});

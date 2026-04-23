import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, closetItems, closets } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
  itemId: z.string().uuid(),
});

const output = z.object({
  removed: z.boolean(),
});

/**
 * Remove a closet item. Decrements the closet's item count.
 * The associated item_photos row is preserved (in case it's referenced elsewhere or used as a try-on result).
 */
export const removeItem = registerCapability({
  name: 'wardrobe.removeItem',
  description: "Remove a closet item from the user's closet. The underlying photo file is preserved for now.",
  input,
  output,

  async execute({ userId, itemId }) {
    const db = getDb();

    const item = await db.query.closetItems.findFirst({
      where: and(eq(closetItems.id, itemId), eq(closetItems.userId, userId)),
    });
    if (!item) {
      throw new Error('Item not found');
    }

    await db.delete(closetItems).where(eq(closetItems.id, itemId));

    // Decrement the closet count (don't go below 0)
    await db
      .update(closets)
      .set({
        itemCount: sql`GREATEST(${closets.itemCount} - 1, 0)`,
        lastUpdatedAt: new Date(),
      })
      .where(eq(closets.id, item.closetId));

    await logEvent({
      userId,
      type: 'wardrobe.item_removed',
      source: 'api',
      payload: { itemId, category: item.category },
    });

    return { removed: true };
  },
});

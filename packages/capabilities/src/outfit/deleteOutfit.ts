import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb, outfits } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  outfitId: z.string().uuid(),
});

const output = z.object({
  deleted: z.boolean(),
});

export const deleteOutfit = registerCapability({
  name: 'outfit.delete',
  chatTool: true,
  description: "Permanently delete an outfit. The outfit_items rows are also removed via cascade.",
  input,
  output,

  async execute({ outfitId }) {
    const { userId, source } = getRequestContext();
    const db = getDb();
    const result = await db
      .delete(outfits)
      .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)))
      .returning({ id: outfits.id });

    if (result.length === 0) throw new Error('Outfit not found');

    await logEvent({
      userId,
      type: 'outfit.deleted',
      source,
      payload: { outfitId },
    });

    return { deleted: true };
  },
});

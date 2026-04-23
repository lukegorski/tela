import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb, outfits } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
  outfitId: z.string().uuid(),
  saved: z.boolean().default(true),
});

const output = z.object({
  outfitId: z.string().uuid(),
  saved: z.boolean(),
});

export const saveOutfit = registerCapability({
  name: 'outfit.save',
  description: "Mark an outfit as saved (or unsaved) in the user's lookbook.",
  input,
  output,

  async execute({ userId, outfitId, saved }) {
    const db = getDb();
    const [updated] = await db
      .update(outfits)
      .set({ saved })
      .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)))
      .returning({ id: outfits.id, saved: outfits.saved });

    if (!updated) throw new Error('Outfit not found');

    await logEvent({
      userId,
      type: saved ? 'outfit.saved' : 'outfit.deleted',
      source: 'api',
      payload: { outfitId },
    });

    return { outfitId: updated.id, saved: updated.saved };
  },
});

import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb, outfits, outfitItems } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
  outfitId: z.string().uuid(),
});

const output = z.object({
  id: z.string().uuid(),
  generationId: z.string().uuid(),
  contextId: z.string().uuid(),
  rationale: z.string(),
  pairingKey: z.string(),
  saved: z.boolean(),
  wornAt: z.string().nullable(),
  items: z.array(
    z.object({
      closetItemId: z.string().uuid(),
      role: z.string(),
    }),
  ),
  createdAt: z.string(),
});

export const getOutfit = registerCapability({
  name: 'outfit.get',
  description: "Fetch a single outfit by ID, including its items, scoped to the requesting user.",
  input,
  output,

  async execute({ userId, outfitId }) {
    const db = getDb();

    const outfit = await db.query.outfits.findFirst({
      where: and(eq(outfits.id, outfitId), eq(outfits.userId, userId)),
    });
    if (!outfit) throw new Error('Outfit not found');

    const items = await db
      .select({ closetItemId: outfitItems.closetItemId, role: outfitItems.role })
      .from(outfitItems)
      .where(eq(outfitItems.outfitId, outfitId));

    await logEvent({
      userId,
      type: 'outfit.viewed',
      source: 'api',
      payload: { outfitId },
    });

    return {
      id: outfit.id,
      generationId: outfit.generationId,
      contextId: outfit.contextId,
      rationale: outfit.rationale,
      pairingKey: outfit.pairingKey,
      saved: outfit.saved,
      wornAt: outfit.wornAt?.toISOString() ?? null,
      items,
      createdAt: outfit.createdAt.toISOString(),
    };
  },
});

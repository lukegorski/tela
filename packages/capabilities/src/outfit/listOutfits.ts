import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, outfits } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({
  savedOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const output = z.object({
  outfits: z.array(
    z.object({
      id: z.string().uuid(),
      rationale: z.string(),
      pairingKey: z.string(),
      saved: z.boolean(),
      wornAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  total: z.number(),
});

export const listOutfits = registerCapability({
  name: 'outfit.list',
  chatTool: true,
  description:
    "List a user's outfits, optionally filtering to saved-only. Returns lightweight summaries — call outfit.get for items + full detail.",
  input,
  output,

  async execute({ savedOnly, limit, offset }) {
    const { userId } = getRequestContext();
    const db = getDb();
    const where = savedOnly
      ? and(eq(outfits.userId, userId), eq(outfits.saved, true))
      : eq(outfits.userId, userId);

    const rows = await db
      .select({
        id: outfits.id,
        rationale: outfits.rationale,
        pairingKey: outfits.pairingKey,
        saved: outfits.saved,
        wornAt: outfits.wornAt,
        createdAt: outfits.createdAt,
      })
      .from(outfits)
      .where(where)
      .orderBy(desc(outfits.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      outfits: rows.map((o) => ({
        id: o.id,
        rationale: o.rationale,
        pairingKey: o.pairingKey,
        saved: o.saved,
        wornAt: o.wornAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
      total: rows.length,
    };
  },
});

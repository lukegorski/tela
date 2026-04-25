import { z } from 'zod';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { fetchRichOutfits, richOutfitSchema } from './outfitShape.js';

const input = z.object({
  savedOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const output = z.object({
  outfits: z.array(richOutfitSchema),
  total: z.number(),
});

export const listOutfits = registerCapability({
  name: 'outfit.list',
  chatTool: true,
  description:
    "List a user's outfits, optionally filtering to saved-only. Returns the rich shape — items, signed image URLs, latest try-on status — in one round trip.",
  input,
  output,

  async execute({ savedOnly, limit, offset }) {
    const { userId } = getRequestContext();
    const rich = await fetchRichOutfits({ userId, savedOnly, limit, offset });
    return { outfits: rich, total: rich.length };
  },
});

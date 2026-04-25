import { z } from 'zod';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { fetchRichOutfits, richOutfitSchema } from './outfitShape.js';

const input = z.object({
  outfitId: z.string().uuid(),
});

const output = richOutfitSchema;

export const getOutfit = registerCapability({
  name: 'outfit.get',
  chatTool: true,
  description: "Fetch a single outfit by ID with items, signed image URLs, and latest try-on status — scoped to the requesting user.",
  input,
  output,

  async execute({ outfitId }) {
    const { userId, source } = getRequestContext();

    const [outfit] = await fetchRichOutfits({ userId, outfitId });
    if (!outfit) throw new Error('Outfit not found');

    await logEvent({
      userId,
      type: 'outfit.viewed',
      source,
      payload: { outfitId },
    });

    return outfit;
  },
});

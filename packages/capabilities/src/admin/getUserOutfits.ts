import { z } from 'zod';
import { fetchRichOutfits, richOutfitSchema } from '../outfit/outfitShape.js';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
});

const output = z.object({
  outfits: z.array(richOutfitSchema),
});

/**
 * Full outfit list for a single user, in the same rich shape as
 * `outfit.list`. Joined items + latest try-on + signed URLs included.
 * Ordered newest-first by creation. Admin only.
 */
export const getUserOutfits = registerCapability({
  name: 'admin.getUserOutfits',
  description:
    'Full outfit list (rich shape with joined items, try-on, signed URLs) for one user, newest first. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ userId }) {
    return { outfits: await fetchRichOutfits({ userId, orderBy: 'createdAt' }) };
  },
});

import { z } from 'zod';
import { fetchRichItems, richItemSchema } from '../wardrobe/itemShape.js';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
});

const output = z.object({
  items: z.array(richItemSchema),
});

/**
 * Full wardrobe for a single user, in the same rich shape as
 * `wardrobe.listItems`. Signed image URLs included. Admin only.
 */
export const getUserWardrobe = registerCapability({
  name: 'admin.getUserWardrobe',
  description:
    'Full wardrobe (rich item shape with signed image URLs) for one user. Admin only.',
  input,
  output,
  requiresAdmin: true,
  chatTool: true,

  async execute({ userId }) {
    return { items: await fetchRichItems({ userId }) };
  },
});

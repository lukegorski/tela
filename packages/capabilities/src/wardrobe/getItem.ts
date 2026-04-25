import { z } from 'zod';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { fetchRichItems, richItemSchema } from './itemShape.js';

const input = z.object({
  itemId: z.string().uuid(),
});

const output = richItemSchema;

/**
 * Get a single closet item by ID, scoped to the requesting user.
 * Returns the same rich shape as `wardrobe.listItems`.
 */
export const getItem = registerCapability({
  name: 'wardrobe.getItem',
  chatTool: true,
  description:
    "Fetch a single closet item by ID. Returns analysis fields, enhancement state, and signed image URLs.",
  input,
  output,

  async execute({ itemId }) {
    const { userId, source } = getRequestContext();

    const items = await fetchRichItems({ userId, itemId });
    const item = items[0];
    if (!item) {
      throw new Error('Item not found');
    }

    await logEvent({
      userId,
      type: 'wardrobe.item_viewed',
      source,
      payload: { itemId },
    });

    return item;
  },
});

import { z } from 'zod';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { fetchRichItems, richItemSchema } from './itemShape.js';

const input = z.object({
  category: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const output = z.object({
  items: z.array(richItemSchema),
  total: z.number(),
});

/**
 * List items in a user's closet with optional category filter and pagination.
 *
 * Returns the full rich shape used by every wardrobe-facing UI surface:
 * flat analysis fields, ISO timestamps, joined enhancement state, and
 * pre-signed image URLs (both enhanced and original).
 */
export const listItems = registerCapability({
  name: 'wardrobe.listItems',
  chatTool: true,
  description:
    "List items in a user's closet. Supports filtering by category and pagination via limit/offset. Returns analysis fields, enhancement state, and signed image URLs.",
  input,
  output,

  async execute({ category, limit, offset }) {
    const { userId, source } = getRequestContext();

    const items = await fetchRichItems({ userId, category, limit, offset });

    await logEvent({
      userId,
      type: 'wardrobe.closet_viewed',
      source,
      payload: { category, limit, offset, returned: items.length },
    });

    return {
      items,
      total: items.length,
    };
  },
});

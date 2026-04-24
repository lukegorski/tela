import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, annotatedExamples } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  id: z.string().uuid(),
});

const output = z.object({
  deleted: z.literal(true),
});

/**
 * Hard-delete an annotated example. Admin only.
 */
export const deleteExample = registerCapability({
  name: 'admin.deleteExample',
  description: 'Hard-delete an annotated_examples row. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ id }) {
    const db = getDb();
    const result = await db
      .delete(annotatedExamples)
      .where(eq(annotatedExamples.id, id))
      .returning({ id: annotatedExamples.id });
    if (result.length === 0) {
      throw new Error(`Annotated example not found: ${id}`);
    }
    return { deleted: true as const };
  },
});

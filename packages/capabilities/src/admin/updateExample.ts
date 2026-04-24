import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, annotatedExamples } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  outfitDescription: z.string().min(1).max(4000).optional(),
  reasoning: z.string().min(1).max(8000).optional(),
  context: z.string().min(1).max(2000).optional(),
  tags: z.array(z.string()).optional(),
});

const output = z.object({
  id: z.string().uuid(),
});

/**
 * Update any subset of an annotated example. Missing fields are left
 * unchanged. Admin only.
 */
export const updateExample = registerCapability({
  name: 'admin.updateExample',
  description:
    'Update an annotated_examples row. Pass any subset of (title, outfitDescription, reasoning, context, tags). Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ id, title, outfitDescription, reasoning, context, tags }) {
    const db = getDb();

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (outfitDescription !== undefined) updates.outfitDescription = outfitDescription;
    if (reasoning !== undefined) updates.reasoning = reasoning;
    if (context !== undefined) updates.context = context;
    if (tags !== undefined) updates.tags = tags;

    const [updated] = await db
      .update(annotatedExamples)
      .set(updates)
      .where(eq(annotatedExamples.id, id))
      .returning({ id: annotatedExamples.id });

    if (!updated) {
      throw new Error(`Annotated example not found: ${id}`);
    }

    return { id: updated.id };
  },
});

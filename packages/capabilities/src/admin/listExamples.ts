import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { getDb, annotatedExamples } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({});

const exampleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  outfitDescription: z.string(),
  reasoning: z.string(),
  context: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const output = z.object({
  examples: z.array(exampleSchema),
});

/**
 * List all annotated examples for the admin editor. These are the
 * reference outfits + cofounder reasoning that anchor the closet read +
 * outfit generation prompts.
 *
 * Sort: most recently updated first.
 */
export const listExamples = registerCapability({
  name: 'admin.listExamples',
  description:
    'List annotated_examples rows for the admin editor. Sorted by most recently updated first. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute() {
    const db = getDb();
    const rows = await db
      .select()
      .from(annotatedExamples)
      .orderBy(desc(annotatedExamples.updatedAt));
    return {
      examples: rows.map((r) => ({
        id: r.id,
        title: r.title,
        outfitDescription: r.outfitDescription,
        reasoning: r.reasoning,
        context: r.context,
        tags: r.tags,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  },
});

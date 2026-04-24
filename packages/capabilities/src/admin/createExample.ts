import { z } from 'zod';
import { getDb, annotatedExamples } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  title: z.string().min(1).max(255),
  outfitDescription: z.string().min(1).max(4000),
  reasoning: z.string().min(1).max(8000),
  context: z.string().min(1).max(2000),
  tags: z.array(z.string()).default([]),
});

const output = z.object({
  id: z.string().uuid(),
});

/**
 * Create a new annotated example — a reference outfit with cofounder
 * reasoning + context. Used as in-context examples for the closet read +
 * outfit generation prompts. Admin only.
 */
export const createExample = registerCapability({
  name: 'admin.createExample',
  description:
    'Create a new annotated_examples row (reference outfit + reasoning). Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ title, outfitDescription, reasoning, context, tags }) {
    const db = getDb();
    const [created] = await db
      .insert(annotatedExamples)
      .values({ title, outfitDescription, reasoning, context, tags })
      .returning({ id: annotatedExamples.id });
    return { id: created.id };
  },
});

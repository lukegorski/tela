import { z } from 'zod';
import { getDb, stylistRules } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  category: z.string().min(1).max(100),
  rule: z.string().min(1).max(2000),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
});

const output = z.object({
  id: z.string().uuid(),
});

/**
 * Create a new stylist rule. Newly created rules start at version 1.
 * Admin only.
 */
export const createRule = registerCapability({
  name: 'admin.createRule',
  description:
    'Create a new stylist_rules row (cofounder authoring tool). Returns the new row id. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ category, rule, priority, active }) {
    const db = getDb();
    const [created] = await db
      .insert(stylistRules)
      .values({ category, rule, priority, active })
      .returning({ id: stylistRules.id });
    return { id: created.id };
  },
});

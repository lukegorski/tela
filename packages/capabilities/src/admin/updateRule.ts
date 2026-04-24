import { z } from 'zod';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { getDb, stylistRules } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  id: z.string().uuid(),
  category: z.string().min(1).max(100).optional(),
  rule: z.string().min(1).max(2000).optional(),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});

const output = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
});

/**
 * Update a stylist rule. Any subset of fields can be passed; missing fields
 * are left unchanged. The version counter increments on every update so
 * cofounder can spot churn.
 *
 * No automatic re-evaluation of past generations — those keep their original
 * rule snapshot in their generation row. Future outfit generations will pick
 * up the new rule on next call.
 *
 * Admin only.
 */
export const updateRule = registerCapability({
  name: 'admin.updateRule',
  description:
    'Update a stylist_rules row. Pass any subset of (category, rule, priority, active). Increments the version counter. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ id, category, rule, priority, active }) {
    const db = getDb();

    // Build the update object with only the fields that were passed
    const updates: Record<string, unknown> = {
      version: drizzleSql`${stylistRules.version} + 1`,
      updatedAt: new Date(),
    };
    if (category !== undefined) updates.category = category;
    if (rule !== undefined) updates.rule = rule;
    if (priority !== undefined) updates.priority = priority;
    if (active !== undefined) updates.active = active;

    const [updated] = await db
      .update(stylistRules)
      .set(updates)
      .where(eq(stylistRules.id, id))
      .returning({ id: stylistRules.id, version: stylistRules.version });

    if (!updated) {
      throw new Error(`Stylist rule not found: ${id}`);
    }

    return { id: updated.id, version: updated.version };
  },
});

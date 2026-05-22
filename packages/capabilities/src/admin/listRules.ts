import { z } from 'zod';
import { desc, asc } from 'drizzle-orm';
import { getDb, stylistRules } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  /** If true, only return active rules. Default false (cofounder usually wants to see everything in the editor). */
  activeOnly: z.boolean().default(false),
});

const ruleSchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  rule: z.string(),
  priority: z.number().int(),
  active: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const output = z.object({
  rules: z.array(ruleSchema),
});

/**
 * List all stylist rules for the admin editor. Default is everything (so
 * cofounder can see disabled rules too); pass activeOnly=true to filter.
 *
 * Sort: active first, then highest priority first, then most-recently
 * edited first — what the editor wants by default.
 */
export const listRules = registerCapability({
  name: 'admin.listRules',
  description:
    'List stylist_rules rows for the admin editor. Defaults to all rows; pass activeOnly=true to filter to active. Admin only.',
  input,
  output,
  requiresAdmin: true,
  chatTool: true,

  async execute({ activeOnly }) {
    const db = getDb();
    const rows = await db
      .select()
      .from(stylistRules)
      .orderBy(desc(stylistRules.active), desc(stylistRules.priority), desc(stylistRules.updatedAt), asc(stylistRules.category));

    const filtered = activeOnly ? rows.filter((r) => r.active) : rows;

    return {
      rules: filtered.map((r) => ({
        id: r.id,
        category: r.category,
        rule: r.rule,
        priority: r.priority,
        active: r.active,
        version: r.version,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  },
});

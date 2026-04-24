import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, stylistRules } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  id: z.string().uuid(),
});

const output = z.object({
  deleted: z.literal(true),
});

/**
 * Hard-delete a stylist rule. Past generations keep working — their stored
 * snapshot doesn't depend on the rules table.
 *
 * Soft-delete (active=false) is preferred for normal lifecycle; hard-delete
 * exists for cleaning up mistakes / test rules. Admin only.
 */
export const deleteRule = registerCapability({
  name: 'admin.deleteRule',
  description:
    'Hard-delete a stylist_rules row. Past generations are unaffected. Prefer setting active=false for normal lifecycle. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ id }) {
    const db = getDb();
    const result = await db.delete(stylistRules).where(eq(stylistRules.id, id)).returning({ id: stylistRules.id });
    if (result.length === 0) {
      throw new Error(`Stylist rule not found: ${id}`);
    }
    return { deleted: true as const };
  },
});

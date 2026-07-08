import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, users } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { deriveEntitlements } from '../entitlements/derive.js';

const input = z.object({});

const output = z.object({
  builder: z.boolean(),
  aiStyling: z.boolean(),
  renderQuotaPerWeek: z.number().int().positive().nullable(),
});

/**
 * The caller's entitlements, derived through the choke point (spec §5).
 * Server-side gates (builder route, outfit.generate premium gate in v1)
 * and the web UI all read this — never users.features directly.
 */
export const getEntitlements = registerCapability({
  name: 'user.entitlements',
  description:
    "Get the calling user's derived entitlements: builder access, AI styling access, and weekly render quota. Reads the entitlements choke point — the single source of truth for feature gating.",
  input,
  output,

  async execute() {
    const { userId } = getRequestContext();
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { features: true },
    });
    if (!user) throw new Error('User not found');
    return deriveEntitlements(user);
  },
});

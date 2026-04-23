import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, users } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({});

const output = z.object({
  userId: z.string().uuid(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  locale: z.string(),
  source: z.string(),
  isServiceAccount: z.boolean().optional(),
});

/**
 * Return the current authenticated user's profile + the request context.
 * Useful for clients to verify their token, scripts to look up their userId,
 * and debugging.
 */
export const whoami = registerCapability({
  name: 'auth.whoami',
  description:
    "Return the current authenticated user's profile and request source. Useful for verifying auth tokens, looking up the canonical app userId from a service-account context, and debugging.",
  input,
  output,

  async execute() {
    const { userId, source, isServiceAccount } = getRequestContext();
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) {
      throw new Error('User record not found for authenticated context');
    }
    return {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      source,
      isServiceAccount,
    };
  },
});

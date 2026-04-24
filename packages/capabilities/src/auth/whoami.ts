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
  // Drives whether the navbar / mobile nav surfaces the /admin tab.
  isAdmin: z.boolean(),
  // Onboarding state — drives whether the frontend routes to /onboarding
  onboardingComplete: z.boolean(),
  hasLocation: z.boolean(),
});

/**
 * Return the current authenticated user's profile + the request context.
 * Used by the frontend to:
 *   - verify the token
 *   - decide whether to redirect to /onboarding (onboardingComplete=false)
 *   - look up the canonical app userId
 */
export const whoami = registerCapability({
  name: 'auth.whoami',
  description:
    "Return the current authenticated user's profile, onboarding state, and request source. Frontend uses this to decide where to route a freshly-signed-in user.",
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
      isAdmin: user.isAdmin,
      onboardingComplete: user.onboardingComplete,
      hasLocation: user.location !== null,
    };
  },
});

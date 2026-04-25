import { z } from 'zod';
import { and, desc, isNull, eq } from 'drizzle-orm';
import { getDb, wardrobeGaps } from '@tela/db';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

const input = z.object({});

const output = z.object({
  /** Unresolved wardrobe gaps for the current user, sorted by priority then recency. */
  gaps: z.array(z.string()),
});

/**
 * Return the user's currently-unresolved wardrobe gap descriptions, in the
 * shape the legacy app stored on `users.wardrobeGaps` (a string[]). Backed
 * by the relational `wardrobe_gaps` table — each row's description becomes
 * one string in the result.
 *
 * Resolved gaps (rows with `resolved_at` set) are excluded.
 */
export const getWardrobeGaps = registerCapability({
  name: 'user.getWardrobeGaps',
  description:
    "Return the user's unresolved wardrobe gap descriptions as a string[]. Resolved gaps are excluded. Sorted by priority desc, then most recently identified first.",
  input,
  output,

  async execute() {
    const { userId } = getRequestContext();
    const db = getDb();

    const rows = await db
      .select({ description: wardrobeGaps.description })
      .from(wardrobeGaps)
      .where(and(eq(wardrobeGaps.userId, userId), isNull(wardrobeGaps.resolvedAt)))
      .orderBy(desc(wardrobeGaps.priority), desc(wardrobeGaps.identifiedAt));

    return { gaps: rows.map((r) => r.description) };
  },
});

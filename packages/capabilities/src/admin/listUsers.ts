import { z } from 'zod';
import { sql as drizzleSql, desc } from 'drizzle-orm';
import { getDb, users } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({});

const userRow = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  displayName: z.string().nullable(),
  isAdmin: z.boolean(),
  onboardingComplete: z.boolean(),
  itemCount: z.number().int(),
  outfitCount: z.number().int(),
  chatMessageCount: z.number().int(),
  generationCount: z.number().int(),
  spendCents: z.number(),
  createdAt: z.string(),
});

const output = z.object({
  users: z.array(userRow),
});

/**
 * List all users with per-user aggregates: items, outfits, chat messages,
 * generations, total spend. Used for the /admin/users overview.
 *
 * Does NOT paginate (yet). Fine for the small user counts we'll have for a
 * while; revisit if the table grows beyond a few hundred rows.
 *
 * Admin only.
 */
export const listUsers = registerCapability({
  name: 'admin.listUsers',
  description:
    'List all users with per-user aggregates (items, outfits, chat messages, generations, total AI spend). No pagination yet. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute() {
    const db = getDb();

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        onboardingComplete: users.onboardingComplete,
        createdAt: users.createdAt,
        itemCount: drizzleSql<number>`(SELECT count(*)::int FROM closet_items ci WHERE ci.user_id = ${users.id})`,
        outfitCount: drizzleSql<number>`(SELECT count(*)::int FROM outfits o WHERE o.user_id = ${users.id})`,
        chatMessageCount: drizzleSql<number>`(
          SELECT count(*)::int
          FROM chat_messages m
          JOIN chat_conversations c ON c.id = m.conversation_id
          WHERE c.user_id = ${users.id} AND c.is_admin_chat = false
        )`,
        generationCount: drizzleSql<number>`(SELECT count(*)::int FROM generations g WHERE g.user_id = ${users.id})`,
        spendCents: drizzleSql<number>`(SELECT coalesce(sum(g.cost_cents), 0)::float FROM generations g WHERE g.user_id = ${users.id})`,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return {
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        phone: r.phone,
        displayName: r.displayName,
        isAdmin: r.isAdmin,
        onboardingComplete: r.onboardingComplete,
        itemCount: r.itemCount,
        outfitCount: r.outfitCount,
        chatMessageCount: r.chatMessageCount,
        generationCount: r.generationCount,
        spendCents: r.spendCents,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },
});

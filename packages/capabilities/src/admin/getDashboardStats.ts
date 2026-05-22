import { z } from 'zod';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import {
  getDb,
  users,
  closetItems,
  outfits,
  generations,
  chatMessages,
  chatConversations,
} from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({});

const output = z.object({
  totals: z.object({
    users: z.number().int(),
    closetItems: z.number().int(),
    outfits: z.number().int(),
    chatMessages: z.number().int(),
    generations: z.number().int(),
  }),
  spend: z.object({
    today: z.object({
      cents: z.number(),
      generations: z.number().int(),
    }),
    last7Days: z.object({
      cents: z.number(),
      generations: z.number().int(),
    }),
    allTime: z.object({
      cents: z.number(),
      generations: z.number().int(),
    }),
  }),
});

/**
 * Top-level dashboard counters. Cheap aggregates over the foundation tables.
 * Used by the /admin landing page so cofounder + Luke can sanity-check the
 * system at a glance.
 *
 * Admin-gated. The capability registry rejects non-admin callers; the
 * handler never runs for them.
 */
export const getDashboardStats = registerCapability({
  name: 'admin.getDashboardStats',
  description:
    'Aggregate counts (users, items, outfits, chat messages, generations) and AI spend totals (today, 7d, all-time) for the admin dashboard. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute() {
    const db = getDb();

    // We issue these in parallel — they're all small index-friendly aggregates.
    const [
      [{ count: userCount }],
      [{ count: itemCount }],
      [{ count: outfitCount }],
      [{ count: messageCount }],
      [{ count: genCount }],
      [todaySpend],
      [last7Spend],
      [allTimeSpend],
    ] = await Promise.all([
      db.select({ count: drizzleSql<number>`count(*)::int` }).from(users),
      db.select({ count: drizzleSql<number>`count(*)::int` }).from(closetItems),
      db.select({ count: drizzleSql<number>`count(*)::int` }).from(outfits),
      db
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(chatMessages)
        .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
        .where(eq(chatConversations.isAdminChat, false)),
      db.select({ count: drizzleSql<number>`count(*)::int` }).from(generations),
      db
        .select({
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(drizzleSql`${generations.createdAt} >= now() - interval '1 day'`),
      db
        .select({
          cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(generations)
        .where(drizzleSql`${generations.createdAt} >= now() - interval '7 days'`),
      db.select({
        cents: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
        count: drizzleSql<number>`count(*)::int`,
      }).from(generations),
    ]);

    return {
      totals: {
        users: userCount,
        closetItems: itemCount,
        outfits: outfitCount,
        chatMessages: messageCount,
        generations: genCount,
      },
      spend: {
        today: { cents: todaySpend.cents, generations: todaySpend.count },
        last7Days: { cents: last7Spend.cents, generations: last7Spend.count },
        allTime: { cents: allTimeSpend.cents, generations: allTimeSpend.count },
      },
    };
  },
});

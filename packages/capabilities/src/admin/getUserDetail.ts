import { z } from 'zod';
import { and, eq, desc, sql as drizzleSql } from 'drizzle-orm';
import {
  getDb,
  users,
  closetItems,
  outfits,
  chatConversations,
  generations,
  styleProfiles,
} from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  userId: z.string().uuid(),
});

const itemSummary = z.object({
  id: z.string().uuid(),
  category: z.string(),
  subcategory: z.string().nullable(),
  primaryColor: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
});

const outfitSummary = z.object({
  id: z.string().uuid(),
  rationale: z.string(),
  saved: z.boolean(),
  createdAt: z.string(),
});

const conversationSummary = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  messageCount: z.number().int(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
});

const recentGeneration = z.object({
  id: z.string().uuid(),
  operation: z.string(),
  model: z.string(),
  costCents: z.number(),
  latencyMs: z.number(),
  createdAt: z.string(),
});

const output = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    locale: z.string(),
    isAdmin: z.boolean(),
    onboardingComplete: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  styleProfile: z
    .object({
      id: z.string().uuid(),
      profileText: z.string(),
      updatedAt: z.string(),
    })
    .nullable(),
  totals: z.object({
    items: z.number().int(),
    outfits: z.number().int(),
    conversations: z.number().int(),
    generations: z.number().int(),
    spendCents: z.number(),
  }),
  recentItems: z.array(itemSummary),
  recentOutfits: z.array(outfitSummary),
  recentConversations: z.array(conversationSummary),
  recentGenerations: z.array(recentGeneration),
});

/**
 * Deep introspection of a single user — wardrobe sample, recent outfits,
 * recent conversations, recent AI calls, plus aggregate counts.
 *
 * Caps each list at 20 to keep the payload manageable. The detail page can
 * link out to scoped browsers if cofounder needs full lists.
 *
 * Admin only.
 */
export const getUserDetail = registerCapability({
  name: 'admin.getUserDetail',
  description:
    'Deep introspection of a single user: profile, wardrobe sample, recent outfits, recent chats, recent AI calls, and aggregate totals. Admin only.',
  input,
  output,
  requiresAdmin: true,
  chatTool: true,

  async execute({ userId }) {
    const db = getDb();

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new Error(`User not found: ${userId}`);

    const [
      profile,
      [{ items: itemTotal }],
      [{ outfits: outfitTotal }],
      [{ conversations: convoTotal }],
      [{ generations: genTotal, spend }],
      recentItems,
      recentOutfits,
      recentConversations,
      recentGenerations,
    ] = await Promise.all([
      db.query.styleProfiles.findFirst({ where: eq(styleProfiles.userId, userId) }),
      db
        .select({ items: drizzleSql<number>`count(*)::int` })
        .from(closetItems)
        .where(eq(closetItems.userId, userId)),
      db
        .select({ outfits: drizzleSql<number>`count(*)::int` })
        .from(outfits)
        .where(eq(outfits.userId, userId)),
      db
        .select({ conversations: drizzleSql<number>`count(*)::int` })
        .from(chatConversations)
        .where(and(eq(chatConversations.userId, userId), eq(chatConversations.isAdminChat, false))),
      db
        .select({
          generations: drizzleSql<number>`count(*)::int`,
          spend: drizzleSql<number>`coalesce(sum(${generations.costCents}), 0)::float`,
        })
        .from(generations)
        .where(eq(generations.userId, userId)),
      db
        .select({
          id: closetItems.id,
          category: closetItems.category,
          subcategory: closetItems.subcategory,
          primaryColor: closetItems.primaryColor,
          description: closetItems.description,
          createdAt: closetItems.createdAt,
        })
        .from(closetItems)
        .where(eq(closetItems.userId, userId))
        .orderBy(desc(closetItems.createdAt))
        .limit(20),
      db
        .select({
          id: outfits.id,
          rationale: outfits.rationale,
          saved: outfits.saved,
          createdAt: outfits.createdAt,
        })
        .from(outfits)
        .where(eq(outfits.userId, userId))
        .orderBy(desc(outfits.createdAt))
        .limit(20),
      db
        .select({
          id: chatConversations.id,
          title: chatConversations.title,
          messageCount: chatConversations.messageCount,
          lastMessageAt: chatConversations.lastMessageAt,
          createdAt: chatConversations.createdAt,
        })
        .from(chatConversations)
        .where(and(eq(chatConversations.userId, userId), eq(chatConversations.isAdminChat, false)))
        .orderBy(desc(chatConversations.createdAt))
        .limit(20),
      db
        .select({
          id: generations.id,
          operation: generations.operation,
          model: generations.model,
          costCents: generations.costCents,
          latencyMs: generations.latencyMs,
          createdAt: generations.createdAt,
        })
        .from(generations)
        .where(eq(generations.userId, userId))
        .orderBy(desc(generations.createdAt))
        .limit(20),
    ]);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        isAdmin: user.isAdmin,
        onboardingComplete: user.onboardingComplete,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      styleProfile: profile
        ? {
            id: profile.id,
            profileText: profile.profileText,
            updatedAt: profile.updatedAt.toISOString(),
          }
        : null,
      totals: {
        items: itemTotal,
        outfits: outfitTotal,
        conversations: convoTotal,
        generations: genTotal,
        spendCents: spend,
      },
      recentItems: recentItems.map((i) => ({
        id: i.id,
        category: i.category,
        subcategory: i.subcategory,
        primaryColor: i.primaryColor,
        description: i.description,
        createdAt: i.createdAt.toISOString(),
      })),
      recentOutfits: recentOutfits.map((o) => ({
        id: o.id,
        rationale: o.rationale,
        saved: o.saved,
        createdAt: o.createdAt.toISOString(),
      })),
      recentConversations: recentConversations.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messageCount,
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
      })),
      recentGenerations: recentGenerations.map((g) => ({
        id: g.id,
        operation: g.operation,
        model: g.model,
        costCents: g.costCents,
        latencyMs: g.latencyMs,
        createdAt: g.createdAt.toISOString(),
      })),
    };
  },
});

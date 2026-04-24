/**
 * Server-side user introspection queries for the admin dashboard.
 * Mirrors admin.listUsers + admin.getUserDetail; reads directly from
 * Postgres for /admin RSC pages.
 */
import 'server-only';
import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  _sql = postgres(process.env.DATABASE_URL!, {
    max: 3,
    idle_timeout: 10,
    connect_timeout: 10,
  });
  return _sql;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  isAdmin: boolean;
  onboardingComplete: boolean;
  itemCount: number;
  outfitCount: number;
  chatMessageCount: number;
  generationCount: number;
  spendCents: number;
  createdAt: string;
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      email: string | null;
      phone: string | null;
      display_name: string | null;
      is_admin: boolean;
      onboarding_complete: boolean;
      created_at: Date;
      item_count: number;
      outfit_count: number;
      chat_message_count: number;
      generation_count: number;
      spend_cents: number;
    }[]
  >`
    SELECT
      u.id,
      u.email,
      u.phone,
      u.display_name,
      u.is_admin,
      u.onboarding_complete,
      u.created_at,
      (SELECT count(*)::int FROM closet_items ci WHERE ci.user_id = u.id) AS item_count,
      (SELECT count(*)::int FROM outfits o WHERE o.user_id = u.id) AS outfit_count,
      (SELECT count(*)::int FROM chat_messages m
         JOIN chat_conversations c ON c.id = m.conversation_id
         WHERE c.user_id = u.id) AS chat_message_count,
      (SELECT count(*)::int FROM generations g WHERE g.user_id = u.id) AS generation_count,
      (SELECT COALESCE(SUM(g.cost_cents), 0)::float FROM generations g WHERE g.user_id = u.id) AS spend_cents
    FROM users u
    ORDER BY u.created_at DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    phone: r.phone,
    displayName: r.display_name,
    isAdmin: r.is_admin,
    onboardingComplete: r.onboarding_complete,
    itemCount: r.item_count,
    outfitCount: r.outfit_count,
    chatMessageCount: r.chat_message_count,
    generationCount: r.generation_count,
    spendCents: r.spend_cents,
    createdAt: r.created_at.toISOString(),
  }));
}

export interface AdminUserDetail {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    locale: string;
    isAdmin: boolean;
    onboardingComplete: boolean;
    createdAt: string;
    updatedAt: string;
  };
  styleProfile: {
    id: string;
    profileText: string;
    updatedAt: string;
  } | null;
  totals: {
    items: number;
    outfits: number;
    conversations: number;
    generations: number;
    spendCents: number;
  };
  recentItems: {
    id: string;
    category: string;
    subcategory: string | null;
    primaryColor: string;
    description: string | null;
    createdAt: string;
  }[];
  recentOutfits: {
    id: string;
    rationale: string;
    saved: boolean;
    createdAt: string;
  }[];
  recentConversations: {
    id: string;
    title: string | null;
    messageCount: number;
    lastMessageAt: string | null;
    createdAt: string;
  }[];
  recentGenerations: {
    id: string;
    operation: string;
    model: string;
    costCents: number;
    latencyMs: number;
    createdAt: string;
  }[];
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const sql = getSql();

  const [userRows, profileRows, [totals], items, outfits, convos, gens] = await Promise.all([
    sql<
      {
        id: string;
        email: string | null;
        phone: string | null;
        display_name: string | null;
        avatar_url: string | null;
        locale: string;
        is_admin: boolean;
        onboarding_complete: boolean;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      SELECT id, email, phone, display_name, avatar_url, locale, is_admin,
             onboarding_complete, created_at, updated_at
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `,
    sql<{ id: string; profile_text: string; updated_at: Date }[]>`
      SELECT id, profile_text, updated_at
      FROM style_profiles
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    sql<{ items: number; outfits: number; conversations: number; generations: number; spend_cents: number }[]>`
      SELECT
        (SELECT count(*)::int FROM closet_items WHERE user_id = ${userId}) AS items,
        (SELECT count(*)::int FROM outfits WHERE user_id = ${userId}) AS outfits,
        (SELECT count(*)::int FROM chat_conversations WHERE user_id = ${userId}) AS conversations,
        (SELECT count(*)::int FROM generations WHERE user_id = ${userId}) AS generations,
        (SELECT COALESCE(SUM(cost_cents), 0)::float FROM generations WHERE user_id = ${userId}) AS spend_cents
    `,
    sql<
      {
        id: string;
        category: string;
        subcategory: string | null;
        primary_color: string;
        description: string | null;
        created_at: Date;
      }[]
    >`
      SELECT id, category, subcategory, primary_color, description, created_at
      FROM closet_items
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `,
    sql<{ id: string; rationale: string; saved: boolean; created_at: Date }[]>`
      SELECT id, rationale, saved, created_at
      FROM outfits
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `,
    sql<
      {
        id: string;
        title: string | null;
        message_count: number;
        last_message_at: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT id, title, message_count, last_message_at, created_at
      FROM chat_conversations
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `,
    sql<
      {
        id: string;
        operation: string;
        model: string;
        cost_cents: number;
        latency_ms: number;
        created_at: Date;
      }[]
    >`
      SELECT id, operation, model, cost_cents, latency_ms, created_at
      FROM generations
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `,
  ]);

  if (userRows.length === 0) return null;
  const u = userRows[0];

  return {
    user: {
      id: u.id,
      email: u.email,
      phone: u.phone,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      locale: u.locale,
      isAdmin: u.is_admin,
      onboardingComplete: u.onboarding_complete,
      createdAt: u.created_at.toISOString(),
      updatedAt: u.updated_at.toISOString(),
    },
    styleProfile:
      profileRows.length > 0
        ? {
            id: profileRows[0].id,
            profileText: profileRows[0].profile_text,
            updatedAt: profileRows[0].updated_at.toISOString(),
          }
        : null,
    totals: {
      items: totals.items,
      outfits: totals.outfits,
      conversations: totals.conversations,
      generations: totals.generations,
      spendCents: totals.spend_cents,
    },
    recentItems: items.map((i) => ({
      id: i.id,
      category: i.category,
      subcategory: i.subcategory,
      primaryColor: i.primary_color,
      description: i.description,
      createdAt: i.created_at.toISOString(),
    })),
    recentOutfits: outfits.map((o) => ({
      id: o.id,
      rationale: o.rationale,
      saved: o.saved,
      createdAt: o.created_at.toISOString(),
    })),
    recentConversations: convos.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c.message_count,
      lastMessageAt: c.last_message_at ? c.last_message_at.toISOString() : null,
      createdAt: c.created_at.toISOString(),
    })),
    recentGenerations: gens.map((g) => ({
      id: g.id,
      operation: g.operation,
      model: g.model,
      costCents: g.cost_cents,
      latencyMs: g.latency_ms,
      createdAt: g.created_at.toISOString(),
    })),
  };
}

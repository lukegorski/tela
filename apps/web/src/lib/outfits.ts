/**
 * Server-side helpers for outfit pages. Loads outfits + their items + signed
 * image URLs in one pass.
 */
import 'server-only';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  _sql = postgres(process.env.DATABASE_URL!, {
    max: 5,
    idle_timeout: 10,
    connect_timeout: 10,
  });
  return _sql;
}

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (_supabase) return _supabase;
  _supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return _supabase;
}

export interface OutfitItemThumb {
  closetItemId: string;
  role: string;
  imageUrl: string | null;
  primaryColor: string;
  category: string;
}

export interface OutfitSummary {
  id: string;
  rationale: string;
  saved: boolean;
  createdAt: string;
  itemCount: number;
  thumbs: OutfitItemThumb[];
}

export async function getOutfitsForUser(userId: string): Promise<OutfitSummary[]> {
  const sql = getSql();
  const supabase = getSupabase();

  // Get outfits + their items + photo paths in one denormalized query
  const rows = await sql<
    {
      outfit_id: string;
      rationale: string;
      saved: boolean;
      created_at: Date;
      closet_item_id: string;
      role: string;
      primary_color: string;
      category: string;
      photo_storage_path: string | null;
      enhanced_storage_path: string | null;
    }[]
  >`
    SELECT
      o.id AS outfit_id,
      o.rationale,
      o.saved,
      o.created_at,
      oi.closet_item_id,
      oi.role,
      ci.primary_color,
      ci.category,
      ip.storage_path AS photo_storage_path,
      ip.enhanced_storage_path
    FROM outfits o
    JOIN outfit_items oi ON oi.outfit_id = o.id
    JOIN closet_items ci ON ci.id = oi.closet_item_id
    JOIN item_photos ip ON ip.id = ci.photo_id
    WHERE o.user_id = ${userId}
    ORDER BY o.created_at DESC
  `;

  // Group by outfit + sign URLs
  const byId = new Map<string, OutfitSummary>();
  for (const r of rows) {
    let outfit = byId.get(r.outfit_id);
    if (!outfit) {
      outfit = {
        id: r.outfit_id,
        rationale: r.rationale,
        saved: r.saved,
        createdAt: r.created_at.toISOString(),
        itemCount: 0,
        thumbs: [],
      };
      byId.set(r.outfit_id, outfit);
    }

    const path = r.enhanced_storage_path ?? r.photo_storage_path;
    let imageUrl: string | null = null;
    if (path) {
      const { data } = await supabase.storage
        .from('item-photos')
        .createSignedUrl(path, 600);
      imageUrl = data?.signedUrl ?? null;
    }

    outfit.thumbs.push({
      closetItemId: r.closet_item_id,
      role: r.role,
      imageUrl,
      primaryColor: r.primary_color,
      category: r.category,
    });
    outfit.itemCount++;
  }

  return Array.from(byId.values());
}

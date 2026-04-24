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

export interface OutfitDetailItem {
  closetItemId: string;
  role: string;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  description: string | null;
  imageUrl: string | null;
  backgroundColor: string | null;
}

export interface OutfitDetail {
  id: string;
  rationale: string;
  saved: boolean;
  pairingKey: string;
  createdAt: string;
  contextOccasion: string | null;
  items: OutfitDetailItem[];
}

export async function getOutfitForUser(
  userId: string,
  outfitId: string,
): Promise<OutfitDetail | null> {
  const sql = getSql();
  const supabase = getSupabase();

  const outfitRow = await sql<
    {
      id: string;
      rationale: string;
      saved: boolean;
      pairing_key: string;
      created_at: Date;
      context_occasion: string | null;
    }[]
  >`
    SELECT o.id, o.rationale, o.saved, o.pairing_key, o.created_at,
           c.occasion AS context_occasion
    FROM outfits o
    LEFT JOIN contexts c ON c.id = o.context_id
    WHERE o.id = ${outfitId} AND o.user_id = ${userId}
    LIMIT 1
  `;
  if (outfitRow.length === 0) return null;

  const itemRows = await sql<
    {
      closet_item_id: string;
      role: string;
      category: string;
      subcategory: string | null;
      primary_color: string;
      description: string | null;
      photo_storage_path: string;
      enhanced_storage_path: string | null;
      background_color: string | null;
    }[]
  >`
    SELECT
      oi.closet_item_id,
      oi.role,
      ci.category,
      ci.subcategory,
      ci.primary_color,
      ci.description,
      ip.storage_path AS photo_storage_path,
      ip.enhanced_storage_path,
      ip.background_color
    FROM outfit_items oi
    JOIN closet_items ci ON ci.id = oi.closet_item_id
    JOIN item_photos ip ON ip.id = ci.photo_id
    WHERE oi.outfit_id = ${outfitId}
  `;

  const items = await Promise.all(
    itemRows.map(async (r) => {
      const path = r.enhanced_storage_path ?? r.photo_storage_path;
      const { data } = await supabase.storage
        .from('item-photos')
        .createSignedUrl(path, 600);
      return {
        closetItemId: r.closet_item_id,
        role: r.role,
        category: r.category,
        subcategory: r.subcategory,
        primaryColor: r.primary_color,
        description: r.description,
        imageUrl: data?.signedUrl ?? null,
        backgroundColor: r.background_color,
      };
    }),
  );

  const o = outfitRow[0];
  return {
    id: o.id,
    rationale: o.rationale,
    saved: o.saved,
    pairingKey: o.pairing_key,
    createdAt: o.created_at.toISOString(),
    contextOccasion: o.context_occasion,
    items,
  };
}

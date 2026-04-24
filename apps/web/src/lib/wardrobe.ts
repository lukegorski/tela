/**
 * Server-side helpers for the wardrobe page.
 *
 * Loads closet items + generates short-lived signed URLs for the enhanced
 * photos in one pass. RSC pages call this directly so the rendered HTML
 * already has working <img src> URLs — no client-side roundtrip needed.
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

export interface WardrobeItem {
  id: string;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  description: string | null;
  wearCount: number;
  createdAt: string;
  enhancementStatus: string | null;
  /** Signed URL for the best available image (enhanced if ready, original otherwise) */
  imageUrl: string | null;
  backgroundColor: string | null;
}

const SIGNED_URL_TTL_SECONDS = 600;

export async function getWardrobeForUser(userId: string): Promise<WardrobeItem[]> {
  const sql = getSql();
  const supabase = getSupabase();

  // Join closet_items to item_photos via the photoId FK to get the storage path
  const rows = await sql<
    {
      id: string;
      category: string;
      subcategory: string | null;
      primary_color: string;
      description: string | null;
      wear_count: number;
      created_at: Date;
      photo_storage_path: string;
      enhancement_status: string | null;
      enhanced_storage_path: string | null;
      background_color: string | null;
    }[]
  >`
    SELECT
      ci.id,
      ci.category,
      ci.subcategory,
      ci.primary_color,
      ci.description,
      ci.wear_count,
      ci.created_at,
      ip.storage_path AS photo_storage_path,
      ip.enhancement_status,
      ip.enhanced_storage_path,
      ip.background_color
    FROM closet_items ci
    JOIN item_photos ip ON ip.id = ci.photo_id
    WHERE ci.user_id = ${userId}
    ORDER BY ci.created_at DESC
  `;

  // Sign URLs in parallel (one per item — Supabase doesn't have a batch API for this)
  const items = await Promise.all(
    rows.map(async (r) => {
      const path = r.enhanced_storage_path ?? r.photo_storage_path;
      const { data } = await supabase.storage
        .from('item-photos')
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      return {
        id: r.id,
        category: r.category,
        subcategory: r.subcategory,
        primaryColor: r.primary_color,
        description: r.description,
        wearCount: r.wear_count,
        createdAt: r.created_at.toISOString(),
        enhancementStatus: r.enhancement_status,
        imageUrl: data?.signedUrl ?? null,
        backgroundColor: r.background_color,
      };
    }),
  );

  return items;
}

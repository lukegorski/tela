/**
 * Server-side helper for the item detail page. Loads a single closet item
 * by ID, scoped to the current user, with a signed image URL.
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

export interface WardrobeItemDetail {
  id: string;
  category: string;
  subcategory: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  pattern: string | null;
  style: string | null;
  fit: string | null;
  length: string | null;
  sleeveLength: string | null;
  description: string | null;
  formalityScore: number;
  materialWeight: string;
  seasonCompatibility: string[];
  wearCount: number;
  enhancementStatus: string | null;
  imageUrl: string | null;
  backgroundColor: string | null;
  createdAt: string;
}

export async function getItemForUser(
  userId: string,
  itemId: string,
): Promise<WardrobeItemDetail | null> {
  const sql = getSql();
  const supabase = getSupabase();

  const rows = await sql<
    {
      id: string;
      category: string;
      subcategory: string | null;
      primary_color: string;
      secondary_color: string | null;
      pattern: string | null;
      style: string | null;
      fit: string | null;
      length: string | null;
      sleeve_length: string | null;
      description: string | null;
      formality_score: number;
      material_weight: string;
      season_compatibility: unknown;
      wear_count: number;
      created_at: Date;
      photo_storage_path: string;
      enhancement_status: string | null;
      enhanced_storage_path: string | null;
      background_color: string | null;
    }[]
  >`
    SELECT
      ci.id, ci.category, ci.subcategory, ci.primary_color, ci.secondary_color,
      ci.pattern, ci.style, ci.fit, ci.length, ci.sleeve_length, ci.description,
      ci.formality_score, ci.material_weight, ci.season_compatibility,
      ci.wear_count, ci.created_at,
      ip.storage_path AS photo_storage_path,
      ip.enhancement_status,
      ip.enhanced_storage_path,
      ip.background_color
    FROM closet_items ci
    JOIN item_photos ip ON ip.id = ci.photo_id
    WHERE ci.id = ${itemId} AND ci.user_id = ${userId}
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  const r = rows[0];

  const path = r.enhanced_storage_path ?? r.photo_storage_path;
  const { data: signed } = await supabase.storage
    .from('item-photos')
    .createSignedUrl(path, 600);

  return {
    id: r.id,
    category: r.category,
    subcategory: r.subcategory,
    primaryColor: r.primary_color,
    secondaryColor: r.secondary_color,
    pattern: r.pattern,
    style: r.style,
    fit: r.fit,
    length: r.length,
    sleeveLength: r.sleeve_length,
    description: r.description,
    formalityScore: r.formality_score,
    materialWeight: r.material_weight,
    seasonCompatibility: Array.isArray(r.season_compatibility)
      ? (r.season_compatibility as string[])
      : [],
    wearCount: r.wear_count,
    enhancementStatus: r.enhancement_status,
    imageUrl: signed?.signedUrl ?? null,
    backgroundColor: r.background_color,
    createdAt: r.created_at.toISOString(),
  };
}

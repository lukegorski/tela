import type { SupabaseClient } from '@supabase/supabase-js';

const SAFETY_MARGIN_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;

interface CacheEntry {
  url: string;
  /** Wall-clock ms when the URL itself expires (mint time + TTL). */
  expiresAt: number;
}

/**
 * Process-local LRU-ish cache for Supabase Storage signed URLs. Restart-
 * on-deploy clears it — no Redis, no persistence. Map preserves
 * insertion order, so the oldest entry is the head of `.keys()`; we
 * evict it when we hit MAX_CACHE_ENTRIES. The 2-minute safety margin
 * ensures we never hand back a URL that's seconds from expiry.
 *
 * Cache key is `${bucket}:${path}` so the same path in two buckets
 * doesn't collide. TTL is tracked per-entry via expiresAt so callers
 * with different TTLs (outfit.list at 600s vs tryon.getStatus at 3600s)
 * can share — the cached URL is whatever was signed last; any remaining
 * validity past the safety margin is good enough since the browser
 * fetches the image immediately.
 */
const cache = new Map<string, CacheEntry>();

function cacheKey(bucket: string, path: string): string {
  return `${bucket}:${path}`;
}

function getCached(bucket: string, path: string): string | null {
  const key = cacheKey(bucket, path);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now() + SAFETY_MARGIN_MS) {
    cache.delete(key);
    return null;
  }
  return entry.url;
}

function setCached(
  bucket: string,
  path: string,
  url: string,
  ttlSeconds: number,
): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey(bucket, path), {
    url,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Sign-or-cache a Supabase Storage path. Process-local cache shaves the
 * O(N) signing fanout on hot read paths (wardrobe.listItems,
 * outfit.list) after the first request. Marina's 59-item wardrobe was
 * 118 createSignedUrl calls per listItems; with this cache, subsequent
 * requests within the URL TTL collapse to zero signing round-trips.
 *
 * First request stays slow (cold cache) — that's acceptable for cutover.
 * Eventual pre-signing-at-upload is a follow-up workstream.
 */
export async function getOrSignUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  ttlSeconds: number,
): Promise<string | null> {
  const cached = getCached(bucket, path);
  if (cached) return cached;
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);
  if (data?.signedUrl) {
    setCached(bucket, path, data.signedUrl, ttlSeconds);
    return data.signedUrl;
  }
  return null;
}

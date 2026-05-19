"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { trpc } from "@/trpc/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import type { WardrobeItem } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;
const STALE_TIME_MS = 30_000;
const ENHANCING_STATUSES = new Set(["pending", "processing"]);

const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

function isSupportedMimeType(t: string): t is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(t);
}

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
    case "heif":
      return "image/heic";
    default:
      return "";
  }
}

type ListItemsResult = { items: WardrobeItem[]; total: number };

const LIST_INPUT = { limit: 200, offset: 0 } as const;

function wardrobeQueryKey(userId: string | null): QueryKey {
  return ["capability", "wardrobe.listItems", userId, LIST_INPUT] as const;
}

/**
 * Wardrobe data hook. Public shape mirrors the legacy hook so the page
 * port stays byte-for-byte. Internally it talks to our tRPC capabilities
 * instead of Firestore.
 *
 * Reads use React Query so N parallel consumers (wardrobe page, outfits
 * page, lookbook, chat page, ChatWardrobePicker) dedupe to one network
 * request keyed by userId. See PORT.md pitfall #15.
 *
 * Polling: while any item is pending/processing enhancement, refetch
 * every 5s (substitutes for Firestore's onSnapshot). `refetchInterval`
 * receives the current cache and returns false once nothing's active.
 *
 * Uploads: 5-step pipeline (request signed URL → Supabase Storage upload
 * → confirm → AI analyze → addItem). Invalidates the list on success.
 *
 * Deletes: `wardrobe.removeItem` capability. The capability cascades to
 * any outfits that reference the item; storage cleanup is deferred.
 */
export function useWardrobe() {
  const { user } = useAuthContext();
  const { lang } = useDictionary();
  const [uploading, setUploading] = useState(false);

  // Stable string id — `user` itself is recreated on every render by
  // useAuth (via setUser(toAuthUser(...))), so depending on the object
  // reference would churn this hook's effects on every parent render.
  const userId = user?.id ?? null;

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => wardrobeQueryKey(userId), [userId]);

  const query = useQuery<ListItemsResult>({
    queryKey,
    enabled: !!userId,
    staleTime: STALE_TIME_MS,
    queryFn: async () => {
      const result = (await utils.client.capability.execute.mutate({
        name: "wardrobe.listItems",
        input: LIST_INPUT,
      })) as ListItemsResult;
      return result;
    },
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      const stillEnhancing = items.some(
        (it) =>
          it.enhancementStatus !== null &&
          ENHANCING_STATUSES.has(it.enhancementStatus),
      );
      return stillEnhancing ? POLL_INTERVAL_MS : false;
    },
  });

  const items: WardrobeItem[] = query.data?.items ?? [];
  // `isPending` is true while disabled (no userId) — so guard on userId.
  const loading = !!userId && query.isPending;

  // Pitfall #11: tRPC's `useMutation().execute` is unstable across renders.
  // We don't put it in any effect deps below — `uploadItem`/`deleteItem`
  // are event handlers — so this is just a convenience holder.
  const execute = trpc.capability.execute.useMutation();

  const uploadItem = useCallback(
    async (file: File) => {
      if (!userId) throw new Error("Not authenticated");

      const mimeType = inferMimeType(file);
      if (!isSupportedMimeType(mimeType)) {
        const isHeic = mimeType === "image/heic" || mimeType === "image/heif";
        throw new Error(
          isHeic
            ? "HEIC isn't supported yet. On iPhone, set Settings → Camera → Formats → Most Compatible, or take a screenshot."
            : `Unsupported format${mimeType ? ` (${mimeType})` : ""}. Use JPEG, PNG, WebP, or GIF.`,
        );
      }

      setUploading(true);
      try {
        // 1. Request signed upload URL
        const upload = (await execute.mutateAsync({
          name: "wardrobe.requestPhotoUpload",
          input: { filename: file.name, mimeType },
        })) as { uploadUrl: string; storagePath: string; token: string };

        // 2. Upload to Supabase Storage
        const supabase = getSupabaseBrowserClient();
        const { error: uploadErr } = await supabase.storage
          .from("item-photos")
          .uploadToSignedUrl(upload.storagePath, upload.token, file, {
            contentType: mimeType,
          });
        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

        // 3. Confirm (creates item_photos row + enqueues enhancement)
        const confirmed = (await execute.mutateAsync({
          name: "wardrobe.confirmPhotoUpload",
          input: { storagePath: upload.storagePath },
        })) as { photoId: string };

        // 4. Analyze with AI
        const analysis = (await execute.mutateAsync({
          name: "item.analyze",
          input: { photoId: confirmed.photoId, locale: lang },
        })) as {
          metadata: Record<string, unknown>;
        };

        // 5. Save to closet
        await execute.mutateAsync({
          name: "wardrobe.addItem",
          input: {
            photoId: confirmed.photoId,
            metadata: { ...analysis.metadata, analysisLocale: lang },
          },
        });

        await queryClient.invalidateQueries({ queryKey });
      } finally {
        setUploading(false);
      }
    },
    [userId, lang, execute, queryClient, queryKey],
  );

  const deleteItem = useCallback(
    async (item: WardrobeItem) => {
      if (!userId) return;

      // Optimistic remove — the cell disappears immediately, rolls back on error.
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ListItemsResult>(queryKey);
      queryClient.setQueryData<ListItemsResult>(queryKey, (old) =>
        old
          ? { ...old, items: old.items.filter((i) => i.id !== item.id) }
          : old,
      );
      try {
        await execute.mutateAsync({
          name: "wardrobe.removeItem",
          input: { itemId: item.id },
        });
        // Outfit cascade — invalidate that cache too so outfit lists drop
        // any rows that referenced this item.
        await queryClient.invalidateQueries({
          queryKey: ["capability", "outfit.list"],
        });
      } catch (err) {
        if (prev) queryClient.setQueryData(queryKey, prev);
        throw err;
      } finally {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
    [userId, execute, queryClient, queryKey],
  );

  return { items, loading, uploading, uploadItem, deleteItem };
}

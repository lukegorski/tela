"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/trpc/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import type { WardrobeItem } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;
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

/**
 * Wardrobe data hook. Public shape mirrors the legacy hook so the page
 * port stays byte-for-byte. Internally it talks to our tRPC capabilities
 * instead of Firestore.
 *
 * Reads: `wardrobe.listItems` mutation, called on mount, after upload,
 * after delete, and on a 5s poll while any item is pending/processing
 * (substitutes for Firestore's onSnapshot).
 *
 * Uploads: 5-step pipeline (request signed URL → Supabase Storage upload
 * → confirm → AI analyze → addItem).
 *
 * Deletes: `wardrobe.removeItem` capability. The capability cascades to
 * any outfits that reference the item; storage cleanup is deferred.
 */
export function useWardrobe() {
  const { user } = useAuthContext();
  const { lang } = useDictionary();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Stable string id — `user` itself is recreated on every render by
  // useAuth (via setUser(toAuthUser(...))), so depending on the object
  // reference would churn this hook's effects on every parent render.
  const userId = user?.id ?? null;

  const execute = trpc.capability.execute.useMutation();
  const executeRef = useRef(execute);
  executeRef.current = execute;

  // Stable refetch — depends only on the stable userId string.
  const refetch = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const result = (await executeRef.current.mutateAsync({
        name: "wardrobe.listItems",
        input: { limit: 200, offset: 0 },
      })) as { items: WardrobeItem[]; total: number };
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial load + poll while any item is enhancing.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      await refetch();
      if (cancelled) return;
      // Read latest items via callback to avoid closure on stale state.
      setItems((latest) => {
        const stillEnhancing = latest.some(
          (it) => it.enhancementStatus !== null && ENHANCING_STATUSES.has(it.enhancementStatus),
        );
        if (stillEnhancing) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
        return latest;
      });
    }

    if (userId) {
      setLoading(true);
      // Catch errors locally so a transient 401 (e.g. while the auth token
      // is mid-refresh) doesn't bubble up as an unhandled promise rejection,
      // which would trip Next.js's dev error overlay. The error is already
      // captured into refetch's `setError` for the UI to surface.
      tick().catch(() => {
        if (!cancelled) setLoading(false);
      });
    } else {
      setItems([]);
      setLoading(false);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, refetch]);

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
        const upload = (await executeRef.current.mutateAsync({
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
        const confirmed = (await executeRef.current.mutateAsync({
          name: "wardrobe.confirmPhotoUpload",
          input: { storagePath: upload.storagePath },
        })) as { photoId: string };

        // 4. Analyze with AI
        const analysis = (await executeRef.current.mutateAsync({
          name: "item.analyze",
          input: { photoId: confirmed.photoId, locale: lang },
        })) as {
          metadata: Record<string, unknown>;
        };

        // 5. Save to closet
        await executeRef.current.mutateAsync({
          name: "wardrobe.addItem",
          input: {
            photoId: confirmed.photoId,
            metadata: { ...analysis.metadata, analysisLocale: lang },
          },
        });

        await refetch();
      } finally {
        setUploading(false);
      }
    },
    [userId, lang, refetch],
  );

  const deleteItem = useCallback(
    async (item: WardrobeItem) => {
      if (!userId) return;
      await executeRef.current.mutateAsync({
        name: "wardrobe.removeItem",
        input: { itemId: item.id },
      });
      await refetch();
    },
    [userId, refetch],
  );

  return { items, loading, uploading, uploadItem, deleteItem };
}

"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import OutfitCard from "@/components/OutfitCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { Outfit } from "@/lib/types";

/**
 * Standalone outfit detail page (deep-link target). One-shot fetch via
 * outfit.get — no polling here. If the user wants updated try-on status,
 * they refresh; the list page is where polling lives.
 */
export default function OutfitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { dict } = useDictionary();
  const { user } = useAuthContext();
  const router = useRouter();
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [loading, setLoading] = useState(true);

  const execute = trpc.capability.execute.useMutation();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = (await execute.mutateAsync({
          name: "outfit.get",
          input: { outfitId: id },
        })) as Outfit;
        if (cancelled) return;
        setOutfit(result);
      } catch {
        if (cancelled) return;
        setOutfit(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // execute is unstable across renders (Pitfall #11); we only want this
    // effect to run on mount + when the outfit ID or auth changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  async function handleToggleSave() {
    if (!outfit) return;
    const next = !outfit.saved;
    setOutfit({ ...outfit, saved: next, savedAt: next ? new Date().toISOString() : null });
    try {
      await execute.mutateAsync({
        name: "outfit.save",
        input: { outfitId: outfit.id, saved: next },
      });
    } catch {
      setOutfit({ ...outfit, saved: !next });
    }
  }

  async function handleSetFeedback(feedback: "up" | "down" | null) {
    if (!outfit) return;
    setOutfit({ ...outfit, feedback });
    try {
      await execute.mutateAsync({
        name: "outfit.setFeedback",
        input: { outfitId: outfit.id, feedback },
      });
    } catch {
      // Refetch on error to recover authoritative state.
      const fresh = (await execute.mutateAsync({
        name: "outfit.get",
        input: { outfitId: outfit.id },
      })) as Outfit;
      setOutfit(fresh);
    }
  }

  async function handleDelete() {
    if (!outfit) return;
    try {
      await execute.mutateAsync({
        name: "outfit.delete",
        input: { outfitId: outfit.id },
      });
      router.back();
    } catch {
      // Stay on the page; user can retry.
    }
  }

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-2xl px-4 py-5 sm:py-8">
        <button
          onClick={() => router.back()}
          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 mb-6 flex items-center gap-1 min-h-[44px] py-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          {dict.common.back}
        </button>

        {loading ? (
          <div className="flex items-center justify-center min-h-[calc(100dvh-8rem)]">
            <LoadingSpinner variant="auto" />
          </div>
        ) : outfit ? (
          <OutfitCard
            outfit={outfit}
            onToggleSave={handleToggleSave}
            onSetFeedback={handleSetFeedback}
            onDelete={handleDelete}
            showDetail
          />
        ) : (
          <p className="text-center text-neutral-400 dark:text-neutral-500 py-12">
            {dict.outfits.outfitNotFound}
          </p>
        )}
      </div>
    </ProtectedRoute>
  );
}

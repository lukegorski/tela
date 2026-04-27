"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/trpc/client";
import { useAuthContext } from "@/components/AuthProvider";
import type { Outfit } from "@/lib/types";

type TryOnStatus = NonNullable<Outfit["tryOn"]>["status"];

/** Polling cadence while any try-on job is pending or running. */
const TRY_ON_POLL_MS = 2500;
/** Statuses that mean we should keep polling. */
const ACTIVE_TRY_ON_STATUSES = new Set<TryOnStatus>(["pending", "running"]);

/**
 * Outfits data hook. Public shape mirrors the legacy outfits page's
 * inline state so the UI port stays close to the original. Internally:
 *
 *  - Reads via `outfit.list` (rich shape — items + signed URLs + latest
 *    try-on) on mount and after every mutation.
 *  - `savedOnly` mode (lookbook): pulls only saved outfits sorted by
 *    `savedAt` desc, and `toggleSave(unsave)` filters the row out of
 *    local state so the cell disappears immediately rather than after
 *    refetch (mirrors legacy lookbook handleOutfitUpdate L168–179).
 *  - Try-on polling: scans the current outfits for any whose latest
 *    `tryOn.status` is `pending` | `running` and polls `tryon.getStatus`
 *    every TRY_ON_POLL_MS until they settle. This subsumes the legacy
 *    "resume in-flight pipelines on page reload" logic — the worker
 *    runs server-side, so we just need to know when it's done.
 *  - Generate / save / setFeedback / delete / triggerTryOn mutations
 *    refetch on success.
 *  - Optimistic insert on generate so the new cell appears instantly
 *    and the spinner placeholder is replaced without a Firestore-listener
 *    style fade-in.
 *  - In-flight `triggerTryOn` calls are tracked in a ref `Set<string>`
 *    so a double-tap can't fire two enqueues.
 *
 * Pitfall #11 mitigation: tRPC's `useMutation().execute` is unstable
 * across renders. We stash it in a ref and reference `.current` from
 * effects — only `userId` (and `savedOnly`) need to be in dep arrays.
 * `savedOnly` is destructured into a primitive at the top of the hook
 * before any dep array touches it; if the caller passes a fresh `opts`
 * object every render, only the primitive value changes drive re-runs.
 */
export function useOutfits(opts?: { savedOnly?: boolean }) {
  const { savedOnly = false } = opts ?? {};
  const { user } = useAuthContext();
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? null;

  const execute = trpc.capability.execute.useMutation();
  const executeRef = useRef(execute);
  executeRef.current = execute;

  /** outfitIds we've already fired tryon.generate for and are still waiting on. */
  const triggeredTryOnsRef = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    if (!userId) {
      setOutfits([]);
      setLoading(false);
      return;
    }
    try {
      const result = (await executeRef.current.mutateAsync({
        name: "outfit.list",
        input: {
          savedOnly,
          orderBy: savedOnly ? "savedAt" : "createdAt",
          limit: 100,
          offset: 0,
        },
      })) as { outfits: Outfit[]; total: number };
      setOutfits(result.outfits);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId, savedOnly]);

  // Initial load.
  useEffect(() => {
    if (userId) {
      setLoading(true);
      void refetch();
    } else {
      setOutfits([]);
      setLoading(false);
    }
  }, [userId, refetch]);

  // Poll active try-on jobs. Triggered whenever the outfits list changes
  // and any outfit has an active try-on. Polls every TRY_ON_POLL_MS until
  // none are active. Re-fetches the full list on transition so signed
  // URLs and item rows stay consistent.
  useEffect(() => {
    const hasActive = outfits.some(
      (o) => o.tryOn !== null && ACTIVE_TRY_ON_STATUSES.has(o.tryOn.status),
    );
    if (!hasActive) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      // Re-fetch the whole list — cheap given our scale, and keeps the
      // try-on completion in sync with item / signed-URL changes.
      try {
        const result = (await executeRef.current.mutateAsync({
          name: "outfit.list",
          input: {
            savedOnly,
            orderBy: savedOnly ? "savedAt" : "createdAt",
            limit: 100,
            offset: 0,
          },
        })) as { outfits: Outfit[]; total: number };
        if (cancelled) return;
        setOutfits(result.outfits);

        // Clear in-flight markers for any outfit that's now settled.
        for (const o of result.outfits) {
          if (
            o.tryOn !== null &&
            (o.tryOn.status === "complete" || o.tryOn.status === "failed")
          ) {
            triggeredTryOnsRef.current.delete(o.id);
          }
        }

        const stillActive = result.outfits.some(
          (o) => o.tryOn !== null && ACTIVE_TRY_ON_STATUSES.has(o.tryOn.status),
        );
        if (stillActive && !cancelled) {
          timer = setTimeout(tick, TRY_ON_POLL_MS);
        }
      } catch {
        // Soft-fail; try again on the next tick.
        if (!cancelled) timer = setTimeout(tick, TRY_ON_POLL_MS);
      }
    }

    timer = setTimeout(tick, TRY_ON_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [outfits, savedOnly]);

  /**
   * Generate a single outfit for the given occasion. Mirrors legacy:
   * builds context client-side via context.assemble, then calls
   * outfit.generate. Since D.9c the capability returns the rich shape
   * (items + signed URLs + initial tryOn=null) inline, so we just prepend
   * to local state — no refetch needed. The spinner cell hides as soon
   * as setOutfits runs.
   */
  const generateOutfit = useCallback(
    async (occasion?: string) => {
      if (!userId) return;
      setGenerating(true);
      setError(null);
      try {
        const ctx = (await executeRef.current.mutateAsync({
          name: "context.assemble",
          input: { occasion: occasion ?? "Everyday" },
        })) as { contextId: string };

        const generated = (await executeRef.current.mutateAsync({
          name: "outfit.generate",
          input: { contextId: ctx.contextId, count: 1 },
        })) as {
          outfits: Outfit[];
          generationId: string;
          duplicatesRejected: number;
        };

        if (generated.outfits.length > 0) {
          setOutfits((prev) => [...generated.outfits, ...prev]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setGenerating(false);
      }
    },
    [userId],
  );

  const toggleSave = useCallback(
    async (outfitId: string, saved: boolean) => {
      if (!userId) return;
      // Optimistic flip — UI animates immediately; rollback on error.
      // In savedOnly mode (lookbook), an unsave should also remove the row
      // from local state so the cell disappears from the grid immediately,
      // mirroring the legacy lookbook handleOutfitUpdate behavior.
      setOutfits((prev) => {
        if (savedOnly && !saved) {
          return prev.filter((o) => o.id !== outfitId);
        }
        return prev.map((o) =>
          o.id === outfitId
            ? { ...o, saved, savedAt: saved ? new Date().toISOString() : null }
            : o,
        );
      });
      try {
        await executeRef.current.mutateAsync({
          name: "outfit.save",
          input: { outfitId, saved },
        });
      } catch (err) {
        // Rollback by refetching the authoritative state.
        await refetch();
        throw err;
      }
    },
    [userId, refetch, savedOnly],
  );

  const setFeedback = useCallback(
    async (outfitId: string, feedback: "up" | "down" | null) => {
      if (!userId) return;
      // Optimistic flip.
      setOutfits((prev) =>
        prev.map((o) => (o.id === outfitId ? { ...o, feedback } : o)),
      );
      try {
        await executeRef.current.mutateAsync({
          name: "outfit.setFeedback",
          input: { outfitId, feedback },
        });
      } catch (err) {
        await refetch();
        throw err;
      }
    },
    [userId, refetch],
  );

  const removeOutfit = useCallback(
    async (outfitId: string) => {
      if (!userId) return;
      // Optimistic remove.
      setOutfits((prev) => prev.filter((o) => o.id !== outfitId));
      triggeredTryOnsRef.current.delete(outfitId);
      try {
        await executeRef.current.mutateAsync({
          name: "outfit.delete",
          input: { outfitId },
        });
      } catch (err) {
        await refetch();
        throw err;
      }
    },
    [userId, refetch],
  );

  /**
   * Enqueue a Fashn try-on for the outfit. Returns immediately — the
   * server-side worker runs the pipeline; we'll see the resultUrl appear
   * via the polling effect above.
   *
   * Guarded against double-taps via triggeredTryOnsRef. The guard clears
   * when polling sees the outfit settle.
   */
  const triggerTryOn = useCallback(
    async (outfitId: string, force = false) => {
      if (!userId) return;
      if (triggeredTryOnsRef.current.has(outfitId)) return;
      triggeredTryOnsRef.current.add(outfitId);

      // Optimistically flip the cell into pending so the spinner shows
      // before the server round-trip completes. The poll loop reconciles.
      setOutfits((prev) =>
        prev.map((o) =>
          o.id === outfitId
            ? {
                ...o,
                tryOn: {
                  jobId: o.tryOn?.jobId ?? "pending",
                  status: "pending" as const,
                  resultUrl: null,
                  costCents: 0,
                  error: null,
                  asyncStep: null,
                  model: o.tryOn?.model ?? null,
                },
              }
            : o,
        ),
      );

      try {
        await executeRef.current.mutateAsync({
          name: "tryon.generate",
          input: { outfitId, force },
        });
      } catch (err) {
        // Roll back the optimistic flip + clear the in-flight marker.
        triggeredTryOnsRef.current.delete(outfitId);
        await refetch();
        throw err;
      }
    },
    [userId, refetch],
  );

  return {
    outfits,
    loading,
    generating,
    error,
    refetch,
    generateOutfit,
    toggleSave,
    setFeedback,
    removeOutfit,
    triggerTryOn,
  };
}

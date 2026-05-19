"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { trpc } from "@/trpc/client";
import { useAuthContext } from "@/components/AuthProvider";
import type { Outfit } from "@/lib/types";

type TryOnStatus = NonNullable<Outfit["tryOn"]>["status"];

/** Polling cadence while any try-on job is pending or running. */
const TRY_ON_POLL_MS = 2500;
const STALE_TIME_MS = 30_000;
/** Statuses that mean we should keep polling. */
const ACTIVE_TRY_ON_STATUSES = new Set<TryOnStatus>(["pending", "running"]);

type ListResult = { outfits: Outfit[]; total: number };

function outfitsQueryKey(
  userId: string | null,
  savedOnly: boolean,
): QueryKey {
  return ["capability", "outfit.list", userId, { savedOnly }] as const;
}

/**
 * Outfits data hook. Public shape mirrors the legacy outfits page's
 * inline state so the UI port stays close to the original. Internally:
 *
 *  - Reads via `outfit.list` (rich shape — items + signed URLs + latest
 *    try-on) through React Query so N parallel consumers (outfits page,
 *    lookbook, chat page) dedupe to one network request per (userId,
 *    savedOnly) combo. See PORT.md pitfall #15.
 *  - `savedOnly` mode (lookbook): pulls only saved outfits sorted by
 *    `savedAt` desc, and `toggleSave(unsave)` filters the row out of
 *    the cache so the cell disappears immediately rather than after
 *    refetch (mirrors legacy lookbook handleOutfitUpdate L168–179).
 *  - Try-on polling: `refetchInterval` returns 2500ms whenever any
 *    outfit has `tryOn.status` in {pending, running}, false otherwise.
 *    This subsumes the legacy "resume in-flight pipelines on page reload"
 *    logic — the worker runs server-side, so we just need to know when
 *    it's done.
 *  - Generate / save / setFeedback / delete / triggerTryOn manipulate the
 *    cached query data optimistically; invalidation on settle reconciles.
 *  - Optimistic insert on generate so the new cell appears instantly
 *    and the spinner placeholder is replaced without a Firestore-listener
 *    style fade-in.
 *  - In-flight `triggerTryOn` calls are tracked in a ref `Set<string>`
 *    so a double-tap can't fire two enqueues.
 *
 * Pitfall #11/#13: `savedOnly` is destructured to a primitive at the top
 * of the hook before any memo/effect touches it, so callers passing a
 * fresh `opts` object each render don't churn the query key.
 */
export function useOutfits(opts?: { savedOnly?: boolean }) {
  const { savedOnly = false } = opts ?? {};
  const { user } = useAuthContext();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? null;

  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => outfitsQueryKey(userId, savedOnly),
    [userId, savedOnly],
  );

  /** outfitIds we've already fired tryon.generate for and are still waiting on. */
  const triggeredTryOnsRef = useRef<Set<string>>(new Set());

  const query = useQuery<ListResult>({
    queryKey,
    enabled: !!userId,
    staleTime: STALE_TIME_MS,
    queryFn: async () => {
      const result = (await utils.client.capability.execute.mutate({
        name: "outfit.list",
        input: {
          savedOnly,
          orderBy: savedOnly ? "savedAt" : "createdAt",
          limit: 100,
          offset: 0,
        },
      })) as ListResult;

      // Clear in-flight markers for any outfit that's now settled. Safe
      // to do inside queryFn — runs on every successful fetch.
      for (const o of result.outfits) {
        if (
          o.tryOn !== null &&
          (o.tryOn.status === "complete" || o.tryOn.status === "failed")
        ) {
          triggeredTryOnsRef.current.delete(o.id);
        }
      }
      return result;
    },
    refetchInterval: (q) => {
      const outfits = q.state.data?.outfits ?? [];
      const hasActive = outfits.some(
        (o) =>
          o.tryOn !== null && ACTIVE_TRY_ON_STATUSES.has(o.tryOn.status),
      );
      return hasActive ? TRY_ON_POLL_MS : false;
    },
  });

  const outfits: Outfit[] = query.data?.outfits ?? [];
  const loading = !!userId && query.isPending;
  // Surface fetch errors via the same `error` channel the legacy hook
  // used. Query errors take precedence over mutation errors set below.
  const queryError = query.error
    ? query.error instanceof Error
      ? query.error.message
      : String(query.error)
    : null;
  const exposedError = queryError ?? error;

  const execute = trpc.capability.execute.useMutation();

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  /**
   * Generate a single outfit for the given occasion. Mirrors legacy:
   * builds context client-side via context.assemble, then calls
   * outfit.generate. Since D.9c the capability returns the rich shape
   * (items + signed URLs + initial tryOn=null) inline, so we just prepend
   * to the cached list — no refetch needed. The spinner cell hides as
   * soon as setQueryData runs.
   */
  const generateOutfit = useCallback(
    async (occasion?: string) => {
      if (!userId) return;
      setGenerating(true);
      setError(null);
      try {
        const ctx = (await execute.mutateAsync({
          name: "context.assemble",
          input: { occasion: (occasion ?? "Everyday").toLowerCase().replace(/ /g, "_") },
        })) as { contextId: string };

        const generated = (await execute.mutateAsync({
          name: "outfit.generate",
          input: { contextId: ctx.contextId, count: 1 },
        })) as {
          outfits: Outfit[];
          generationId: string;
          duplicatesRejected: number;
        };

        if (generated.outfits.length > 0) {
          queryClient.setQueryData<ListResult>(queryKey, (old) => {
            if (!old) {
              return {
                outfits: generated.outfits,
                total: generated.outfits.length,
              };
            }
            return {
              ...old,
              outfits: [...generated.outfits, ...old.outfits],
              total: old.total + generated.outfits.length,
            };
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setGenerating(false);
      }
    },
    [userId, execute, queryClient, queryKey],
  );

  const toggleSave = useCallback(
    async (outfitId: string, saved: boolean) => {
      if (!userId) return;
      // In savedOnly mode (lookbook), an unsave should also remove the row
      // from the cache so the cell disappears from the grid immediately,
      // mirroring the legacy lookbook handleOutfitUpdate behavior.
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ListResult>(queryKey);
      queryClient.setQueryData<ListResult>(queryKey, (old) => {
        if (!old) return old;
        if (savedOnly && !saved) {
          const next = old.outfits.filter((o) => o.id !== outfitId);
          return { ...old, outfits: next, total: next.length };
        }
        return {
          ...old,
          outfits: old.outfits.map((o) =>
            o.id === outfitId
              ? { ...o, saved, savedAt: saved ? new Date().toISOString() : null }
              : o,
          ),
        };
      });
      try {
        await execute.mutateAsync({
          name: "outfit.save",
          input: { outfitId, saved },
        });
      } catch (err) {
        if (prev) queryClient.setQueryData(queryKey, prev);
        throw err;
      } finally {
        // Settle: refetch the authoritative state. Cheap given staleTime
        // dedupes; cells stay correct if the optimistic shape drifts.
        await queryClient.invalidateQueries({ queryKey });
      }
    },
    [userId, execute, queryClient, queryKey, savedOnly],
  );

  const setFeedback = useCallback(
    async (outfitId: string, feedback: "up" | "down" | null) => {
      if (!userId) return;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ListResult>(queryKey);
      queryClient.setQueryData<ListResult>(queryKey, (old) =>
        old
          ? {
              ...old,
              outfits: old.outfits.map((o) =>
                o.id === outfitId ? { ...o, feedback } : o,
              ),
            }
          : old,
      );
      try {
        await execute.mutateAsync({
          name: "outfit.setFeedback",
          input: { outfitId, feedback },
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

  const removeOutfit = useCallback(
    async (outfitId: string) => {
      if (!userId) return;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ListResult>(queryKey);
      queryClient.setQueryData<ListResult>(queryKey, (old) =>
        old
          ? {
              ...old,
              outfits: old.outfits.filter((o) => o.id !== outfitId),
            }
          : old,
      );
      triggeredTryOnsRef.current.delete(outfitId);
      try {
        await execute.mutateAsync({
          name: "outfit.delete",
          input: { outfitId },
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

  /**
   * Enqueue a Fashn try-on for the outfit. Returns immediately — the
   * server-side worker runs the pipeline; we'll see the resultUrl appear
   * via the refetchInterval poll above.
   *
   * Guarded against double-taps via triggeredTryOnsRef. The guard clears
   * when polling sees the outfit settle (queryFn above), or here on error.
   */
  const triggerTryOn = useCallback(
    async (outfitId: string, force = false) => {
      if (!userId) return;
      if (triggeredTryOnsRef.current.has(outfitId)) return;
      triggeredTryOnsRef.current.add(outfitId);

      // Optimistically flip the cell into pending so the spinner shows
      // before the server round-trip completes. The poll loop reconciles.
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ListResult>(queryKey);
      queryClient.setQueryData<ListResult>(queryKey, (old) =>
        old
          ? {
              ...old,
              outfits: old.outfits.map((o) =>
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
            }
          : old,
      );

      try {
        await execute.mutateAsync({
          name: "tryon.generate",
          input: { outfitId, force },
        });
      } catch (err) {
        triggeredTryOnsRef.current.delete(outfitId);
        if (prev) queryClient.setQueryData(queryKey, prev);
        throw err;
      } finally {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
    [userId, execute, queryClient, queryKey],
  );

  return {
    outfits,
    loading,
    generating,
    error: exposedError,
    refetch,
    generateOutfit,
    toggleSave,
    setFeedback,
    removeOutfit,
    triggerTryOn,
  };
}

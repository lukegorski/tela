'use client';

/**
 * Try-on launcher + result viewer for an outfit.
 *
 * On mount, polls tryon.getStatus to check if a result already exists.
 * If yes, renders the image. If not, shows a "Try it on" button that
 * runs tryon.generate (synchronous for the dress + standard pipelines).
 *
 * No streaming yet — Fashn's tryon-v1.6 takes 20–40 seconds, and
 * standard outfits run two of those serially. The button shows
 * "Generating… (this takes ~30 seconds)" so the user knows to wait.
 *
 * If the outfit contains outerwear, the server rejects the call. We
 * surface that as a clear error rather than silently failing.
 */
import { useEffect, useState } from 'react';
import { trpc } from '@/trpc/client';

interface Props {
  outfitId: string;
  /**
   * Server-rendered initial state (from getOutfitForUser → getTryOnStatus
   * via lib/outfit-detail.ts). Lets the button avoid a flash of "Try it
   * on" before the existing result loads.
   */
  initial: {
    status: 'pending' | 'running' | 'complete' | 'failed' | null;
    resultUrl: string | null;
    error: string | null;
  };
}

type Status = 'idle' | 'running' | 'complete' | 'failed';

export function TryOnButton({ outfitId, initial }: Props) {
  const [status, setStatus] = useState<Status>(
    initial.status === 'complete'
      ? 'complete'
      : initial.status === 'running'
        ? 'running'
        : initial.status === 'failed'
          ? 'failed'
          : 'idle',
  );
  const [resultUrl, setResultUrl] = useState<string | null>(initial.resultUrl);
  const [error, setError] = useState<string | null>(initial.error);

  const execute = trpc.capability.execute.useMutation();

  // If an existing job is mid-flight, poll until it's done.
  useEffect(() => {
    if (status !== 'running') return;

    let cancelled = false;
    const tick = async () => {
      try {
        const result = (await execute.mutateAsync({
          name: 'tryon.getStatus',
          input: { outfitId },
        })) as {
          status: 'pending' | 'running' | 'complete' | 'failed' | null;
          resultUrl: string | null;
          error: string | null;
        };
        if (cancelled) return;
        if (result.status === 'complete') {
          setStatus('complete');
          setResultUrl(result.resultUrl);
        } else if (result.status === 'failed') {
          setStatus('failed');
          setError(result.error);
        }
      } catch {
        // Soft-fail; let the next tick try again.
      }
    };
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status, outfitId, execute]);

  async function handleTryOn(force = false) {
    setStatus('running');
    setError(null);
    try {
      const result = (await execute.mutateAsync({
        name: 'tryon.generate',
        input: { outfitId, force },
      })) as {
        status: 'pending' | 'running' | 'complete' | 'failed';
        resultUrl: string | null;
        error: string | null;
      };
      if (result.status === 'complete') {
        setStatus('complete');
        setResultUrl(result.resultUrl);
      } else if (result.status === 'failed') {
        setStatus('failed');
        setError(result.error);
      } else {
        // Still running (shouldn't happen with sync pipelines, but defend)
        setStatus('running');
      }
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'complete' && resultUrl) {
    return (
      <div className="space-y-3 border-t border-stone-200 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-stone-400">Try-on</p>
          <button
            type="button"
            onClick={() => handleTryOn(true)}
            disabled={execute.isPending}
            className="text-xs text-stone-500 hover:text-stone-900 transition-colors"
          >
            Regenerate
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resultUrl}
          alt="Try-on result"
          className="w-full max-w-md mx-auto"
        />
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="border-t border-stone-200 pt-5">
        <p className="text-xs uppercase tracking-widest text-stone-400 mb-2">Try-on</p>
        <p className="text-sm text-stone-500 italic">
          Generating try-on… (~30 seconds for a single piece, ~60 seconds for top + bottom)
        </p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="border-t border-stone-200 pt-5 space-y-2">
        <p className="text-xs uppercase tracking-widest text-stone-400">Try-on</p>
        <p className="text-sm text-red-600">Try-on failed: {error ?? 'unknown error'}</p>
        <button
          type="button"
          onClick={() => handleTryOn(true)}
          disabled={execute.isPending}
          className="px-4 py-2 border border-stone-300 text-sm text-stone-700 hover:border-stone-500 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // idle
  return (
    <div className="border-t border-stone-200 pt-5">
      <button
        type="button"
        onClick={() => handleTryOn(false)}
        disabled={execute.isPending}
        className="px-5 py-3 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 disabled:opacity-50 transition-colors"
      >
        Try it on
      </button>
      <p className="mt-2 text-xs text-stone-400">
        Generates a virtual try-on with our default model. Takes ~30 seconds for a
        dress, ~60 seconds for top + bottom.
      </p>
    </div>
  );
}

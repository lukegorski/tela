'use client';

/**
 * Temporary landing/login UI for Phase C. Single "Continue with Google"
 * button using the new Supabase-native useAuthContext hook. Phase D
 * replaces this with the legacy carousel landing (5 hero images, white
 * logo overlay, mobile + desktop split layout, Google / WhatsApp / Email
 * buttons with WhatsApp + Email shown as "coming soon").
 *
 * No firebase imports. No /api/* fetches. All auth flows through
 * useAuthContext().signInWithGoogle() which calls supabase.auth.signInWithOAuth
 * and bounces through /auth/callback.
 */
import { useState } from 'react';
import { useAuthContext } from '@/components/AuthProvider';

export function LandingPlaceholder({ lang }: { lang: string }) {
  const { signInWithGoogle } = useAuthContext();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  void lang;

  async function handleGoogle() {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
          tela
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Personal stylist that learns from your closet.
        </p>
        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="w-full px-4 py-3 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900 text-xs uppercase tracking-widest font-semibold hover:bg-stone-600 dark:hover:bg-stone-400 disabled:opacity-50 transition-colors"
        >
          {submitting ? '…' : 'Continue with Google'}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p className="text-xs text-stone-400 dark:text-stone-500">
          By continuing, you agree to our terms.
        </p>
      </div>
    </div>
  );
}

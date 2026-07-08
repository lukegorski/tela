'use client';

import { useAuthContext } from '@/components/AuthProvider';
import { TelaLogo } from './TelaLogo';

// Sign-in surface shown by AdminGate whenever the visitor isn't authenticated.
// Mirrors the legacy AdminShell:301-321 layout but uses our Supabase OAuth
// (redirect-based, not popup — see useAuth.ts:224-253 for the rationale).
export function AdminLogin() {
  const { signInWithGoogle } = useAuthContext();

  async function handleGoogleSignIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('[admin] sign-in error:', err);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 gap-6 bg-white dark:bg-neutral-900">
      <TelaLogo className="h-8 w-auto text-black dark:text-white" />
      <button
        onClick={handleGoogleSignIn}
        className="px-6 py-2.5 bg-stone-700 dark:bg-stone-300 text-stone-50 dark:text-stone-900 text-sm font-medium rounded-none active:scale-[0.98] transition-transform"
      >
        Sign in with Google
      </button>
    </div>
  );
}

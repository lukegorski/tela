'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { GoogleIcon } from '@/components/icons/GoogleIcon';

type View = 'main' | 'email';
type EmailMode = 'sign-in' | 'sign-up';

export default function SignInPage() {
  const router = useRouter();

  const [view, setView] = useState<View>('main');
  const [emailMode, setEmailMode] = useState<EmailMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    try {
      // Construct client lazily inside the handler so prerender doesn't need
      // NEXT_PUBLIC_* env vars at build time.
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (emailMode === 'sign-up') {
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpErr) throw signUpErr;
        setError('Check your email to confirm your account.');
        setSubmitting(false);
        return;
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
      setSubmitting(false);
    }
  };

  if (view === 'email') {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={() => {
              setView('main');
              setError('');
            }}
            className="p-2 -ml-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            aria-label="Back"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex flex-col items-start space-y-3">
              <h1 className="text-2xl font-medium tracking-tight">tela</h1>
              <p className="text-sm text-stone-500">
                {emailMode === 'sign-up' ? 'Create your account.' : 'Welcome back.'}
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-3 bg-stone-700 text-stone-50 text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-stone-600 disabled:opacity-50"
              >
                {submitting ? '…' : emailMode === 'sign-up' ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setEmailMode(emailMode === 'sign-up' ? 'sign-in' : 'sign-up');
                setError('');
              }}
              className="w-full text-xs uppercase tracking-widest font-semibold text-stone-700 hover:text-stone-900"
            >
              {emailMode === 'sign-up' ? 'I already have an account' : 'I need an account'}
            </button>

            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Main view
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-3">
            <h1 className="text-2xl font-medium tracking-tight">tela</h1>
            <p className="text-sm text-stone-500">
              Personal stylist that learns from your closet.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={submitting}
              className="w-full px-4 py-3 border border-stone-300 hover:border-stone-400 text-stone-900 text-sm flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
            >
              <GoogleIcon className="w-5 h-5" />
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              onClick={() => setView('email')}
              className="w-full px-4 py-3 border border-stone-300 hover:border-stone-400 text-stone-900 text-sm transition-colors"
            >
              Continue with email
            </button>

            {/* Coming-soon options — visible but non-functional, matches current app pattern */}
            <button
              type="button"
              disabled
              className="w-full px-4 py-3 border border-stone-200 text-stone-400 text-sm flex items-center justify-center gap-3 cursor-not-allowed line-through"
              title="Coming soon"
            >
              Continue with Apple
            </button>
            <button
              type="button"
              disabled
              className="w-full px-4 py-3 border border-stone-200 text-stone-400 text-sm flex items-center justify-center gap-3 cursor-not-allowed line-through"
              title="Coming soon"
            >
              Continue with WhatsApp / Phone
            </button>
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <p className="text-xs text-stone-400 text-center">
            By continuing, you agree to our terms.
          </p>
        </div>
      </div>
    </div>
  );
}

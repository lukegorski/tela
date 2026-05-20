'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/AuthProvider';

/**
 * Root page (`/`). Serves three roles:
 *
 *   1. Landing target for unauth users — AdminGate's AdminLogin renders
 *      above this, so the user sees the sign-in screen.
 *   2. Post-OAuth landing — Supabase callback redirects here with cookies
 *      set; once useAuth resolves the profile, this redirects to the real
 *      admin home at /admin/users.
 *   3. requireAdmin() fallback — when /admin/layout.tsx redirects an
 *      unauthenticated visitor here, this page handles them gracefully
 *      without server-side redirect ping-pong (a server redirect to
 *      /admin/users would just bounce back).
 *
 * Renders nothing visible — AdminGate wraps this and decides what to show.
 */
export default function AdminHomePage() {
  const router = useRouter();
  const { user, profile, loading } = useAuthContext();

  useEffect(() => {
    if (!loading && user && profile?.isAdmin) {
      router.replace('/admin/users');
    }
  }, [loading, user, profile, router]);

  return null;
}

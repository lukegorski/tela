'use client';

import type { ReactNode } from 'react';
import { useAuthContext } from '@/components/AuthProvider';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AdminLogin } from './AdminLogin';
import { AdminNav } from './AdminNav';

// CSR auth + admin gate. Layered on top of the server-side requireAdmin()
// check in apps/admin/src/app/admin/layout.tsx (defense in depth). The
// server gate keeps unauth/non-admin users from ever seeing RSC output;
// this client gate handles the cases the server gate can't reach — the
// root "/" page, post-login hydration, and the brief window where
// auth.whoami is still resolving the profile.
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuthContext();

  // Initial auth check OR signed in but profile still being fetched.
  if (loading || (user && !profile)) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-white dark:bg-neutral-900">
        <LoadingSpinner variant="auto" />
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  if (!profile?.isAdmin) {
    return <NoAccessScreen />;
  }

  return (
    <>
      <AdminNav />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </>
  );
}

function NoAccessScreen() {
  const { signOut } = useAuthContext();
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 gap-4 bg-white dark:bg-neutral-900">
      <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed text-center">
        This account does not have admin access.
      </p>
      <button
        onClick={() => {
          void signOut();
        }}
        className="px-4 py-3 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 rounded-none text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-stone-50 dark:hover:bg-neutral-800"
      >
        Sign out
      </button>
    </div>
  );
}

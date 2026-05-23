'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuthContext } from '@/components/AuthProvider';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AdminLogin } from './AdminLogin';
import { AdminNav } from './AdminNav';
import { AdminAiPanel } from './AdminAiPanel';

const AI_PANEL_KEY = 'adminAiPanelOpen';

// CSR auth + admin gate. Layered on top of the server-side requireAdmin()
// check in apps/admin/src/app/admin/layout.tsx (defense in depth). The
// server gate keeps unauth/non-admin users from ever seeing RSC output;
// this client gate handles the cases the server gate can't reach — the
// root "/" page, post-login hydration, and the brief window where
// auth.whoami is still resolving the profile.
//
// 14c additions: hosts the AdminAiPanel slide-out's open/closed state
// (synced to localStorage so the choice survives nav + reload) and
// hands the toggle handler to AdminNav's Claude button.
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuthContext();

  // Default to open on first visit so the AI assistant is the first
  // thing a cofounder sees. Mirrors legacy admin shell behavior.
  const [aiPanelOpen, setAiPanelOpen] = useState(true);

  useEffect(() => {
    // SSR-safe localStorage read; sync the persisted value once on mount
    // so the initial render doesn't flash the wrong state.
    const stored = window.localStorage.getItem(AI_PANEL_KEY);
    if (stored !== null) setAiPanelOpen(stored === 'true');
  }, []);

  const toggleAiPanel = useCallback(() => {
    setAiPanelOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(AI_PANEL_KEY, String(next));
      return next;
    });
  }, []);

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
      <AdminNav aiPanelOpen={aiPanelOpen} onToggleAiPanel={toggleAiPanel} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
      <AdminAiPanel open={aiPanelOpen} />
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

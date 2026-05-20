'use client';

/**
 * AuthProvider — same shape and external API as the legacy
 * src/components/AuthProvider.tsx, but powered by Supabase via our
 * useAuth() hook. Components import { useAuthContext } and consume
 * `{ user, profile, loading, signInWith*, signOut, refreshProfile }`
 * exactly as they did against Firebase.
 *
 * No firebase imports anywhere in this file or its dependency chain.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

type AuthContextType = ReturnType<typeof useAuth>;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

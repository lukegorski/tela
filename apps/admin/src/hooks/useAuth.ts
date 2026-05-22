'use client';

/**
 * Supabase-native replacement for the legacy Firebase-based useAuth().
 *
 * External shape matches the legacy hook so ported components only need
 * one tiny mechanical edit (`user?.uid` → `user?.id`). Everything else
 * stays the same on the consumer side. No firebase imports, no
 * Firestore-shaped data — this is the new architecture's auth surface,
 * just shaped to look familiar to ported components.
 *
 * Implementation:
 *   - Subscribes to supabase.auth.onAuthStateChange — that subscription
 *     fires an INITIAL_SESSION event immediately, then SIGNED_IN /
 *     SIGNED_OUT / TOKEN_REFRESHED / USER_UPDATED as auth state changes.
 *   - On every event: writes the current access token into the module-
 *     level auth-token-store (so tRPC + the chat-stream POST can read
 *     it synchronously without calling getSession themselves), then
 *     refreshes the canonical app-side profile via auth.whoami.
 *   - Sign-in methods call Supabase auth APIs directly. OAuth uses the
 *     `/auth/callback` route we already set up; email/password is direct.
 *   - signOut clears the token store SYNCHRONOUSLY (before awaiting
 *     supabase.auth.signOut) and cancels in-flight React Query work so
 *     no authenticated effect lingers post-sign-out.
 *
 * Phase B (Phase 11 cutover-prep) refactor: removed the explicit
 * getSession() call on mount + per-tRPC-request getSession() reads. See
 * apps/web/src/lib/auth-token-store.ts for the cache + waitForToken
 * pattern that replaces them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { setCurrentToken } from '@/lib/auth-token-store';
import { trpc } from '@/trpc/client';

/**
 * The shape every component reads as `user`. Mirrors the legacy Firebase
 * `User` shape that components are familiar with. `id` is the Supabase
 * auth.users.id (the Firebase equivalent was `uid`).
 */
export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Try-on rendering preferences. Mirrors the legacy `TryOnSettings`
 * interface so the ported settings UI maps 1:1 onto our backend.
 */
export interface AuthTryOnSettings {
  background: 'neutral' | 'chic-interior' | 'nighttime';
  model: 'self' | 'model-woman' | 'model-man';
  selfPhotoURL: string | null;
}

/**
 * User's saved location. Mirrors legacy `UserProfile.location`.
 */
export interface AuthLocation {
  city: string;
  country?: string;
  lat: number;
  lon: number;
  timezone: string;
  tempUnit: 'C' | 'F';
}

/**
 * Canonical app-side profile, matching the structure the legacy
 * components expect on the `profile` field — but sourced from our
 * Postgres `users` row plus related tables (style_profiles for styleDna,
 * wardrobe_gaps for the gaps list).
 *
 * `wardrobeGaps` and `styleDna` aren't included here because they're
 * larger and not needed on every page — components fetch them via
 * dedicated capabilities (user.getWardrobeGaps, profile.get) when they
 * actually render those concepts. `tryOnSettings` IS included because
 * it's small, the settings + try-on UIs read it directly, and the server
 * supplies safe defaults so the field is always populated.
 */
export interface AuthProfile {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string;
  isAdmin: boolean;
  onboardingComplete: boolean;
  hasLocation: boolean;
  /**
   * Full location object when set; null otherwise. Components access
   * `profile.location` directly (matches legacy).
   */
  location: AuthLocation | null;
  /**
   * True when the user has a style_profiles row (closet read has run).
   * The legacy app's landing page used `profile.styleDna` truthy-check;
   * we map that concept to the new architecture's prose-based style
   * profile (created by profile.closetRead).
   */
  hasStyleProfile: boolean;
  tryOnSettings: AuthTryOnSettings;
}

interface UseAuthReturn {
  user: AuthUser | null;
  profile: AuthProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const supabase = useRef(getSupabaseBrowserClient()).current;
  const queryClient = useQueryClient();
  const execute = trpc.capability.execute.useMutation();
  // useMutation returns a fresh wrapper object every render even though
  // mutateAsync itself is a stable ref. Keep a ref to the latest wrapper
  // so the callbacks below can read it without including `execute` in
  // their useCallback deps — otherwise they'd recompute every render and
  // the auth effect below would re-run on every render, infinite-looping
  // (one auth.whoami POST per render → browser hits ERR_INSUFFICIENT_RESOURCES).
  const executeRef = useRef(execute);
  executeRef.current = execute;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Pull the canonical profile via auth.whoami. The server-side capability
   * auto-creates the users row on first sign-in, so this is also the
   * "create user doc" path the legacy hook had.
   */
  const fetchProfile = useCallback(async (): Promise<AuthProfile | null> => {
    try {
      const result = (await executeRef.current.mutateAsync({
        name: 'auth.whoami',
        input: {},
      })) as {
        userId: string;
        email: string | null;
        phone: string | null;
        displayName: string | null;
        avatarUrl: string | null;
        locale: string;
        isAdmin: boolean;
        onboardingComplete: boolean;
        hasLocation: boolean;
        location: AuthLocation | null;
        hasStyleProfile: boolean;
        tryOnSettings: AuthTryOnSettings;
      };
      const p: AuthProfile = {
        id: result.userId,
        email: result.email,
        phone: result.phone,
        displayName: result.displayName,
        avatarUrl: result.avatarUrl,
        locale: result.locale,
        isAdmin: result.isAdmin,
        onboardingComplete: result.onboardingComplete,
        hasLocation: result.hasLocation,
        location: result.location,
        hasStyleProfile: result.hasStyleProfile,
        tryOnSettings: result.tryOnSettings,
      };
      // Sync locale cookie so server components (RSC layouts, dictionary
      // loader) see it on the next navigation. Matches legacy behavior.
      if (typeof document !== 'undefined') {
        document.cookie = `NEXT_LOCALE=${p.locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
      }
      return p;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let initialEventReceived = false;

    // Defensive timeout: if onAuthStateChange never fires its INITIAL_SESSION
    // event (shouldn't happen — supabase-js emits it synchronously on
    // subscription — but defense in depth), flip loading=false within a
    // bounded window so ProtectedRoute can route the user to the landing
    // page rather than sit on a loading spinner forever. 2s is plenty —
    // the event normally fires within 50-200ms.
    const fallbackTimer = setTimeout(() => {
      if (mounted && !initialEventReceived) {
        // eslint-disable-next-line no-console
        console.warn(
          '[useAuth] onAuthStateChange INITIAL_SESSION did not fire within 2s — proceeding as anonymous',
        );
        setCurrentToken(null);
        setLoading(false);
      }
    }, 2000);

    // Single source of truth: the listener handles INITIAL_SESSION (which
    // replaces the explicit getSession() call we used to have) plus all
    // subsequent events. Each event: write token to store FIRST, then
    // update React state.
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (!initialEventReceived) {
        initialEventReceived = true;
        clearTimeout(fallbackTimer);
      }
      // Token store goes FIRST — any tRPC request already mid-flight that
      // hasn't yet read the token will see the new value immediately.
      setCurrentToken(session?.access_token ?? null);

      const sessionUser = session?.user ?? null;
      // Attach Sentry user context alongside the token write. We
      // INTENTIONALLY pass only `id` — never email/phone/etc. The
      // privacy policy (`/privacy` lines 161-170) commits to user_id
      // being the only identifier retained in Sentry. To triage a bug
      // by user, Luke joins this id to the users table in app DB.
      if (sessionUser) {
        Sentry.setUser({ id: sessionUser.id });
      } else {
        Sentry.setUser(null);
      }

      if (sessionUser) {
        setUser(toAuthUser(sessionUser));
        const p = await fetchProfile();
        if (mounted) setProfile(p);
      } else {
        setUser(null);
        setProfile(null);
      }
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      sub.subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    // Redirect-based OAuth (Supabase's native, robust path). We tried a
    // popup-based flow to mirror legacy Firebase signInWithPopup UX, but
    // Chrome's COOP rules consistently broke the parent's ability to
    // observe popup.closed once the popup was on accounts.google.com,
    // and the resulting Web-Locks contention cascaded into
    // supabase.auth.getSession() hangs that broke every tRPC call. The
    // redirect flow doesn't fight any of that — Google → Supabase
    // callback → cookie set → page reloads → onAuthStateChange fires
    // normally → tRPC sees the access token.
    //
    // `prompt=select_account` is preserved from the popup attempt: it
    // forces Google to show the account picker instead of silently
    // auto-selecting the most-recently-used session.
    // Bare redirectTo (no query string) so it exact-matches the Supabase
    // Redirect URLs allowlist. With ?next=… appended, Supabase couldn't
    // find a match and silently fell back to Site URL (localhost:3000),
    // dropping users onto a dead page post-OAuth. Preserving "return to
    // where I was after sign-in" is deferred — track as a polish ticket
    // (state param or sessionStorage hand-off across the redirect hop).
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
  }, [supabase]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [supabase],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    // Sign-out race mitigation: clear the token store BEFORE awaiting
    // supabase.auth.signOut(), so any in-flight tRPC/chat-stream request
    // that hasn't yet read the token sees null instead of the old (still
    // technically valid until expiry) token. Then cancel React Query
    // in-flight work so no authenticated effect lingers post-sign-out.
    setCurrentToken(null);
    Sentry.setUser(null);
    void queryClient.cancelQueries();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [supabase, queryClient]);

  const refreshProfile = useCallback(async () => {
    const p = await fetchProfile();
    setProfile(p);
  }, [fetchProfile]);

  return {
    user,
    profile,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    refreshProfile,
  };
}

interface SupabaseUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/** Map a Supabase auth user → our AuthUser shape. */
function toAuthUser(u: SupabaseUserLike): AuthUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    (typeof u.email === 'string' ? u.email.split('@')[0] : null);
  const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
  return {
    id: u.id,
    email: u.email ?? null,
    displayName,
    avatarUrl,
  };
}

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
 *   - Subscribes to supabase.auth.onAuthStateChange for the auth user.
 *   - On every auth state change, calls auth.whoami via tRPC to refresh
 *     the canonical app-side profile (server-side capability handles
 *     first-sign-in user record creation).
 *   - Sign-in methods call Supabase auth APIs directly. OAuth uses the
 *     `/auth/callback` route we already set up; email/password is direct.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
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

    // Defensive timeout: if getSession() never resolves (e.g., a hung
    // Supabase initialisation, a network stall on the storage layer),
    // we still want loading to flip false within a bounded window so
    // ProtectedRoute can route the user to the landing page rather than
    // sit on a loading spinner forever. Cleared on the happy path.
    const fallbackTimer = setTimeout(() => {
      if (mounted) {
        // eslint-disable-next-line no-console
        console.warn(
          '[useAuth] supabase.auth.getSession() did not resolve within 5s — proceeding as anonymous',
        );
        setLoading(false);
      }
    }, 5000);

    // Initial state
    void supabase.auth.getSession().then(async ({ data }) => {
      clearTimeout(fallbackTimer);
      if (!mounted) return;
      const sessionUser = data.session?.user;
      if (sessionUser) {
        setUser(toAuthUser(sessionUser));
        const p = await fetchProfile();
        if (mounted) setProfile(p);
      }
      if (mounted) setLoading(false);
    });

    // React to subsequent auth changes (sign-in, sign-out, token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const sessionUser = session?.user ?? null;
      if (sessionUser) {
        setUser(toAuthUser(sessionUser));
        const p = await fetchProfile();
        if (mounted) setProfile(p);
      } else {
        setUser(null);
        setProfile(null);
      }
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
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`;
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
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [supabase]);

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

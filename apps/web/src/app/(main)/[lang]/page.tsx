"use client";

/**
 * Landing / login page. Pixel-perfect port of legacy
 * src/app/(main)/[lang]/page.tsx.
 *
 * Visual + behavior parity:
 *   - 5-image hero carousel with crossfade + Ken Burns zoom
 *   - White Tela logo overlay (mobile: centered with offset; desktop: split
 *     pane with image left, sign-in right)
 *   - Tagline + 3 buttons: Continue with Google (active), WhatsApp (coming
 *     soon, struck through), Email (active — opens email sub-view)
 *   - Email view (separate sub-state) for password sign-in / sign-up
 *   - Signed-in users get auto-redirected: no style profile → /chat,
 *     else → /outfits
 *
 * Data-layer changes vs legacy (no firebase imports anywhere):
 *   - useAuthContext is now Supabase-backed (same external shape)
 *   - profile.styleDna check → profile.hasStyleProfile (closet read
 *     existence, the new architecture's equivalent for "has the AI seen
 *     this person's style yet")
 *
 * No /api/* fetches, no firebase package — clean target end state.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import { localePath } from "@/lib/i18n";
import LoadingSpinner from "@/components/LoadingSpinner";

const heroImages = [
  "/login/hero-1.jpg",
  "/login/hero-2.jpg",
  "/login/hero-3.jpg",
  "/login/hero-4.jpg",
  "/login/hero-5.jpg",
];

function ImageCarousel({ className, onReady }: { className?: string; onReady?: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [enableTransition, setEnableTransition] = useState(false);

  // Randomize starting image on mount (avoids SSR/client hydration mismatch)
  // then enable transitions and cycle every 5s
  useEffect(() => {
    setActiveIndex(Math.floor(Math.random() * heroImages.length));
    // Enable transitions after initial swap so the randomization is instant
    requestAnimationFrame(() => setEnableTransition(true));
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        setPrevIndex(prev);
        return (prev + 1) % heroImages.length;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Clear prevIndex after crossfade completes so animation resets invisibly
  useEffect(() => {
    if (prevIndex !== null) {
      const timeout = setTimeout(() => setPrevIndex(null), 1800);
      return () => clearTimeout(timeout);
    }
  }, [prevIndex]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className ?? ""}`}>
      {heroImages.map((src, i) => {
        const isActive = i === activeIndex;
        const isFadingOut = i === prevIndex;
        return (
          <div
            key={src}
            className={`absolute inset-0 ${enableTransition ? "transition-opacity duration-[1500ms] ease-in-out" : ""}`}
            style={{
              opacity: isActive ? 1 : 0,
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                animation:
                  isActive || isFadingOut
                    ? "ken-burns 14s ease-out forwards"
                    : "none",
              }}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="(min-width: 768px) 60vw, 100vw"
                className="object-cover"
                priority={i === activeIndex}
                loading="eager"
                onLoad={() => { if (i === activeIndex) onReady?.(); }}
              />
            </div>
          </div>
        );
      })}
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}

export default function LandingPage() {
  const { user, profile, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } =
    useAuthContext();
  const { dict, lang } = useDictionary();
  const router = useRouter();
  const [view, setView] = useState<"main" | "email">("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const ready = !loading && imageReady;

  // Timeout fallback: show after 3s even if image hasn't loaded
  useEffect(() => {
    const timer = setTimeout(() => setImageReady(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && user && profile) {
      // Send users without a style profile (closet read hasn't run) to
      // /chat so Tela can guide them. Maps to legacy `!profile.styleDna`.
      if (!profile.hasStyleProfile) {
        router.push(localePath(lang, "/chat"));
      } else {
        router.push(localePath(lang, "/outfits"));
      }
    }
  }, [user, loading, profile, router, lang]);

  if (user) return null;

  async function handleGoogle() {
    setError("");
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : dict.login?.googleSignInFailed ?? "Sign-in failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : dict.login?.authFailed ?? "Sign-in failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Email sign-in/sign-up view ----------
  if (view === "email") {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-neutral-900 flex flex-col">
        {/* Back button */}
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={() => {
              setView("main");
              setError("");
            }}
            className="p-2 -ml-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
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

        {/* Centered form */}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-6">
            <div className="flex flex-col items-start space-y-3">
              <div
                role="img"
                aria-label="Tela"
                className="h-8 w-8 bg-[#47423D] dark:bg-stone-300"
                style={{
                  WebkitMaskImage: "url(/tela-logo-icon.svg)",
                  WebkitMaskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskImage: "url(/tela-logo-icon.svg)",
                  maskSize: "contain",
                  maskRepeat: "no-repeat",
                  maskPosition: "center",
                  maskMode: "alpha",
                }}
              />
              <p className="text-sm text-stone-400 dark:text-stone-500">
                {isSignUp
                  ? dict.login?.createPrompt ?? "Create an account"
                  : dict.login?.welcomeBack ?? "Welcome back"}
              </p>
            </div>

            <form onSubmit={handleEmail} className="space-y-3">
              <input
                type="email"
                placeholder={dict.login?.emailPlaceholder ?? "Email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-stone-300 dark:border-neutral-600 dark:bg-neutral-800 rounded-none text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-500 focus:border-stone-400 dark:focus:border-stone-500"
              />
              <input
                type="password"
                placeholder={dict.login?.passwordPlaceholder ?? "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 border border-stone-300 dark:border-neutral-600 dark:bg-neutral-800 rounded-none text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-500 focus:border-stone-400 dark:focus:border-stone-500"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-3 bg-stone-700 dark:bg-stone-300 text-stone-50 dark:text-stone-900 rounded-none text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-stone-600 dark:hover:bg-stone-400 disabled:opacity-50"
              >
                {submitting ? (
                  <span className="flex justify-center">
                    <LoadingSpinner />
                  </span>
                ) : isSignUp ? (
                  dict.login?.createAccount ?? "Create account"
                ) : (
                  dict.login?.signIn ?? "Sign in"
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="w-full text-xs uppercase tracking-widest font-semibold transition-colors text-[#47423D] dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
            >
              {isSignUp
                ? dict.login?.alreadyHaveAccount ?? "Already have an account?"
                : dict.login?.needAccount ?? "Need an account?"}
            </button>

            <LegalConsent
              className="text-center text-[10px] tracking-wider text-stone-500 dark:text-stone-400"
              linkClassName="underline hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            />

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Google auth in progress — hide hero so it doesn't flash back when popup closes
  if (submitting) return null;

  // ---------- Main login view ----------
  return (
    <div className="fixed inset-0 z-40 bg-neutral-900">
      {/* Content fades in over dark background — eliminates white flash */}
      <div
        className="absolute inset-0 transition-opacity duration-[1200ms] ease-out"
        style={{ opacity: ready ? 1 : 0 }}
      >
      {/* ===== MOBILE (< md) ===== */}
      <div className="md:hidden relative h-full flex flex-col">
        <ImageCarousel onReady={() => setImageReady(true)} />

        {/* Content overlay */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Logo — absolutely centered on viewport */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginTop: '-10vh' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/tela-logo.svg"
              alt="Tela"
              className="h-10 w-auto"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>

          {/* Spacer pushes buttons to bottom */}
          <div className="flex-1" />

          {/* Tagline + buttons */}
          <div className="px-6 space-y-3" style={{ paddingBottom: 'max(4rem, env(safe-area-inset-bottom, 0px))' }}>
            <p className="text-white/90 text-sm font-semibold tracking-widest uppercase text-center mb-4">
              {dict.login?.tagline ?? "Personal stylist that learns from your closet"}
            </p>
            <button
              onClick={handleGoogle}
              disabled={submitting}
              className="w-full px-4 py-3 bg-stone-700 text-stone-50 rounded-none text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-stone-600 disabled:opacity-50"
            >
              {dict.login?.continueWithGoogle ?? "Continue with Google"}
            </button>
            <button
              disabled
              className="w-full px-4 py-3 bg-transparent border border-white/50 text-white rounded-none text-xs uppercase tracking-widest font-semibold cursor-not-allowed line-through decoration-white/80"
              style={{ textDecorationThickness: "1px" }}
            >
              {dict.login?.continueWithWhatsApp ?? "Continue with WhatsApp / Phone"}
            </button>
            <button
              onClick={() => setView("email")}
              className="w-full px-4 py-3 bg-transparent border border-white/50 text-white rounded-none text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-white/10"
            >
              {dict.login?.continueWithEmail ?? "Continue with email"}
            </button>
            <LegalConsent
              className="text-center text-[10px] tracking-wider text-white/60 pt-1"
              linkClassName="underline hover:text-white transition-colors"
            />
          </div>
        </div>
      </div>

      {/* ===== DESKTOP (>= md) — split layout ===== */}
      <div className="hidden md:flex h-full">
        {/* Left panel — image carousel */}
        <div className="relative w-[65%] lg:w-[72%]">
          <ImageCarousel onReady={() => setImageReady(true)} />

          {/* White logo overlay — centered */}
          <div className="relative z-10 h-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/tela-logo.svg"
              alt="Tela"
              className="h-10 w-auto"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>
        </div>

        {/* Right panel — sign-in */}
        <div className="w-[35%] lg:w-[28%] flex items-center justify-center bg-white dark:bg-neutral-900 px-8">
          <div className="w-full max-w-sm space-y-4">
            <p
              className="text-center text-sm font-semibold tracking-widest uppercase text-[#47423D] dark:text-stone-300"
            >
              {dict.login?.tagline ?? "Personal stylist that learns from your closet"}
            </p>

            <div className="space-y-3">
              <button
                onClick={handleGoogle}
                disabled={submitting}
                className="w-full px-4 py-3 bg-stone-700 dark:bg-stone-300 text-stone-50 dark:text-stone-900 rounded-none text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-stone-600 dark:hover:bg-stone-400 disabled:opacity-50"
              >
                {dict.login?.continueWithGoogle ?? "Continue with Google"}
              </button>
              <button
                disabled
                className="w-full px-4 py-3 bg-transparent border border-stone-300/50 dark:border-neutral-600/50 text-stone-500 dark:text-stone-400 rounded-none text-xs uppercase tracking-widest font-semibold cursor-not-allowed line-through decoration-stone-500/80 dark:decoration-stone-400/80"
                style={{ textDecorationThickness: "1px" }}
              >
                {dict.login?.continueWithWhatsApp ?? "Continue with WhatsApp / Phone"}
              </button>
              <button
                onClick={() => setView("email")}
                className="w-full px-4 py-3 bg-transparent border border-stone-300/50 dark:border-neutral-600/50 text-stone-700 dark:text-stone-300 rounded-none text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-stone-50 dark:hover:bg-neutral-800"
              >
                {dict.login?.continueWithEmail ?? "Continue with email"}
              </button>
            </div>

            <LegalConsent
              className="text-center text-[10px] tracking-wider text-stone-500 dark:text-stone-400 pt-1"
              linkClassName="underline hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            />

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/**
 * Tiny legal-consent line shown below the sign-in buttons in all three
 * sign-in views (email form, mobile main, desktop main). Required so
 * Google's OAuth consent screen verification can find a privacy-policy
 * link from the home page; doubles as affirmative ToS acceptance on
 * sign-in. Both /terms and /privacy live in the (legal) route group at
 * the URL root (no locale prefix).
 */
function LegalConsent({
  className,
  linkClassName,
}: {
  className: string;
  linkClassName: string;
}) {
  return (
    <p className={className}>
      By continuing, you agree to Tela&rsquo;s{' '}
      <Link href="/terms" className={linkClassName}>Terms</Link>
      {' '}and acknowledge our{' '}
      <Link href="/privacy" className={linkClassName}>Privacy Policy</Link>.
    </p>
  );
}

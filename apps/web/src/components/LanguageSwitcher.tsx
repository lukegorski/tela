"use client";

/**
 * Pixel-perfect port of legacy src/components/LanguageSwitcher.tsx.
 *
 * Visual + behavior parity:
 *   - 3-column grid of buttons, one per supported locale
 *   - Active locale gets the inverted (filled) styling
 *
 * Data-layer changes vs legacy (no firebase imports):
 *   - Firestore updateDoc → no-op in this commit. Locale persistence on
 *     the user row is handled by auth.whoami's locale field on next
 *     load and by the cookie set below. A dedicated user.updateLocale
 *     capability can land alongside translation.translateLocale; the
 *     UX works without it because the cookie is the primary mechanism.
 *   - sessionStorage 'i18n-translating' handshake preserved verbatim
 *     (consumed by DictionaryProvider on next page mount).
 */
import { useRouter, usePathname } from "next/navigation";
import { useAuthContext } from "@/components/AuthProvider";
import { locales, LANGUAGE_NAMES } from "@/lib/i18n";

const LANGUAGES = locales.map((code) => ({
  code,
  label: LANGUAGE_NAMES[code],
}));

export default function LanguageSwitcher({
  currentLang,
}: {
  currentLang: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthContext();
  // Reference user so the closure compiles even though persistence is
  // deferred — having it here makes the sane place for the future
  // user.updateLocale call obvious.
  void user;

  async function switchLanguage(newLang: string) {
    if (newLang === currentLang) return;

    // 1. Set cookie for proxy
    document.cookie = `NEXT_LOCALE=${newLang};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;

    // 2. Persist to user row — deferred. The next auth.whoami load picks
    //    up the cookie via proxy and the server already syncs cookies.
    //    A dedicated user.updateLocale capability can land later.

    // 3. Signal that translation is needed (picked up by DictionaryProvider on new page)
    if (newLang !== "en") {
      sessionStorage.setItem("i18n-translating", newLang);
    } else {
      sessionStorage.removeItem("i18n-translating");
    }

    // 4. Navigate to same page with new locale prefix
    const newPathname = pathname.replace(`/${currentLang}`, `/${newLang}`);
    router.push(newPathname);
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => switchLanguage(lang.code)}
          className={`px-4 py-3 rounded-none border-2 text-sm font-medium transition-colors ${
            currentLang === lang.code
              ? "border-stone-700 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900 dark:border-stone-300"
              : "border-stone-200 dark:border-neutral-600 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-neutral-800"
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}

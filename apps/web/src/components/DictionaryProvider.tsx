'use client';

/**
 * DictionaryProvider — same external shape as legacy
 * src/components/DictionaryProvider.tsx so ported components consume it
 * unchanged. Wraps the active locale's dictionary + a `translating` flag
 * the legacy app uses for skeleton states during locale switches.
 *
 * Translation pipeline (when language is switched in the settings panel):
 *   1. The setter writes `i18n-translating` to sessionStorage with the
 *      target locale.
 *   2. On the next page mount under the new locale, this provider reads
 *      that flag and pulls the user's wardrobe items + outfits through
 *      the new translation capability.
 *   3. While translation is in flight, `translating` is true so consuming
 *      components can show skeleton placeholders.
 *
 * Phase C/D status: translation capability isn't wired yet (deferred Phase
 * B item). The provider still surfaces the flag so ported components
 * compile + render correctly; it just stays at false until the capability
 * lands.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Dictionary } from '@/dictionaries';
import type { Locale } from '@/lib/i18n';

interface DictionaryContextValue {
  dict: Dictionary;
  lang: Locale;
  translating: boolean;
}

const DictionaryContext = createContext<DictionaryContextValue | null>(null);

export function DictionaryProvider({
  dictionary,
  lang,
  children,
}: {
  dictionary: Dictionary;
  lang: Locale;
  children: ReactNode;
}) {
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    const pending =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('i18n-translating')
        : null;
    if (!pending || pending !== lang) return;

    // TODO Phase B (deferred): kick off translation.translateLocale here.
    // For now we acknowledge the pending flag and clear it without doing
    // any actual translation work — items will display in their original
    // locale until the capability lands.
    setTranslating(true);
    const timeout = setTimeout(() => {
      sessionStorage.removeItem('i18n-translating');
      setTranslating(false);
    }, 200);

    return () => clearTimeout(timeout);
  }, [lang]);

  return (
    <DictionaryContext.Provider value={{ dict: dictionary, lang, translating }}>
      {children}
    </DictionaryContext.Provider>
  );
}

export function useDictionary(): DictionaryContextValue {
  const ctx = useContext(DictionaryContext);
  if (!ctx) {
    throw new Error('useDictionary must be used within a DictionaryProvider');
  }
  return ctx;
}

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Dictionary } from '@/dictionaries';
import type { Locale } from '@/lib/i18n';

interface DictionaryContextValue {
  dict: Dictionary;
  lang: Locale;
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
  return (
    <DictionaryContext.Provider value={{ dict: dictionary, lang }}>
      {children}
    </DictionaryContext.Provider>
  );
}

export function useDictionary(): DictionaryContextValue {
  const ctx = useContext(DictionaryContext);
  if (!ctx) {
    throw new Error('useDictionary must be used inside <DictionaryProvider>');
  }
  return ctx;
}

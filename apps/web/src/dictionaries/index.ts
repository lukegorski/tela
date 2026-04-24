/**
 * Dictionary loader. Server-only (avoids shipping all 14 locales to the
 * client). Each locale is a dynamic import so Next bundles them on demand.
 */
import 'server-only';
import type { Locale } from '@/lib/i18n';

const dictionaries = {
  en: () => import('./en.json').then((m) => m.default),
  es: () => import('./es.json').then((m) => m.default),
  pt: () => import('./pt.json').then((m) => m.default),
  fr: () => import('./fr.json').then((m) => m.default),
  de: () => import('./de.json').then((m) => m.default),
  ru: () => import('./ru.json').then((m) => m.default),
  pl: () => import('./pl.json').then((m) => m.default),
  zh: () => import('./zh.json').then((m) => m.default),
  ja: () => import('./ja.json').then((m) => m.default),
  ms: () => import('./ms.json').then((m) => m.default),
  ta: () => import('./ta.json').then((m) => m.default),
  sv: () => import('./sv.json').then((m) => m.default),
  nb: () => import('./nb.json').then((m) => m.default),
  fi: () => import('./fi.json').then((m) => m.default),
} as const;

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)['en']>>;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}

/**
 * Locale catalog + URL helpers. Mirrors the production app's i18n.
 * 14 supported locales, default en.
 */
export const locales = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'ru',
  'pl',
  'zh',
  'ja',
  'ms',
  'ta',
  'sv',
  'nb',
  'fi',
] as const;

export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const isLocale = (s: string): s is Locale =>
  (locales as readonly string[]).includes(s);

/** Native-script display name for the language switcher */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  ru: 'Русский',
  pl: 'Polski',
  zh: '中文',
  ja: '日本語',
  ms: 'Bahasa Melayu',
  ta: 'தமிழ்',
  sv: 'Svenska',
  nb: 'Norsk',
  fi: 'Suomi',
};

/** English names for AI prompt locale instructions (matches legacy). */
export const LANGUAGE_ENGLISH_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Brazilian Portuguese',
  fr: 'French',
  de: 'German',
  ru: 'Russian',
  pl: 'Polish',
  zh: 'Simplified Chinese',
  ja: 'Japanese',
  ms: 'Malay',
  ta: 'Tamil',
  sv: 'Swedish',
  nb: 'Norwegian',
  fi: 'Finnish',
};

/**
 * Tiny template helper. Replaces `{name}` placeholders with values from
 * `vars`. Used by ported components to interpolate dictionary strings
 * (e.g. `t(dict.wardrobe.someFilesUnsupported, { count: '3' })`).
 */
export function t(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template,
  );
}

/** Build a locale-prefixed path: localePath('es', '/wardrobe') → '/es/wardrobe' */
export function localePath(lang: string, path: string): string {
  return `/${lang}${path}`;
}

/** Detect the best-matching locale from an Accept-Language header. */
export function detectLocaleFromHeader(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  // Parse "en-US,en;q=0.9,es;q=0.8" → ['en-us', 'en', 'es']
  const requested = acceptLanguage
    .split(',')
    .map((part) => part.trim().split(';')[0].toLowerCase())
    .filter(Boolean);

  for (const tag of requested) {
    if (isLocale(tag)) return tag;
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

/** Strip the locale prefix from a pathname for switcher logic. */
export function stripLocale(pathname: string): { lang: Locale; rest: string } {
  const m = pathname.match(/^\/([a-z]{2})(\/.*)?$/);
  if (m && isLocale(m[1])) {
    return { lang: m[1], rest: m[2] ?? '/' };
  }
  return { lang: defaultLocale, rest: pathname };
}
